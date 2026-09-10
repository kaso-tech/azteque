import { supabase } from "@/integrations/supabase/client";

export type MatchStatus = "waiting" | "playing" | "finished";

export interface MatchRow {
  id: string;
  code: string;
  host_id: string | null;
  guest_id: string | null;
  host_name: string;
  guest_name: string | null;
  status: MatchStatus;
  state: unknown | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /** Cote gagnée ou perdue sur ce champ, renseignée par le règlement. */
  rating_delta_host?: number | null;
  rating_delta_guest?: number | null;
}

/**
 * Exige une session ouverte. Le jeu en ligne repose désormais sur de vrais
 * comptes (connexion Google, voir account.ts) : les jetons, les amis et
 * l'historique des confrontations sont attachés à ce compte, ce qu'une
 * identité anonyme — propre à un navigateur et perdue avec lui — ne
 * permettait pas.
 */
export async function ensureOnlineIdentity() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error("Connectez-vous pour jouer en ligne.");
  return user;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeCode(len = 5) {
  let out = "";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i += 1) out += ALPHABET[buf[i]! % ALPHABET.length];
  return out;
}

export function normalizeCode(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

export async function createMatch(hostName: string, settings: Record<string, unknown> = {}) {
  const user = await ensureOnlineIdentity();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    const { data, error } = await supabase
      .from("matches")
      .insert({
        code,
        host_id: user.id,
        host_name: hostName || "Hôte",
        status: "waiting",
        settings: settings as never,
      })
      .select()
      .single();
    if (!error && data) return data as unknown as MatchRow;
    if (error && !error.message.toLowerCase().includes("duplicate")) throw error;
  }
  throw new Error("Impossible de générer un code de partie");
}

export async function getMatch(id: string) {
  await ensureOnlineIdentity();
  const { data, error } = await supabase.from("matches").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as MatchRow | null) ?? null;
}

export async function joinMatch(code: string, guestName: string) {
  await ensureOnlineIdentity();
  const { data, error } = await supabase.rpc("join_match_by_code", {
    _code: normalizeCode(code),
    _guest_name: guestName || "Invité",
  });
  if (error) throw error;
  const match = data?.[0] as unknown as MatchRow | undefined;
  if (!match) throw new Error("Partie introuvable, complète ou déjà rejointe.");
  return match;
}

/** Négociation de mise avant le début d'un tour. */
/**
 * Mise en jetons du champ. Elle se négocie UNE SEULE FOIS, avant la première
 * donne, et vaut pour tout le champ : les tours s'enchaînent ensuite sans
 * renégociation, et les jetons ne changent de main qu'à la fin du champ
 * (voir useBetNegotiation.ts).
 */
export interface BetNegotiation {
  amount: number;
  /** Siège ayant fait la dernière proposition. */
  by: "host" | "guest";
  status: "pending" | "accepted";
}

/**
 * Accord des deux joueurs pour enchaîner le tour suivant. Remis à zéro à
 * chaque donne : la marque ne vaut que pour le tour qui vient de s'achever.
 */
export interface NextRoundReady {
  host: boolean;
  guest: boolean;
}

// L'état de partie (`state`) et les paramètres (`settings`, dont la mise) ne
// sont plus jamais écrits directement par le client : voir
// src/lib/azteque/match-actions.ts, qui rejoue et valide chaque action côté
// serveur avant d'écrire quoi que ce soit. La colonne est protégée en base
// par un déclencheur (migration protect_match_mutable_columns).

/**
 * Abonnement temps réel aux évolutions d'une partie.
 *
 * `onStatus` signale si le canal est effectivement établi : sur une connexion
 * faible il tombe régulièrement, et l'appelant doit alors se rabattre sur une
 * relecture périodique (voir useMatchSync.ts).
 */
export function subscribeMatch(
  id: string,
  onChange: (row: MatchRow) => void,
  onStatus?: (live: boolean) => void,
) {
  const channel = supabase
    .channel(`match-${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${id}` },
      (payload) => onChange(payload.new as unknown as MatchRow),
    )
    .subscribe((status) => {
      onStatus?.(status === "SUBSCRIBED");
    });
  return () => {
    onStatus?.(false);
    void supabase.removeChannel(channel);
  };
}

export interface ChatMessage {
  id: string;
  seat: "host" | "guest";
  name: string;
  text: string;
  reaction?: "taunt" | "cheer" | null;
  /** Identifiant d'un sticker de la boutique, à la place du texte. */
  sticker?: string | null;
}

/** Salon de discussion temps réel (broadcast, sans stockage). */
export function openChat(matchId: string, onMessage: (msg: ChatMessage) => void) {
  const channel = supabase.channel(`chat-${matchId}`, { config: { broadcast: { self: false } } });
  channel
    .on("broadcast", { event: "msg" }, ({ payload }) => onMessage(payload as ChatMessage))
    .subscribe();
  return {
    send: (msg: ChatMessage) => {
      void channel.send({ type: "broadcast", event: "msg", payload: msg });
    },
    close: () => {
      void supabase.removeChannel(channel);
    },
  };
}

/** Présence temps réel : signale la connexion des deux joueurs. */
export function trackPresence(
  matchId: string,
  seat: "host" | "guest",
  onOpponent: (online: boolean) => void,
) {
  const other = seat === "host" ? "guest" : "host";
  const channel = supabase.channel(`presence-${matchId}`, {
    config: { presence: { key: seat } },
  });
  const sync = () => {
    const st = channel.presenceState() as Record<string, unknown[]>;
    onOpponent(Array.isArray(st[other]) && st[other]!.length > 0);
  };
  channel
    .on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ seat, at: Date.now() });
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}

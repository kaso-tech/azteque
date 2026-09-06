import { supabase } from "@/integrations/supabase/client";

/**
 * Comptes joueurs : connexion Google, pseudo unique, amis, invitations à
 * jouer et solde de jetons.
 *
 * Les tables utilisées ici (`profiles`, `friendships`, `game_invites`) sont
 * créées par la migration 20260906200000_accounts_friends_invites.sql. Le
 * fichier de types `src/integrations/supabase/types.ts` est régénéré par
 * Lovable et ne les connaît pas encore : d'où le passage par `anyTable`, qui
 * concentre la conversion en un seul endroit au lieu de la disséminer. Les
 * formes attendues sont décrites par les interfaces ci-dessous, et chaque
 * lecture les applique explicitement.
 */
const anyTable = (name: string) =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(name);

const rpc = (name: string, args: Record<string, unknown>) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

export interface Profile {
  id: string;
  username: string;
  tokens: number;
  claimed_local_tokens: boolean;
}

export interface Friend {
  id: string;
  username: string;
  /** `pending` : demande en attente ; `accepted` : ami confirmé. */
  status: "pending" | "accepted";
  /** Vrai si c'est l'autre joueur qui a envoyé la demande. */
  incoming: boolean;
}

export interface GameInvite {
  id: string;
  from_id: string;
  to_id: string;
  match_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  /** Renseigné à la lecture, à partir des profils. */
  from_username?: string;
}

export const USERNAME_RULE = /^[A-Za-z0-9_-]{3,20}$/;

/* ---------- Session ---------- */

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Ouvre la connexion Google. La page est quittée puis rechargée à l'adresse
 * courante, session établie.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    ...(typeof window === "undefined"
      ? {}
      : { options: { redirectTo: `${window.location.origin}/online` } }),
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Prévient à chaque changement de session (connexion, déconnexion, retour). */
export function onAuthChange(cb: (userId: string | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

/* ---------- Profil ---------- */

export async function getMyProfile(): Promise<Profile | null> {
  const id = await currentUserId();
  if (!id) return null;
  const { data, error } = await anyTable("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as Profile | null) ?? null;
}

export async function isUsernameFree(username: string): Promise<boolean> {
  const { data, error } = await anyTable("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  return !data;
}

/**
 * Crée le profil du joueur connecté. Le pseudo est unique en base : deux
 * joueurs qui le choisissent en même temps ne peuvent pas l'obtenir tous les
 * deux, et le second reçoit un message clair plutôt qu'une erreur SQL.
 */
export async function createProfile(username: string): Promise<Profile> {
  const id = await currentUserId();
  if (!id) throw new Error("Connectez-vous pour choisir un pseudo.");
  const name = username.trim();
  if (!USERNAME_RULE.test(name)) {
    throw new Error("Pseudo : 3 à 20 caractères, lettres, chiffres, tiret ou souligné.");
  }
  const { data, error } = await anyTable("profiles")
    .insert({ id, username: name } as never)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  return data as unknown as Profile;
}

/* ---------- Jetons ---------- */

const LOCAL_CLAIM_KEY = "azteque-tokens-claimed";

/**
 * Reporte une seule fois le solde accumulé dans ce navigateur avant
 * l'ouverture d'un compte.
 *
 * Deux verrous, l'un côté compte et l'autre côté navigateur : le compte ne
 * peut être crédité qu'une fois (`claimed_local_tokens` en base), et ce
 * navigateur ne peut créditer qu'un seul compte (le marqueur local).
 */
export async function claimLocalTokens(localBalance: number): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    if (localStorage.getItem(LOCAL_CLAIM_KEY)) return null;
  } catch {
    return null;
  }
  const { data, error } = await rpc("claim_local_tokens", { _amount: Math.max(0, localBalance) });
  if (error) throw error;
  try {
    localStorage.setItem(LOCAL_CLAIM_KEY, "1");
  } catch {
    /* stockage indisponible : le verrou en base suffit */
  }
  return (data as unknown as number | null) ?? null;
}

/** Récompense d'une victoire contre l'IA. Le montant est fixé par le serveur. */
export async function awardAiWin(difficulty: string): Promise<number | null> {
  const { data, error } = await rpc("award_ai_win", { _difficulty: difficulty });
  if (error) throw error;
  return (data as unknown as number | null) ?? null;
}

/**
 * Règle la mise d'un champ terminé. Le serveur relit lui-même le vainqueur
 * dans l'état de partie, si bien qu'aucun client ne peut s'attribuer les
 * jetons. L'appel est idempotent : les deux joueurs peuvent le lancer.
 */
export async function settleMatch(matchId: string): Promise<void> {
  const { error } = await rpc("settle_match", { _match_id: matchId });
  if (error) throw error;
}

/* ---------- Recherche et amis ---------- */

export async function searchPlayers(query: string, limit = 10): Promise<Profile[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const me = await currentUserId();
  const { data, error } = await anyTable("profiles")
    .select("id, username, tokens")
    .ilike("username", `%${q}%`)
    .limit(limit + 1);
  if (error) throw error;
  return ((data as unknown as Profile[]) ?? []).filter((p) => p.id !== me).slice(0, limit);
}

interface FriendshipRow {
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
}

/** Liste des amis et des demandes en cours, avec leur pseudo. */
export async function listFriends(): Promise<Friend[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await anyTable("friendships")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`);
  if (error) throw error;
  const rows = (data as unknown as FriendshipRow[]) ?? [];
  if (rows.length === 0) return [];

  const others = rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
  const { data: profiles, error: pErr } = await anyTable("profiles")
    .select("id, username")
    .in("id", others);
  if (pErr) throw pErr;
  const names = new Map(
    ((profiles as unknown as Profile[]) ?? []).map((p) => [p.id, p.username] as const),
  );

  return rows.map((r) => {
    const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
    return {
      id: otherId,
      username: names.get(otherId) ?? "Joueur",
      status: r.status,
      incoming: r.addressee_id === me && r.status === "pending",
    };
  });
}

export async function requestFriend(otherId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error("Connectez-vous d'abord.");
  const { error } = await anyTable("friendships").insert({
    requester_id: me,
    addressee_id: otherId,
    status: "pending",
  } as never);
  if (error) {
    if (error.code === "23505") throw new Error("Vous êtes déjà liés ou une demande est en cours.");
    throw error;
  }
}

export async function acceptFriend(otherId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error("Connectez-vous d'abord.");
  const { error } = await anyTable("friendships")
    .update({ status: "accepted" } as never)
    .eq("requester_id", otherId)
    .eq("addressee_id", me);
  if (error) throw error;
}

export async function removeFriend(otherId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error("Connectez-vous d'abord.");
  const { error } = await anyTable("friendships")
    .delete()
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${otherId}),` +
        `and(requester_id.eq.${otherId},addressee_id.eq.${me})`,
    );
  if (error) throw error;
}

/* ---------- Invitations à jouer ---------- */

export async function invitePlayer(toId: string, matchId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error("Connectez-vous d'abord.");
  const { error } = await anyTable("game_invites").insert({
    from_id: me,
    to_id: toId,
    match_id: matchId,
    status: "pending",
  } as never);
  if (error) throw error;
}

export async function listIncomingInvites(): Promise<GameInvite[]> {
  const me = await currentUserId();
  if (!me) return [];
  const { data, error } = await anyTable("game_invites")
    .select("*")
    .eq("to_id", me)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const invites = (data as unknown as GameInvite[]) ?? [];
  if (invites.length === 0) return [];

  const { data: profiles } = await anyTable("profiles")
    .select("id, username")
    .in("id", [...new Set(invites.map((i) => i.from_id))]);
  const names = new Map(
    ((profiles as unknown as Profile[]) ?? []).map((p) => [p.id, p.username] as const),
  );
  return invites.map((i) => ({ ...i, from_username: names.get(i.from_id) ?? "Joueur" }));
}

/** Accepte l'invitation et rejoint la partie d'un seul geste (côté serveur). */
export async function acceptInvite(inviteId: string): Promise<{ id: string } | null> {
  const { data, error } = await rpc("accept_game_invite", { _invite_id: inviteId });
  if (error) throw error;
  const rows = data as unknown as { id: string }[] | null;
  return rows?.[0] ?? null;
}

export async function respondInvite(
  inviteId: string,
  status: "declined" | "cancelled",
): Promise<void> {
  const { error } = await anyTable("game_invites")
    .update({ status } as never)
    .eq("id", inviteId);
  if (error) throw error;
}

/** Réagit en direct aux invitations reçues. */
export function subscribeInvites(userId: string, onChange: () => void) {
  const channel = supabase
    .channel(`invites-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_invites", filter: `to_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/* ---------- Présence : qui est en ligne ---------- */

/**
 * Salon de présence commun à tous les joueurs connectés. Chacun s'y annonce,
 * ce qui permet d'afficher les amis actuellement disponibles.
 */
export function trackLobbyPresence(userId: string, onOnline: (ids: Set<string>) => void) {
  const channel = supabase.channel("lobby", { config: { presence: { key: userId } } });
  channel
    .on("presence", { event: "sync" }, () => {
      onOnline(new Set(Object.keys(channel.presenceState())));
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ at: Date.now() });
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}

/* ---------- Historique des confrontations ---------- */

export interface HeadToHead {
  wins: number;
  losses: number;
}

/**
 * Bilan des champs joués contre un adversaire. Les parties sont lues depuis
 * `matches`, dont la policy ne laisse voir que celles auxquelles on a
 * participé : le bilan est donc forcément le sien.
 */
export async function headToHead(opponentId: string): Promise<HeadToHead> {
  const me = await currentUserId();
  if (!me) return { wins: 0, losses: 0 };
  const { data, error } = await supabase
    .from("matches")
    .select("winner_id, host_id, guest_id")
    .not("winner_id", "is", null);
  if (error) throw error;
  const rows =
    (data as unknown as { winner_id: string; host_id: string; guest_id: string }[]) ?? [];
  let wins = 0;
  let losses = 0;
  for (const r of rows) {
    const pair = [r.host_id, r.guest_id];
    if (!pair.includes(me) || !pair.includes(opponentId)) continue;
    if (r.winner_id === me) wins += 1;
    else if (r.winner_id === opponentId) losses += 1;
  }
  return { wins, losses };
}

/** Palmarès complet du joueur, adversaire par adversaire. */
export async function myRecord(): Promise<{ wins: number; losses: number }> {
  const me = await currentUserId();
  if (!me) return { wins: 0, losses: 0 };
  const { data, error } = await supabase
    .from("matches")
    .select("winner_id, host_id, guest_id")
    .not("winner_id", "is", null);
  if (error) throw error;
  const rows =
    (data as unknown as { winner_id: string; host_id: string; guest_id: string }[]) ?? [];
  let wins = 0;
  let losses = 0;
  for (const r of rows) {
    if (r.host_id !== me && r.guest_id !== me) continue;
    if (r.winner_id === me) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

import { supabase } from "@/integrations/supabase/client";
import { setTokens } from "@/lib/azteque/tokens";
import { START_RATING } from "@/lib/azteque/rank";

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

/**
 * Ce qu'un joueur voit d'un autre : de quoi le reconnaître et le situer. La
 * cote est publique par nature — un classement que l'adversaire ne peut pas
 * lire ne sert à rien.
 */
export interface PublicProfile {
  id: string;
  username: string;
  rating: number;
  /** `google`, `homme` ou `femme` : ce que le joueur montre de lui. */
  avatar_kind: string;
  /** Photo du compte Google, quand c'est elle qui est choisie. */
  avatar_url: string | null;
}

export interface Profile extends PublicProfile {
  tokens: number;
  claimed_local_tokens: boolean;
  /** Meilleure cote jamais atteinte : un grade perdu reste un grade obtenu. */
  peak_rating: number;
  /** Nombre de champs classés joués, qui détermine l'amplitude des résultats. */
  rated_games: number;
  /** Journée du dernier cadeau quotidien perçu, au format AAAA-MM-JJ. */
  daily_bonus_at: string;
}

export interface Friend {
  id: string;
  username: string;
  rating: number;
  avatar_kind: string;
  avatar_url: string | null;
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
  /** Renseignés à la lecture, à partir des profils. */
  from_username?: string;
  from_rating?: number;
  from_avatar?: PublicProfile | null;
}

export const USERNAME_RULE = /^[A-Za-z0-9_-]{3,20}$/;

/**
 * Rend lisible une erreur remontée par Supabase.
 *
 * PostgREST ne lève pas des `Error` mais des objets simples
 * (`{ message, code, details, hint }`) : un test `instanceof Error` les manque
 * donc systématiquement, et la cause réelle se perdait derrière un message
 * générique. Les codes les plus courants sont traduits en explication
 * actionnable, car ils désignent presque toujours un défaut de mise en service
 * plutôt qu'un défaut du code.
 */
export function describeError(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const o = e as { message?: string; code?: string; hint?: string; details?: string };
    const code = o.code ?? "";
    if (code === "PGRST205" || code === "42P01") {
      return (
        "Les tables des comptes sont introuvables sur ce projet Supabase. " +
        "La migration n'y a pas été appliquée, ou le cache de schéma n'a pas " +
        "encore été rechargé. Voir docs/mise-en-service-comptes.md."
      );
    }
    if (code === "42501" || code === "PGRST301") {
      return "Accès refusé par la base pour ce compte (droits ou policy RLS).";
    }
    const parts = [o.message, o.details, o.hint].filter(Boolean);
    if (parts.length) return `${parts.join(" — ")}${code ? ` (${code})` : ""}`;
  }
  return fallback;
}

/* ---------- Session ---------- */

/**
 * Empêche un appel réseau resté sans réponse de figer l'écran. Sans ce
 * garde-fou, une lecture de session qui n'aboutit pas laisse l'interface sur
 * « Chargement… » sans fin ni message.
 */
async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Identifiant du joueur connecté, ou null.
 *
 * Une session anonyme — héritée des versions précédentes, où le jeu en ligne
 * n'exigeait pas de compte — ne vaut plus identité : elle ne porte ni pseudo,
 * ni jetons, ni amis. On la traite comme une absence de session, de sorte que
 * l'écran de connexion s'affiche au lieu de tenter d'y rattacher un profil.
 */
export async function currentUserId(): Promise<string | null> {
  const { data } = await withTimeout(supabase.auth.getSession(), 3500, {
    data: { session: null },
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  const user = data.session?.user;
  if (!user) return null;
  if (user.is_anonymous) return null;
  return user.id;
}

/**
 * Efface une session inutilisable (anonyme, ou dont le jeton ne peut plus être
 * renouvelé) pour que le joueur puisse repartir de l'écran de connexion.
 */
export async function clearStaleSession(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {
    /* rien à faire de plus : l'écran de connexion sera proposé de toute façon */
  }
}

/**
 * Ouvre la connexion Google via le courtier Lovable (fonctionne aussi dans
 * l'aperçu en iframe). La session est établie au retour.
 */
export async function signInWithGoogle() {
  const { lovable } = await import("@/integrations/lovable");
  await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
}

/**
 * Termine une connexion Google après la redirection pleine page.
 *
 * Hors iframe, le courtier Lovable recharge l'application avec les jetons de
 * session dans l'adresse (`?access_token=…&refresh_token=…`, ou dans le
 * fragment `#`). Sans traitement, l'utilisateur retombe simplement sur la
 * page de connexion sans être connecté. On lit donc ces jetons au chargement,
 * on établit la session, puis on nettoie l'adresse pour ne pas les y laisser
 * visibles ni rejouables.
 *
 * Un retour au format PKCE (`?code=`) est également accepté : c'est la forme
 * qu'aurait une connexion Supabase directe, sans passer par le courtier.
 *
 * Renvoie vrai si un retour d'authentification a été traité ; lève si Google
 * a refusé, pour que la raison soit montrée plutôt que passée sous silence.
 */
export async function completeOAuthRedirect(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const query = url.searchParams;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const pick = (k: string) => query.get(k) ?? hash.get(k);

  const denied = pick("error_description") ?? pick("error");
  const accessToken = pick("access_token");
  const refreshToken = pick("refresh_token");
  const code = pick("code");
  if (!denied && !accessToken && !code) return false;

  // Ne retire QUE les paramètres d'authentification : l'adresse peut porter
  // par ailleurs un code de partie (`?partie=…`) qu'il ne faut pas perdre.
  const clean = () => {
    for (const k of [
      "access_token",
      "refresh_token",
      "expires_in",
      "expires_at",
      "token_type",
      "provider_token",
      "code",
      "state",
      "error",
      "error_code",
      "error_description",
    ]) {
      query.delete(k);
    }
    const search = query.toString();
    window.history.replaceState(null, "", url.pathname + (search ? `?${search}` : ""));
  };

  if (denied) {
    clean();
    throw new Error(denied);
  }

  try {
    // Comme ailleurs, un appel sans réponse ne doit pas figer l'écran : mieux
    // vaut revenir à la connexion avec un message.
    let failure: unknown = null;
    try {
      if (accessToken && refreshToken) {
        const { error } = await withTimeout(
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
          8000,
          { error: new Error("délai dépassé") } as Awaited<
            ReturnType<typeof supabase.auth.setSession>
          >,
        );
        failure = error;
      } else if (code) {
        const { error } = await withTimeout(supabase.auth.exchangeCodeForSession(code), 8000, {
          error: new Error("délai dépassé"),
        } as Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>);
        failure = error;
      }
    } catch (e: unknown) {
      failure = e;
    }
    if (failure) {
      // La session a pu être établie malgré tout — le client Supabase traite
      // lui aussi ces retours. L'échec n'en est un que s'il n'en reste rien.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        throw new Error(
          "La connexion n'a pas pu être finalisée. Vérifiez votre réseau et réessayez.",
        );
      }
    }
    return true;
  } finally {
    clean();
  }
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

/**
 * Crée le profil du joueur connecté.
 *
 * L'unicité du pseudo est garantie par un index sur `lower(username)` : deux
 * joueurs qui le choisissent en même temps ne peuvent pas l'obtenir tous les
 * deux, et le second reçoit un message clair plutôt qu'une erreur SQL. On ne
 * vérifie donc pas la disponibilité au préalable — entre la vérification et
 * l'insertion, le pseudo pourrait de toute façon être pris.
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

/* ---------- Pseudo et avatar ---------- */

/**
 * La photo du compte Google, telle que le fournisseur l'a transmise.
 *
 * Elle est lue sur la session déjà en mémoire — aucun appel réseau — et n'est
 * conservée en base que pour que les AUTRES joueurs puissent l'afficher : rien
 * n'obligerait le joueur lui-même à passer par la base pour voir la sienne.
 */
export async function googlePhoto(): Promise<string | null> {
  const { data } = await withTimeout(supabase.auth.getSession(), 3500, {
    data: { session: null },
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  const meta = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
  const url = meta?.["avatar_url"] ?? meta?.["picture"];
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/**
 * Recopie la photo Google sur le profil si elle a changé.
 *
 * Google renouvelle l'adresse de la photo quand le joueur la remplace : sans
 * cette mise à jour, les autres joueurs continueraient d'afficher l'ancienne,
 * ou une image devenue introuvable. Un échec n'est pas grave — l'avatar neutre
 * prend le relais — donc l'appelant reçoit le profil inchangé plutôt qu'une
 * erreur.
 */
export async function syncGooglePhoto(profile: Profile): Promise<Profile> {
  const url = await googlePhoto().catch(() => null);
  if (!url || url === profile.avatar_url) return profile;
  const { error } = await anyTable("profiles")
    .update({ avatar_url: url } as never)
    .eq("id", profile.id);
  if (error) return profile;
  return { ...profile, avatar_url: url };
}

/** Choisit ce que le joueur montre : sa photo Google ou l'un des deux avatars. */
export async function setAvatarKind(kind: "google" | "homme" | "femme"): Promise<void> {
  const id = await currentUserId();
  if (!id) throw new Error("Connectez-vous d'abord.");
  const { error } = await anyTable("profiles")
    .update({ avatar_kind: kind } as never)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Dit si un pseudo est libre, pour le signaler pendant la frappe.
 *
 * La réponse ne vaut que pour l'instant où elle est donnée : entre elle et
 * l'enregistrement, un autre joueur peut prendre le nom. C'est l'index unique
 * qui tranche, et `updateUsername` traduit son refus — cette vérification-ci
 * n'est qu'une politesse, pour ne pas laisser saisir un nom voué à l'échec.
 * Elle ne conditionne donc rien : si elle échoue, l'enregistrement reste
 * possible et c'est la base qui répond.
 */
export async function isUsernameFree(username: string): Promise<boolean> {
  const name = username.trim();
  if (!USERNAME_RULE.test(name)) return false;
  const me = await currentUserId();
  // Une vérification qui n'aboutit pas doit se déclarer perdue plutôt que de
  // laisser le joueur devant un « Vérification… » sans fin : c'est un confort,
  // pas une condition.
  const { data, error } = await withTimeout(
    anyTable("profiles").select("id").ilike("username", name).limit(2),
    6000,
    { data: null, error: { message: "Vérification interrompue" } } as never,
  );
  if (error) throw error;
  const rows = (data as unknown as { id: string }[]) ?? [];
  // Reprendre son propre pseudo, ou n'en changer que la casse, reste permis.
  return rows.every((r) => r.id === me);
}

/** Renomme le compte. Le pseudo reste unique, à la casse près. */
export async function updateUsername(username: string): Promise<Profile> {
  const id = await currentUserId();
  if (!id) throw new Error("Connectez-vous d'abord.");
  const name = username.trim();
  if (!USERNAME_RULE.test(name)) {
    throw new Error("Pseudo : 3 à 20 caractères, lettres, chiffres, tiret ou souligné.");
  }
  const { data, error } = await anyTable("profiles")
    .update({ username: name } as never)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ce pseudo est déjà pris.");
    throw error;
  }
  return data as unknown as Profile;
}

/* ---------- Jetons ---------- */

/**
 * Marqueur de l'ancien report à usage unique. Il n'ouvre plus aucun droit :
 * il sert seulement à reconnaître un navigateur qui a déjà cédé son solde
 * sous l'ancienne règle, laquelle ne le remettait pas à zéro. Sans cela, ce
 * solde-là serait reporté une seconde fois.
 */
const LEGACY_CLAIM_KEY = "azteque-tokens-claimed";

/**
 * Reporte sur le compte connecté les jetons gagnés dans ce navigateur.
 *
 * Le report vaut aussi bien à la création d'un compte que pour un compte
 * ancien qui retrouve les gains accumulés hors connexion. Le solde local est
 * remis à zéro dès que le serveur a répondu : c'est ce qui empêche de le
 * reporter deux fois, puisqu'une fois connecté les gains ne passent plus par
 * le navigateur mais par `award_ai_win`. Le serveur, lui, borne le montant —
 * il n'a aucun moyen de vérifier une partie jouée hors connexion.
 *
 * Renvoie le nouveau solde du compte, ou `null` s'il n'y avait rien à
 * reporter.
 */
export async function claimLocalTokens(localBalance: number): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const amount = Math.max(0, Math.round(localBalance));

  // Solde hérité de l'ancienne règle : déjà crédité, jamais remis à zéro.
  try {
    if (localStorage.getItem(LEGACY_CLAIM_KEY)) {
      setTokens(0);
      localStorage.removeItem(LEGACY_CLAIM_KEY);
      return null;
    }
  } catch {
    /* stockage indisponible : le plafond en base fait office de garde-fou */
  }

  if (amount <= 0) return null;
  const { data, error } = await rpc("claim_local_tokens", { _amount: amount });
  if (error) throw error;
  setTokens(0);
  return (data as unknown as number | null) ?? null;
}

/**
 * Verse le cadeau du jour sur le compte connecté.
 *
 * C'est la base qui décide s'il est encore dû : elle seule tient la date du
 * dernier versement, hors d'atteinte du client. Renvoie ce qui a été versé —
 * zéro si le cadeau du jour était déjà pris — et le solde à jour.
 */
export async function claimDailyBonus(): Promise<{ granted: number; tokens: number }> {
  const { data, error } = await rpc("claim_daily_bonus", {});
  if (error) throw error;
  const r = (data as unknown as { granted?: number; tokens?: number } | null) ?? {};
  return { granted: r.granted ?? 0, tokens: r.tokens ?? 0 };
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

export async function searchPlayers(query: string, limit = 10): Promise<PublicProfile[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const me = await currentUserId();
  const { data, error } = await anyTable("profiles")
    .select("id, username, rating, avatar_kind, avatar_url")
    .ilike("username", `%${q}%`)
    .limit(limit + 1);
  if (error) throw error;
  return ((data as unknown as PublicProfile[]) ?? []).filter((p) => p.id !== me).slice(0, limit);
}

/** Profil public d'un joueur, pour afficher son grade à côté de son nom. */
export async function getPublicProfile(id: string): Promise<PublicProfile | null> {
  const { data, error } = await anyTable("profiles")
    .select("id, username, rating, avatar_kind, avatar_url")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PublicProfile | null) ?? null;
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
    .select("id, username, rating, avatar_kind, avatar_url")
    .in("id", others);
  if (pErr) throw pErr;
  const known = new Map(
    ((profiles as unknown as PublicProfile[]) ?? []).map((p) => [p.id, p] as const),
  );

  return rows.map((r) => {
    const otherId = r.requester_id === me ? r.addressee_id : r.requester_id;
    const other = known.get(otherId);
    return {
      id: otherId,
      username: other?.username ?? "Joueur",
      rating: other?.rating ?? START_RATING,
      avatar_kind: other?.avatar_kind ?? "google",
      avatar_url: other?.avatar_url ?? null,
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

/** Invite un joueur sur une partie déjà créée. Renvoie l'identifiant de
 * l'invitation, qui permet de la retirer si l'hôte renonce à attendre. */
export async function invitePlayer(toId: string, matchId: string): Promise<string> {
  const me = await currentUserId();
  if (!me) throw new Error("Connectez-vous d'abord.");
  const { data, error } = await anyTable("game_invites")
    .insert({ from_id: me, to_id: toId, match_id: matchId, status: "pending" } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

/** Au-delà de ce délai, une invitation restée sans réponse n'est plus proposée. */
const INVITE_TTL_MS = 10 * 60 * 1000;

export async function listIncomingInvites(): Promise<GameInvite[]> {
  const me = await currentUserId();
  if (!me) return [];
  // L'hôte qui ferme son onglet laisse une invitation en attente derrière lui :
  // on ne propose donc que les plus récentes, faute de quoi l'adversaire se
  // verrait offrir des tables abandonnées depuis longtemps.
  const since = new Date(Date.now() - INVITE_TTL_MS).toISOString();
  const { data, error } = await anyTable("game_invites")
    .select("*")
    .eq("to_id", me)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const invites = (data as unknown as GameInvite[]) ?? [];
  if (invites.length === 0) return [];

  const { data: profiles } = await anyTable("profiles")
    .select("id, username, rating, avatar_kind, avatar_url")
    .in("id", [...new Set(invites.map((i) => i.from_id))]);
  const known = new Map(
    ((profiles as unknown as PublicProfile[]) ?? []).map((p) => [p.id, p] as const),
  );
  return invites.map((i) => ({
    ...i,
    from_username: known.get(i.from_id)?.username ?? "Joueur",
    from_rating: known.get(i.from_id)?.rating ?? START_RATING,
    from_avatar: known.get(i.from_id) ?? null,
  }));
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

import { supabase } from "@/integrations/supabase/client";
import { applySoundSettings, type SoundSettings } from "@/lib/azteque/sfx";

/**
 * Administration.
 *
 * Rien ici ne donne de droit : chaque fonction appelle une procédure serveur
 * qui vérifie elle-même que l'appelant est administrateur. Cacher un bouton
 * n'a jamais empêché personne d'appeler ce qu'il déclenche — la console se
 * contente donc de ne pas proposer ce qui serait de toute façon refusé.
 */
const rpc = (name: string, args: Record<string, unknown> = {}) =>
  (
    supabase as unknown as {
      rpc: (n: string, a: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(name, args);

const anyTable = (name: string) =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(name);

export interface AdminPlayer {
  id: string;
  username: string;
  tokens: number;
  rating: number;
  rated_games: number;
  avatar_kind: string;
  avatar_url: string | null;
  is_admin: boolean;
  banned: boolean;
  purchases: number;
  created_at: string;
}

export interface AdminStats {
  players: number;
  banned: number;
  admins: number;
  tokens: number;
  purchases: number;
  matches: number;
  finished: number;
  active_7d: number;
}

export interface AdminLogEntry {
  id: number;
  admin_id: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  at: string;
}

/**
 * Pourquoi la console s'ouvre, ou pourquoi elle reste fermée.
 *
 * Trois situations très différentes menaient au même écran : ne pas être
 * connecté, ne pas être administrateur, et une base où la migration
 * d'administration n'est pas encore passée. La première demande de se
 * connecter, la deuxième une requête SQL, la troisième une migration — les
 * confondre laisse chercher longtemps.
 */
export type AdminAccess =
  | { state: "admin" }
  | { state: "anonymous" }
  | { state: "not-admin"; username: string }
  | { state: "missing-migration" };

export async function adminAccess(): Promise<AdminAccess> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user || user.is_anonymous) return { state: "anonymous" };

  const { data, error } = await rpc("is_admin");
  if (error) {
    // PGRST202 : la fonction n'est pas dans le cache de schéma. 42883 : le
    // moteur ne la connaît pas. Les deux disent la même chose — la migration
    // d'administration n'a pas été appliquée.
    const code = (error as { code?: string }).code ?? "";
    if (code === "PGRST202" || code === "42883") return { state: "missing-migration" };
    return { state: "anonymous" };
  }
  if (data === true) return { state: "admin" };

  // Le pseudo sert à composer la requête qui sacre le premier administrateur :
  // c'est la seule chose à faire, autant la donner toute prête.
  const { data: profil } = await anyTable("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  return {
    state: "not-admin",
    username: (profil as unknown as { username?: string } | null)?.username ?? "",
  };
}

/** Vrai si le compte connecté administre. La base seule en décide. */
export async function amIAdmin(): Promise<boolean> {
  return (
    (await adminAccess().catch(() => ({ state: "anonymous" }) as AdminAccess)).state === "admin"
  );
}

export async function adminStats(): Promise<AdminStats | null> {
  const { data, error } = await rpc("admin_stats");
  if (error) throw error;
  return (data as unknown as AdminStats | null) ?? null;
}

export async function adminListPlayers(query = "", limit = 50): Promise<AdminPlayer[]> {
  const { data, error } = await rpc("admin_list_players", { _query: query, _limit: limit });
  if (error) throw error;
  return (data as unknown as AdminPlayer[]) ?? [];
}

/** Crédite (montant positif) ou débite (négatif). Renvoie le nouveau solde. */
export async function adminGrantTokens(
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  const { data, error } = await rpc("admin_grant_tokens", {
    _user: userId,
    _amount: Math.round(amount),
    _reason: reason,
  });
  if (error) throw error;
  return (data as unknown as number) ?? 0;
}

export async function adminSetBanned(userId: string, banned: boolean): Promise<void> {
  const { error } = await rpc("admin_set_banned", { _user: userId, _banned: banned });
  if (error) throw error;
}

export async function adminSetAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const { error } = await rpc("admin_set_admin", { _user: userId, _is_admin: isAdmin });
  if (error) throw error;
}

export interface AdminShopItem {
  id: string;
  kind: string;
  price: number;
  active: boolean;
}

export async function adminListItems(): Promise<AdminShopItem[]> {
  const { data, error } = await anyTable("shop_items").select("id, kind, price, active");
  if (error) throw error;
  return (data as unknown as AdminShopItem[]) ?? [];
}

export async function adminSetItem(id: string, price: number, active: boolean): Promise<void> {
  const { error } = await rpc("admin_set_item", {
    _item_id: id,
    _price: Math.round(price),
    _active: active,
  });
  if (error) throw error;
}

export async function adminLog(limit = 50): Promise<AdminLogEntry[]> {
  const { data, error } = await anyTable("admin_log")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as AdminLogEntry[]) ?? [];
}

/* ---------- Réglages du son ---------- */

const CLE_SONS = "sounds";

/**
 * Charge les réglages du son et les applique.
 *
 * Appelée à l'ouverture, pour tout le monde : la table est lisible sans compte,
 * puisque le jeu contre l'IA n'en demande pas. Un échec — table absente, réseau
 * coupé — laisse les valeurs d'origine, qui sont celles du code.
 */
export async function loadSoundSettings(): Promise<void> {
  try {
    const { data, error } = await anyTable("app_settings")
      .select("value")
      .eq("key", CLE_SONS)
      .maybeSingle();
    if (error || !data) return;
    applySoundSettings((data as unknown as { value: unknown }).value);
  } catch {
    /* les valeurs du code font foi */
  }
}

export async function adminSaveSoundSettings(settings: SoundSettings): Promise<void> {
  const { error } = await rpc("admin_set_setting", {
    _key: CLE_SONS,
    _value: settings as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  applySoundSettings(settings);
}

import { supabase } from "@/integrations/supabase/client";
import {
  applySoundSettings,
  clearSample,
  isSoundId,
  registerSample,
  type SoundSettings,
} from "@/lib/azteque/sfx";

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
  first_name: string | null;
  last_name: string | null;
  /** Code ISO à deux lettres, choisi par le joueur. */
  country: string | null;
  tokens: number;
  rating: number;
  rated_games: number;
  /** Tours joués, tous champs confondus. */
  rounds_played: number;
  avatar_kind: string;
  avatar_url: string | null;
  is_admin: boolean;
  banned: boolean;
  purchases: number;
  /** Dernier passage dans le jeu ; sert à dire qui est en ligne. */
  last_seen_at: string | null;
  created_at: string;
}

/** Au-delà de ce délai sans signe de vie, un joueur est réputé hors ligne. */
export const EN_LIGNE_MS = 5 * 60 * 1000;

export function estEnLigne(p: { last_seen_at: string | null }): boolean {
  if (!p.last_seen_at) return false;
  return Date.now() - new Date(p.last_seen_at).getTime() < EN_LIGNE_MS;
}

/**
 * Signale que le joueur est là.
 *
 * Une présence en direct suppose une connexion ouverte, qu'une console
 * consultée de loin n'a pas. Une trace horodatée se lit sur une colonne,
 * survit à un rechargement et ne coûte qu'une écriture par ouverture.
 */
export async function touchLastSeen(): Promise<void> {
  // Un échec n'a aucune conséquence : la présence est un agrément, pas une
  // condition. On ne le remonte donc pas.
  try {
    await rpc("touch_last_seen");
  } catch {
    /* ignoré */
  }
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

/**
 * La liste des joueurs.
 *
 * Elle passe d'abord par la fonction serveur, qui agrège le nombre d'achats.
 * Si la base est en retard sur le code — fonction absente, colonne manquante —
 * on relit `profiles` directement, en retirant les colonnes que la base ignore
 * jusqu'à ce qu'elle réponde. Un administrateur a le droit de lire les profils ;
 * il perd le décompte des achats, pas sa console.
 */
export async function adminListPlayers(query = "", limit = 50): Promise<AdminPlayer[]> {
  const { data, error } = await rpc("admin_list_players", { _query: query, _limit: limit });
  if (!error) return (data as unknown as AdminPlayer[]) ?? [];
  if (!colonneAbsente(error) && !fonctionAbsente(error)) throw error;

  const colonnes = [
    "id, username, first_name, last_name, country, tokens, rating, rated_games, rounds_played, avatar_kind, avatar_url, is_admin, banned, last_seen_at, created_at",
    "id, username, tokens, rating, rated_games, avatar_kind, avatar_url, is_admin, banned, created_at",
    "id, username, tokens, rating, created_at",
    "id, username, tokens",
  ];
  let derniere: unknown = error;
  for (const cols of colonnes) {
    let q = anyTable("profiles").select(cols);
    if (query) q = q.ilike("username", `%${query}%`);
    const r = await q.limit(limit);
    if (r.error) {
      derniere = r.error;
      if (colonneAbsente(r.error)) continue;
      throw r.error;
    }
    return ((r.data as unknown as Partial<AdminPlayer>[]) ?? []).map((p) => ({
      id: String(p.id),
      username: p.username ?? "",
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      country: p.country ?? null,
      tokens: p.tokens ?? 0,
      rating: p.rating ?? 1000,
      rated_games: p.rated_games ?? 0,
      rounds_played: p.rounds_played ?? 0,
      avatar_kind: p.avatar_kind ?? "google",
      avatar_url: p.avatar_url ?? null,
      is_admin: p.is_admin ?? false,
      banned: p.banned ?? false,
      purchases: 0,
      last_seen_at: p.last_seen_at ?? null,
      created_at: p.created_at ?? "",
    }));
  }
  throw derniere;
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

/** Vrai quand la base ignore une colonne demandée : migration en retard. */
function colonneAbsente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code ?? "";
  return code === "PGRST204" || code === "42703";
}

/** Vrai quand la base ignore la fonction appelée. */
function fonctionAbsente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code ?? "";
  return code === "PGRST202" || code === "42883";
}

/**
 * Le catalogue tel que la base le tient.
 *
 * `active` vient de la migration d'administration : si elle n'est pas encore
 * passée, on relit sans elle plutôt que de rendre l'onglet inutilisable. Tout
 * est alors réputé en vente, ce qui est le cas puisque le retrait n'existe pas
 * encore.
 */
export async function adminListItems(): Promise<AdminShopItem[]> {
  const complet = await anyTable("shop_items").select("id, kind, price, active");
  if (!complet.error) return (complet.data as unknown as AdminShopItem[]) ?? [];
  if (!colonneAbsente(complet.error)) throw complet.error;

  const reduit = await anyTable("shop_items").select("id, kind, price");
  if (reduit.error) throw reduit.error;
  return ((reduit.data as unknown as Omit<AdminShopItem, "active">[]) ?? []).map((i) => ({
    ...i,
    active: true,
  }));
}

/**
 * Crée ou modifie un article de la boutique.
 *
 * Un identifiant nouveau crée, un identifiant connu modifie : la console n'a
 * pas à distinguer les deux gestes, et le serveur non plus.
 */
export async function adminUpsertItem(item: {
  id: string;
  kind: string;
  price: number;
  active: boolean;
  name: string;
  hint: string;
  data: Record<string, unknown>;
  sort: number;
}): Promise<void> {
  const { error } = await rpc("admin_upsert_item", {
    _id: item.id,
    _kind: item.kind,
    _price: Math.round(item.price),
    _active: item.active,
    _name: item.name,
    _hint: item.hint,
    _data: item.data,
    _sort: Math.round(item.sort),
  });
  if (error) throw error;
}

/** Supprime un article. Refusé s'il a déjà été acheté. */
export async function adminDeleteItem(id: string): Promise<void> {
  const { error } = await rpc("admin_delete_item", { _id: id });
  if (error) throw error;
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
 * Charge les réglages du son, puis les fichiers qui en remplacent certains.
 *
 * Appelée à l'ouverture, pour tout le monde : les deux tables sont lisibles
 * sans compte, puisque le jeu contre l'IA n'en demande pas. Un échec — table
 * absente, réseau coupé — laisse les valeurs d'origine, qui sont celles du
 * code, et la synthèse à sa place.
 */
export async function loadSoundSettings(): Promise<void> {
  try {
    const { data, error } = await anyTable("app_settings")
      .select("value")
      .eq("key", CLE_SONS)
      .maybeSingle();
    if (!error && data) applySoundSettings((data as unknown as { value: unknown }).value);
  } catch {
    /* les valeurs du code font foi */
  }
  await loadSoundFiles();
}

export async function adminSaveSoundSettings(settings: SoundSettings): Promise<void> {
  const { error } = await rpc("admin_set_setting", {
    _key: CLE_SONS,
    _value: settings as unknown as Record<string, unknown>,
  });
  if (error) throw error;
  applySoundSettings(settings);
}

/* ---------- Sons locaux ---------- */

/**
 * La taille au-delà de laquelle un fichier cesse d'être un effet.
 *
 * Chaque joueur télécharge ces sons à l'ouverture : ce qui est confortable
 * pour l'administrateur qui téléverse ne l'est pas pour celui qui joue en
 * bord de réseau. La base refuse de son côté au même seuil.
 */
export const SON_MAX_OCTETS = 700 * 1024;

export interface SoundFileInfo {
  id: string;
  mime: string;
  name: string;
  bytes: number;
  updated_at: string;
}

/** Octets → base64, par tranches : `btoa` sur un grand tableau déborde la pile. */
export function versBase64(bytes: ArrayBuffer): string {
  const octets = new Uint8Array(bytes);
  const pas = 0x8000;
  let s = "";
  for (let i = 0; i < octets.length; i += pas) {
    s += String.fromCharCode(...octets.subarray(i, i + pas));
  }
  return btoa(s);
}

/** Base64 → octets. */
export function depuisBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) octets[i] = bin.charCodeAt(i);
  return octets.buffer;
}

/**
 * Installe les sons remplacés par un fichier.
 *
 * Lue sans compte, comme les réglages : le jeu contre l'IA doit s'entendre
 * pareil. Un échec — table absente, migration en retard, réseau coupé — laisse
 * la synthèse en place, et un fichier illisible n'emporte que lui-même.
 */
export async function loadSoundFiles(): Promise<void> {
  try {
    const { data, error } = await anyTable("sound_files").select("id, data");
    if (error || !data) return;
    await Promise.all(
      (data as unknown as { id: string; data: string }[]).map(async (l) => {
        if (!isSoundId(l.id)) return;
        try {
          await registerSample(l.id, depuisBase64(l.data));
        } catch {
          clearSample(l.id);
        }
      }),
    );
  } catch {
    /* la synthèse reste en place */
  }
}

/** Ce qui est installé, sans les octets : de quoi renseigner la console. */
export async function listSoundFiles(): Promise<SoundFileInfo[]> {
  const { data, error } = await anyTable("sound_files").select("id, mime, name, bytes, updated_at");
  if (error) throw error;
  return (data as unknown as SoundFileInfo[]) ?? [];
}

export async function adminSetSoundFile(
  id: string,
  mime: string,
  name: string,
  bytes: ArrayBuffer,
): Promise<void> {
  const { error } = await rpc("admin_set_sound_file", {
    _id: id,
    _mime: mime,
    _name: name,
    _bytes: bytes.byteLength,
    _data: versBase64(bytes),
  });
  if (error) throw error;
}

export async function adminClearSoundFile(id: string): Promise<void> {
  const { error } = await rpc("admin_clear_sound_file", { _id: id });
  if (error) throw error;
}

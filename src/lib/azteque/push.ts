/**
 * L'abonnement du navigateur aux notifications, et ce que le joueur en règle.
 *
 * Le chemin est en trois temps, et chacun peut échouer sans conséquence pour
 * la partie en cours : le navigateur donne (ou refuse) la permission, le
 * service de push délivre une adresse d'abonnement, et cette adresse est
 * rangée en base pour que le serveur sache où écrire.
 *
 * La permission ne se demande JAMAIS au chargement. Un navigateur qui voit
 * une demande surgir sans raison la refuse souvent d'un réflexe — et ce refus
 * est définitif : ni le site ni le joueur ne peuvent le reprendre sans aller
 * fouiller les réglages du système. Elle part donc d'un geste explicite, dans
 * l'écran des notifications, où le joueur sait ce qu'il demande.
 */
import { supabase } from "@/lib/azteque/supabase-client";
import { VAPID_PUBLIQUE, type TypeNotification } from "@/lib/azteque/push-config";
import { b64urlVersOctets, octetsVersB64url } from "@/lib/azteque/web-push";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTable = (nom: string) => (supabase as unknown as { from: (t: string) => any }).from(nom);

export type Permission = "accordee" | "refusee" | "a-demander" | "indisponible";

/** Le navigateur sait-il faire ? iOS ne le peut qu'une fois l'app installée. */
export function pushSupporte(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permissionPush(): Permission {
  if (!pushSupporte()) return "indisponible";
  const p = Notification.permission;
  return p === "granted" ? "accordee" : p === "denied" ? "refusee" : "a-demander";
}

async function enregistrement(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupporte()) return null;
  // `ready` attend que le service worker soit actif : s'abonner avant, sur un
  // premier chargement, échoue silencieusement.
  return navigator.serviceWorker.ready;
}

/** L'abonnement déjà pris par CE navigateur, s'il en a un. */
export async function abonnementCourant(): Promise<PushSubscription | null> {
  const reg = await enregistrement();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

function enBase(abo: PushSubscription) {
  const json = abo.toJSON() as { keys?: { p256dh?: string; auth?: string } };
  return {
    endpoint: abo.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    agent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 200),
  };
}

/**
 * Range l'abonnement sous le compte ouvert.
 *
 * `endpoint` est unique en base : si un autre compte se connecte sur le même
 * appareil, la ligne CHANGE de propriétaire au lieu d'en créer une seconde.
 * Sans cela, l'ancien compte continuerait de recevoir les notifications de ce
 * téléphone — qui ne lui appartient plus.
 */
async function ranger(abo: PushSubscription): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const moi = data.session?.user.id;
  if (!moi) return;
  const { error } = await anyTable("push_subscriptions").upsert(
    { user_id: moi, ...enBase(abo), last_seen_at: new Date().toISOString() },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

/**
 * Demande la permission puis abonne. Rend l'état obtenu.
 *
 * Appelée depuis un geste du joueur, jamais autrement.
 */
export async function activerNotifications(): Promise<Permission> {
  if (!pushSupporte()) return "indisponible";
  const accord = await Notification.requestPermission();
  if (accord !== "granted") return accord === "denied" ? "refusee" : "a-demander";

  const reg = await enregistrement();
  if (!reg) return "indisponible";
  const existant = await reg.pushManager.getSubscription();
  const abo =
    existant ??
    (await reg.pushManager.subscribe({
      // Sans ce drapeau, les navigateurs refusent : ils exigent que chaque
      // message envoyé se traduise par une notification visible, et non par
      // un réveil silencieux de l'application.
      userVisibleOnly: true,
      applicationServerKey: b64urlVersOctets(VAPID_PUBLIQUE) as BufferSource,
    }));
  await ranger(abo);
  return "accordee";
}

/** Coupe les notifications sur CET appareil, sans toucher aux autres. */
export async function desactiverNotifications(): Promise<void> {
  const abo = await abonnementCourant();
  if (!abo) return;
  await anyTable("push_subscriptions").delete().eq("endpoint", abo.endpoint);
  await abo.unsubscribe();
}

/**
 * Remet l'abonnement en base s'il y manque.
 *
 * Un abonnement peut survivre côté navigateur alors que sa ligne a disparu :
 * compte supprimé puis recréé, base réinitialisée, ou envoi tombé en erreur
 * qui l'a fait purger à tort. Appelée à l'ouverture d'une session, cette
 * fonction répare en silence.
 */
export async function resynchroniser(): Promise<void> {
  if (permissionPush() !== "accordee") return;
  const abo = await abonnementCourant();
  if (!abo) return;
  await ranger(abo).catch(() => {
    /* sans conséquence : la prochaine ouverture réessaiera */
  });
}

/* ---------- Préférences ---------- */

export type Preferences = Record<TypeNotification, boolean>;

export const PREFERENCES_PAR_DEFAUT: Preferences = {
  invitation: true,
  appariement: true,
  message: true,
  revanche: true,
  ami_en_ligne: true,
};

export async function lirePreferences(): Promise<Preferences> {
  const { data: session } = await supabase.auth.getSession();
  const moi = session.session?.user.id;
  if (!moi) return PREFERENCES_PAR_DEFAUT;
  const { data } = await anyTable("push_preferences")
    .select("invitation, appariement, message, revanche, ami_en_ligne")
    .eq("user_id", moi)
    .maybeSingle();
  // Pas de ligne : le joueur n'a jamais rien réglé, tout est accepté.
  return { ...PREFERENCES_PAR_DEFAUT, ...((data as Partial<Preferences> | null) ?? {}) };
}

export async function ecrirePreference(type: TypeNotification, valeur: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const moi = session.session?.user.id;
  if (!moi) return;
  const { error } = await anyTable("push_preferences").upsert(
    { user_id: moi, [type]: valeur, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/* ---------- Envoi (depuis le navigateur de l'émetteur) ---------- */

/**
 * Demande au serveur de prévenir quelqu'un.
 *
 * Volontairement silencieuse en cas d'échec : une notification manquée ne doit
 * jamais faire échouer le geste qui l'a déclenchée. Une invitation part, qu'on
 * ait pu réveiller son destinataire ou non.
 */
export async function notifier(demande: {
  type: TypeNotification;
  vers?: string;
  matchId?: string;
}): Promise<void> {
  try {
    const { envoyerNotification } = await import("@/lib/azteque/push-envoi.server");
    await envoyerNotification({ data: demande });
  } catch {
    /* ignoré : le jeu ne dépend pas des notifications */
  }
}

export { octetsVersB64url };

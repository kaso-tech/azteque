/**
 * L'envoi d'une notification, et la vérification de son bien-fondé.
 *
 * Cette fonction est appelée par le navigateur d'un joueur pour en prévenir un
 * AUTRE. C'est exactement la forme qu'aurait un relais à spam si on la laissait
 * faire confiance à son appelant : « notifie tel joueur, avec tel texte ».
 *
 * Deux règles la tiennent :
 *
 * 1. Le client ne dit QUE le type et la cible. Le texte est composé ici, à
 *    partir de ce que la base sait — jamais à partir de ce que le client
 *    envoie. Personne ne peut donc faire afficher ce qu'il veut sur le
 *    téléphone d'un autre.
 *
 * 2. Chaque type revérifie le lien qui l'autorise : une invitation réellement
 *    en attente, une table réellement partagée, une revanche réellement
 *    proposée, un appelant réellement administrateur. Sans cette vérification,
 *    n'importe qui pourrait réveiller n'importe qui.
 *
 * L'envoi lui-même est dans `web-push.ts`, qui ne connaît rien d'Aztèque.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAztequeAuth } from "@/lib/azteque/auth-middleware-azteque";
import { VAPID_CONTACT, VAPID_PUBLIQUE, type TypeNotification } from "@/lib/azteque/push-config";
import { envoyer, type Abonnement } from "@/lib/azteque/web-push";

/** Ce que le client a le droit de demander. */
interface Demande {
  type: TypeNotification;
  /**
   * Le destinataire. Facultatif : pour `ami_en_ligne` comme pour
   * `appariement`, le serveur le déduit seul — des amitiés acceptées dans un
   * cas, de l'autre siège de la table dans l'autre.
   */
  vers?: string;
  /** La table concernée, pour les types qui s'y rattachent. */
  matchId?: string;
}

/** Délai minimal entre deux annonces d'arrivée d'un même joueur à ses amis. */
const REPOS_ANNONCE_AMIS_MS = 60 * 60 * 1000;

/** Au-delà, un joueur n'est plus tenu pour présent (voir `EN_LIGNE_MS`). */
const PRESENT_MS = 5 * 60 * 1000;

/** Une table tout juste créée : au-delà, l'appariement n'est plus « frais ». */
const APPARIEMENT_FRAIS_MS = 2 * 60 * 1000;

interface Composition {
  titre: string;
  corps: string;
  /** Où mène le clic sur la notification. */
  lien: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function pseudo(admin: Admin, id: string): Promise<string> {
  const { data } = await admin.from("profiles").select("username").eq("id", id).maybeSingle();
  return (data as { username?: string } | null)?.username ?? "Un joueur";
}

/**
 * Le destinataire est-il devant son écran ?
 *
 * Sert uniquement aux annonces d'amis : celui qui joue voit déjà passer le
 * message dans l'application, une notification en plus ferait doublon. Pour
 * une invitation, au contraire, on préfère le doublon à l'oubli — `last_seen_at`
 * ne dit que la dernière ouverture, pas si le téléphone est encore en main.
 */
async function present(admin: Admin, id: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("last_seen_at").eq("id", id).maybeSingle();
  const vu = (data as { last_seen_at?: string | null } | null)?.last_seen_at;
  return !!vu && Date.now() - new Date(vu).getTime() < PRESENT_MS;
}

/** Les deux joueurs de cette table, si elle existe. */
async function sieges(admin: Admin, matchId: string) {
  const { data } = await admin
    .from("matches")
    .select("host_id, guest_id, settings, created_at")
    .eq("id", matchId)
    .maybeSingle();
  return data as {
    host_id: string | null;
    guest_id: string | null;
    settings: Record<string, unknown> | null;
    created_at: string;
  } | null;
}

/**
 * Ce que l'appelant a le droit d'envoyer, et à qui.
 *
 * Rend la liste des destinataires et le message composé, ou `null` si rien ne
 * justifie cet envoi. Un `null` n'est pas une erreur à remonter au joueur :
 * c'est le cas ordinaire d'une demande qui ne correspond à rien (invitation
 * déjà répondue, table déjà close), et le silence est la bonne réponse.
 */
async function legitime(
  admin: Admin,
  moi: string,
  demande: Demande,
): Promise<{ vers: string[]; message: Composition } | null> {
  const { type, vers, matchId } = demande;

  if (type === "ami_en_ligne") {
    // Personne ne désigne les destinataires : ce sont les amis confirmés de
    // l'appelant, et lui seul peut annoncer sa propre arrivée.
    const { data: prefs } = await admin
      .from("push_preferences")
      .select("ami_annonce_at")
      .eq("user_id", moi)
      .maybeSingle();
    const derniere = (prefs as { ami_annonce_at?: string | null } | null)?.ami_annonce_at;
    if (derniere && Date.now() - new Date(derniere).getTime() < REPOS_ANNONCE_AMIS_MS) return null;

    const { data: liens } = await admin
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${moi},addressee_id.eq.${moi}`);
    const amis = ((liens as { requester_id: string; addressee_id: string }[] | null) ?? [])
      .map((l) => (l.requester_id === moi ? l.addressee_id : l.requester_id))
      .filter((id) => id !== moi);
    if (amis.length === 0) return null;

    // Le verrou est posé AVANT l'envoi : si celui-ci échoue à moitié, mieux
    // vaut une annonce manquée qu'une rafale au rechargement suivant.
    await admin
      .from("push_preferences")
      .upsert(
        { user_id: moi, ami_annonce_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    const nom = await pseudo(admin, moi);
    const eveilles: string[] = [];
    for (const ami of amis) {
      if (!(await present(admin, ami))) eveilles.push(ami);
    }
    if (eveilles.length === 0) return null;
    return {
      vers: eveilles,
      message: {
        titre: "Aztèque",
        corps: `${nom} vient de se connecter.`,
        lien: "/online",
      },
    };
  }

  if (type === "appariement") {
    // Le client ne nomme pas l'adversaire : la file d'attente ne le lui dit
    // pas. Il donne la table, et c'est l'autre siège qui désigne la cible —
    // de toute façon la seule personne qu'un appariement autorise à réveiller.
    if (!matchId) return null;
    const table = await sieges(admin, matchId);
    if (!table) return null;
    const autre =
      table.host_id === moi ? table.guest_id : table.guest_id === moi ? table.host_id : null;
    if (!autre || autre === moi) return null;
    if (vers && vers !== autre) return null;
    // Une table ancienne ne fait pas un appariement : sans cette borne, on
    // pourrait réveiller son adversaire d'hier autant de fois qu'on veut.
    if (Date.now() - new Date(table.created_at).getTime() > APPARIEMENT_FRAIS_MS) return null;
    return {
      vers: [autre],
      message: {
        titre: "Adversaire trouvé",
        corps: "Votre table est ouverte, on vous attend.",
        lien: "/online",
      },
    };
  }

  if (!vers || vers === moi) return null;

  if (type === "invitation") {
    // L'invitation doit exister, venir de l'appelant, et attendre encore.
    const { data } = await admin
      .from("game_invites")
      .select("id")
      .eq("from_id", moi)
      .eq("to_id", vers)
      .eq("status", "pending")
      .limit(1);
    if (!data || (data as unknown[]).length === 0) return null;
    const nom = await pseudo(admin, moi);
    return {
      vers: [vers],
      message: {
        titre: "Invitation à jouer",
        corps: `${nom} vous invite à une partie.`,
        lien: "/online",
      },
    };
  }

  if (type === "revanche") {
    if (!matchId) return null;
    const table = await sieges(admin, matchId);
    if (!table) return null;
    const paire = [table.host_id, table.guest_id];
    if (!paire.includes(moi) || !paire.includes(vers)) return null;
    // L'appelant doit avoir RÉELLEMENT levé la main pour la revanche.
    const revanche = (table.settings?.["rematch"] ?? null) as Record<string, unknown> | null;
    const siege = table.host_id === moi ? "host" : "guest";
    if (!revanche || revanche[siege] !== true) return null;
    const nom = await pseudo(admin, moi);
    return {
      vers: [vers],
      message: { titre: "Revanche ?", corps: `${nom} propose de rejouer.`, lien: "/online" },
    };
  }

  if (type === "message") {
    // Seule l'administration écrit aux joueurs (voir `admin_send_message`).
    const { data } = await admin.from("profiles").select("is_admin").eq("id", moi).maybeSingle();
    if ((data as { is_admin?: boolean } | null)?.is_admin !== true) return null;
    return {
      vers: [vers],
      message: {
        titre: "Message de l'administration",
        // Le corps du message n'est PAS repris : il s'ouvre dans le jeu, où
        // seul son destinataire peut le lire (voir `player_messages`).
        corps: "Vous avez reçu un message. Ouvrez Aztèque pour le lire.",
        lien: "/",
      },
    };
  }

  return null;
}

export const envoyerNotification = createServerFn({ method: "POST" })
  .middleware([requireAztequeAuth])
  .validator((data: unknown): Demande => {
    const d = (data ?? {}) as Demande;
    const types: TypeNotification[] = [
      "invitation",
      "appariement",
      "message",
      "revanche",
      "ami_en_ligne",
    ];
    if (!types.includes(d.type)) throw new Error("Type de notification inconnu.");
    return {
      type: d.type,
      ...(typeof d.vers === "string" ? { vers: d.vers } : {}),
      ...(typeof d.matchId === "string" ? { matchId: d.matchId } : {}),
    };
  })
  .handler(async ({ data, context }): Promise<{ envoyees: number }> => {
    const moi = context.userId;
    if (!moi) throw new Error("Unauthorized");

    const privee = process.env["VAPID_PRIVATE_KEY"];
    // Tant que la clé n'est pas posée, le jeu doit fonctionner sans broncher :
    // une notification manquée n'est pas une panne de partie.
    if (!privee) return { envoyees: 0 };

    const { supabaseAdmin } = await import("@/lib/azteque/admin-client.server");
    // Les tables de notification sont trop récentes pour le fichier de types,
    // régénéré à part par la plateforme : même échappatoire qu'ailleurs (voir
    // `anyTable` dans admin.ts).
    const admin = supabaseAdmin as Admin;

    const autorise = await legitime(admin, moi, data);
    if (!autorise) return { envoyees: 0 };

    const cles = { publique: VAPID_PUBLIQUE, privee, contact: VAPID_CONTACT };
    let envoyees = 0;

    for (const destinataire of autorise.vers) {
      // Chacun reste maître de ce qu'il reçoit. Pas de ligne de préférences :
      // les valeurs par défaut de la table s'appliquent, tout est accepté.
      const { data: prefs } = await admin
        .from("push_preferences")
        .select(data.type)
        .eq("user_id", destinataire)
        .maybeSingle();
      const reglage = (prefs as Record<string, unknown> | null)?.[data.type];
      if (reglage === false) continue;

      const { data: abos } = await admin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", destinataire);

      for (const abo of (abos as ({ id: number } & Abonnement)[] | null) ?? []) {
        const issue = await envoyer(
          abo,
          JSON.stringify({ ...autorise.message, type: data.type }),
          cles,
        );
        if (issue.etat === "envoye") {
          envoyees += 1;
          continue;
        }
        if (issue.etat === "perime") {
          // Le navigateur s'est désabonné : application désinstallée, cache
          // vidé, permission retirée. La ligne n'a plus d'objet.
          await admin.from("push_subscriptions").delete().eq("id", abo.id);
        }
      }
    }

    return { envoyees };
  });

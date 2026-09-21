/**
 * L'identité de ce serveur auprès des services de push.
 *
 * La clé PUBLIQUE n'est pas un secret : le navigateur doit l'avoir pour
 * s'abonner, elle part donc forcément dans le JavaScript servi. Elle vit ici
 * plutôt que dans `.env` pour la même raison que les coordonnées Supabase
 * (voir `supabase-projet.ts`) : la plateforme réécrit `.env` à chaque
 * construction, et un abonnement pris avec une clé puis servi par une autre
 * est refusé par le service de push.
 *
 * La clé PRIVÉE, elle, ne doit jamais approcher ce dépôt — et surtout pas
 * `.env`, qui est versionné volontairement dans ce projet. Elle se pose dans
 * les secrets du déploiement, sous `VAPID_PRIVATE_KEY`, et n'est lue que par
 * le code serveur (voir `push-envoi.server.ts`).
 */

/** Point non compressé P-256, 65 octets en base64url. */
export const VAPID_PUBLIQUE =
  "BBHCqWOHGFhg88Q-zF41E8aqxHj9InKO1zKGLsTidLE3-MWqqDGyVJ7L1VtlMy2cfgpNOZjlxs77kPLrhkXc7aQ";

/**
 * Qui joindre en cas d'abus. La norme VAPID l'exige : un service de push qui
 * constate un envoi massif doit pouvoir écrire à quelqu'un avant de bloquer.
 */
export const VAPID_CONTACT = "mailto:contact@azteque.app";

/** Les types de notification, et ce que chacun promet au joueur. */
export const TYPES_NOTIFICATION = {
  invitation: "Quelqu'un vous invite à jouer",
  appariement: "La file d'attente vous a trouvé un adversaire",
  message: "Un mot de l'administration",
  revanche: "Votre adversaire propose de rejouer",
  ami_en_ligne: "Un ami vient de se connecter",
} as const;

export type TypeNotification = keyof typeof TYPES_NOTIFICATION;

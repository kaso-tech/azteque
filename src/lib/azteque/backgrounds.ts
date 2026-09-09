/**
 * Les tapis : l'image du carré central où les deux joueurs posent leurs
 * cartes, seul contre l'ordinateur comme en ligne.
 *
 * Une image est ici une valeur CSS `background-image` — un empilement de
 * dégradés, ou une adresse `url()` vers un vrai fichier. Deux raisons à ce
 * choix plutôt qu'un fichier livré avec le code : l'image reste nette à toutes
 * les tailles d'écran et ne coûte pas un octet de téléchargement, et surtout
 * la console d'administration peut la modifier ou en ajouter une sans qu'il
 * faille redéployer quoi que ce soit — c'est du texte, stocké avec l'article.
 *
 * Chacun est conçu pour un tapis, pas pour une page : la lumière se tient au
 * centre, là où les cartes se posent, et les bords s'assombrissent tout
 * autour. Un tapis se pose SUR le feutre du jeu, dont il ne cache ni le grain
 * ni le liseré d'or — et surtout jamais au point de rendre une carte blanche
 * difficile à lire.
 */

/**
 * Les tapis livrés avec le jeu. La console s'en sert comme point de départ
 * pour en écrire de nouveaux ; la boutique les vend tels quels.
 */
export const BACKGROUND_PRESETS: Record<string, string> = {
  // Le soleil se lève sur la savane : un feutre chaud, vert-doré au centre et
  // terre brûlée sur les bords.
  bg_aurore: [
    "radial-gradient(ellipse 48% 34% at 50% 40%, oklch(0.86 0.14 92 / 0.42), transparent 70%)",
    "radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.55 0.14 98), oklch(0.25 0.07 70) 96%)",
  ].join(", "),

  // Fin de journée : le pourpre gagne toute la table, une braise rose tient
  // encore le milieu.
  bg_crepuscule: [
    "radial-gradient(ellipse 46% 32% at 50% 40%, oklch(0.62 0.18 350 / 0.55), transparent 70%)",
    "radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.43 0.16 322), oklch(0.2 0.08 308) 96%)",
  ].join(", "),

  // Nuit claire : un feutre bleu nuit, et quelques étoiles au-dessus. Les
  // points sont posés un à un — un motif répété demanderait une taille de
  // fond, et l'article ne porte qu'une seule valeur.
  bg_nuit: [
    "radial-gradient(2px 2px at 14% 12%, oklch(0.98 0.02 95 / 0.9), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 29% 24%, oklch(0.96 0.03 95 / 0.75), transparent 60%)",
    "radial-gradient(2.5px 2.5px at 45% 9%, oklch(0.99 0.02 95 / 0.85), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 64% 19%, oklch(0.96 0.03 95 / 0.7), transparent 60%)",
    "radial-gradient(2px 2px at 82% 11%, oklch(0.98 0.02 95 / 0.85), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 90% 28%, oklch(0.95 0.03 95 / 0.65), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 11% 78%, oklch(0.95 0.03 95 / 0.6), transparent 60%)",
    "radial-gradient(2px 2px at 88% 84%, oklch(0.97 0.02 95 / 0.65), transparent 60%)",
    "radial-gradient(ellipse 50% 36% at 50% 42%, oklch(0.48 0.13 258 / 0.55), transparent 72%)",
    "radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.33 0.11 262), oklch(0.15 0.06 268) 96%)",
  ].join(", "),

  // Trois anneaux d'or concentriques autour de la pioche, sur un vert profond :
  // le tapis des grands soirs, celui qu'on achète en dernier.
  bg_or: [
    "radial-gradient(ellipse 28% 20% at 50% 42%, oklch(0.86 0.15 88 / 0.42), transparent 62%)",
    "radial-gradient(ellipse 50% 36% at 50% 42%, oklch(0.72 0.13 82 / 0.26), transparent 70%)",
    "radial-gradient(ellipse 76% 56% at 50% 42%, oklch(0.6 0.1 76 / 0.16), transparent 78%)",
    "radial-gradient(ellipse 128% 112% at 50% 46%, oklch(0.47 0.13 152), oklch(0.19 0.06 152) 96%)",
  ].join(", "),
};

/** Longueur au-delà de laquelle une valeur n'est plus une image mais un abus. */
const LONGUEUR_MAX = 4000;

/**
 * Refuse ce qui n'a rien à faire dans un `background-image`.
 *
 * La valeur vient de la console, donc d'un administrateur — mais elle traverse
 * la base et atterrit dans le style d'un élément chez tous les joueurs, et une
 * faute de frappe ne doit pas pouvoir devenir autre chose qu'un fond raté. Le
 * navigateur écarte déjà ce qu'il ne sait pas lire (React pose la valeur par
 * le CSSOM, qui n'accepte qu'un `background-image` et rien d'autre) ; il reste
 * à écarter les adresses qui feraient sortir le joueur du site.
 */
export function sanitizeBackground(css: string | null | undefined): string | null {
  const valeur = (css ?? "").trim();
  if (!valeur || valeur.length > LONGUEUR_MAX) return null;
  const bas = valeur.toLowerCase();
  if (bas.includes("javascript:") || bas.includes("expression(") || bas.includes("@import")) {
    return null;
  }
  // Un chevron n'a aucun sens dans une valeur CSS : sa présence signale une
  // valeur qui n'en est pas une.
  if (valeur.includes("<") || valeur.includes(">")) return null;
  // Seules les images servies en clair, embarquées, ou tirées du site
  // lui-même : pas de requête vers un hôte en http, ni de schéma exotique.
  for (const [, adresse] of valeur.matchAll(/url\(\s*['"]?([^'")]*)/gi)) {
    const cible = (adresse ?? "").trim().toLowerCase();
    // `//hôte/image.png` commence bien par une barre, mais désigne un autre
    // site : un chemin du nôtre n'en porte qu'une.
    const duSite = cible.startsWith("/") && !cible.startsWith("//");
    const permise = cible.startsWith("https://") || cible.startsWith("data:image/") || duSite;
    if (!permise) return null;
  }
  return valeur;
}

/** Le fond d'un article, prêt à poser, ou `null` s'il n'en porte pas. */
export function backgroundImage(css: string | null | undefined, id?: string): string | null {
  // La valeur enregistrée fait foi ; le préréglage du code ne sert que si la
  // base n'en tient pas — article d'origine, migration en retard, hors ligne.
  return sanitizeBackground(css) ?? sanitizeBackground(id ? BACKGROUND_PRESETS[id] : null);
}

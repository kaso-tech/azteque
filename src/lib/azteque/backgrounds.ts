/**
 * Les fonds du salon : l'image qui se pose sur le halo central de l'accueil,
 * derrière le titre et les boutons.
 *
 * Une image est ici une valeur CSS `background-image` — un empilement de
 * dégradés, ou une adresse `url()` vers un vrai fichier. Deux raisons à ce
 * choix plutôt qu'un fichier livré avec le code : l'image reste nette à toutes
 * les tailles d'écran et ne coûte pas un octet de téléchargement, et surtout
 * la console d'administration peut la modifier ou en ajouter une sans qu'il
 * faille redéployer quoi que ce soit — c'est du texte, stocké avec l'article.
 *
 * Chaque fond s'éteint sur ses bords : c'est un halo posé sur le feutre, pas
 * une bâche qui le recouvre.
 */

/**
 * Les fonds livrés avec le jeu. La console s'en sert comme point de départ
 * pour en écrire de nouveaux ; la boutique les vend tels quels.
 */
export const BACKGROUND_PRESETS: Record<string, string> = {
  // Le soleil se lève sur le fleuve : l'or se tient haut, derrière le titre,
  // et le bas de l'écran s'assombrit pour que le menu garde son relief.
  bg_aurore: [
    "radial-gradient(ellipse 58% 28% at 50% 12%, oklch(0.93 0.15 90 / 0.32), transparent 72%)",
    "radial-gradient(ellipse 100% 42% at 50% 0%, oklch(0.76 0.17 55 / 0.24), transparent 76%)",
    "radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.22 0.07 145 / 0.5), transparent 72%)",
  ].join(", "),

  // Fin de journée : le pourpre tient le haut, une braise orangée traîne
  // encore à hauteur d'horizon.
  bg_crepuscule: [
    "radial-gradient(ellipse 56% 27% at 50% 13%, oklch(0.72 0.19 350 / 0.32), transparent 70%)",
    "radial-gradient(ellipse 105% 45% at 50% 0%, oklch(0.5 0.2 300 / 0.3), transparent 76%)",
    "radial-gradient(ellipse 120% 40% at 50% 52%, oklch(0.72 0.16 42 / 0.16), transparent 74%)",
    "radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.2 0.07 300 / 0.5), transparent 72%)",
  ].join(", "),

  // Nuit claire : la voûte bleuit et quelques étoiles s'allument. Les points
  // sont posés un à un — un motif répété demanderait une taille de fond, et
  // l'article ne porte qu'une seule valeur.
  bg_nuit: [
    "radial-gradient(2px 2px at 17% 14%, oklch(0.98 0.02 95 / 0.95), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 31% 27%, oklch(0.96 0.03 95 / 0.8), transparent 60%)",
    "radial-gradient(2.5px 2.5px at 46% 11%, oklch(0.99 0.02 95 / 0.9), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 63% 22%, oklch(0.96 0.03 95 / 0.75), transparent 60%)",
    "radial-gradient(2px 2px at 78% 9%, oklch(0.98 0.02 95 / 0.9), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 87% 30%, oklch(0.95 0.03 95 / 0.7), transparent 60%)",
    "radial-gradient(1.5px 1.5px at 24% 39%, oklch(0.95 0.03 95 / 0.6), transparent 60%)",
    "radial-gradient(2px 2px at 70% 41%, oklch(0.97 0.02 95 / 0.7), transparent 60%)",
    "radial-gradient(ellipse 70% 34% at 50% 12%, oklch(0.5 0.14 265 / 0.4), transparent 72%)",
    "radial-gradient(ellipse 130% 52% at 50% 0%, oklch(0.24 0.09 275 / 0.55), transparent 76%)",
    "radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.16 0.06 275 / 0.55), transparent 72%)",
  ].join(", "),

  // Trois anneaux d'or concentriques : le fond des grands soirs, celui qu'on
  // achète en dernier.
  bg_or: [
    "radial-gradient(ellipse 46% 22% at 50% 14%, oklch(0.9 0.16 88 / 0.3), transparent 62%)",
    "radial-gradient(ellipse 68% 34% at 50% 14%, oklch(0.76 0.14 78 / 0.2), transparent 70%)",
    "radial-gradient(ellipse 96% 48% at 50% 14%, oklch(0.6 0.1 70 / 0.14), transparent 78%)",
    "radial-gradient(ellipse 130% 60% at 50% 108%, oklch(0.22 0.07 145 / 0.5), transparent 72%)",
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

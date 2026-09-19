/**
 * Où poser une bulle de discussion sans qu'elle déborde de l'écran.
 *
 * Les bulles sont ancrées sous l'avatar de leur auteur et centrées sur lui.
 * Or un avatar se tient près du bord — c'est même sa place, un de chaque côté
 * de l'en-tête. Une bulle un peu longue, centrée là, sortait donc de l'écran
 * par la gauche ou par la droite, et le téléphone en coupait la moitié.
 *
 * On ramène donc son centre dans la bande où une bulle de largeur maximale
 * tient tout entière. Une bulle courte s'en trouve parfois décalée de quelques
 * pixels vers l'intérieur, ce qui ne se remarque pas ; une bulle longue cesse
 * d'être tronquée, ce qui se remarquait beaucoup.
 */

/** Largeur maximale d'une bulle, en pixels. Doit suivre la classe `max-w`. */
export const LARGEUR_BULLE_MAX = 272;

/** Ce qu'on laisse entre la bulle et le bord de l'écran. */
export const MARGE_BULLE = 12;

export function centreBulle(
  centreVoulu: number,
  largeurEcran: number,
  largeurMax: number = LARGEUR_BULLE_MAX,
  marge: number = MARGE_BULLE,
): number {
  const demie = Math.min(largeurMax, Math.max(0, largeurEcran - 2 * marge)) / 2;
  const min = marge + demie;
  const max = largeurEcran - marge - demie;
  // Écran plus étroit que la bulle elle-même : on la centre, faute de mieux.
  if (min > max) return largeurEcran / 2;
  return Math.min(Math.max(centreVoulu, min), max);
}

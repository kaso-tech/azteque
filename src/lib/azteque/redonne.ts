/**
 * L'annonce d'une redistribution pour main blanche.
 *
 * Une redonne change les cartes des DEUX joueurs, alors qu'un seul l'a
 * demandée. Sans annonce, celui qui la subit voit sa main remplacée sans un
 * mot : au mieux une ligne dans le journal, qu'on ne lit pas en pleine donne.
 * Une redonne muette ne se distingue pas d'une anomalie — ou d'une tricherie.
 *
 * D'où deux temps : on annonce, on laisse lire, puis on redistribue. Ce
 * fichier ne contient que ce que les deux bouts doivent partager, sans rien
 * du serveur — la table solo s'en sert aussi, pour la main blanche de
 * l'ordinateur.
 */

/** Le temps laissé à l'adversaire pour lire l'annonce avant la redonne. */
export const DELAI_ANNONCE_REDONNE = 4000;

/** L'annonce en cours, posée dans `settings` entre les deux temps. */
export interface AnnonceRedonne {
  /** Le siège qui l'a demandée. */
  par: "host" | "guest";
  /** Son pseudo au moment de la demande, pour l'afficher sans relecture. */
  nom: string;
  /** Date de l'annonce (ISO) : la redonne n'a lieu qu'après le délai. */
  at: string;
}

/**
 * L'instant où la redonne devient recevable.
 *
 * Partagée entre le compte à rebours affiché et le contrôle du serveur, pour
 * qu'ils ne puissent pas diverger. Une annonce dont la date est illisible est
 * tenue pour mûre : mieux vaut redistribuer aussitôt que laisser la donne
 * gelée sur une valeur qu'on ne sait pas lire.
 */
export function redonneEcheance(annonce: AnnonceRedonne): number {
  const pose = new Date(annonce.at).getTime();
  return Number.isNaN(pose) ? -Infinity : pose + DELAI_ANNONCE_REDONNE;
}

/**
 * L'historique des comptes annoncés, et ce qu'on en affiche.
 *
 * Deux lectures cohabitent, et les confondre est l'erreur naturelle :
 *
 * — Le COMPTEUR, sur le bouton de la table, ne porte que sur le tour en
 *   cours. Un compte se marque pour la manche où il est annoncé et repart de
 *   zéro à la donne suivante : c'est le total du tour qui dit où en est le
 *   joueur.
 *
 * — L'HISTORIQUE, lui, garde tous les tours du champ, chaque ligne portant
 *   son numéro de tour. C'est son objet.
 *
 * Les deux tables — contre l'IA et en ligne — tenaient le même historique
 * mais sommaient le champ entier sur le bouton. Après deux ou trois tours, il
 * annonçait un chiffre qui ne correspondait à rien de ce qui se joue, et rien
 * ne le signalait : un total faux reste un nombre plausible. D'où ce calcul
 * mis à part, et éprouvé.
 */
import type { PlayerIndex } from "@/lib/azteque/engine";

/** Un compte annoncé, tel que les deux tables le retiennent. */
export interface LigneDeCompte {
  /** Identifiant stable : `tour-joueur-couleur-type`, pour ne rien compter deux fois. */
  key: string;
  /** Numéro de tour AFFICHÉ (le premier tour porte 1, pas 0). */
  round: number;
  player: PlayerIndex;
  label: string;
  points: number;
}

/**
 * Ce qu'un joueur a marqué en comptes sur UN tour.
 *
 * `tour` est le numéro affiché, celui que portent les lignes — le tour en
 * cours vaut donc `manche + 1` là où les manches se comptent à partir de zéro.
 */
export function totalDuTour(
  lignes: readonly LigneDeCompte[],
  joueur: PlayerIndex,
  tour: number,
): number {
  return lignes
    .filter((l) => l.player === joueur && l.round === tour)
    .reduce((somme, l) => somme + l.points, 0);
}

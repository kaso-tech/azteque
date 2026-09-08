import type { GameState } from "./engine";
import type { MatchAction } from "./match-actions";

/**
 * Politique de renvoi différé des coups, pour le jeu en ligne sur connexion
 * faible.
 *
 * Quand le réseau ne parvient pas à transmettre une action, on la garde pour
 * la renvoyer à son retour plutôt que de l'abandonner sans un mot — c'est ce
 * qui donnait l'impression d'une table figée : le joueur posait sa carte, rien
 * ne partait, et il ne lui restait qu'à rejouer de lui-même, s'il comprenait
 * qu'il le fallait.
 *
 * Ce renvoi demande deux précautions, et elles sont ici pour être éprouvées :
 * ne garder que les actions qui expriment l'intention du joueur, et ne les
 * renvoyer que si la position n'a pas bougé entre-temps.
 */

/**
 * Les actions qu'on garde pour les renvoyer.
 *
 * Les automatiques (résolution de pli, pioche, première donne) se redéduisent
 * de l'état et repartiront d'elles-mêmes. L'abandon, lui, ne doit JAMAIS être
 * rejoué en différé : il tuerait une partie entre-temps reprise. Les mises se
 * négocient dans un panneau ouvert, où le joueur est là pour réessayer.
 */
export const REJOUABLES: MatchAction["type"][] = [
  "play_card",
  "announce",
  "skip_announce",
  "ready_next_round",
];

export function estRejouable(action: MatchAction): boolean {
  return REJOUABLES.includes(action.type);
}

/**
 * Signature de la POSITION, pour ne renvoyer un coup que s'il a toujours le
 * sens qu'il avait au moment où le joueur l'a voulu.
 *
 * Sans elle, le renvoi différé serait dangereux : une carte dont l'envoi a
 * échoué, rejouée une minute plus tard alors que le pli a tourné, pourrait
 * être parfaitement LÉGALE et pourtant n'avoir jamais été voulue là — le
 * serveur l'accepterait, et le joueur verrait partir une carte qu'il gardait.
 *
 * On retient donc tout ce qui, en changeant, change le sens d'un coup : la
 * phase, à qui le tour, l'avancement du pli et de la pioche, la taille des
 * deux mains, et la fenêtre d'annonce. Le serveur reste le juge en dernier
 * ressort — cette signature ne le remplace pas, elle évite de lui soumettre
 * une intention devenue caduque.
 */
export function positionSignature(s: GameState | null): string {
  if (!s) return "";
  return [
    s.phase,
    s.turn,
    s.trick.length,
    s.drawPending.length,
    s.stock.length,
    s.hands[0].length,
    s.hands[1].length,
    s.canAnnounce ?? "-",
  ].join("|");
}

/** Vrai si le coup gardé a toujours le sens qu'il avait au départ. */
export function peutEtreRenvoye(
  garde: { action: MatchAction; position: string } | null,
  positionActuelle: string,
): boolean {
  if (!garde) return false;
  return estRejouable(garde.action) && garde.position === positionActuelle;
}

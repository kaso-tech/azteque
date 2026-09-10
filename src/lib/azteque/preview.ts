import { announce, playCard, type GameState, type PlayerIndex } from "./engine";
import type { MatchAction } from "./match-actions";

/**
 * Ce que le serveur va faire de l'action — calculé tout de suite, à l'écran.
 *
 * En ligne, le client n'est pas juge : il envoie l'action, le serveur la
 * rejoue et renvoie l'état qui fait foi. Mais attendre cet aller-retour pour
 * bouger quoi que ce soit rend la table poisseuse — le joueur pose sa carte,
 * elle reste dans sa main un temps qui ne dépend que du réseau, puis saute sur
 * le tapis quand la réponse arrive, souvent une fois l'animation de vol déjà
 * terminée. Le geste et son effet ne se rejoignent jamais.
 *
 * On rejoue donc l'action ICI, sur les MÊMES fonctions pures que le serveur
 * (voir le `switch` de match-actions.ts, dont celui-ci est le miroir), à seule
 * fin d'afficher le coup sans attendre. La réponse du serveur écrase ensuite
 * cet aperçu, et un envoi qui échoue le reprend : rien de ce qui est calculé
 * ici ne devient jamais la vérité de la partie.
 *
 * Le contrat est celui du moteur : une action illégale renvoie l'état inchangé
 * — on renvoie alors `null`, et l'appelant n'affiche rien par avance plutôt
 * que de deviner. Seules les actions qui expriment l'intention du joueur sont
 * couvertes ; les automatiques (résolution de pli, pioche) ont déjà leur
 * propre traitement, animé à part.
 */
export function previewAction(
  state: GameState,
  me: PlayerIndex,
  action: MatchAction,
): GameState | null {
  switch (action.type) {
    case "play_card": {
      const next = playCard(state, me, action.cardId);
      return next === state ? null : next;
    }
    case "announce": {
      const next = announce(state, me, action.suits, action.trump);
      return next === state ? null : next;
    }
    case "skip_announce":
      if (state.phase !== "playing" || state.canAnnounce !== me) return null;
      return { ...state, canAnnounce: null };
    default:
      return null;
  }
}

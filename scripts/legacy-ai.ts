/**
 * Copie figée de l'IA d'avant la refonte de septembre 2026.
 * Sert uniquement d'étalon au banc d'essai : ne pas utiliser en jeu.
 */
import {
  RANKS,
  aiAnnounce,
  aiChooseCard,
  availableMelds,
  beats,
  isBonne,
  legalCards,
  rankValue,
  unseenCards,
  type Card,
  type Difficulty,
  type GameState,
  type PlayerIndex,
  type Rank,
  type Suit,
} from "../src/lib/azteque/engine";

/**
 * Annonce réfléchie : aux niveaux élevés, l'IA diffère la première annonce
 * tant qu'elle garde des bonnes (10 / As) dans d'autres couleurs, car fixer
 * l'atout rendrait ces bonnes vulnérables. Elle attend d'avoir libéré ces
 * bonnes, sauf si la pioche s'épuise (dernière occasion d'annoncer).
 */
export function legacyAnnounceAt(
  state: GameState,
  level: Difficulty,
): { suits: Suit[]; trump: Suit | null } | null {
  const base = aiAnnounce(state);
  if (!base) return null;
  if (level !== "maitre" && level !== "legende") return base;

  // L'atout est déjà fixé : plus rien à optimiser, on encaisse les points.
  if (state.trump !== null || !base.trump) return base;

  const loose = state.hands[1].filter((c) => isBonne(c) && c.suit !== base.trump);
  if (loose.length === 0) return base;

  // Nombre approximatif de plis restants avant l'épuisement de la pioche.
  const tricksLeft = Math.floor(state.stock.length / 2);
  // Assez de temps pour écouler ces bonnes en toute sécurité : on patiente.
  if (tricksLeft > loose.length + 1) return null;
  return base;
}

/** Probabilité approximative que l'adversaire puisse battre `c` s'il est second. */

function beatRisk(state: GameState, c: Card): number {
  const pool = unseenCards(state);
  if (!pool.length) return 0;
  const oppSize = state.hands[0].length;
  const inHandRatio = Math.min(1, oppSize / pool.length);
  const beaters = pool.filter((x) => beats(x, c, state.trump)).length;
  const pPerCard = beaters / pool.length;
  return 1 - Math.pow(1 - pPerCard, Math.max(1, Math.round(inHandRatio * oppSize)));
}

/* --- Fin de tour : résolution exacte quand la pioche est vide --- */

interface EndNode {
  ai: Card[];
  hu: Card[];
  lead: PlayerIndex;
  led: Card | null;
}

function endgameValue(node: EndNode, trump: Suit | null, depth: number): number {
  if (node.ai.length === 0 && node.hu.length === 0) return 0;
  const mover: PlayerIndex = node.led === null ? node.lead : node.lead === 0 ? 1 : 0;
  const hand = mover === 1 ? node.ai : node.hu;
  const options = endgameLegal(hand, node.led, trump);
  let best = mover === 1 ? -Infinity : Infinity;
  for (const c of options) {
    const rest = hand.filter((x) => x !== c);
    let v: number;
    if (node.led === null) {
      v = endgameValue(
        {
          ai: mover === 1 ? rest : node.ai,
          hu: mover === 1 ? node.hu : rest,
          lead: node.lead,
          led: c,
        },
        trump,
        depth + 1,
      );
    } else {
      const winner: PlayerIndex = beats(c, node.led, trump) ? mover : node.lead;
      const pts = [node.led, c].filter(isBonne).length * (winner === 1 ? 1 : -1);
      v =
        pts +
        endgameValue(
          {
            ai: mover === 1 ? rest : node.ai,
            hu: mover === 1 ? node.hu : rest,
            lead: winner,
            led: null,
          },
          trump,
          depth + 1,
        );
    }
    if (mover === 1) best = Math.max(best, v);
    else best = Math.min(best, v);
  }
  return best === -Infinity || best === Infinity ? 0 : best;
}

function endgameLegal(hand: Card[], led: Card | null, trump: Suit | null): Card[] {
  if (!led) return hand;
  const same = hand.filter((c) => c.suit === led.suit);
  if (same.length === 0) {
    const trumps = trump ? hand.filter((c) => c.suit === trump) : [];
    return trumps.length ? trumps : hand;
  }
  const winning = same.filter((c) => beats(c, led, trump));
  if (winning.length) return winning;
  const sorted = [...same].sort((x, y) => rankValue(y.rank) - rankValue(x.rank));
  const top = sorted[0]!;
  if (isBonne(top) && sorted.length > 1) return [top, sorted[1]!];
  return [top];
}

function endgameBest(state: GameState): Card | null {
  if (state.stock.length > 0) return null;
  const hu = unseenCards(state).slice(0, state.hands[0].length);
  if (hu.length !== state.hands[0].length) return null;
  const ai = state.hands[1];
  if (ai.length > 6) return null;
  const led = state.trick.length ? state.trick[0]!.card : null;
  const lead: PlayerIndex = state.trick.length ? state.trick[0]!.player : 1;
  const options = endgameLegal(ai, led, state.trump);
  let best: Card | null = null;
  let bestV = -Infinity;
  for (const c of options) {
    const rest = ai.filter((x) => x !== c);
    let v: number;
    if (!led) {
      v = endgameValue({ ai: rest, hu, lead: 1, led: c }, state.trump, 0);
    } else {
      const winner: PlayerIndex = beats(c, led, state.trump) ? 1 : lead;
      const pts = [led, c].filter(isBonne).length * (winner === 1 ? 1 : -1);
      v = pts + endgameValue({ ai: rest, hu, lead: winner, led: null }, state.trump, 0);
    }
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/* --- IA avancée (maître / légende) --- */

/** Valeur de conservation d'une carte pour un compte encore possible. */
function meldValue(state: GameState, c: Card): number {
  if (state.stock.length === 0) return 0; // plus d'annonce possible en phase finale
  if (c.rank !== "K" && c.rank !== "Q" && c.rank !== "J") return 0;
  if (state.melds[1].some((m) => m.suit === c.suit && m.type === "triple")) return 0;
  const hand = state.hands[1];
  const has = (r: Rank) => hand.some((x) => x.suit === c.suit && x.rank === r && x.id !== c.id);
  const announced = state.melds[1].some((m) => m.suit === c.suit);
  if (c.rank === "J") {
    // Le valet ne vaut que s'il complète un compte simple annoncé ou en main
    if (announced) return 2.2;
    return has("K") && has("Q") ? 2.6 : 0.4;
  }
  const partner: Rank = c.rank === "K" ? "Q" : "K";
  if (announced) return 0; // K/Q déjà posés : ils ne rapportent plus rien de neuf
  if (has(partner)) return has("J") ? 3.4 : 2.8;
  return 0.9; // espoir de retrouver le partenaire à la pioche
}

/** Valeur d'un atout gardé pour la phase finale (pioche épuisée). */
function trumpKeepValue(state: GameState, c: Card): number {
  const trump = state.trump;
  if (!trump || c.suit !== trump) return 0;
  const stock = state.stock.length;
  if (stock === 0) return 0; // la phase finale est là : les atouts servent
  const strength = rankValue(c.rank) / (RANKS.length - 1); // 0 → 1
  const urgency = Math.min(1, stock / 10);
  return (0.8 + strength * 2.2) * urgency;
}

function aiSmartCard(state: GameState, deep: boolean): Card {
  const legal = legalCards(state, 1);
  if (legal.length === 1) return legal[0]!;
  const trump = state.trump;

  if (deep) {
    const exact = endgameBest(state);
    if (exact) return exact;
  }

  const val = (c: Card) => rankValue(c.rank) + (trump && c.suit === trump ? 10 : 0);
  // Coût total de la carte si on s'en sépare
  const keep = (c: Card) => meldValue(state, c) + trumpKeepValue(state, c) + (isBonne(c) ? 3 : 0);
  const cheapest = (pool: Card[]) =>
    [...pool].sort((a, b) => keep(a) - keep(b) || val(a) - val(b))[0]!;

  // En second : décider si le pli vaut la dépense
  if (state.trick.length === 1) {
    const led = state.trick[0]!.card;
    const winning = legal.filter((c) => beats(c, led, trump));
    const stake = isBonne(led) ? 1 : 0;
    const tenTrump = trump && led.rank === "10" && led.suit === trump;
    if (winning.length) {
      const cheapWin = cheapest(winning);
      const cost = keep(cheapWin);
      // Gain espéré : bonne adverse capturée, 10 d'atout, ou pli gratuit
      const gain = (stake ? 3 : 0) + (tenTrump ? 4 : 0) + (cost < 0.8 ? 1 : 0);
      if (gain >= cost) return cheapWin;
      const dump = legal.filter((c) => keep(c) < cost);
      if (dump.length) return cheapest(dump);
      return cheapWin;
    }
    return cheapest(legal);
  }

  // À l'entame : jouer la carte la plus sûre / la plus gênante
  const scored = legal.map((c) => {
    const risk = beatRisk(state, c);
    const isB = isBonne(c);
    // On veut : peu de risque de perdre une bonne, et forcer l'adversaire à se défausser
    let score = (1 - risk) * (isB ? 2.2 : 1);
    if (isB && risk > 0.35) score -= 2.5; // ne pas exposer une bonne
    score -= trumpKeepValue(state, c) * 0.9; // garder les atouts pour la phase finale
    score -= meldValue(state, c) * 1.1; // garder les cartes utiles à un compte
    if (!isB && risk > 0.6) score += 0.35; // écarter les cartes faibles utiles à rien
    // Sortir tôt les bonnes hors atout tant que l'atout n'est pas fixé
    if (isB && !trump && risk < 0.3) score += 0.8;
    if (isB && trump && c.suit !== trump && state.stock.length > 4 && risk < 0.25) score += 0.5;
    score -= rankValue(c.rank) * 0.02;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.c;
}

export function legacyChooseCardAt(state: GameState, level: Difficulty): Card {
  const legal = legalCards(state, 1);
  if (level === "facile") {
    // Joue presque au hasard, protège rarement ses bonnes
    if (Math.random() < 0.7) return legal[Math.floor(Math.random() * legal.length)]!;
    return aiChooseCard(state);
  }
  if (level === "normal") {
    if (Math.random() < 0.25) return legal[Math.floor(Math.random() * legal.length)]!;
    return aiChooseCard(state);
  }
  if (level === "maitre") return aiSmartCard(state, false);
  if (level === "legende") return aiSmartCard(state, true);
  // Expert : heuristique complète + conservation des atouts forts en début de tour
  const trump = state.trump;
  if (state.trick.length === 0 && trump && state.stock.length > 2) {
    const offTrump = legal.filter((c) => c.suit !== trump && !isBonne(c));
    if (offTrump.length)
      return [...offTrump].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0]!;
  }
  return aiChooseCard(state);
}

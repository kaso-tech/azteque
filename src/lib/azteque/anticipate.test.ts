import { describe, expect, it } from "vitest";
import {
  anticipate,
  canAnticipate,
  isBonne,
  type Card,
  type GameState,
  type Rank,
  type Suit,
} from "./engine";

let cardId = 0;
function card(rank: Rank, suit: Suit): Card {
  return { id: `a${cardId++}`, rank, suit };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    stock: [],
    hands: [[], []],
    gains: [[], []],
    melds: [[], []],
    exposed: [[], []],
    trump: null,
    trick: [],
    leader: 0,
    turn: 0,
    dealer: 1,
    canAnnounce: null,
    drawPending: [],
    pendingUpgrade: [null, null],
    lastTrickWinner: null,
    phase: "playing",
    roundsWon: [0, 0],
    roundScore: null,
    roundWinner: null,
    champWinner: null,
    instantWin: false,
    pont: false,
    log: [],
    ...overrides,
  };
}

describe("canAnticipate", () => {
  it("s'ouvre au joueur qui est en main, pli vide", () => {
    const s = makeState({ turn: 0, hands: [[card("A", "S")], [card("7", "H")]] });
    expect(canAnticipate(s, 0)).toBe(true);
    expect(canAnticipate(s, 1)).toBe(false);
  });

  it("se ferme une fois une carte posée au milieu", () => {
    const s = makeState({
      turn: 0,
      trick: [{ player: 1, card: card("K", "D") }],
      hands: [[card("A", "S")], []],
    });
    expect(canAnticipate(s, 0)).toBe(false);
  });

  it("se ferme tant qu'une pioche est due", () => {
    const s = makeState({ turn: 0, drawPending: [0], stock: [card("9", "C")] });
    expect(canAnticipate(s, 0)).toBe(false);
  });

  it("se ferme hors de la phase de jeu", () => {
    const s = makeState({ turn: 0, phase: "roundEnd" });
    expect(canAnticipate(s, 0)).toBe(false);
  });

  it("se ferme si le joueur n'a plus de carte à jouer", () => {
    const s = makeState({ turn: 0, hands: [[], [card("7", "H")]] });
    expect(canAnticipate(s, 0)).toBe(false);
  });
});

describe("anticipate", () => {
  it("livre à l'adversaire les bonnes de la main ET celles du talon", () => {
    const s = makeState({
      turn: 0,
      hands: [
        [card("A", "S"), card("10", "H"), card("K", "D")],
        [card("7", "C"), card("8", "C")],
      ],
      stock: [card("A", "C"), card("9", "D"), card("10", "S")],
      gains: [[card("A", "H"), card("7", "S")], []],
    });

    const n = anticipate(s, 0);

    // Les quatre bonnes cachées (2 en main, 2 au talon) rejoignent le tas adverse.
    expect(n.gains[1].filter(isBonne).length).toBe(4);
    // Le tas déjà encaissé n'est pas touché : seul ce qui est encore caché part.
    expect(n.gains[0].filter(isBonne).length).toBe(1);
    // Le tour étant clos, mains et talon sont vidés : plus rien ne traîne
    // qu'un décompte pourrait compter deux fois.
    expect(n.hands[0].some(isBonne)).toBe(false);
    expect(n.stock.some(isBonne)).toBe(false);
    // Total conservé : les quatre bonnes cédées et celle déjà encaissée sont
    // exactement les cinq du départ, aucune n'a été créée ni perdue.
    expect(n.gains[0].filter(isBonne).length + n.gains[1].filter(isBonne).length).toBe(5);
  });

  it("ne crédite pas à l'anticipateur les bonnes de l'adversaire", () => {
    const s = makeState({
      turn: 1,
      // L'adversaire garde un As en main : il n'a rien encaissé, et cet As ne
      // doit profiter à personne — seules les bonnes DU tas comptent.
      hands: [[card("A", "D")], [card("10", "C")]],
      stock: [card("A", "S")],
    });

    const n = anticipate(s, 1);

    // Le 10 de sa main et l'As du talon partent chez l'adversaire.
    expect(n.gains[0].filter(isBonne).length).toBe(2);
    // L'anticipateur, lui, n'encaisse rien.
    expect(n.gains[1].filter(isBonne).length).toBe(0);
    expect(n.roundScore![0].bonnes).toBe(2);
  });

  it("clôt le tour et le compte", () => {
    const s = makeState({
      turn: 0,
      hands: [[card("A", "S")], [card("7", "H")]],
      gains: [[card("A", "H"), card("10", "H")], []],
      lastTrickWinner: 0,
    });

    const n = anticipate(s, 0);

    expect(n.phase).not.toBe("playing");
    expect(n.roundScore).not.toBeNull();
    // 2 bonnes encaissées, et rien de plus : la main part avec l'As abandonné.
    expect(n.roundScore![0].total).toBe(2);
    expect(n.roundScore![1].total).toBe(2);
    // Égalité : celui qui menait perd le point de la main en arrêtant le tour.
    expect(n.roundWinner).toBeNull();
  });

  it("verse la main à l'adversaire, même à celui qui menait les plis", () => {
    // Le dernier pli n'a pas été joué : personne ne l'a remporté, et celui
    // qui renonce à le disputer ne peut pas en encaisser le point.
    const s = makeState({
      turn: 0,
      hands: [[card("7", "H")], [card("8", "C")]],
      lastTrickWinner: 0,
    });

    const n = anticipate(s, 0);

    expect(n.roundScore![0].main).toBe(0);
    expect(n.roundScore![1].main).toBe(1);
    // Et c'est donc l'adversaire qui distribuera la donne suivante, la donne
    // revenant à qui tient la main (voir resolveReadyNextRound).
    expect(n.lastTrickWinner).toBe(1);
  });

  it("peut faire perdre celui qui anticipe : les bonnes livrées comptent", () => {
    const s = makeState({
      turn: 0,
      // Deux bonnes encaissées, mais trois encore en main : les livrer renverse
      // le tour. C'est tout l'enjeu du bouton — il se paie.
      hands: [[card("A", "S"), card("A", "D"), card("10", "C")], [card("7", "H")]],
      gains: [[card("A", "H"), card("10", "H")], []],
      lastTrickWinner: 0,
    });

    const n = anticipate(s, 0);

    expect(n.roundScore![0].total).toBe(2);
    // 3 bonnes reçues, plus la main abandonnée.
    expect(n.roundScore![1].total).toBe(4);
    expect(n.roundWinner).toBe(1);
  });

  it("ne permet pas d'escamoter la carte déjà engagée par l'adversaire", () => {
    // Le trou que ferme `canAnticipate` : l'adversaire mène son 10 d'atout,
    // le joueur ne peut pas le battre, et il arrêtait le tour pour faire
    // disparaître cette carte du jeu — elle ne revenait alors à personne,
    // alors qu'elle était engagée.
    const dixAtout = card("10", "S");
    const s = makeState({
      trump: "S",
      turn: 1,
      trick: [{ player: 0, card: dixAtout }],
      hands: [[card("7", "H")], [card("8", "H"), card("A", "C")]],
    });

    expect(canAnticipate(s, 1)).toBe(false);
    expect(anticipate(s, 1)).toBe(s);
    // La carte est toujours au milieu, le tour continue.
    expect(s.trick).toHaveLength(1);
    expect(s.phase).toBe("playing");
  });

  it("refuse d'agir quand l'anticipation n'est pas ouverte", () => {
    const s = makeState({ turn: 1, hands: [[card("A", "S")], [card("7", "H")]] });
    expect(anticipate(s, 0)).toBe(s);
  });

  it("ne modifie pas l'état reçu", () => {
    const s = makeState({
      turn: 0,
      hands: [[card("A", "S")], [card("7", "H")]],
      stock: [card("10", "D")],
    });
    const avant = JSON.stringify(s);

    anticipate(s, 0);

    expect(JSON.stringify(s)).toBe(avant);
  });
});

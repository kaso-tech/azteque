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
    // Rien ne reste à prendre là où c'était caché.
    expect(n.hands[0].some(isBonne)).toBe(false);
    expect(n.stock.some(isBonne)).toBe(false);
    // Les cartes sans valeur restent où elles étaient.
    expect(n.hands[0].map((c) => c.rank)).toEqual(["K"]);
    expect(n.stock.map((c) => c.rank)).toEqual(["9"]);
  });

  it("laisse intactes les bonnes de l'adversaire", () => {
    const s = makeState({
      turn: 1,
      hands: [[card("A", "D")], [card("10", "C")]],
      stock: [card("A", "S")],
    });

    const n = anticipate(s, 1);

    expect(n.hands[0].map((c) => c.rank)).toEqual(["A"]);
    expect(n.gains[0].filter(isBonne).length).toBe(2);
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
    // 2 bonnes encaissées + la main ; l'adversaire reçoit l'As abandonné.
    expect(n.roundScore![0].total).toBe(3);
    expect(n.roundScore![1].total).toBe(1);
    expect(n.roundWinner).toBe(0);
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

    expect(n.roundScore![0].total).toBe(3);
    expect(n.roundScore![1].total).toBe(3);
    // Égalité : le tour est rejoué.
    expect(n.roundWinner).toBeNull();
    expect(n.pont).toBe(true);
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

import { describe, expect, it } from "vitest";
import { announce, playCard, type Card, type GameState, type Rank, type Suit } from "./engine";
import { previewAction } from "./preview";

let cardId = 0;
function card(rank: Rank, suit: Suit): Card {
  return { id: `p${cardId++}`, rank, suit };
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
    dealer: 0,
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
    forfeit: null,
    log: [],
    ...overrides,
  };
}

/** Une main de cinq cartes en position d'annoncer : c'est ce qu'exige le moteur. */
function annoncable(hand: Card[]): Partial<GameState> {
  return { stock: [card("7", "C")], hands: [hand, []], canAnnounce: 0, drawPending: [0] };
}

/** De quoi compléter une main à cinq cartes sans y former de compte. */
function remplissage(): Card[] {
  return [card("7", "S"), card("8", "S"), card("9", "S")];
}

/**
 * L'aperçu ne vaut que s'il tombe EXACTEMENT sur ce que le serveur calcule :
 * c'est tout ce qui autorise à l'afficher avant sa réponse. Ces épreuves le
 * comparent donc au moteur lui-même, celui que le serveur rejoue.
 */
describe("previewAction", () => {
  it("joue la carte comme le ferait le serveur", () => {
    const mienne = card("A", "H");
    const state = makeState({
      hands: [[mienne, card("7", "S")], [card("K", "D")]],
      turn: 0,
      stock: [card("9", "C")],
    });

    const vu = previewAction(state, 0, { type: "play_card", cardId: mienne.id });

    expect(vu).toEqual(playCard(state, 0, mienne.id));
    expect(vu?.hands[0]).toHaveLength(1);
    expect(vu?.trick.map((t) => t.card.id)).toEqual([mienne.id]);
  });

  it("laisse l'état intact : l'aperçu ne modifie rien sur place", () => {
    const mienne = card("A", "H");
    const state = makeState({ hands: [[mienne], [card("K", "D")]], turn: 0 });
    const avant = structuredClone(state);

    previewAction(state, 0, { type: "play_card", cardId: mienne.id });

    expect(state).toEqual(avant);
  });

  it("renonce quand le coup n'est pas au joueur", () => {
    const sienne = card("A", "H");
    const state = makeState({ hands: [[card("7", "S")], [sienne]], turn: 1 });

    expect(previewAction(state, 0, { type: "play_card", cardId: sienne.id })).toBeNull();
  });

  it("renonce sur une carte qui n'est pas en main", () => {
    const state = makeState({ hands: [[card("7", "S")], [card("K", "D")]], turn: 0 });

    expect(previewAction(state, 0, { type: "play_card", cardId: "fantome" })).toBeNull();
  });

  it("renonce sur une carte illégale plutôt que de la montrer posée", () => {
    // Le joueur 1 doit fournir à cœur : sa dame de pique ne peut pas partir.
    const hors = card("Q", "S");
    const state = makeState({
      hands: [[], [card("K", "H"), hors]],
      trick: [{ player: 0, card: card("A", "H") }],
      leader: 0,
      turn: 1,
      trump: "D",
    });

    expect(previewAction(state, 1, { type: "play_card", cardId: hors.id })).toBeNull();
  });

  it("annonce le compte comme le ferait le serveur", () => {
    const state = makeState(annoncable([card("K", "H"), card("Q", "H"), ...remplissage()]));

    const vu = previewAction(state, 0, { type: "announce", suits: ["H"], trump: "H" });

    expect(vu).toEqual(announce(state, 0, ["H"], "H"));
    expect(vu?.trump).toBe("H");
    expect(vu?.melds[0]).toHaveLength(1);
  });

  it("renonce sur une annonce impossible", () => {
    const state = makeState(annoncable([card("K", "H"), ...remplissage(), card("8", "D")]));

    expect(previewAction(state, 0, { type: "announce", suits: ["H"], trump: "H" })).toBeNull();
  });

  it("referme la fenêtre d'annonce sur un refus", () => {
    const state = makeState({ canAnnounce: 0 });

    expect(previewAction(state, 0, { type: "skip_announce" })?.canAnnounce).toBeNull();
  });

  it("renonce à refuser une annonce qui n'est pas la sienne", () => {
    const state = makeState({ canAnnounce: 1 });

    expect(previewAction(state, 0, { type: "skip_announce" })).toBeNull();
  });

  it("n'anticipe pas les actions automatiques ni la table elle-même", () => {
    const state = makeState({ trick: [{ player: 0, card: card("A", "H") }] });

    expect(previewAction(state, 0, { type: "resolve_trick" })).toBeNull();
    expect(previewAction(state, 0, { type: "draw_next" })).toBeNull();
    expect(previewAction(state, 0, { type: "forfeit", reason: "quit" })).toBeNull();
  });
});

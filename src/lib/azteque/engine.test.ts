import { describe, expect, it, vi } from "vitest";
import {
  aiChooseCardAt,
  announce,
  availableMelds,
  beats,
  drawNext,
  endRound,
  legalCards,
  meldPoints,
  resolveTrick,
  trickCapturesPile,
  type Card,
  type Difficulty,
  type GameState,
  type Meld,
  type PlayerIndex,
  type Rank,
  type Suit,
} from "./engine";

let cardId = 0;
function card(rank: Rank, suit: Suit, id?: string): Card {
  return { id: id ?? `t${cardId++}`, rank, suit };
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

describe("beats", () => {
  it("la carte la plus forte gagne dans la même couleur", () => {
    expect(beats(card("A", "H"), card("7", "H"), null)).toBe(true);
    expect(beats(card("7", "H"), card("A", "H"), null)).toBe(false);
  });

  it("sans atout, la première carte reste dominante même face à une carte plus forte d'une autre couleur", () => {
    // Exemple du règlement (§8) : premier joueur ♥7, deuxième joueur ♣As -> le ♥7 gagne.
    expect(beats(card("A", "C"), card("7", "H"), null)).toBe(false);
  });

  it("un atout domine toute carte d'une autre couleur, même le plus faible", () => {
    expect(beats(card("7", "H"), card("A", "S"), "H")).toBe(true);
    expect(beats(card("A", "S"), card("7", "H"), "H")).toBe(false);
  });

  it("entre deux cartes identiques, la première jouée gagne", () => {
    const first = card("A", "H", "a");
    const second = card("A", "H", "b");
    expect(beats(second, first, null)).toBe(false);
  });
});

describe("legalCards", () => {
  it("aucune contrainte tant que la pioche n'est pas épuisée", () => {
    const hand = [card("7", "H"), card("A", "S")];
    const state = makeState({
      stock: [card("7", "C")],
      hands: [hand, []],
      trick: [{ player: 1, card: card("K", "H") }],
    });
    expect(legalCards(state, 0)).toEqual(hand);
  });

  it("main libre quand aucun pli n'est en cours", () => {
    const hand = [card("7", "H"), card("A", "S")];
    const state = makeState({ hands: [hand, []] });
    expect(legalCards(state, 0)).toEqual(hand);
  });

  it("doit fournir la couleur et jouer la plus forte s'il ne peut pas battre", () => {
    const sevenH = card("7", "H");
    const nineH = card("9", "H");
    const state = makeState({
      hands: [[sevenH, nineH], []],
      trick: [{ player: 1, card: card("K", "H") }],
    });
    expect(legalCards(state, 0)).toEqual([nineH]);
  });

  it("doit battre la couleur demandée quand c'est possible", () => {
    const nineH = card("9", "H");
    const aceH = card("A", "H");
    const state = makeState({
      hands: [[nineH, aceH], []],
      trick: [{ player: 1, card: card("K", "H") }],
    });
    expect(legalCards(state, 0)).toEqual([aceH]);
  });

  it("protection d'une bonne : peut jouer la carte juste en dessous pour la préserver (règlement §14)", () => {
    // Premier joueur : As de cœur. Deuxième joueur : 10♥, Valet♥, 7♥.
    const tenH = card("10", "H");
    const jackH = card("J", "H");
    const sevenH = card("7", "H");
    const state = makeState({
      hands: [[tenH, jackH, sevenH], []],
      trick: [{ player: 1, card: card("A", "H") }],
    });
    expect(legalCards(state, 0)).toEqual([tenH, jackH]);
  });

  it("sans carte de secours, la bonne doit être jouée", () => {
    const tenH = card("10", "H");
    const state = makeState({
      hands: [[tenH], []],
      trick: [{ player: 1, card: card("A", "H") }],
    });
    expect(legalCards(state, 0)).toEqual([tenH]);
  });

  it("sans la couleur demandée, joue un atout si possible", () => {
    const trumpCard = card("7", "S");
    const other = card("9", "D");
    const state = makeState({
      trump: "S",
      hands: [[trumpCard, other], []],
      trick: [{ player: 1, card: card("K", "H") }],
    });
    expect(legalCards(state, 0)).toEqual([trumpCard]);
  });

  it("sans la couleur ni atout, la défausse est libre", () => {
    const hand = [card("9", "D"), card("J", "C")];
    const state = makeState({
      trump: "S",
      hands: [hand, []],
      trick: [{ player: 1, card: card("K", "H") }],
    });
    expect(legalCards(state, 0)).toEqual(hand);
  });
});

describe("resolveTrick", () => {
  it("attribue le pli au vainqueur et programme les pioches (vainqueur puis perdant)", () => {
    const state = makeState({
      stock: [card("7", "C"), card("8", "C")],
      trick: [
        { player: 0, card: card("7", "H") },
        { player: 1, card: card("A", "H") },
      ],
    });
    const next = resolveTrick(state);
    expect(next.gains[1]).toHaveLength(2);
    expect(next.gains[0]).toHaveLength(0);
    expect(next.lastTrickWinner).toBe(1);
    expect(next.leader).toBe(1);
    expect(next.turn).toBe(1);
    expect(next.drawPending).toEqual([1, 0]);
    expect(next.canAnnounce).toBe(1);
    expect(next.trick).toEqual([]);
  });

  it("un seul joueur pioche quand il ne reste qu'une carte", () => {
    const state = makeState({
      stock: [card("7", "C")],
      trick: [
        { player: 0, card: card("7", "H") },
        { player: 1, card: card("A", "H") },
      ],
    });
    const next = resolveTrick(state);
    expect(next.drawPending).toEqual([1]);
  });

  it("règle optionnelle Atout 10 : capturer le 10 d'atout adverse rafle tout son tas", () => {
    const state = makeState({
      trump: "H",
      gains: [[card("7", "S")], []],
      hands: [[card("9", "D")], [card("8", "D")]], // tour pas encore terminé
      trick: [
        { player: 0, card: card("10", "H") },
        { player: 1, card: card("A", "H") },
      ],
    });
    expect(trickCapturesPile(state, { atout10: true })).toBe(true);

    const next = resolveTrick(state, { atout10: true });
    expect(next.gains[0]).toEqual([]);
    expect(next.gains[1]).toHaveLength(3); // les 2 cartes du pli + le tas volé
    expect(next.log[0]).toMatch(/Atout 10/);
  });

  it("sans l'option Atout 10, le tas du perdant reste intact", () => {
    const state = makeState({
      trump: "H",
      gains: [[card("7", "S")], []],
      trick: [
        { player: 0, card: card("10", "H") },
        { player: 1, card: card("A", "H") },
      ],
    });
    expect(trickCapturesPile(state, {})).toBe(false);
    const next = resolveTrick(state);
    expect(next.gains[0]).toHaveLength(1);
  });

  it("termine le tour quand la pioche et les deux mains sont vides", () => {
    const state = makeState({
      stock: [],
      hands: [[], []],
      trick: [
        { player: 0, card: card("7", "H") },
        { player: 1, card: card("A", "H") },
      ],
    });
    const next = resolveTrick(state);
    expect(next.phase).toBe("roundEnd");
    expect(next.roundScore).not.toBeNull();
  });
});

describe("endRound", () => {
  it("égalité : le tour est rejoué (pont)", () => {
    const state = makeState({ lastTrickWinner: null, roundsWon: [1, 1] });
    const next = endRound(state);
    expect(next.roundWinner).toBeNull();
    expect(next.pont).toBe(true);
    expect(next.phase).toBe("roundEnd");
    expect(next.roundsWon).toEqual([1, 1]);
  });

  it("victoire immédiate du champ à treize bonnes ou plus", () => {
    const thirteenBonnes: Card[] = Array.from({ length: 13 }, () => card("A", "H"));
    const state = makeState({ gains: [thirteenBonnes, []], lastTrickWinner: 0 });
    const next = endRound(state);
    expect(next.instantWin).toBe(true);
    expect(next.roundWinner).toBe(0);
    expect(next.champWinner).toBe(0);
    expect(next.phase).toBe("gameEnd");
  });

  it("victoire du champ au troisième tour gagné", () => {
    const meld: Meld = { suit: "H", type: "simple", points: 4, first: true };
    const state = makeState({
      melds: [[meld], []],
      roundsWon: [2, 0],
      lastTrickWinner: 0,
    });
    const next = endRound(state);
    expect(next.roundWinner).toBe(0);
    expect(next.roundsWon).toEqual([3, 0]);
    expect(next.champWinner).toBe(0);
    expect(next.phase).toBe("gameEnd");
    expect(next.instantWin).toBe(false);
  });

  it("la main (dernier pli) vaut un point dans le décompte", () => {
    const state = makeState({ lastTrickWinner: 1 });
    const next = endRound(state);
    expect(next.roundScore![1].main).toBe(1);
    expect(next.roundScore![0].main).toBe(0);
    expect(next.roundWinner).toBe(1);
  });
});

describe("meldPoints", () => {
  it("applique le barème du règlement (§20)", () => {
    expect(meldPoints("simple", true)).toBe(4);
    expect(meldPoints("triple", true)).toBe(5);
    expect(meldPoints("simple", false)).toBe(2);
    expect(meldPoints("triple", false)).toBe(3);
  });
});

describe("availableMelds / announce", () => {
  const preconditions = (p: PlayerIndex, hand: Card[]): Partial<GameState> => ({
    stock: [card("7", "C")],
    hands: (p === 0 ? [hand, []] : [[], hand]) as [Card[], Card[]],
    canAnnounce: p,
    drawPending: [p],
  });

  it("détecte un compte simple (Roi + Dame)", () => {
    const hand = [card("K", "H"), card("Q", "H"), card("7", "S")];
    const state = makeState(preconditions(0, hand));
    const opts = availableMelds(state, 0);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ suit: "H", type: "simple" });
  });

  it("détecte un compte triple (Roi + Dame + Valet)", () => {
    const hand = [card("K", "H"), card("Q", "H"), card("J", "H")];
    const state = makeState(preconditions(0, hand));
    const opts = availableMelds(state, 0);
    expect(opts[0]).toMatchObject({ suit: "H", type: "triple" });
  });

  it("aucun compte annonçable une fois la pioche épuisée", () => {
    const hand = [card("K", "H"), card("Q", "H")];
    const state = makeState({ ...preconditions(0, hand), stock: [] });
    expect(availableMelds(state, 0)).toEqual([]);
  });

  it("premier compte annoncé : fixe l'atout et vaut le barème 'premier'", () => {
    const hand = [card("K", "H"), card("Q", "H"), card("7", "S"), card("8", "D"), card("9", "C")];
    const state = makeState(preconditions(0, hand));
    const next = announce(state, 0, ["H"], "H");
    expect(next.trump).toBe("H");
    expect(next.melds[0]).toEqual([{ suit: "H", type: "simple", points: 4, first: true }]);
    expect(next.canAnnounce).toBeNull();
  });

  it("plusieurs comptes annoncés ensemble : un seul fixe l'atout, l'autre est enregistré au barème 'suivant'", () => {
    const hand = [card("K", "H"), card("Q", "H"), card("K", "S"), card("Q", "S"), card("7", "D")];
    const state = makeState(preconditions(0, hand));
    const next = announce(state, 0, ["H", "S"], "H");
    expect(next.trump).toBe("H");
    const bySuit = Object.fromEntries(next.melds[0].map((m) => [m.suit, m]));
    expect(bySuit["H"]).toMatchObject({ points: 4, first: true });
    expect(bySuit["S"]).toMatchObject({ points: 2, first: false });
  });

  it("un compte annoncé après que l'atout est fixé ne recrée pas d'atout et vaut le barème 'suivant'", () => {
    const hand = [card("K", "S"), card("Q", "S"), card("7", "D"), card("8", "D"), card("9", "D")];
    const state = makeState({ ...preconditions(0, hand), trump: "H" });
    const next = announce(state, 0, ["S"], null);
    expect(next.trump).toBe("H");
    expect(next.melds[0][0]).toMatchObject({ points: 2, first: false });
  });

  it("refuse l'annonce hors des conditions requises (pas exactement 5 cartes en main)", () => {
    const hand = [card("K", "H"), card("Q", "H"), card("7", "S"), card("8", "D")];
    const state = makeState(preconditions(0, hand));
    const next = announce(state, 0, ["H"], "H");
    expect(next).toBe(state);
  });

  it("un deuxième compte à la couleur d'atout (second jeu de cartes) est annonçable et se compte comme le premier", () => {
    const usedK = card("K", "H", "usedK");
    const usedQ = card("Q", "H", "usedQ");
    const newK = card("K", "H");
    const newQ = card("Q", "H");
    const hand = [usedK, usedQ, newK, newQ, card("7", "D")];
    const state = makeState({
      ...preconditions(0, hand),
      trump: "H",
      melds: [[{ suit: "H", type: "simple", points: 4, first: true }], []],
      exposed: [[usedK.id, usedQ.id], []],
    });

    const opts = availableMelds(state, 0);
    expect(opts).toEqual([{ suit: "H", type: "simple", cards: [newK, newQ] }]);

    const next = announce(state, 0, ["H"], null);
    expect(next.melds[0]).toHaveLength(2);
    expect(next.melds[0][1]).toMatchObject({ suit: "H", type: "simple", points: 4, first: true });
    expect(next.trump).toBe("H");
  });

  it("l'adversaire peut aussi annoncer un compte à la couleur d'atout, valorisé comme le premier", () => {
    const hand = [card("K", "H"), card("Q", "H"), card("7", "S"), card("8", "S"), card("9", "S")];
    const state = makeState({
      ...preconditions(1, hand),
      trump: "H",
      melds: [[{ suit: "H", type: "simple", points: 4, first: true }], []],
    });
    const next = announce(state, 1, ["H"], null);
    expect(next.melds[1]).toEqual([{ suit: "H", type: "simple", points: 4, first: true }]);
  });

  it("un deuxième compte triple à l'atout vaut aussi 5 points, comme le premier", () => {
    const usedK = card("K", "H", "usedK3");
    const usedQ = card("Q", "H", "usedQ3");
    const newK = card("K", "H");
    const newQ = card("Q", "H");
    const newJ = card("J", "H");
    const hand = [usedK, usedQ, newK, newQ, newJ];
    const state = makeState({
      ...preconditions(0, hand),
      trump: "H",
      melds: [[{ suit: "H", type: "simple", points: 4, first: true }], []],
      exposed: [[usedK.id, usedQ.id], []],
    });
    const next = announce(state, 0, ["H"], null);
    expect(next.melds[0][1]).toMatchObject({ suit: "H", type: "triple", points: 5, first: true });
  });

  it("un deuxième compte dans une couleur hors atout reste impossible", () => {
    const usedK = card("K", "S", "usedK2");
    const usedQ = card("Q", "S", "usedQ2");
    const newK = card("K", "S");
    const newQ = card("Q", "S");
    const hand = [usedK, usedQ, newK, newQ, card("7", "D")];
    const state = makeState({
      ...preconditions(0, hand),
      trump: "H", // l'atout est une autre couleur que celle testée
      melds: [[{ suit: "S", type: "simple", points: 2, first: false }], []],
      exposed: [[usedK.id, usedQ.id], []],
    });
    expect(availableMelds(state, 0)).toEqual([]);
  });
});

describe("drawNext", () => {
  it("pioche la carte suivante et retire le joueur de la file d'attente", () => {
    const drawn = card("7", "C");
    const state = makeState({
      stock: [drawn],
      hands: [[], []],
      drawPending: [0],
    });
    const next = drawNext(state);
    expect(next.stock).toEqual([]);
    expect(next.drawPending).toEqual([]);
    expect(next.hands[0]).toEqual([drawn]);
  });

  it("complète un compte simple en triple si le valet correspondant est pioché juste après l'annonce", () => {
    const meld: Meld = { suit: "H", type: "simple", points: 4, first: true };
    const jackH = card("J", "H");
    const state = makeState({
      stock: [jackH],
      hands: [[], []],
      melds: [[meld], []],
      exposed: [[], []],
      pendingUpgrade: ["H", null],
      drawPending: [0],
    });
    const next = drawNext(state);
    expect(next.melds[0][0]).toMatchObject({ type: "triple", points: 5 });
    expect(next.exposed[0]).toContain(jackH.id);
    expect(next.pendingUpgrade[0]).toBeNull();
  });

  it("la fenêtre de complément ne dure qu'un tirage : une autre carte ne complète rien et referme la fenêtre", () => {
    const meld: Meld = { suit: "H", type: "simple", points: 4, first: true };
    const state = makeState({
      stock: [card("9", "D")],
      hands: [[], []],
      melds: [[meld], []],
      pendingUpgrade: ["H", null],
      drawPending: [0],
    });
    const next = drawNext(state);
    expect(next.melds[0][0]).toMatchObject({ type: "simple", points: 4 });
    expect(next.pendingUpgrade[0]).toBeNull();
  });
});

// Ces tests ne vérifient pas que l'IA joue "bien" (jugement de valeur), mais
// verrouillent son comportement sur des mains de référence : un changement
// volontaire de l'heuristique fait échouer le instantané correspondant, ce
// qui force à le regénérer (npx vitest run -u) en connaissance de cause.
describe("aiChooseCardAt (non-régression)", () => {
  const levels: Difficulty[] = ["facile", "normal", "expert", "maitre"];

  it.each(levels)("niveau %s : décision stable sur une main de référence", (level) => {
    // Random forcé au maximum pour désactiver les branches de coup aléatoire
    // (facile/normal) et isoler la logique déterministe testée ici.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    const state = makeState({
      trump: "H",
      stock: [card("7", "C"), card("8", "C")],
      hands: [[card("Q", "H")], [card("7", "H"), card("K", "H"), card("9", "S"), card("A", "D")]],
      trick: [{ player: 0, card: card("J", "H") }],
    });
    const choice = aiChooseCardAt(state, level);
    expect({ rank: choice.rank, suit: choice.suit }).toMatchSnapshot();
    randomSpy.mockRestore();
  });

  it("niveau légende : résout exactement la fin de partie sans pioche", () => {
    const state = makeState({
      trump: "S",
      stock: [],
      hands: [[card("7", "H")], [card("A", "S"), card("8", "D")]],
      trick: [],
    });
    const choice = aiChooseCardAt(state, "legende");
    expect({ rank: choice.rank, suit: choice.suit }).toMatchSnapshot();
  });
});

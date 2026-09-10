import { describe, expect, it } from "vitest";
import type { GameState } from "./engine";
import { resolveForfeit } from "./match-actions";

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

/**
 * Qui perd un abandon.
 *
 * "quit" se déclare contre soi-même, "timeout"/"disconnect" contre
 * l'adversaire observé — et le serveur ne doit jamais se fier à la seule
 * horloge du client qui déclare un dépassement de temps.
 */
describe("resolveForfeit", () => {
  it("un abandon volontaire désigne celui qui l'envoie comme perdant", () => {
    const state = makeState();
    const next = resolveForfeit(state, 0, "quit", 0);
    expect(next.phase).toBe("gameEnd");
    expect(next.forfeit).toEqual({ loser: 0, reason: "quit" });
    expect(next.champWinner).toBe(1);
  });

  it("l'autre joueur qui abandonne perd à son tour, pas moi", () => {
    const state = makeState();
    const next = resolveForfeit(state, 1, "quit", 0);
    expect(next.forfeit).toEqual({ loser: 1, reason: "quit" });
    expect(next.champWinner).toBe(0);
  });

  it("un dépassement de temps désigne l'ADVERSAIRE de celui qui le déclare comme perdant", () => {
    const state = makeState();
    // Le joueur 0 déclare que le joueur 1 (à qui c'était le tour) a dépassé
    // son temps : c'est lui, pas le déclarant, qui perd.
    const next = resolveForfeit(state, 0, "timeout", 30_000);
    expect(next.forfeit).toEqual({ loser: 1, reason: "timeout" });
    expect(next.champWinner).toBe(0);
  });

  it("refuse un dépassement de temps déclaré trop tôt : l'horloge du client ne fait pas foi", () => {
    const state = makeState();
    expect(() => resolveForfeit(state, 0, "timeout", 10_000)).toThrow("Délai non écoulé.");
  });

  it("accepte le dépassement de temps pile à la marge de sécurité", () => {
    const state = makeState();
    expect(() => resolveForfeit(state, 0, "timeout", 25_000)).not.toThrow();
  });

  it("une déconnexion désigne aussi l'adversaire de celui qui la déclare, sans condition de délai", () => {
    const state = makeState();
    const next = resolveForfeit(state, 1, "disconnect", 0);
    expect(next.forfeit).toEqual({ loser: 0, reason: "disconnect" });
    expect(next.champWinner).toBe(1);
  });

  it("refuse un abandon sur une partie qui n'a pas commencé", () => {
    expect(() => resolveForfeit(null, 0, "quit", 0)).toThrow("Partie déjà terminée.");
  });

  it("refuse un second abandon sur une partie déjà terminée", () => {
    const state = makeState({ phase: "gameEnd", champWinner: 1 });
    expect(() => resolveForfeit(state, 0, "quit", 0)).toThrow("Partie déjà terminée.");
  });

  it("garde le reste de l'état intact (mains, tas, tour en cours)", () => {
    const state = makeState({
      hands: [[{ id: "c1", rank: "A", suit: "H" }], []],
      roundsWon: [1, 2],
      trump: "H",
    });
    const next = resolveForfeit(state, 0, "quit", 0);
    expect(next.hands).toEqual(state.hands);
    expect(next.roundsWon).toEqual([1, 2]);
    expect(next.trump).toBe("H");
  });
});

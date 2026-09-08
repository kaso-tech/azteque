import { describe, expect, it } from "vitest";
import { newRound, playCard, type GameState } from "./engine";
import { estRejouable, peutEtreRenvoye, positionSignature } from "./replay";
import type { MatchAction } from "./match-actions";

/**
 * Le renvoi différé d'un coup que le réseau n'a pas su transmettre.
 *
 * L'enjeu n'est pas le confort mais la correction : une carte rejouée une
 * minute plus tard, alors que le pli a tourné, peut être parfaitement LÉGALE
 * et pourtant n'avoir jamais été voulue là. Le serveur l'accepterait. C'est
 * donc ici que cela doit être arrêté.
 */
describe("politique de renvoi différé", () => {
  const jouer = (action: MatchAction) => action;

  it("garde ce que le joueur a voulu", () => {
    expect(estRejouable(jouer({ type: "play_card", cardId: "c1" }))).toBe(true);
    expect(estRejouable(jouer({ type: "announce", suits: ["H"], trump: null }))).toBe(true);
    expect(estRejouable(jouer({ type: "skip_announce" }))).toBe(true);
    expect(estRejouable(jouer({ type: "ready_next_round" }))).toBe(true);
  });

  it("ne garde jamais un abandon : il tuerait une partie reprise entre-temps", () => {
    expect(estRejouable(jouer({ type: "forfeit", reason: "timeout" }))).toBe(false);
    expect(estRejouable(jouer({ type: "forfeit", reason: "quit" }))).toBe(false);
    expect(estRejouable(jouer({ type: "forfeit", reason: "disconnect" }))).toBe(false);
  });

  it("ne garde pas les actions automatiques, qui se redéduisent de l'état", () => {
    expect(estRejouable(jouer({ type: "resolve_trick" }))).toBe(false);
    expect(estRejouable(jouer({ type: "draw_next" }))).toBe(false);
    expect(estRejouable(jouer({ type: "new_round" }))).toBe(false);
  });

  it("ne garde pas la négociation de mise, où le joueur est devant son panneau", () => {
    expect(estRejouable(jouer({ type: "propose_bet", amount: 100 }))).toBe(false);
    expect(estRejouable(jouer({ type: "accept_bet" }))).toBe(false);
  });
});

describe("signature de position", () => {
  it("est vide sans partie", () => {
    expect(positionSignature(null)).toBe("");
  });

  it("ne bouge pas si rien ne bouge", () => {
    const s = newRound(1);
    expect(positionSignature(s)).toBe(positionSignature(s));
    expect(positionSignature(s)).toBe(positionSignature({ ...s }));
  });

  it("change dès qu'une carte est posée", () => {
    const s = newRound(1);
    const avant = positionSignature(s);
    const apres = positionSignature(playCard(s, s.turn, s.hands[s.turn]![0]!.id));
    expect(apres).not.toBe(avant);
  });

  it("change quand le tour passe à l'autre joueur", () => {
    const s = newRound(1);
    const autre: GameState = { ...s, turn: s.turn === 0 ? 1 : 0 };
    expect(positionSignature(autre)).not.toBe(positionSignature(s));
  });

  it("change quand la fenêtre d'annonce s'ouvre ou se referme", () => {
    const s = newRound(1);
    expect(positionSignature({ ...s, canAnnounce: 0 })).not.toBe(positionSignature(s));
    expect(positionSignature({ ...s, canAnnounce: 0 })).not.toBe(
      positionSignature({ ...s, canAnnounce: 1 }),
    );
  });

  it("change quand la partie se termine", () => {
    const s = newRound(1);
    expect(positionSignature({ ...s, phase: "gameEnd" })).not.toBe(positionSignature(s));
  });
});

describe("décision de renvoyer", () => {
  const coup: MatchAction = { type: "play_card", cardId: "c1" };

  it("renvoie quand la position est restée la même", () => {
    expect(peutEtreRenvoye({ action: coup, position: "A" }, "A")).toBe(true);
  });

  it("abandonne dès que la position a bougé", () => {
    // C'est le cas dangereux : le coup serait légal, mais plus voulu.
    expect(peutEtreRenvoye({ action: coup, position: "A" }, "B")).toBe(false);
  });

  it("n'a rien à renvoyer quand rien n'a été gardé", () => {
    expect(peutEtreRenvoye(null, "A")).toBe(false);
  });

  it("refuse même à position identique ce qui ne doit pas être rejoué", () => {
    const abandon: MatchAction = { type: "forfeit", reason: "disconnect" };
    expect(peutEtreRenvoye({ action: abandon, position: "A" }, "A")).toBe(false);
  });
});

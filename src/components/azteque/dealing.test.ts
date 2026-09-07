import { describe, expect, it } from "vitest";
import { freshDealId } from "./dealing";
import { newRound, playCard, type GameState } from "@/lib/azteque/engine";

/**
 * La cérémonie ne doit se déclencher qu'aux donnes : une fois en plein tour et
 * elle masquerait le jeu, jamais entre deux tours et elle passerait inaperçue.
 */
describe("détection de la donne", () => {
  it("reconnaît une donne fraîche", () => {
    const s = newRound(1);
    expect(freshDealId(s)).toBe(s.stock[0]?.id);
    expect(freshDealId(s)).not.toBeNull();
  });

  it("donne un identifiant différent à chaque donne", () => {
    expect(freshDealId(newRound(1))).not.toBe(freshDealId(newRound(1)));
  });

  it("le même état rend toujours le même identifiant", () => {
    const s = newRound(0);
    expect(freshDealId(s)).toBe(freshDealId(s));
  });

  it("se tait dès la première carte jouée", () => {
    const s = newRound(1);
    const carte = s.hands[s.turn][0]!;
    expect(freshDealId(playCard(s, s.turn, carte.id))).toBeNull();
  });

  it("se tait pendant tout le reste du tour", () => {
    let s: GameState = newRound(1);
    for (let coup = 0; coup < 8 && s.phase === "playing"; coup += 1) {
      if (s.drawPending.length > 0 || s.trick.length >= 2) break;
      const carte = s.hands[s.turn][0];
      if (!carte) break;
      s = playCard(s, s.turn, carte.id);
      expect(freshDealId(s)).toBeNull();
    }
  });

  it("se tait sur un tour terminé", () => {
    const s = { ...newRound(1), phase: "roundEnd" as const };
    expect(freshDealId(s)).toBeNull();
  });

  it("se tait sans état", () => {
    expect(freshDealId(null)).toBeNull();
    expect(freshDealId(undefined)).toBeNull();
  });
});

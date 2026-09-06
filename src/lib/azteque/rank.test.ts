import { describe, expect, it } from "vitest";
import { RANKS, RATING_FLOOR, START_RATING, rankGap, rankOf, rankProgress } from "./rank";

describe("grades", () => {
  it("place un compte neuf au premier grade, avec de la marge sous les pieds", () => {
    expect(rankOf(START_RATING).name).toBe("Débutant");
    expect(START_RATING).toBeGreaterThan(RATING_FLOOR);
  });

  it("donne dix grades, ordonnés et sans trou", () => {
    expect(RANKS).toHaveLength(10);
    expect(RANKS.map((r) => r.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const seuils = RANKS.map((r) => r.min);
    expect(seuils).toEqual([...seuils].sort((a, b) => a - b));
    expect(new Set(seuils).size).toBe(seuils.length);
  });

  it("bascule exactement au palier", () => {
    for (const r of RANKS.slice(1)) {
      expect(rankOf(r.min - 1).tier).toBe(r.tier - 1);
      expect(rankOf(r.min).tier).toBe(r.tier);
    }
  });

  it("tient au plancher comme au sommet", () => {
    expect(rankOf(RATING_FLOOR).name).toBe("Débutant");
    expect(rankOf(0).name).toBe("Débutant");
    expect(rankOf(9999).name).toBe("Roi Aztèque");
  });

  it("mesure l'avancement dans le grade", () => {
    const mid = rankProgress(1100 + 75); // moitié du palier Novice
    expect(mid.rank.name).toBe("Novice");
    expect(mid.next?.name).toBe("Initié");
    expect(mid.ratio).toBeCloseTo(0.5);
    expect(mid.toNext).toBe(75);
  });

  it("ne promet plus rien au dernier grade", () => {
    const top = rankProgress(2400);
    expect(top.next).toBeNull();
    expect(top.ratio).toBe(1);
    expect(top.toNext).toBe(0);
  });

  it("situe l'adversaire par rapport à soi", () => {
    expect(rankGap(1100, 1300)).toBe("superieur");
    expect(rankGap(1300, 1100)).toBe("inferieur");
    expect(rankGap(1100, 1149)).toBe("egal");
  });
});

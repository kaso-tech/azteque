import { describe, expect, it } from "vitest";
import { ELO_K, RANKS, RATING_FLOOR, START_RATING, rankGap, rankOf, rankProgress } from "./rank";

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
    const mid = rankProgress(1060 + 40); // moitié du palier Novice (1060 → 1140)
    expect(mid.rank.name).toBe("Novice");
    expect(mid.next?.name).toBe("Initié");
    expect(mid.ratio).toBeCloseTo(0.5);
    expect(mid.toNext).toBe(40);
  });

  it("ne promet plus rien au dernier grade", () => {
    const top = rankProgress(2400);
    expect(top.next).toBeNull();
    expect(top.ratio).toBe(1);
    expect(top.toNext).toBe(0);
  });

  it("situe l'adversaire par rapport à soi", () => {
    expect(rankGap(1060, 1300)).toBe("superieur");
    expect(rankGap(1300, 1060)).toBe("inferieur");
    expect(rankGap(1060, 1139)).toBe("egal");
  });
});

/**
 * Le prix d'un grade, compté en victoires.
 *
 * Contre un adversaire de sa propre cote, l'espérance vaut 0,5 : une victoire
 * rapporte donc K/2, une défaite coûte autant. Le compte ci-dessous est celui
 * de victoires NETTES — l'excédent de victoires sur les défaites.
 *
 * Reproduit la règle de `public.elo_k`. Si la base change et pas ceci, les
 * chiffres attendus plus bas cessent de décrire le jeu réel : c'est exactement
 * ce qui s'était produit, la documentation promettant cinq victoires par
 * palier là où il en fallait treize.
 */
function victoiresJusqua(cible: number): number {
  let cote = START_RATING;
  let classees = 0;
  let victoires = 0;
  while (cote < cible && victoires < 1000) {
    const k =
      classees < 10 ? ELO_K.rodage : cote >= ELO_K.seuilSommet ? ELO_K.sommet : ELO_K.normal;
    cote += k / 2;
    classees += 1;
    victoires += 1;
  }
  return victoires;
}

describe("rythme de la montée", () => {
  it("fait se mériter chaque grade un peu plus que le précédent", () => {
    const prix = RANKS.slice(1)
      .map((r) => r.min)
      .map(victoiresJusqua);
    const marches = prix.map((v, i) => v - (prix[i - 1] ?? 0));

    // Aucune marche ne redescend : la courbe monte, sans creux ni palier
    // gratuit au milieu de l'échelle.
    for (let i = 1; i < marches.length; i += 1) {
      expect(marches[i]).toBeGreaterThanOrEqual(marches[i - 1]!);
    }
  });

  it("met les premiers grades à portée", () => {
    // Le reproche auquel ces seuils répondent : le deuxième grade coûtait
    // cinq victoires, le troisième dix, et chacun des suivants une douzaine.
    expect(victoiresJusqua(RANKS[1]!.min)).toBeLessThanOrEqual(4);
    expect(victoiresJusqua(RANKS[2]!.min)).toBeLessThanOrEqual(8);
    expect(victoiresJusqua(RANKS[3]!.min)).toBeLessThanOrEqual(14);
  });

  it("laisse le sommet se gagner sur la durée", () => {
    const roi = victoiresJusqua(RANKS[9]!.min);
    // Assez long pour qu'une couronne veuille dire quelque chose…
    expect(roi).toBeGreaterThanOrEqual(60);
    // …mais plus les 114 victoires nettes d'avant, hors d'atteinte pour tous.
    expect(roi).toBeLessThanOrEqual(95);
  });
});

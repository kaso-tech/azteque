import { describe, expect, it } from "vitest";
import {
  CHAMPS_DE_PLACEMENT,
  champsAvantClassement,
  ELO_K,
  estClasse,
  RANKS,
  RATING_FLOOR,
  START_RATING,
  rankGap,
  rankOf,
  rankProgress,
} from "./rank";

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

describe("période de placement", () => {
  it("ne classe personne avant d'avoir vu jouer", () => {
    expect(estClasse(0)).toBe(false);
    expect(estClasse(CHAMPS_DE_PLACEMENT - 1)).toBe(false);
    expect(estClasse(CHAMPS_DE_PLACEMENT)).toBe(true);
  });

  it("classe par défaut quand le nombre de champs est inconnu", () => {
    // Une colonne absente (migration en retard) ne doit pas effacer le grade
    // de joueurs qui l'ont gagné : on préfère un grade de trop.
    expect(estClasse(undefined)).toBe(true);
    expect(champsAvantClassement(undefined)).toBe(0);
  });

  it("dit ce qu'il reste à jouer, sans jamais descendre sous zéro", () => {
    expect(champsAvantClassement(0)).toBe(CHAMPS_DE_PLACEMENT);
    expect(champsAvantClassement(CHAMPS_DE_PLACEMENT - 2)).toBe(2);
    expect(champsAvantClassement(CHAMPS_DE_PLACEMENT)).toBe(0);
    expect(champsAvantClassement(200)).toBe(0);
  });

  it("sort du tableau le compte neuf qui devançait un joueur actif", () => {
    // Le cas exact qui a motivé ce changement : un compte ouvert et jamais
    // joué (1000) passait devant quatre victoires et cinq défaites (980),
    // parce que 1000 est plus grand. Les deux nombres sont justes ; les
    // ranger ensemble ne l'était pas.
    const neuf = { rating: START_RATING, parties: 0 };
    const actif = { rating: 980, parties: 9 };

    expect(neuf.rating).toBeGreaterThan(actif.rating);
    expect(estClasse(neuf.parties)).toBe(false);
    expect(estClasse(actif.parties)).toBe(true);
  });

  it("place avant la fin du rodage, pour ne pas vider le tableau", () => {
    // Le rodage (gains doublés) dure plus longtemps que le placement : la
    // cote continue donc de se caler après l'entrée au tableau, ce qui est
    // voulu. L'inverse — être classé après le rodage — rendrait le tableau
    // presque vide sur une petite communauté.
    expect(CHAMPS_DE_PLACEMENT).toBeLessThan(10);
    expect(CHAMPS_DE_PLACEMENT).toBeGreaterThanOrEqual(3);
  });
});

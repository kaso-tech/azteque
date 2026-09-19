import { describe, expect, it } from "vitest";
import { LARGEUR_BULLE_MAX, MARGE_BULLE, centreBulle } from "./bulles";

/**
 * Le symptôme : un message un peu long, écrit pendant un tour, sortait de
 * l'écran du téléphone. La bulle est centrée sur l'avatar de son auteur, et un
 * avatar se tient par définition près du bord.
 */
describe("centrage d'une bulle", () => {
  const TEL = 390; // largeur d'un téléphone courant

  const bords = (largeur: number) => {
    const demie = Math.min(LARGEUR_BULLE_MAX, largeur - 2 * MARGE_BULLE) / 2;
    return { demie };
  };

  it("laisse une bulle du milieu là où elle est", () => {
    expect(centreBulle(TEL / 2, TEL)).toBe(TEL / 2);
  });

  it("ne laisse jamais la bulle dépasser à gauche", () => {
    const { demie } = bords(TEL);
    for (const x of [0, 10, 40, 80]) {
      expect(centreBulle(x, TEL) - demie).toBeGreaterThanOrEqual(MARGE_BULLE);
    }
  });

  it("ne laisse jamais la bulle dépasser à droite", () => {
    const { demie } = bords(TEL);
    for (const x of [TEL, TEL - 10, TEL - 40, TEL - 80]) {
      expect(centreBulle(x, TEL) + demie).toBeLessThanOrEqual(TEL - MARGE_BULLE);
    }
  });

  it("tient sur toutes les largeurs d'écran courantes", () => {
    for (const largeur of [320, 360, 390, 430, 768, 1280]) {
      const { demie } = bords(largeur);
      for (const x of [0, largeur * 0.15, largeur / 2, largeur * 0.85, largeur]) {
        const c = centreBulle(x, largeur);
        expect(c - demie).toBeGreaterThanOrEqual(MARGE_BULLE - 0.001);
        expect(c + demie).toBeLessThanOrEqual(largeur - MARGE_BULLE + 0.001);
      }
    }
  });

  it("se contente de centrer quand l'écran est plus étroit que la bulle", () => {
    // Cas dégénéré : aucune position ne peut satisfaire les deux marges.
    expect(centreBulle(0, 20)).toBe(10);
  });

  it("ne déplace pas une bulle qui tenait déjà", () => {
    const { demie } = bords(TEL);
    const sur = MARGE_BULLE + demie + 5;
    expect(centreBulle(sur, TEL)).toBe(sur);
  });
});

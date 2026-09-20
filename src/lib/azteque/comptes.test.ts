import { describe, expect, it } from "vitest";
import { totalDuTour, type LigneDeCompte } from "./comptes";
import type { PlayerIndex } from "./engine";

const ligne = (
  round: number,
  player: PlayerIndex,
  points: number,
  suite = "pique",
): LigneDeCompte => ({
  key: `${round}-${player}-${suite}-simple`,
  round,
  player,
  label: `♠ Pique — compte simple`,
  points,
});

describe("total des comptes d'un tour", () => {
  it("ne retient que le tour demandé", () => {
    const lignes = [ligne(1, 0, 20), ligne(2, 0, 40, "coeur"), ligne(3, 0, 60, "carreau")];
    expect(totalDuTour(lignes, 0, 2)).toBe(40);
  });

  it("additionne plusieurs comptes du même tour", () => {
    const lignes = [ligne(2, 0, 20), ligne(2, 0, 40, "coeur"), ligne(2, 0, 60, "carreau")];
    expect(totalDuTour(lignes, 0, 2)).toBe(120);
  });

  it("ne mélange pas les deux joueurs", () => {
    const lignes = [ligne(2, 0, 20), ligne(2, 1, 100, "coeur")];
    expect(totalDuTour(lignes, 0, 2)).toBe(20);
    expect(totalDuTour(lignes, 1, 2)).toBe(100);
  });

  /**
   * Le défaut qui a motivé cette extraction : le bouton cumulait tout le
   * champ. Un joueur qui avait annoncé 20 au premier tour et rien au second
   * lisait toujours 20 — un total faux, mais plausible.
   */
  it("repart de zéro à la donne suivante", () => {
    const lignes = [ligne(1, 0, 20)];
    expect(totalDuTour(lignes, 0, 1)).toBe(20);
    expect(totalDuTour(lignes, 0, 2)).toBe(0);
  });

  it("vaut zéro tant que rien n'est annoncé", () => {
    expect(totalDuTour([], 0, 1)).toBe(0);
  });
});

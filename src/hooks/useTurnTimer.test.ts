import { describe, expect, it } from "vitest";
import { remainingSeconds } from "./useTurnTimer";

/**
 * L'arithmétique du compte à rebours de réflexion.
 *
 * Elle décide qu'un joueur perd la partie sur dépassement : une erreur ici ne
 * se verrait pas, elle ferait seulement perdre quelqu'un. D'où ces tests sur
 * la fonction pure, le hook lui-même n'étant pas éprouvable sans navigateur.
 *
 * La règle tient en une phrase : la pause GÈLE le temps, elle ne le rembourse
 * pas et n'en rend pas non plus.
 */
describe("temps de réflexion restant", () => {
  const T0 = 1_000_000;

  it("part du délai complet quand rien n'a été consommé", () => {
    expect(remainingSeconds(30, 0, null, T0)).toBe(30);
    expect(remainingSeconds(30, 0, T0, T0)).toBe(30);
  });

  it("décompte le temps qui court", () => {
    expect(remainingSeconds(30, 0, T0, T0 + 10_000)).toBe(20);
  });

  it("en pause, ne consomme plus rien — quel que soit le temps qui passe", () => {
    // 10 s consommées puis suspension : la valeur ne bouge plus.
    expect(remainingSeconds(30, 10_000, null, T0)).toBe(20);
    expect(remainingSeconds(30, 10_000, null, T0 + 60_000)).toBe(20);
    expect(remainingSeconds(30, 10_000, null, T0 + 3_600_000)).toBe(20);
  });

  it("à la reprise, repart d'où l'on s'était arrêté", () => {
    // 10 s consommées, longue coupure, puis 5 s de plus une fois revenu.
    expect(remainingSeconds(30, 10_000, T0, T0 + 5_000)).toBe(15);
  });

  it("ne rend jamais de temps déjà consommé", () => {
    // Trois pauses successives ne recréditent rien.
    let consomme = 0;
    for (let i = 0; i < 3; i += 1) consomme += 8_000;
    expect(remainingSeconds(30, consomme, null, T0)).toBe(6);
  });

  it("ne descend jamais sous zéro", () => {
    expect(remainingSeconds(30, 45_000, null, T0)).toBe(0);
    expect(remainingSeconds(30, 0, T0, T0 + 120_000)).toBe(0);
  });

  it("ignore une horloge qui recule", () => {
    // Changement d'heure, veille de l'appareil : `now` peut passer sous le
    // départ. Cela ne doit pas rendre du temps au joueur.
    expect(remainingSeconds(30, 10_000, T0, T0 - 5_000)).toBe(20);
  });
});

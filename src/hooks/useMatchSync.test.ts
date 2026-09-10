import { describe, expect, it } from "vitest";
import { apporteDuNeuf } from "./useMatchSync";

/**
 * Le tri des lignes qui arrivent du serveur.
 *
 * Il décide de ce que le joueur voit sur une connexion faible : trop sévère,
 * la table reste en retard sans que rien ne le rattrape ; trop permissif, elle
 * défait le coup que le joueur vient de jouer. D'où ces épreuves sur la
 * décision elle-même, le hook n'étant pas éprouvable sans navigateur.
 */
describe("apporteDuNeuf", () => {
  const vue = (stamp: string) => ({ at: new Date(stamp).getTime(), stamp });

  it("accepte la première ligne, quand rien n'a encore été appliqué", () => {
    expect(apporteDuNeuf("2026-09-10T12:00:00.000000+00:00", { at: 0, stamp: "" })).toBe(true);
  });

  it("accepte une ligne plus récente", () => {
    const deja = vue("2026-09-10T12:00:00.000000+00:00");
    expect(apporteDuNeuf("2026-09-10T12:00:00.500000+00:00", deja)).toBe(true);
  });

  it("écarte une ligne plus ancienne : la table ne recule pas", () => {
    const deja = vue("2026-09-10T12:00:05.000000+00:00");
    expect(apporteDuNeuf("2026-09-10T12:00:04.000000+00:00", deja)).toBe(false);
  });

  it("écarte la ligne déjà appliquée : elle défairait le coup en cours", () => {
    const stamp = "2026-09-10T12:00:00.123456+00:00";
    expect(apporteDuNeuf(stamp, vue(stamp))).toBe(false);
  });

  it("accepte deux écritures de la même milliseconde", () => {
    // Le point sensible : `getTime()` tronque à la milliseconde, si bien que
    // ces deux écritures distinctes s'y confondent. Écarter la seconde
    // perdrait un vrai coup — l'écart se juge donc sur l'horodatage complet.
    const premiere = "2026-09-10T12:00:00.100200+00:00";
    const seconde = "2026-09-10T12:00:00.100700+00:00";
    expect(new Date(premiere).getTime()).toBe(new Date(seconde).getTime());
    expect(apporteDuNeuf(seconde, vue(premiere))).toBe(true);
  });

  it("écarte un horodatage illisible plutôt que de tout réappliquer", () => {
    expect(apporteDuNeuf("pas une date", vue("2026-09-10T12:00:00.000000+00:00"))).toBe(false);
  });
});

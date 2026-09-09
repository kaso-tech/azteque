import { describe, expect, it } from "vitest";
import { BACKGROUND_PRESETS, backgroundImage, sanitizeBackground } from "./backgrounds";
import { equippedBackground, FALLBACK_ITEMS } from "./shop";

/**
 * L'image d'un tapis est écrite dans la console, voyage par la base et finit
 * dans le style d'un élément chez tous les joueurs : c'est le seul endroit du
 * jeu où du texte saisi à la main devient de la présentation. Ce qui passe et
 * ce qui ne passe pas se teste donc, plutôt que de se relire.
 */
describe("images de tapis", () => {
  it("accepte un empilement de dégradés", () => {
    const css = "radial-gradient(circle at 50% 20%, oklch(0.9 0.1 90 / 0.4), transparent 70%)";
    expect(sanitizeBackground(css)).toBe(css);
  });

  it("accepte une image du site, en https, ou embarquée", () => {
    for (const cible of [
      "/fonds/marche.webp",
      "https://exemple.test/f.png",
      "data:image/png;base64,AA",
    ]) {
      expect(sanitizeBackground(`url("${cible}")`), cible).toBeTruthy();
    }
  });

  it("refuse ce qui ferait sortir le joueur du site", () => {
    expect(sanitizeBackground('url("javascript:alert(1)")')).toBeNull();
    expect(sanitizeBackground('url("http://exemple.test/f.png")')).toBeNull();
    expect(sanitizeBackground("url(//exemple.test/f.png)")).toBeNull();
    expect(sanitizeBackground('@import url("https://exemple.test/x.css")')).toBeNull();
    expect(sanitizeBackground("expression(alert(1))")).toBeNull();
    expect(sanitizeBackground("<script>")).toBeNull();
  });

  it("refuse le vide et la démesure", () => {
    expect(sanitizeBackground("")).toBeNull();
    expect(sanitizeBackground("   ")).toBeNull();
    expect(sanitizeBackground(null)).toBeNull();
    expect(sanitizeBackground(undefined)).toBeNull();
    expect(sanitizeBackground("a".repeat(4001))).toBeNull();
  });

  it("livre au moins deux tapis, tous valables", () => {
    const livres = Object.entries(BACKGROUND_PRESETS);
    expect(livres.length).toBeGreaterThanOrEqual(2);
    for (const [id, css] of livres) {
      expect(sanitizeBackground(css), id).toBe(css);
    }
  });

  it("retombe sur le préréglage du code quand la base n'a pas l'image", () => {
    expect(backgroundImage(null, "bg_aurore")).toBe(BACKGROUND_PRESETS["bg_aurore"]);
    expect(backgroundImage("", "bg_aurore")).toBe(BACKGROUND_PRESETS["bg_aurore"]);
    // L'image enregistrée l'emporte : c'est elle que la console a écrite.
    const propre = "radial-gradient(circle, red, transparent)";
    expect(backgroundImage(propre, "bg_aurore")).toBe(propre);
  });

  it("ne rend rien pour un article inconnu ou d'une autre nature", () => {
    expect(equippedBackground(null, FALLBACK_ITEMS)).toBeNull();
    expect(equippedBackground("av_roi", FALLBACK_ITEMS)).toBeNull();
    expect(equippedBackground("inconnu_total", FALLBACK_ITEMS)).toBeNull();
  });

  it("rend l'image du tapis porté", () => {
    expect(equippedBackground("bg_nuit", FALLBACK_ITEMS)).toBe(BACKGROUND_PRESETS["bg_nuit"]);
  });
});

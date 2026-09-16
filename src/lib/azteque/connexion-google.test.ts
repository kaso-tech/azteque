import { describe, expect, it } from "vitest";
import { passerParLeCourtier } from "./connexion-google";

/**
 * Le courtier de l'éditeur ne doit servir QUE là où il est nécessaire :
 * l'aperçu en iframe. Partout ailleurs, c'est Supabase qui connecte, et c'est
 * ce qui rend l'application transposable à n'importe quel projet.
 */
describe("choix du chemin de connexion", () => {
  const apercus = [
    "id-preview--x.lovableproject.com",
    "projet.lovable.app",
    "quelquechose.gpt-eng.com",
    "a.gptengineer.run",
    "lovableproject.com",
  ];

  it("emprunte le courtier dans un aperçu encadré", () => {
    for (const h of apercus) expect(passerParLeCourtier(h, true)).toBe(true);
  });

  it("s'en passe hors iframe, même sur un domaine d'aperçu", () => {
    // Ouvert dans un onglet : la redirection ordinaire revient très bien.
    for (const h of apercus) expect(passerParLeCourtier(h, false)).toBe(false);
  });

  it("s'en passe sur le domaine de production et en développement", () => {
    for (const h of ["azteque.live", "www.azteque.live", "localhost", "127.0.0.1"]) {
      expect(passerParLeCourtier(h, true)).toBe(false);
      expect(passerParLeCourtier(h, false)).toBe(false);
    }
  });

  it("ne se laisse pas prendre par un domaine qui imite un domaine d'aperçu", () => {
    // Le suffixe doit être un vrai suffixe de domaine, pas un bout de texte :
    // `lovable.app.attaquant.test` n'est pas un aperçu.
    for (const h of [
      "lovable.app.attaquant.test",
      "notlovable.app",
      "lovableproject.com.attaquant.test",
      "xlovableproject.com",
    ]) {
      expect(passerParLeCourtier(h, true)).toBe(false);
    }
  });
});

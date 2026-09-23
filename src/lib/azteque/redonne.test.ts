import { describe, expect, it } from "vitest";
import { DELAI_ANNONCE_REDONNE, redonneEcheance, type AnnonceRedonne } from "./redonne";

const annonce = (at: string): AnnonceRedonne => ({ par: "host", nom: "Kwame", at });

describe("échéance d'une redistribution annoncée", () => {
  it("laisse le délai d'annonce s'écouler avant de redistribuer", () => {
    const pose = Date.UTC(2026, 8, 22, 12, 0, 0);
    const echeance = redonneEcheance(annonce(new Date(pose).toISOString()));

    expect(echeance).toBe(pose + DELAI_ANNONCE_REDONNE);
    // Le serveur refuse tant qu'on n'y est pas : c'est ce refus qui garantit
    // que l'adversaire a vu passer l'annonce.
    expect(pose + DELAI_ANNONCE_REDONNE - 1).toBeLessThan(echeance);
  });

  it("laisse à l'adversaire de quoi lire", () => {
    // Un délai trop court ne prévient personne : l'annonce s'afficherait et
    // disparaîtrait dans le même battement de cil.
    expect(DELAI_ANNONCE_REDONNE).toBeGreaterThanOrEqual(3000);
    // Trop long, il rend la partie poussive alors que personne n'a le choix.
    expect(DELAI_ANNONCE_REDONNE).toBeLessThanOrEqual(8000);
  });

  it("ne gèle pas la donne sur une date illisible", () => {
    // Une annonce corrompue ne doit pas bloquer la table : mieux vaut
    // redistribuer tout de suite que rester sur un compte à rebours qui
    // n'arrive jamais au bout.
    expect(redonneEcheance(annonce("pas une date"))).toBe(-Infinity);
    expect(Date.now()).toBeGreaterThan(redonneEcheance(annonce("pas une date")));
  });
});

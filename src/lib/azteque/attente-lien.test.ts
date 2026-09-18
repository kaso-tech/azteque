import { describe, expect, it } from "vitest";
import { LINK_WAIT_LIMIT, enAttenteDeLien, verdictAttente } from "./attente-lien";

const sain = { lienSain: true, adversairePresent: true };
const absent = { lienSain: true, adversairePresent: false };
const nousMuets = { lienSain: false, adversairePresent: false };

describe("suspension de la réflexion", () => {
  it("se déclenche dès qu'un des deux liens manque", () => {
    expect(enAttenteDeLien(sain)).toBe(false);
    expect(enAttenteDeLien(absent)).toBe(true);
    expect(enAttenteDeLien({ lienSain: false, adversairePresent: true })).toBe(true);
  });
});

/**
 * Le bogue vécu : le joueur resté à la table attendait indéfiniment un
 * adversaire parti, sans jamais être déclaré vainqueur.
 *
 * Le décompte partait bien, mais son instant de DÉPART vivait dans la portée
 * d'un effet React dont les dépendances changeaient à chaque rendu — l'objet
 * de synchronisation était reconstruit à chaque fois, et il remontait jusqu'à
 * cet effet par la chaîne des `useCallback`. L'effet se rejouait donc sans
 * cesse, son nettoyage annulait le minuteur, et le compteur repartait de
 * soixante. Il n'atteignait jamais zéro.
 *
 * Une ÉCHÉANCE absolue, posée une fois, ne se laisse pas repousser : c'est ce
 * que ces cas vérifient.
 */
describe("verdict de l'attente", () => {
  const T0 = 1_000_000;
  const echeance = T0 + LINK_WAIT_LIMIT * 1000;

  it("décompte jusqu'au terme", () => {
    expect(verdictAttente(echeance, T0, absent).restant).toBe(LINK_WAIT_LIMIT);
    expect(verdictAttente(echeance, T0 + 30_000, absent).restant).toBe(30);
    expect(verdictAttente(echeance, echeance, absent).restant).toBe(0);
  });

  it("ne repart jamais en arrière, quel que soit le nombre d'appels", () => {
    // Le même verdict relu cent fois donne la même réponse : l'échéance ne
    // dépend que d'elle-même, pas du nombre de rendus qui l'ont consultée.
    let precedent = LINK_WAIT_LIMIT + 1;
    for (let ms = 0; ms <= LINK_WAIT_LIMIT * 1000; ms += 900) {
      const r = verdictAttente(echeance, T0 + ms, absent).restant;
      expect(r).toBeLessThanOrEqual(precedent);
      precedent = r;
    }
    // Le pas de 900 ms ne tombe pas sur l'échéance : on l'atteint à part.
    expect(verdictAttente(echeance, echeance, absent).restant).toBe(0);
  });

  it("déclare l'absence au terme du délai", () => {
    expect(verdictAttente(echeance, echeance, absent).declarer).toBe(true);
    expect(verdictAttente(echeance, echeance + 10_000, absent).declarer).toBe(true);
  });

  it("ne déclare rien avant le terme", () => {
    expect(verdictAttente(echeance, T0, absent).declarer).toBe(false);
    expect(verdictAttente(echeance, echeance - 1000, absent).declarer).toBe(false);
  });

  it("n'accuse personne quand c'est NOTRE lien qui est tombé", () => {
    // Nous ne sommes pas en état de constater quoi que ce soit ; l'adversaire
    // décompte de son côté le même délai contre nous.
    expect(verdictAttente(echeance, echeance, nousMuets).declarer).toBe(false);
  });

  it("n'accuse pas un adversaire revenu entre-temps", () => {
    expect(verdictAttente(echeance, echeance, sain).declarer).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { DELAI_ATTENTE_MS, echeanceAttente, estPartieReprenable, type MatchRow } from "./online";

const match = (p: Partial<MatchRow> = {}): MatchRow => ({
  id: "partie-1",
  code: "ABCDE",
  host_id: "hote",
  guest_id: "invite",
  host_name: "Hôte",
  guest_name: "Invité",
  status: "playing",
  state: null,
  settings: {},
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
  ...p,
});

describe("partie à reprendre", () => {
  it("accepte une partie commencée avec deux joueurs", () => {
    expect(estPartieReprenable(match())).toBe(true);
  });

  it("ignore une ancienne table encore en attente", () => {
    expect(estPartieReprenable(match({ status: "waiting", guest_id: null }))).toBe(false);
  });

  it("ignore une table incomplète même marquée en cours", () => {
    expect(estPartieReprenable(match({ guest_id: null }))).toBe(false);
    expect(estPartieReprenable(match({ host_id: null }))).toBe(false);
  });

  it("ignore une partie terminée", () => {
    expect(estPartieReprenable(match({ status: "finished" }))).toBe(false);
  });
});

describe("expiration d'une table sans adversaire", () => {
  it("court à partir de la création, pas de la dernière écriture", () => {
    const ne = Date.UTC(2026, 8, 22, 9, 0, 0);
    // Une ligne retouchée plus tard n'a pas pour autant trouvé d'adversaire :
    // sans quoi une table sans personne se prolongerait toute seule.
    const m = match({
      status: "waiting",
      guest_id: null,
      created_at: new Date(ne).toISOString(),
      updated_at: new Date(ne + 10 * 60 * 1000).toISOString(),
    });

    expect(echeanceAttente(m)).toBe(ne + DELAI_ATTENTE_MS);
  });

  it("laisse deux minutes, pas plus", () => {
    // Le serveur supprime la ligne au même moment (voir la migration
    // `tables_en_attente_expirent`) : les deux comptes doivent coïncider,
    // faute de quoi l'écran d'attente survivrait à sa propre table.
    expect(DELAI_ATTENTE_MS).toBe(2 * 60 * 1000);
  });

  it("ne fait pas patienter sur une date illisible", () => {
    expect(echeanceAttente(match({ created_at: "jamais" }))).toBe(-Infinity);
  });
});

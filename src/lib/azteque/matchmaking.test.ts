import { describe, expect, it } from "vitest";
import { lireRecherche, type LignePoll } from "./matchmaking";

const ligne = (p: Partial<LignePoll>): LignePoll => ({
  match_id: null,
  seat: null,
  devant: null,
  ...p,
});

describe("lecture d'une recherche d'adversaire", () => {
  it("reconnaît une table trouvée, aux deux sièges", () => {
    expect(lireRecherche(ligne({ match_id: "t1", seat: "host" }))).toEqual({
      trouve: true,
      matchId: "t1",
      seat: "host",
    });
    expect(lireRecherche(ligne({ match_id: "t1", seat: "guest" }))).toEqual({
      trouve: true,
      matchId: "t1",
      seat: "guest",
    });
  });

  it("reste en attente et rend le nombre de joueurs devant soi", () => {
    expect(lireRecherche(ligne({ devant: 3 }))).toEqual({ trouve: false, devant: 3 });
    expect(lireRecherche(ligne({ devant: 0 }))).toEqual({ trouve: false, devant: 0 });
  });

  it("reste en attente quand la base ne renvoie aucune ligne", () => {
    // `mm_join` ne renvoie rien du tout quand on entre simplement dans la file.
    expect(lireRecherche(undefined)).toEqual({ trouve: false, devant: 0 });
  });

  it("refuse une table dont le siège manque ou ne se comprend pas", () => {
    // Partir sans siège sûr ferait s'asseoir le joueur à la place de son
    // adversaire : la partie serait jouée à l'envers des deux côtés.
    expect(lireRecherche(ligne({ match_id: "t1" }))).toEqual({ trouve: false, devant: 0 });
    expect(lireRecherche(ligne({ match_id: "t1", seat: "spectateur" }))).toEqual({
      trouve: false,
      devant: 0,
    });
  });

  it("refuse un siège sans table", () => {
    expect(lireRecherche(ligne({ seat: "host" }))).toEqual({ trouve: false, devant: 0 });
  });
});

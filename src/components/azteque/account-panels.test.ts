import { describe, expect, it } from "vitest";
import { sortFriends, type FriendSort } from "./account-panels";
import type { Friend } from "@/lib/azteque/account";

function friend(overrides: Partial<Friend> & { id: string; username: string }): Friend {
  return {
    rating: 1000,
    avatar_kind: "google",
    avatar_url: null,
    status: "accepted",
    incoming: false,
    ...overrides,
  };
}

/**
 * Le tri de la liste d'amis.
 *
 * Chaque critère doit retomber sur l'alphabétique en cas d'égalité — sinon
 * l'ordre des amis à égalité (deux en ligne, deux à la même cote) resterait
 * celui, non spécifié, renvoyé par le serveur, capable de sauter d'un
 * rafraîchissement à l'autre.
 */
describe("sortFriends", () => {
  const zoe = friend({ id: "1", username: "Zoé", rating: 1200 });
  const alix = friend({ id: "2", username: "Alix", rating: 900 });
  const marc = friend({ id: "3", username: "Marc", rating: 1200 });
  const list = [zoe, alix, marc];

  it("alphabétique : ignore les majuscules et les accents habituels", () => {
    expect(sortFriends(list, "name", new Set()).map((f) => f.username)).toEqual([
      "Alix",
      "Marc",
      "Zoé",
    ]);
  });

  it("cote : la plus haute d'abord, égalité départagée par le nom", () => {
    // marc et zoé partagent la même cote (1200) : l'ordre alphabétique tranche.
    expect(sortFriends(list, "rating", new Set()).map((f) => f.username)).toEqual([
      "Marc",
      "Zoé",
      "Alix",
    ]);
  });

  it("en ligne d'abord : les connectés en tête, dans chaque groupe par ordre alphabétique", () => {
    const online = new Set(["1"]); // seule Zoé est en ligne
    expect(sortFriends(list, "online", online).map((f) => f.username)).toEqual([
      "Zoé",
      "Alix",
      "Marc",
    ]);
  });

  it("en ligne d'abord : personne en ligne retombe sur l'alphabétique", () => {
    expect(sortFriends(list, "online", new Set()).map((f) => f.username)).toEqual([
      "Alix",
      "Marc",
      "Zoé",
    ]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const original = [...list];
    sortFriends(list, "name", new Set());
    expect(list).toEqual(original);
  });

  it.each<FriendSort>(["online", "name", "rating"])(
    "renvoie toujours le même nombre d'amis (%s)",
    (sortBy) => {
      expect(sortFriends(list, sortBy, new Set())).toHaveLength(list.length);
    },
  );
});

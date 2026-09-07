import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Base simulée : juste ce que la vérification de pseudo interroge.
 *
 * `ilike` sans caractère générique compare sans tenir compte de la casse, comme
 * le fait PostgREST — c'est exactement le point que ces tests éprouvent.
 */
const base = {
  moi: "11111111-1111-1111-1111-111111111111",
  profils: [] as { id: string; username: string }[],
  session: true,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: base.session ? { user: { id: base.moi, is_anonymous: false } } : null },
        }),
    },
    from: (_table: string) => {
      const requete = {
        select: () => requete,
        limit: () =>
          Promise.resolve({
            data: base.profils
              .filter((p) => p.username.toLowerCase() === requete._motif.toLowerCase())
              .map((p) => ({ id: p.id })),
            error: null,
          }),
        ilike: (_col: string, motif: string) => {
          requete._motif = motif;
          return requete;
        },
        _motif: "",
      };
      return requete;
    },
  },
}));

const { isUsernameFree } = await import("./account");

describe("disponibilité d'un pseudo", () => {
  beforeEach(() => {
    base.session = true;
    base.profils = [
      { id: base.moi, username: "kofi_92" },
      { id: "22222222-2222-2222-2222-222222222222", username: "Ama" },
    ];
  });

  it("accepte un pseudo que personne ne porte", async () => {
    await expect(isUsernameFree("yao_du_soir")).resolves.toBe(true);
  });

  it("refuse celui d'un autre joueur", async () => {
    await expect(isUsernameFree("Ama")).resolves.toBe(false);
  });

  it("refuse celui d'un autre joueur écrit autrement", async () => {
    await expect(isUsernameFree("ama")).resolves.toBe(false);
    await expect(isUsernameFree("AMA")).resolves.toBe(false);
  });

  it("laisse reprendre son propre pseudo, et n'en changer que la casse", async () => {
    // Sans quoi le joueur qui rouvre le champ verrait son propre nom déclaré
    // pris, et ne pourrait plus corriger une majuscule.
    await expect(isUsernameFree("kofi_92")).resolves.toBe(true);
    await expect(isUsernameFree("Kofi_92")).resolves.toBe(true);
  });

  it("refuse un pseudo mal formé sans interroger la base", async () => {
    for (const mauvais of ["ab", "a b", "trop_long_pour_ce_jeu_2026", "kofi!", ""]) {
      await expect(isUsernameFree(mauvais)).resolves.toBe(false);
    }
  });

  it("ignore les espaces autour", async () => {
    await expect(isUsernameFree("  Ama  ")).resolves.toBe(false);
    await expect(isUsernameFree("  yao_du_soir ")).resolves.toBe(true);
  });
});

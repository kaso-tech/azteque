import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Base simulée.
 *
 * `colonnes` dit ce que la base connaît : les migrations de ce dépôt sont
 * appliquées à part, et le code tourne parfois en avance sur elle. Une base en
 * retard doit dégrader, pas rompre.
 *
 * `ilike` sans caractère générique compare sans tenir compte de la casse, comme
 * le fait PostgREST — c'est ce que la vérification de pseudo éprouve.
 */
const base = {
  moi: "11111111-1111-1111-1111-111111111111",
  colonnes: new Set<string>(),
  profils: [] as Record<string, unknown>[],
};

const TOUTES = ["id", "username", "rating", "avatar_kind", "avatar_url", "tokens"];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: base.moi, is_anonymous: false } } } }),
    },
    from: () => {
      const q = { cols: [] as string[], motif: "", like: "" };
      const repondre = () => {
        const inconnue = q.cols.find((c) => !base.colonnes.has(c));
        if (inconnue) {
          return Promise.resolve({
            data: null,
            error: {
              code: "PGRST204",
              message: `Could not find the '${inconnue}' column of 'profiles' in the schema cache`,
            },
          });
        }
        const garde = (p: Record<string, unknown>) => {
          const nom = String(p["username"]);
          if (q.motif) return nom.toLowerCase() === q.motif.toLowerCase();
          if (q.like) return nom.toLowerCase().includes(q.like.toLowerCase());
          return true;
        };
        return Promise.resolve({
          data: base.profils
            .filter(garde)
            .map((p) => Object.fromEntries(q.cols.map((c) => [c, p[c]]))),
          error: null,
        });
      };
      const chaine = {
        select: (cols: string) => {
          q.cols = cols.split(",").map((c) => c.trim());
          return chaine;
        },
        ilike: (_c: string, motif: string) => {
          if (motif.startsWith("%")) q.like = motif.replaceAll("%", "");
          else q.motif = motif;
          return chaine;
        },
        limit: repondre,
        then: (r: (v: unknown) => unknown) => repondre().then(r),
      };
      return chaine;
    },
  },
}));

const { isUsernameFree, searchPlayers, describeError } = await import("./account");

beforeEach(() => {
  base.colonnes = new Set(TOUTES);
  base.profils = [
    { id: base.moi, username: "kofi_92", rating: 1400, avatar_kind: "av_roi", avatar_url: null },
    {
      id: "22222222-2222-2222-2222-222222222222",
      username: "Ama",
      rating: 1750,
      avatar_kind: "femme",
      avatar_url: null,
    },
  ];
});

describe("disponibilité d'un pseudo", () => {
  it("accepte un pseudo que personne ne porte", async () => {
    await expect(isUsernameFree("yao_du_soir")).resolves.toBe(true);
  });

  it("refuse celui d'un autre joueur, quelle qu'en soit la casse", async () => {
    await expect(isUsernameFree("Ama")).resolves.toBe(false);
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

describe("lecture des profils quand la base est en retard", () => {
  it("rend tout ce qu'elle connaît quand elle est à jour", async () => {
    const [autre] = await searchPlayers("Ama");
    expect(autre).toMatchObject({ username: "Ama", rating: 1750, avatar_kind: "femme" });
  });

  it("garde la recherche vivante sans les colonnes d'avatar", async () => {
    // Le cas signalé en production : la migration des avatars n'était pas
    // passée, et c'est toute la recherche qui tombait, pas seulement l'image.
    base.colonnes = new Set(["id", "username", "rating", "tokens"]);
    const [autre] = await searchPlayers("Ama");
    expect(autre).toMatchObject({ username: "Ama", rating: 1750, avatar_kind: "google" });
    expect(autre?.avatar_url).toBeNull();
  });

  it("garde la recherche vivante même sans le classement", async () => {
    base.colonnes = new Set(["id", "username", "tokens"]);
    const [autre] = await searchPlayers("Ama");
    expect(autre).toMatchObject({ username: "Ama", avatar_kind: "google" });
    expect(autre?.rating).toBe(1000);
  });

  it("s'exclut toujours de ses propres résultats", async () => {
    base.colonnes = new Set(["id", "username"]);
    expect(await searchPlayers("kofi")).toEqual([]);
  });
});

describe("message d'une colonne manquante", () => {
  it("nomme la colonne et le fichier de migration à appliquer", () => {
    const message = describeError(
      {
        code: "PGRST204",
        message: "Could not find the 'avatar_kind' column of 'profiles' in the schema cache",
      },
      "Échec.",
    );
    expect(message).toContain("avatar_kind");
    expect(message).toContain("20260907120000_avatars_and_rename.sql");
  });

  it("reste utile pour une colonne qu'il ne connaît pas", () => {
    const message = describeError({ code: "42703", message: "column x does not exist" }, "Échec.");
    expect(message).toContain("migration");
  });
});

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
  rpc: { data: null as unknown, error: null as { code?: string; message?: string } | null },
  /** Ce que le dernier `update(...)` a reçu, pour vérifier ce qu'il ne doit pas contenir. */
  dernierUpdate: null as Record<string, unknown> | null,
  /** Nom et arguments du dernier appel de fonction serveur. */
  dernierRpc: null as { nom: string; args: Record<string, unknown> } | null,
};

const TOUTES = ["id", "username", "rating", "avatar_kind", "avatar_url", "tokens"];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: base.moi, is_anonymous: false } } } }),
    },
    rpc: (nom: string, args: Record<string, unknown>) => {
      base.dernierRpc = { nom, args };
      return Promise.resolve(base.rpc);
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
        select: (cols?: string) => {
          if (cols) q.cols = cols.split(",").map((c) => c.trim());
          return chaine;
        },
        ilike: (_c: string, motif: string) => {
          if (motif.startsWith("%")) q.like = motif.replaceAll("%", "");
          else q.motif = motif;
          return chaine;
        },
        limit: repondre,
        then: (r: (v: unknown) => unknown) => repondre().then(r),
        update: (valeurs: Record<string, unknown>) => {
          base.dernierUpdate = valeurs;
          return chaine;
        },
        eq: () => chaine,
        single: () =>
          Promise.resolve({ data: { ...base.profils[0], ...base.dernierUpdate }, error: null }),
      };
      return chaine;
    },
  },
}));

const {
  isUsernameFree,
  searchPlayers,
  describeError,
  nomDeColonne,
  syncGoogleIdentity,
  updateCountry,
  createProfile,
  myReferralCode,
  myReferrals,
  referralLink,
} = await import("./account");

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
  base.rpc = { data: null, error: null };
  base.dernierUpdate = null;
  base.dernierRpc = null;
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

describe("lecture du nom de colonne dans un message d'erreur", () => {
  // Trois formulations selon qui répond : PostgREST consultant son cache, le
  // moteur, et sa variante qualifiée. N'en reconnaître qu'une revient à ne rien
  // dire dans les deux autres cas — c'est ce qui a rendu une panne illisible.
  it.each([
    ["Could not find the 'avatar_kind' column of 'profiles' in the schema cache", "avatar_kind"],
    ['column "banned" does not exist', "banned"],
    ["column p.is_admin does not exist", "is_admin"],
    ["column profiles.rating does not exist", "rating"],
  ])("reconnaît %s", (message, attendu) => {
    expect(nomDeColonne(message)).toBe(attendu);
  });

  it("ne prétend rien quand le message ne dit pas de colonne", () => {
    expect(nomDeColonne("permission denied")).toBe("");
    expect(nomDeColonne("")).toBe("");
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

  it("reproduit toujours le message du serveur", () => {
    // Le remplacer par une phrase vague nous aveugle : sans lui, une panne
    // dont la lecture se trompe devient impossible à diagnostiquer.
    const brut = "column p.quelque_chose does not exist";
    expect(describeError({ code: "42703", message: brut }, "Échec.")).toContain(brut);
    const fonction = "Could not find the function public.is_admin";
    expect(describeError({ code: "PGRST202", message: fonction }, "Échec.")).toContain(fonction);
  });

  it("nomme le fichier pour une colonne d'administration", () => {
    const m = describeError({ code: "42703", message: "column p.is_admin does not exist" }, "x");
    expect(m).toContain("20260907160000_administration.sql");
  });
});

/**
 * Prénom et nom viennent de Google, et de lui seul : le joueur ne peut plus
 * les modifier. La fonction serveur relit elle-même la métadonnée posée par
 * Supabase Auth à la connexion — le client se contente de rapporter ce
 * qu'elle a rendu, jamais de lui dicter une valeur.
 */
describe("identité reprise de Google", () => {
  const profilVierge = {
    id: base.moi,
    username: "kofi_92",
    first_name: null,
    last_name: null,
  } as unknown as Parameters<typeof syncGoogleIdentity>[0];

  it("reprend ce que la fonction serveur rend", async () => {
    base.rpc = {
      data: { id: base.moi, username: "kofi_92", first_name: "Kofi", last_name: "Boateng" },
      error: null,
    };
    const profil = await syncGoogleIdentity(profilVierge);
    expect(profil).toMatchObject({ first_name: "Kofi", last_name: "Boateng" });
  });

  it("laisse le profil tel quel si la migration n'est pas encore passée", async () => {
    base.rpc = { data: null, error: { code: "PGRST202", message: "fonction introuvable" } };
    await expect(syncGoogleIdentity(profilVierge)).resolves.toBe(profilVierge);
  });
});

describe("changement de pays", () => {
  it("n'écrit que le pays, jamais le prénom ou le nom", async () => {
    await updateCountry("CI");
    expect(base.dernierUpdate).toEqual({ country: "CI" });
  });

  it("normalise en majuscules et sur deux lettres", async () => {
    await updateCountry("ci");
    expect(base.dernierUpdate).toEqual({ country: "CI" });
  });

  it("efface le pays avec une valeur vide", async () => {
    await updateCountry(null);
    expect(base.dernierUpdate).toEqual({ country: null });
  });
});

/**
 * Parrainage et jetons de bienvenue.
 *
 * Les deux versements sont faits par la base : ce qui se vérifie ici, c'est
 * que le client lui transmet exactement ce qu'il faut — et rien d'autre. Un
 * code vide doit devenir un vrai « pas de parrain », pas la chaîne vide, sans
 * quoi la fonction serveur chercherait un parrain nommé « » et refuserait
 * l'inscription.
 */
describe("parrainage", () => {
  it("crée le compte par la fonction serveur, code compris", async () => {
    base.rpc = { data: { id: base.moi, username: "kofi_92", tokens: 100 }, error: null };
    const profil = await createProfile("  kofi_92  ", " k7m2pq4b ");
    expect(base.dernierRpc).toEqual({
      nom: "create_profile",
      args: { _username: "kofi_92", _referral_code: "k7m2pq4b" },
    });
    expect(profil).toMatchObject({ tokens: 100 });
  });

  it("sans code, n'envoie pas de chaîne vide mais rien du tout", async () => {
    base.rpc = { data: { id: base.moi, username: "kofi_92" }, error: null };
    await createProfile("kofi_92");
    expect(base.dernierRpc?.args["_referral_code"]).toBeNull();
    await createProfile("kofi_92", "   ");
    expect(base.dernierRpc?.args["_referral_code"]).toBeNull();
  });

  it("refuse un pseudo invalide sans rien demander à la base", async () => {
    await expect(createProfile("ab")).rejects.toThrow(/3 à 20/);
    expect(base.dernierRpc).toBeNull();
  });

  it("traduit le pseudo déjà pris", async () => {
    base.rpc = { data: null, error: { code: "23505", message: "duplicate key" } };
    await expect(createProfile("kofi_92")).rejects.toThrow(/déjà pris/);
  });

  it("rend le code et la liste des filleuls", async () => {
    base.rpc = { data: "K7M2PQ4B", error: null };
    expect(await myReferralCode()).toBe("K7M2PQ4B");
    base.rpc = { data: [{ username: "ama", reward: 500, created_at: "2026-09-08" }], error: null };
    expect(await myReferrals()).toHaveLength(1);
  });

  it("supporte une base qui n'a encore rien à rendre", async () => {
    base.rpc = { data: null, error: null };
    expect(await myReferralCode()).toBe("");
    expect(await myReferrals()).toEqual([]);
  });

  it("construit un lien partageable", () => {
    expect(referralLink("K7M2PQ4B")).toContain("parrain=K7M2PQ4B");
  });
});

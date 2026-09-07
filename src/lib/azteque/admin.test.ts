import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Base simulée, réglable cas par cas.
 *
 * Ce que ces tests éprouvent n'est pas un droit — la base seule l'accorde —
 * mais le diagnostic : trois situations très différentes menaient au même
 * écran de refus, et l'on ne savait pas s'il fallait se connecter, exécuter une
 * requête ou appliquer une migration.
 */
const base = {
  session: null as { id: string; is_anonymous: boolean } | null,
  rpc: { data: null as unknown, error: null as { code?: string } | null },
  username: "kofi_92",
  /** Colonnes que la base connaît, pour éprouver les replis. */
  colonnes: new Set<string>(),
  profils: [] as Record<string, unknown>[],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: base.session ? { user: base.session } : null } }),
    },
    rpc: () => Promise.resolve(base.rpc),
    from: () => {
      let cols: string[] = [];
      const q = {
        select: (c: string) => {
          cols = c.split(",").map((x) => x.trim());
          return q;
        },
        eq: () => q,
        ilike: () => q,
        order: () => q,
        maybeSingle: () => Promise.resolve({ data: { username: base.username }, error: null }),
        limit: () => {
          const inconnue = cols.find((c) => !base.colonnes.has(c));
          if (inconnue) {
            return Promise.resolve({
              data: null,
              error: { code: "42703", message: `column p.${inconnue} does not exist` },
            });
          }
          return Promise.resolve({
            data: base.profils.map((p) => Object.fromEntries(cols.map((c) => [c, p[c]]))),
            error: null,
          });
        },
      };
      return q;
    },
  },
}));

const { adminAccess, adminListPlayers, amIAdmin, depuisBase64, loadSoundFiles, versBase64 } =
  await import("./admin");

beforeEach(() => {
  base.session = { id: "u1", is_anonymous: false };
  base.rpc = { data: null, error: null };
  base.username = "kofi_92";
  base.colonnes = new Set([
    "id",
    "username",
    "tokens",
    "rating",
    "rated_games",
    "avatar_kind",
    "avatar_url",
    "is_admin",
    "banned",
    "created_at",
  ]);
  base.profils = [
    {
      id: "u1",
      username: "kofi_92",
      tokens: 4250,
      rating: 1712,
      rated_games: 47,
      is_admin: true,
      banned: false,
      created_at: "2026-08-01",
      avatar_kind: "av_roi",
      avatar_url: null,
    },
  ];
});

describe("accès à la console", () => {
  it("ouvre pour un administrateur", async () => {
    base.rpc = { data: true, error: null };
    await expect(adminAccess()).resolves.toEqual({ state: "admin" });
    await expect(amIAdmin()).resolves.toBe(true);
  });

  it("demande de se connecter quand il n'y a pas de session", async () => {
    base.session = null;
    await expect(adminAccess()).resolves.toEqual({ state: "anonymous" });
  });

  it("ne prend pas une session anonyme pour une identité", async () => {
    base.session = { id: "u1", is_anonymous: true };
    await expect(adminAccess()).resolves.toEqual({ state: "anonymous" });
  });

  it("rend le pseudo quand le compte existe mais n'administre pas", async () => {
    base.rpc = { data: false, error: null };
    // Le pseudo sert à composer la requête qui sacre le premier administrateur.
    await expect(adminAccess()).resolves.toEqual({ state: "not-admin", username: "kofi_92" });
    await expect(amIAdmin()).resolves.toBe(false);
  });

  it("distingue une migration absente d'un droit manquant", async () => {
    for (const code of ["PGRST202", "42883"]) {
      base.rpc = { data: null, error: { code } };
      await expect(adminAccess()).resolves.toEqual({ state: "missing-migration" });
    }
  });

  it("ne confond pas une autre erreur avec une migration absente", async () => {
    base.rpc = { data: null, error: { code: "42501" } };
    await expect(adminAccess()).resolves.toEqual({ state: "anonymous" });
  });
});

describe("liste des joueurs quand la base est en retard", () => {
  it("passe par la fonction serveur quand elle répond", async () => {
    base.rpc = { data: [{ id: "u1", username: "kofi_92", purchases: 6 }], error: null };
    const [j] = await adminListPlayers();
    expect(j).toMatchObject({ username: "kofi_92", purchases: 6 });
  });

  it("relit les profils quand la fonction manque", async () => {
    // La console doit rester utilisable même si la migration n'est pas passée :
    // l'administrateur y perd le décompte des achats, pas ses joueurs.
    base.rpc = { data: null, error: { code: "PGRST202" } };
    const [j] = await adminListPlayers();
    expect(j).toMatchObject({ username: "kofi_92", tokens: 4250, is_admin: true, purchases: 0 });
  });

  it("retire les colonnes que la base ignore, une à une", async () => {
    base.rpc = { data: null, error: { code: "42703" } };
    base.colonnes = new Set(["id", "username", "tokens", "rating", "created_at"]);
    const [j] = await adminListPlayers();
    expect(j).toMatchObject({ username: "kofi_92", rating: 1712, is_admin: false, banned: false });
  });

  it("tient encore avec le strict minimum", async () => {
    base.rpc = { data: null, error: { code: "42703" } };
    base.colonnes = new Set(["id", "username", "tokens"]);
    const [j] = await adminListPlayers();
    expect(j).toMatchObject({ username: "kofi_92", tokens: 4250, rating: 1000 });
  });

  it("ne masque pas une erreur d'un autre ordre", async () => {
    base.rpc = { data: null, error: { code: "42501" } };
    await expect(adminListPlayers()).rejects.toMatchObject({ code: "42501" });
  });
});

/**
 * Les fichiers de sons voyagent en base64 : la base les garde dans une colonne
 * texte, sans seau de stockage à configurer. Le codage doit rendre exactement
 * les octets qu'on lui a donnés, y compris sur un fichier assez gros pour que
 * `btoa` déborde la pile si on le lui passe d'un bloc.
 */
describe("sons locaux", () => {
  it("rend les octets qu'on lui a confiés", () => {
    const octets = new Uint8Array(200000);
    for (let i = 0; i < octets.length; i += 1) octets[i] = (i * 7) % 256;
    const rendu = new Uint8Array(depuisBase64(versBase64(octets.buffer)));
    expect(rendu.length).toBe(octets.length);
    expect(rendu).toEqual(octets);
  });

  it("code aussi le vide et les longueurs qui ne tombent pas juste", () => {
    for (const taille of [0, 1, 2, 3, 4, 5]) {
      const octets = new Uint8Array(taille).fill(0xab);
      expect(new Uint8Array(depuisBase64(versBase64(octets.buffer)))).toEqual(octets);
    }
  });

  it("laisse la synthèse en place quand la base ne répond rien", async () => {
    // La migration des sons locaux n'est peut-être pas encore passée : le jeu
    // doit s'ouvrir quand même, avec les sons du code.
    await expect(loadSoundFiles()).resolves.toBeUndefined();
  });
});

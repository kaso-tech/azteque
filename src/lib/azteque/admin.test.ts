import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Base simulée, réglable cas par cas.
 *
 * Ce que ces tests éprouvent n'est pas un droit — la base seule l'accorde —
 * mais le diagnostic : trois situations très différentes menaient au même
 * écran de refus, et l'on ne savait pas s'il fallait se connecter, exécuter une
 * requête ou appliquer une migration.
 */
interface FauxObjetStorage {
  name: string;
  metadata: { mimetype: string; size: number };
  updated_at: string;
}

const base = {
  session: null as { id: string; is_anonymous: boolean } | null,
  rpc: { data: null as unknown, error: null as { code?: string } | null },
  username: "kofi_92",
  /** Colonnes que la base connaît, pour éprouver les replis. */
  colonnes: new Set<string>(),
  profils: [] as Record<string, unknown>[],
  /** Le seau Storage des sons, tel qu'une console le laisserait. */
  seau: [] as FauxObjetStorage[],
  seauListeErreur: null as { code?: string; message?: string } | null,
  seauEcritureErreur: null as { code?: string; message?: string } | null,
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
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: base.seau, error: base.seauListeErreur }),
        upload: (path: string, bytes: ArrayBuffer, opts: { contentType: string }) => {
          if (base.seauEcritureErreur) return Promise.resolve({ error: base.seauEcritureErreur });
          base.seau.push({
            name: path,
            metadata: { mimetype: opts.contentType, size: (bytes as ArrayBuffer).byteLength },
            updated_at: new Date().toISOString(),
          });
          return Promise.resolve({ error: null });
        },
        remove: (paths: string[]) => {
          if (base.seauEcritureErreur) return Promise.resolve({ error: base.seauEcritureErreur });
          base.seau = base.seau.filter((o) => !paths.includes(o.name));
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://exemple.test/${path}` } }),
      }),
    },
  },
}));

// `loadSoundFiles` récupère chaque fichier par une requête HTTP ordinaire —
// c'est tout l'intérêt de servir les sons par URL publique plutôt que par
// une colonne de la base. Une réponse minimale suffit ici : ce test ne juge
// pas le décodage audio, déjà couvert ailleurs (sfx.samples.test.ts).
vi.stubGlobal(
  "fetch",
  vi.fn(() =>
    Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) }),
  ),
);

const {
  adminAccess,
  adminClearSoundFile,
  adminListPlayers,
  adminSetSoundFile,
  amIAdmin,
  listSoundFiles,
  loadSoundFiles,
} = await import("./admin");

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
  base.seau = [];
  base.seauListeErreur = null;
  base.seauEcritureErreur = null;
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
 * Les fichiers de sons vivent dans un seau Supabase Storage, pas dans une
 * colonne de la base : le fichier part tel quel, sans base64, et sert par une
 * URL publique. Le nom encode l'identifiant du son et un horodatage, pour que
 * remplacer un fichier ne réutilise jamais l'adresse d'une version qu'un
 * navigateur aurait mise en cache.
 */
describe("sons locaux", () => {
  it("dépose un fichier et le retrouve dans le catalogue", async () => {
    const info = await adminSetSoundFile("cheer", "audio/mpeg", new ArrayBuffer(64));
    expect(info).toMatchObject({ id: "cheer", mime: "audio/mpeg", bytes: 64 });
    expect(info.path).toMatch(/^cheer-\d+\.mp3$/);

    const liste = await listSoundFiles();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ id: "cheer", path: info.path });
  });

  it("ignore, dans le catalogue, ce qui ne nomme pas un son du jeu", async () => {
    base.seau = [
      { name: "cheer-1.mp3", metadata: { mimetype: "audio/mpeg", size: 10 }, updated_at: "x" },
      // Un fichier déposé par erreur, ou par un autre usage du même projet.
      { name: "notes-de-service.pdf", metadata: { mimetype: "", size: 0 }, updated_at: "x" },
    ];
    const liste = await listSoundFiles();
    expect(liste.map((f) => f.id)).toEqual(["cheer"]);
  });

  it("remplacer un son retire l'ancienne version, il n'en reste qu'une", async () => {
    await adminSetSoundFile("cheer", "audio/mpeg", new ArrayBuffer(10));
    await adminSetSoundFile("cheer", "audio/wav", new ArrayBuffer(20));
    const liste = await listSoundFiles();
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ mime: "audio/wav", bytes: 20 });
  });

  it("garde un son de chaque, sans mélanger les identifiants", async () => {
    await adminSetSoundFile("cheer", "audio/mpeg", new ArrayBuffer(10));
    await adminSetSoundFile("taunt", "audio/wav", new ArrayBuffer(20));
    const liste = await listSoundFiles();
    expect(liste.map((f) => f.id).sort()).toEqual(["cheer", "taunt"]);
  });

  it("retire le fichier d'un son : le catalogue l'oublie", async () => {
    await adminSetSoundFile("cheer", "audio/mpeg", new ArrayBuffer(10));
    await adminClearSoundFile("cheer");
    expect(await listSoundFiles()).toEqual([]);
  });

  it("répercute un refus du seau — un joueur ordinaire, par exemple", async () => {
    base.seauEcritureErreur = { message: "new row violates row-level security policy" };
    await expect(adminSetSoundFile("cheer", "audio/mpeg", new ArrayBuffer(10))).rejects.toThrow();
  });

  it("laisse la synthèse en place quand le seau ne répond rien", async () => {
    // Le seau n'existe peut-être pas encore sur ce projet : le jeu doit
    // s'ouvrir quand même, avec les sons du code.
    base.seauListeErreur = { code: "404" };
    await expect(loadSoundFiles()).resolves.toBeUndefined();
    expect(await listSoundFiles()).toEqual([]);
  });
});

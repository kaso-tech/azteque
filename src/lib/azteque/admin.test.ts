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
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: base.session ? { user: base.session } : null } }),
    },
    rpc: () => Promise.resolve(base.rpc),
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: { username: base.username }, error: null }),
      };
      return q;
    },
  },
}));

const { adminAccess, amIAdmin } = await import("./admin");

beforeEach(() => {
  base.session = { id: "u1", is_anonymous: false };
  base.rpc = { data: null, error: null };
  base.username = "kofi_92";
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

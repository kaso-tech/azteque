import { describe, expect, it, vi } from "vitest";
import { isTransientError, withDeadline, withRetry } from "./net";

/**
 * La résilience réseau du jeu en ligne.
 *
 * C'est le seul rempart entre une coupure passagère et une table qui reste
 * figée sans que les deux joueurs sachent pourquoi — d'où ces tests sur ses
 * trois pièces : la classification (transitoire ou refus métier), l'attente
 * qui double, et le délai qui borne une tentative bloquée.
 */
describe("isTransientError", () => {
  it.each([
    ["TypeError: Failed to fetch", "Chrome / Edge"],
    ["TypeError: Load failed", "Safari"],
    ["TypeError: NetworkError when attempting to fetch resource.", "Firefox"],
    ["TypeError: fetch failed", "Node / undici (applyMatchAction côté serveur)"],
    ["AbortError: The operation was aborted.", "délai dépassé (AbortController)"],
    ["network-timeout", "withDeadline"],
  ])("reconnaît %s (%s)", (message) => {
    expect(isTransientError(new Error(message))).toBe(true);
  });

  it("lit `details`, pas seulement `message` : la cause Node y atterrit seule", () => {
    // Reproduit la forme exacte que postgrest-js construit pour un fetch qui
    // échoue avant toute réponse (voir le commentaire de TRANSIENT) : le
    // message reste générique, la cause précise (ECONNREFUSED...) ne vit que
    // dans `details`.
    const e = {
      message: "TypeError: fetch failed",
      details: "TypeError: fetch failed\n\nCaused by: Error: connect ECONNREFUSED (ECONNREFUSED)",
    };
    expect(isTransientError(e)).toBe(true);
  });

  it("reconnaît un statut de passerelle dans le corps brut de la réponse", () => {
    expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("Too Many Requests (429)"))).toBe(true);
  });

  it("ne reconnaît PAS un refus métier du serveur", () => {
    expect(isTransientError(new Error("Ce coup n'est pas autorisé."))).toBe(false);
    expect(isTransientError(new Error("Vous ne participez pas à cette partie."))).toBe(false);
    expect(isTransientError(new Error("Solde insuffisant : proposez une mise plus basse."))).toBe(
      false,
    );
  });

  it("un navigateur qui se déclare hors ligne est toujours transitoire", () => {
    const nav = { onLine: false };
    vi.stubGlobal("navigator", nav);
    try {
      expect(isTransientError(new Error("Ce coup n'est pas autorisé."))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("une valeur qui n'est pas une Error ne fait pas planter la classification", () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError("fetch failed")).toBe(true);
  });
});

describe("withDeadline", () => {
  it("laisse passer une réponse arrivée à temps", async () => {
    await expect(withDeadline(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("rejette au bout du délai si rien n'a répondu", async () => {
    vi.useFakeTimers();
    try {
      const jamais = new Promise(() => {});
      const p = withDeadline(jamais, 5000);
      const assertion = expect(p).rejects.toThrow("network-timeout");
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("propage le rejet d'origine sans attendre le délai", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("Ce coup n'est pas autorisé.")), 5000),
    ).rejects.toThrow("Ce coup n'est pas autorisé.");
  });
});

describe("withRetry", () => {
  it("ne réessaie pas un refus métier : il remonte dès le premier échec", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Ce coup n'est pas autorisé."));
    await expect(withRetry(fn, { attempts: 4, backoffMs: 1 })).rejects.toThrow(
      "Ce coup n'est pas autorisé.",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("réessaie un échec transitoire jusqu'à ce qu'il aboutisse", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("TypeError: Failed to fetch"))
      .mockRejectedValueOnce(new Error("TypeError: Failed to fetch"))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();
    await expect(withRetry(fn, { attempts: 4, backoffMs: 1, onRetry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("renonce après le nombre de tentatives prévu, même si l'échec reste transitoire", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("TypeError: Failed to fetch"));
    await expect(withRetry(fn, { attempts: 3, backoffMs: 1 })).rejects.toThrow(
      "TypeError: Failed to fetch",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("double l'attente à chaque reprise, plafonnée à 6 s", async () => {
    vi.useFakeTimers();
    try {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce("ok");
      const attentes: number[] = [];
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      const p = withRetry(fn, { attempts: 5, backoffMs: 700, deadlineMs: 100 });
      // Chaque reprise programme deux minuteries : le délai de la tentative
      // (withDeadline) et l'attente avant la suivante — on ne retient que
      // celles au-delà de 100 ms (le délai de tentative) pour isoler l'attente.
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(0);
        const wait = setTimeoutSpy.mock.calls.map((c) => c[1] as number).find((ms) => ms > 100);
        if (wait !== undefined) attentes.push(wait);
        setTimeoutSpy.mockClear();
        await vi.advanceTimersByTimeAsync(700 * 2 ** i);
      }
      await expect(p).resolves.toBe("ok");
      expect(attentes).toEqual([700, 1400, 2800]);
    } finally {
      vi.useRealTimers();
    }
  });
});

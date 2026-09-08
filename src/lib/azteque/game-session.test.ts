import { afterEach, describe, expect, it, vi } from "vitest";
import { announceFreed, currentGameSession, onFreed, registerGameSession } from "./game-session";

/**
 * Le registre est un singleton de module : chaque test doit repartir d'un
 * état vierge, faute de quoi une partie « oubliée » par un test précédent
 * fausserait le suivant. On l'efface sans passer par un effacement PÉRIMÉ
 * (voir plus bas), pour ne jamais déclencher `onFreed` d'un test à l'autre.
 */
afterEach(() => {
  const s = currentGameSession();
  if (s) registerGameSession(s.kind, () => {});
});

describe("session de jeu en cours", () => {
  it("mémorise la partie en cours et la fonction pour la quitter", () => {
    const leave = vi.fn();
    registerGameSession("solo", leave);
    expect(currentGameSession()).toEqual({ kind: "solo", leave });
  });

  it("l'effacement retire la partie enregistrée", () => {
    const unregister = registerGameSession("online", () => {});
    unregister();
    expect(currentGameSession()).toBeNull();
  });

  it("un effacement périmé (partie déjà remplacée) ne touche pas la nouvelle", () => {
    const unregisterA = registerGameSession("solo", () => {});
    registerGameSession("online", () => {});
    unregisterA(); // la partie A a déjà été remplacée par B : sans effet
    expect(currentGameSession()?.kind).toBe("online");
  });

  it("une seule partie à la fois : la dernière enregistrée l'emporte", () => {
    registerGameSession("solo", () => {});
    registerGameSession("online", () => {});
    expect(currentGameSession()?.kind).toBe("online");
  });
});

describe("réveil d'une invitation reportée", () => {
  it("avertit les auditeurs quand une partie se termine ou se quitte", () => {
    const fn = vi.fn();
    const off = onFreed(fn);
    const unregister = registerGameSession("solo", () => {});
    expect(fn).not.toHaveBeenCalled();
    unregister();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("avertit aussi sans qu'une partie ait jamais été enregistrée (fin de tour)", () => {
    const fn = vi.fn();
    const off = onFreed(fn);
    announceFreed();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
  });

  it("un effacement périmé n'avertit personne : la partie en cours n'a pas changé d'état", () => {
    const fn = vi.fn();
    const off = onFreed(fn);
    const unregisterA = registerGameSession("solo", () => {});
    registerGameSession("online", () => {}); // remplace A
    unregisterA(); // périmé
    expect(fn).not.toHaveBeenCalled();
    off();
  });

  it("un auditeur retiré ne reçoit plus rien", () => {
    const fn = vi.fn();
    const off = onFreed(fn);
    off();
    announceFreed();
    expect(fn).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_BONUS,
  claimLocalDailyBonus,
  getTokens,
  clearPendingReferralCode,
  localBonusDay,
  pendingReferralCode,
  rememberReferralCode,
  setTokens,
  todayKey,
} from "./tokens";

/**
 * Les tests s'exécutent sous Node, où `window` n'existe pas : ces fonctions y
 * renonceraient d'elles-mêmes. On installe donc le strict nécessaire — un
 * stockage en mémoire — pour éprouver la règle plutôt que la garde.
 */
function installStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
  return map;
}

afterEach(() => vi.unstubAllGlobals());

describe("cadeau quotidien du navigateur", () => {
  beforeEach(() => installStorage());

  it("verse le cadeau une fois, puis plus rien le même jour", () => {
    setTokens(0);
    expect(claimLocalDailyBonus()).toBe(DAILY_BONUS);
    expect(claimLocalDailyBonus()).toBeNull();
    expect(claimLocalDailyBonus()).toBeNull();
    expect(getTokens()).toBe(DAILY_BONUS);
  });

  it("s'ajoute au solde déjà présent", () => {
    setTokens(320);
    expect(claimLocalDailyBonus()).toBe(320 + DAILY_BONUS);
  });

  it("revient le lendemain", () => {
    setTokens(0);
    claimLocalDailyBonus();
    expect(localBonusDay()).toBe(todayKey());
    // Le jeu rouvert le lendemain : la journée retenue n'est plus celle du jour.
    localStorage.setItem("azteque-daily-bonus", "2020-01-01");
    expect(claimLocalDailyBonus()).toBe(2 * DAILY_BONUS);
  });

  it("ne se verse pas si le navigateur refuse d'en garder la trace", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("stockage refusé");
      },
      removeItem: () => {},
    };
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("localStorage", storage);
    // Sans mémoire du versement, le cadeau serait dû à chaque ouverture : on
    // préfère ne rien verser que le verser sans fin.
    expect(claimLocalDailyBonus()).toBeNull();
  });

  it("compte les journées sur la même horloge que le serveur", () => {
    expect(todayKey()).toBe(new Date().toISOString().slice(0, 10));
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * Le code de parrainage aperçu dans l'adresse.
 *
 * Le lien mène à l'accueil, l'inscription se fait dans le salon, et Google
 * ramène entre-temps sur la racine du site : le code doit survivre à ces
 * trois sauts, faute de quoi le parrain n'est jamais crédité et personne ne
 * comprend pourquoi.
 */
describe("code de parrainage retenu du lien", () => {
  const installe = (search: string) => {
    const map = installStorage();
    vi.stubGlobal("window", {
      localStorage: globalThis.localStorage,
      location: { search },
    });
    return map;
  };

  it("retient le code de l'adresse, en majuscules", () => {
    installe("?parrain=k7m2pq4b");
    rememberReferralCode();
    expect(pendingReferralCode()).toBe("K7M2PQ4B");
  });

  it("survit à la disparition de l'adresse", () => {
    installe("?parrain=K7M2PQ4B");
    rememberReferralCode();
    // Page suivante : plus rien dans l'adresse, le code doit tenir.
    vi.stubGlobal("window", { localStorage: globalThis.localStorage, location: { search: "" } });
    rememberReferralCode();
    expect(pendingReferralCode()).toBe("K7M2PQ4B");
  });

  it("ne retient rien sans code", () => {
    installe("");
    rememberReferralCode();
    expect(pendingReferralCode()).toBe("");
  });

  it("s'efface une fois le compte créé", () => {
    installe("?parrain=K7M2PQ4B");
    rememberReferralCode();
    clearPendingReferralCode();
    expect(pendingReferralCode()).toBe("");
  });
});

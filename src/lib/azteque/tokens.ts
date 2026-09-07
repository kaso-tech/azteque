const KEY = "azteque-tokens";

/** Mises proposables avant le début d'un tour en ligne. */
export const BET_STEPS = [25, 50, 100, 200, 500, 750, 1000, 2500, 5000] as const;

export function getTokens(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, Number(localStorage.getItem(KEY)) || 0);
}

export function setTokens(value: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, String(Math.max(0, Math.round(value))));
}

export function addTokens(delta: number): number {
  const next = Math.max(0, getTokens() + delta);
  setTokens(next);
  return next;
}

/* ---------- Cadeau quotidien ---------- */

/** Montant offert une fois par jour à l'ouverture du jeu. */
export const DAILY_BONUS = 50;

const DAILY_KEY = "azteque-daily-bonus";

/**
 * Journée civile en cours, telle que la voit le serveur.
 *
 * La base compare à `current_date`, exprimée en UTC : le client doit se régler
 * sur la même horloge, faute de quoi le cadeau paraîtrait disponible ici et
 * refusé là-bas, en fin de journée.
 */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Date du dernier cadeau pris dans ce navigateur, hors connexion. */
export function localBonusDay(): string {
  if (typeof window === "undefined") return todayKey();
  try {
    return localStorage.getItem(DAILY_KEY) ?? "";
  } catch {
    // Stockage refusé : on considère le cadeau comme pris, plutôt que de le
    // proposer à chaque ouverture sans jamais pouvoir s'en souvenir.
    return todayKey();
  }
}

/**
 * Verse le cadeau du jour dans le solde du navigateur.
 *
 * Renvoie le nouveau solde, ou `null` si le cadeau avait déjà été pris —
 * deux onglets ouverts ensemble ne doivent pas le verser deux fois.
 */
export function claimLocalDailyBonus(): number | null {
  if (typeof window === "undefined") return null;
  if (localBonusDay() === todayKey()) return null;
  try {
    localStorage.setItem(DAILY_KEY, todayKey());
  } catch {
    return null;
  }
  return addTokens(DAILY_BONUS);
}

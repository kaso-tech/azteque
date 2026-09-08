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

/* ---------- Bienvenue et parrainage ---------- */

/**
 * Jetons offerts à la création d'un compte, et jetons versés au parrain pour
 * chaque filleul inscrit avec son code.
 *
 * Ces deux nombres ne servent ICI qu'à l'affichage. Les versements eux-mêmes
 * sont faits par la base (`create_profile`, migration 20260908000000), qui
 * seule fait foi : les jetons ne s'écrivent jamais depuis le navigateur. Les
 * changer d'un seul côté ferait donc mentir l'interface, pas les comptes.
 */
export const WELCOME_BONUS = 100;
export const REFERRAL_REWARD = 500;

const PARRAIN_KEY = "azteque-parrain";

/**
 * Retient le code de parrainage aperçu dans l'adresse.
 *
 * Un lien de parrainage mène à l'accueil, mais l'inscription se fait dans le
 * salon en ligne, après un aller-retour chez Google qui ramène sur la racine
 * du site. Le code ne survivrait donc ni à la navigation ni à la redirection
 * s'il ne tenait qu'à la barre d'adresse : on le met de côté dès qu'on le
 * voit, et on ne le relit qu'au moment de créer le compte.
 */
export function rememberReferralCode(): void {
  if (typeof window === "undefined") return;
  const vu = new URLSearchParams(window.location.search).get("parrain")?.trim().toUpperCase();
  if (!vu) return;
  try {
    localStorage.setItem(PARRAIN_KEY, vu.slice(0, 12));
  } catch {
    // Stockage refusé : le champ du formulaire reste saisissable à la main.
  }
}

/** Le code mis de côté, s'il y en a un. */
export function pendingReferralCode(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(PARRAIN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Le compte est créé : le code a joué son rôle. */
export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PARRAIN_KEY);
  } catch {
    /* rien à faire */
  }
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

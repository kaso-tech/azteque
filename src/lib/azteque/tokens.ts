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

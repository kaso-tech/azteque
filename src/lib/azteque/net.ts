/**
 * Petites aides réseau pour le jeu en ligne sur connexion faible.
 *
 * Sur un lien lent ou instable, une requête peut mettre longtemps à répondre
 * ou ne jamais aboutir. Sans garde-fou, un coup envoyé se perd et la table
 * reste figée : les deux joueurs s'attendent. On distingue donc les échecs
 * TRANSITOIRES (coupure, délai dépassé, erreur passagère du serveur), qu'il
 * faut réessayer, des refus MÉTIER du serveur (« Ce coup n'est pas autorisé »),
 * qu'il ne faut surtout pas rejouer.
 */

/** Rejette si la promesse n'a pas répondu dans le délai imparti. */
export function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("network-timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const TRANSIENT = [
  "network-timeout",
  "failed to fetch",
  "load failed",
  "networkerror",
  "network request failed",
  "fetch failed",
  "aborted",
  "timeout",
  "socket",
  "connection",
  "502",
  "503",
  "504",
  "429",
];

/**
 * Vrai si l'échec vient du transport et non d'un refus raisonné du serveur.
 * Un refus métier porte un message en clair rédigé par `match-actions.ts`.
 */
export function isTransientError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return TRANSIENT.some((needle) => msg.includes(needle));
}

export interface RetryOptions {
  /** Nombre total de tentatives, la première comprise. */
  attempts?: number;
  /** Délai maximal d'une tentative (ms). */
  deadlineMs?: number;
  /** Attente avant la première reprise (ms), doublée à chaque reprise. */
  backoffMs?: number;
  /** Notifié quand une reprise est programmée (pour l'affichage). */
  onRetry?: (attempt: number) => void;
}

/**
 * Rejoue l'appel tant qu'il échoue pour une raison transitoire, avec une
 * attente qui double à chaque essai. Les actions du jeu sont validées et
 * idempotentes côté serveur (une action déjà appliquée est rejetée avec un
 * message clair), une reprise ne peut donc pas jouer deux fois la même carte.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const deadlineMs = opts.deadlineMs ?? 12_000;
  let wait = opts.backoffMs ?? 700;
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await withDeadline(fn(), deadlineMs);
    } catch (e) {
      last = e;
      if (!isTransientError(e) || i === attempts - 1) throw e;
      opts.onRetry?.(i + 1);
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 6_000);
    }
  }
  throw last;
}

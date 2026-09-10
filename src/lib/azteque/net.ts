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

/**
 * Motifs vérifiés dans les sources de `@supabase/postgrest-js` (celle qui
 * porte tous les appels de ce jeu, directs ou via `applyMatchAction`) —
 * jamais devinés.
 *
 * `PostgrestError` ne porte NI code HTTP NI cause détaillée : seuls
 * `message`, `details`, `hint`, `code` (un code Postgres/PostgREST, pas un
 * statut). Selon la façon dont la requête échoue, le texte à reconnaître
 * change d'endroit :
 *
 * - Le fetch échoue avant toute réponse (coupure, DNS, borne — le cas le plus
 *   courant en jeu) : `message` devient `"<NomErreur>: <message natif>"`
 *   (p. ex. "TypeError: Failed to fetch" sur Chrome/Edge, "TypeError: Load
 *   failed" sur Safari, "TypeError: NetworkError when attempting to fetch
 *   resource" sur Firefox, "TypeError: fetch failed" sous Node/undici côté
 *   serveur) — ces quatre expressions figurent ci-dessous telles quelles.
 *   Le code de la cause Node (ECONNREFUSED, ECONNRESET, ETIMEDOUT,
 *   ENOTFOUND, EAI_AGAIN) atterrit dans `details`, PAS dans `message` :
 *   `isTransientError` lit donc les deux.
 * - Le serveur répond mais avec un statut d'erreur HTTP (502/503/429 d'une
 *   passerelle, pas de Postgrest lui-même) : le corps brut de la réponse
 *   devient `message` tel quel. Le numéro n'y figure QUE si la page d'erreur
 *   de l'infrastructure le mentionne (le cas le plus souvent, mais pas
 *   garanti) — ces motifs sont donc un filet, pas une lecture fiable du
 *   statut HTTP réel, qu'aucun appelant de ce dépôt ne conserve aujourd'hui
 *   (chaque site d'appel ne garde que `error`, jamais le `status` que
 *   postgrest-js calcule pourtant à côté).
 */
const TRANSIENT = [
  "network-timeout",
  "failed to fetch", // Chrome, Edge
  "load failed", // Safari
  "networkerror", // Firefox
  "network request failed", // React Native
  "fetch failed", // Node / undici (applyMatchAction appelé côté serveur)
  "econnrefused",
  "econnreset",
  "etimedout",
  "enotfound",
  "eai_again",
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
 *
 * Lit `message` ET `details` (voir `TRANSIENT` ci-dessus) : la cause précise
 * d'un échec de fetch — les codes de connexion Node en particulier — n'est
 * jamais dans `message` seul.
 */
export function isTransientError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const details = (e as { details?: unknown } | null)?.details;
  const texte = [
    e instanceof Error ? e.message : String(e ?? ""),
    typeof details === "string" ? details : "",
  ]
    .join(" ")
    .toLowerCase();
  return TRANSIENT.some((needle) => texte.includes(needle));
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

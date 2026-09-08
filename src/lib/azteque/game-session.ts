/**
 * Pont entre l'écran de jeu (solo ou en ligne) et ce qui doit réagir à son
 * cycle de vie sans y avoir directement accès — au premier chef, le
 * gestionnaire global d'invitations, monté à la racine et donc étranger aux
 * composants de route qui portent l'état réel de la partie.
 *
 * Aucun état React ici : un simple registre en mémoire, lu et écrit depuis
 * des effets. Une seule partie peut être « en cours » à la fois — ce que la
 * navigation garantit déjà, un seul écran de jeu étant monté à l'instant t.
 */

export type GameSessionKind = "solo" | "online";

interface GameSession {
  kind: GameSessionKind;
  /** Quitte proprement la partie en cours (résilie côté serveur si en ligne). */
  leave: () => void;
}

let session: GameSession | null = null;
const freedListeners = new Set<() => void>();

/**
 * Annonce qu'une partie est en cours sur cet écran. Renvoie la fonction qui
 * l'efface — à appeler quand la partie se termine ou que l'écran se démonte.
 *
 * Cet effacement, quelle qu'en soit la cause, avertit aussi les auditeurs de
 * `onFreed` : un joueur qui vient de quitter sa partie — qu'elle se soit
 * achevée normalement ou qu'il l'ait abandonnée pour faire autre chose —
 * n'est plus occupé, dans les deux cas.
 */
export function registerGameSession(kind: GameSessionKind, leave: () => void): () => void {
  const entry: GameSession = { kind, leave };
  session = entry;
  return () => {
    if (session !== entry) return;
    session = null;
    freedListeners.forEach((fn) => fn());
  };
}

/** La partie actuellement en cours, s'il y en a une. */
export function currentGameSession(): GameSession | null {
  return session;
}

/**
 * Le joueur cesse d'être occupé : une partie vient de s'achever, ou il l'a
 * quittée. Sert à réveiller une invitation mise de côté avec « Plus tard »,
 * qui ne doit réapparaître qu'à cet instant — jamais en pleine réflexion.
 */
export function onFreed(fn: () => void): () => void {
  freedListeners.add(fn);
  return () => freedListeners.delete(fn);
}

/**
 * Un tour vient de se conclure (ou la partie entière) sans que l'écran ne se
 * démonte pour autant — le joueur peut enchaîner sur le tour suivant. C'est
 * le même signal que la fin de partie : les deux marquent une pause naturelle
 * où une invitation en attente peut légitimement se représenter.
 */
export function announceFreed(): void {
  freedListeners.forEach((fn) => fn());
}

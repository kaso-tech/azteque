/**
 * Préférences locales de l'utilisateur (côté client uniquement).
 *
 * Pas de migration SQL, pas de RPC : tout vit en localStorage. Les
 * préférences sont des toggles (« afficher le bouton X sur la table »)
 * et un ordre (« l'ordre de mes stickers-sons »). À la connexion sur un
 * autre appareil, les préférences sont vides : c'est un choix assumé,
 * pas une régression — l'utilisateur reconfigure comme il le souhaite.
 */

const CLE = "azteque:match-prefs:v1";

export interface MatchPreferences {
  /** Sons désactivés (par soundId) : le bouton n'apparaît pas dans la barre. */
  sonsDesactives: string[];
  /** Stickers désactivés (par id d'article) : le bouton n'apparaît pas. */
  stickersDesactives: string[];
  /** Ordre personnalisé des boutons de sons. Si vide, l'ordre du catalogue
   *  s'applique. */
  ordreSons: string[];
  /** Réception des messages texte activée (true par défaut). */
  messagesTexte: boolean;
  /** Réception des stickers (visuels sans son) activée (true par défaut). */
  messagesStickers: boolean;
}

const DEFAUT: MatchPreferences = {
  sonsDesactives: [],
  stickersDesactives: [],
  ordreSons: [],
  messagesTexte: true,
  messagesStickers: true,
};

function lire(): MatchPreferences {
  if (typeof window === "undefined") return DEFAUT;
  try {
    const raw = window.localStorage.getItem(CLE);
    if (!raw) return DEFAUT;
    const parsed = JSON.parse(raw) as Partial<MatchPreferences>;
    return {
      sonsDesactives: Array.isArray(parsed.sonsDesactives) ? parsed.sonsDesactives : [],
      stickersDesactives: Array.isArray(parsed.stickersDesactives) ? parsed.stickersDesactives : [],
      ordreSons: Array.isArray(parsed.ordreSons) ? parsed.ordreSons : [],
      messagesTexte: parsed.messagesTexte !== false,
      messagesStickers: parsed.messagesStickers !== false,
    };
  } catch {
    return DEFAUT;
  }
}

function ecrire(prefs: MatchPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLE, JSON.stringify(prefs));
  } catch {
    // localStorage plein ou indisponible : tant pis, on garde en mémoire
  }
}

/**
 * Sous-ensemble mutable des préférences : tout ce qui peut être togglé
 * depuis le panneau paramètres.
 */
export type MatchPrefsMutable = Omit<
  MatchPreferences,
  "messagesTexte" | "messagesStickers"
>;

export function chargerPreferences(): MatchPreferences {
  return lire();
}

export function setSonDesactive(soundId: string, desactive: boolean): MatchPreferences {
  const cur = lire();
  const set = new Set(cur.sonsDesactives);
  if (desactive) set.add(soundId);
  else set.delete(soundId);
  const next = { ...cur, sonsDesactives: [...set] };
  ecrire(next);
  return next;
}

export function setStickerDesactive(id: string, desactive: boolean): MatchPreferences {
  const cur = lire();
  const set = new Set(cur.stickersDesactives);
  if (desactive) set.add(id);
  else set.delete(id);
  const next = { ...cur, stickersDesactives: [...set] };
  ecrire(next);
  return next;
}

export function setOrdreSons(ordre: string[]): MatchPreferences {
  const next = { ...lire(), ordreSons: ordre };
  ecrire(next);
  return next;
}

export function setMessagesTexte(actif: boolean): MatchPreferences {
  const next = { ...lire(), messagesTexte: actif };
  ecrire(next);
  return next;
}

export function setMessagesStickers(actif: boolean): MatchPreferences {
  const next = { ...lire(), messagesStickers: actif };
  ecrire(next);
  return next;
}

export function reinitialiserPreferences(): MatchPreferences {
  ecrire(DEFAUT);
  return DEFAUT;
}

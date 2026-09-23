/**
 * Grades des joueurs.
 *
 * Le serveur ne tient qu'un nombre — la cote Elo, mise à jour à la fin de
 * chaque champ en ligne par `settle_match`. Le grade en est la lecture : des
 * paliers fixes, décrits ici et nulle part ailleurs, pour qu'il n'y ait jamais
 * deux barèmes à tenir en accord.
 *
 * Les paliers S'ÉLARGISSENT à mesure qu'on monte, au lieu d'être espacés
 * régulièrement. Un écart constant donne la pire des courbes : le premier
 * grade arrive vite (le rodage double les gains), puis tous les suivants
 * coûtent le même prix, et ce prix — une douzaine de victoires nettes — est
 * bien trop lourd pour un grade du milieu. Le joueur monte une fois, puis
 * s'arrête, avec l'impression que le classement ne bouge plus.
 *
 * Les premiers paliers se franchissent donc en trois ou quatre victoires
 * nettes : assez pour qu'ils se méritent, assez peu pour qu'on les voie
 * arriver. Les derniers en demandent une quinzaine, parce qu'un Roi Aztèque
 * doit se gagner sur la durée. Le compte exact est verrouillé par un test
 * (`rank.test.ts`) : ces paliers et le coefficient K de la base se lisent
 * ensemble, et se démentaient jusqu'ici.
 *
 * Le premier grade reste le plus large vers le bas : il va du plancher de la
 * cote au premier palier, de sorte qu'un joueur qui débute ait de la marge
 * avant de se sentir bloqué.
 */

export interface Rank {
  /** 1 pour Débutant, 10 pour Roi Aztèque. */
  tier: number;
  name: string;
  emoji: string;
  /** Cote à atteindre pour ce grade. */
  min: number;
  /** Couleur d'accent, du vert tendre à l'or. */
  tone: string;
  /** Emblème sombre, à cerner d'un halo pour rester lisible sur fond noir. */
  dim?: true;
}

/** Cote d'un compte neuf : le bas du premier grade, avec du jeu sous les pieds. */
export const START_RATING = 1000;

/** On ne descend pas plus bas, quelle que soit la série de défaites. */
export const RATING_FLOOR = 800;

/** Grade de départ, et refuge de tous ceux dont la cote passe sous le premier palier. */
const DEBUTANT: Rank = {
  tier: 1,
  name: "Débutant",
  emoji: "🌱",
  min: RATING_FLOOR,
  tone: "text-lime-400",
};

/*
 * Les seuils ne REMONTENT jamais d'une version à l'autre : chacun de ceux-ci
 * est plus bas que celui qu'il remplace. Un joueur peut donc y gagner un
 * grade du jour au lendemain, jamais en perdre un — se faire rétrograder par
 * une mise à jour, sans avoir perdu une seule partie, serait la pire façon de
 * rendre le classement plus accueillant.
 */
export const RANKS: Rank[] = [
  DEBUTANT,
  { tier: 2, name: "Novice", emoji: "🟢", min: 1060, tone: "text-green-500" },
  { tier: 3, name: "Initié", emoji: "🔵", min: 1140, tone: "text-blue-400" },
  { tier: 4, name: "Stratège", emoji: "🟣", min: 1240, tone: "text-purple-400" },
  { tier: 5, name: "Vétéran", emoji: "🟠", min: 1360, tone: "text-orange-400" },
  { tier: 6, name: "Expert", emoji: "🔴", min: 1500, tone: "text-red-400" },
  { tier: 7, name: "Maître", emoji: "⚫", min: 1660, tone: "text-zinc-300", dim: true },
  { tier: 8, name: "Grand Maître", emoji: "🟡", min: 1840, tone: "text-yellow-300" },
  { tier: 9, name: "Légende", emoji: "💎", min: 2040, tone: "text-cyan-300" },
  { tier: 10, name: "Roi Aztèque", emoji: "👑", min: 2260, tone: "text-gold" },
];

/**
 * Le coefficient K de la base, reproduit ici pour que le rythme de la montée
 * soit vérifiable (voir `rank.test.ts`).
 *
 * Il n'est PAS utilisé pour calculer quoi que ce soit : la cote se calcule
 * exclusivement côté serveur, où un client modifié n'a pas voix au chapitre.
 * Ces valeurs doivent suivre `public.elo_k` — le test échoue si les paliers
 * et elles cessent de s'accorder, ce qui est arrivé une fois déjà.
 */
export const ELO_K = {
  /** Rodage : les dix premières parties classées, le temps de se situer. */
  rodage: 40,
  /** Régime ordinaire. */
  normal: 32,
  /** À partir de Grand Maître : une cote de ce niveau se tient sur la durée. */
  sommet: 24,
  /** Cote à partir de laquelle `sommet` s'applique. */
  seuilSommet: 1840,
} as const;

/** Le grade correspondant à une cote. */
export function rankOf(rating: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i -= 1) {
    const r = RANKS[i];
    if (r && rating >= r.min) return r;
  }
  return DEBUTANT;
}

export interface RankProgress {
  rank: Rank;
  /** Grade suivant, ou `null` au sommet. */
  next: Rank | null;
  /** Avancement dans le grade actuel, de 0 à 1. */
  ratio: number;
  /** Points de cote restant à gagner pour monter. */
  toNext: number;
}

/**
 * Avancement à l'intérieur du grade actuel.
 *
 * Au dernier grade il n'y a plus de palier à viser : l'avancement est plein et
 * la barre cesse d'être une promesse.
 */
export function rankProgress(rating: number): RankProgress {
  const rank = rankOf(rating);
  const next = RANKS[rank.tier] ?? null;
  if (!next) return { rank, next: null, ratio: 1, toNext: 0 };
  const span = next.min - rank.min;
  const ratio = Math.min(1, Math.max(0, (rating - rank.min) / span));
  return { rank, next, ratio, toNext: Math.max(0, next.min - rating) };
}

/**
 * Compare deux grades, du point de vue du premier joueur.
 *
 * Sert à dire d'un adversaire s'il est au-dessus, au même niveau ou en
 * dessous — la seule chose qu'un joueur ait besoin de savoir avant de miser.
 */
export function rankGap(mine: number, theirs: number): "superieur" | "egal" | "inferieur" {
  const a = rankOf(mine).tier;
  const b = rankOf(theirs).tier;
  if (b > a) return "superieur";
  if (b < a) return "inferieur";
  return "egal";
}

/**
 * Banc d'essai de l'IA d'Aztèque.
 *
 * Fait jouer deux niveaux d'IA l'un contre l'autre sur des donnes identiques
 * (générateur aléatoire déterministe) et rapporte le différentiel de points.
 * Les donnes étant rejouées à l'identique d'un niveau à l'autre, la comparaison
 * est appariée : la variance chute et quelques centaines de tours suffisent à
 * mesurer un écart réel.
 *
 * ATTENTION à l'étalon choisi. Mesurer contre l'IA figée (`old:<niveau>`)
 * convient pour situer un niveau, mais TROMPE sur les tactiques qui exploitent
 * une faiblesse de l'adversaire plutôt que de renforcer le jeu. L'exemple
 * vécu : la valeur de conservation d'un As (TUNE.aceAmbush) semblait optimale
 * à 3.0 contre l'IA figée, alors qu'un A/B contre un adversaire par ailleurs
 * identique la donne déjà négative à cette valeur. Pour calibrer une tactique,
 * faire jouer la variante contre la version NON modifiée du même niveau.
 *
 * Usage :
 *   bun scripts/ai-bench.ts                       # matrice complète
 *   bun scripts/ai-bench.ts legende expert 400    # un duel précis
 */

import {
  aiAnnounceAt,
  aiChooseCardAt,
  announce,
  availableMelds,
  drawNext,
  newRound,
  playCard,
  resolveTrick,
  type Difficulty,
  type GameState,
  type PlayerIndex,
} from "../src/lib/azteque/engine";
import { legacyAnnounceAt, legacyChooseCardAt } from "./legacy-ai";

/* ---------- Générateur aléatoire déterministe ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Remplace Math.random pour rendre distribution et IA reproductibles. */
function withSeed<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/* ---------- Vue miroir : permet de faire jouer l'IA du côté 0 ---------- */

/**
 * Le moteur écrit l'IA du point de vue du joueur 1. Pour faire jouer une IA
 * côté 0, on lui présente l'état inversé. L'échange est superficiel : les
 * objets Card restent partagés, donc l'identifiant renvoyé reste valide dans
 * l'état réel.
 */
function mirror(s: GameState): GameState {
  const flip = (p: PlayerIndex | null): PlayerIndex | null =>
    p === null ? null : ((1 - p) as PlayerIndex);
  return {
    ...s,
    hands: [s.hands[1], s.hands[0]],
    gains: [s.gains[1], s.gains[0]],
    melds: [s.melds[1], s.melds[0]],
    exposed: [s.exposed[1], s.exposed[0]],
    pendingUpgrade: [s.pendingUpgrade[1], s.pendingUpgrade[0]],
    roundsWon: [s.roundsWon[1], s.roundsWon[0]],
    roundScore: s.roundScore ? [s.roundScore[1], s.roundScore[0]] : null,
    trick: s.trick.map((t) => ({ ...t, player: flip(t.player)! })),
    leader: flip(s.leader)!,
    turn: flip(s.turn)!,
    dealer: flip(s.dealer)!,
    canAnnounce: flip(s.canAnnounce),
    drawPending: s.drawPending.map((p) => flip(p)!),
    lastTrickWinner: flip(s.lastTrickWinner),
    roundWinner: flip(s.roundWinner),
    champWinner: flip(s.champWinner),
  };
}

const view = (s: GameState, p: PlayerIndex) => (p === 1 ? s : mirror(s));

/* ---------- Étalon : IA d'avant la refonte ---------- */

/** Un niveau préfixé de `old:` rejoue l'IA figée dans scripts/legacy-ai.ts. */
type Level = Difficulty | `old:${Difficulty}`;

const isLegacy = (l: Level): l is `old:${Difficulty}` => l.startsWith("old:");
const baseLevel = (l: Level): Difficulty => (isLegacy(l) ? l.slice(4) : l) as Difficulty;

function chooseCard(s: GameState, p: PlayerIndex, level: Level) {
  const v = view(s, p);
  return isLegacy(level)
    ? legacyChooseCardAt(v, baseLevel(level))
    : aiChooseCardAt(v, baseLevel(level));
}

function chooseAnnounce(s: GameState, p: PlayerIndex, level: Level) {
  const v = view(s, p);
  return isLegacy(level)
    ? legacyAnnounceAt(v, baseLevel(level))
    : aiAnnounceAt(v, baseLevel(level));
}

/* ---------- Déroulement d'un tour complet ---------- */

export interface RoundResult {
  /** Points du joueur 0 et du joueur 1 (bonnes + comptes + main). */
  points: [number, number];
  bonnes: [number, number];
  comptes: [number, number];
  /** null en cas d'égalité (« pont »). */
  winner: PlayerIndex | null;
  tricks: number;
  /** Temps de décision cumulé par joueur, en millisecondes. */
  thinkMs: [number, number];
  /** Décision la plus longue : garantit l'absence de blocage d'interface. */
  maxMs: [number, number];
  decisions: [number, number];
}

function playRound(levels: [Level, Level], dealer: PlayerIndex): RoundResult {
  let state = newRound(dealer);
  const thinkMs: [number, number] = [0, 0];
  const maxMs: [number, number] = [0, 0];
  const decisions: [number, number] = [0, 0];
  let tricks = 0;
  let guard = 0;

  while (state.phase === "playing") {
    if (++guard > 5000) throw new Error("Boucle de partie non terminée (garde-fou).");

    // 1. Un pli complet se résout.
    if (state.trick.length >= 2) {
      state = resolveTrick(state, { atout10: true });
      tricks += 1;
      continue;
    }

    // 2. Pioches en attente : le vainqueur peut d'abord annoncer un compte.
    if (state.drawPending.length > 0) {
      const p = state.drawPending[0]!;
      if (state.canAnnounce === p && availableMelds(state, p).length > 0) {
        const t0 = performance.now();
        const a = chooseAnnounce(state, p, levels[p]);
        const dtA = performance.now() - t0;
        thinkMs[p] += dtA;
        maxMs[p] = Math.max(maxMs[p], dtA);
        decisions[p] += 1;
        if (a) {
          const next = announce(state, p, a.suits, a.trump);
          // `announce` renvoie l'état inchangé si l'annonce est refusée :
          // on referme alors la fenêtre pour ne pas boucler.
          state = next === state ? { ...state, canAnnounce: null } : next;
        } else {
          state = { ...state, canAnnounce: null };
        }
        continue;
      }
      if (state.canAnnounce === p) {
        state = { ...state, canAnnounce: null };
        continue;
      }
      state = drawNext(state);
      continue;
    }

    // 3. Sinon, le joueur dont c'est le tour pose une carte.
    const p = state.turn;
    const t0 = performance.now();
    const card = chooseCard(state, p, levels[p]);
    const dt = performance.now() - t0;
    thinkMs[p] += dt;
    maxMs[p] = Math.max(maxMs[p], dt);
    decisions[p] += 1;
    const next = playCard(state, p, card.id);
    if (next === state) throw new Error(`Coup illégal proposé par l'IA (${levels[p]}).`);
    state = next;
  }

  const score = state.roundScore;
  if (!score) throw new Error("Tour terminé sans décompte.");
  return {
    points: [score[0].total, score[1].total],
    bonnes: [score[0].bonnes, score[1].bonnes],
    comptes: [score[0].comptes, score[1].comptes],
    winner: state.roundWinner,
    tricks,
    thinkMs,
    maxMs,
    decisions,
  };
}

/* ---------- Duel sur N tours ---------- */

export interface MatchResult {
  a: Level;
  b: Level;
  rounds: number;
  winsA: number;
  winsB: number;
  ponts: number;
  pointsA: number;
  pointsB: number;
  bonnesA: number;
  bonnesB: number;
  comptesA: number;
  comptesB: number;
  msPerDecisionA: number;
  msPerDecisionB: number;
  maxMsA: number;
  maxMsB: number;
}

/**
 * `a` joue le siège 0 et `b` le siège 1, puis on inverse les sièges à chaque
 * tour pour neutraliser l'avantage éventuel du donneur.
 */
export function match(a: Level, b: Level, rounds: number, seed0 = 1): MatchResult {
  const res: MatchResult = {
    a,
    b,
    rounds,
    winsA: 0,
    winsB: 0,
    ponts: 0,
    pointsA: 0,
    pointsB: 0,
    bonnesA: 0,
    bonnesB: 0,
    comptesA: 0,
    comptesB: 0,
    msPerDecisionA: 0,
    msPerDecisionB: 0,
    maxMsA: 0,
    maxMsB: 0,
  };
  let msA = 0;
  let msB = 0;
  let decA = 0;
  let decB = 0;

  for (let i = 0; i < rounds; i += 1) {
    const swap = i % 2 === 1; // `a` occupe alternativement le siège 0 puis 1
    const levels: [Level, Level] = swap ? [b, a] : [a, b];
    const seatA: PlayerIndex = swap ? 1 : 0;
    const seatB: PlayerIndex = swap ? 0 : 1;
    const r = withSeed(seed0 + i, () => playRound(levels, (i % 2) as PlayerIndex));

    res.pointsA += r.points[seatA];
    res.pointsB += r.points[seatB];
    res.bonnesA += r.bonnes[seatA];
    res.bonnesB += r.bonnes[seatB];
    res.comptesA += r.comptes[seatA];
    res.comptesB += r.comptes[seatB];
    msA += r.thinkMs[seatA];
    msB += r.thinkMs[seatB];
    res.maxMsA = Math.max(res.maxMsA, r.maxMs[seatA]);
    res.maxMsB = Math.max(res.maxMsB, r.maxMs[seatB]);
    decA += r.decisions[seatA];
    decB += r.decisions[seatB];
    if (r.winner === null) res.ponts += 1;
    else if (r.winner === seatA) res.winsA += 1;
    else res.winsB += 1;
  }

  res.msPerDecisionA = decA ? msA / decA : 0;
  res.msPerDecisionB = decB ? msB / decB : 0;
  return res;
}

/* ---------- Rapport ---------- */

function pct(x: number, total: number) {
  return total ? ((100 * x) / total).toFixed(1).padStart(5) : "  n/a";
}

function report(r: MatchResult) {
  const decided = r.winsA + r.winsB;
  const line = [
    `${r.a.padEnd(8)} vs ${r.b.padEnd(8)}`,
    `tours ${String(r.rounds).padStart(4)}`,
    `victoires ${pct(r.winsA, decided)}% / ${pct(r.winsB, decided)}%`,
    `pts ${(r.pointsA / r.rounds).toFixed(2).padStart(6)} / ${(r.pointsB / r.rounds).toFixed(2).padStart(6)}`,
    `bonnes ${(r.bonnesA / r.rounds).toFixed(2).padStart(5)} / ${(r.bonnesB / r.rounds).toFixed(2).padStart(5)}`,
    `comptes ${(r.comptesA / r.rounds).toFixed(2).padStart(5)} / ${(r.comptesB / r.rounds).toFixed(2).padStart(5)}`,
    `ms/coup ${r.msPerDecisionA.toFixed(2).padStart(6)} / ${r.msPerDecisionB.toFixed(2).padStart(6)}`,
    `pire ${r.maxMsA.toFixed(0).padStart(4)}ms`,
    `ponts ${r.ponts}`,
  ].join("  ");
  console.log(line);
}

/* ---------- Entrée ---------- */

const LEVELS: Difficulty[] = ["facile", "normal", "expert", "maitre", "legende"];

function main() {
  const [argA, argB, argN] = process.argv.slice(2);
  if (argA && argB) {
    const rounds = Number(argN ?? 200);
    report(match(argA as Level, argB as Level, rounds));
    return;
  }
  const rounds = Number(argN ?? 200);
  console.log(`Matrice des niveaux — ${rounds} tours par duel\n`);
  for (let i = 0; i < LEVELS.length; i += 1) {
    for (let j = i + 1; j < LEVELS.length; j += 1) {
      report(match(LEVELS[j]!, LEVELS[i]!, rounds));
    }
  }
}

// Importable depuis un script d'expérimentation sans déclencher la matrice.
if (import.meta.main) main();

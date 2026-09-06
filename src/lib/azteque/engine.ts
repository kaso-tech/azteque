// Moteur de règles du jeu AZTÈQUE — Règlement officiel v1.0

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";

export const SUITS: Suit[] = ["S", "H", "D", "C"];
export const RANKS: Rank[] = ["7", "8", "9", "J", "Q", "K", "10", "A"];

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_NAME: Record<Suit, string> = {
  S: "Pique",
  H: "Cœur",
  D: "Carreau",
  C: "Trèfle",
};

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export const rankValue = (r: Rank) => RANKS.indexOf(r);
export const isBonne = (c: Card) => c.rank === "10" || c.rank === "A";

export interface Meld {
  suit: Suit;
  type: "simple" | "triple";
  points: number;
  first: boolean;
}

export type PlayerIndex = 0 | 1;

export interface TrickCard {
  player: PlayerIndex;
  card: Card;
}

export interface RoundScore {
  bonnes: number;
  comptes: number;
  main: number;
  total: number;
}

export interface GameState {
  stock: Card[];
  hands: [Card[], Card[]];
  gains: [Card[], Card[]];
  melds: [Meld[], Meld[]];
  exposed: [string[], string[]]; // ids des cartes de compte posées face visible
  trump: Suit | null;
  trick: TrickCard[];
  leader: PlayerIndex;
  turn: PlayerIndex;
  dealer: PlayerIndex;
  // Le joueur vient de remporter un pli : il peut annoncer avant de piocher.
  canAnnounce: PlayerIndex | null;
  // Joueurs devant encore piocher (le vainqueur du pli en premier).
  drawPending: PlayerIndex[];
  // Compte simple annoncé en attente d'un éventuel complément au 1er tirage
  pendingUpgrade: [Suit | null, Suit | null];
  lastTrickWinner: PlayerIndex | null;
  phase: "playing" | "roundEnd" | "gameEnd";
  roundsWon: [number, number];
  roundScore: [RoundScore, RoundScore] | null;
  roundWinner: PlayerIndex | null;
  champWinner: PlayerIndex | null;
  instantWin: boolean;
  /** Égalité : le tour est rejoué (« Pont »). */
  pont: boolean;
  /** Partie perdue par dépassement de temps ou déconnexion. */
  forfeit?: { loser: PlayerIndex; reason: "timeout" | "disconnect" | "quit" } | null;
  log: string[];
}

let uid = 0;
function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < 2; d++)
    for (const s of SUITS) for (const r of RANKS) deck.push({ id: `c${uid++}`, suit: s, rank: r });
  return deck;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function newRound(dealer: PlayerIndex, roundsWon: [number, number] = [0, 0]): GameState {
  const deck = shuffle(buildDeck());
  const hands: [Card[], Card[]] = [deck.splice(0, 6), deck.splice(0, 6)];
  const leader: PlayerIndex = dealer === 0 ? 1 : 0; // celui qui ne distribue pas mène
  return {
    stock: deck,
    hands,
    gains: [[], []],
    melds: [[], []],
    exposed: [[], []],
    trump: null,
    trick: [],
    leader,
    turn: leader,
    dealer,
    canAnnounce: null,
    drawPending: [],
    pendingUpgrade: [null, null],
    lastTrickWinner: null,
    phase: "playing",
    roundsWon,
    roundScore: null,
    roundWinner: null,
    champWinner: null,
    instantWin: false,
    pont: false,
    log: ["Nouveau tour : 6 cartes distribuées à chaque joueur."],
  };
}

/* ---------- Comptes ---------- */

export interface MeldOption {
  suit: Suit;
  type: "simple" | "triple";
  cards: Card[];
}

export function availableMelds(state: GameState, p: PlayerIndex, anytime = false): MeldOption[] {
  if (state.stock.length === 0) return [];
  if (!anytime && state.canAnnounce !== p) return [];
  const hand = state.hands[p];
  const used = new Set(state.exposed[p]);
  const done = new Set(state.melds[p].map((m) => m.suit));
  const out: MeldOption[] = [];
  for (const s of SUITS) {
    // Une deuxième annonce dans la même couleur n'est permise que pour
    // l'atout : le second jeu de cartes peut fournir un second Roi + Dame
    // (+ Valet) de la couleur d'atout, qui se compte comme le premier.
    if (done.has(s) && s !== state.trump) continue;
    const k = hand.find((c) => c.suit === s && c.rank === "K" && !used.has(c.id));
    const q = hand.find((c) => c.suit === s && c.rank === "Q" && !used.has(c.id));
    if (!k || !q) continue;
    const j = hand.find((c) => c.suit === s && c.rank === "J" && !used.has(c.id));
    out.push({ suit: s, type: j ? "triple" : "simple", cards: j ? [k, q, j] : [k, q] });
  }
  return out;
}

export function meldPoints(type: "simple" | "triple", first: boolean) {
  if (first) return type === "triple" ? 5 : 4;
  return type === "triple" ? 3 : 2;
}

export function announce(
  state: GameState,
  p: PlayerIndex,
  suits: Suit[],
  trumpChoice: Suit | null,
): GameState {
  // Un compte se déclare uniquement après avoir remporté le pli, avant la pioche :
  // le joueur doit donc être le prochain à piocher et avoir exactement 5 cartes.
  if (
    state.phase !== "playing" ||
    state.canAnnounce !== p ||
    state.drawPending[0] !== p ||
    state.hands[p].length !== 5
  )
    return state;
  const opts = availableMelds(state, p, true).filter((o) => suits.includes(o.suit));
  if (!opts.length) return state;
  const s = clone(state);
  const isFirstAnnounceOfRound = s.trump === null;
  const trumpSuit = isFirstAnnounceOfRound
    ? trumpChoice && suits.includes(trumpChoice)
      ? trumpChoice
      : opts[0]!.suit
    : null;
  // Couleur d'atout après cette annonce (déjà fixée, ou fixée à l'instant).
  const effectiveTrump = trumpSuit ?? s.trump;

  let simpleAnnounced: Suit | null = null;
  const ordered = trumpSuit
    ? [opts.find((o) => o.suit === trumpSuit)!, ...opts.filter((o) => o.suit !== trumpSuit)]
    : opts;

  ordered.forEach((o) => {
    // Tout compte à la couleur d'atout se compte comme le premier compte
    // (celui qui a créé l'atout), même annoncé plus tard par le même
    // joueur ou par l'adversaire — seuls les comptes d'une autre couleur
    // valent le barème réduit.
    const first = o.suit === effectiveTrump;
    const pts = meldPoints(o.type, first);
    s.melds[p].push({ suit: o.suit, type: o.type, points: pts, first });
    s.exposed[p].push(...o.cards.map((c) => c.id));
    if (o.type === "simple") simpleAnnounced = o.suit;
    s.log.unshift(`${name(p)} annonce un compte ${o.type} à ${SUIT_NAME[o.suit]} (${pts} pts).`);
  });

  if (trumpSuit) {
    s.trump = trumpSuit;
    s.log.unshift(`L'atout est ${SUIT_NAME[trumpSuit]} ${SUIT_SYMBOL[trumpSuit]}.`);
  }
  s.pendingUpgrade[p] = simpleAnnounced;
  s.canAnnounce = null;
  return s;
}

/* ---------- Jeu ---------- */

export function beats(a: Card, b: Card, trump: Suit | null): boolean {
  // a jouée après b : a remporte-t-elle le pli ?
  if (trump) {
    if (a.suit === trump && b.suit !== trump) return true;
    if (b.suit === trump && a.suit !== trump) return false;
  }
  if (a.suit !== b.suit) return false; // la première carte reste dominante
  return rankValue(a.rank) > rankValue(b.rank); // cartes identiques : la 1re gagne
}

export function legalCards(state: GameState, p: PlayerIndex): Card[] {
  const hand = state.hands[p];
  if (state.trick.length === 0 || state.stock.length > 0) return hand;
  const led = state.trick[0]!.card;
  const same = hand.filter((c) => c.suit === led.suit);
  if (same.length === 0) {
    const trumps = state.trump ? hand.filter((c) => c.suit === state.trump) : [];
    return trumps.length ? trumps : hand;
  }
  const winning = same.filter((c) => beats(c, led, state.trump));
  if (winning.length) return winning;
  const sorted = [...same].sort((x, y) => rankValue(y.rank) - rankValue(x.rank));
  const top = sorted[0]!;
  if (isBonne(top) && sorted.length > 1) return [top, sorted[1]!]; // protection d'une bonne
  return [top];
}

function clone(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s)) as GameState;
}

const name = (p: PlayerIndex) => (p === 0 ? "Vous" : "L'adversaire");

export function playCard(state: GameState, p: PlayerIndex, cardId: string): GameState {
  if (state.phase !== "playing" || state.turn !== p) return state;
  if (state.drawPending.length > 0) return state; // pioche obligatoire avant de jouer
  const card = state.hands[p].find((c) => c.id === cardId);
  if (!card) return state;
  if (!legalCards(state, p).some((c) => c.id === cardId)) return state;

  const s = clone(state);
  s.hands[p] = s.hands[p].filter((c) => c.id !== cardId);
  s.exposed[p] = s.exposed[p].filter((id) => id !== cardId);
  s.trick.push({ player: p, card });
  s.canAnnounce = null;

  if (s.trick.length < 2) {
    s.turn = (p === 0 ? 1 : 0) as PlayerIndex;
    return s;
  }
  // Les deux cartes restent visibles au milieu : la résolution est déclenchée
  // par l'interface après un court délai réglable.
  return s;
}

export interface TrickOptions {
  /** Règle optionnelle « Atout 10 » : capturer le 10 d'atout rafle tout le tas adverse. */
  atout10?: boolean;
}

/** Le pli capture-t-il le 10 d'atout adverse (règle optionnelle activée) ? */
export function trickCapturesPile(state: GameState, opts: TrickOptions = {}): boolean {
  if (!opts.atout10 || state.trick.length < 2 || !state.trump) return false;
  const first = state.trick[0]!;
  const second = state.trick[1]!;
  const winner: PlayerIndex = beats(second.card, first.card, state.trump)
    ? second.player
    : first.player;
  const loser: PlayerIndex = winner === 0 ? 1 : 0;
  const loserCard = state.trick.find((t) => t.player === loser)?.card;
  return (
    !!loserCard &&
    loserCard.rank === "10" &&
    loserCard.suit === state.trump &&
    state.gains[loser].length > 0
  );
}

export function resolveTrick(state: GameState, opts: TrickOptions = {}): GameState {
  if (state.trick.length < 2) return state;
  const s = clone(state);
  const first = s.trick[0]!;
  const second = s.trick[1]!;
  const winner: PlayerIndex = beats(second.card, first.card, s.trump)
    ? second.player
    : first.player;
  const loser: PlayerIndex = winner === 0 ? 1 : 0;
  const cards = s.trick.map((t) => t.card);
  s.gains[winner].push(...cards);
  s.log.unshift(`${name(winner)} remporte le pli (${label(first.card)} / ${label(second.card)}).`);

  // Règle optionnelle « Atout 10 » : capturer le 10 d'atout rafle tout le tas adverse
  const loserCard = s.trick.find((t) => t.player === loser)?.card;
  if (
    opts.atout10 &&
    s.trump &&
    loserCard &&
    loserCard.rank === "10" &&
    loserCard.suit === s.trump
  ) {
    const stolen = s.gains[loser];
    if (stolen.length) {
      s.gains[loser] = [];
      s.gains[winner].push(...stolen);
      s.log.unshift(
        `Atout 10 ! ${name(winner)} rafle tout le tas adverse (${stolen.length} cartes).`,
      );
    }
  }

  s.trick = [];
  s.lastTrickWinner = winner;

  // La pioche est différée : le vainqueur peut d'abord annoncer un compte
  // (à 5 cartes en main), puis pioche sa 6e carte, suivi du perdant.
  s.drawPending = [];
  if (s.stock.length > 0) {
    s.drawPending.push(winner);
    if (s.stock.length > 1) s.drawPending.push(loser);
  }

  s.leader = winner;
  s.turn = winner;
  s.canAnnounce = s.drawPending.length > 0 ? winner : null;

  if (s.drawPending.length === 0 && s.hands[0].length === 0 && s.hands[1].length === 0)
    return endRound(s);
  return s;
}

/** Fait piocher une carte au prochain joueur en attente. */
export function drawNext(state: GameState): GameState {
  if (state.phase !== "playing" || state.drawPending.length === 0 || state.stock.length === 0)
    return state;
  const s = clone(state);
  const p = s.drawPending.shift()!;
  const drawn = s.stock.shift()!;
  s.hands[p].push(drawn);
  // Compléter un compte simple au premier tirage suivant l'annonce
  const pend = s.pendingUpgrade[p];
  if (pend && drawn.suit === pend && drawn.rank === "J") {
    const m = s.melds[p].find((x) => x.suit === pend && x.type === "simple");
    if (m) {
      m.type = "triple";
      m.points = meldPoints("triple", m.first);
      s.exposed[p].push(drawn.id);
      s.log.unshift(`${name(p)} complète son compte à ${SUIT_NAME[pend]} (triple).`);
    }
  }
  s.pendingUpgrade[p] = null;
  s.log.unshift(`${name(p)} pioche une carte.`);
  return s;
}

export function label(c: Card) {
  return `${c.rank}${SUIT_SYMBOL[c.suit]}`;
}

export function scoreOf(s: GameState, p: PlayerIndex, mainWinner: PlayerIndex | null): RoundScore {
  const bonnes = s.gains[p].filter(isBonne).length;
  const comptes = s.melds[p].reduce((a, m) => a + m.points, 0);
  const main = mainWinner === p ? 1 : 0;
  return { bonnes, comptes, main, total: bonnes + comptes + main };
}

export function endRound(s: GameState): GameState {
  const mainWinner = s.lastTrickWinner;
  const s0 = scoreOf(s, 0, mainWinner);
  const s1 = scoreOf(s, 1, mainWinner);
  s.roundScore = [s0, s1];
  let winner: PlayerIndex | null = s0.total === s1.total ? null : s0.total > s1.total ? 0 : 1;
  s.instantWin = false;
  if (s0.bonnes >= 13) {
    winner = 0;
    s.instantWin = true;
  } else if (s1.bonnes >= 13) {
    winner = 1;
    s.instantWin = true;
  }
  s.roundWinner = winner;
  s.pont = winner === null;
  if (winner !== null) s.roundsWon[winner] += 1;
  s.phase = "roundEnd";
  if (s.instantWin && winner !== null) {
    s.champWinner = winner;
    s.phase = "gameEnd";
    s.log.unshift(`${name(winner)} remporte le champ : 13 bonnes ou plus !`);
  } else if (winner !== null && s.roundsWon[winner] >= 3) {
    s.champWinner = winner;
    s.phase = "gameEnd";
    s.log.unshift(`${name(winner)} remporte le champ (3 tours).`);
  } else {
    s.log.unshift(
      winner === null
        ? "Pont ! Égalité : le tour est rejoué."
        : `${name(winner)} remporte le tour (${Math.max(s0.total, s1.total)} pts).`,
    );
  }
  return s;
}

/* ==================================================================
 * IA
 *
 * Rappel des ressorts du jeu, qui guident toute l'évaluation ci-dessous :
 *
 * 1. Le vainqueur d'un pli ramasse LES DEUX cartes. Une bonne (10 / As)
 *    jouée sur un pli gagné vaut donc +1 pour soi, et sur un pli perdu
 *    +1 pour l'adversaire : chaque bonne est un écart de 2 points.
 * 2. Tant que la pioche n'est pas vide, le second joueur n'est obligé à
 *    rien, et la première carte reste dominante à couleur différente :
 *    un As entamé est imprenable (sauf coupe), c'est un point gratuit.
 * 3. Un compte vaut 4 ou 5 points, soit bien plus qu'une bonne : jeter
 *    un Roi ou une Dame qui complète un compte coûte très cher.
 * 4. Perdre le 10 d'atout transfère TOUT son tas de bonnes à
 *    l'adversaire : c'est le plus gros coup possible, dans les deux sens.
 * ================================================================== */

/* ---------- Main blanche ---------- */

export function hasMainBlanche(state: GameState, p: PlayerIndex): boolean {
  return !state.hands[p].some((c) => c.rank === "K" || c.rank === "Q" || c.rank === "J");
}

/* ---------- Niveaux de difficulté ---------- */

export type Difficulty = "facile" | "normal" | "expert" | "maitre" | "legende";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facile: "Facile",
  normal: "Normal",
  expert: "Expert",
  maitre: "Maître",
  legende: "Légende",
};

/* ---------- Mémoire des cartes : ce que l'IA a déjà vu passer ---------- */

/** Cartes encore invisibles pour l'IA (main adverse + pioche). */
export function unseenCards(state: GameState): Card[] {
  const seen = new Map<string, number>();
  const key = (c: Card) => `${c.rank}${c.suit}`;
  const add = (c: Card) => seen.set(key(c), (seen.get(key(c)) ?? 0) + 1);
  state.hands[1].forEach(add);
  state.gains[0].forEach(add);
  state.gains[1].forEach(add);
  state.trick.forEach((t) => add(t.card));
  // Comptes posés face visible par l'humain
  const exposed = new Set(state.exposed[0]);
  state.hands[0].filter((c) => exposed.has(c.id)).forEach(add);

  const out: Card[] = [];
  let n = 0;
  for (let d = 0; d < 2; d++)
    for (const s of SUITS)
      for (const r of RANKS) {
        const k = `${r}${s}`;
        const left = seen.get(k) ?? 0;
        if (left > 0) seen.set(k, left - 1);
        else out.push({ id: `u${n++}`, suit: s, rank: r });
      }
  return out;
}

/**
 * Probabilité que l'adversaire détienne au moins une carte du sous-ensemble
 * `matches` parmi les `unseen` cartes encore invisibles (loi hypergéométrique).
 *
 * `handSize` doit être le nombre de cartes CACHÉES de sa main : les cartes
 * d'un compte posé face visible ne font pas partie du tirage, elles sont
 * déjà connues (et déjà retirées de `unseen`).
 */
function chanceOpponentHolds(unseen: Card[], handSize: number, matches: (c: Card) => boolean) {
  const n = unseen.length;
  if (n === 0 || handSize <= 0) return 0;
  const hits = unseen.filter(matches).length;
  if (hits === 0) return 0;
  // P(aucune) = produit des (misses - i) / (n - i)
  let pNone = 1;
  const misses = n - hits;
  for (let i = 0; i < handSize; i += 1) {
    if (misses - i <= 0) return 1;
    pNone *= (misses - i) / (n - i);
  }
  return 1 - pNone;
}

/* ---------- Constantes d'évaluation ----------
 * Calibrées au banc d'essai (`bun scripts/ai-bench.ts`) : chaque valeur a été
 * confrontée à l'IA figée dans scripts/legacy-ai.ts sur des donnes identiques.
 */
const TUNE = {
  /**
   * Valeur d'un 10 encore en main. Moins qu'un As de la même couleur : le 10
   * tombe devant un As, et le jeu en compte deux exemplaires.
   */
  tenInHand: 0.5,
  /** Valeur d'un As encore en main : rien ne le prend dans sa couleur. */
  aceInHand: 0.72,
  /** Un As imprenable (hors atout adverse) est un point quasi certain. */
  safeAceInHand: 0.95,
  /**
   * Fraction d'un compte encore en main portée au crédit dans la recherche.
   * Sans effet mesurable au banc d'essai : la recherche ne s'active qu'en fin
   * de partie, où plus aucune annonce n'est possible. Conservé pour rester
   * juste si la recherche était un jour étendue au milieu de partie.
   */
  meldPotential: 0.6,
  /**
   * Valeur de la main quand elle ne sert à rien de précis. Volontairement
   * faible : prendre la devanture sans raison oblige ensuite à entamer, ce
   * qui livre de l'information et expose ses cartes. Ce qui fait vraiment
   * valoir la main, ce sont les comptes — les siens comme ceux qu'on refuse
   * à l'adversaire (voir myLeadGain / oppLeadGain).
   */
  tempoBase: 0.1,
  /** Intérêt de se défausser d'une carte basse avant la phase finale. */
  discardJunk: 0.5,
  /** Propension prêtée à l'adversaire à dépenser pour rafler une bonne. */
  wantBonneSameSuit: 0.95,
  wantBonneTrump: 0.8,
  /** ... et pour rafler un pli sans enjeu : bien plus faible. */
  wantPlainSameSuit: 0.5,
  wantPlainTrump: 0.12,
};

/* ---------- Ce que l'IA sait de la main adverse ---------- */

/** Cartes encore cachées dans la main adverse (un compte posé est visible). */
function oppHiddenCount(state: GameState): number {
  const exposed = new Set(state.exposed[0]);
  return state.hands[0].filter((c) => !exposed.has(c.id)).length;
}

/**
 * Main adverse exacte, ou null tant qu'elle reste incertaine.
 *
 * Dès que la pioche est épuisée, les cartes que l'IA n'a jamais vues SONT
 * exactement la main adverse — c'est ce que fait un joueur expérimenté qui a
 * suivi les cartes sorties. Avant cela, l'incertitude ne porte que sur le
 * partage entre cette main et le talon : quand il ne reste que deux cartes en
 * pioche, l'essentiel de la main adverse est donc déjà déductible, ce que
 * traduit la loi hypergéométrique de `chanceOpponentHolds`.
 */
function knownOppHand(state: GameState): Card[] | null {
  if (state.stock.length > 0) return null;
  const unseen = unseenCards(state);
  const exposed = new Set(state.exposed[0]);
  const shown = state.hands[0].filter((c) => exposed.has(c.id));
  if (unseen.length !== state.hands[0].length - shown.length) return null; // comptage incohérent
  return [...shown, ...unseen];
}

/** Vue de l'adversaire, calculée une fois par décision. */
interface OppModel {
  /** Main exacte dès que la pioche est vide, sinon null. */
  known: Card[] | null;
  /** Cartes jamais vues : main cachée adverse + talon. */
  unseen: Card[];
  /** Nombre de cartes cachées dans sa main. */
  hidden: number;
}

function readOpponent(state: GameState): OppModel {
  return {
    known: knownOppHand(state),
    unseen: unseenCards(state),
    hidden: oppHiddenCount(state),
  };
}

/**
 * Probabilité que l'adversaire détienne une carte vérifiant `pred`. Devient
 * une certitude (0 ou 1) dès que sa main est connue.
 */
function oppHas(m: OppModel, pred: (c: Card) => boolean): number {
  if (m.known) return m.known.some(pred) ? 1 : 0;
  return chanceOpponentHolds(m.unseen, m.hidden, pred);
}

/* ---------- Valeur de la main (« la devanture ») ---------- */

/**
 * À quel point la fenêtre d'annonce se referme.
 *
 * Le pli joué alors qu'il reste une ou deux cartes en pioche est le DERNIER
 * dont le vainqueur pourra annoncer un compte (l'annonce précède la pioche).
 * À cet instant, refuser la main à l'adversaire vaut tout son compte — l'IA
 * peut même y sacrifier son As d'atout. Tant que la pioche est fournie, au
 * contraire, chacun aura d'autres occasions : la main y vaut bien moins.
 */
function meldWindow(state: GameState): number {
  const stock = state.stock.length;
  if (stock === 0) return 0; // plus aucune annonce possible
  if (stock <= 2) return 1; // dernier pli annonçable
  return Math.max(0.3, 1 - (stock - 2) / 14);
}

/** Points de compte encaissés en remportant ce pli. */
function meldPointsFor(state: GameState, p: PlayerIndex, hand: Card[]): number {
  if (state.stock.length === 0) return 0;
  const used = new Set(state.exposed[p]);
  const done = state.melds[p];
  let total = 0;
  let bestFirst = 0;
  for (const s of SUITS) {
    const max = s === state.trump ? 2 : 1;
    if (done.filter((m) => m.suit === s).length >= max) continue;
    const has = (r: Rank) => hand.some((c) => c.suit === s && c.rank === r && !used.has(c.id));
    if (!has("K") || !has("Q")) continue;
    const type = has("J") ? "triple" : "simple";
    // Le barème plein ne vaut qu'à l'atout ; si l'atout n'est pas encore fixé,
    // c'est le compte annoncé qui le choisit — un seul en profite.
    if (state.trump === null) {
      total += meldPoints(type, false);
      bestFirst = Math.max(bestFirst, meldPoints(type, true) - meldPoints(type, false));
    } else {
      total += meldPoints(type, s === state.trump);
    }
  }
  return total + bestFirst;
}

/**
 * Ce que vaut, pour l'IA, remporter ce pli — au-delà des cartes ramassées.
 *
 * Un joueur expérimenté ne prend pas la devanture n'importe comment : elle ne
 * vaut que pour annoncer un compte, pour empêcher l'adversaire d'annoncer le
 * sien, ou faute de mieux.
 */
function myLeadGain(state: GameState): number {
  if (state.stock.length === 0) {
    // Phase finale : seul le dernier pli rapporte encore (« la main »).
    return state.hands[1].length <= 1 ? 1 : TUNE.tempoBase;
  }
  return TUNE.tempoBase + meldWindow(state) * meldPointsFor(state, 1, state.hands[1]);
}

/** Symétrique : ce que l'adversaire gagne s'il remporte ce pli. */
function oppLeadGain(state: GameState, m: OppModel): number {
  if (state.stock.length === 0) {
    return state.hands[0].length <= 1 ? 1 : TUNE.tempoBase;
  }
  let threat: number;
  if (m.known) {
    threat = meldPointsFor(state, 0, m.known);
  } else {
    // Espérance de ses points de compte : il lui faut le Roi ET la Dame d'une
    // même couleur encore libre.
    threat = 0;
    for (const s of SUITS) {
      const max = s === state.trump ? 2 : 1;
      if (state.melds[0].filter((x) => x.suit === s).length >= max) continue;
      const p = (r: Rank) => oppHas(m, (c) => c.suit === s && c.rank === r);
      const pair = p("K") * p("Q");
      if (pair <= 0) continue;
      const full = state.trump === null || s === state.trump;
      threat += pair * (meldPoints("simple", full) + p("J"));
    }
  }
  return TUNE.tempoBase + meldWindow(state) * threat;
}

/**
 * Intérêt de se débarrasser MAINTENANT d'une carte qui deviendra un fardeau.
 *
 * En phase finale, le second joueur doit fournir la couleur et surpasser s'il
 * le peut. Mener une carte basse le laisse donc ramasser et protéger ses
 * bonnes ; mener une carte haute l'oblige au contraire à les lâcher. Une main
 * finale de cartes hautes vaut bien mieux qu'une main encombrée de déchet :
 * autant s'en séparer tant que la pioche autorise encore à jouer librement.
 */
function deadWeight(state: GameState, c: Card): number {
  const stock = state.stock.length;
  // Trop tôt, la carte peut encore servir et sera de toute façon remplacée à
  // la pioche ; trop tard, la main vaut plus cher que le ménage — le pli joué
  // à deux cartes de pioche est le dernier dont le vainqueur peut annoncer.
  if (stock < 3 || stock > 12) return 0;
  if (c.rank !== "7" && c.rank !== "8" && c.rank !== "9") return 0;
  if (state.trump && c.suit === state.trump) return 0; // un atout n'est jamais du déchet
  const weak = 1 - rankValue(c.rank) / rankValue("J");
  return TUNE.discardJunk * weak * (1 - (stock - 3) / 10);
}

/**
 * Issue EXACTE de l'entame `c` en phase finale, main adverse connue.
 *
 * Pioche vide, l'adversaire n'a plus le choix : le règlement lui impose de
 * fournir la couleur et de surpasser s'il le peut, de couper à défaut de
 * fournir, et sinon de livrer sa plus forte carte de la couleur — sa bonne
 * comprise, à moins d'en détenir une inférieure pour la protéger. Sa réponse
 * est donc calculable, et avec elle le résultat du pli.
 *
 * C'est là tout l'intérêt de connaître sa main dès la fin de la pioche : mener
 * haut lui arrache ses bonnes, mener bas les lui laisse, et l'IA n'a plus à
 * parier sur sa « propension » à prendre le pli.
 */
function endgameLead(
  state: GameState,
  c: Card,
  m: OppModel,
): { wins: boolean; captured: number } | null {
  if (!m.known || state.stock.length > 0) return null;
  const hand = m.known;
  const same = hand.filter((x) => x.suit === c.suit);

  if (same.length === 0) {
    const trumps = state.trump ? hand.filter((x) => x.suit === state.trump) : [];
    if (trumps.length) {
      // Il doit couper : il le fera au meilleur marché, mais il remporte le pli.
      return { wins: false, captured: 0 };
    }
    // Défausse libre : il se sépare de sa carte la moins utile, jamais d'une
    // bonne s'il peut l'éviter.
    const junk = hand.filter((x) => !isBonne(x));
    return { wins: true, captured: junk.length ? 0 : 1 };
  }

  const winning = same.filter((x) => beats(x, c, state.trump));
  if (winning.length) return { wins: false, captured: 0 };

  const sorted = [...same].sort((x, y) => rankValue(y.rank) - rankValue(x.rank));
  const top = sorted[0]!;
  // Protection d'une bonne : il peut lui substituer la carte immédiatement
  // inférieure de la couleur.
  const given = isBonne(top) && sorted.length > 1 ? sorted[1]! : top;
  return { wins: true, captured: isBonne(given) ? 1 : 0 };
}

/* ---------- Valeur de conservation d'une carte ---------- */

/** Points encore espérés d'un compte que cette carte permettrait. */
function meldValue(state: GameState, c: Card): number {
  if (state.stock.length === 0) return 0; // plus d'annonce possible en phase finale
  if (c.rank !== "K" && c.rank !== "Q" && c.rank !== "J") return 0;
  // Une carte déjà posée dans un compte est acquise : la garder ne rapporte plus.
  const exposed = new Set(state.exposed[1]);
  if (exposed.has(c.id)) return 0;
  // Le compte de cette couleur est-il encore ouvert ? (une seule annonce par
  // couleur, sauf à l'atout où le second jeu autorise un deuxième compte)
  const already = state.melds[1].filter((m) => m.suit === c.suit).length;
  const maxMelds = c.suit === state.trump ? 2 : 1;
  if (already >= maxMelds) return 0;

  const hand = state.hands[1];
  const free = (r: Rank) =>
    hand.some((x) => x.suit === c.suit && x.rank === r && x.id !== c.id && !exposed.has(x.id));
  // Un compte à l'atout vaut le barème plein (4/5), les autres 2/3.
  const scale = c.suit === state.trump || state.trump === null ? 1 : 0.6;

  if (c.rank === "J") {
    // Le valet ne compte que s'il complète un Roi + Dame de la même couleur.
    return free("K") && free("Q") ? 2.6 * scale : 0.4 * scale;
  }
  const partner: Rank = c.rank === "K" ? "Q" : "K";
  if (free(partner)) return (free("J") ? 3.6 : 3.0) * scale;
  return 0.9 * scale; // espoir de retrouver le partenaire à la pioche
}

/**
 * Valeur d'un atout gardé en main.
 *
 * Un atout ne se jette pas n'importe comment : c'est la seule carte qui coupe,
 * et elle peut servir à tout moment. Tant que la pioche dure, le dépenser pour
 * un pli sans enjeu est donc du gaspillage, et cette valeur l'en dissuade.
 *
 * Elle retombe à l'approche de la fin de pioche, et c'est voulu à deux titres :
 * c'est là qu'il devient payant de sacrifier un gros atout pour refuser la main
 * à l'adversaire (voir oppLeadGain), et une fois en phase finale un atout gardé
 * en main ne rapporte plus rien au décompte — seules les cartes ramassées
 * comptent. Le règlement s'y charge d'ailleurs de l'essentiel : pioche vide, on
 * doit fournir la couleur et couper à défaut, ce qui laisse peu d'occasions de
 * gâcher un atout.
 */
function trumpKeepValue(state: GameState, c: Card): number {
  const trump = state.trump;
  if (!trump || c.suit !== trump) return 0;
  const strength = rankValue(c.rank) / (RANKS.length - 1); // 0 → 1
  const urgency = Math.min(1, state.stock.length / 12);
  return (0.5 + strength * 1.4) * urgency;
}

/**
 * Ce que l'IA perd en se séparant de cette carte. Sert d'arbitrage : gagner
 * un pli vaut la dépense si le gain immédiat dépasse cette valeur.
 *
 * Entre deux bonnes d'une même couleur, l'As vaut plus cher que le 10 : rien
 * ne le prend dans sa couleur, alors que le 10 tombe devant un As — et le jeu
 * en compte deux exemplaires. D'où la règle de phase finale : on surpasse avec
 * le 10 et l'on garde l'As, car jouer l'As d'abord laisserait le 10 se faire
 * manger par le second As de la couleur.
 */
function keepValue(state: GameState, c: Card): number {
  let v = meldValue(state, c) + trumpKeepValue(state, c);
  if (isBonne(c)) {
    // Une bonne en main est un point à moitié acquis : encore faut-il
    // l'encaisser sur un pli gagné. Un As d'atout, lui, est imprenable.
    if (c.rank === "A") {
      const safe = state.trump === null || c.suit === state.trump;
      v += safe ? TUNE.safeAceInHand : TUNE.aceInHand;
    } else {
      v += TUNE.tenInHand;
    }
  }
  return v;
}

/** Le 10 d'atout que l'on détient met tout son tas en jeu. */
function trump10Exposure(state: GameState, c: Card): number {
  if (!state.trump || c.rank !== "10" || c.suit !== state.trump) return 0;
  return state.gains[1].filter(isBonne).length;
}

/* ---------- Heuristique tactique (expert et repli des niveaux hauts) ---------- */

function aiTacticalCard(state: GameState): Card {
  const legal = legalCards(state, 1);
  if (legal.length === 1) return legal[0]!;
  const trump = state.trump;
  const opp = readOpponent(state);
  const myBonnes = state.gains[1].filter(isBonne).length;
  const oppBonnes = state.gains[0].filter(isBonne).length;
  // Prendre la main ne vaut que par ce qu'elle permet — annoncer son compte,
  // ou priver l'adversaire du sien. Les deux termes tirent dans le même sens :
  // leur somme mesure ce que vaut la lutte pour ce pli.
  const myLead = myLeadGain(state);
  const oppLead = oppLeadGain(state, opp);

  /* --- Second joueur : le pli vaut-il la carte dépensée ? --- */
  if (state.trick.length === 1) {
    const led = state.trick[0]!.card;
    const ledPts = isBonne(led) ? 1 : 0;
    // Capturer le 10 d'atout adverse rafle tout son tas : gain énorme.
    const stealable = trump && led.rank === "10" && led.suit === trump ? oppBonnes : 0;

    let best: Card | null = null;
    let bestScore = -Infinity;
    for (const c of legal) {
      const wins = beats(c, led, trump);
      const mine = isBonne(c) ? 1 : 0;
      let score: number;
      if (wins) {
        // Je ramasse les deux cartes : ma bonne rentre dans mon tas, et
        // j'ouvre ma fenêtre d'annonce en refermant la sienne.
        score = ledPts + mine + stealable + myLead - keepValue(state, c);
      } else {
        // L'adversaire ramasse : je lui offre sa carte, la mienne, et la main.
        score =
          -ledPts -
          mine -
          oppLead -
          trump10Exposure(state, c) -
          0.2 * keepValue(state, c) +
          deadWeight(state, c);
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best!;
  }

  /* --- Entame : encaisser les bonnes imprenables, sinon écarter du déchet --- */
  let best: Card | null = null;
  let bestScore = -Infinity;
  for (const c of legal) {
    const bonne = isBonne(c);
    const mine = bonne ? 1 : 0;
    // Phase finale à main adverse connue : le pli se calcule au lieu de
    // s'estimer, sa réponse étant imposée par le règlement.
    const exact = endgameLead(state, c, opp);
    let risk: number;
    let pts: number;
    if (exact) {
      risk = exact.wins ? 0 : 1;
      pts = mine + exact.captured;
    } else {
      // Qui peut me battre ? Une carte de la même couleur plus forte, ou un atout.
      const pHigher = oppHas(
        opp,
        (x) => x.suit === c.suit && rankValue(x.rank) > rankValue(c.rank),
      );
      const pTrump = trump && c.suit !== trump ? oppHas(opp, (x) => x.suit === trump) : 0;
      // Sortir son 10 d'atout devant un As d'atout, c'est perdre tout son tas :
      // l'adversaire prendra à coup sûr, il n'y a rien à espérer de sa clémence.
      const feedsAtout10 = !!trump && c.rank === "10" && c.suit === trump && myBonnes > 0;
      // Sinon, l'adversaire ne dépense que si le pli en vaut la peine : il prend
      // volontiers une bonne, beaucoup moins volontiers du déchet.
      const wantHigher = feedsAtout10 ? 1 : bonne ? TUNE.wantBonneSameSuit : TUNE.wantPlainSameSuit;
      const wantTrump = bonne ? TUNE.wantBonneTrump : TUNE.wantPlainTrump;
      risk = pHigher * wantHigher + (1 - pHigher) * pTrump * wantTrump;
      pts = mine;
    }

    const score =
      (1 - risk) * (pts + myLead) -
      risk * (pts + oppLead + trump10Exposure(state, c)) -
      keepValue(state, c) +
      deadWeight(state, c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best!;
}

/* ==================================================================
 * Recherche PIMC (Perfect Information Monte Carlo)
 *
 * On échantillonne des mains adverses compatibles avec ce que l'IA a vu
 * passer, on résout chaque monde à information complète par un minimax
 * alpha-bêta sur quelques plis, et on retient la carte qui marque le
 * mieux en moyenne. Le simulateur ci-dessous est une version allégée du
 * moteur (seules les bonnes comptent au score) : il évite le clonage
 * profond de `GameState`, bien trop coûteux dans une recherche.
 * ================================================================== */

/** Nombre de comptes encore annonçables par couleur. */
type MeldRoom = Record<Suit, number>;

interface SimState {
  hands: [Card[], Card[]];
  stock: Card[];
  /** Bonnes déjà encaissées. */
  bonnes: [number, number];
  trump: Suit | null;
  lead: { player: PlayerIndex; card: Card } | null;
  turn: PlayerIndex;
  /** Constantes de la recherche : comptes restants et cartes déjà posées. */
  room: [MeldRoom, MeldRoom];
  used: [Set<string>, Set<string>];
}

/**
 * Points de compte encore atteignables avec cette main. Un compte vaut 4 ou 5
 * points — davantage que la plupart des plis — donc l'IA doit tenir ses Rois
 * et Dames plutôt que de les dépenser pour un pli sans bonne.
 */
function handMeldPotential(
  hand: Card[],
  trump: Suit | null,
  room: MeldRoom,
  used: Set<string>,
  stockLeft: number,
): number {
  if (stockLeft === 0) return 0; // plus d'annonce possible
  let total = 0;
  for (const s of SUITS) {
    if (room[s] <= 0) continue;
    let k = false;
    let q = false;
    let j = false;
    for (const c of hand) {
      if (c.suit !== s || used.has(c.id)) continue;
      if (c.rank === "K") k = true;
      else if (c.rank === "Q") q = true;
      else if (c.rank === "J") j = true;
    }
    if (!k || !q) continue;
    const full = s === trump || trump === null;
    total += full ? (j ? 5 : 4) : j ? 3 : 2;
  }
  // Il reste à gagner un pli au bon moment pour l'annoncer : on n'en compte
  // qu'une fraction, sans quoi l'IA surprotégerait ces cartes.
  return total * TUNE.meldPotential;
}

/** Mêmes contraintes que `legalCards`, sur l'état allégé. */
function simLegal(s: SimState, p: PlayerIndex): Card[] {
  const hand = s.hands[p];
  if (!s.lead || s.stock.length > 0) return hand;
  const led = s.lead.card;
  const same = hand.filter((c) => c.suit === led.suit);
  if (same.length === 0) {
    const trumps = s.trump ? hand.filter((c) => c.suit === s.trump) : [];
    return trumps.length ? trumps : hand;
  }
  const winning = same.filter((c) => beats(c, led, s.trump));
  if (winning.length) return winning;
  const sorted = [...same].sort((x, y) => rankValue(y.rank) - rankValue(x.rank));
  const top = sorted[0]!;
  if (isBonne(top) && sorted.length > 1) return [top, sorted[1]!]; // protection d'une bonne
  return [top];
}

/** Deux exemplaires d'une même carte sont interchangeables : on n'en teste qu'un. */
function dedupe(cards: Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of cards) {
    const k = `${c.rank}${c.suit}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

function simPlay(s: SimState, c: Card): SimState {
  const p = s.turn;
  const rest = s.hands[p].filter((x) => x !== c);
  const handsAfter: [Card[], Card[]] = p === 0 ? [rest, s.hands[1]] : [s.hands[0], rest];

  if (!s.lead) {
    return {
      ...s,
      hands: handsAfter,
      lead: { player: p, card: c },
      turn: (1 - p) as PlayerIndex,
    };
  }

  const led = s.lead;
  const winner: PlayerIndex = beats(c, led.card, s.trump) ? p : led.player;
  const loser: PlayerIndex = (1 - winner) as PlayerIndex;
  const bonnes: [number, number] = [s.bonnes[0], s.bonnes[1]];
  bonnes[winner] += (isBonne(led.card) ? 1 : 0) + (isBonne(c) ? 1 : 0);
  // Règle « Atout 10 » : le perdant du pli qui y laisse le 10 d'atout
  // abandonne tout son tas.
  const loserCard = loser === p ? c : led.card;
  if (s.trump && loserCard.rank === "10" && loserCard.suit === s.trump) {
    bonnes[winner] += bonnes[loser];
    bonnes[loser] = 0;
  }

  let stock = s.stock;
  const hands: [Card[], Card[]] = [handsAfter[0], handsAfter[1]];
  if (stock.length > 0) {
    hands[winner] = [...hands[winner], stock[0]!];
    stock = stock.slice(1);
    if (stock.length > 0) {
      hands[loser] = [...hands[loser], stock[0]!];
      stock = stock.slice(1);
    }
  }
  return { ...s, hands, stock, bonnes, lead: null, turn: winner };
}

/** Évaluation d'une position, du point de vue de l'IA (joueur 1). */
function simEval(s: SimState): number {
  let v = s.bonnes[1] - s.bonnes[0];
  const over = s.hands[0].length === 0 && s.hands[1].length === 0;
  const inHand = (p: PlayerIndex) => s.hands[p].filter(isBonne).length;
  // Une bonne encore en main n'est qu'à moitié acquise.
  v += 0.4 * (inHand(1) - inHand(0));
  // Comptes encore réalisables de part et d'autre.
  v +=
    handMeldPotential(s.hands[1], s.trump, s.room[1], s.used[1], s.stock.length) -
    handMeldPotential(s.hands[0], s.trump, s.room[0], s.used[0], s.stock.length);
  if (s.trump) {
    const trumps = (p: PlayerIndex) => s.hands[p].filter((c) => c.suit === s.trump).length;
    v += 0.1 * (trumps(1) - trumps(0));
    const hasTen = (p: PlayerIndex) =>
      s.hands[p].some((c) => c.rank === "10" && c.suit === s.trump);
    // Détenir le 10 d'atout met son propre tas en jeu.
    if (hasTen(1)) v -= 0.1 * s.bonnes[1];
    if (hasTen(0)) v += 0.1 * s.bonnes[0];
  }
  // « La main » : le dernier pli vaut 1 point.
  if (over) v += s.turn === 1 ? 1 : -1;
  else v += s.turn === 1 ? 0.15 : -0.15;
  return v;
}

/** Ordonne les coups pour que l'élagage alpha-bêta coupe tôt. */
function simOrder(s: SimState, moves: Card[]): Card[] {
  if (!s.lead) return [...moves].sort((a, b) => rankValue(b.rank) - rankValue(a.rank));
  const led = s.lead.card;
  return [...moves].sort((a, b) => {
    const wa = beats(a, led, s.trump) ? 1 : 0;
    const wb = beats(b, led, s.trump) ? 1 : 0;
    if (wa !== wb) return wb - wa; // gagner d'abord
    return rankValue(a.rank) - rankValue(b.rank); // au meilleur marché
  });
}

/**
 * Plafond de nœuds explorés par décision. Calibré au banc d'essai : au-delà,
 * le gain de force devient marginal alors que le pire temps de décision
 * grimpe (650 ms à 400 000 nœuds, contre 234 ms ici) et ferait tressauter
 * l'interface, qui laisse 750 ms à l'IA avant de poser sa carte.
 */
const SEARCH_NODE_BUDGET = 120000;

function simSearch(
  s: SimState,
  tricks: number,
  alpha: number,
  beta: number,
  budget: { n: number },
): number {
  if (s.hands[0].length === 0 && s.hands[1].length === 0) return simEval(s);
  if (!s.lead && (tricks <= 0 || budget.n <= 0)) return simEval(s);
  budget.n -= 1;

  const p = s.turn;
  const moves = simOrder(s, dedupe(simLegal(s, p)));
  let best = p === 1 ? -Infinity : Infinity;
  for (const c of moves) {
    const ns = simPlay(s, c);
    const nt = ns.lead === null ? tricks - 1 : tricks;
    const v = simSearch(ns, nt, alpha, beta, budget);
    if (p === 1) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best === Infinity || best === -Infinity ? simEval(s) : best;
}

/** Tire une main adverse et une pioche compatibles avec les cartes vues. */
function determinize(state: GameState, unseen: Card[]): SimState {
  const pool = [...unseen];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  // Les cartes de compte posées par l'adversaire sont connues.
  const exposedIds = new Set(state.exposed[0]);
  const known = state.hands[0].filter((c) => exposedIds.has(c.id));
  const need = Math.max(0, state.hands[0].length - known.length);
  const oppHand = [...known, ...pool.slice(0, need)];
  const lead = state.trick.length === 1 ? state.trick[0]! : null;

  // Comptes restants par couleur : un seul par couleur, deux à l'atout
  // (le second jeu de cartes fournit le deuxième Roi + Dame).
  const roomOf = (p: PlayerIndex): MeldRoom => {
    const room = {} as MeldRoom;
    for (const s of SUITS) {
      const max = s === state.trump ? 2 : 1;
      const done = state.melds[p].filter((m) => m.suit === s).length;
      room[s] = Math.max(0, max - done);
    }
    return room;
  };

  return {
    hands: [oppHand, [...state.hands[1]]],
    stock: pool.slice(need),
    bonnes: [state.gains[0].filter(isBonne).length, state.gains[1].filter(isBonne).length],
    trump: state.trump,
    lead: lead ? { player: lead.player, card: lead.card } : null,
    turn: 1,
    room: [roomOf(0), roomOf(1)],
    used: [exposedIds, new Set(state.exposed[1])],
  };
}

/**
 * Choisit une carte en moyennant la valeur minimax sur plusieurs mains
 * adverses possibles. Renvoie null si la recherche n'est pas applicable.
 */
function pimcChoose(
  state: GameState,
  samples: number,
  tricks: number,
  nodeBudget = SEARCH_NODE_BUDGET,
): Card | null {
  const legal = legalCards(state, 1);
  if (legal.length <= 1) return legal[0] ?? null;
  const candidates = dedupe(legal);
  if (candidates.length === 1) return candidates[0]!;

  const unseen = unseenCards(state);
  // Pioche vide : les cartes invisibles SONT la main adverse, le monde est
  // entièrement déterminé — un seul tirage suffit et la solution est exacte.
  const exposedCount = state.hands[0].filter((c) => state.exposed[0].includes(c.id)).length;
  const hidden = state.hands[0].length - exposedCount;
  if (unseen.length !== hidden + state.stock.length) return null; // comptage incohérent
  const rounds = state.stock.length === 0 ? 1 : samples;

  // Budget réparti équitablement entre tous les mondes et toutes les cartes
  // candidates : la recherche doit rester imperceptible en jeu, et le banc
  // d'essai doit pouvoir enchaîner des milliers de tours.
  const slice = Math.max(200, Math.floor(nodeBudget / (rounds * candidates.length)));
  const totals = new Map<Card, number>();
  for (let i = 0; i < rounds; i += 1) {
    const base = determinize(state, unseen);
    for (const c of candidates) {
      const ns = simPlay(base, c);
      const nt = ns.lead === null ? tricks - 1 : tricks;
      const v = simSearch(ns, nt, -Infinity, Infinity, { n: slice });
      totals.set(c, (totals.get(c) ?? 0) + v);
    }
  }

  let best: Card | null = null;
  let bestV = -Infinity;
  for (const [c, v] of totals) {
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/* ---------- Annonces ---------- */

export function aiAnnounce(state: GameState): { suits: Suit[]; trump: Suit | null } | null {
  const opts = availableMelds(state, 1);
  if (!opts.length) return null;
  const suits = opts.map((o) => o.suit);
  // choisit comme atout la couleur où elle a le plus de cartes
  const best = [...opts].sort((a, b) => {
    const cnt = (s: Suit) => state.hands[1].filter((c) => c.suit === s).length;
    return b.cards.length - a.cards.length || cnt(b.suit) - cnt(a.suit);
  })[0]!;
  return { suits, trump: state.trump === null ? best.suit : null };
}

/**
 * Annonce réfléchie. Un compte vaut 4 ou 5 points, davantage que la plupart
 * des plis : on annonce dès que possible. Le seul vrai choix est la couleur
 * d'atout, qui protège ses propres bonnes de cette couleur mais expose les
 * autres à la coupe.
 */
export function aiAnnounceAt(
  state: GameState,
  level: Difficulty,
): { suits: Suit[]; trump: Suit | null } | null {
  const opts = availableMelds(state, 1);
  if (!opts.length) return null;
  const suits = opts.map((o) => o.suit);
  if (level === "facile" || level === "normal") return aiAnnounce(state);

  // L'atout est déjà fixé : on encaisse simplement les points.
  if (state.trump !== null) return { suits, trump: null };

  const hand = state.hands[1];
  const score = (s: Suit) => {
    const length = hand.filter((c) => c.suit === s).length;
    const bonnesIn = hand.filter((c) => c.suit === s && isBonne(c)).length;
    const bonnesOut = hand.filter((c) => c.suit !== s && isBonne(c)).length;
    const triple = opts.find((o) => o.suit === s)?.type === "triple" ? 1 : 0;
    // Longueur et bonnes de la couleur deviennent imprenables ; les bonnes
    // des autres couleurs, elles, deviennent coupables par l'adversaire.
    return 1.0 * length + 0.9 * bonnesIn - 0.55 * bonnesOut + 0.3 * triple;
  };
  const trump = [...suits].sort((a, b) => score(b) - score(a))[0]!;
  return { suits, trump };
}

/* ---------- Choix de carte ---------- */

/** Heuristique simple, volontairement faillible (niveaux bas). */
export function aiChooseCard(state: GameState): Card {
  const legal = legalCards(state, 1);
  const trump = state.trump;
  const val = (c: Card) => rankValue(c.rank) + (trump && c.suit === trump ? 10 : 0);

  if (state.trick.length === 0) {
    // Mène : privilégie une bonne d'atout ou une carte forte hors atout
    const nonBonne = legal.filter((c) => !isBonne(c));
    const pool = nonBonne.length ? nonBonne : legal;
    return [...pool].sort((a, b) => val(b) - val(a))[0]!;
  }
  const led = state.trick[0]!.card;
  const winning = legal.filter((c) => beats(c, led, trump));
  if (winning.length) {
    const worthIt = isBonne(led) || (trump && led.suit === trump && led.rank === "10");
    if (worthIt || winning.some((c) => !isBonne(c))) {
      const cheap = winning.filter((c) => !isBonne(c));
      const pool = cheap.length ? cheap : winning;
      return [...pool].sort((a, b) => val(a) - val(b))[0]!;
    }
    return [...winning].sort((a, b) => val(a) - val(b))[0]!;
  }
  const safe = legal.filter((c) => !isBonne(c));
  const pool = safe.length ? safe : legal;
  return [...pool].sort((a, b) => val(a) - val(b))[0]!;
}

export function aiChooseCardAt(state: GameState, level: Difficulty): Card {
  const legal = legalCards(state, 1);
  if (legal.length === 1) return legal[0]!;

  if (level === "facile") {
    // Joue presque au hasard, protège rarement ses bonnes
    if (Math.random() < 0.7) return legal[Math.floor(Math.random() * legal.length)]!;
    return aiChooseCard(state);
  }
  if (level === "normal") {
    if (Math.random() < 0.25) return legal[Math.floor(Math.random() * legal.length)]!;
    return aiChooseCard(state);
  }
  if (level === "expert") return aiTacticalCard(state);

  // Maître et Légende : une fois la pioche vide, les cartes encore invisibles
  // SONT exactement la main adverse. La position est donc à information
  // complète et se résout intégralement — ce n'est plus une estimation mais
  // le meilleur coup, protection des bonnes et 10 d'atout compris.
  //
  // Légende attaque cette résolution deux cartes plus tôt : à ce stade, seules
  // les deux dernières cartes de pioche restent inconnues, l'échantillonnage
  // les couvre sans peine. Au-delà, le banc d'essai est net : élargir la
  // fenêtre AFFAIBLIT le jeu (51 % à quatre cartes d'avance contre 57 % ici),
  // car l'incertitude de la pioche rend les mondes tirés trompeurs — mieux vaut
  // alors l'heuristique, qui raisonne sur les probabilités plutôt que sur un
  // tirage particulier. Cette fenêtre étroite est aussi trois fois plus rapide.
  const from = level === "legende" ? 2 : 0;
  if (state.stock.length <= from) {
    const samples = state.stock.length === 0 ? 1 : 8;
    const exact = pimcChoose(state, samples, 12);
    if (exact) return exact;
  }
  return aiTacticalCard(state);
}

export function aiWantsRedeal(state: GameState, level: Difficulty): boolean {
  if (!hasMainBlanche(state, 1)) return false;
  return level === "facile" ? Math.random() < 0.5 : true;
}

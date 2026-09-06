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
  forfeit?: { loser: PlayerIndex; reason: "timeout" | "disconnect" } | null;
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

export function newRound(
  dealer: PlayerIndex,
  roundsWon: [number, number] = [0, 0],
): GameState {
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

export function availableMelds(
  state: GameState,
  p: PlayerIndex,
  anytime = false,
): MeldOption[] {
  if (state.stock.length === 0) return [];
  if (!anytime && state.canAnnounce !== p) return [];
  const hand = state.hands[p];
  const done = new Set(state.melds[p].map((m) => m.suit));
  const out: MeldOption[] = [];
  for (const s of SUITS) {
    if (done.has(s)) continue;
    const k = hand.find((c) => c.suit === s && c.rank === "K");
    const q = hand.find((c) => c.suit === s && c.rank === "Q");
    if (!k || !q) continue;
    const j = hand.find((c) => c.suit === s && c.rank === "J");
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

  let simpleAnnounced: Suit | null = null;
  const ordered = trumpSuit
    ? [opts.find((o) => o.suit === trumpSuit)!, ...opts.filter((o) => o.suit !== trumpSuit)]
    : opts;

  ordered.forEach((o, i) => {
    const first = isFirstAnnounceOfRound && i === 0;
    const pts = meldPoints(o.type, first);
    s.melds[p].push({ suit: o.suit, type: o.type, points: pts, first });
    s.exposed[p].push(...o.cards.map((c) => c.id));
    if (o.type === "simple") simpleAnnounced = o.suit;
    s.log.unshift(
      `${name(p)} annonce un compte ${o.type} à ${SUIT_NAME[o.suit]} (${pts} pts).`,
    );
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
  s.log.unshift(
    `${name(winner)} remporte le pli (${label(first.card)} / ${label(second.card)}).`,
  );

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

/* ---------- IA ---------- */

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
 * Annonce réfléchie : aux niveaux élevés, l'IA diffère la première annonce
 * tant qu'elle garde des bonnes (10 / As) dans d'autres couleurs, car fixer
 * l'atout rendrait ces bonnes vulnérables. Elle attend d'avoir libéré ces
 * bonnes, sauf si la pioche s'épuise (dernière occasion d'annoncer).
 */
export function aiAnnounceAt(
  state: GameState,
  level: Difficulty,
): { suits: Suit[]; trump: Suit | null } | null {
  const base = aiAnnounce(state);
  if (!base) return null;
  if (level !== "maitre" && level !== "legende") return base;

  // L'atout est déjà fixé : plus rien à optimiser, on encaisse les points.
  if (state.trump !== null || !base.trump) return base;

  const loose = state.hands[1].filter((c) => isBonne(c) && c.suit !== base.trump);
  if (loose.length === 0) return base;

  // Nombre approximatif de plis restants avant l'épuisement de la pioche.
  const tricksLeft = Math.floor(state.stock.length / 2);
  // Assez de temps pour écouler ces bonnes en toute sécurité : on patiente.
  if (tricksLeft > loose.length + 1) return null;
  return base;
}

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

/* --- Mémoire des cartes : ce que l'IA a déjà vu passer --- */

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

/** Probabilité approximative que l'adversaire puisse battre `c` s'il est second. */


function beatRisk(state: GameState, c: Card): number {
  const pool = unseenCards(state);
  if (!pool.length) return 0;
  const oppSize = state.hands[0].length;
  const inHandRatio = Math.min(1, oppSize / pool.length);
  const beaters = pool.filter((x) => beats(x, c, state.trump)).length;
  const pPerCard = beaters / pool.length;
  return 1 - Math.pow(1 - pPerCard, Math.max(1, Math.round(inHandRatio * oppSize)));
}

/* --- Fin de tour : résolution exacte quand la pioche est vide --- */

interface EndNode {
  ai: Card[];
  hu: Card[];
  lead: PlayerIndex;
  led: Card | null;
}

function endgameValue(node: EndNode, trump: Suit | null, depth: number): number {
  if (node.ai.length === 0 && node.hu.length === 0) return 0;
  const mover: PlayerIndex = node.led === null ? node.lead : node.lead === 0 ? 1 : 0;
  const hand = mover === 1 ? node.ai : node.hu;
  const options = endgameLegal(hand, node.led, trump);
  let best = mover === 1 ? -Infinity : Infinity;
  for (const c of options) {
    const rest = hand.filter((x) => x !== c);
    let v: number;
    if (node.led === null) {
      v = endgameValue(
        {
          ai: mover === 1 ? rest : node.ai,
          hu: mover === 1 ? node.hu : rest,
          lead: node.lead,
          led: c,
        },
        trump,
        depth + 1,
      );
    } else {
      const winner: PlayerIndex = beats(c, node.led, trump) ? mover : node.lead;
      const pts = [node.led, c].filter(isBonne).length * (winner === 1 ? 1 : -1);
      v =
        pts +
        endgameValue(
          {
            ai: mover === 1 ? rest : node.ai,
            hu: mover === 1 ? node.hu : rest,
            lead: winner,
            led: null,
          },
          trump,
          depth + 1,
        );
    }
    if (mover === 1) best = Math.max(best, v);
    else best = Math.min(best, v);
  }
  return best === -Infinity || best === Infinity ? 0 : best;
}

function endgameLegal(hand: Card[], led: Card | null, trump: Suit | null): Card[] {
  if (!led) return hand;
  const same = hand.filter((c) => c.suit === led.suit);
  if (same.length === 0) {
    const trumps = trump ? hand.filter((c) => c.suit === trump) : [];
    return trumps.length ? trumps : hand;
  }
  const winning = same.filter((c) => beats(c, led, trump));
  if (winning.length) return winning;
  const sorted = [...same].sort((x, y) => rankValue(y.rank) - rankValue(x.rank));
  const top = sorted[0]!;
  if (isBonne(top) && sorted.length > 1) return [top, sorted[1]!];
  return [top];
}

function endgameBest(state: GameState): Card | null {
  if (state.stock.length > 0) return null;
  const hu = unseenCards(state).slice(0, state.hands[0].length);
  if (hu.length !== state.hands[0].length) return null;
  const ai = state.hands[1];
  if (ai.length > 6) return null;
  const led = state.trick.length ? state.trick[0]!.card : null;
  const lead: PlayerIndex = state.trick.length ? state.trick[0]!.player : 1;
  const options = endgameLegal(ai, led, state.trump);
  let best: Card | null = null;
  let bestV = -Infinity;
  for (const c of options) {
    const rest = ai.filter((x) => x !== c);
    let v: number;
    if (!led) {
      v = endgameValue({ ai: rest, hu, lead: 1, led: c }, state.trump, 0);
    } else {
      const winner: PlayerIndex = beats(c, led, state.trump) ? 1 : lead;
      const pts = [led, c].filter(isBonne).length * (winner === 1 ? 1 : -1);
      v = pts + endgameValue({ ai: rest, hu, lead: winner, led: null }, state.trump, 0);
    }
    if (v > bestV) {
      bestV = v;
      best = c;
    }
  }
  return best;
}

/* --- IA avancée (maître / légende) --- */

/** Valeur de conservation d'une carte pour un compte encore possible. */
function meldValue(state: GameState, c: Card): number {
  if (state.stock.length === 0) return 0; // plus d'annonce possible en phase finale
  if (c.rank !== "K" && c.rank !== "Q" && c.rank !== "J") return 0;
  if (state.melds[1].some((m) => m.suit === c.suit && m.type === "triple")) return 0;
  const hand = state.hands[1];
  const has = (r: Rank) => hand.some((x) => x.suit === c.suit && x.rank === r && x.id !== c.id);
  const announced = state.melds[1].some((m) => m.suit === c.suit);
  if (c.rank === "J") {
    // Le valet ne vaut que s'il complète un compte simple annoncé ou en main
    if (announced) return 2.2;
    return has("K") && has("Q") ? 2.6 : 0.4;
  }
  const partner: Rank = c.rank === "K" ? "Q" : "K";
  if (announced) return 0; // K/Q déjà posés : ils ne rapportent plus rien de neuf
  if (has(partner)) return has("J") ? 3.4 : 2.8;
  return 0.9; // espoir de retrouver le partenaire à la pioche
}

/** Valeur d'un atout gardé pour la phase finale (pioche épuisée). */
function trumpKeepValue(state: GameState, c: Card): number {
  const trump = state.trump;
  if (!trump || c.suit !== trump) return 0;
  const stock = state.stock.length;
  if (stock === 0) return 0; // la phase finale est là : les atouts servent
  const strength = rankValue(c.rank) / (RANKS.length - 1); // 0 → 1
  const urgency = Math.min(1, stock / 10);
  return (0.8 + strength * 2.2) * urgency;
}

function aiSmartCard(state: GameState, deep: boolean): Card {
  const legal = legalCards(state, 1);
  if (legal.length === 1) return legal[0]!;
  const trump = state.trump;

  if (deep) {
    const exact = endgameBest(state);
    if (exact) return exact;
  }

  const val = (c: Card) => rankValue(c.rank) + (trump && c.suit === trump ? 10 : 0);
  // Coût total de la carte si on s'en sépare
  const keep = (c: Card) => meldValue(state, c) + trumpKeepValue(state, c) + (isBonne(c) ? 3 : 0);
  const cheapest = (pool: Card[]) =>
    [...pool].sort((a, b) => keep(a) - keep(b) || val(a) - val(b))[0]!;

  // En second : décider si le pli vaut la dépense
  if (state.trick.length === 1) {
    const led = state.trick[0]!.card;
    const winning = legal.filter((c) => beats(c, led, trump));
    const stake = isBonne(led) ? 1 : 0;
    const tenTrump = trump && led.rank === "10" && led.suit === trump;
    if (winning.length) {
      const cheapWin = cheapest(winning);
      const cost = keep(cheapWin);
      // Gain espéré : bonne adverse capturée, 10 d'atout, ou pli gratuit
      const gain = (stake ? 3 : 0) + (tenTrump ? 4 : 0) + (cost < 0.8 ? 1 : 0);
      if (gain >= cost) return cheapWin;
      const dump = legal.filter((c) => keep(c) < cost);
      if (dump.length) return cheapest(dump);
      return cheapWin;
    }
    return cheapest(legal);
  }

  // À l'entame : jouer la carte la plus sûre / la plus gênante
  const scored = legal.map((c) => {
    const risk = beatRisk(state, c);
    const isB = isBonne(c);
    // On veut : peu de risque de perdre une bonne, et forcer l'adversaire à se défausser
    let score = (1 - risk) * (isB ? 2.2 : 1);
    if (isB && risk > 0.35) score -= 2.5; // ne pas exposer une bonne
    score -= trumpKeepValue(state, c) * 0.9; // garder les atouts pour la phase finale
    score -= meldValue(state, c) * 1.1; // garder les cartes utiles à un compte
    if (!isB && risk > 0.6) score += 0.35; // écarter les cartes faibles utiles à rien
    // Sortir tôt les bonnes hors atout tant que l'atout n'est pas fixé
    if (isB && !trump && risk < 0.3) score += 0.8;
    if (isB && trump && c.suit !== trump && state.stock.length > 4 && risk < 0.25) score += 0.5;
    score -= rankValue(c.rank) * 0.02;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.c;
}

export function aiChooseCardAt(state: GameState, level: Difficulty): Card {
  const legal = legalCards(state, 1);
  if (level === "facile") {
    // Joue presque au hasard, protège rarement ses bonnes
    if (Math.random() < 0.7) return legal[Math.floor(Math.random() * legal.length)]!;
    return aiChooseCard(state);
  }
  if (level === "normal") {
    if (Math.random() < 0.25) return legal[Math.floor(Math.random() * legal.length)]!;
    return aiChooseCard(state);
  }
  if (level === "maitre") return aiSmartCard(state, false);
  if (level === "legende") return aiSmartCard(state, true);
  // Expert : heuristique complète + conservation des atouts forts en début de tour
  const trump = state.trump;
  if (state.trick.length === 0 && trump && state.stock.length > 2) {
    const offTrump = legal.filter((c) => c.suit !== trump && !isBonne(c));
    if (offTrump.length)
      return [...offTrump].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))[0]!;
  }
  return aiChooseCard(state);
}

export function aiWantsRedeal(state: GameState, level: Difficulty): boolean {
  if (!hasMainBlanche(state, 1)) return false;
  return level === "facile" ? Math.random() < 0.5 : true;
}


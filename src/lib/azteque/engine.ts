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

export function resolveTrick(state: GameState): GameState {
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

  // Capture du 10 d'atout de l'adversaire
  const loserCard = s.trick.find((t) => t.player === loser)?.card;
  if (s.trump && loserCard && loserCard.rank === "10" && loserCard.suit === s.trump) {
    const stolen = s.gains[loser].filter(isBonne);
    if (stolen.length) {
      s.gains[loser] = s.gains[loser].filter((c) => !isBonne(c));
      s.gains[winner].push(...stolen);
      s.log.unshift(
        `10 d'atout capturé ! ${name(winner)} récupère ${stolen.length} bonne(s).`,
      );
    }
  }

  s.trick = [];
  s.lastTrickWinner = winner;

  // Pioche : le vainqueur d'abord
  if (s.stock.length > 0) {
    const drawn = s.stock.shift()!;
    s.hands[winner].push(drawn);
    // Compléter un compte simple au premier tirage suivant l'annonce
    const pend = s.pendingUpgrade[winner];
    if (pend && drawn.suit === pend && drawn.rank === "J") {
      const m = s.melds[winner].find((x) => x.suit === pend && x.type === "simple");
      if (m) {
        m.type = "triple";
        m.points = meldPoints("triple", m.first);
        s.exposed[winner].push(drawn.id);
        s.log.unshift(`${name(winner)} complète son compte à ${SUIT_NAME[pend]} (triple).`);
      }
    }
    s.pendingUpgrade[winner] = null;
    if (s.stock.length > 0) {
      const d2 = s.stock.shift()!;
      s.hands[loser].push(d2);
      const pl = s.pendingUpgrade[loser];
      if (pl && d2.suit === pl && d2.rank === "J") {
        const m = s.melds[loser].find((x) => x.suit === pl && x.type === "simple");
        if (m) {
          m.type = "triple";
          m.points = meldPoints("triple", m.first);
          s.exposed[loser].push(d2.id);
        }
      }
      s.pendingUpgrade[loser] = null;
    }
  }

  s.leader = winner;
  s.turn = winner;
  s.canAnnounce = s.stock.length > 0 ? winner : null;

  if (s.hands[0].length === 0 && s.hands[1].length === 0) return endRound(s);
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
        ? "Tour nul : égalité."
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

export type Difficulty = "facile" | "normal" | "expert";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  facile: "Facile",
  normal: "Normal",
  expert: "Expert",
};

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

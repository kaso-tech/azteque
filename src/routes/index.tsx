import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIFFICULTY_LABEL,
  SUIT_NAME,
  SUIT_SYMBOL,
  aiAnnounceAt,
  aiChooseCardAt,
  aiWantsRedeal,
  announce,
  availableMelds,
  drawNext,
  hasMainBlanche,
  isBonne,
  legalCards,
  newRound,
  playCard,
  resolveTrick,
  trickCapturesPile,
  type Card,
  type GameState,
  type PlayerIndex,
  type Suit,
} from "@/lib/azteque/engine";
import {
  CapturedPile,
  GainsPanel,
  HandRow,
  StockPile,
  TrickPosition,
  TurnBar,
} from "@/components/azteque/table";
import { RulesPanel } from "@/components/azteque/RulesPanel";
import { cn } from "@/lib/utils";
import { sfx, setSoundEnabled } from "@/lib/azteque/sfx";
import {
  awardAiWin,
  claimDailyBonus,
  claimLocalTokens,
  getMyProfile,
  type Profile,
} from "@/lib/azteque/account";
import {
  DAILY_BONUS,
  claimLocalDailyBonus,
  getTokens as getLocalTokens,
  localBonusDay,
  todayKey,
} from "@/lib/azteque/tokens";
import { useTurnCountdown } from "@/hooks/useTurnTimer";
import { CollectCard, DrawCard, FlyingCard, SweepCard } from "@/components/azteque/animations";
import { DealCeremony, useDealCeremony } from "@/components/azteque/dealing";
import {
  AiProfilePanel,
  DEFAULT_SETTINGS,
  DailyBonusPanel,
  MeldHistoryPanel,
  PlayerProfilePanel,
  ProfileButton,
  Recap,
  TOKEN_REWARDS,
  type Settings,
} from "@/components/azteque/panels";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aztèque — Jeu de cartes traditionnel ouest-africain" },
      {
        name: "description",
        content:
          "Jouez à Aztèque en ligne : plis, bonnes, comptes et atout. Règlement officiel v1.0, partie en 3 tours contre l'ordinateur.",
      },
      { property: "og:title", content: "Aztèque — Jeu de cartes traditionnel" },
      {
        property: "og:description",
        content: "Conquérez les plis, annoncez vos comptes, créez l'atout et remportez le champ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Azteque,
});

const TURN_LIMIT = 30;

function Azteque() {
  const [state, setState] = useState<GameState>(() => newRound(1));
  const [showRules, setShowRules] = useState(false);
  const [showPlayerProfile, setShowPlayerProfile] = useState(false);
  const [showAiProfile, setShowAiProfile] = useState(false);
  const [showMyGains, setShowMyGains] = useState(false);
  const [showMyBonnes, setShowMyBonnes] = useState(false);
  const [tokens, setTokens] = useState(0);
  const tokenAwarded = useRef(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [playerName, setPlayerName] = useState("Joueur");
  const [profileReady, setProfileReady] = useState(false);
  // Un joueur connecté tient son pseudo et son solde de son compte : ils le
  // suivent d'un appareil à l'autre, et c'est le serveur qui les met à jour.
  // Hors connexion, le navigateur continue de faire foi.
  const [account, setAccount] = useState<Profile | null>(null);
  const accountBound = account !== null;
  const [choosingTrump, setChoosingTrump] = useState(false);
  const [started, setStarted] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [redealDone, setRedealDone] = useState(false);
  const [meldHistory, setMeldHistory] = useState<
    { key: string; round: number; player: PlayerIndex; label: string; points: number }[]
  >([]);
  const [showHistory, setShowHistory] = useState(false);

  const [flying, setFlying] = useState<{ card: Card; from: { x: number; y: number } } | null>(null);
  const [collect, setCollect] = useState<
    {
      id: number;
      card: Card;
      from: { x: number; y: number };
      to: { x: number; y: number };
      delay: number;
    }[]
  >([]);
  const [drawFlights, setDrawFlights] = useState<
    {
      id: number;
      player: PlayerIndex;
      from: { x: number; y: number };
      to: { x: number; y: number };
      delay: number;
    }[]
  >([]);
  const [sweepFlights, setSweepFlights] = useState<
    { id: number; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }[]
  >([]);

  const tableRef = useRef<HTMLDivElement | null>(null);
  const stockRef = useRef<HTMLDivElement | null>(null);
  const opponentHandRef = useRef<HTMLDivElement | null>(null);
  const playerHandRef = useRef<HTMLDivElement | null>(null);
  const trickSlotRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ] as const;
  const pileRefs = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ] as const;
  const aiRedealChecked = useRef(-1);
  const askedForName = useRef(false);

  // Réglages persistants
  useEffect(() => {
    try {
      const raw = localStorage.getItem("azteque-settings");
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      const savedName = localStorage.getItem("azteque-player-name")?.trim();
      if (savedName) setPlayerName(savedName);
      else {
        // Aucun nom dans ce navigateur : on le demande. Si un compte répond
        // ensuite, son pseudo fait foi et la demande n'a plus lieu d'être.
        askedForName.current = true;
        setShowPlayerProfile(true);
      }
      setTokens(Math.max(0, Number(localStorage.getItem("azteque-tokens")) || 0));
    } catch {
      /* ignore */
    } finally {
      setProfileReady(true);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("azteque-settings", JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    if (!profileReady || accountBound) return;
    try {
      localStorage.setItem("azteque-player-name", playerName.trim() || "Joueur");
    } catch {
      /* ignore */
    }
  }, [playerName, profileReady, accountBound]);

  useEffect(() => {
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  // Synchronisation avec le compte : le pseudo choisi à l'inscription remplace
  // celui de ce navigateur, et les jetons gagnés hors connexion viennent
  // s'ajouter au solde du compte avant que celui-ci ne prenne le relais.
  useEffect(() => {
    let alive = true;
    getMyProfile()
      .then(async (p) => {
        if (!alive || !p) return;
        setAccount(p);
        setPlayerName(p.username);
        if (askedForName.current) {
          askedForName.current = false;
          setShowPlayerProfile(false);
        }
        const carried = await claimLocalTokens(getLocalTokens()).catch(() => null);
        if (!alive) return;
        setTokens(carried ?? p.tokens);
      })
      .catch(() => {
        /* hors ligne ou non connecté : on reste sur le profil du navigateur */
      })
      .finally(() => {
        if (alive) setAccountChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Cadeau du jour.
  //
  // La proposition attend de savoir si un compte est ouvert : avec un compte,
  // c'est le serveur qui tient la date du dernier versement et décide ; sans
  // compte, c'est le navigateur. Décider avant la réponse reviendrait à verser
  // deux fois le même cadeau, une fois ici et une fois là-bas.
  const [accountChecked, setAccountChecked] = useState(false);
  const [showBonus, setShowBonus] = useState(false);
  const bonusAsked = useRef(false);
  useEffect(() => {
    if (!accountChecked || bonusAsked.current) return;
    bonusAsked.current = true;
    const due = account ? account.daily_bonus_at < todayKey() : localBonusDay() !== todayKey();
    if (due) setShowBonus(true);
  }, [accountChecked, account]);

  const collectBonus = useCallback(async () => {
    if (account) {
      const { granted, tokens: solde } = await claimDailyBonus();
      if (granted <= 0) return null;
      setTokens(solde);
      setAccount((a) => (a ? { ...a, tokens: solde, daily_bonus_at: todayKey() } : a));
      return solde;
    }
    const solde = claimLocalDailyBonus();
    if (solde === null) return null;
    setTokens(solde);
    return solde;
  }, [account]);

  useEffect(() => {
    if (!profileReady || accountBound) return;
    try {
      localStorage.setItem("azteque-tokens", String(tokens));
    } catch {
      /* ignore */
    }
  }, [tokens, profileReady, accountBound]);

  useEffect(() => {
    if (state.phase !== "gameEnd" || state.champWinner !== 0 || tokenAwarded.current) return;
    tokenAwarded.current = true;
    if (!accountBound) {
      setTokens((t) => t + TOKEN_REWARDS[settings.difficulty]);
      return;
    }
    // Le montant de la récompense est fixé par le serveur selon le niveau
    // réellement affronté : le client ne peut pas se l'attribuer lui-même.
    awardAiWin(settings.difficulty)
      .then((balance) => {
        if (balance !== null) setTokens(balance);
      })
      .catch(() => setTokens((t) => t + TOKEN_REWARDS[settings.difficulty]));
  }, [state.phase, state.champWinner, settings.difficulty, accountBound]);

  useEffect(() => {
    if (state.phase !== "playing" || state.gains[0].length === 0) setShowMyGains(false);
  }, [state.phase, state.gains]);

  // Historique des comptes annoncés
  useEffect(() => {
    setMeldHistory((prev) => {
      const known = new Set(prev.map((e) => e.key));
      const added: typeof prev = [];
      ([0, 1] as PlayerIndex[]).forEach((p) => {
        state.melds[p].forEach((m) => {
          const key = `${roundKey}-${p}-${m.suit}-${m.type}`;
          if (known.has(key)) return;
          added.push({
            key,
            round: roundKey + 1,
            player: p,
            label: `${SUIT_SYMBOL[m.suit]} ${SUIT_NAME[m.suit]} — compte ${m.type === "triple" ? "trio" : "simple"}`,
            points: m.points,
          });
        });
      });
      return added.length > 0 ? [...prev, ...added] : prev;
    });
  }, [state.melds, roundKey]);

  const myMelds = useMemo(() => availableMelds(state, 0), [state]);
  const legal = useMemo(
    () =>
      state.turn === 0 &&
      state.phase === "playing" &&
      state.trick.length < 2 &&
      state.drawPending.length === 0
        ? legalCards(state, 0)
        : [],
    [state],
  );
  const legalIds = useMemo(() => new Set(legal.map((c) => c.id)), [legal]);
  // Tant que la proposition de compte est affichée et non tranchée,
  // le joueur ne peut pas jouer : il doit annoncer ou passer.
  const meldDecisionPending =
    state.phase === "playing" &&
    state.canAnnounce === 0 &&
    state.drawPending[0] === 0 &&
    state.hands[0].length === 5 &&
    myMelds.length > 0 &&
    state.stock.length > 0;

  const freshRound =
    state.phase === "playing" &&
    state.trick.length === 0 &&
    state.gains[0].length === 0 &&
    state.gains[1].length === 0 &&
    state.melds[0].length === 0 &&
    state.melds[1].length === 0;

  // Battage et distribution : le temps qu'ils durent, l'ordinateur ne joue pas
  // et le compte à rebours ne court pas — le joueur regarde, il ne réfléchit
  // pas encore.
  const dealing = useDealCeremony(state, started);

  // L'offre de redistribution attend la fin de la donne : proposée pendant,
  // elle annoncerait le contenu de la main avant que les cartes n'y soient.
  const canRedeal = freshRound && !dealing && !redealDone && hasMainBlanche(state, 0);

  const deal = useCallback((dealer: PlayerIndex, won: [number, number]) => {
    setState(newRound(dealer, won));
    // Les comptes annoncés valent pour le tour écoulé : la nouvelle donne
    // repart d'un historique vide.
    setMeldHistory([]);
    setChoosingTrump(false);
    setRedealDone(false);
    setRoundKey((k) => k + 1);
  }, []);

  // Main blanche de l'ordinateur
  useEffect(() => {
    if (!started || !freshRound || dealing || aiRedealChecked.current === roundKey) return;
    aiRedealChecked.current = roundKey;
    if (aiWantsRedeal(state, settings.difficulty)) {
      const t = setTimeout(() => {
        setState((s) => {
          const ns = newRound(s.dealer, s.roundsWon);
          ns.log.unshift("L'adversaire avait une main blanche : redistribution.");
          return ns;
        });
        setRoundKey((k) => k + 1);
      }, 500);
      return () => clearTimeout(t);
    }
    return;
  }, [started, freshRound, dealing, roundKey, state, settings.difficulty]);

  // Résolution du pli : ramassage animé puis pioche, avec de petites pauses
  useEffect(() => {
    if (state.phase !== "playing" || state.trick.length < 2) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const center = (el: HTMLElement | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };

    timers.push(
      setTimeout(() => {
        const next = resolveTrick(state, { atout10: true });
        const winner = next.lastTrickWinner;
        const first = state.trick[0]!;
        const second = state.trick[1]!;
        const fromFirst = center(trickSlotRefs[first.player].current);
        const fromSecond = center(trickSlotRefs[second.player].current);
        const winnerPile = winner === null ? null : center(pileRefs[winner].current);

        const flights: typeof collect = [];
        const lastDelay = 140;
        // Après comparaison, les deux cartes convergent uniquement vers le tas gagnant.
        if (fromFirst && winnerPile)
          flights.push({ id: 1, card: first.card, from: fromFirst, to: winnerPile, delay: 0 });
        if (fromSecond && winnerPile)
          flights.push({
            id: 2,
            card: second.card,
            from: fromSecond,
            to: winnerPile,
            delay: lastDelay,
          });

        if (winner === second.player) sfx.beat();
        else sfx.collect();
        setCollect(flights);
        timers.push(setTimeout(() => sfx.collect(), lastDelay + 120));
        // Petit ricanement dès qu'une bonne tombe dans un tas
        if ([first.card, second.card].some(isBonne))
          timers.push(setTimeout(() => sfx.snicker(), lastDelay + 240));

        // Règle « Atout 10 » : transfert animé de tout le tas adverse
        const sweeps =
          winner !== null && trickCapturesPile(state, { atout10: true })
            ? state.gains[winner === 0 ? 1 : 0].length
            : 0;
        const loserPile = winner === null ? null : center(pileRefs[winner === 0 ? 1 : 0].current);

        timers.push(
          setTimeout(() => {
            setCollect([]);
            if (sweeps > 0 && loserPile && winnerPile) {
              const layers = Math.min(6, sweeps);
              sfx.sweep();
              setSweepFlights(
                Array.from({ length: layers }, (_, i) => ({
                  id: i,
                  from: loserPile,
                  to: winnerPile,
                  delay: i * 90,
                })),
              );
              timers.push(
                setTimeout(
                  () => {
                    setSweepFlights([]);
                    setState(next);
                  },
                  layers * 90 + 620,
                ),
              );
              return;
            }
            setState(next);
          }, lastDelay + 560),
        );
      }, settings.trickDelay),
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, settings.trickDelay]);

  // Pioche : une carte à la fois, après l'éventuelle annonce du vainqueur.
  // La carte n'apparaît dans la main qu'à l'arrivée de l'animation.
  useEffect(() => {
    if (state.phase !== "playing" || state.drawPending.length === 0) return;
    if (state.stock.length === 0) return;
    const player = state.drawPending[0]!;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase d'annonce avant la pioche (5 cartes en main)
    if (state.canAnnounce === player) {
      if (player === 1) {
        const t = setTimeout(() => {
          setState((s) => {
            if (s.phase !== "playing" || s.canAnnounce !== 1) return s;
            const a = aiAnnounceAt(s, settings.difficulty);
            if (!a) return { ...s, canAnnounce: null };
            sfx.chuckle();
            return announce(s, 1, a.suits, a.trump);
          });
        }, 650);
        return () => clearTimeout(t);
      }
      // Joueur humain : attendre sa décision s'il a un compte annonçable
      if (availableMelds(state, 0).length > 0) return;
    }

    const center = (el: HTMLElement | null | undefined) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    };

    const t = setTimeout(() => {
      const from = center(stockRef.current);
      const to = center(player === 0 ? playerHandRef.current : opponentHandRef.current);
      if (from && to) {
        setDrawFlights([{ id: Date.now(), player, from, to, delay: 0 }]);
        sfx.draw();
      }
      // La carte rejoint la main seulement quand l'animation est terminée
      timers.push(
        setTimeout(() => {
          setDrawFlights([]);
          setState((s) => drawNext(s));
        }, 580),
      );
    }, 420);
    timers.push(t);

    return () => timers.forEach(clearTimeout);
  }, [state, settings.difficulty]);

  // Tour de l'ordinateur
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== 1 || state.trick.length >= 2) return;
    if (state.drawPending.length > 0 || state.canAnnounce === 1) return;
    if (dealing) return;
    const t = setTimeout(() => {
      setState((s) => {
        if (s.phase !== "playing" || s.turn !== 1 || s.trick.length >= 2) return s;
        if (s.drawPending.length > 0 || s.canAnnounce === 1) return s;
        const card = aiChooseCardAt(s, settings.difficulty);
        sfx.place();
        return playCard(s, 1, card.id);
      });
    }, 750);
    return () => clearTimeout(t);
  }, [state, settings.difficulty, dealing]);

  // Acclamations / rire moqueur en fin de tour
  const phaseKey = `${state.phase}-${state.roundsWon[0]}-${state.roundsWon[1]}`;
  useEffect(() => {
    if (state.phase !== "roundEnd" && state.phase !== "gameEnd") return;
    const won = state.phase === "gameEnd" ? state.champWinner === 0 : state.roundWinner === 0;
    const lost = state.phase === "gameEnd" ? state.champWinner === 1 : state.roundWinner === 1;
    const t = setTimeout(() => {
      if (won) sfx.cheer();
      else if (lost) sfx.taunt();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey]);

  // Compte à rebours du tour : dépasser le délai fait perdre le champ
  const myTurnActive =
    !dealing &&
    state.phase === "playing" &&
    state.trick.length < 2 &&
    (state.turn === 0 || meldDecisionPending) &&
    (state.drawPending.length === 0 || meldDecisionPending);
  const turnKey = `${state.turn}-${state.trick.length}-${state.drawPending.length}-${state.phase}-${String(meldDecisionPending)}`;
  const turnLeft = useTurnCountdown(myTurnActive, turnKey, TURN_LIMIT);

  useEffect(() => {
    if (!myTurnActive || turnLeft > 0) return;
    setState((s) =>
      s.phase === "playing"
        ? { ...s, phase: "gameEnd", champWinner: 1, forfeit: { loser: 0, reason: "timeout" } }
        : s,
    );
  }, [turnLeft, myTurnActive]);

  // Barre de temps de l'IA (visuelle)
  const oppTurnActive =
    state.phase === "playing" &&
    state.trick.length < 2 &&
    state.turn === 1 &&
    !meldDecisionPending &&
    state.drawPending.length === 0;

  const [confirmQuit, setConfirmQuit] = useState(false);
  const quitTable = useCallback(() => {
    setConfirmQuit(false);
    setStarted(false);
  }, []);

  const nextRound = useCallback(() => {
    setState((s) => {
      const dealer: PlayerIndex = (s.lastTrickWinner ?? s.dealer) as PlayerIndex;
      const ns = newRound(dealer, s.roundsWon);
      return ns;
    });
    setMeldHistory([]);
    setChoosingTrump(false);
    setRedealDone(false);
    setRoundKey((k) => k + 1);
  }, []);

  const restart = useCallback(() => {
    tokenAwarded.current = false;
    deal(Math.random() < 0.5 ? 0 : 1, [0, 0]);
  }, [deal]);

  // Un compte s'annonce en bloc : tous ceux que la main permet, d'un seul clic
  // — c'est toujours l'intérêt du joueur, chacun valant des points. L'atout
  // n'est à désigner que s'il est réellement ambigu : plusieurs comptes
  // annonçables alors qu'il n'est pas encore fixé. Avec un seul compte, la
  // couleur se déduit d'elle-même.
  const needsTrumpChoice = state.trump === null && myMelds.length > 1;
  const meldSummary = myMelds
    .map((m) => `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "trio" : "simple"}`)
    .join(" + ");

  // Changer de niveau en cours de partie reviendrait à finir en Légende un
  // champ commencé en Facile — et à empocher la récompense du niveau le plus
  // élevé sans l'avoir affrontée. Tout changement repart donc d'une partie
  // neuve, quel que soit l'écran par lequel il passe.
  const playedDifficulty = useRef(settings.difficulty);
  useEffect(() => {
    if (playedDifficulty.current === settings.difficulty) return;
    playedDifficulty.current = settings.difficulty;
    if (!started) return;
    restart();
  }, [settings.difficulty, started, restart]);

  const doAnnounce = (trumpChoice: Suit | null) => {
    setState((s) =>
      announce(
        s,
        0,
        availableMelds(s, 0).map((m) => m.suit),
        trumpChoice,
      ),
    );
    setChoosingTrump(false);
    sfx.chuckle();
  };

  const announceMelds = () => {
    if (needsTrumpChoice) {
      setChoosingTrump(true);
      return;
    }
    doAnnounce(state.trump === null ? (myMelds[0]?.suit ?? null) : null);
  };

  const playMyCard = (card: Card, el: HTMLElement) => {
    // Impossible de jouer tant que la proposition de compte n'est pas tranchée.
    if (meldDecisionPending) return;
    const r = el.getBoundingClientRect();
    const t = tableRef.current?.getBoundingClientRect();
    if (t) {
      setFlying({
        card,
        from: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      });
      setTimeout(() => setFlying(null), 380);
    }
    sfx.place();
    setState((s) => playCard(s, 0, card.id));
  };

  const myBonnes = state.gains[0].filter(isBonne).length;
  const myComptes = meldHistory.filter((e) => e.player === 0).reduce((sum, e) => sum + e.points, 0);
  const oppBonnes = state.gains[1].filter(isBonne).length;
  const revealOpp = state.phase !== "playing";
  if (!started) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.4em] text-gold-soft">
          Jeu traditionnel d'Afrique de l'Ouest
        </p>
        <h1 className="gold-text text-6xl sm:text-7xl">Aztèque</h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Conquérez les plis, ramassez les bonnes, annoncez vos comptes et créez l'atout. Trois
          tours gagnés — ou treize bonnes — et le champ est à vous.
        </p>
        <div className="mt-9 flex w-full max-w-xs flex-col items-center gap-4">
          <ProfileButton
            name={playerName}
            icon="player"
            align="center"
            onClick={() => setShowPlayerProfile(true)}
          />
          <button
            onClick={() => setStarted(true)}
            className="w-full rounded-full bg-[image:var(--gradient-gold)] px-8 py-3 text-center font-display text-sm font-semibold text-primary-foreground shadow-[var(--shadow-table)] transition-transform hover:scale-105"
          >
            Jouer contre l'IA
          </button>
          <Link
            to="/online"
            className="w-full rounded-full border border-gold/50 px-8 py-3 text-center font-display text-sm font-semibold text-gold transition-transform hover:scale-105"
          >
            Jouer en ligne
          </Link>
        </div>

        {/* Le cadeau attend que la table soit libre : au tout premier lancement,
            le jeu demande d'abord un nom, et deux panneaux superposés
            cacheraient l'un des deux. */}
        {showBonus && !showPlayerProfile && !showRules && (
          <DailyBonusPanel
            amount={DAILY_BONUS}
            onCollect={collectBonus}
            onClose={() => setShowBonus(false)}
          />
        )}
        {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
        {showPlayerProfile && (
          <PlayerProfilePanel
            playerName={playerName}
            tokens={tokens}
            onNameChange={setPlayerName}
            nameLocked={accountBound}
            rank={
              account && {
                rating: account.rating,
                peak: account.peak_rating,
                games: account.rated_games,
              }
            }
            settings={settings}
            onChange={setSettings}
            onRules={() => {
              setShowPlayerProfile(false);
              setShowRules(true);
            }}
            onClose={() => setShowPlayerProfile(false)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      {/* Tableau des profils */}
      <header className="panel grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:px-5">
        <ProfileButton
          name={playerName}
          icon="player"
          align="left"
          onClick={() => setShowPlayerProfile(true)}
        />
        <div className="min-w-16 text-center">
          <h1 className="gold-text text-lg leading-none sm:text-2xl">Aztèque</h1>
          <p className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground">
            {state.roundsWon[0]} <span className="text-muted-foreground">—</span>{" "}
            {state.roundsWon[1]}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[0.62rem] font-semibold text-gold">
            🪙 {TOKEN_REWARDS[settings.difficulty]} jetons à gagner
          </p>
        </div>
        <ProfileButton
          name={`IA ${DIFFICULTY_LABEL[settings.difficulty]}`}
          icon="ai"
          align="right"
          onClick={() => setShowAiProfile(true)}
        />
      </header>

      {/* Adversaire */}
      <section className="flex items-start justify-between gap-3">
        <div className="flex w-full flex-col gap-2">
          <div ref={opponentHandRef} style={{ opacity: dealing ? 0 : 1 }}>
            <HandRow
              cards={state.hands[1]}
              exposedIds={state.exposed[1]}
              faceDown={(c) => !state.exposed[1].includes(c.id)}
              interactive={false}
              keepSlots={state.stock.length > 0}
            />
          </div>
          <TurnBar total={TURN_LIMIT} active={oppTurnActive} resetKey={turnKey} />
        </div>
      </section>

      {/* Tapis */}
      <section
        ref={tableRef}
        className="panel relative flex min-h-44 max-h-[46dvh] flex-1 flex-col items-center justify-center gap-3 p-4"
      >
        <div className="absolute left-3 top-3" ref={pileRefs[1]}>
          <CapturedPile cards={state.gains[1]} owner="opponent" />
        </div>

        <div className="absolute bottom-3 right-3" ref={pileRefs[0]}>
          <CapturedPile cards={state.gains[0]} owner="player" onOpen={() => setShowMyGains(true)} />
        </div>

        {/* Aligné sur les mêmes conditions que la barre de temps, pour que
            l'annonce du tour et le compte à rebours apparaissent ensemble.
            L'espace insécable réserve la ligne pendant la pioche. */}
        {state.trick.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {state.phase !== "playing"
              ? "Tour terminé."
              : myTurnActive && !meldDecisionPending
                ? "À vous de mener."
                : oppTurnActive
                  ? "L'adversaire réfléchit…"
                  : "\u00a0"}
          </p>
        )}

        <div className="grid grid-cols-[4.5rem_3.75rem_4.5rem] items-center gap-2 sm:gap-4">
          <div ref={trickSlotRefs[1]}>
            <TrickPosition trick={state.trick} player={1} hidden={collect.length > 0} />
          </div>

          <div
            ref={stockRef}
            className="flex min-h-20 flex-col items-center justify-center gap-1"
            aria-label={
              state.stock.length > 0 ? `Pioche, ${state.stock.length} cartes` : "Pioche vide"
            }
          >
            {state.stock.length > 0 ? (
              <>
                <StockPile count={state.stock.length} />
                <span className="rounded-full border border-gold/40 bg-felt-deep/90 px-2 py-0.5 text-[0.62rem] font-semibold text-gold">
                  {state.stock.length}
                </span>
              </>
            ) : (
              <div className="flex h-14 w-10 items-center justify-center rounded-[3px] border border-dashed border-gold/30 text-[0.6rem] text-muted-foreground">
                Vide
              </div>
            )}
          </div>

          <div ref={trickSlotRefs[0]}>
            <TrickPosition trick={state.trick} player={0} hidden={collect.length > 0} />
          </div>
        </div>

        {state.trump && (
          <span className="pointer-events-none absolute right-2 top-2 z-20 rounded border border-gold/45 bg-felt-deep/90 px-2 py-1 text-[0.58rem] font-semibold text-gold shadow-[var(--shadow-card)]">
            Atout · {SUIT_SYMBOL[state.trump]} {SUIT_NAME[state.trump]}
          </span>
        )}

        {/* Main blanche */}
        {canRedeal && (
          <div className="relative z-30 w-full max-w-sm rounded-lg border border-accent/50 bg-secondary p-3 text-center shadow-[var(--shadow-card)]">
            <p className="text-xs text-accent">
              Main blanche : vous n'avez ni Roi, ni Dame, ni Valet.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => deal(state.dealer, state.roundsWon)}
                className="rounded-full bg-[image:var(--gradient-gold)] px-4 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Demander une redistribution
              </button>
              <button
                onClick={() => setRedealDone(true)}
                className="text-xs text-muted-foreground underline"
              >
                Garder ma main
              </button>
            </div>
          </div>
        )}

        {/* Annonce de comptes : un seul clic dans le cas courant. Le choix de
            l'atout n'est demandé que s'il est réellement ambigu — deux comptes
            annonçables et l'atout pas encore fixé. Avec un seul compte, ou
            l'atout déjà fixé, il n'y a rien à choisir. */}
        {meldDecisionPending && (
          <div className="absolute bottom-2 left-2 z-30 max-w-[calc(100%_-_7rem)] rounded border border-gold/35 bg-felt-deep/95 p-2 shadow-[var(--shadow-card)]">
            {choosingTrump ? (
              <>
                <p className="mb-1 text-[0.62rem] font-semibold leading-tight text-gold">
                  Quel compte fixe l'atout ?
                </p>
                <div className="flex flex-wrap gap-1">
                  {myMelds.map((m) => (
                    <button
                      key={m.suit}
                      onClick={() => doAnnounce(m.suit)}
                      className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                    >
                      {SUIT_SYMBOL[m.suit]} {SUIT_NAME[m.suit]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mb-1 text-[0.62rem] font-semibold leading-tight text-gold">
                  Annoncer {meldSummary} ?
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={announceMelds}
                    className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                  >
                    Annoncer
                  </button>
                  <button
                    onClick={() => {
                      setChoosingTrump(false);
                      // Clôturer la fenêtre d'annonce : la pioche se déroule ensuite.
                      setState((s) => (s.canAnnounce === 0 ? { ...s, canAnnounce: null } : s));
                    }}
                    className="rounded border border-border px-2 py-1 text-[0.6rem] leading-none text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    Passer
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {state.stock.length === 0 && state.phase === "playing" && (
          <p className="text-[0.7rem] uppercase tracking-widest text-accent">
            Pioche épuisée — fournir, battre, protéger ses bonnes
          </p>
        )}
      </section>

      {/* Votre main */}
      <section className="flex flex-col gap-2">
        <TurnBar total={TURN_LIMIT} active={myTurnActive} resetKey={turnKey} />
        {/* Pendant la donne, la main garde sa place — ses cases servent de
            cibles aux cartes qui arrivent — mais reste invisible : on ne
            distribue pas des cartes déjà posées. */}
        <div ref={playerHandRef} style={{ opacity: dealing ? 0 : 1 }}>
          <HandRow
            cards={state.hands[0]}
            exposedIds={state.exposed[0]}
            keepSlots={state.stock.length > 0}
            isDisabled={(c) =>
              meldDecisionPending ||
              state.turn !== 0 ||
              state.phase !== "playing" ||
              state.trick.length >= 2 ||
              state.drawPending.length > 0 ||
              !legalIds.has(c.id)
            }
            onPlay={playMyCard}
          />
        </div>

        {/* Informations du joueur */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setShowMyBonnes(true)}
            className="rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold transition-colors hover:bg-gold/10"
          >
            Bonnes · {myBonnes}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold transition-colors hover:bg-gold/10"
          >
            Comptes · {myComptes}
          </button>
          <button
            type="button"
            onClick={() => setConfirmQuit(true)}
            className="rounded-full border border-destructive/50 bg-felt-deep/95 px-3 py-1 text-[0.68rem] font-semibold text-destructive transition-colors hover:bg-destructive/10"
          >
            Quitter la table
          </button>
        </div>
      </section>

      {/* Carte en vol vers le tapis */}
      {flying && (
        <FlyingCard
          card={flying.card}
          from={flying.from}
          to={(() => {
            const r = tableRef.current?.getBoundingClientRect();
            return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : flying.from;
          })()}
        />
      )}

      {/* Cartes piochées, vainqueur du pli en premier */}
      {drawFlights.map((flight) => (
        <DrawCard key={flight.id} {...flight} />
      ))}

      {/* Ramassage du pli vers les tas */}
      {collect.map((flight) => (
        <CollectCard key={flight.id} {...flight} />
      ))}

      {/* Atout 10 : transfert du tas adverse */}
      {sweepFlights.map((flight) => (
        <SweepCard key={flight.id} {...flight} />
      ))}

      {(state.phase === "roundEnd" || state.phase === "gameEnd") &&
        (state.roundScore || state.forfeit) && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
            <div className="panel w-full max-w-md p-6 text-center">
              <h2 className="gold-text text-3xl">
                {state.phase === "gameEnd"
                  ? state.champWinner === 0
                    ? "Champ remporté !"
                    : "Champ perdu"
                  : state.roundWinner === null
                    ? "Pont !"
                    : state.roundWinner === 0
                      ? "Tour gagné"
                      : "Tour perdu"}
              </h2>
              {state.instantWin && (
                <p className="mt-1 text-xs text-accent">Treize bonnes ou plus en un tour.</p>
              )}
              {state.phase === "gameEnd" && state.champWinner === 0 && (
                <p className="mt-2 text-sm font-semibold text-gold">
                  🪙 +{TOKEN_REWARDS[settings.difficulty]} jetons remportés !
                </p>
              )}
              {state.pont && state.phase === "roundEnd" && (
                <p className="mt-1 text-xs text-accent">
                  Égalité parfaite : aucun tour marqué, on rejoue le tour.
                </p>
              )}
              {state.forfeit?.reason === "timeout" && (
                <p className="mt-2 text-xs text-destructive">
                  Temps écoulé : vous n'avez pas joué dans le délai imparti.
                </p>
              )}
              {state.roundScore && (
                <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
                  <Recap title="Vous" s={state.roundScore[0]} />
                  <Recap title="Adversaire" s={state.roundScore[1]} />
                </div>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Tours gagnés — Vous {state.roundsWon[0]} · Adversaire {state.roundsWon[1]}
              </p>
              <button
                onClick={state.phase === "gameEnd" ? restart : nextRound}
                className="mt-5 rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
              >
                {state.phase === "gameEnd"
                  ? "Nouvelle partie"
                  : state.pont
                    ? "Rejouer le tour"
                    : "Tour suivant"}
              </button>
              <button
                onClick={quitTable}
                className="mt-3 block w-full rounded-full border border-destructive/50 px-6 py-2.5 font-display text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                Quitter
              </button>
            </div>
          </div>
        )}

      {confirmQuit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-sm p-6 text-center">
            <h2 className="gold-text text-2xl">Quitter la table ?</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              La partie en cours sera abandonnée.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmQuit(false)}
                className="rounded-full border border-border px-5 py-2 text-sm text-muted-foreground"
              >
                Rester
              </button>
              <button
                type="button"
                onClick={quitTable}
                className="rounded-full bg-destructive-solid px-5 py-2 text-sm font-semibold text-destructive-foreground"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {dealing && (
        <DealCeremony stockRef={stockRef} myHandRef={playerHandRef} oppHandRef={opponentHandRef} />
      )}
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showPlayerProfile && (
        <PlayerProfilePanel
          playerName={playerName}
          tokens={tokens}
          onNameChange={setPlayerName}
          nameLocked={accountBound}
          rank={
            account && {
              rating: account.rating,
              peak: account.peak_rating,
              games: account.rated_games,
            }
          }
          settings={settings}
          onChange={setSettings}
          onRules={() => {
            setShowPlayerProfile(false);
            setShowRules(true);
          }}
          onClose={() => setShowPlayerProfile(false)}
        />
      )}
      {showAiProfile && (
        <AiProfilePanel
          difficulty={settings.difficulty}
          onChange={(difficulty) => setSettings((current) => ({ ...current, difficulty }))}
          onClose={() => setShowAiProfile(false)}
        />
      )}
      {showMyGains && <GainsPanel cards={state.gains[0]} onClose={() => setShowMyGains(false)} />}
      {showMyBonnes && (
        <GainsPanel
          cards={state.gains[0].filter(isBonne)}
          title="Vos bonnes"
          subtitle={`${myBonnes} bonnes remportées — treize bonnes gagnent le tour`}
          onClose={() => setShowMyBonnes(false)}
        />
      )}
      {showHistory && (
        <MeldHistoryPanel entries={meldHistory} onClose={() => setShowHistory(false)} />
      )}
    </main>
  );
}

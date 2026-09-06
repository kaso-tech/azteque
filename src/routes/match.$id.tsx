import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SUIT_NAME,
  SUIT_SYMBOL,
  availableMelds,
  isBonne,
  legalCards,
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
import { CollectCard, DrawCard, FlyingCard, SweepCard } from "@/components/azteque/animations";
import { sfx } from "@/lib/azteque/sfx";
import { MatchChat } from "@/components/azteque/MatchChat";
import { BetPanel } from "@/components/azteque/BetPanel";
import { Recap } from "@/components/azteque/panels";
import {
  ensureOnlineIdentity,
  getMatch,
  subscribeMatch,
  trackPresence,
  type MatchRow,
  type NextRoundReady,
} from "@/lib/azteque/online";
import { applyMatchAction, type MatchAction } from "@/lib/azteque/match-actions";
import { useTurnCountdown } from "@/hooks/useTurnTimer";
import { useBetNegotiation } from "@/hooks/useBetNegotiation";

export const Route = createFileRoute("/match/$id")({
  validateSearch: (search: Record<string, unknown>): { seat?: "host" | "guest" } =>
    search["seat"] === "guest" ? { seat: "guest" } : { seat: "host" },
  head: () => ({
    meta: [
      { title: "Table en ligne — Aztèque à deux joueurs" },
      {
        name: "description",
        content:
          "Table Aztèque synchronisée en temps réel : posez vos cartes, annoncez vos comptes et remportez le champ face à un ami.",
      },
      { property: "og:title", content: "Table en ligne — Aztèque" },
      {
        property: "og:description",
        content: "Partie Aztèque à deux joueurs, synchronisée en temps réel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnlineTable,
});

const TRICK_DELAY = 1000;
/** Temps maximum pour jouer son coup (secondes). */
const TURN_LIMIT = 30;
/** Temps toléré avant de déclarer un joueur déconnecté perdant (secondes). */
const DISCONNECT_LIMIT = 30;

function OnlineTable() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { seat } = Route.useSearch();
  const [verifiedSeat, setVerifiedSeat] = useState<"host" | "guest" | null>(null);
  const me: PlayerIndex = verifiedSeat === "guest" ? 1 : 0;
  const opp: PlayerIndex = me === 0 ? 1 : 0;
  const isHost = me === 0;

  const [row, setRow] = useState<MatchRow | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosingTrump, setChoosingTrump] = useState(false);
  const [showMyGains, setShowMyGains] = useState(false);
  const [showMyBonnes, setShowMyBonnes] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);

  // --- Animations de déplacement des cartes -----------------------------
  // Le serveur reste seul maître du résultat (voir match-actions.ts) : ces
  // refs et cet état ne servent qu'à faire VOYAGER les cartes à l'écran
  // entre les positions déjà affichées, jamais à décider quoi que ce soit.
  const tableRef = useRef<HTMLDivElement | null>(null);
  const stockRef = useRef<HTMLDivElement | null>(null);
  // Indexées par PlayerIndex (0|1), comme les tableaux de `state` lui-même.
  // Mémorisées : les refs elles-mêmes sont déjà stables (useRef), seul le
  // tableau qui les regroupe ne doit pas changer d'identité à chaque rendu.
  const handRef0 = useRef<HTMLDivElement | null>(null);
  const handRef1 = useRef<HTMLDivElement | null>(null);
  const handRefs = useMemo(() => [handRef0, handRef1] as const, []);
  const trickSlotRef0 = useRef<HTMLDivElement | null>(null);
  const trickSlotRef1 = useRef<HTMLDivElement | null>(null);
  const trickSlotRefs = useMemo(() => [trickSlotRef0, trickSlotRef1] as const, []);
  const pileRef0 = useRef<HTMLDivElement | null>(null);
  const pileRef1 = useRef<HTMLDivElement | null>(null);
  const pileRefs = useMemo(() => [pileRef0, pileRef1] as const, []);

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
  // Pendant la résolution d'un pli (ramassage puis éventuel transfert « atout
  // 10 »), le serveur a déjà avancé l'état bien avant que l'animation locale
  // n'ait fini de jouer (l'aller-retour réseau est plus rapide que le vol des
  // cartes). On fige donc l'AFFICHAGE du pli et des tas sur leur valeur d'avant
  // résolution le temps de l'animation, pendant que `state` — la vérité —
  // continue d'avancer normalement en arrière-plan.
  const [frozenTable, setFrozenTable] = useState<{
    trick: GameState["trick"];
    gains: [Card[], Card[]];
  } | null>(null);
  // Empêche la pioche et l'annonce de compte de s'afficher avant la fin de
  // cette même animation.
  const [animating, setAnimating] = useState(false);

  const center = (el: HTMLElement | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  const applyRow = useCallback((next: MatchRow) => {
    setRow(next);
    setState((next.state as GameState | null) ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    ensureOnlineIdentity()
      .then(async (user) => {
        const match = await getMatch(id);
        if (!match) return { match: null, userId: user.id };
        return { match, userId: user.id };
      })
      .then(({ match: r, userId }) => {
        if (!alive) return;
        if (!r) {
          setError("Cette partie n'existe plus.");
          return;
        }
        if (r.host_id === userId) setVerifiedSeat("host");
        else if (r.guest_id === userId) setVerifiedSeat("guest");
        else {
          setError("Vous ne participez pas à cette partie.");
          return;
        }
        applyRow(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Chargement impossible."));
    const unsub = subscribeMatch(id, applyRow);
    return () => {
      alive = false;
      unsub();
    };
  }, [id, applyRow, seat]);

  // Envoie une action au serveur, qui la rejoue et la valide avant de
  // l'appliquer — le client ne calcule plus lui-même le résultat.
  // `silent` couvre les actions déclenchées automatiquement (résolution de
  // pli, pioche) où un rejet est une course normale, pas une erreur à
  // afficher (l'autre joueur a déjà résolu l'action entre-temps).
  const runAction = useCallback(
    async (action: MatchAction, opts: { silent?: boolean } = {}) => {
      try {
        const result = await applyMatchAction({ data: { matchId: id, action } });
        setState(result.state);
        setRow((r) => (r ? { ...r, settings: result.settings } : r));
      } catch (e) {
        if (!opts.silent) setError(e instanceof Error ? e.message : "Action impossible.");
      }
    },
    [id],
  );

  /* ---------- Mise de jetons ---------- */
  const { bet, betReady, balance, proposeBet, acceptBet } = useBetNegotiation({
    row,
    state,
    me,
    runAction,
  });

  // L'hôte distribue la PREMIÈRE donne dès que la mise du champ est acceptée :
  // cet accord vaut lancement de la partie. Les tours suivants ne s'enchaînent
  // qu'une fois que les deux joueurs ont demandé à rejouer (`ready_next_round`).
  useEffect(() => {
    if (!isHost || !row?.guest_name || !betReady || state) return;
    void runAction({ type: "new_round" }, { silent: true });
  }, [isHost, row?.guest_name, state, betReady, runAction]);

  // Accord d'enchaînement du tour suivant, remis à zéro à chaque donne.
  const nextReady = ((row?.settings as Record<string, unknown> | undefined)?.["nextRound"] ??
    null) as NextRoundReady | null;
  const iAmReady = !!nextReady?.[isHost ? "host" : "guest"];
  const oppIsReady = !!nextReady?.[isHost ? "guest" : "host"];

  // Détecte la carte que l'ADVERSAIRE vient de jouer (celle du joueur local
  // est animée directement au clic, voir playMyCard) pour la faire voyager de
  // sa main vers le tapis, qu'elle arrive par la réponse de notre propre appel
  // serveur ou par la souscription temps réel (les deux mettent `state` à jour
  // de la même façon).
  const prevTrickRef = useRef<GameState["trick"]>([]);
  const sawStateRef = useRef(false);
  useEffect(() => {
    if (!state) {
      prevTrickRef.current = [];
      sawStateRef.current = false;
      return;
    }
    const already = prevTrickRef.current.some((entry) => entry.player === opp);
    const oppEntry = state.trick.find((entry) => entry.player === opp);
    if (oppEntry && !already && sawStateRef.current) {
      const from = center(handRefs[opp].current);
      if (from) {
        setFlying({ card: oppEntry.card, from });
        setTimeout(() => setFlying(null), 380);
      }
      sfx.place();
    }
    prevTrickRef.current = state.trick;
    sawStateRef.current = true;
  }, [state, opp, handRefs]);

  // L'hôte arbitre : résolution du pli puis pioches.
  // Repli : si l'hôte ne répond pas, l'invité tranche pour ne pas bloquer la table.
  // Les deux appels sont validés par le serveur : si l'un des deux arrive
  // après coup (l'autre a déjà résolu), il est simplement rejeté (silencieux).
  //
  // Le résultat qui compte est toujours celui renvoyé par le serveur — voir
  // match-actions.ts. Mais l'aller-retour réseau est presque toujours plus
  // rapide que le temps de vol des cartes à l'écran : sans précaution, `state`
  // afficherait déjà le pli vide et les tas mis à jour avant même que
  // l'animation n'ait commencé à bouger quoi que ce soit. On calcule donc ICI,
  // sur les mêmes fonctions pures que celles rejouées côté serveur, le
  // résultat probable (vainqueur, transfert « atout 10 ») à seule fin
  // d'afficher le bon mouvement ; l'affichage reste figé sur l'état d'avant
  // résolution (`frozenTable`) le temps que l'animation joue, pendant que
  // `state` continue d'avancer normalement en arrière-plan.
  useEffect(() => {
    if (!state || state.phase !== "playing" || state.trick.length < 2) return;
    if (animating) return;
    const hadBonne = state.trick.some((entry) => isBonne(entry.card));
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(
        () => {
          void runAction({ type: "resolve_trick" }, { silent: true });

          const preTrick = state;
          const predicted = resolveTrick(preTrick, { atout10: true });
          const winner = predicted.lastTrickWinner;
          if (winner === null) return;
          const loser: PlayerIndex = winner === 0 ? 1 : 0;
          const first = preTrick.trick[0]!;
          const second = preTrick.trick[1]!;
          const fromFirst = center(trickSlotRefs[first.player].current);
          const fromSecond = center(trickSlotRefs[second.player].current);
          const winnerPile = center(pileRefs[winner].current);
          if (!fromFirst || !fromSecond || !winnerPile) return;

          setAnimating(true);
          setFrozenTable({ trick: preTrick.trick, gains: preTrick.gains });

          const lastDelay = 140;
          setCollect([
            { id: 1, card: first.card, from: fromFirst, to: winnerPile, delay: 0 },
            { id: 2, card: second.card, from: fromSecond, to: winnerPile, delay: lastDelay },
          ]);
          timers.push(setTimeout(() => sfx.collect(), lastDelay + 120));
          if (hadBonne) timers.push(setTimeout(() => sfx.snicker(), lastDelay + 240));

          const sweeps = trickCapturesPile(preTrick, { atout10: true })
            ? preTrick.gains[loser].length
            : 0;
          const loserPile = center(pileRefs[loser].current);

          timers.push(
            setTimeout(() => {
              setCollect([]);
              if (sweeps > 0 && loserPile) {
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
                      setFrozenTable(null);
                      setAnimating(false);
                    },
                    layers * 90 + 620,
                  ),
                );
                return;
              }
              setFrozenTable(null);
              setAnimating(false);
            }, lastDelay + 560),
          );
        },
        isHost ? TRICK_DELAY : TRICK_DELAY + 4000,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [isHost, state, animating, runAction, pileRefs, trickSlotRefs]);

  useEffect(() => {
    if (animating) return;
    if (!state || state.phase !== "playing") return;
    if (state.drawPending.length === 0 || state.stock.length === 0) return;
    const player = state.drawPending[0]!;
    // Le vainqueur peut annoncer avant de piocher (5 cartes en main)
    if (state.canAnnounce === player && availableMelds(state, player).length > 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(
        () => {
          const from = center(stockRef.current);
          const to = center(handRefs[player].current);
          if (from && to) {
            setDrawFlights([{ id: Date.now(), player, from, to, delay: 0 }]);
            timers.push(
              setTimeout(() => {
                setDrawFlights([]);
                void runAction({ type: "draw_next" }, { silent: true }).then(() => sfx.draw());
              }, 580),
            );
            return;
          }
          void runAction({ type: "draw_next" }, { silent: true }).then(() => sfx.draw());
        },
        isHost ? 700 : 4700,
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [isHost, state, animating, runAction, handRefs, stockRef]);

  // Acclamations / rire moqueur en fin de tour
  const phaseKey = state ? `${state.phase}-${state.roundsWon[0]}-${state.roundsWon[1]}` : "";
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "roundEnd" && state.phase !== "gameEnd") return;
    const won = state.phase === "gameEnd" ? state.champWinner === me : state.roundWinner === me;
    const lost = state.phase === "gameEnd" ? state.champWinner === opp : state.roundWinner === opp;
    const t = setTimeout(() => {
      if (won) sfx.cheer();
      else if (lost) sfx.taunt();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, me, opp]);

  // Rire léger lorsque l'adversaire annonce un compte
  const oppMeldCount = state ? state.melds[opp].length : 0;
  const prevOppMelds = useRef(0);
  useEffect(() => {
    if (oppMeldCount > prevOppMelds.current) sfx.chuckle();
    prevOppMelds.current = oppMeldCount;
  }, [oppMeldCount]);

  // --- Chronomètre du tour et surveillance de la connexion ---
  // "quit" se déclare contre soi-même ; "timeout"/"disconnect" contre
  // l'adversaire observé — le serveur en déduit le perdant et vérifie le
  // délai avant d'accepter (voir match-actions.ts).
  const declareForfeit = useCallback(
    (reason: "timeout" | "disconnect" | "quit") => {
      void runAction({ type: "forfeit", reason }, { silent: reason !== "quit" });
    },
    [runAction],
  );

  // Le compte à rebours redémarre à chaque changement de tour
  const oppMustAct =
    !!state &&
    state.phase === "playing" &&
    state.turn === opp &&
    state.trick.length < 2 &&
    state.drawPending.length === 0;
  const turnKey = state
    ? `${state.turn}-${state.trick.length}-${state.drawPending.length}-${state.phase}-${String(oppMustAct)}`
    : "";
  const turnLeft = useTurnCountdown(oppMustAct, turnKey, TURN_LIMIT);

  // Barre de temps du joueur local
  const myMustAct =
    !!state &&
    state.phase === "playing" &&
    state.turn === me &&
    state.trick.length < 2 &&
    state.drawPending.length === 0;

  // Seul l'observateur déclare : si l'adversaire dépasse le délai, il perd
  useEffect(() => {
    if (!state || state.phase !== "playing" || !oppMustAct) return;
    if (turnLeft > 0) return;
    declareForfeit("timeout");
  }, [turnLeft, state, opp, oppMustAct, declareForfeit]);

  const [oppOnline, setOppOnline] = useState(true);
  const [offlineLeft, setOfflineLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!verifiedSeat) return;
    return trackPresence(id, verifiedSeat, setOppOnline);
  }, [id, verifiedSeat]);

  useEffect(() => {
    if (oppOnline || !state || state.phase !== "playing") {
      setOfflineLeft(null);
      return;
    }
    const start = Date.now();
    setOfflineLeft(DISCONNECT_LIMIT);
    const t = setInterval(() => {
      const left = Math.max(0, DISCONNECT_LIMIT - Math.round((Date.now() - start) / 1000));
      setOfflineLeft(left);
      if (left === 0) declareForfeit("disconnect");
    }, 1000);
    return () => clearInterval(t);
  }, [oppOnline, state, opp, declareForfeit]);

  const myMelds = useMemo(() => (state ? availableMelds(state, me) : []), [state, me]);
  const legalIds = useMemo(() => {
    if (!state) return new Set<string>();
    const ok =
      state.turn === me &&
      state.phase === "playing" &&
      state.trick.length < 2 &&
      state.drawPending.length === 0;
    return new Set(ok ? legalCards(state, me).map((c) => c.id) : []);
  }, [state, me]);

  const meldDecisionPending =
    !!state &&
    !animating &&
    state.phase === "playing" &&
    state.canAnnounce === me &&
    state.drawPending[0] === me &&
    state.hands[me].length === 5 &&
    myMelds.length > 0 &&
    state.stock.length > 0;

  // Affichage figé du pli et des tas pendant le ramassage/transfert animé
  // (voir la déclaration de `frozenTable` plus haut) : le reste de l'état
  // (mains, tour, pioche…) continue de refléter la vérité serveur normalement.
  const displayTrick = frozenTable?.trick ?? state?.trick ?? [];
  const displayGains = frozenTable?.gains ?? state?.gains ?? ([[], []] as [Card[], Card[]]);

  const playMyCard = (card: Card, el: HTMLElement) => {
    if (!state || meldDecisionPending) return;
    const from = center(el);
    if (from) {
      setFlying({ card, from });
      setTimeout(() => setFlying(null), 380);
    }
    sfx.place();
    void runAction({ type: "play_card", cardId: card.id });
  };

  // Un compte s'annonce en bloc : tous ceux que la main permet, d'un seul clic
  // — c'est toujours l'intérêt du joueur, chacun valant des points. L'atout
  // n'est à désigner que s'il est réellement ambigu : plusieurs comptes
  // annonçables alors qu'il n'est pas encore fixé.
  const needsTrumpChoice = !!state && state.trump === null && myMelds.length > 1;
  const meldSummary = myMelds
    .map((m) => `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "trio" : "simple"}`)
    .join(" + ");

  const doAnnounce = (trumpChoice: Suit | null) => {
    if (!state) return;
    sfx.chuckle();
    void runAction({
      type: "announce",
      suits: myMelds.map((m) => m.suit),
      trump: trumpChoice,
    });
    setChoosingTrump(false);
  };

  const announceMelds = () => {
    if (!state) return;
    if (needsTrumpChoice) {
      setChoosingTrump(true);
      return;
    }
    doAnnounce(state.trump === null ? (myMelds[0]?.suit ?? null) : null);
  };

  const skipAnnounce = () => {
    setChoosingTrump(false);
    void runAction({ type: "skip_announce" });
  };

  const readyNextRound = () => {
    void runAction({ type: "ready_next_round" });
  };

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Link to="/online" className="text-xs text-gold underline">
          Retour au salon
        </Link>
      </main>
    );
  }

  if (!row || !state || !verifiedSeat) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="gold-text text-3xl">Table en préparation…</h1>
        <p className="text-sm text-muted-foreground">
          {!row?.guest_name
            ? "En attente du second joueur."
            : betReady
              ? "Distribution des cartes en cours."
              : "Accordez-vous sur la mise pour lancer le tour."}
        </p>
        <Link to="/online" className="text-xs text-gold underline">
          Retour au salon
        </Link>
        {row?.guest_name && verifiedSeat && !betReady && (
          <BetPanel
            bet={bet}
            mySeat={verifiedSeat}
            oppName={me === 0 ? (row.guest_name ?? "Invité") : row.host_name}
            balance={balance}
            onPropose={proposeBet}
            onAccept={acceptBet}
            onQuit={() => navigate({ to: "/online" })}
          />
        )}
      </main>
    );
  }

  const myName = me === 0 ? row.host_name : (row.guest_name ?? "Invité");
  const oppName = me === 0 ? (row.guest_name ?? "Invité") : row.host_name;
  const myBonnes = displayGains[me].filter(isBonne).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      <header className="panel grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 sm:px-5">
        <p className="truncate text-left text-xs font-semibold text-foreground">{myName}</p>
        <div className="min-w-16 text-center">
          <h1 className="gold-text text-lg leading-none sm:text-2xl">Aztèque</h1>
          <p className="mt-1 whitespace-nowrap text-xs font-semibold text-foreground">
            {state.roundsWon[me]} <span className="text-muted-foreground">—</span>{" "}
            {state.roundsWon[opp]}
          </p>
          <p className="mt-0.5 text-[0.6rem] uppercase tracking-widest text-gold">
            Code {row.code}
          </p>
          {bet?.status === "accepted" && (
            <p className="mt-0.5 whitespace-nowrap text-[0.6rem] font-semibold text-gold">
              🪙 {bet.amount}
            </p>
          )}
        </div>
        <p className="truncate text-right text-xs font-semibold text-foreground">{oppName}</p>
      </header>

      {/* Main adverse */}
      <section>
        <div ref={handRefs[opp]}>
          <HandRow
            cards={state.hands[opp]}
            exposedIds={state.exposed[opp]}
            faceDown={(c) => !state.exposed[opp].includes(c.id)}
            interactive={false}
            keepSlots={state.stock.length > 0}
          />
        </div>
        <TurnBar total={TURN_LIMIT} active={oppMustAct} resetKey={turnKey} />
      </section>

      {/* Tapis */}
      <section
        ref={tableRef}
        className="panel relative flex min-h-44 max-h-[46dvh] flex-1 flex-col items-center justify-center gap-3 p-4"
      >
        <div className="absolute left-3 top-3" ref={pileRefs[opp]}>
          <CapturedPile cards={displayGains[opp]} owner="opponent" />
        </div>
        <div className="absolute bottom-3 right-3" ref={pileRefs[me]}>
          <CapturedPile
            cards={displayGains[me]}
            owner="player"
            onOpen={() => setShowMyGains(true)}
          />
        </div>

        {/* Aligné sur les mêmes conditions que la barre de temps, pour que
            l'annonce du tour et le compte à rebours apparaissent ensemble. */}
        {state.trick.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {state.phase !== "playing"
              ? "Tour terminé."
              : myMustAct
                ? "À vous de jouer."
                : oppMustAct
                  ? `${oppName} réfléchit…`
                  : "\u00a0"}
          </p>
        )}

        <div className="grid grid-cols-[4.5rem_3.75rem_4.5rem] items-center gap-2 sm:gap-4">
          <div ref={trickSlotRefs[opp]}>
            <TrickPosition trick={displayTrick} player={opp} me={me} hidden={collect.length > 0} />
          </div>
          <div className="flex min-h-20 flex-col items-center justify-center gap-1" ref={stockRef}>
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
          <div ref={trickSlotRefs[me]}>
            <TrickPosition trick={displayTrick} player={me} me={me} hidden={collect.length > 0} />
          </div>
        </div>

        {offlineLeft !== null && (
          <span className="absolute left-1/2 top-8 -translate-x-1/2 rounded-full border border-destructive/60 bg-felt-deep/95 px-2 py-0.5 text-[0.58rem] font-semibold text-destructive">
            {oppName} est hors ligne · {offlineLeft}s
          </span>
        )}

        {state.trump && (
          <span className="absolute right-2 top-2 rounded border border-gold/45 bg-felt-deep/90 px-2 py-1 text-[0.58rem] font-semibold text-gold">
            Atout · {SUIT_SYMBOL[state.trump]} {SUIT_NAME[state.trump]}
          </span>
        )}

        {/* Annonce de comptes : un seul clic dans le cas courant, le choix de
            l'atout n'étant demandé que lorsqu'il est réellement ambigu. */}
        {meldDecisionPending && (
          <div className="absolute bottom-2 left-2 z-30 max-w-[calc(100%_-_7rem)] rounded border border-gold/35 bg-felt-deep/95 p-2">
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
                    onClick={skipAnnounce}
                    className="rounded border border-border px-2 py-1 text-[0.6rem] leading-none text-muted-foreground"
                  >
                    Passer
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* Votre main */}
      <section className="flex flex-col gap-2">
        <TurnBar total={TURN_LIMIT} active={myMustAct} resetKey={turnKey} />
        <div ref={handRefs[me]}>
          <HandRow
            cards={state.hands[me]}
            exposedIds={state.exposed[me]}
            keepSlots={state.stock.length > 0}
            isDisabled={(c) =>
              meldDecisionPending ||
              animating ||
              state.turn !== me ||
              state.phase !== "playing" ||
              state.trick.length >= 2 ||
              state.drawPending.length > 0 ||
              !legalIds.has(c.id)
            }
            onPlay={(card, el) => playMyCard(card, el)}
          />
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setShowMyBonnes(true)}
            className="rounded-full border border-gold/40 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-gold"
          >
            Bonnes · {myBonnes}
          </button>
          {state.phase !== "gameEnd" && (
            <button
              type="button"
              onClick={() => setConfirmQuit(true)}
              className="rounded-full border border-destructive/50 bg-felt-deep/60 px-3 py-1 text-[0.68rem] font-semibold text-destructive"
            >
              Quitter la table
            </button>
          )}
        </div>
      </section>

      {(state.phase === "roundEnd" || state.phase === "gameEnd") && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-md p-6 text-center">
            <h2 className="gold-text text-3xl">
              {state.phase === "gameEnd"
                ? state.champWinner === me
                  ? "Champ remporté !"
                  : "Champ perdu"
                : state.roundWinner === null
                  ? "Pont !"
                  : state.roundWinner === me
                    ? "Tour gagné"
                    : "Tour perdu"}
            </h2>
            {state.forfeit && (
              <p className="mt-2 text-xs text-gold">
                {state.forfeit.loser === me
                  ? state.forfeit.reason === "timeout"
                    ? "Temps écoulé : vous avez tardé à jouer."
                    : state.forfeit.reason === "quit"
                      ? "Vous avez quitté la table."
                      : "Connexion perdue trop longtemps de votre côté."
                  : state.forfeit.reason === "timeout"
                    ? `${oppName} a dépassé le temps de jeu.`
                    : state.forfeit.reason === "quit"
                      ? `${oppName} a quitté la table.`
                      : `${oppName} a perdu la connexion.`}
              </p>
            )}
            {state.pont && state.phase === "roundEnd" && (
              <p className="mt-1 text-xs text-accent">
                Égalité parfaite : aucun tour marqué, on rejoue le tour.
              </p>
            )}
            {state.roundScore && (
              <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
                <Recap title={myName} s={state.roundScore[me]} />
                <Recap title={oppName} s={state.roundScore[opp]} />
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Tours gagnés — {myName} {state.roundsWon[me]} · {oppName} {state.roundsWon[opp]}
            </p>
            {bet?.status === "accepted" && (
              <p className="mt-1 text-xs text-gold">
                {state.phase === "gameEnd"
                  ? state.champWinner === me
                    ? `🪙 +${bet.amount} jetons remportés`
                    : `🪙 −${bet.amount} jetons perdus`
                  : `Mise du champ : 🪙 ${bet.amount} jetons — réglée à la fin de la partie.`}
              </p>
            )}
            {state.phase === "roundEnd" ? (
              iAmReady ? (
                <p className="mt-5 text-xs text-muted-foreground">
                  En attente de {oppName} pour {state.pont ? "rejouer le tour" : "le tour suivant"}…
                </p>
              ) : (
                <>
                  {oppIsReady && (
                    <p className="mt-5 text-xs text-gold">
                      {oppName} est prêt à {state.pont ? "rejouer le tour" : "enchaîner"}.
                    </p>
                  )}
                  <button
                    onClick={readyNextRound}
                    className={
                      "rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground " +
                      (oppIsReady ? "mt-3" : "mt-5")
                    }
                  >
                    {state.pont ? "Rejouer le tour" : "Jouer le tour suivant"}
                  </button>
                </>
              )
            ) : (
              <Link
                to="/online"
                className="mt-5 inline-block rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
              >
                Retour au salon
              </Link>
            )}
            {/* En fin de tour le champ n'est pas joué : partir revient à
                abandonner, on passe donc par la confirmation qui déclare le
                forfait. En fin de champ il n'y a plus rien à abandonner. */}
            {state.phase === "roundEnd" ? (
              <button
                type="button"
                onClick={() => setConfirmQuit(true)}
                className="mt-3 block w-full rounded-full border border-destructive/50 px-6 py-2.5 font-display text-sm font-semibold text-destructive"
              >
                Quitter
              </button>
            ) : (
              <Link
                to="/online"
                className="mt-3 block w-full rounded-full border border-destructive/50 px-6 py-2.5 font-display text-sm font-semibold text-destructive"
              >
                Quitter
              </Link>
            )}
          </div>
        </div>
      )}

      {confirmQuit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-sm p-6 text-center">
            <h2 className="gold-text text-2xl">Quitter la table ?</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              Si la partie est en cours, quitter la table vous déclare perdant du champ.
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
                onClick={() => {
                  setConfirmQuit(false);
                  declareForfeit("quit");
                  navigate({ to: "/online" });
                }}
                className="rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground"
              >
                Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {showMyGains && <GainsPanel cards={state.gains[me]} onClose={() => setShowMyGains(false)} />}
      {showMyBonnes && (
        <GainsPanel
          cards={state.gains[me].filter(isBonne)}
          title="Vos bonnes"
          subtitle={`${myBonnes} bonnes remportées — treize bonnes gagnent le tour`}
          onClose={() => setShowMyBonnes(false)}
        />
      )}

      {/* Carte en vol vers le tapis (la mienne au clic, celle de l'adversaire
          détectée dès qu'elle apparaît dans le pli) */}
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

      {/* Cartes piochées */}
      {drawFlights.map((flight) => (
        <DrawCard key={flight.id} {...flight} />
      ))}

      {/* Ramassage du pli vers le tas du vainqueur */}
      {collect.map((flight) => (
        <CollectCard key={flight.id} {...flight} />
      ))}

      {/* Atout 10 : transfert du tas adverse */}
      {sweepFlights.map((flight) => (
        <SweepCard key={flight.id} {...flight} />
      ))}

      <MatchChat matchId={id} seat={verifiedSeat} myName={myName} />
    </main>
  );
}

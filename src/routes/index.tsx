import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIFFICULTY_LABEL,
  SUIT_NAME,
  SUIT_SYMBOL,
  aiAnnounce,
  aiChooseCardAt,
  aiWantsRedeal,
  announce,
  availableMelds,
  hasMainBlanche,
  isBonne,
  legalCards,
  newRound,
  playCard,
  resolveTrick,
  scoreOf,
  type Card,
  type Difficulty,
  type GameState,
  type PlayerIndex,
  type Suit,
} from "@/lib/azteque/engine";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { RulesPanel } from "@/components/azteque/RulesPanel";
import { cn } from "@/lib/utils";
import { sfx, setSoundEnabled } from "@/lib/azteque/sfx";

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
        content:
          "Conquérez les plis, annoncez vos comptes, créez l'atout et remportez le champ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Azteque,
});

interface Settings {
  trickDelay: number; // ms
  difficulty: Difficulty;
  sound: boolean;
}

const DEFAULT_SETTINGS: Settings = { trickDelay: 1000, difficulty: "normal", sound: true };

function Azteque() {
  const [state, setState] = useState<GameState>(() => newRound(1));
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMyGains, setShowMyGains] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [meldPick, setMeldPick] = useState<Suit[]>([]);
  const [started, setStarted] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [redealDone, setRedealDone] = useState(false);
  const [flying, setFlying] = useState<
    { card: Card; from: { x: number; y: number } } | null
  >(null);
  const [collect, setCollect] = useState<
    { id: number; card: Card; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }[]
  >([]);
  const [drawFlights, setDrawFlights] = useState<
    { id: number; player: PlayerIndex; from: { x: number; y: number }; to: { x: number; y: number }; delay: number }[]
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


  // Réglages persistants
  useEffect(() => {
    try {
      const raw = localStorage.getItem("azteque-settings");
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
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
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  useEffect(() => {
    if (state.phase !== "playing" || state.gains[0].length === 0) setShowMyGains(false);
  }, [state.phase, state.gains]);

  const myMelds = useMemo(() => availableMelds(state, 0), [state]);
  const legal = useMemo(
    () =>
      state.turn === 0 && state.phase === "playing" && state.trick.length < 2
        ? legalCards(state, 0)
        : [],
    [state],
  );
  const legalIds = useMemo(() => new Set(legal.map((c) => c.id)), [legal]);

  const freshRound =
    state.phase === "playing" &&
    state.trick.length === 0 &&
    state.gains[0].length === 0 &&
    state.gains[1].length === 0 &&
    state.melds[0].length === 0 &&
    state.melds[1].length === 0;

  const canRedeal = freshRound && !redealDone && hasMainBlanche(state, 0);

  const deal = useCallback((dealer: PlayerIndex, won: [number, number]) => {
    setState(newRound(dealer, won));
    setMeldPick([]);
    setRedealDone(false);
    setRoundKey((k) => k + 1);
  }, []);

  // Main blanche de l'ordinateur
  useEffect(() => {
    if (!started || !freshRound || aiRedealChecked.current === roundKey) return;
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
  }, [started, freshRound, roundKey, state, settings.difficulty]);

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
        const next = resolveTrick(state);
        const winner = next.lastTrickWinner;
        const first = state.trick[0]!;
        const second = state.trick[1]!;
        const fromFirst = center(trickSlotRefs[first.player].current);
        const fromSecond = center(trickSlotRefs[second.player].current);
        const pileFirst = center(pileRefs[first.player].current);
        const pileSecond = center(pileRefs[second.player].current);

        const flights: typeof collect = [];
        let lastDelay = 0;
        // 1. La carte du premier joueur rejoint son propre tas.
        if (fromFirst && pileFirst)
          flights.push({ id: 1, card: first.card, from: fromFirst, to: pileFirst, delay: 0 });

        if (winner === first.player) {
          // 2. La carte plus faible du second rejoint le tas du premier.
          if (fromSecond && pileFirst)
            flights.push({ id: 2, card: second.card, from: fromSecond, to: pileFirst, delay: 380 });
          lastDelay = 380;
        } else {
          // 2. Le second bat : sa carte va sur son tas…
          if (fromSecond && pileSecond)
            flights.push({ id: 2, card: second.card, from: fromSecond, to: pileSecond, delay: 380 });
          // 3. …et la carte du premier quitte son tas pour le rejoindre.
          if (pileFirst && pileSecond)
            flights.push({ id: 3, card: first.card, from: pileFirst, to: pileSecond, delay: 780 });
          lastDelay = 780;
        }

        if (winner === second.player) sfx.beat();
        else sfx.collect();
        setCollect(flights);
        timers.push(setTimeout(() => sfx.collect(), lastDelay + 120));

        timers.push(
          setTimeout(() => {
            const stockRect = stockRef.current?.getBoundingClientRect();
            const targets = [playerHandRef.current, opponentHandRef.current] as const;

            if (stockRect && state.stock.length > next.stock.length && winner !== null) {
              const loser: PlayerIndex = winner === 0 ? 1 : 0;
              const order: PlayerIndex[] = state.stock.length > 1 ? [winner, loser] : [winner];
              const from = {
                x: stockRect.left + stockRect.width / 2,
                y: stockRect.top + stockRect.height / 2,
              };
              const draws = order.flatMap((player, index) => {
                const to = center(targets[player]);
                if (!to) return [];
                return [{ id: Date.now() + index, player, from, to, delay: 260 + index * 320 }];
              });
              setDrawFlights(draws);
              draws.forEach((d) =>
                timers.push(setTimeout(() => sfx.draw(), d.delay)),
              );
              timers.push(setTimeout(() => setDrawFlights([]), 1600));
            }

            setCollect([]);
            setState(next);
          }, lastDelay + 520),
        );
      }, settings.trickDelay),
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, settings.trickDelay]);


  // Tour de l'ordinateur
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== 1 || state.trick.length >= 2) return;
    const t = setTimeout(() => {
      setState((s) => {
        if (s.phase !== "playing" || s.turn !== 1 || s.trick.length >= 2) return s;
        let next = s;
        if (next.canAnnounce === 1) {
          const a = aiAnnounce(next);
          if (a) next = announce(next, 1, a.suits, a.trump);
        }
        const card = aiChooseCardAt(next, settings.difficulty);
        sfx.place();
        return playCard(next, 1, card.id);
      });
    }, 750);
    return () => clearTimeout(t);
  }, [state, settings.difficulty]);

  const nextRound = useCallback(() => {
    setState((s) => {
      const dealer: PlayerIndex = (s.lastTrickWinner ?? s.dealer) as PlayerIndex;
      const ns = newRound(dealer, s.roundsWon);
      return ns;
    });
    setMeldPick([]);
    setRedealDone(false);
    setRoundKey((k) => k + 1);
  }, []);

  const restart = useCallback(() => {
    deal(Math.random() < 0.5 ? 0 : 1, [0, 0]);
  }, [deal]);

  const doAnnounce = (trumpChoice: Suit | null) => {
    setState((s) => announce(s, 0, meldPick, trumpChoice));
    setMeldPick([]);
  };

  const playMyCard = (card: Card, el: HTMLElement) => {
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
  const oppBonnes = state.gains[1].filter(isBonne).length;
  const revealOpp = state.phase !== "playing";
  const live0 = scoreOf(state, 0, state.lastTrickWinner);
  const live1 = scoreOf(state, 1, state.lastTrickWinner);

  if (!started) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.4em] text-gold-soft">
          Jeu traditionnel d'Afrique de l'Ouest
        </p>
        <h1 className="gold-text text-6xl sm:text-7xl">Aztèque</h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Conquérez les plis, ramassez les bonnes, annoncez vos comptes et créez l'atout.
          Trois tours gagnés — ou treize bonnes — et le champ est à vous.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => setStarted(true)}
            className="rounded-full bg-[image:var(--gradient-gold)] px-8 py-3 font-display text-sm font-semibold text-primary-foreground shadow-[var(--shadow-table)] transition-transform hover:scale-105"
          >
            Commencer une partie
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full border border-gold/40 px-8 py-3 font-display text-sm text-foreground transition-colors hover:bg-secondary"
          >
            Paramètres
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="rounded-full border border-gold/40 px-8 py-3 font-display text-sm text-foreground transition-colors hover:bg-secondary"
          >
            Lire le règlement
          </button>
        </div>
        {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
        {showSettings && (
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
      {/* En-tête */}
      <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="gold-text text-2xl leading-none">Aztèque</h1>
          <p className="text-[0.7rem] text-muted-foreground">
            Tours gagnés — Vous {state.roundsWon[0]} · Adversaire {state.roundsWon[1]} ·{" "}
            {DIFFICULTY_LABEL[settings.difficulty]}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Chip label="Pioche" value={String(state.stock.length)} />
          <Chip
            label="Atout"
            value={
              state.trump ? `${SUIT_SYMBOL[state.trump]} ${SUIT_NAME[state.trump]}` : "—"
            }
            highlight={!!state.trump}
          />
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full border border-gold/40 px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          >
            Paramètres
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="rounded-full border border-gold/40 px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          >
            Règles
          </button>
        </div>
      </header>

      {/* Adversaire */}
      <section className="flex items-start justify-between gap-3">
        <div className="flex w-full flex-col gap-2">
          <ScoreBox
            title="Adversaire"
            bonnes={revealOpp ? oppBonnes : null}
            comptes={live1.comptes}
            melds={state.melds[1].map(
              (m) =>
                `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`,
            )}
          />
          <div ref={opponentHandRef}>
            <HandRow
              cards={state.hands[1]}
              exposedIds={state.exposed[1]}
              faceDown={(c) => !state.exposed[1].includes(c.id)}
              interactive={false}
              keepSlots={state.stock.length > 0}
            />
          </div>
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
          <CapturedPile
            cards={state.gains[0]}
            owner="player"
            onOpen={() => setShowMyGains(true)}
          />
        </div>

        {state.trick.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {state.phase === "playing"
              ? state.turn === 0
                ? "À vous de mener."
                : "L'adversaire réfléchit…"
              : "Tour terminé."}
          </p>
        )}

        <div className="grid grid-cols-[4.5rem_3.75rem_4.5rem] items-center gap-2 sm:gap-4">
          <div ref={trickSlotRefs[1]}>
            <TrickPosition trick={state.trick} player={1} hidden={collect.length > 0} />
          </div>


          <div
            ref={stockRef}
            className="flex min-h-20 flex-col items-center justify-center gap-1"
            aria-label={state.stock.length > 0 ? `Pioche, ${state.stock.length} cartes` : "Pioche vide"}
          >
            {state.stock.length > 0 ? (
              <>
                <StockPile count={state.stock.length} />
                <span className="rounded-full border border-gold/40 bg-felt-deep px-2 py-0.5 text-[0.65rem] font-semibold text-gold">
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

        {state.trick.length === 2 && collect.length === 0 && (
          <p className="text-[0.7rem] uppercase tracking-widest text-gold-soft">
            Comparaison des cartes…
          </p>
        )}

        {/* Main blanche */}
        {canRedeal && (
          <div className="w-full max-w-lg rounded-lg border border-accent/50 bg-secondary/60 p-3 text-center">
            <p className="text-xs text-accent">
              Main blanche : vous n'avez ni Roi, ni Dame, ni Valet.
            </p>
            <div className="mt-2 flex justify-center gap-2">
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

        {/* Annonce de comptes */}
        {state.phase === "playing" && myMelds.length > 0 && (
          <div className="w-full max-w-lg rounded-lg border border-gold/30 bg-secondary/60 p-3">
            <p className="mb-2 text-xs text-gold">
              Vous pouvez annoncer un ou plusieurs comptes (facultatif) :
            </p>
            <div className="flex flex-wrap gap-2">
              {myMelds.map((m) => {
                const on = meldPick.includes(m.suit);
                return (
                  <button
                    key={m.suit}
                    onClick={() =>
                      setMeldPick((p) =>
                        on ? p.filter((s) => s !== m.suit) : [...p, m.suit],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      on
                        ? "border-gold bg-gold/20 text-gold"
                        : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {SUIT_SYMBOL[m.suit]} {SUIT_NAME[m.suit]} — {m.type}
                  </button>
                );
              })}
            </div>
            {meldPick.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {state.trump === null ? (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Choisissez l'atout :
                    </span>
                    {meldPick.map((s) => (
                      <button
                        key={s}
                        onClick={() => doAnnounce(s)}
                        className="rounded-full bg-[image:var(--gradient-gold)] px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        Atout {SUIT_SYMBOL[s]} {SUIT_NAME[s]}
                      </button>
                    ))}
                  </>
                ) : (
                  <button
                    onClick={() => doAnnounce(null)}
                    className="rounded-full bg-[image:var(--gradient-gold)] px-4 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Annoncer
                  </button>
                )}
                <button
                  onClick={() => setMeldPick([])}
                  className="text-xs text-muted-foreground underline"
                >
                  Ne pas compter
                </button>
              </div>
            )}
          </div>
        )}

        {state.stock.length === 0 && state.phase === "playing" && (
          <p className="text-[0.7rem] uppercase tracking-widest text-accent">
            Phase finale — fournir, battre, protéger ses bonnes
          </p>
        )}
      </section>

      {/* Votre main */}
      <section className="flex flex-col gap-3">
        <div ref={playerHandRef}>
          <HandRow
            cards={state.hands[0]}
            exposedIds={state.exposed[0]}
            keepSlots={state.stock.length > 0}
            isDisabled={(c) =>
              state.turn !== 0 ||
              state.phase !== "playing" ||
              state.trick.length >= 2 ||
              !legalIds.has(c.id)
            }
            onPlay={playMyCard}
          />
        </div>
        <ScoreBox
          title="Vous"
          bonnes={myBonnes}
          comptes={live0.comptes}
          melds={state.melds[0].map(
            (m) =>
              `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`,
          )}
        />
      </section>


      {/* Carte en vol vers le tapis */}
      {flying && (
        <FlyingCard
          card={flying.card}
          from={flying.from}
          to={(() => {
            const r = tableRef.current?.getBoundingClientRect();
            return r
              ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
              : flying.from;
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


      {(state.phase === "roundEnd" || state.phase === "gameEnd") && state.roundScore && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <div className="panel w-full max-w-md p-6 text-center">
            <h2 className="gold-text text-3xl">
              {state.phase === "gameEnd"
                ? state.champWinner === 0
                  ? "Champ remporté !"
                  : "Champ perdu"
                : state.roundWinner === null
                  ? "Tour nul"
                  : state.roundWinner === 0
                    ? "Tour gagné"
                    : "Tour perdu"}
            </h2>
            {state.instantWin && (
              <p className="mt-1 text-xs text-accent">Treize bonnes ou plus en un tour.</p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
              <Recap title="Vous" s={state.roundScore[0]} />
              <Recap title="Adversaire" s={state.roundScore[1]} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Tours gagnés — Vous {state.roundsWon[0]} · Adversaire {state.roundsWon[1]}
            </p>
            <button
              onClick={state.phase === "gameEnd" ? restart : nextRound}
              className="mt-5 rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
            >
              {state.phase === "gameEnd" ? "Nouvelle partie" : "Tour suivant"}
            </button>
          </div>
        </div>
      )}

      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showMyGains && (
        <GainsPanel cards={state.gains[0]} onClose={() => setShowMyGains(false)} />
      )}
    </main>
  );
}

function TrickPosition({
  trick,
  player,
  hidden,
}: {
  trick: GameState["trick"];
  player: PlayerIndex;
  hidden?: boolean;
}) {
  const played = trick.find((entry) => entry.player === player);
  if (!played) return <div className="h-28 w-[4.5rem]" aria-hidden="true" />;
  const led = trick[0]?.card.id === played.card.id;

  return (
    <div className="flex w-[4.5rem] flex-col items-center gap-1">
      <span className={cn("block w-full", hidden && "invisible")}>
        <PlayingCard card={played.card} size="lg" className="animate-trick" />
      </span>
      <span className={cn("text-[0.65rem] text-muted-foreground", hidden && "opacity-0")}>
        {player === 0 ? "Vous" : "Adversaire"}
        {led ? " (mène)" : ""}
      </span>
    </div>
  );
}

function CollectCard({
  card,
  from,
  to,
  delay,
}: {
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}) {
  const [departed, setDeparted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDeparted(true), delay + 20);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="pointer-events-none fixed z-50 w-[4.5rem] drop-shadow-[0_12px_18px_rgba(0,0,0,0.45)]"
      aria-hidden="true"
      style={{
        left: departed ? to.x : from.x,
        top: departed ? to.y : from.y,
        transform: `translate(-50%, -50%) scale(${departed ? 0.555 : 1}) rotate(${departed ? 4 : 0}deg)`,
        opacity: 1,
        transition:
          "left 0.4s cubic-bezier(.3,.9,.3,1), top 0.4s cubic-bezier(.3,.9,.3,1), transform 0.4s cubic-bezier(.3,.9,.3,1)",
      }}
    >
      <PlayingCard card={card} size="hand" />
    </div>
  );
}


function CapturedPile({
  cards,
  owner,
  onOpen,
}: {
  cards: Card[];
  owner: "player" | "opponent";
  onOpen?: () => void;
}) {
  const visibleLayers = Math.min(4, Math.max(1, Math.ceil(cards.length / 6)));
  const isPlayer = owner === "player";
  const label = isPlayer ? "Vos cartes sorties" : "Cartes sorties adverses";
  const pile = (
    <>
      <span className="text-[0.58rem] font-semibold text-muted-foreground">{label}</span>
      <span className="relative block h-14 w-12" aria-hidden="true">
        {cards.length > 0 ? (
          Array.from({ length: visibleLayers }, (_, index) => {
            const offset = (visibleLayers - index - 1) * 2;
            return (
              <span
                key={`${visibleLayers}-${index}`}
                className="absolute left-0 top-1 block w-10"
                style={{ transform: `translate(${offset}px, ${-offset}px)` }}
              >
                <PlayingCard faceDown size="sm" />
              </span>
            );
          })
        ) : (
          <span className="absolute left-0 top-1 block h-14 w-10 rounded-[3px] border border-dashed border-gold/25" />
        )}
      </span>
      {isPlayer && cards.length > 0 && (
        <span className="text-[0.58rem] text-gold">Voir · {cards.length}</span>
      )}
    </>
  );

  if (isPlayer) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={cards.length === 0}
        className="flex w-24 flex-col items-center gap-0.5 disabled:cursor-default"
        aria-label={cards.length > 0 ? `Consulter vos ${cards.length} cartes sorties` : "Aucune carte sortie"}
      >
        {pile}
      </button>
    );
  }

  return (
    <div className="flex w-24 cursor-not-allowed flex-col items-center gap-0.5" aria-label="Tas adverse non consultable">
      {pile}
    </div>
  );
}

function GainsPanel({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="panel max-h-[85dvh] w-full max-w-lg overflow-y-auto p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="gold-text text-2xl">Vos cartes sorties</h2>
            <p className="text-xs text-muted-foreground">{cards.length} cartes remportées</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 text-lg text-gold"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {cards.map((card) => (
            <PlayingCard key={card.id} card={card} size="hand" />
          ))}
        </div>
      </div>
    </div>
  );
}

function HandRow({
  cards,
  exposedIds,
  isDisabled,
  onPlay,
  interactive = true,
  faceDown,
  keepSlots = false,
}: {
  cards: Card[];
  exposedIds: string[];
  isDisabled?: (c: Card) => boolean;
  onPlay?: (c: Card, el: HTMLElement) => void;
  interactive?: boolean;
  faceDown?: (c: Card) => boolean;
  keepSlots?: boolean;
}) {
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragId = useRef<string | null>(null);
  const startX = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    setSlots((prev) => {
      const ids = cards.map((c) => c.id);
      let next = prev.map((id) => (id && ids.includes(id) ? id : null));
      if (!keepSlots) next = next.filter((id): id is string => id !== null);
      for (const id of ids) {
        if (next.includes(id)) continue;
        const empty = next.indexOf(null);
        if (empty >= 0) next[empty] = id;
        else next.push(id);
      }
      return next;
    });
  }, [cards, keepSlots]);

  const ordered = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c] as const));
    return slots.map((id) => (id ? (byId.get(id) ?? null) : null));
  }, [cards, slots]);

  const handlePointerDown = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    dragId.current = id;
    startX.current = e.clientX;
    moved.current = false;
  };


  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const id = dragId.current;
    if (!id) return;
    if (Math.abs(e.clientX - startX.current) > 10) moved.current = true;
    if (!moved.current) return;
    const row = rowRef.current;
    if (!row) return;
    const children = Array.from(row.children) as HTMLElement[];
    const target = children.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
    if (target < 0) return;
    setSlots((prev) => {
      const from = prev.indexOf(id);
      if (from < 0 || from === target || prev[target] === null) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(target, 0, id);
      return next;
    });
  };

  const handlePointerUp = () => {
    dragId.current = null;
    setTimeout(() => {
      moved.current = false;
    }, 0);
  };

  const seen = useRef<Set<string>>(new Set());
  const [arriving, setArriving] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh = cards.map((c) => c.id).filter((id) => !seen.current.has(id));
    cards.forEach((c) => seen.current.add(c.id));
    if (fresh.length === 0) return;
    setArriving(new Set(fresh));
    const t = setTimeout(() => setArriving(new Set()), 600);
    return () => clearTimeout(t);
  }, [cards]);

  return (
    <div
      ref={rowRef}
      className="flex w-full touch-none items-end justify-center gap-1 sm:gap-2"
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerUp : undefined}
      onPointerLeave={interactive ? handlePointerUp : undefined}

    >
      {ordered.map((c, i) =>
        c === null ? (
          <div
            key={`empty-${i}`}
            className="min-w-0 max-w-[4.5rem] flex-1"
            aria-hidden="true"
          >
            <div className="animate-slot-wait aspect-[5/7] w-full rounded-[3px] border border-dashed border-gold/30" />
          </div>
        ) : (
          <div
            key={c.id}
            onPointerDown={interactive ? handlePointerDown(c.id) : undefined}
            className="min-w-0 max-w-[4.5rem] flex-1 transition-transform duration-300"
          >
            <PlayingCard
              card={c}
              size="hand"
              className={arriving.has(c.id) ? "animate-slot-fill" : "animate-deal"}
              faceDown={faceDown ? faceDown(c) : false}
              exposed={exposedIds.includes(c.id)}
              disabled={isDisabled ? isDisabled(c) : false}
              {...(interactive && onPlay
                ? {
                    onClick: (el: HTMLElement) => {
                      if (moved.current) return;
                      onPlay(c, el);
                    },
                  }
                : {})}
            />
          </div>
        ),
      )}
    </div>
  );
}


function StockPile({ count }: { count: number }) {
  const visibleLayers = Math.min(5, Math.max(1, Math.ceil(count / 8)));

  return (
    <div className="relative h-16 w-12" aria-hidden="true">
      {Array.from({ length: visibleLayers }, (_, index) => {
        const offset = (visibleLayers - index - 1) * 2;
        return (
          <div
            key={`${visibleLayers}-${index}`}
            className="absolute left-0 top-0 w-10 transition-transform duration-300"
            style={{ transform: `translate(${offset}px, ${-offset}px)` }}
          >
            <PlayingCard faceDown size="sm" />
          </div>
        );
      })}
    </div>
  );
}

function FlyingCard({
  card,
  from,
  to,
}: {
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  const [pos, setPos] = useState(from);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPos(to));
    return () => cancelAnimationFrame(id);
  }, [to.x, to.y]);
  const done = pos !== from;
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: pos.x,
        top: pos.y,
        transform: `translate(-50%, -50%) scale(${done ? 0.9 : 1})`,
        opacity: done ? 0 : 1,
        transition: "left 0.35s ease-out, top 0.35s ease-out, opacity 0.35s ease-out, transform 0.35s ease-out",
      }}
    >
      <PlayingCard card={card} size="lg" />
    </div>
  );
}

function DrawCard({
  from,
  to,
  delay,
  player,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  player: PlayerIndex;
}) {
  const [departed, setDeparted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDeparted(true), delay + 20);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className="pointer-events-none fixed z-50 w-10"
      aria-hidden="true"
      style={{
        left: departed ? to.x : from.x,
        top: departed ? to.y : from.y,
        transform: `translate(-50%, -50%) scale(${departed ? 0.82 : 1}) rotate(${player === 0 ? 5 : -5}deg)`,
        opacity: departed ? 0 : 1,
        transition: `left 0.48s cubic-bezier(.22,.8,.3,1) ${delay}ms, top 0.48s cubic-bezier(.22,.8,.3,1) ${delay}ms, opacity 0.16s ease ${delay + 380}ms, transform 0.48s ease ${delay}ms`,
      }}
    >
      <PlayingCard faceDown size="sm" />
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const levels: Difficulty[] = ["facile", "normal", "expert"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
      <div className="panel w-full max-w-md p-6 text-left">
        <h2 className="gold-text text-2xl">Paramètres</h2>

        <p className="mt-5 text-sm text-foreground">Niveau de l'adversaire</p>
        <div className="mt-2 flex gap-2">
          {levels.map((l) => (
            <button
              key={l}
              onClick={() => onChange({ ...settings, difficulty: l })}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs transition-colors",
                settings.difficulty === l
                  ? "border-gold bg-gold/20 text-gold"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {DIFFICULTY_LABEL[l]}
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm text-foreground">Effets sonores</p>
        <div className="mt-2 flex gap-2">
          {[true, false].map((on) => (
            <button
              key={String(on)}
              onClick={() => onChange({ ...settings, sound: on })}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs transition-colors",
                settings.sound === on
                  ? "border-gold bg-gold/20 text-gold"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {on ? "Activés" : "Coupés"}
            </button>
          ))}
        </div>

        <p className="mt-6 text-sm text-foreground">
          Temps d'affichage du pli : {(settings.trickDelay / 1000).toFixed(1)} s
        </p>
        <input
          type="range"
          min={300}
          max={4000}
          step={100}
          value={settings.trickDelay}
          onChange={(e) =>
            onChange({ ...settings, trickDelay: Number(e.target.value) })
          }
          className="mt-2 w-full accent-[var(--gold)]"
        />
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Les deux cartes restent visibles au milieu pendant ce temps avant que le pli
          soit tranché.
        </p>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

function Chip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1.5",
        highlight ? "border-gold/60 text-gold" : "border-border text-muted-foreground",
      )}
    >
      {label} · {value}
    </span>
  );
}

function ScoreBox({
  title,
  bonnes,
  comptes,
  melds,
}: {
  title: string;
  bonnes: number | null;
  comptes: number;
  melds: string[];
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs">
      <span className="font-display text-sm text-gold">{title}</span>
      <span className="text-muted-foreground">Bonnes · {bonnes ?? "?"}</span>
      <span className="text-muted-foreground">Comptes · {comptes}</span>
      {melds.length > 0 && (
        <span className="text-[0.65rem] text-muted-foreground">{melds.join(" | ")}</span>
      )}
    </div>
  );
}

function Recap({
  title,
  s,
}: {
  title: string;
  s: { bonnes: number; comptes: number; main: number; total: number };
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-display text-sm text-gold">{title}</p>
      <p className="text-muted-foreground">Bonnes : {s.bonnes}</p>
      <p className="text-muted-foreground">Comptes : {s.comptes}</p>
      <p className="text-muted-foreground">Main : {s.main}</p>
      <p className="mt-1 font-semibold text-foreground">Total : {s.total}</p>
    </div>
  );
}

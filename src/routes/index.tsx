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
}

const DEFAULT_SETTINGS: Settings = { trickDelay: 1000, difficulty: "normal" };

function Azteque() {
  const [state, setState] = useState<GameState>(() => newRound(1));
  const [showRules, setShowRules] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [meldPick, setMeldPick] = useState<Suit[]>([]);
  const [started, setStarted] = useState(false);
  const [roundKey, setRoundKey] = useState(0);
  const [redealDone, setRedealDone] = useState(false);
  const [flying, setFlying] = useState<
    { card: Card; from: { x: number; y: number } } | null
  >(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
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

  // Résolution du pli après un délai réglable
  useEffect(() => {
    if (state.phase !== "playing" || state.trick.length < 2) return;
    const t = setTimeout(
      () => setState((s) => (s.trick.length === 2 ? resolveTrick(s) : s)),
      settings.trickDelay,
    );
    return () => clearTimeout(t);
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
      <section className="flex items-center justify-between gap-3">
        <ScoreBox
          title="Adversaire"
          bonnes={revealOpp ? oppBonnes : null}
          comptes={live1.comptes}
          melds={state.melds[1].map(
            (m) =>
              `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`,
          )}
        />
        <div className="flex -space-x-4">
          {state.hands[1].map((c) => (
            <PlayingCard
              key={c.id}
              card={c}
              size="sm"
              faceDown={!state.exposed[1].includes(c.id)}
              exposed={state.exposed[1].includes(c.id)}
            />
          ))}
        </div>
      </section>

      {/* Tapis */}
      <section
        ref={tableRef}
        className="panel relative flex min-h-44 max-h-[46dvh] flex-1 flex-col items-center justify-center gap-3 p-4"
      >
        <div className="flex items-center gap-4">
          {state.trick.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {state.phase === "playing"
                ? state.turn === 0
                  ? "À vous de mener."
                  : "L'adversaire réfléchit…"
                : "Tour terminé."}
            </p>
          ) : (
            state.trick.map((t, i) => (
              <div key={t.card.id} className="flex flex-col items-center gap-1">
                <PlayingCard card={t.card} size="lg" className="animate-trick" />
                <span className="text-[0.65rem] text-muted-foreground">
                  {t.player === 0 ? "Vous" : "Adversaire"}
                  {i === 0 ? " (mène)" : ""}
                </span>
              </div>
            ))
          )}
        </div>

        {state.trick.length === 2 && (
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
        {state.phase === "playing" && state.canAnnounce === 0 && myMelds.length > 0 && (
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
        <div className="flex items-end justify-center gap-1 pt-4 sm:gap-2">
          {state.hands[0].map((c) => (
            <PlayingCard
              key={c.id}
              card={c}
              size="lg"
              className="animate-deal"
              exposed={state.exposed[0].includes(c.id)}
              disabled={
                state.turn !== 0 ||
                state.phase !== "playing" ||
                state.trick.length >= 2 ||
                !legalIds.has(c.id)
              }
              onClick={(el) => playMyCard(c, el)}
            />
          ))}
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

      {/* Journal */}
      <section className="panel max-h-28 overflow-y-auto p-3 text-xs text-muted-foreground">
        {state.log.slice(0, 12).map((l, i) => (
          <p key={i} className={i === 0 ? "text-foreground" : undefined}>
            {l}
          </p>
        ))}
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
    </main>
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

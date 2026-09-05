import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SUIT_NAME,
  SUIT_SYMBOL,
  aiAnnounce,
  aiChooseCard,
  announce,
  availableMelds,
  isBonne,
  legalCards,
  newRound,
  playCard,
  scoreOf,
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

function Azteque() {
  const [state, setState] = useState<GameState>(() => newRound(1));
  const [showRules, setShowRules] = useState(false);
  const [meldPick, setMeldPick] = useState<Suit[]>([]);
  const [started, setStarted] = useState(false);

  const myMelds = useMemo(() => availableMelds(state, 0), [state]);
  const legal = useMemo(
    () => (state.turn === 0 && state.phase === "playing" ? legalCards(state, 0) : []),
    [state],
  );
  const legalIds = useMemo(() => new Set(legal.map((c) => c.id)), [legal]);

  // Tour de l'ordinateur
  useEffect(() => {
    if (state.phase !== "playing" || state.turn !== 1) return;
    const t = setTimeout(() => {
      setState((s) => {
        if (s.phase !== "playing" || s.turn !== 1) return s;
        let next = s;
        if (next.canAnnounce === 1) {
          const a = aiAnnounce(next);
          if (a) next = announce(next, 1, a.suits, a.trump);
        }
        const card = aiChooseCard(next);
        return playCard(next, 1, card.id);
      });
    }, 750);
    return () => clearTimeout(t);
  }, [state]);

  const nextRound = useCallback(() => {
    setState((s) => {
      const dealer: PlayerIndex = (s.lastTrickWinner ?? s.dealer) as PlayerIndex;
      return newRound(dealer, s.roundsWon);
    });
    setMeldPick([]);
  }, []);

  const restart = useCallback(() => {
    setState(newRound(Math.random() < 0.5 ? 0 : 1));
    setMeldPick([]);
  }, []);

  const doAnnounce = (trumpChoice: Suit | null) => {
    setState((s) => announce(s, 0, meldPick, trumpChoice));
    setMeldPick([]);
  };

  const myBonnes = state.gains[0].filter(isBonne).length;
  const oppBonnes = state.gains[1].filter(isBonne).length;
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
            onClick={() => setShowRules(true)}
            className="rounded-full border border-gold/40 px-8 py-3 font-display text-sm text-foreground transition-colors hover:bg-secondary"
          >
            Lire le règlement
          </button>
        </div>
        {showRules && <RulesPanel onClose={() => setShowRules(false)} />}
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
            Tours gagnés — Vous {state.roundsWon[0]} · Adversaire {state.roundsWon[1]}
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
          bonnes={oppBonnes}
          comptes={live1.comptes}
          melds={state.melds[1].map((m) => `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`)}
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
      <section className="panel relative flex min-h-44 flex-1 flex-col items-center justify-center gap-3 p-4">
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
              disabled={state.turn !== 0 || state.phase !== "playing" || !legalIds.has(c.id)}
              onClick={() => setState((s) => playCard(s, 0, c.id))}
            />
          ))}
        </div>
        <ScoreBox
          title="Vous"
          bonnes={myBonnes}
          comptes={live0.comptes}
          melds={state.melds[0].map((m) => `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`)}
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
    </main>
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
  bonnes: number;
  comptes: number;
  melds: string[];
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs">
      <span className="font-display text-sm text-gold">{title}</span>
      <span className="text-muted-foreground">Bonnes · {bonnes}</span>
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

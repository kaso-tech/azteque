import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SUIT_NAME,
  SUIT_SYMBOL,
  announce,
  availableMelds,
  drawNext,
  isBonne,
  legalCards,
  newRound,
  playCard,
  resolveTrick,
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
} from "@/components/azteque/table";
import { sfx } from "@/lib/azteque/sfx";
import { MatchChat } from "@/components/azteque/MatchChat";
import {
  ensureOnlineIdentity,
  getMatch,
  pushMatchState,
  subscribeMatch,
  trackPresence,
  type MatchRow,
} from "@/lib/azteque/online";


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
  const { seat } = Route.useSearch();
  const [verifiedSeat, setVerifiedSeat] = useState<"host" | "guest" | null>(null);
  const me: PlayerIndex = verifiedSeat === "guest" ? 1 : 0;
  const opp: PlayerIndex = me === 0 ? 1 : 0;
  const isHost = me === 0;

  const [row, setRow] = useState<MatchRow | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meldPick, setMeldPick] = useState<Suit[]>([]);
  const [showMyGains, setShowMyGains] = useState(false);
  const [showMyBonnes, setShowMyBonnes] = useState(false);

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

  // Publication d'un nouvel état (optimiste + synchronisation)
  const publish = useCallback(
    (next: GameState) => {
      setState(next);
      void pushMatchState(id, next, next.phase === "gameEnd" ? "finished" : "playing").catch(
        (e) => setError(e instanceof Error ? e.message : "Synchronisation impossible."),
      );
    },
    [id],
  );

  // L'hôte distribue la première donne dès que l'invité est là
  useEffect(() => {
    if (!isHost || !row?.guest_name || state) return;
    publish(newRound(1));
  }, [isHost, row?.guest_name, state, publish]);

  // L'hôte arbitre : résolution du pli puis pioches
  useEffect(() => {
    if (!isHost || !state || state.phase !== "playing" || state.trick.length < 2) return;
    const t = setTimeout(() => {
      publish(resolveTrick(state, { atout10: true }));
      sfx.collect();
    }, TRICK_DELAY);
    return () => clearTimeout(t);
  }, [isHost, state, publish]);

  useEffect(() => {
    if (!isHost || !state || state.phase !== "playing") return;
    if (state.drawPending.length === 0 || state.stock.length === 0) return;
    const player = state.drawPending[0]!;
    // Le vainqueur peut annoncer avant de piocher (5 cartes en main)
    if (state.canAnnounce === player && availableMelds(state, player).length > 0) return;
    const t = setTimeout(() => {
      publish(drawNext(state));
      sfx.draw();
    }, 700);
    return () => clearTimeout(t);
  }, [isHost, state, publish]);

  // Acclamations / rire moqueur en fin de tour
  const phaseKey = state ? `${state.phase}-${state.roundsWon[0]}-${state.roundsWon[1]}` : "";
  useEffect(() => {
    if (!state) return;
    if (state.phase !== "roundEnd" && state.phase !== "gameEnd") return;
    const won =
      state.phase === "gameEnd" ? state.champWinner === me : state.roundWinner === me;
    const lost =
      state.phase === "gameEnd" ? state.champWinner === opp : state.roundWinner === opp;
    const t = setTimeout(() => {
      if (won) sfx.cheer();
      else if (lost) sfx.taunt();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey, me, opp]);

  // --- Chronomètre du tour et surveillance de la connexion ---
  const declareForfeit = useCallback(
    (loser: PlayerIndex, reason: "timeout" | "disconnect") => {
      if (!state || state.phase === "gameEnd") return;
      publish({
        ...state,
        phase: "gameEnd",
        champWinner: (loser === 0 ? 1 : 0) as PlayerIndex,
        forfeit: { loser, reason },
      });
    },
    [state, publish],
  );

  // Le compte à rebours redémarre à chaque changement de tour
  const turnKey = state
    ? `${state.turn}-${state.trick.length}-${state.drawPending.length}-${state.phase}`
    : "";
  const [turnLeft, setTurnLeft] = useState(TURN_LIMIT);
  useEffect(() => {
    if (!state || state.phase !== "playing") {
      setTurnLeft(TURN_LIMIT);
      return;
    }
    const start = Date.now();
    setTurnLeft(TURN_LIMIT);
    const t = setInterval(() => {
      setTurnLeft(Math.max(0, TURN_LIMIT - Math.round((Date.now() - start) / 1000)));
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // Seul l'observateur déclare : si l'adversaire dépasse le délai, il perd
  useEffect(() => {
    if (!state || state.phase !== "playing") return;
    if (turnLeft > 0) return;
    if (state.turn !== opp || state.drawPending.length > 0) return;
    declareForfeit(opp, "timeout");
  }, [turnLeft, state, opp, declareForfeit]);

  const [oppOnline, setOppOnline] = useState(true);
  const [offlineLeft, setOfflineLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!verifiedSeat) return;
    return trackPresence(id, verifiedSeat, setOppOnline);
  }, [id, verifiedSeat]);

  useEffect(() => {
    if (oppOnline || !state || state.phase === "gameEnd") {
      setOfflineLeft(null);
      return;
    }
    const start = Date.now();
    setOfflineLeft(DISCONNECT_LIMIT);
    const t = setInterval(() => {
      const left = Math.max(0, DISCONNECT_LIMIT - Math.round((Date.now() - start) / 1000));
      setOfflineLeft(left);
      if (left === 0) declareForfeit(opp, "disconnect");
    }, 1000);
    return () => clearInterval(t);
  }, [oppOnline, state, opp, declareForfeit]);




  const myMelds = useMemo(
    () => (state ? availableMelds(state, me) : []),
    [state, me],
  );
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
    state.phase === "playing" &&
    state.canAnnounce === me &&
    state.drawPending[0] === me &&
    state.hands[me].length === 5 &&
    myMelds.length > 0 &&
    state.stock.length > 0;

  const playMyCard = (card: Card) => {
    if (!state || meldDecisionPending) return;
    sfx.place();
    publish(playCard(state, me, card.id));
  };

  const doAnnounce = (trumpChoice: Suit | null) => {
    if (!state) return;
    publish(announce(state, me, meldPick, trumpChoice));
    setMeldPick([]);
  };

  const nextRound = () => {
    if (!state) return;
    const dealer: PlayerIndex = (state.lastTrickWinner ?? state.dealer) as PlayerIndex;
    publish(newRound(dealer, state.pont ? state.roundsWon : state.roundsWon));
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
          {row?.guest_name
            ? "Distribution des cartes en cours."
            : "En attente du second joueur."}
        </p>
        <Link to="/online" className="text-xs text-gold underline">
          Retour au salon
        </Link>
      </main>
    );
  }

  const myName = me === 0 ? row.host_name : (row.guest_name ?? "Invité");
  const oppName = me === 0 ? (row.guest_name ?? "Invité") : row.host_name;
  const myBonnes = state.gains[me].filter(isBonne).length;

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
        </div>
        <p className="truncate text-right text-xs font-semibold text-foreground">{oppName}</p>
      </header>

      {/* Main adverse */}
      <section>
        <HandRow
          cards={state.hands[opp]}
          exposedIds={state.exposed[opp]}
          faceDown={(c) => !state.exposed[opp].includes(c.id)}
          interactive={false}
          keepSlots={state.stock.length > 0}
        />
      </section>

      {/* Tapis */}
      <section className="panel relative flex min-h-44 max-h-[46dvh] flex-1 flex-col items-center justify-center gap-3 p-4">
        <div className="absolute left-3 top-3">
          <CapturedPile cards={state.gains[opp]} owner="opponent" />
        </div>
        <div className="absolute bottom-3 right-3">
          <CapturedPile
            cards={state.gains[me]}
            owner="player"
            onOpen={() => setShowMyGains(true)}
          />
        </div>

        {state.trick.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {state.phase === "playing"
              ? state.turn === me
                ? "À vous de jouer."
                : `${oppName} réfléchit…`
              : "Tour terminé."}
          </p>
        )}

        <div className="grid grid-cols-[4.5rem_3.75rem_4.5rem] items-center gap-2 sm:gap-4">
          <TrickPosition trick={state.trick} player={opp} me={me} />
          <div className="flex min-h-20 flex-col items-center justify-center gap-1">
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
          <TrickPosition trick={state.trick} player={me} me={me} />
        </div>

        {state.phase === "playing" && (
          <span
            className={
              "absolute left-1/2 top-2 -translate-x-1/2 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold " +
              (turnLeft <= 10
                ? "border-destructive/60 bg-felt-deep/90 text-destructive"
                : "border-gold/40 bg-felt-deep/90 text-gold")
            }
          >
            {state.turn === me ? "Votre tour" : "Tour adverse"} · {turnLeft}s
          </span>
        )}

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

        {meldDecisionPending && (
          <div className="absolute bottom-2 left-2 z-30 max-w-[calc(100%_-_7rem)] rounded border border-gold/35 bg-felt-deep/95 p-2">
            <p className="mb-1 text-[0.62rem] font-semibold leading-tight text-gold">
              Annoncer un compte ?
            </p>
            <div className="flex flex-wrap gap-1">
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
                    className={
                      on
                        ? "rounded border border-gold bg-gold/20 px-2 py-1 text-[0.6rem] leading-none text-gold"
                        : "rounded border border-border px-2 py-1 text-[0.6rem] leading-none text-muted-foreground"
                    }
                  >
                    {SUIT_SYMBOL[m.suit]} {SUIT_NAME[m.suit]} — {m.type}
                  </button>
                );
              })}
              <button
                onClick={() => {
                  setMeldPick([]);
                  publish({ ...state, canAnnounce: null });
                }}
                className="rounded border border-border px-2 py-1 text-[0.6rem] leading-none text-muted-foreground"
              >
                Passer
              </button>
            </div>
            {meldPick.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {state.trump === null ? (
                  <>
                    <span className="text-[0.58rem] text-muted-foreground">Atout :</span>
                    {meldPick.map((s) => (
                      <button
                        key={s}
                        onClick={() => doAnnounce(s)}
                        className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                      >
                        {SUIT_SYMBOL[s]} {SUIT_NAME[s]}
                      </button>
                    ))}
                  </>
                ) : (
                  <button
                    onClick={() => doAnnounce(null)}
                    className="rounded bg-[image:var(--gradient-gold)] px-2 py-1 text-[0.6rem] font-semibold leading-none text-primary-foreground"
                  >
                    Annoncer
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Votre main */}
      <section className="flex flex-col gap-2">
        <HandRow
          cards={state.hands[me]}
          exposedIds={state.exposed[me]}
          keepSlots={state.stock.length > 0}
          isDisabled={(c) =>
            meldDecisionPending ||
            state.turn !== me ||
            state.phase !== "playing" ||
            state.trick.length >= 2 ||
            state.drawPending.length > 0 ||
            !legalIds.has(c.id)
          }
          onPlay={(card) => playMyCard(card)}
        />
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

      {(state.phase === "roundEnd" || state.phase === "gameEnd") && state.roundScore && (
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
                    : "Connexion perdue trop longtemps de votre côté."
                  : state.forfeit.reason === "timeout"
                    ? `${oppName} a dépassé le temps de jeu.`
                    : `${oppName} a perdu la connexion.`}
              </p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Tours gagnés — {myName} {state.roundsWon[me]} · {oppName} {state.roundsWon[opp]}
            </p>
            {state.phase === "roundEnd" ? (
              isHost ? (
                <button
                  onClick={nextRound}
                  className="mt-5 rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
                >
                  {state.pont ? "Rejouer le tour" : "Tour suivant"}
                </button>
              ) : (
                <p className="mt-5 text-xs text-muted-foreground">
                  En attente de l'hôte pour le tour suivant…
                </p>
              )
            ) : (
              <Link
                to="/online"
                className="mt-5 inline-block rounded-full bg-[image:var(--gradient-gold)] px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground"
              >
                Retour au salon
              </Link>
            )}
          </div>
        </div>
      )}

      {showMyGains && (
        <GainsPanel cards={state.gains[me]} onClose={() => setShowMyGains(false)} />
      )}
      {showMyBonnes && (
        <GainsPanel
          cards={state.gains[me].filter(isBonne)}
          title="Vos bonnes"
          subtitle={`${myBonnes} bonnes remportées — treize bonnes gagnent le tour`}
          onClose={() => setShowMyBonnes(false)}
        />
      )}

      <MatchChat matchId={id} seat={verifiedSeat} myName={myName} />
    </main>

  );
}

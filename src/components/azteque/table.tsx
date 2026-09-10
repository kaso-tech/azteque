import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { cn } from "@/lib/utils";
import type { Card, GameState, PlayerIndex } from "@/lib/azteque/engine";

export function TrickPosition({
  trick,
  player,
  hidden,
  vols,
  cardRef,
  me = 0,
}: {
  trick: GameState["trick"];
  player: PlayerIndex;
  hidden?: boolean;
  /**
   * Les cartes qui arrivent par les airs (voir `useCardFlight`). Celle qui
   * vole encore garde sa place vide — sans cela elle serait déjà posée avant
   * même d'avoir volé, et le vol ne serait qu'un double qui la survole ; celles
   * qui se sont posées n'entrent plus en scène, leur vol l'a déjà fait.
   */
  vols?: { flying: Card | null; delivered: ReadonlySet<string> };
  /**
   * La carte elle-même, pour que le vol vise sa place au pixel près.
   *
   * Le bloc qui l'entoure porte aussi son étiquette (« Vous », « Adversaire »)
   * et son centre tombe donc plus bas que celui de la carte : viser le bloc
   * ferait sauter la carte d'une dizaine de pixels en se posant.
   */
  cardRef?: RefObject<HTMLElement | null>;
  me?: PlayerIndex;
}) {
  const played = trick.find((entry) => entry.player === player);
  if (!played) return <div className="h-28 w-[4.5rem]" aria-hidden="true" />;
  const led = trick[0]?.card.id === played.card.id;
  // Cette carte-ci est encore en l'air : sa place l'attend, vide. Et qu'elle
  // vole ou qu'elle vienne de se poser, elle n'entre JAMAIS en scène — le vol
  // était son entrée. La rejouer la ferait remonter d'un cran pour se reposer
  // aussitôt, juste après s'être posée.
  const enVol = vols?.flying?.id === played.card.id;
  const parLesAirs = enVol || !!vols?.delivered.has(played.card.id);
  const cachee = hidden || enVol;

  return (
    <div className="flex w-[4.5rem] flex-col items-center gap-1">
      <span ref={cardRef} className={cn("block w-full", cachee && "invisible")}>
        <PlayingCard card={played.card} size="lg" className={parLesAirs ? "" : "animate-trick"} />
      </span>
      <span className={cn("text-[0.65rem] text-muted-foreground", cachee && "opacity-0")}>
        {player === me ? "Vous" : "Adversaire"}
        {led ? " (mène)" : ""}
      </span>
    </div>
  );
}

export function CapturedPile({
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
  const label = isPlayer ? "Vos cartes" : "Cartes adverses";
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
        aria-label={
          cards.length > 0 ? `Consulter vos ${cards.length} cartes` : "Aucune carte remportée"
        }
      >
        {pile}
      </button>
    );
  }

  return (
    <div
      className="flex w-24 cursor-not-allowed flex-col items-center gap-0.5"
      aria-label="Tas adverse non consultable"
    >
      {pile}
    </div>
  );
}

export function GainsPanel({
  cards,
  onClose,
  title = "Vos cartes",
  subtitle,
}: {
  cards: Card[];
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel max-h-[85dvh] w-full max-w-lg overflow-y-auto p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="gold-text text-2xl">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {subtitle ?? `${cards.length} cartes remportées`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gold-ring flex h-9 w-9 items-center justify-center rounded-full text-lg text-gold"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Aucune carte pour le moment.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {cards.map((card) => (
              <PlayingCard key={card.id} card={card} size="hand" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Écartement et inclinaison d'une carte dans l'éventail, selon son rang.
 *
 * Le décalage est exprimé en pourcentage de la LARGEUR de la rangée, jamais en
 * pixels : l'éventail garde ainsi les mêmes proportions du plus étroit des
 * téléphones à la tablette, et il suffit de borner la rangée pour le borner.
 */
const FAN_PAS = 10;
const FAN_ROT = 3.6;

function fanPlacement(index: number, total: number) {
  const ecart = index - (total - 1) / 2;
  return { dx: `${(ecart * FAN_PAS).toFixed(2)}%`, rot: `${(ecart * FAN_ROT).toFixed(2)}deg` };
}

export function HandRow({
  cards,
  exposedIds,
  isDisabled,
  onPlay,
  interactive = true,
  faceDown,
  refillable = false,
  fan = false,
}: {
  cards: Card[];
  exposedIds: string[];
  isDisabled?: (c: Card) => boolean;
  onPlay?: (c: Card, el: HTMLElement) => void;
  interactive?: boolean;
  faceDown?: (c: Card) => boolean;
  /**
   * Une carte peut encore venir combler un vide (il reste de la pioche). Les
   * emplacements libres sont TOUJOURS réservés — c'est ce qui empêche la main
   * de se recentrer à chaque carte jouée et de faire bouger tout le tapis —
   * mais le liseré d'attente ne s'affiche que si un renfort est réellement
   * en route : en fin de main, il promettrait une carte qui ne viendra pas.
   */
  refillable?: boolean;
  /**
   * Cartes chevauchées en éventail plutôt qu'alignées à plat. Réservé à la
   * main du joueur : elle seule a besoin d'être lue, et le chevauchement lui
   * permet des cartes bien plus larges à encombrement égal.
   */
  fan?: boolean;
}) {
  const [slots, setSlots] = useState<(string | null)[]>([]);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragId = useRef<string | null>(null);
  const startX = useRef(0);
  const moved = useRef(false);

  useEffect(() => {
    setSlots((prev) => {
      const ids = cards.map((c) => c.id);
      const next = prev.map((id) => (id && ids.includes(id) ? id : null));
      for (const id of ids) {
        if (next.includes(id)) continue;
        const empty = next.indexOf(null);
        if (empty >= 0) next[empty] = id;
        else next.push(id);
      }
      return next;
    });
  }, [cards]);

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
    // On vise la carte dont le CENTRE est le plus proche du doigt, plutôt que
    // celle qu'il survole : en éventail les cartes se recouvrent, et un test
    // de survol désignerait toujours la première de la pile.
    const children = Array.from(row.children) as HTMLElement[];
    let target = -1;
    let plusProche = Infinity;
    children.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      if (d < plusProche) {
        plusProche = d;
        target = i;
      }
    });
    if (target < 0) return;
    setSlots((prev) => {
      const from = prev.indexOf(id);
      if (from < 0 || from === target) return prev;
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

  // En éventail, chaque carte est placée à l'unité ; à plat, c'est la
  // répartition en ligne qui s'en charge.
  const place = (i: number): CSSProperties | undefined => {
    if (!fan) return undefined;
    const { dx, rot } = fanPlacement(i, ordered.length);
    return { "--dx": dx, "--rot": rot, zIndex: i } as CSSProperties;
  };
  const caseClass = fan ? "fan-card" : "min-w-0 max-w-[4.5rem] flex-1";

  return (
    <div
      ref={rowRef}
      className={cn(
        "w-full touch-none",
        fan ? "fan-row" : "flex items-end justify-center gap-1 sm:gap-2",
      )}
      onPointerMove={interactive ? handlePointerMove : undefined}
      onPointerUp={interactive ? handlePointerUp : undefined}
      onPointerCancel={interactive ? handlePointerUp : undefined}
      onPointerLeave={interactive ? handlePointerUp : undefined}
    >
      {ordered.map((c, i) =>
        c === null ? (
          <div key={`empty-${i}`} className={caseClass} style={place(i)} aria-hidden="true">
            <div
              className={cn(
                "aspect-[5/7] w-full rounded-[3px]",
                refillable && "animate-slot-wait border border-dashed border-gold/30",
              )}
            />
          </div>
        ) : (
          <div
            key={c.id}
            onPointerDown={interactive ? handlePointerDown(c.id) : undefined}
            className={cn(caseClass, !fan && "transition-transform duration-300")}
            style={place(i)}
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

export function StockPile({ count }: { count: number }) {
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

/**
 * Barre de temps du tour : verte au départ, rouge à l'approche de la fin.
 *
 * L'animation est confiée au navigateur (voir `animate-countdown`) plutôt que
 * recalculée à chaque seconde : la progression est ainsi continue. `resetKey`
 * doit changer à chaque nouveau tour — il sert de `key` React, ce qui remonte
 * l'élément et relance l'animation depuis le début.
 */
export function TurnBar({
  total,
  active,
  resetKey,
  paused = false,
}: {
  total: number;
  active: boolean;
  resetKey: string;
  /** Suspend la barre sans la vider : voir `useTurnCountdown`. */
  paused?: boolean;
}) {
  return (
    <div className="gold-groove h-1.5 w-full overflow-hidden rounded-full border border-gold/20 bg-felt-deep/70">
      {active ? (
        <div
          key={resetKey}
          // La barre est une animation CSS de durée fixe : sans cette
          // suspension elle continuerait de se vider pendant que le décompte
          // est gelé, et montrerait au joueur un temps qu'il n'a pas perdu.
          className={cn("animate-countdown h-full rounded-full", paused && "opacity-40")}
          style={
            {
              "--turn-duration": `${total}s`,
              animationPlayState: paused ? "paused" : "running",
            } as CSSProperties
          }
        />
      ) : (
        <div className="h-full w-full rounded-full bg-muted-foreground/20" />
      )}
    </div>
  );
}

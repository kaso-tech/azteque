import { useEffect, useMemo, useRef, useState } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { cn } from "@/lib/utils";
import type { Card, GameState, PlayerIndex } from "@/lib/azteque/engine";

export function TrickPosition({
  trick,
  player,
  hidden,
  me = 0,
}: {
  trick: GameState["trick"];
  player: PlayerIndex;
  hidden?: boolean;
  me?: PlayerIndex;
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
        aria-label={
          cards.length > 0 ? `Consulter vos ${cards.length} cartes sorties` : "Aucune carte sortie"
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
  title = "Vos cartes sorties",
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 text-lg text-gold"
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

export function HandRow({
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
          <div key={`empty-${i}`} className="min-w-0 max-w-[4.5rem] flex-1" aria-hidden="true">
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

/** Barre de temps du tour : verte au départ, rouge à l'approche de la fin. */
export function TurnBar({
  left,
  total,
  active,
  label,
}: {
  left: number;
  total: number;
  active: boolean;
  label: string;
}) {
  const ratio = active ? Math.max(0, Math.min(1, left / total)) : 1;
  const hue = Math.round(120 * ratio);

  return (
    <div className="flex w-full items-center gap-2">
      <span
        className={cn(
          "w-24 shrink-0 text-[0.58rem] font-semibold uppercase tracking-wide",
          active ? "text-gold" : "text-muted-foreground/60",
        )}
      >
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-gold/20 bg-felt-deep/70">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-500 ease-linear"
          style={{
            width: `${ratio * 100}%`,
            backgroundColor: active ? `hsl(${hue} 78% 45%)` : "hsl(0 0% 40% / 0.35)",
            boxShadow: active ? `0 0 8px hsl(${hue} 78% 45% / 0.6)` : "none",
          }}
        />
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import type { Card, PlayerIndex } from "@/lib/azteque/engine";

/** Déclenche la transition à la frame suivante (mouvement toujours joué). */
export function useDeparture(delay: number) {
  const [departed, setDeparted] = useState(false);
  useEffect(() => {
    let raf = 0;
    const timer = setTimeout(
      () => {
        raf = requestAnimationFrame(() => setDeparted(true));
      },
      Math.max(0, delay),
    );
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [delay]);
  return departed;
}

/** Mouvement fluide : uniquement des transformations (aucun recalcul de mise en page). */
export function flightStyle(
  from: { x: number; y: number },
  to: { x: number; y: number },
  departed: boolean,
  opts: { scale: number; rotate: number; duration: number; ease: string },
) {
  const dx = departed ? to.x - from.x : 0;
  const dy = departed ? to.y - from.y : 0;
  return {
    left: from.x,
    top: from.y,
    transform: `translate3d(calc(${dx}px - 50%), calc(${dy}px - 50%), 0) scale(${
      departed ? opts.scale : 1
    }) rotate(${departed ? opts.rotate : 0}deg)`,
    transition: `transform ${opts.duration}ms ${opts.ease}, opacity ${opts.duration}ms ease-out`,
    willChange: "transform",
  } as const;
}

export function SweepCard({
  from,
  to,
  delay,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}) {
  const departed = useDeparture(delay);

  return (
    <div
      className="pointer-events-none fixed z-50 w-10 drop-shadow-[0_14px_22px_rgba(0,0,0,0.5)]"
      aria-hidden="true"
      style={{
        ...flightStyle(from, to, departed, {
          scale: 1,
          rotate: 6,
          duration: 560,
          ease: "cubic-bezier(.33,.9,.28,1)",
        }),
        opacity: departed ? 1 : 0.95,
      }}
    >
      <PlayingCard faceDown size="sm" />
    </div>
  );
}

export function CollectCard({
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
  const departed = useDeparture(delay);

  return (
    <div
      className="pointer-events-none fixed z-50 w-[4.5rem]"
      aria-hidden="true"
      style={{
        ...flightStyle(from, to, departed, {
          scale: 0.555,
          rotate: 3,
          duration: 520,
          ease: "cubic-bezier(.32,.72,.2,1)",
        }),
        filter: departed
          ? "drop-shadow(0 6px 10px rgba(0,0,0,0.35))"
          : "drop-shadow(0 16px 24px rgba(0,0,0,0.5))",
        opacity: 1,
      }}
    >
      <PlayingCard card={card} size="hand" />
    </div>
  );
}

export function FlyingCard({
  card,
  from,
  to,
}: {
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
}) {
  const departed = useDeparture(0);
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        ...flightStyle(from, to, departed, {
          scale: 0.94,
          rotate: 0,
          duration: 380,
          ease: "cubic-bezier(.3,.8,.25,1)",
        }),
        opacity: departed ? 0 : 1,
        filter: "drop-shadow(0 14px 20px rgba(0,0,0,0.45))",
      }}
    >
      <PlayingCard card={card} size="lg" />
    </div>
  );
}

export function DrawCard({
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
  const departed = useDeparture(delay);

  return (
    <div
      className="pointer-events-none fixed z-50 w-10"
      aria-hidden="true"
      style={{
        ...flightStyle(from, to, departed, {
          scale: 0.86,
          rotate: player === 0 ? 5 : -5,
          duration: 480,
          ease: "cubic-bezier(.24,.82,.28,1)",
        }),
        opacity: departed ? 0.05 : 1,
        transitionDelay: "0ms, 320ms",
        filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.45))",
      }}
    >
      <PlayingCard faceDown size="sm" />
    </div>
  );
}

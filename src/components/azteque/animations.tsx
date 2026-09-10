import { useEffect, useMemo, useRef, useState } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { sfx } from "@/lib/azteque/sfx";
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

/** L'angle qu'un élément doit à sa transformation, en degrés. */
export function angleOf(el: Element | null | undefined): number {
  if (!el) return 0;
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = new DOMMatrixReadOnly(t);
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
}

/** Mouvement fluide : uniquement des transformations (aucun recalcul de mise en page). */
export function flightStyle(
  from: { x: number; y: number },
  to: { x: number; y: number },
  departed: boolean,
  opts: {
    scale: number;
    rotate: number;
    duration: number;
    ease: string;
    /** Inclinaison au DÉPART, redressée pendant le vol. */
    startRotate?: number | undefined;
  },
) {
  const dx = departed ? to.x - from.x : 0;
  const dy = departed ? to.y - from.y : 0;
  return {
    left: from.x,
    top: from.y,
    transform: `translate3d(calc(${dx}px - 50%), calc(${dy}px - 50%), 0) scale(${
      departed ? opts.scale : 1
    }) rotate(${departed ? opts.rotate : (opts.startRotate ?? 0)}deg)`,
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

/** Largeur d'une carte au centre du tapis (`size="lg"`), en pixels. */
const LARGEUR_PLI = 72;

export function FlyingCard({
  card,
  from,
  to,
  fromWidth,
  fromRotate = 0,
}: {
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Largeur qu'avait la carte dans la main, si elle en diffère. */
  fromWidth?: number | undefined;
  /** Inclinaison qu'elle avait dans l'éventail. */
  fromRotate?: number | undefined;
}) {
  const departed = useDeparture(0);
  // La carte quitte la main à SA taille et à SON inclinaison, puis rétrécit et
  // se redresse en chemin — comme une carte qu'on pose à plat. Partir
  // directement au format du pli la faisait sauter d'un coup.
  const width = fromWidth && fromWidth > 0 ? fromWidth : LARGEUR_PLI;
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        ...flightStyle(from, to, departed, {
          scale: (LARGEUR_PLI / width) * 0.98,
          rotate: 0,
          startRotate: fromRotate,
          duration: 380,
          ease: "cubic-bezier(.3,.8,.25,1)",
        }),
        width,
        opacity: departed ? 0 : 1,
        filter: "drop-shadow(0 14px 20px rgba(0,0,0,0.45))",
      }}
    >
      <PlayingCard card={card} size="hand" />
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

/* ---------- Jetons ---------- */

interface Point {
  x: number;
  y: number;
}

/** Un jeton isolé, du point de départ jusqu'au compte. */
function Coin({ from, to, delay, arc }: { from: Point; to: Point; delay: number; arc: number }) {
  const departed = useDeparture(delay);
  // Chaque jeton part un peu de travers puis se recentre : sans cet écart, la
  // rafale se superpose en une seule pièce et ne se lit plus.
  const start = { x: from.x + arc, y: from.y - Math.abs(arc) * 0.35 };
  return (
    <div
      className="pointer-events-none fixed z-[60] select-none text-2xl drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
      aria-hidden="true"
      style={{
        ...flightStyle(start, to, departed, {
          scale: 0.45,
          rotate: arc > 0 ? 220 : -220,
          duration: 620,
          ease: "cubic-bezier(.4,.02,.2,1)",
        }),
        opacity: departed ? 0.15 : 1,
      }}
    >
      🪙
    </div>
  );
}

/**
 * La récompense rejoint le compte du joueur.
 *
 * Un solde qui change tout seul dans un panneau fermé ne se voit pas : les
 * jetons gagnés — victoire sur l'IA, mise remportée, cadeau du jour — volent
 * donc jusqu'à l'avatar du joueur, chacun avec son tintement. Le nombre de
 * pièces suit le montant sans le suivre exactement : au-delà d'une douzaine,
 * l'œil ne compte plus, il ne voit qu'une pluie.
 */
export function CoinBurst({
  from,
  to,
  amount,
  onDone,
}: {
  from: Point;
  to: Point;
  amount: number;
  onDone: () => void;
}) {
  const coins = useMemo(() => {
    const n = Math.max(5, Math.min(14, Math.round(Math.sqrt(Math.max(1, amount)) * 1.6)));
    return Array.from({ length: n }, (_, i) => ({
      delay: i * 65,
      arc: (i % 2 ? 1 : -1) * (12 + ((i * 37) % 46)),
    }));
  }, [amount]);

  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timers = coins.map((c) => setTimeout(() => sfx.coin(), c.delay));
    const last = coins[coins.length - 1]?.delay ?? 0;
    const fin = setTimeout(() => done.current(), last + 700);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(fin);
    };
  }, [coins]);

  return (
    <>
      {coins.map((c, i) => (
        <Coin key={i} from={from} to={to} delay={c.delay} arc={c.arc} />
      ))}
    </>
  );
}

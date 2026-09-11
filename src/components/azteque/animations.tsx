import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { sfx } from "@/lib/azteque/sfx";
import type { Card, GameState, PlayerIndex } from "@/lib/azteque/engine";

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

/**
 * Durée du vol d'une carte vers le tapis.
 *
 * Exportée parce que la table s'en sert pour découvrir l'emplacement d'arrivée
 * au moment PRÉCIS où la carte s'y pose : les deux doivent se répondre à la
 * milliseconde, sinon la carte clignote ou se dédouble à l'atterrissage.
 */
export const DUREE_VOL = 420;

/** Durée du trajet entre la pioche et une main. */
export const DUREE_PIOCHE = 480;

/**
 * La carte que l'on pose, de la main jusqu'au tapis.
 *
 * Elle part à SA taille et à SON inclinaison, puis rétrécit et se redresse en
 * chemin — comme une carte qu'on pose à plat. Partir directement au format du
 * pli la faisait sauter d'un coup.
 *
 * Elle reste opaque d'un bout à l'autre. Elle s'effaçait auparavant pendant sa
 * course, si bien qu'elle était déjà à moitié transparente à mi-parcours et
 * invisible en arrivant : le geste qu'elle est censée montrer ne se voyait
 * pas. C'est l'emplacement d'arrivée qui reste vide pendant ce temps, et la
 * carte qui s'y révèle quand celle-ci se pose — voir `TrickPosition`.
 */
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
  const width = fromWidth && fromWidth > 0 ? fromWidth : LARGEUR_PLI;
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        ...flightStyle(from, to, departed, {
          scale: (LARGEUR_PLI / width) * 0.98,
          rotate: 0,
          startRotate: fromRotate,
          duration: DUREE_VOL,
          ease: "cubic-bezier(.22,.78,.28,1)",
        }),
        width,
        filter: departed
          ? "drop-shadow(0 6px 12px rgba(0,0,0,0.4))"
          : "drop-shadow(0 18px 26px rgba(0,0,0,0.5))",
      }}
    >
      <PlayingCard card={card} size="hand" />
    </div>
  );
}

/** Une carte en route vers le tapis, telle que la suit `useCardFlight`. */
export interface Vol {
  card: Card;
  from: { x: number; y: number };
  /** Largeur et inclinaison qu'elle avait à son départ, si on a pu les relever. */
  width?: number | undefined;
  rot?: number | undefined;
}

/** Ce que la table doit savoir des cartes qui lui arrivent par les airs. */
export interface EtatDesVols {
  /** Celle qui est encore en l'air : sa place sur le tapis reste vide. */
  flying: Card | null;
  /** Celles qui se sont posées et n'ont plus à entrer en scène. */
  delivered: ReadonlySet<string>;
}

/**
 * Le vol d'une carte jouée, de la main jusqu'à sa place sur le tapis.
 *
 * Le mouvement se joue en deux temps, et c'est ce qui le rend enfin lisible :
 * tant que la carte est en l'air, sa place sur le tapis reste VIDE ; à
 * l'instant où elle se pose, elle s'y découvre et le vol s'efface. La carte
 * était auparavant déjà posée avant même d'avoir volé — le vol n'était qu'un
 * double qui la survolait en s'effaçant, et on ne voyait rien partir de la
 * main.
 *
 * Une carte posée reste inscrite jusqu'à ce qu'elle quitte le tapis. Il ne
 * suffit pas de retenir la carte en cours : la suivante prendrait sa place, et
 * la première, qui repose pourtant depuis un moment, rejouerait son entrée en
 * scène au moment précis où l'adversaire pose la sienne.
 */
export function useCardFlight(trick: GameState["trick"]) {
  const [flight, setFlight] = useState<Vol | null>(null);
  const [delivered, setDelivered] = useState<ReadonlySet<string>>(() => new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fly = useCallback(
    (card: Card, from: { x: number; y: number }, width?: number, rot?: number) => {
      if (timer.current) clearTimeout(timer.current);
      setFlight({ card, from, width, rot });
      timer.current = setTimeout(() => {
        // Les deux vont ensemble, dans le même rendu : le vol s'efface au
        // moment exact où sa place le découvre. Un décalage, même d'une seule
        // image, laisserait un trou ou un doublon.
        setFlight((v) => (v?.card.id === card.id ? null : v));
        setDelivered((d) => new Set(d).add(card.id));
      }, DUREE_VOL);
    },
    [],
  );

  // Les cartes qui ont quitté le tapis (pli ramassé, nouvelle donne) sortent de
  // la liste : ce qu'on y garde ne concerne que ce qui est encore posé.
  useEffect(() => {
    setDelivered((d) => {
      if (d.size === 0) return d;
      const surLeTapis = new Set(trick.map((entry) => entry.card.id));
      const restantes = [...d].filter((id) => surLeTapis.has(id));
      return restantes.length === d.size ? d : new Set(restantes);
    });
  }, [trick]);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const etat: EtatDesVols = { flying: flight?.card ?? null, delivered };
  return { flight, etat, fly };
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
          duration: DUREE_PIOCHE,
          ease: "cubic-bezier(.24,.82,.28,1)",
        }),
        opacity: 1,
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

/* ---------- Points d'arrivée exacts ---------- */

/** Le centre d'un élément à l'écran, ou `null` s'il n'est pas encore posé. */
export function centreDe(el: Element | null | undefined) {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/**
 * L'emplacement que la carte piochée viendra occuper dans la main.
 *
 * La main réserve toujours la place laissée libre par la carte jouée (voir
 * `HandRow`) : le vol vise CETTE case précise plutôt que le milieu de la
 * rangée, sinon la carte atterrit au centre puis saute jusqu'à sa place.
 */
export function centreDuSlotLibre(row: HTMLElement | null | undefined) {
  const libre = row?.querySelector<HTMLElement>("[data-empty-slot]");
  return centreDe(libre) ?? centreDe(row);
}

/**
 * Où la carte en vol doit se poser : la place de CELUI qui l'a jouée.
 *
 * Elle se mesure APRÈS le rendu : au moment où le vol commence, la place sur
 * le tapis n'existe pas encore dans le document, et la mesurer pendant le
 * rendu renvoyait toujours le repli — le centre de la table. Toutes les cartes
 * convergeaient donc au milieu au lieu de rejoindre leur emplacement.
 */
export function useVolArrivee(
  flight: Vol | null,
  trick: GameState["trick"],
  cardRefs: readonly [RefObject<HTMLElement | null>, RefObject<HTMLElement | null>],
  fallbackRef: RefObject<HTMLElement | null>,
) {
  const [arrivee, setArrivee] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (!flight) {
      setArrivee(null);
      return;
    }
    const joueur = trick.find((e) => e.card.id === flight.card.id)?.player;
    const place =
      (joueur === undefined ? null : centreDe(cardRefs[joueur].current)) ??
      centreDe(fallbackRef.current);
    if (!place) return;
    setArrivee((p) => (p && p.x === place.x && p.y === place.y ? p : place));
  }, [flight, trick, cardRefs, fallbackRef]);
  return arrivee;
}

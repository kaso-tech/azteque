import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { angleOf } from "@/components/azteque/animations";
import { sfx } from "@/lib/azteque/sfx";
import type { GameState } from "@/lib/azteque/engine";

/**
 * La cérémonie de la donne, jouée sur la table elle-même : le paquet est battu
 * à l'emplacement de la pioche, coupé, puis les douze cartes partent une à une
 * vers les places exactes qu'elles occuperont dans les deux mains.
 *
 * Elle ne décide de rien — la donne est déjà faite quand elle commence, et le
 * jeu la retrouve intacte à la fin. C'est du temps de théâtre, celui qu'un
 * joueur passe à regarder battre les cartes avant de prendre les siennes.
 *
 * Les positions sont relevées sur les vrais éléments plutôt que devinées : la
 * carte qui se pose recouvre exactement celle que la main affichera, et le
 * relais de l'une à l'autre ne se voit pas.
 */

/**
 * Le rythme de la cérémonie.
 *
 * Seul contre l'ordinateur, le joueur a déjà vu battre les cartes cent fois et
 * n'attend qu'une chose : les siennes. À deux, la donne est le seul moment que
 * les deux joueurs regardent ensemble, chacun de son côté de la table — elle
 * mérite alors qu'on prenne le temps de la voir, et personne n'y perd puisque
 * le compte à rebours ne court pour personne pendant ce temps.
 */
export type DealPace = "solo" | "duo";

interface Tempo {
  /** Battage et coupe. */
  shuffle: number;
  /** Intervalle entre deux cartes distribuées. */
  step: number;
  /** Vol d'une carte du paquet à la main. Porté par `--fly-duration`. */
  flight: number;
  /** Temps de pose, une fois la dernière carte arrivée. */
  hold: number;
}

const TEMPOS: Record<DealPace, Tempo> = {
  solo: { shuffle: 1200, step: 90, flight: 540, hold: 200 },
  duo: { shuffle: 1500, step: 115, flight: 620, hold: 260 },
};

/** Cartes distribuées, six par joueur. */
const DEALT = 12;

/**
 * Durée totale, déduite de la chorégraphie et non fixée à vue : un total trop
 * court rendrait la main au joueur alors qu'une carte est encore en vol.
 */
export function ceremonyMs(pace: DealPace): number {
  const t = TEMPOS[pace];
  return t.shuffle + (DEALT - 1) * t.step + t.flight + t.hold;
}

/** Les cartes partent par paquets de trois, comme à la main. */
function seatOf(index: number): 0 | 1 {
  return Math.floor(index / 3) % 2 === 0 ? 1 : 0;
}

/** Rang de la carte dans sa main, de 0 à 5. */
function slotOf(index: number) {
  return Math.floor(index / 6) * 3 + (index % 3);
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Inclinaison de la case, en degrés : nulle à plat, réglée en éventail. */
  rot: number;
}

interface Geometry {
  deck: Box;
  /** Une case par carte distribuée, dans l'ordre de distribution. */
  slots: (Box | null)[];
}

function boxOf(r: DOMRect): Box {
  return { left: r.left, top: r.top, width: r.width, height: r.height, rot: 0 };
}

/**
 * Les cartes réellement affichées dans un conteneur, dans l'ordre.
 *
 * Une carte inclinée occupe un rectangle plus large qu'elle : son
 * `getBoundingClientRect` déborde de tous les côtés. On repart donc du CENTRE
 * de ce rectangle — juste, quelle que soit l'inclinaison — et de la taille non
 * transformée, pour que la carte en vol se pose exactement sur la carte
 * qu'elle remplace, et non sur son encombrement.
 */
function cardBoxes(ref: RefObject<HTMLElement | null>): Box[] {
  const el = ref.current;
  if (!el) return [];
  return Array.from(el.querySelectorAll<HTMLElement>(".playing-card")).map((c) => {
    const r = c.getBoundingClientRect();
    const width = c.offsetWidth || r.width;
    const height = c.offsetHeight || r.height;
    return {
      left: r.left + r.width / 2 - width / 2,
      top: r.top + r.height / 2 - height / 2,
      width,
      height,
      rot: angleOf(c.parentElement),
    };
  });
}

function measure(
  stockRef: RefObject<HTMLElement | null>,
  myHandRef: RefObject<HTMLElement | null>,
  oppHandRef: RefObject<HTMLElement | null>,
): Geometry | null {
  const stock = stockRef.current;
  const deck = cardBoxes(stockRef)[0] ?? (stock ? boxOf(stock.getBoundingClientRect()) : null);
  if (!deck || deck.width === 0) return null;
  const hands = [cardBoxes(myHandRef), cardBoxes(oppHandRef)] as const;
  return {
    deck,
    slots: Array.from({ length: DEALT }, (_, i) => hands[seatOf(i)][slotOf(i)] ?? null),
  };
}

export function DealCeremony({
  stockRef,
  myHandRef,
  oppHandRef,
  pace = "solo",
}: {
  /** La pioche : c'est de là que le paquet est battu et distribué. */
  stockRef: RefObject<HTMLElement | null>;
  /** La main du joueur local. */
  myHandRef: RefObject<HTMLElement | null>;
  /** Celle de l'adversaire. */
  oppHandRef: RefObject<HTMLElement | null>;
  /** Doit valoir celui passé à `useDealCeremony`, qui en tient la durée. */
  pace?: DealPace;
}) {
  const [phase, setPhase] = useState<"shuffle" | "deal">("shuffle");
  const [geom, setGeom] = useState<Geometry | null>(null);
  const tempo = TEMPOS[pace];

  // Relevé avant peinture : les mains sont déjà en place, masquées, et leurs
  // cases n'attendent que d'être recouvertes.
  useLayoutEffect(() => {
    setGeom(measure(stockRef, myHandRef, oppHandRef));
  }, [stockRef, myHandRef, oppHandRef]);

  useEffect(() => {
    sfx.shuffle();
    const timers = [setTimeout(() => setPhase("deal"), tempo.shuffle)];
    // Un claquement par carte, calé sur son départ.
    for (let i = 0; i < DEALT; i += 1) {
      timers.push(setTimeout(() => sfx.dealCard(), tempo.shuffle + i * tempo.step));
    }
    return () => timers.forEach(clearTimeout);
  }, [tempo]);

  if (!geom) return null;
  const { deck, slots } = geom;
  const deckCx = deck.left + deck.width / 2;
  const deckCy = deck.top + deck.height / 2;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30">
      {/* Le paquet, posé sur la pioche. */}
      {phase === "shuffle" && (
        <div
          className="animate-deck-present absolute"
          style={
            {
              left: deck.left,
              top: deck.top,
              width: deck.width,
              height: deck.height,
              "--riffle-duration": `${tempo.shuffle}ms`,
            } as React.CSSProperties
          }
        >
          {/* L'épaisseur : quelques dos décalés sous les deux moitiés. Le
              décalage tient sur un conteneur, l'apparition sur la carte : une
              animation de transformation effacerait l'autre. */}
          {[0, 1, 2].map((i) => (
            <div
              key={`base-${i}`}
              className="absolute inset-0"
              style={{ transform: `translate(${i * 2}px, ${i * -2}px)` }}
            >
              <div className="animate-deck-settle h-full w-full">
                <PlayingCard faceDown size="hand" />
              </div>
            </div>
          ))}
          {(
            [
              { key: "gauche", x: "-46%", r: "-9deg" },
              { key: "droite", x: "46%", r: "9deg" },
            ] as const
          ).map(({ key, x, r }) => (
            <div
              key={key}
              className="animate-riffle absolute inset-0"
              style={
                {
                  "--riffle-x": x,
                  "--riffle-r": r,
                  "--riffle-duration": `${tempo.shuffle}ms`,
                } as React.CSSProperties
              }
            >
              <PlayingCard faceDown size="hand" />
            </div>
          ))}
        </div>
      )}

      {/* La distribution : chaque carte part du paquet et se pose sur sa case. */}
      {phase === "deal" &&
        slots.map((slot, i) => {
          if (!slot) return null;
          const cx = slot.left + slot.width / 2;
          const cy = slot.top + slot.height / 2;
          // La case porte déjà son inclinaison ; le vol se joue DANS ce repère
          // incliné. On y ramène donc le vecteur qui mène au paquet, sans quoi
          // la carte partirait d'à côté de la pioche.
          const rad = (-slot.rot * Math.PI) / 180;
          const dx = deckCx - cx;
          const dy = deckCy - cy;
          return (
            <div
              key={`deal-${i}`}
              className="absolute"
              style={{
                left: slot.left,
                top: slot.top,
                width: slot.width,
                height: slot.height,
                transform: `rotate(${slot.rot}deg)`,
              }}
            >
              <div
                className="animate-deal-fly h-full w-full"
                style={
                  {
                    // La carte occupe d'emblée sa case, à la taille qu'elle y
                    // aura : l'animation la fait partir du paquet et l'y
                    // ramène. Décrire le vol ainsi évite d'avoir à corriger sa
                    // taille en chemin, et garantit qu'elle se pose exactement
                    // en place — inclinaison de l'éventail comprise.
                    "--dx": `${dx * Math.cos(rad) - dy * Math.sin(rad)}px`,
                    "--dy": `${dx * Math.sin(rad) + dy * Math.cos(rad)}px`,
                    // Inclinaison au départ seulement : la carte se redresse en
                    // arrivant, comme celle que la main affichera.
                    "--dr": `${(slotOf(i) - 2.5) * 5}deg`,
                    "--fly-duration": `${tempo.flight}ms`,
                    animationDelay: `${i * tempo.step}ms`,
                  } as React.CSSProperties
                }
              >
                <PlayingCard faceDown size="hand" />
              </div>
            </div>
          );
        })}
    </div>
  );
}

/**
 * L'identifiant de la donne quand l'état en montre une fraîche : rien de joué,
 * rien de pioché, rien d'annoncé. `null` le reste du temps.
 */
export function freshDealId(state: GameState | null | undefined): string | null {
  if (!state || state.phase !== "playing") return null;
  const vierge =
    state.trick.length === 0 &&
    state.gains[0].length === 0 &&
    state.gains[1].length === 0 &&
    state.melds[0].length === 0 &&
    state.melds[1].length === 0 &&
    state.drawPending.length === 0;
  // La première carte du talon identifie la donne : chaque paquet est bâti
  // avec des cartes neuves, et son identifiant ne se répète jamais.
  return vierge ? (state.stock[0]?.id ?? null) : null;
}

/**
 * Déclenche la cérémonie à chaque nouvelle donne, et rend `true` tant qu'elle
 * dure — de quoi masquer les mains, retenir l'ordinateur et suspendre le
 * compte à rebours.
 *
 * Elle est purement décorative : un joueur qui a demandé moins d'animations la
 * saute entièrement, plutôt que d'attendre deux secondes devant un écran fixe.
 */
export function useDealCeremony(
  state: GameState | null | undefined,
  active: boolean,
  pace: DealPace = "solo",
) {
  const [dealing, setDealing] = useState(false);
  const lastDeal = useRef<string | null>(null);

  const dealId = active ? freshDealId(state) : null;

  useEffect(() => {
    if (!dealId || dealId === lastDeal.current) return;
    lastDeal.current = dealId;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    setDealing(true);
    const t = setTimeout(() => setDealing(false), ceremonyMs(pace));
    return () => clearTimeout(t);
  }, [dealId, pace]);

  // Quitter la table pendant la donne ne doit pas laisser les mains masquées.
  useEffect(() => {
    if (!active) {
      setDealing(false);
      lastDeal.current = null;
    }
  }, [active]);

  return dealing;
}

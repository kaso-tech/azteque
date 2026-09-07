import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
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

/** Battage et coupe. */
const SHUFFLE_MS = 820;
/** Intervalle entre deux cartes distribuées. */
const DEAL_STEP_MS = 55;
/** Cartes distribuées, six par joueur. */
const DEALT = 12;
/** Vol d'une carte du paquet à la main. Doit suivre `animate-deal-fly`. */
const FLIGHT_MS = 430;
/** Temps de pose, une fois la dernière carte arrivée. */
const HOLD_MS = 140;

/** Instant où la dernière carte se pose. */
const LAST_CARD_MS = SHUFFLE_MS + (DEALT - 1) * DEAL_STEP_MS + FLIGHT_MS;

/**
 * Durée totale, déduite de la chorégraphie et non fixée à vue : un total trop
 * court rendrait la main au joueur alors qu'une carte est encore en vol.
 */
export const CEREMONY_MS = LAST_CARD_MS + HOLD_MS;

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
}

interface Geometry {
  deck: Box;
  /** Une case par carte distribuée, dans l'ordre de distribution. */
  slots: (Box | null)[];
}

function boxOf(r: DOMRect): Box {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Les cartes réellement affichées dans un conteneur, dans l'ordre. */
function cardBoxes(ref: RefObject<HTMLElement | null>): Box[] {
  const el = ref.current;
  if (!el) return [];
  return Array.from(el.querySelectorAll<HTMLElement>(".playing-card")).map((c) =>
    boxOf(c.getBoundingClientRect()),
  );
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
}: {
  /** La pioche : c'est de là que le paquet est battu et distribué. */
  stockRef: RefObject<HTMLElement | null>;
  /** La main du joueur local. */
  myHandRef: RefObject<HTMLElement | null>;
  /** Celle de l'adversaire. */
  oppHandRef: RefObject<HTMLElement | null>;
}) {
  const [phase, setPhase] = useState<"shuffle" | "deal">("shuffle");
  const [geom, setGeom] = useState<Geometry | null>(null);

  // Relevé avant peinture : les mains sont déjà en place, masquées, et leurs
  // cases n'attendent que d'être recouvertes.
  useLayoutEffect(() => {
    setGeom(measure(stockRef, myHandRef, oppHandRef));
  }, [stockRef, myHandRef, oppHandRef]);

  useEffect(() => {
    sfx.shuffle();
    const timers = [setTimeout(() => setPhase("deal"), SHUFFLE_MS)];
    // Un claquement par carte, calé sur son départ.
    for (let i = 0; i < DEALT; i += 1) {
      timers.push(setTimeout(() => sfx.dealCard(), SHUFFLE_MS + i * DEAL_STEP_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

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
              "--riffle-duration": `${SHUFFLE_MS}ms`,
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
                  "--riffle-duration": `${SHUFFLE_MS}ms`,
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
          return (
            <div
              key={`deal-${i}`}
              className="animate-deal-fly absolute"
              style={
                {
                  left: slot.left,
                  top: slot.top,
                  width: slot.width,
                  height: slot.height,
                  // La carte occupe d'emblée sa case, à la taille qu'elle y
                  // aura : l'animation la fait partir du paquet et l'y ramène.
                  // Décrire le vol ainsi évite d'avoir à corriger sa taille en
                  // chemin, et garantit qu'elle se pose exactement en place.
                  "--dx": `${deckCx - cx}px`,
                  "--dy": `${deckCy - cy}px`,
                  // Inclinaison au départ seulement : la carte se redresse en
                  // arrivant, comme celle que la main affichera.
                  "--dr": `${(slotOf(i) - 2.5) * 5}deg`,
                  animationDelay: `${i * DEAL_STEP_MS}ms`,
                } as React.CSSProperties
              }
            >
              <PlayingCard faceDown size="hand" />
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
export function useDealCeremony(state: GameState | null | undefined, active: boolean) {
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
    const t = setTimeout(() => setDealing(false), CEREMONY_MS);
    return () => clearTimeout(t);
  }, [dealId]);

  // Quitter la table pendant la donne ne doit pas laisser les mains masquées.
  useEffect(() => {
    if (!active) {
      setDealing(false);
      lastDeal.current = null;
    }
  }, [active]);

  return dealing;
}

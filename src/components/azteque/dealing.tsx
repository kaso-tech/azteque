import { useEffect, useRef, useState } from "react";
import { PlayingCard } from "@/components/azteque/PlayingCard";
import { sfx } from "@/lib/azteque/sfx";
import type { GameState } from "@/lib/azteque/engine";

/**
 * La cérémonie de la donne : le paquet se pose, il est battu, coupé, puis les
 * douze cartes partent une à une vers les deux mains.
 *
 * Elle ne décide de rien — la donne est déjà faite quand elle commence, et le
 * jeu la retrouve intacte à la fin. C'est du temps de théâtre, celui qu'un
 * joueur passe à regarder battre les cartes avant de prendre les siennes.
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
const HOLD_MS = 120;
/** Fondu de sortie. */
const FADE_MS = 220;

/** Instant où la dernière carte se pose. */
const LAST_CARD_MS = SHUFFLE_MS + (DEALT - 1) * DEAL_STEP_MS + FLIGHT_MS;

/**
 * Durée totale, déduite de la chorégraphie et non fixée à vue : un total trop
 * court lèverait le voile sur une carte encore en vol.
 */
export const CEREMONY_MS = LAST_CARD_MS + HOLD_MS + FADE_MS;

/** Les cartes partent par paquets de trois, comme à la main. */
function seatOf(index: number): 0 | 1 {
  return Math.floor(index / 3) % 2 === 0 ? 1 : 0;
}

/**
 * L'écart d'une carte à sa position finale, en pourcentage de sa taille.
 *
 * Le voile couvre tout l'écran, et non le seul tapis : sans cela les mains
 * resteraient visibles en dessous pendant qu'on fait mine de les distribuer.
 * Les cartes partent donc vers le haut et le bas de la fenêtre, là où les
 * mains apparaîtront au lever du voile.
 */
function landing(index: number) {
  const seat = seatOf(index);
  const rank = Math.floor(index / 6) * 3 + (index % 3); // 0 à 5 dans sa main
  const spread = (rank - 2.5) / 2.5; // −1 à +1
  return {
    // Les distances se mesurent sur la fenêtre, non sur la carte : les mains
    // sont en haut et en bas de l'écran quelle qu'en soit la taille. L'étalement
    // est borné, faute de quoi les cartes partiraient hors du plateau sur un
    // écran large.
    dx: `calc(${spread.toFixed(2)} * min(18vw, 140px))`,
    dy: seat === 0 ? "34vh" : "-34vh",
    dr: `${spread * 7}deg`,
  };
}

export function DealCeremony({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<"shuffle" | "deal" | "out">("shuffle");

  useEffect(() => {
    sfx.shuffle();
    const timers = [
      setTimeout(() => setPhase("deal"), SHUFFLE_MS),
      setTimeout(() => setPhase("out"), CEREMONY_MS - FADE_MS),
      setTimeout(() => onDone?.(), CEREMONY_MS),
    ];
    // Un claquement par carte, calé sur son départ.
    for (let i = 0; i < DEALT; i += 1) {
      timers.push(setTimeout(() => sfx.dealCard(), SHUFFLE_MS + i * DEAL_STEP_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-felt-deep transition-opacity duration-200"
      style={{
        // Le voile n'est pas un écran posé sur la table : c'est la table, vide,
        // le temps de la donne. À demi transparent, les mains transparaissaient
        // en dessous et l'on voyait distribuer des cartes déjà en place.
        backgroundImage: "var(--gradient-felt)",
        opacity: phase === "out" ? 0 : 1,
      }}
    >
      <div className="relative w-20 sm:w-24">
        {/* L'épaisseur du paquet : quelques dos décalés sous les moitiés. */}
        {[0, 1, 2].map((i) => (
          <div
            key={`base-${i}`}
            className="animate-deck-settle absolute inset-0"
            style={{ transform: `translate(${i * 2}px, ${i * -2}px)` }}
          >
            <PlayingCard faceDown size="hand" />
          </div>
        ))}

        {/* Les deux moitiés qui s'imbriquent. Elles ne bougent que pendant le
            battage : une fois la distribution commencée, le paquet est en
            place et doit le rester. */}
        {phase === "shuffle" &&
          (
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

        {/* La distribution. */}
        {phase !== "shuffle" &&
          Array.from({ length: DEALT }, (_, i) => {
            const { dx, dy, dr } = landing(i);
            return (
              <div
                key={`deal-${i}`}
                className="animate-deal-fly absolute inset-0"
                style={
                  {
                    "--dx": dx,
                    "--dy": dy,
                    "--dr": dr,
                    animationDelay: `${i * DEAL_STEP_MS}ms`,
                  } as React.CSSProperties
                }
              >
                <PlayingCard faceDown size="hand" />
              </div>
            );
          })}
      </div>
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
 * dure — de quoi retenir l'ordinateur et le compte à rebours.
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

  // Quitter la table pendant la donne ne doit pas laisser le voile derrière.
  useEffect(() => {
    if (!active) {
      setDealing(false);
      lastDeal.current = null;
    }
  }, [active]);

  return dealing;
}

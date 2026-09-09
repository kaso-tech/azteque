import { SUIT_NAME, type Card, type Suit } from "@/lib/azteque/engine";
import { CARD_BACK_ASSET } from "@/lib/azteque/card-assets";
import { cn } from "@/lib/utils";

interface Props {
  card?: Card;
  faceDown?: boolean;
  disabled?: boolean;
  exposed?: boolean;
  size?: "sm" | "md" | "lg" | "hand";
  onClick?: (el: HTMLElement) => void;
  className?: string;
}

const sizes = {
  sm: "w-10 aspect-[5/7]",
  md: "w-14 aspect-[5/7]",
  lg: "w-[4.5rem] aspect-[5/7]",
  hand: "w-full aspect-[5/7]",
};

/** Le rayon suit la carte : le même arrondi à 25 px de large qu'à 72. */
const FORME = "rounded-[7%]";

/**
 * Les quatre enseignes, dessinées autour de leur centre et à la même échelle
 * apparente : la même valeur de `scale` les rend visuellement égales, du coin
 * de la carte au grand motif.
 */
const ENSEIGNE: Record<Suit, string> = {
  S: "M0-11C-3-5-11-1-11 5c0 6 7 8 11 3-1 5-3 8-6 10H6c-3-2-5-5-6-10 4 5 11 3 11-3 0-6-8-10-11-16Z",
  H: "M0 10C-2 6-11 1-11-5c0-8 10-9 11-2 1-7 11-6 11 2 0 6-9 11-11 15Z",
  D: "M0-11 8.5 0 0 11-8.5 0Z",
  C: "M0-11a7 7 0 0 0-5.8 10.9A7 7 0 1 0-3 12c-.4 4-1.8 6.7-4.5 9H7.5C4.8 18.7 3.4 16 3 12A7 7 0 1 0 5.8-.1 7 7 0 0 0 0-11Z",
};

/**
 * La face d'une carte.
 *
 * Elle abandonne la disposition française classique — index discret dans le
 * coin, huit petits piques alignés — pour celle des jeux de cartes de
 * téléphone : un index énorme, une enseigne au coin opposé, un grand motif
 * central. La raison est arithmétique : une carte en main mesure une trentaine
 * de pixels de large, et un index à 13 % de cette largeur devient illisible.
 * Ici il en occupe près de la moitié.
 *
 * Elle est dessinée plutôt qu'importée : trente-deux fichiers ne suivraient pas
 * un changement de palette, alors que ces trois couleurs sont des jetons du
 * thème.
 */
function Face({ card }: { card: Card }) {
  const rouge = card.suit === "H" || card.suit === "D";
  const encre = rouge ? "var(--card-red)" : "var(--card-ink)";
  // Le dix est le seul index à deux caractères : il se resserre pour tenir
  // dans la même colonne que les autres.
  const dix = card.rank === "10";

  return (
    <svg viewBox="0 0 250 350" className="h-full w-full" aria-hidden="true" focusable="false">
      <rect width="250" height="350" fill="var(--card-face)" />
      <rect
        x="2"
        y="2"
        width="246"
        height="346"
        rx="16"
        fill="none"
        stroke="oklch(0 0 0 / 0.14)"
        strokeWidth="3"
      />
      <g fill={encre}>
        <text
          x={dix ? 18 : 24}
          y="122"
          fontFamily="Georgia, 'Times New Roman', 'Noto Serif', serif"
          fontSize={dix ? 100 : 126}
          fontWeight="700"
          letterSpacing={dix ? -9 : 0}
        >
          {card.rank}
        </text>
        <path d={ENSEIGNE[card.suit]} transform="translate(211 62) scale(1.95)" />
        <path d={ENSEIGNE[card.suit]} transform="translate(130 232) scale(5.6)" />
      </g>
    </svg>
  );
}

export function PlayingCard({
  card,
  faceDown,
  disabled,
  exposed,
  size = "md",
  onClick,
  className,
}: Props) {
  if (faceDown || !card) {
    return (
      <div
        className={cn(
          sizes[size],
          FORME,
          "playing-card relative min-w-0 max-w-full overflow-hidden shadow-[var(--shadow-card)]",
          className,
        )}
        aria-label="Carte face cachée"
      >
        <img
          className="h-full w-full object-cover"
          src={CARD_BACK_ASSET}
          alt=""
          draggable={false}
        />
      </div>
    );
  }

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick ? (e: React.MouseEvent<HTMLElement>) => onClick(e.currentTarget) : undefined}
      disabled={onClick ? disabled : undefined}
      className={cn(
        sizes[size],
        FORME,
        "playing-card relative min-w-0 max-w-full overflow-hidden bg-card-face shadow-[var(--shadow-card)]",
        "flex flex-col justify-between select-none transition-all duration-200",
        onClick && !disabled && "hover:-translate-y-3 hover:shadow-xl cursor-pointer",
        disabled && "opacity-45 saturate-50",
        exposed && "ring-2 ring-gold",
        className,
      )}
      data-rank={card.rank}
      data-suit={card.suit}
      aria-label={`${card.rank} de ${SUIT_NAME[card.suit]}`}
    >
      <Face card={card} />
    </Tag>
  );
}

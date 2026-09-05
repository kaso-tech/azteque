import { SUIT_SYMBOL, type Card } from "@/lib/azteque/engine";
import { cn } from "@/lib/utils";
import cardReference from "@/assets/cartes-azteque-reference.jpg.asset.json";

interface Props {
  card?: Card;
  faceDown?: boolean;
  disabled?: boolean;
  exposed?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: (el: HTMLElement) => void;
  className?: string;
}

const sizes = {
  sm: "w-10 h-14 text-[0.65rem]",
  md: "w-14 h-20 text-sm",
  lg: "w-[4.5rem] h-[6.5rem] text-base",
};

const photographedRanks = new Set(["8", "9", "10", "J", "Q", "K"]);

function PipFace({ card }: { card: Card }) {
  const red = card.suit === "H" || card.suit === "D";
  const pips = card.rank === "7" ? 7 : 1;

  return (
    <>
      <span className={cn("card-corner card-corner-top", red ? "text-card-red" : "text-card-ink")}>
        <b>{card.rank}</b>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className={cn("card-pips", `card-pips-${pips}`, red ? "text-card-red" : "text-card-ink")}>
        {Array.from({ length: pips }, (_, index) => (
          <i key={index}>{SUIT_SYMBOL[card.suit]}</i>
        ))}
      </span>
      <span className={cn("card-corner card-corner-bottom", red ? "text-card-red" : "text-card-ink")}>
        <b>{card.rank}</b>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </>
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
          "rounded-lg border border-gold/30 bg-felt-deep shadow-[var(--shadow-card)]",
          "relative overflow-hidden",
          className,
        )}
      >
        <div className="absolute inset-1 rounded-md border border-gold/25 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,color-mix(in_oklab,var(--gold)_18%,transparent)_4px,color-mix(in_oklab,var(--gold)_18%,transparent)_5px)]" />
      </div>
    );
  }

  const red = card.suit === "H" || card.suit === "D";
  const usesReference = photographedRanks.has(card.rank);
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick ? (e: React.MouseEvent<HTMLElement>) => onClick(e.currentTarget) : undefined}
      disabled={onClick ? disabled : undefined}
      className={cn(
        sizes[size],
        "playing-card relative overflow-hidden rounded-md bg-card-face shadow-[var(--shadow-card)] border border-card-ink/70",
        "flex flex-col justify-between select-none transition-all duration-200",
        usesReference && "playing-card-reference",
        onClick && !disabled && "hover:-translate-y-3 hover:shadow-xl cursor-pointer",
        disabled && "opacity-45 saturate-50",
        exposed && "ring-2 ring-gold",
        className,
      )}
      data-rank={card.rank}
      data-suit={card.suit}
      style={usesReference ? { backgroundImage: `url(${cardReference.url})` } : undefined}
      aria-label={`${card.rank} de ${card.suit}`}
    >
      {!usesReference && <PipFace card={card} />}
    </Tag>
  );
}

import { SUIT_NAME, type Card } from "@/lib/azteque/engine";
import { CARD_BACK_ASSET, getCardAsset } from "@/lib/azteque/card-assets";
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
  sm: "w-10 aspect-[5/7] text-[0.65rem]",
  md: "w-14 aspect-[5/7] text-sm",
  lg: "w-[4.5rem] aspect-[5/7] text-base",
  hand: "w-full aspect-[5/7] text-base",
};

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
          "playing-card relative min-w-0 max-w-full overflow-hidden rounded-[3px] shadow-[var(--shadow-card)]",
          className,
        )}
        aria-label="Carte face cachée"
      >
        <img className="h-full w-full object-cover" src={CARD_BACK_ASSET} alt="" draggable={false} />
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
        "playing-card relative min-w-0 max-w-full overflow-hidden rounded-[3px] bg-card-face shadow-[var(--shadow-card)]",
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
      <img
        className="h-full w-full object-cover"
        src={getCardAsset(card.rank, card.suit)}
        alt=""
        draggable={false}
      />
    </Tag>
  );
}

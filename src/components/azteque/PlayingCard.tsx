import { SUIT_SYMBOL, type Card } from "@/lib/azteque/engine";
import { cn } from "@/lib/utils";

interface Props {
  card?: Card;
  faceDown?: boolean;
  disabled?: boolean;
  exposed?: boolean;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

const sizes = {
  sm: "w-10 h-14 text-[0.65rem]",
  md: "w-14 h-20 text-sm",
  lg: "w-[4.5rem] h-[6.5rem] text-base",
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
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      className={cn(
        sizes[size],
        "relative rounded-lg bg-card-face shadow-[var(--shadow-card)] border border-black/10",
        "flex flex-col justify-between p-1.5 select-none transition-all duration-200",
        onClick && !disabled && "hover:-translate-y-3 hover:shadow-xl cursor-pointer",
        disabled && "opacity-45 saturate-50",
        exposed && "ring-2 ring-gold",
        className,
      )}
    >
      <span
        className={cn(
          "font-display font-bold leading-none",
          red ? "text-card-red" : "text-card-ink",
        )}
      >
        {card.rank}
      </span>
      <span
        className={cn(
          "self-center text-xl leading-none",
          red ? "text-card-red" : "text-card-ink",
        )}
      >
        {SUIT_SYMBOL[card.suit]}
      </span>
      <span
        className={cn(
          "self-end font-display font-bold leading-none rotate-180",
          red ? "text-card-red" : "text-card-ink",
        )}
      >
        {card.rank}
      </span>
    </Tag>
  );
}

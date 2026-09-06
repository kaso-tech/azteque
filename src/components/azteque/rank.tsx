import { cn } from "@/lib/utils";
import { RANKS, rankOf, rankProgress, type Rank } from "@/lib/azteque/rank";

/**
 * L'emblème d'un grade.
 *
 * Le rond noir de Maître disparaîtrait sur le fond sombre de la table : un
 * halo clair le détache sans changer l'emblème lui-même.
 */
function RankEmoji({ rank }: { rank: Rank }) {
  return (
    <span
      aria-hidden="true"
      className={cn(rank.dim && "[text-shadow:0_0_4px_rgba(255,255,255,0.6)]")}
    >
      {rank.emoji}
    </span>
  );
}

/**
 * Le grade d'un joueur, en une ligne.
 *
 * Se glisse partout où un pseudo est affiché — liste d'amis, recherche,
 * invitation, en-tête de table — pour que chacun sache à qui il a affaire
 * avant d'engager une partie.
 */
export function RankBadge({
  rating,
  compact = false,
  className,
}: {
  rating: number;
  /** N'affiche que l'emblème, pour les emplacements étroits. */
  compact?: boolean;
  className?: string;
}) {
  const rank = rankOf(rating);
  return (
    <span
      title={`${rank.name} · ${rating} points`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold",
        rank.tone,
        className,
      )}
    >
      <RankEmoji rank={rank} />
      {!compact && <span>{rank.name}</span>}
      <span className="sr-only">{compact ? rank.name : ""}</span>
    </span>
  );
}

/**
 * Le grade et l'avancement vers le suivant.
 *
 * La barre montre ce qui a été parcouru dans le grade actuel : c'est la seule
 * façon de voir qu'on progresse entre deux changements de grade, qui sont
 * rares. Le nombre de points restants la double d'une mesure exacte.
 */
export function RankProgressCard({
  rating,
  peak,
  ratedGames,
  className,
}: {
  rating: number;
  peak?: number;
  ratedGames?: number;
  className?: string;
}) {
  const { rank, next, ratio, toNext } = rankProgress(rating);
  const peakRank = peak !== undefined ? rankOf(peak) : null;

  return (
    <div className={cn("rounded-lg border border-border bg-secondary/40 px-4 py-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("font-display text-lg", rank.tone)}>
          <RankEmoji rank={rank} /> {rank.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{rating} pts</span>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={next ? `Progression vers ${next.name}` : "Grade maximal"}
      >
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-700"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {next ? (
          <>
            Encore <span className="text-foreground">{toNext} points</span> pour{" "}
            <span className={next.tone}>
              <RankEmoji rank={next} /> {next.name}
            </span>
          </>
        ) : (
          "Sommet du classement atteint."
        )}
      </p>

      {(peakRank || ratedGames !== undefined) && (
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          {ratedGames !== undefined && (
            <>
              {ratedGames} partie{ratedGames > 1 ? "s" : ""} classée{ratedGames > 1 ? "s" : ""}
            </>
          )}
          {ratedGames !== undefined && peakRank && " · "}
          {peakRank && (
            <>
              record : <RankEmoji rank={peakRank} /> {peakRank.name}
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** L'échelle complète, pour situer son grade parmi les autres. */
export function RankLadder({ rating }: { rating: number }) {
  const current = rankOf(rating);
  return (
    <ol className="mt-2 space-y-1">
      {RANKS.map((r) => (
        <li
          key={r.tier}
          className={cn(
            "flex items-center justify-between rounded-md px-2 py-1 text-xs",
            r.tier === current.tier
              ? "border border-gold/40 bg-gold/10 text-foreground"
              : "text-muted-foreground",
          )}
        >
          <span className={cn("flex items-center gap-2", r.tier === current.tier && r.tone)}>
            <RankEmoji rank={r} />
            {r.name}
          </span>
          <span>{r.tier === 1 ? "départ" : `${r.min} pts`}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Le classement après un champ : le grade atteint, ce qu'il a coûté ou
 * rapporté, et le changement de grade s'il y en a un.
 *
 * La variation vient du serveur, qui l'a inscrite sur la partie au moment du
 * règlement : elle dit donc exactement ce qui a été appliqué, plancher de cote
 * compris.
 */
export function RankOutcome({ rating, delta }: { rating: number; delta: number }) {
  const now = rankOf(rating);
  const before = rankOf(rating - delta);
  const monte = now.tier > before.tier;
  const descend = now.tier < before.tier;

  return (
    <p className="mt-1 text-xs">
      <span className={now.tone}>
        <RankEmoji rank={now} /> {now.name}
      </span>{" "}
      <span className="text-muted-foreground">{rating} pts</span>{" "}
      <span className={delta >= 0 ? "text-emerald-400" : "text-destructive"}>
        {delta >= 0 ? "+" : ""}
        {delta}
      </span>
      {monte && <span className="ml-1 text-gold">— grade gagné !</span>}
      {descend && (
        <span className="ml-1 text-destructive">
          — grade perdu, retour à <RankEmoji rank={before} /> {before.name}
        </span>
      )}
    </p>
  );
}

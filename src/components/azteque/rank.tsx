import { cn } from "@/lib/utils";
import {
  champsAvantClassement,
  CHAMPS_DE_PLACEMENT,
  estClasse,
  RANKS,
  rankOf,
  rankProgress,
  type Rank,
} from "@/lib/azteque/rank";

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
  ratedGames,
  compact = false,
  className,
}: {
  rating: number;
  /**
   * Champs classés joués. Omis, le grade s'affiche : mieux vaut un grade de
   * trop qu'effacer celui d'un joueur qui l'a gagné (voir `estClasse`).
   */
  ratedGames?: number | undefined;
  /** N'affiche que l'emblème, pour les emplacements étroits. */
  compact?: boolean;
  className?: string;
}) {
  // Le joueur en cours de placement n'a pas encore de grade à montrer. Sa cote
  // non plus n'est pas dite : la connaître sans le nombre de champs derrière
  // elle est précisément ce qui induisait en erreur.
  if (!estClasse(ratedGames)) {
    const reste = champsAvantClassement(ratedGames);
    return (
      <span
        title={`Non classé — encore ${reste} champ${reste > 1 ? "s" : ""} à jouer`}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-muted-foreground",
          className,
        )}
      >
        <span aria-hidden="true">⏳</span>
        {!compact && <span>Non classé</span>}
        <span className="sr-only">{compact ? "Non classé" : ""}</span>
      </span>
    );
  }

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

  // En cours de placement : la barre mesure le chemin vers le CLASSEMENT, pas
  // vers un grade suivant. Montrer une progression vers Novice à quelqu'un qui
  // n'a pas encore de grade promettrait ce qu'on ne tient pas.
  if (!estClasse(ratedGames)) {
    const joues = ratedGames ?? 0;
    const reste = champsAvantClassement(ratedGames);
    return (
      <div className={cn("rounded-lg border border-border bg-secondary/40 px-4 py-3", className)}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-display text-lg text-muted-foreground">⏳ Non classé</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {joues} / {CHAMPS_DE_PLACEMENT}
          </span>
        </div>

        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={CHAMPS_DE_PLACEMENT}
          aria-valuenow={joues}
          aria-label="Champs joués avant d'être classé"
        >
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-700"
            style={{ width: `${Math.round((joues / CHAMPS_DE_PLACEMENT) * 100)}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Encore <span className="text-foreground">{reste}</span> champ
          {reste > 1 ? "s" : ""} en ligne, et votre grade s'affiche.
        </p>
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Votre cote monte et descend déjà à chaque partie : ces premiers champs servent à la
          situer.
        </p>
      </div>
    );
  }

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
export function RankOutcome({
  rating,
  delta,
  ratedGames,
}: {
  rating: number;
  delta: number;
  ratedGames?: number | undefined;
}) {
  const now = rankOf(rating);
  const before = rankOf(rating - delta);
  const monte = now.tier > before.tier;
  const descend = now.tier < before.tier;

  // Encore en placement : la cote a bougé et on le montre — c'est ce qui rend
  // ces premiers champs intéressants — mais aucun grade n'est encore annoncé.
  if (!estClasse(ratedGames)) {
    const reste = champsAvantClassement(ratedGames);
    return (
      <p className="mt-1 text-xs">
        <span className="text-muted-foreground">⏳ Non classé · {rating} pts</span>{" "}
        <span className={delta >= 0 ? "text-emerald-400" : "text-destructive"}>
          {delta >= 0 ? "+" : ""}
          {delta}
        </span>
        <span className="ml-1 text-muted-foreground">
          — encore {reste} champ{reste > 1 ? "s" : ""} avant votre grade
        </span>
      </p>
    );
  }

  // Le champ qui vient de placer le joueur : son grade apparaît pour la
  // première fois, et ce n'est pas un grade « gagné » sur celui d'avant.
  const placeALInstant = ratedGames === CHAMPS_DE_PLACEMENT;

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
      {placeALInstant && <span className="ml-1 text-gold">— vous voilà classé !</span>}
      {!placeALInstant && monte && <span className="ml-1 text-gold">— grade gagné !</span>}
      {!placeALInstant && descend && (
        <span className="ml-1 text-destructive">
          — grade perdu, retour à <RankEmoji rank={before} /> {before.name}
        </span>
      )}
    </p>
  );
}

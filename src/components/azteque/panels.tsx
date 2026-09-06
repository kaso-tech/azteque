import { Bot, BookOpen, Settings2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABEL, type Difficulty, type PlayerIndex } from "@/lib/azteque/engine";
import { RankLadder, RankProgressCard } from "@/components/azteque/rank";

export interface Settings {
  trickDelay: number; // ms
  difficulty: Difficulty;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  trickDelay: 1000,
  difficulty: "normal",
  sound: true,
};

export const DIFFICULTIES: Difficulty[] = ["facile", "normal", "expert", "maitre", "legende"];

export const TOKEN_REWARDS: Record<Difficulty, number> = {
  facile: 50,
  normal: 100,
  expert: 150,
  maitre: 200,
  legende: 250,
};

export function ProfileButton({
  name,
  icon,
  align,
  onClick,
}: {
  name: string;
  icon: "player" | "ai";
  align: "left" | "center" | "right";
  onClick: () => void;
}) {
  const Icon = icon === "ai" ? Bot : UserRound;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        align === "left" && "justify-self-start",
        align === "right" && "justify-self-end",
      )}
      aria-label={`Ouvrir le profil ${name}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/45 bg-secondary text-gold shadow-[var(--shadow-card)] sm:h-12 sm:w-12">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="max-w-24 truncate text-[0.65rem] font-semibold text-foreground sm:max-w-36 sm:text-xs">
        {name}
      </span>
    </button>
  );
}

export function PlayerProfilePanel({
  playerName,
  tokens,
  onNameChange,
  nameLocked = false,
  rank = null,
  settings,
  onChange,
  onRules,
  onClose,
}: {
  playerName: string;
  tokens: number;
  onNameChange: (name: string) => void;
  /** Vrai quand le pseudo vient d'un compte : il ne se change pas d'ici. */
  nameLocked?: boolean;
  /** Classement du joueur, absent tant qu'aucun compte n'est ouvert. */
  rank?: { rating: number; peak: number; games: number } | null;
  settings: Settings;
  onChange: (s: Settings) => void;
  onRules: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
      onClick={onClose}
    >
      <div
        className="panel max-h-[90dvh] w-full max-w-md overflow-y-auto p-6 text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold/45 bg-secondary text-gold">
              <UserRound className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <h2 className="gold-text text-2xl">Votre profil</h2>
              <p className="text-xs text-muted-foreground">Nom et préférences de jeu</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Fermer">
            ×
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between rounded-lg border border-gold/40 bg-gold/5 px-4 py-2.5">
          <span className="text-sm text-foreground">Solde de jetons</span>
          <span className="font-display text-lg font-semibold text-gold">🪙 {tokens}</span>
        </div>

        <p className="mt-6 text-sm text-foreground">Classement</p>
        {rank ? (
          <>
            <RankProgressCard
              className="mt-2"
              rating={rank.rating}
              peak={rank.peak}
              ratedGames={rank.games}
            />
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Voir les dix grades
              </summary>
              <RankLadder rating={rank.rating} />
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                Seuls les champs joués en ligne comptent. Battre plus fort que soi rapporte
                beaucoup, battre plus faible presque rien ; perdre contre plus faible que soi coûte
                le maximum et peut faire retomber au grade inférieur.
              </p>
            </details>
          </>
        ) : (
          <p className="mt-2 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
            Connectez-vous pour être classé : votre grade se gagne sur les parties en ligne.
          </p>
        )}

        <label htmlFor="player-name" className="mt-6 block text-sm text-foreground">
          Nom d'utilisateur
        </label>
        <input
          id="player-name"
          value={playerName}
          maxLength={20}
          autoFocus={!nameLocked}
          readOnly={nameLocked}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={() => {
            if (!nameLocked && !playerName.trim()) onNameChange("Joueur");
          }}
          className={cn(
            "mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-gold focus:ring-1 focus:ring-ring",
            nameLocked && "cursor-not-allowed text-muted-foreground",
          )}
          placeholder="Votre nom"
        />
        {nameLocked && (
          <p className="mt-2 text-xs text-muted-foreground">
            C'est le pseudo de votre compte : il vous suit d'un appareil à l'autre et sert à vous
            trouver en ligne.
          </p>
        )}

        <p className="mt-6 text-sm text-foreground">Effets sonores</p>
        <div className="mt-2 flex gap-2">
          {[true, false].map((on) => (
            <Button
              key={String(on)}
              type="button"
              size="sm"
              variant={settings.sound === on ? "default" : "outline"}
              onClick={() => onChange({ ...settings, sound: on })}
            >
              {on ? "Activés" : "Coupés"}
            </Button>
          ))}
        </div>

        <p className="mt-6 text-sm text-foreground">
          Temps d'affichage du pli : {(settings.trickDelay / 1000).toFixed(1)} s
        </p>
        <input
          type="range"
          min={300}
          max={4000}
          step={100}
          value={settings.trickDelay}
          onChange={(event) => onChange({ ...settings, trickDelay: Number(event.target.value) })}
          className="mt-2 w-full accent-[var(--gold)]"
        />
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Les deux cartes restent visibles au milieu pendant ce temps.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onRules}>
            <BookOpen aria-hidden="true" /> Règles
          </Button>
          <Button type="button" onClick={onClose}>
            <Settings2 aria-hidden="true" /> Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AiProfilePanel({
  difficulty,
  onChange,
  onClose,
}: {
  difficulty: Difficulty;
  onChange: (difficulty: Difficulty) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-6 text-left"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold/45 bg-secondary text-gold">
            <Bot className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="gold-text truncate text-2xl">IA {DIFFICULTY_LABEL[difficulty]}</h2>
            <p className="text-xs text-muted-foreground">Choisir le niveau de l'adversaire</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DIFFICULTIES.map((level) => (
            <Button
              key={level}
              type="button"
              variant={difficulty === level ? "default" : "outline"}
              onClick={() => onChange(level)}
              className="w-full"
            >
              {DIFFICULTY_LABEL[level]}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-[0.68rem] text-muted-foreground">
          Changer de niveau relance la partie depuis le premier tour : la récompense en jetons
          dépend du niveau réellement affronté.
        </p>
        <Button type="button" onClick={onClose} className="mt-4 w-full">
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

export function Recap({
  title,
  s,
}: {
  title: string;
  s: { bonnes: number; comptes: number; main: number; total: number };
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-display text-sm text-gold">{title}</p>
      <p className="text-muted-foreground">Bonnes : {s.bonnes}</p>
      <p className="text-muted-foreground">Comptes : {s.comptes}</p>
      <p className="text-muted-foreground">Main : {s.main}</p>
      <p className="mt-1 font-semibold text-foreground">Total : {s.total}</p>
    </div>
  );
}

export function MeldHistoryPanel({
  entries,
  onClose,
}: {
  entries: { key: string; round: number; player: PlayerIndex; label: string; points: number }[];
  onClose: () => void;
}) {
  const totals = entries.reduce(
    (acc, e) => {
      acc[e.player] += e.points;
      return acc;
    },
    [0, 0] as [number, number],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="panel animate-banner max-h-[85dvh] w-full max-w-md overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="gold-text text-2xl">Historique des comptes</h2>
            <p className="text-xs text-muted-foreground">
              Vous {totals[0]} pts · Adversaire {totals[1]} pts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 text-lg text-gold"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Aucun compte annoncé pour le moment.</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-2">
            {entries.map((e) => (
              <li
                key={e.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span className="text-muted-foreground">Tour {e.round}</span>
                <span className={e.player === 0 ? "text-gold" : "text-foreground"}>
                  {e.player === 0 ? "Vous" : "Adversaire"}
                </span>
                <span className="flex-1 text-right text-muted-foreground">{e.label}</span>
                <span className="font-semibold text-foreground">+{e.points}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

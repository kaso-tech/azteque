import type { Ref } from "react";
import { useState } from "react";
import { Bot, BookOpen, Settings2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LABEL, type Difficulty, type PlayerIndex } from "@/lib/azteque/engine";
import { AccountIdentity, ReferralCard } from "@/components/azteque/account-panels";
import { PlayerAvatar, type AvatarSource } from "@/components/azteque/avatar";
import type { Profile } from "@/lib/azteque/account";
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

/**
 * Récompense d'une victoire contre l'IA.
 *
 * Ce barème n'est que le repli hors connexion : pour un joueur connecté, le
 * montant est décidé par la fonction serveur `award_ai_win`, seule à faire
 * foi. Les deux doivent rester d'accord.
 */
export const TOKEN_REWARDS: Record<Difficulty, number> = {
  facile: 20,
  normal: 40,
  expert: 60,
  maitre: 80,
  legende: 100,
};

export function ProfileButton({
  name,
  icon,
  align,
  account = null,
  onClick,
  innerRef,
}: {
  name: string;
  icon: "player" | "ai";
  align: "left" | "center" | "right";
  /** Pour un joueur connecté : son avatar remplace l'icône générique. */
  account?: AvatarSource | null;
  onClick: () => void;
  /** Cible des jetons qui rejoignent le compte (voir `CoinBurst`). */
  innerRef?: Ref<HTMLButtonElement>;
}) {
  const Icon = icon === "ai" ? Bot : UserRound;
  return (
    <button
      ref={innerRef}
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        align === "left" && "justify-self-start",
        align === "right" && "justify-self-end",
      )}
      aria-label={`Ouvrir le profil ${name}`}
    >
      {icon === "player" && account ? (
        <PlayerAvatar className="h-11 w-11 sm:h-12 sm:w-12" profile={account} />
      ) : (
        <span className="gold-ring grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary text-gold sm:h-12 sm:w-12">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <span className="max-w-24 truncate text-[0.65rem] font-semibold text-foreground sm:max-w-36 sm:text-xs">
        {name}
      </span>
    </button>
  );
}

/**
 * Cadeau du jour, proposé à l'ouverture.
 *
 * Le versement est demandé au moment du clic, jamais à l'affichage : c'est le
 * joueur qui déclenche, et le montant réellement versé — décidé par le serveur
 * quand un compte est ouvert — est celui qui s'affiche ensuite.
 */
export function DailyBonusPanel({
  amount,
  onCollect,
  onClose,
}: {
  amount: number;
  /** Verse le cadeau et rend le nouveau solde, ou `null` s'il était déjà pris. */
  onCollect: () => Promise<number | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [missed, setMissed] = useState(false);

  const collect = () => {
    if (busy) return;
    setBusy(true);
    onCollect()
      .then((solde) => {
        if (solde === null) setMissed(true);
        else setDone(solde);
      })
      .catch(() => setMissed(true))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
      <div className="panel w-full max-w-xs px-6 py-7 text-center">
        <span className="text-5xl" aria-hidden="true">
          🎁
        </span>
        <h2 className="gold-text mt-3 text-2xl">
          {done !== null ? "Cadeau reçu" : "Cadeau du jour"}
        </h2>

        {done !== null ? (
          <>
            <p className="mt-2 font-display text-3xl font-semibold text-gold">+{amount} 🪙</p>
            <p className="mt-1 text-sm text-muted-foreground">Nouveau solde : {done} jetons</p>
            <Button className="mt-5 w-full font-semibold" onClick={onClose}>
              Continuer
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-3xl font-semibold text-gold">{amount} 🪙</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Offerts chaque jour, à l'ouverture du jeu.
            </p>
            <Button className="mt-5 w-full font-semibold" disabled={busy} onClick={collect}>
              {busy ? "…" : "Collecter"}
            </Button>
            {missed && (
              <p className="mt-2 text-xs text-muted-foreground">
                Cadeau déjà pris aujourd'hui. À demain !
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-xs text-muted-foreground underline"
            >
              Plus tard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function PlayerProfilePanel({
  playerName,
  tokens,
  onNameChange,
  account = null,
  onAccountChange,
  rank = null,
  settings,
  onChange,
  onRules,
  onClose,
}: {
  playerName: string;
  tokens: number;
  onNameChange: (name: string) => void;
  /** Le compte ouvert, s'il y en a un : c'est lui qui porte l'identité. */
  account?: Profile | null;
  /** Reçoit le profil mis à jour après un renommage ou un changement d'avatar. */
  onAccountChange?: (p: Profile) => void;
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
            <PlayerAvatar className="h-12 w-12" profile={account} />
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

        {/* Le parrainage suppose un compte : sans lui, il n'y a ni code à
            partager ni solde où verser la récompense. */}
        {account && <ReferralCard />}

        {account && onAccountChange ? (
          <AccountIdentity profile={account} onChange={onAccountChange} />
        ) : (
          <>
            <label htmlFor="player-name" className="mt-6 block text-sm text-foreground">
              Nom d'utilisateur
            </label>
            <input
              id="player-name"
              value={playerName}
              maxLength={20}
              autoFocus
              onChange={(event) => onNameChange(event.target.value)}
              onBlur={() => {
                if (!playerName.trim()) onNameChange("Joueur");
              }}
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-gold focus:ring-1 focus:ring-ring"
              placeholder="Votre nom"
            />
          </>
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
          <span className="gold-ring grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary text-gold">
            <Bot className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="gold-text truncate text-2xl">IA {DIFFICULTY_LABEL[difficulty]}</h2>
            <p className="text-xs text-muted-foreground">Choisir le niveau de l'adversaire</p>
          </div>
        </div>
        {/* Une seule colonne, du plus fort au plus faible : la liste se lit
            comme une échelle, et la récompense justifie la marche. */}
        <div className="mt-6 flex flex-col gap-2">
          {[...DIFFICULTIES].reverse().map((level) => (
            <Button
              key={level}
              type="button"
              variant={difficulty === level ? "default" : "outline"}
              onClick={() => onChange(level)}
              className="flex w-full items-center justify-between gap-3"
            >
              <span>{DIFFICULTY_LABEL[level]}</span>
              <span className="text-xs font-semibold tabular-nums">
                🪙 {TOKEN_REWARDS[level]} jetons
              </span>
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

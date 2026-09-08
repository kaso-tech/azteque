import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { RankBadge } from "@/components/azteque/rank";
import { rankOf } from "@/lib/azteque/rank";
import { describeError } from "@/lib/azteque/account";
import { estEnLigne, type AdminPlayer } from "@/lib/azteque/admin";
import {
  adminPlayerDetail,
  type PlayerDetail,
  type PlayerRecentMatch,
  type PlayerRatingPoint,
} from "@/lib/azteque/admin-player-detail";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Le peu de pays qu'on nomme en toutes lettres ; les autres gardent leur code. */
const PAYS: Record<string, string> = {
  CI: "Côte d'Ivoire",
  TG: "Togo",
  BJ: "Bénin",
  BF: "Burkina Faso",
  GH: "Ghana",
  ML: "Mali",
  NE: "Niger",
  NG: "Nigéria",
  SN: "Sénégal",
  CM: "Cameroun",
  GN: "Guinée",
  FR: "France",
  BE: "Belgique",
  CA: "Canada",
  US: "États-Unis",
};

function drapeau(code: string | null): string {
  if (!code) return "🌍";
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Tiroir latéral : la fiche détaillée d'un joueur.
 *
 * S'ouvre au clic sur une ligne du tableau Joueurs. Affiche l'identité,
 * les chiffres clés, la courbe de cote, l'historique récent et des
 * actions rapides. Les actions lentes (jetons, ban, admin) restent
 * sur le tableau — le tiroir sert à voir, pas à tout faire.
 */
export function PlayerSheet({
  player,
  open,
  onOpenChange,
}: {
  player: AdminPlayer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!player || !open) {
      setDetail(null);
      setErreur(null);
      return;
    }
    setBusy(true);
    setErreur(null);
    adminPlayerDetail(player.id)
      .then(setDetail)
      .catch((e: unknown) => setErreur(describeError(e, "Détails indisponibles.")))
      .finally(() => setBusy(false));
  }, [player, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        {player ? (
          <>
            <SheetHeader className="border-b border-border p-4">
              <div className="flex items-center gap-3">
                <PlayerAvatar
                  className="h-12 w-12"
                  profile={player}
                />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="flex items-center gap-2 font-display text-lg">
                    <span className="truncate">{player.username}</span>
                    {player.is_admin && (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Admin
                      </span>
                    )}
                    {player.banned && (
                      <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                        Suspendu
                      </span>
                    )}
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {[player.first_name, player.last_name].filter(Boolean).join(" ") ||
                      "Identité non renseignée"}
                    {player.country ? ` · ${drapeau(player.country)} ${PAYS[player.country] ?? player.country}` : ""}
                    {player.created_at ? ` · Inscrit le ${formatDate(player.created_at)}` : ""}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4">
              {erreur && (
                <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {erreur}
                </p>
              )}

              {/* Chiffres clés */}
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Cote" value={String(player.rating)} highlight />
                <Mini label="Grade" value={rankOf(player.rating).name} />
                <Mini label="Parties" value={String(player.rated_games)} />
                <Mini label="Jetons" value={`🪙 ${player.tokens.toLocaleString("fr")}`} />
              </div>

              <RankBadge rating={player.rating} />

              {/* Présence */}
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    estEnLigne(player)
                      ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153_/_0.7)]"
                      : "bg-muted-foreground/40",
                  )}
                />
                {estEnLigne(player) ? "En ligne" : vuIlYA(player.last_seen_at)}
                <span className="mx-2">·</span>
                {player.purchases} achat{player.purchases > 1 ? "s" : ""}
                <span className="mx-2">·</span>
                {player.rounds_played} tours joués
              </div>

              {/* Courbe de cote */}
              <section className="mt-4 rounded-lg border border-border p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    Évolution de la cote
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    60 derniers jours
                  </p>
                </div>
                {busy && !detail ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Chargement…
                  </p>
                ) : (
                  <CourbeCote points={detail?.rating_series ?? []} />
                )}
              </section>

              {/* Dernières parties */}
              <section className="mt-4">
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Dernières parties
                </p>
                {busy && !detail ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Chargement…
                  </p>
                ) : detail && detail.recent.length > 0 ? (
                  <ul className="space-y-1.5">
                    {detail.recent.map((m) => (
                      <LignePartie key={m.id} match={m} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Aucune partie terminée.
                  </p>
                )}
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
              <Button size="sm" className="font-semibold">
                📩 Envoyer un message
              </Button>
              <Button size="sm" variant="outline">
                🎁 Offrir un article
              </Button>
              <Button size="sm" variant="outline">
                {player.banned ? "Rétablir" : "Suspendre"}
              </Button>
              <Button size="sm" variant="outline">
                {player.is_admin ? "Révoquer admin" : "Nommer admin"}
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "font-display text-base",
          highlight ? "gold-text" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function LignePartie({ match }: { match: PlayerRecentMatch }) {
  const ok = match.result === "gagne";
  const nul = match.result === "nul";
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-card/30 px-3 py-2 text-xs">
      <div className="flex-1 min-w-0">
        <p className="truncate text-foreground">
          <span className="font-semibold">vs {match.opponent}</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="font-mono">{match.score}</span>
        </p>
        <p className="text-[10px] text-muted-foreground">
          {formatDateTime(match.finished_at)}
        </p>
      </div>
      <span
        className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
          ok && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
          !ok && !nul && "border-destructive/30 bg-destructive/10 text-destructive",
          nul && "border-border bg-card text-muted-foreground",
        )}
      >
        {ok ? "Gagné" : nul ? "Nul" : "Perdu"}
      </span>
      <span
        className={cn(
          "w-12 text-right font-mono",
          match.rating_delta > 0 && "text-success",
          match.rating_delta < 0 && "text-destructive",
          match.rating_delta === 0 && "text-muted-foreground",
        )}
      >
        {match.rating_delta > 0 ? "+" : ""}
        {match.rating_delta}
      </span>
    </li>
  );
}

function CourbeCote({ points }: { points: PlayerRatingPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-muted-foreground">
        Pas encore d'historique de cote.
      </p>
    );
  }
  const w = 460;
  const h = 100;
  const padX = 8;
  const padY = 12;
  const minR = Math.min(...points.map((p) => p.rating));
  const maxR = Math.max(...points.map((p) => p.rating));
  const range = Math.max(1, maxR - minR);
  const stepX = points.length > 1 ? (w - 2 * padX) / (points.length - 1) : 0;
  const yFor = (v: number) => h - padY - ((v - minR) / range) * (h - 2 * padY);

  const linePts = points
    .map((p, i) => `${padX + i * stepX},${yFor(p.rating)}`)
    .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
      >
        <polyline
          fill="rgba(212,168,87,0.10)"
          stroke="none"
          points={`${padX},${h - padY} ${linePts} ${padX + (points.length - 1) * stepX},${h - padY}`}
        />
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth={1.5}
          points={linePts}
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{minR}</span>
        <span className="font-mono">{maxR - minR > 0 ? `+${maxR - minR}` : "—"}</span>
        <span>{maxR}</span>
      </div>
    </div>
  );
}

function vuIlYA(iso: string | null): string {
  if (!iso) return "jamais vu";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `vu il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `vu il y a ${heures} h`;
  return `vu il y a ${Math.floor(heures / 24)} j`;
}

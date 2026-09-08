import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/azteque/account";
import {
  adminDashboardSeries,
  adminDashboardStats,
  adminDashboardTopCountries,
  adminDashboardTopPlayers,
  type DashboardSeriesPoint,
  type DashboardStats,
  type DashboardTopCountry,
  type DashboardTopPlayer,
} from "@/lib/azteque/admin-dashboard";
import { rankOf } from "@/lib/azteque/rank";
import { PlayerAvatar } from "@/components/azteque/avatar";

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

function formatNombre(n: number): string {
  return n.toLocaleString("fr");
}

function formatDelta(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "±0%";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`;
}

/**
 * Le tableau de bord de la console d'administration.
 *
 * Tout ce qui s'affiche ici est lu en quatre appels — un par fonction
 * `admin_dashboard_*`. La page ne calcule rien elle-même : la base sait
 * compter, et c'est là-bas que les chiffres ont du sens.
 */
export function Dashboard({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [series, setSeries] = useState<DashboardSeriesPoint[]>([]);
  const [pays, setPays] = useState<DashboardTopCountry[]>([]);
  const [joueurs, setJoueurs] = useState<DashboardTopPlayer[]>([]);
  const [periode, setPeriode] = useState<7 | 14 | 30>(7);
  const [busy, setBusy] = useState(false);

  const rafraichir = async () => {
    setBusy(true);
    onErreur(null);
    try {
      const [s, ser, p, j] = await Promise.all([
        adminDashboardStats(),
        adminDashboardSeries(periode),
        adminDashboardTopCountries(5),
        adminDashboardTopPlayers(5),
      ]);
      setStats(s);
      setSeries(ser);
      setPays(p);
      setJoueurs(j);
    } catch (e: unknown) {
      onErreur(describeError(e, "Impossible de charger le tableau de bord."));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void rafraichir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periode]);

  const maxPays = useMemo(
    () => Math.max(1, ...pays.map((p) => p.joueurs)),
    [pays],
  );

  const maxSeries = useMemo(
    () => Math.max(1, ...series.map((p) => p.parties)),
    [series],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl gold-text">Vue d'ensemble</h1>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            {([7, 14, 30] as const).map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setPeriode(j)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  periode === j
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent",
                )}
              >
                {j} j
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void rafraichir()}
            disabled={busy}
          >
            {busy ? "…" : "↻ Rafraîchir"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Joueurs actifs (24h)"
          value={stats ? formatNombre(stats.active_24h) : "—"}
          delta={stats?.active_24h_delta ?? null}
        />
        <Kpi
          label="Parties terminées (24h)"
          value={stats ? formatNombre(stats.matches_24h) : "—"}
          delta={stats?.matches_24h_delta ?? null}
        />
        <Kpi
          label="Jetons en circulation"
          value={stats ? formatNombre(stats.tokens_circulation) : "—"}
        />
        <Kpi
          label="Revenu boutique (7j)"
          value={stats ? `🪙 ${formatNombre(stats.revenue_7d)}` : "—"}
        />
      </div>

      {/* Graphique d'activité */}
      <div className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-lg gold-text">Activité</p>
            <p className="text-xs text-muted-foreground">
              Parties jouées et nouveaux comptes par jour
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">Parties</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-info" />
              <span className="text-muted-foreground">Nouveaux</span>
            </span>
          </div>
        </div>
        <Sparkline series={series} maxValue={maxSeries} />
      </div>

      {/* Deux colonnes : top pays + top joueurs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-lg gold-text">Top pays</p>
            <span className="text-xs text-muted-foreground">5</span>
          </div>
          {pays.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun joueur n'a encore renseigné son pays.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {pays.map((p) => (
                <li key={p.country}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>
                      <span className="mr-2">{drapeau(p.country)}</span>
                      <span>{PAYS[p.country] ?? p.country}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {formatNombre(p.joueurs)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                      style={{ width: `${(p.joueurs / maxPays) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-lg gold-text">Top joueurs (7j)</p>
            <Link
              to="/admin"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Tout voir →
            </Link>
          </div>
          {joueurs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune partie terminée sur les 7 derniers jours.
            </p>
          ) : (
            <ul className="space-y-2">
              {joueurs.map((j) => {
                const r = rankOf(j.rating);
                return (
                  <li
                    key={j.user_id}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent"
                  >
                    <PlayerAvatar
                      className="h-9 w-9"
                      profile={{
                        username: j.username,
                        avatar_kind: "google",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {j.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {j.country ? `${drapeau(j.country)} ${PAYS[j.country] ?? j.country}` : "—"}
                        {" · "}
                        {j.parties} partie{j.parties > 1 ? "s" : ""} · {r.name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "font-display text-sm font-semibold",
                          j.delta > 0 ? "text-success" : j.delta < 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {j.delta > 0 ? "+" : ""}
                        {j.delta}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        cote
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Alerte bas de page : parties bloquées */}
      {stats && stats.stuck_matches > 0 && (
        <div className="panel border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-destructive/20 text-base">
              ⚠️
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {stats.stuck_matches} partie{stats.stuck_matches > 1 ? "s" : ""} non terminée
                {stats.stuck_matches > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Commencées depuis plus d'une heure et jamais réglées. À inspecter depuis l'onglet
                Parties (à venir).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="panel p-4">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl gold-text">{value}</p>
      {delta !== undefined && delta !== null && (
        <p
          className={cn(
            "mt-1 text-xs",
            delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {formatDelta(delta)} vs veille
        </p>
      )}
    </div>
  );
}

function Sparkline({
  series,
  maxValue,
}: {
  series: DashboardSeriesPoint[];
  maxValue: number;
}) {
  if (series.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Pas encore d'activité sur cette période.
      </p>
    );
  }
  const w = 800;
  const h = 160;
  const padX = 16;
  const padY = 16;
  const stepX = series.length > 1 ? (w - 2 * padX) / (series.length - 1) : 0;
  const yFor = (v: number) => h - padY - (v / maxValue) * (h - 2 * padY);

  const pointsParties = series.map((p, i) => `${padX + i * stepX},${yFor(p.parties)}`).join(" ");
  const pointsNouveaux = series.map((p, i) => `${padX + i * stepX},${yFor(p.nouveaux_joueurs)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full min-w-[480px]" preserveAspectRatio="none">
        {/* Grille horizontale */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={padX}
            x2={w - padX}
            y1={h - padY - t * (h - 2 * padY)}
            y2={h - padY - t * (h - 2 * padY)}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="2 4"
            strokeWidth={0.5}
          />
        ))}
        {/* Aire sous la courbe des parties */}
        <polyline
          fill="rgba(212,168,87,0.12)"
          stroke="none"
          points={`${padX},${h - padY} ${pointsParties} ${padX + (series.length - 1) * stepX},${h - padY}`}
        />
        {/* Courbe nouveaux joueurs (info) */}
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-info"
          strokeWidth={1.5}
          points={pointsNouveaux}
        />
        {/* Courbe parties (primary) */}
        <polyline
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth={2}
          points={pointsParties}
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {series.map((p, i) => (
          <span key={p.jour} className={i % Math.ceil(series.length / 7) === 0 ? "" : "invisible"}>
            {new Date(p.jour).toLocaleDateString("fr", { day: "numeric", month: "short" })}
          </span>
        ))}
      </div>
    </div>
  );
}

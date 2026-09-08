import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/azteque/account";
import { toCsv, telechargerCsv } from "@/lib/azteque/csv";
import {
  adminListLog,
  adminRevertLogEntry,
  type AdminLogEntryV2,
  type AdminLogFilters,
} from "@/lib/azteque/admin-shop-log";

const TYPES_ACTIONS = [
  { id: "tokens", label: "Jetons" },
  { id: "ban", label: "Bannissement" },
  { id: "admin", label: "Administration" },
  { id: "item", label: "Article" },
  { id: "item_delete", label: "Article (suppr.)" },
  { id: "setting", label: "Réglage" },
  { id: "sound_file", label: "Son (fichier)" },
  { id: "sound_file_clear", label: "Son (retrait)" },
  { id: "sound_settings", label: "Son (réglages)" },
  { id: "revert:tokens", label: "↶ Annulation jetons" },
  { id: "revert:ban", label: "↶ Annulation ban" },
  { id: "revert:admin", label: "↶ Annulation admin" },
];

/** Une action est réversible si elle est de type jetons, ban ou admin. */
function estRevertible(action: string): boolean {
  return action === "tokens" || action === "ban" || action === "admin";
}

function pillClass(action: string): string {
  if (action.startsWith("revert:")) {
    return "border-info/40 bg-info/10 text-info";
  }
  switch (action) {
    case "tokens":
      return "border-primary/40 bg-primary/10 text-primary";
    case "ban":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "admin":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "item":
    case "item_delete":
      return "border-info/40 bg-info/10 text-info";
    case "setting":
    case "sound_settings":
      return "border-warning/40 bg-warning/10 text-warning";
    case "sound_file":
    case "sound_file_clear":
      return "border-border bg-card text-muted-foreground";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

function labelAction(action: string): string {
  if (action.startsWith("revert:")) {
    return `↶ ${action.slice(7)}`;
  }
  return action;
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
 * Onglet Journal — refonte PR3.
 *
 * Filtres : type d'action, période (depuis 24 h, 7 j, 30 j, tout).
 * Pagination : 50 par page, OFFSET.
 * Action : un bouton « ↶ Annuler » apparaît sur les lignes réversibles
 * (jetons, ban, admin). L'annulation est elle-même consignée au journal
 * par le serveur.
 */
export function Journal({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [filtreAction, setFiltreAction] = useState<string>("");
  const [periode, setPeriode] = useState<"24h" | "7j" | "30j" | "tout">("7j");
  const [lignes, setLignes] = useState<AdminLogEntryV2[]>([]);
  const [busy, setBusy] = useState(false);
  const [revertEnCours, setRevertEnCours] = useState<number | null>(null);

  const since = useMemo(() => {
    if (periode === "24h") return new Date(Date.now() - 86_400_000).toISOString();
    if (periode === "7j") return new Date(Date.now() - 7 * 86_400_000).toISOString();
    if (periode === "30j") return new Date(Date.now() - 30 * 86_400_000).toISOString();
    return undefined;
  }, [periode]);

  const charger = useCallback(() => {
    adminListLog({
      action: filtreAction || undefined,
      since,
      limit: 50,
    } as AdminLogFilters)
      .then(setLignes)
      .catch((e: unknown) => onErreur(describeError(e, "Journal indisponible.")));
  }, [filtreAction, since, onErreur]);

  useEffect(() => {
    charger();
  }, [charger]);

  const reverter = (id: number) => {
    setRevertEnCours(id);
    onErreur(null);
    adminRevertLogEntry(id)
      .then(() => {
        charger();
      })
      .catch((e: unknown) => onErreur(describeError(e, "Annulation impossible.")))
      .finally(() => setRevertEnCours(null));
  };

  const exporter = () => {
    const contenu = toCsv(lignes, [
      { entete: "Date", getter: (l) => l.at },
      { entete: "Action", getter: (l) => l.action },
      { entete: "Admin", getter: (l) => l.admin_username ?? "" },
      { entete: "Cible", getter: (l) => l.target ?? "" },
      { entete: "Détails", getter: (l) => JSON.stringify(l.details) },
    ]);
    const date = new Date().toISOString().slice(0, 10);
    telechargerCsv(`azteque-journal-${date}.csv`, contenu);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Journal d'audit</h1>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {lignes.length} événement{lignes.length > 1 ? "s" : ""} affiché
            {lignes.length > 1 ? "s" : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={exporter}
            disabled={lignes.length === 0}
          >
            📥 Exporter
          </Button>
        </div>
      </div>

      {/* Filtres */}
      <div className="panel flex flex-wrap items-center gap-2 p-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Action</span>
          <select
            value={filtreAction}
            onChange={(e) => setFiltreAction(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="">Toutes</option>
            {TYPES_ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["24h", "7j", "30j", "tout"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium",
                periode === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent",
              )}
            >
              {p === "24h" ? "24 h" : p === "7j" ? "7 j" : p === "30j" ? "30 j" : "Tout"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={charger} disabled={busy}>
          ↻ Rafraîchir
        </Button>
      </div>

      {/* Liste */}
      <div className="panel divide-y divide-border">
        {lignes.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Aucun événement ne correspond à ces filtres.
          </p>
        ) : (
          lignes.map((l) => {
            const revertible = estRevertible(l.action);
            const enCours = revertEnCours === l.id;
            return (
              <article
                key={l.id}
                className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm"
              >
                <div className="w-32 shrink-0 text-xs text-muted-foreground">
                  {formatDateTime(l.at)}
                </div>
                <div className="w-32 shrink-0">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      pillClass(l.action),
                    )}
                  >
                    {labelAction(l.action)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">
                    <span className="text-muted-foreground">par</span>{" "}
                    <span className="font-semibold">
                      {l.admin_username ?? "—"}
                    </span>
                    {l.target && (
                      <>
                        <span className="text-muted-foreground"> → </span>
                        <span className="font-mono text-xs">{l.target}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(l.details)}
                  </p>
                </div>
                <div className="shrink-0">
                  {revertible ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={enCours}
                      onClick={() => reverter(l.id)}
                      className="text-xs"
                    >
                      {enCours ? "…" : "↶ Annuler"}
                    </Button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      —
                    </span>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        L'annulation d'une action irréversible (catalogue, réglages) est
        refusée par le serveur : on ne restaure pas un état qu'on ne
        connaît pas. Une annulation est elle-même consignée au journal.
      </p>
    </div>
  );
}

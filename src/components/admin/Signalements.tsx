import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { describeError } from "@/lib/azteque/account";
import {
  adminListReports,
  adminResolveReport,
  type AdminReport,
  type ReportStatus,
} from "@/lib/azteque/admin-reports";

const FILTRES_STATUT: { id: "all" | ReportStatus; label: string }[] = [
  { id: "open", label: "À traiter" },
  { id: "resolved", label: "Résolus" },
  { id: "dismissed", label: "Rejetés" },
  { id: "all", label: "Tous" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pillClass(s: ReportStatus): string {
  switch (s) {
    case "open":
      return "border-warning/40 bg-warning/10 text-warning";
    case "resolved":
      return "border-success/40 bg-success/10 text-success";
    case "dismissed":
      return "border-border bg-card text-muted-foreground";
  }
}

function labelStatut(s: ReportStatus): string {
  switch (s) {
    case "open":
      return "À traiter";
    case "resolved":
      return "Résolu";
    case "dismissed":
      return "Rejeté";
  }
}

/**
 * Onglet Signalements — file de modération.
 *
 * PR6 : la file liste tous les signalements, filtre par statut, et
 * permet à l'administrateur de prendre une décision (résoudre ou
 * rejeter) via un tiroir latéral. Le bannissement du joueur cible
 * reste une action séparée, déclenchée depuis la fiche joueur.
 */
export function Signalements({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [filtreStatut, setFiltreStatut] = useState<"all" | ReportStatus>("open");
  const [liste, setListe] = useState<AdminReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectionne, setSelectionne] = useState<AdminReport | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const charger = useCallback(() => {
    setBusy(true);
    adminListReports({
      status: filtreStatut === "all" ? undefined : filtreStatut,
      limit: 100,
    })
      .then(setListe)
      .catch((e: unknown) => onErreur(describeError(e, "Liste indisponible.")))
      .finally(() => setBusy(false));
  }, [filtreStatut, onErreur]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ouverts = useMemo(() => liste.filter((r) => r.status === "open").length, [liste]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Signalements</h1>
        <p className="text-xs text-muted-foreground">
          {liste.length} signalement{liste.length > 1 ? "s" : ""} ·{" "}
          <span className={cn(ouverts > 0 ? "text-warning" : "text-muted-foreground")}>
            {ouverts} à traiter
          </span>
        </p>
      </div>

      {/* Filtres */}
      <div className="panel flex flex-wrap items-center gap-2 p-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {FILTRES_STATUT.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltreStatut(f.id)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                filtreStatut === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={charger} disabled={busy}>
          {busy ? "…" : "↻ Rafraîchir"}
        </Button>
      </div>

      {/* Liste */}
      <div className="panel divide-y divide-border">
        {liste.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            Aucun signalement ne correspond à ce filtre.
          </p>
        ) : (
          liste.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setSelectionne(r);
                setSheetOpen(true);
              }}
              className="flex w-full flex-col items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-sidebar-accent/50"
            >
              <div className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    pillClass(r.status),
                  )}
                >
                  {labelStatut(r.status)}
                </span>
                <span className="font-mono text-xs text-muted-foreground">#{r.id}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </span>
                <div className="flex-1" />
                {r.target_banned && (
                  <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    Suspendu
                  </span>
                )}
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">par</span>{" "}
                <span className="font-semibold">{r.reporter_username ?? "—"}</span>
                <span className="text-muted-foreground"> contre </span>
                <span className="font-semibold">{r.target_username ?? "—"}</span>
                <span className="text-muted-foreground"> · </span>
                <span>{r.reason}</span>
              </p>
              {r.details && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{r.details}</p>
              )}
            </button>
          ))
        )}
      </div>

      <ReportSheet
        report={selectionne}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onAction={() => {
          setSheetOpen(false);
          charger();
        }}
        onErreur={onErreur}
      />
    </div>
  );
}

function ReportSheet({
  report,
  open,
  onOpenChange,
  onAction,
  onErreur,
}: {
  report: AdminReport | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAction: () => void;
  onErreur: (e: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setNote("");
  }, [open, report?.id]);

  if (!report) return null;

  const peutDecider = report.status === "open";

  const agir = (decision: "resolved" | "dismissed") => {
    setBusy(true);
    onErreur(null);
    adminResolveReport(report.id, decision, note)
      .then(() => onAction())
      .catch((e: unknown) => onErreur(describeError(e, "Décision impossible.")))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2 font-display text-lg">
            Signalement #{report.id}
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                pillClass(report.status),
              )}
            >
              {labelStatut(report.status)}
            </span>
          </SheetTitle>
          <SheetDescription>
            Créé le {formatDateTime(report.created_at)}
            {report.resolved_at && ` · traité le ${formatDateTime(report.resolved_at)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="rounded-md border border-border bg-card/40 p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Auteur :</span>{" "}
              <span className="font-semibold">{report.reporter_username ?? "—"}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Cible :</span>{" "}
              <span className="font-semibold">{report.target_username ?? "—"}</span>
              {report.target_banned && (
                <span className="ml-2 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                  Suspendu
                </span>
              )}
            </p>
          </div>

          <div className="rounded-md border border-border bg-card/40 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Motif
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">{report.reason}</p>
            {report.details && (
              <>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Détails
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {report.details}
                </p>
              </>
            )}
          </div>

          {report.resolution_note && (
            <div className="rounded-md border border-border bg-card/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Note de résolution
              </p>
              <p className="mt-1 text-sm text-foreground">{report.resolution_note}</p>
            </div>
          )}

          {peutDecider && (
            <div>
              <label className="block text-xs text-muted-foreground">
                Note administrative (consignée au journal)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Constat, action prise, renvoi vers une autre équipe…"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          {peutDecider ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => agir("resolved")}
                className="font-semibold"
              >
                ✓ Résoudre
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => agir("dismissed")}
              >
                Rejeter
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ce signalement a déjà été traité.
            </p>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
  adminListMatches,
  adminMatchForfeit,
  adminMatchVoid,
  type AdminMatchRow,
  type MatchStatusFilter,
} from "@/lib/azteque/admin-matches";

const FILTRES_STATUT: { id: MatchStatusFilter; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "playing", label: "En cours" },
  { id: "waiting", label: "En attente" },
  { id: "settled", label: "Terminées" },
  { id: "finished", label: "Réglées" },
];

function pillStatut(s: AdminMatchRow["status"]): { label: string; cls: string } {
  switch (s) {
    case "playing":
      return { label: "En cours", cls: "border-info/40 bg-info/10 text-info" };
    case "waiting":
      return { label: "En attente", cls: "border-warning/40 bg-warning/10 text-warning" };
    case "finished":
      return { label: "Réglée", cls: "border-success/40 bg-success/10 text-success" };
    case "settled":
      return { label: "Terminée", cls: "border-primary/40 bg-primary/10 text-primary" };
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Onglet Parties — historique et gestion des litiges.
 *
 * PR5 : tableau dense avec filtres (statut, période, recherche joueur)
 * + tiroir latéral d'action (annuler / forfait) pour les parties
 * litigieuses. Les actions appellent les RPC `admin_match_void` et
 * `admin_match_forfeit`, qui valident côté serveur et consignent au
 * journal d'audit.
 */
export function Parties({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [filtreStatut, setFiltreStatut] = useState<MatchStatusFilter>("all");
  const [periode, setPeriode] = useState<"24h" | "7j" | "30j" | "tout">("7j");
  const [recherche, setRecherche] = useState("");
  const [liste, setListe] = useState<AdminMatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectionnee, setSelectionnee] = useState<AdminMatchRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const since = useMemo(() => {
    if (periode === "24h") return new Date(Date.now() - 86_400_000).toISOString();
    if (periode === "7j") return new Date(Date.now() - 7 * 86_400_000).toISOString();
    if (periode === "30j") return new Date(Date.now() - 30 * 86_400_000).toISOString();
    return undefined;
  }, [periode]);

  const charger = useCallback(() => {
    setBusy(true);
    adminListMatches({
      status: filtreStatut,
      since,
      limit: 100,
    })
      .then(setListe)
      .catch((e: unknown) => onErreur(describeError(e, "Liste indisponible.")))
      .finally(() => setBusy(false));
  }, [filtreStatut, since, onErreur]);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtres = useMemo(() => {
    if (!recherche.trim()) return liste;
    const q = recherche.toLowerCase();
    return liste.filter((m) => {
      return (
        m.code.toLowerCase().includes(q) ||
        (m.host_username ?? "").toLowerCase().includes(q) ||
        (m.guest_username ?? "").toLowerCase().includes(q)
      );
    });
  }, [liste, recherche]);

  const ouvrirFiche = (m: AdminMatchRow) => {
    setSelectionnee(m);
    setSheetOpen(true);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Parties</h1>
        <p className="text-xs text-muted-foreground">
          {filtres.length} partie{filtres.length > 1 ? "s" : ""} affichée
          {filtres.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Filtres */}
      <div className="panel flex flex-wrap items-center gap-2 p-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="🔍 Code, joueur…"
          className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value as MatchStatusFilter)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
        >
          {FILTRES_STATUT.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
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
          {busy ? "…" : "↻ Rafraîchir"}
        </Button>
      </div>

      {/* Tableau */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Hôte</th>
                <th className="px-3 py-2 text-center">Score</th>
                <th className="px-3 py-2 text-left">Invité</th>
                <th className="px-3 py-2 text-right">Δ Hôte</th>
                <th className="px-3 py-2 text-right">Δ Invité</th>
                <th className="px-3 py-2 text-right">Mise</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-left">Terminée</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtres.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    Aucune partie ne correspond à ces filtres.
                  </td>
                </tr>
              ) : (
                filtres.map((m) => {
                  const ps = pillStatut(m.status);
                  const hostGagne = m.winner_id === m.host_id;
                  const guestGagne = m.winner_id === m.guest_id;
                  return (
                    <tr
                      key={m.id}
                      className="cursor-pointer border-t border-border/50 transition-colors hover:bg-sidebar-accent/50"
                      onClick={() => ouvrirFiche(m)}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {m.code}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "font-semibold",
                            hostGagne && "text-success",
                            guestGagne && "text-muted-foreground",
                          )}
                        >
                          {m.host_username ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-foreground">
                        {m.rounds_host} – {m.rounds_guest}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "font-semibold",
                            guestGagne && "text-success",
                            hostGagne && "text-muted-foreground",
                          )}
                        >
                          {m.guest_username ?? "(en attente)"}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono",
                          m.rating_delta_host > 0
                            ? "text-success"
                            : m.rating_delta_host < 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {m.rating_delta_host > 0 ? "+" : ""}
                        {m.rating_delta_host || 0}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-mono",
                          m.rating_delta_guest > 0
                            ? "text-success"
                            : m.rating_delta_guest < 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {m.rating_delta_guest > 0 ? "+" : ""}
                        {m.rating_delta_guest || 0}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {m.bet_amount > 0 ? `🪙 ${m.bet_amount}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            ps.cls,
                          )}
                        >
                          {ps.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDateTime(m.settled_at ?? m.finished_at ?? m.created_at)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">→</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PartieSheet
        match={selectionnee}
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

function PartieSheet({
  match,
  open,
  onOpenChange,
  onAction,
  onErreur,
}: {
  match: AdminMatchRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAction: () => void;
  onErreur: (e: string | null) => void;
}) {
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setMotif("");
  }, [open, match?.id]);

  if (!match) return null;

  const peutAnnuler = match.settled_at !== null;
  const peutForfait = match.settled_at === null && match.guest_id !== null;
  const hostGagne = match.winner_id === match.host_id;
  const guestGagne = match.winner_id === match.guest_id;

  const agir = (p: Promise<unknown>) => {
    setBusy(true);
    onErreur(null);
    p.then(() => {
      onAction();
    })
      .catch((e: unknown) => onErreur(describeError(e, "Action impossible.")))
      .finally(() => setBusy(false));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="font-display text-lg">
            Partie{" "}
            <span className="font-mono text-base text-muted-foreground">{match.code}</span>
          </SheetTitle>
          <SheetDescription>
            Créée le {formatDateTime(match.created_at)}
            {match.settled_at && ` · terminée le ${formatDateTime(match.settled_at)}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Score */}
          <div className="grid grid-cols-3 items-center gap-2 rounded-lg border border-border bg-card/40 p-4">
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                {match.host_username ?? "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hôte</p>
            </div>
            <div className="text-center">
              <p className="font-display text-3xl text-gold">
                {match.rounds_host} – {match.rounds_guest}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Tours gagnés
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                {match.guest_username ?? "(en attente)"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invité</p>
            </div>
          </div>

          {/* Vainqueur */}
          {match.winner_id && (
            <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
              <span className="text-success">🏆 Vainqueur :</span>{" "}
              <span className="font-semibold">
                {hostGagne
                  ? match.host_username
                  : guestGagne
                  ? match.guest_username
                  : "—"}
              </span>
            </div>
          )}

          {/* Mise */}
          {match.bet_amount > 0 && (
            <div className="rounded-md border border-border bg-card/40 p-3 text-sm">
              <span className="text-muted-foreground">Mise acceptée :</span>{" "}
              <span className="gold-text font-semibold">🪙 {match.bet_amount}</span>
            </div>
          )}

          {/* Deltas de cote */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border border-border p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Δ cote hôte
              </p>
              <p
                className={cn(
                  "font-display text-lg",
                  match.rating_delta_host > 0
                    ? "text-success"
                    : match.rating_delta_host < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {match.rating_delta_host > 0 ? "+" : ""}
                {match.rating_delta_host}
              </p>
            </div>
            <div className="rounded-md border border-border p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Δ cote invité
              </p>
              <p
                className={cn(
                  "font-display text-lg",
                  match.rating_delta_guest > 0
                    ? "text-success"
                    : match.rating_delta_guest < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {match.rating_delta_guest > 0 ? "+" : ""}
                {match.rating_delta_guest}
              </p>
            </div>
          </div>

          {/* Motif */}
          {(peutAnnuler || peutForfait) && (
            <div>
              <label className="block text-xs text-muted-foreground">
                Motif (consigné au journal)
                <input
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Litige, abandon, erreur de score…"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-4">
          {peutForfait && match.host_id && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                agir(adminMatchForfeit(match.id, match.host_id!, motif || "Forfait par l'arbitre"))
              }
            >
              Forfait : {match.host_username} gagne
            </Button>
          )}
          {peutForfait && match.guest_id && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                agir(
                  adminMatchForfeit(match.id, match.guest_id!, motif || "Forfait par l'arbitre"),
                )
              }
            >
              Forfait : {match.guest_username} gagne
            </Button>
          )}
          {peutAnnuler && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => agir(adminMatchVoid(match.id, motif || "Annulation administrative"))}
              className="text-destructive"
            >
              ↶ Annuler la partie
            </Button>
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/azteque/avatar";
import { RankBadge } from "@/components/azteque/rank";
import { rankOf } from "@/lib/azteque/rank";
import { describeError } from "@/lib/azteque/account";
import {
  adminGrantTokens,
  adminListPlayers,
  adminSetAdmin,
  adminSetBanned,
  estEnLigne,
  type AdminPlayer,
} from "@/lib/azteque/admin";
import { PlayerSheet } from "@/components/admin/PlayerSheet";

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

/** « Vu il y a… », ou l'aveu qu'on ne l'a jamais vu. */
function vuIlYA(iso: string | null): string {
  if (!iso) return "jamais vu";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `vu il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `vu il y a ${heures} h`;
  return `vu il y a ${Math.floor(heures / 24)} j`;
}

type StatutFiltre = "tous" | "en_ligne" | "hors_ligne" | "suspendu" | "admin";

/**
 * Onglet Joueurs — tableau dense avec filtres, multi-sélection, barre
 * d'actions groupées, et tiroir latéral pour la fiche détaillée.
 *
 * PR2 remplace l'accordéon dépliable par un vrai tableau. Le comportement
 * reste le même : la recherche déclenche un appel RPC après 300 ms, et les
 * actions passent toujours par les fonctions `admin_*` qui vérifient le
 * droit d'administrer côté serveur.
 */
export function Joueurs({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [statut, setStatut] = useState<StatutFiltre>("tous");
  const [paysFiltre, setPaysFiltre] = useState<string>("tous");
  const [gradeFiltre, setGradeFiltre] = useState<string>("tous");
  const [liste, setListe] = useState<AdminPlayer[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [sheetPlayer, setSheetPlayer] = useState<AdminPlayer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [montant, setMontant] = useState("500");
  const [motif, setMotif] = useState("");

  const charger = useCallback(
    (q: string) => {
      adminListPlayers(q, 200)
        .then(setListe)
        .catch((e: unknown) => onErreur(describeError(e, "Liste indisponible.")));
    },
    [onErreur],
  );

  useEffect(() => {
    const t = setTimeout(() => charger(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, charger]);

  const paysDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const j of liste) if (j.country) set.add(j.country);
    return Array.from(set).sort();
  }, [liste]);

  const filtres = useMemo(() => {
    return liste.filter((j) => {
      if (statut === "en_ligne" && !estEnLigne(j)) return false;
      if (statut === "hors_ligne" && estEnLigne(j)) return false;
      if (statut === "suspendu" && !j.banned) return false;
      if (statut === "admin" && !j.is_admin) return false;
      if (paysFiltre !== "tous" && j.country !== paysFiltre) return false;
      if (gradeFiltre !== "tous" && rankOf(j.rating).name !== gradeFiltre) return false;
      return true;
    });
  }, [liste, statut, paysFiltre, gradeFiltre]);

  const tousCoches =
    filtres.length > 0 && filtres.every((j) => selection.has(j.id));
  const partiels = filtres.some((j) => selection.has(j.id)) && !tousCoches;

  const etatCheckboxEnTete: boolean | "indeterminate" = partiels
    ? "indeterminate"
    : tousCoches;

  const basculerTous = () => {
    setSelection((s) => {
      const suivant = new Set(s);
      if (tousCoches) {
        for (const j of filtres) suivant.delete(j.id);
      } else {
        for (const j of filtres) suivant.add(j.id);
      }
      return suivant;
    });
  };

  const basculerUn = (id: string) => {
    setSelection((s) => {
      const suivant = new Set(s);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  const ouvrirFiche = (p: AdminPlayer) => {
    setSheetPlayer(p);
    setSheetOpen(true);
  };

  const agir = (p: Promise<unknown>) => {
    setBusy(true);
    onErreur(null);
    p.then(() => charger(query.trim()))
      .catch((e: unknown) => onErreur(describeError(e, "Action impossible.")))
      .finally(() => setBusy(false));
  };

  const agirGroupe = (ids: string[], action: (id: string) => Promise<unknown>) => {
    setBusy(true);
    onErreur(null);
    Promise.allSettled(ids.map((id) => action(id)))
      .then((results) => {
        const echecs = results.filter((r) => r.status === "rejected").length;
        if (echecs > 0) {
          onErreur(`${echecs} action(s) ont échoué.`);
        }
        setSelection(new Set());
        charger(query.trim());
      })
      .finally(() => setBusy(false));
  };

  const envoyerJetonsGroupe = (ids: string[], montant: number, motif: string) => {
    if (!Number.isFinite(montant) || montant === 0) return;
    agirGroupe(ids, (id) => adminGrantTokens(id, montant, motif));
  };

  const selectionListe = useMemo(
    () => liste.filter((j) => selection.has(j.id)),
    [liste, selection],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Joueurs</h1>
        <p className="text-xs text-muted-foreground">
          {filtres.length} joueur{filtres.length > 1 ? "s" : ""} affiché
          {filtres.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Barre de filtres */}
      <div className="panel flex flex-wrap items-center gap-2 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Pseudo, nom, email…"
          className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <SelectPill value={statut} onChange={(v) => setStatut(v as StatutFiltre)}>
          <option value="tous">Tous statuts</option>
          <option value="en_ligne">En ligne</option>
          <option value="hors_ligne">Hors ligne</option>
          <option value="suspendu">Suspendus</option>
          <option value="admin">Admins</option>
        </SelectPill>
        <SelectPill value={paysFiltre} onChange={setPaysFiltre} disabled={paysDisponibles.length === 0}>
          <option value="tous">Tous pays</option>
          {paysDisponibles.map((c) => (
            <option key={c} value={c}>
              {PAYS[c] ?? c}
            </option>
          ))}
        </SelectPill>
        <SelectPill value={gradeFiltre} onChange={setGradeFiltre}>
          <option value="tous">Tous grades</option>
          <option value="Légende">Légende</option>
          <option value="Maître">Maître</option>
          <option value="Expert">Expert</option>
          <option value="Normal">Normal</option>
          <option value="Facile">Facile</option>
        </SelectPill>
        {(statut !== "tous" || paysFiltre !== "tous" || gradeFiltre !== "tous") && (
          <button
            type="button"
            onClick={() => {
              setStatut("tous");
              setPaysFiltre("tous");
              setGradeFiltre("tous");
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={etatCheckboxEnTete}
                    onCheckedChange={basculerTous}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th className="px-3 py-2 text-left">Joueur</th>
                <th className="px-3 py-2 text-left">Pays</th>
                <th className="px-3 py-2 text-left">Grade</th>
                <th className="px-3 py-2 text-right">Cote</th>
                <th className="px-3 py-2 text-right">Parties</th>
                <th className="px-3 py-2 text-right">Jetons</th>
                <th className="px-3 py-2 text-left">Activité</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtres.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    Aucun joueur ne correspond à ces filtres.
                  </td>
                </tr>
              ) : (
                filtres.map((j) => {
                  const r = rankOf(j.rating);
                  const enLigne = estEnLigne(j);
                  return (
                    <tr
                      key={j.id}
                      className={cn(
                        "cursor-pointer border-t border-border/50 transition-colors hover:bg-sidebar-accent/50",
                        selection.has(j.id) && "bg-primary/5",
                      )}
                      onClick={() => ouvrirFiche(j)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selection.has(j.id)}
                          onCheckedChange={() => basculerUn(j.id)}
                          aria-label={`Sélectionner ${j.username}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar className="h-8 w-8" profile={j} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate font-semibold text-foreground">
                                {j.username}
                              </span>
                              {j.is_admin && (
                                <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                                  Adm
                                </span>
                              )}
                            </div>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {[j.first_name, j.last_name].filter(Boolean).join(" ") || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {j.country ? (
                          <span title={PAYS[j.country] ?? j.country}>
                            {drapeau(j.country)} {j.country}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            r.tier >= 8 && "border-primary/40 bg-primary/10 text-primary",
                            r.tier >= 5 && r.tier < 8 && "border-info/40 bg-info/10 text-info",
                            r.tier < 5 && "border-border bg-card text-muted-foreground",
                          )}
                        >
                          {r.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {j.rating.toLocaleString("fr")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {j.rated_games}
                      </td>
                      <td className="px-3 py-2 text-right gold-text">
                        🪙 {j.tokens.toLocaleString("fr")}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              enLigne
                                ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153_/_0.7)]"
                                : "bg-muted-foreground/40",
                            )}
                          />
                          <span className="text-muted-foreground">
                            {enLigne ? "en ligne" : vuIlYA(j.last_seen_at)}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {j.banned ? (
                          <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                            Suspendu
                          </span>
                        ) : j.is_admin ? (
                          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Admin
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Membre
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        →
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barre d'actions groupées — n'apparaît que si sélection */}
      {selection.size > 0 && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-card/95 p-2 shadow-lg backdrop-blur">
          <span className="px-2 text-xs font-semibold text-foreground">
            {selection.size} sélectionné{selection.size > 1 ? "s" : ""}
          </span>
          <span className="text-xs text-muted-foreground">
            ({selectionListe.slice(0, 3).map((j) => j.username).join(", ")}
            {selection.size > 3 ? `, +${selection.size - 3}` : ""})
          </span>
          <div className="flex-1" />
          <input
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            inputMode="numeric"
            className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs"
            placeholder="Montant"
            aria-label="Montant"
          />
          <input
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif (journal)"
            className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
          />
          <Button
            size="sm"
            disabled={busy || !Number(montant)}
            onClick={() => envoyerJetonsGroupe(Array.from(selection), Number(montant), motif)}
            className="font-semibold"
          >
            + Jetons
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !Number(montant)}
            onClick={() => envoyerJetonsGroupe(Array.from(selection), -Number(montant), motif)}
          >
            − Jetons
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              agirGroupe(Array.from(selection), (id) => {
                const j = liste.find((x) => x.id === id);
                return adminSetBanned(id, !j?.banned);
              })
            }
          >
            Suspendre / Rétablir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelection(new Set())}
          >
            Annuler
          </Button>
        </div>
      )}

      <PlayerSheet
        player={sheetPlayer}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}

function SelectPill({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-primary",
        disabled && "opacity-50",
      )}
    >
      {children}
    </select>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/azteque/account";
import {
  adminListSettings,
  adminSetSetting,
  type AppSetting,
} from "@/lib/azteque/admin-settings";

/**
 * Réglages de l'app, gérés via la table `app_settings` (clé/valeur
 * jsonb). On expose un petit nombre de paramètres éditables — la
 * console n'est pas un éditeur de configuration arbitraire, c'est
 * un endroit où on ajuste quelques leviers métier.
 *
 * Ajouter un nouveau réglage : l'ajouter dans `REGLAGES_CONNUS` ci-
 * dessous. Le type (string, number, boolean) est déduit de la
 * valeur par défaut, et la clé SQL doit correspondre exactement.
 */
type ReglageType = "boolean" | "number" | "string";

interface ReglageDef {
  /** Clé dans app_settings */
  cle: string;
  label: string;
  description: string;
  type: ReglageType;
  /** Valeur par défaut si la base n'a rien. */
  defaut: unknown;
}

const REGLAGES_CONNUS: ReglageDef[] = [
  {
    cle: "maintenance.enabled",
    label: "Mode maintenance",
    description:
      "Quand activé, les parties en ligne sont bloquées. Les joueurs voient un message d'attente.",
    type: "boolean",
    defaut: false,
  },
  {
    cle: "boutique.enabled",
    label: "Boutique ouverte",
    description:
      "Quand désactivée, la boutique affiche 'temporairement fermée'. Les achats déjà effectués restent valides.",
    type: "boolean",
    defaut: true,
  },
  {
    cle: "saison.numero",
    label: "Numéro de saison",
    description: "Affiché en page d'accueil. Utile pour les resets de classement.",
    type: "number",
    defaut: 1,
  },
  {
    cle: "saison.debut",
    label: "Début de la saison (date ISO)",
    description: "Affiché en page d'accueil et en fiche joueur.",
    type: "string",
    defaut: "2025-01-01",
  },
  {
    cle: "saison.message",
    label: "Message de saison",
    description: "Texte court affiché sur la page d'accueil. 200 caractères max.",
    type: "string",
    defaut: "",
  },
  {
    cle: "cote.flo",
    label: "Plancher de cote",
    description: "La cote d'un joueur ne descend jamais en dessous de cette valeur.",
    type: "number",
    defaut: 800,
  },
];

/**
 * Onglet Réglages — PR6.
 *
 * Quelques feature flags de l'app, exposés de manière structurée.
 * On lit tout d'un coup (admin_list_settings), on édite en local, et
 * on pousse les changements un par un.
 */
export function Reglages({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [valeurs, setValeurs] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const charger = useCallback(() => {
    setBusy(true);
    onErreur(null);
    adminListSettings()
      .then((rows: AppSetting[]) => {
        const map: Record<string, unknown> = {};
        for (const r of rows) map[r.key] = r.value;
        // Compléter avec les défauts pour les clés non encore en base
        for (const def of REGLAGES_CONNUS) {
          if (!(def.cle in map)) map[def.cle] = def.defaut;
        }
        setValeurs(map);
      })
      .catch((e: unknown) => onErreur(describeError(e, "Réglages indisponibles.")))
      .finally(() => setBusy(false));
  }, [onErreur]);

  useEffect(() => {
    charger();
  }, [charger]);

  const modifier = (cle: string, valeur: unknown) => {
    setValeurs((v) => ({ ...v, [cle]: valeur }));
  };

  const enregistrer = async (cle: string) => {
    setSaving((s) => ({ ...s, [cle]: true }));
    onErreur(null);
    try {
      await adminSetSetting(cle, valeurs[cle]);
    } catch (e: unknown) {
      onErreur(describeError(e, "Enregistrement impossible."));
    } finally {
      setSaving((s) => ({ ...s, [cle]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Réglages</h1>
        <Button size="sm" variant="outline" onClick={charger} disabled={busy}>
          {busy ? "…" : "↻ Rafraîchir"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Les réglages ci-dessous sont stockés dans la base (table
        <code> app_settings</code>) et lus par le client à l'ouverture.
        Un changement prend effet à la prochaine ouverture de
        l'application, pas instantanément.
      </p>

      <div className="space-y-2">
        {REGLAGES_CONNUS.map((def) => (
          <ReglageLigne
            key={def.cle}
            def={def}
            valeur={valeurs[def.cle]}
            onChange={(v) => modifier(def.cle, v)}
            onSave={() => void enregistrer(def.cle)}
            saving={saving[def.cle] ?? false}
          />
        ))}
      </div>
    </div>
  );
}

function ReglageLigne({
  def,
  valeur,
  onChange,
  onSave,
  saving,
}: {
  def: ReglageDef;
  valeur: unknown;
  onChange: (v: unknown) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <article className="panel flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{def.label}</p>
        <p className="text-xs text-muted-foreground">{def.description}</p>
        <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
          {def.cle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {def.type === "boolean" ? (
          <button
            type="button"
            onClick={() => onChange(!valeur)}
            className={cn(
              "relative h-6 w-11 rounded-full border transition-colors",
              valeur
                ? "border-emerald-500/40 bg-emerald-500/30"
                : "border-border bg-card",
            )}
            aria-pressed={Boolean(valeur)}
            aria-label={def.label}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-foreground transition-transform",
                valeur ? "translate-x-6" : "translate-x-1",
              )}
            />
          </button>
        ) : def.type === "number" ? (
          <input
            type="number"
            value={typeof valeur === "number" ? valeur : Number(valeur) || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
          />
        ) : (
          <input
            type="text"
            value={typeof valeur === "string" ? valeur : String(valeur ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
          />
        )}
        <Button size="sm" onClick={onSave} disabled={saving} className="font-semibold">
          {saving ? "…" : "Enregistrer"}
        </Button>
      </div>
    </article>
  );
}

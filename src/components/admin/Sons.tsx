import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeError } from "@/lib/azteque/account";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_CONTEXTS,
  SOUND_CONTEXT_LABELS,
  SOUND_EXTRAS,
  SOUND_IDS,
  SOUND_LABELS,
  SOUND_RANGES,
  SOUND_TUNING_LABELS,
  currentSoundSettings,
  setSoundContext,
  sfx,
  applySoundSettings,
  clearSample,
  hasSample,
  registerSample,
  type SoundContext,
  type SoundId,
  type SoundSettings,
  type SoundTuning,
} from "@/lib/azteque/sfx";
import {
  adminClearSoundFile,
  adminSaveSoundSettings,
  adminSetSoundFile,
  listSoundFiles,
  SON_MAX_OCTETS,
  type SoundFileInfo,
} from "@/lib/azteque/admin";

const VOYELLES_LABELS = ["a", "e", "o"];

const DEFAUTS_AFFICHES: Partial<Record<SoundId, Partial<SoundTuning>>> = {
  snicker: { syllables: 3, step: 0.9, vowel: 1 },
  chuckle: { syllables: 4, step: 1.02, vowel: 1 },
  taunt: { syllables: 5, step: 0.9, vowel: 0 },
  cheer: { voices: 14, claps: 80 },
  trumpLaugh: { syllables: 2, step: 1.08, vowel: 0 },
  sweepLaugh: { syllables: 4, step: 0.92, vowel: 0 },
  landslideLaugh: { syllables: 7, step: 0.94, vowel: 0 },
  streakLaugh: { syllables: 4, step: 0.97, vowel: 1 },
  streakLaugh4: { syllables: 5, step: 0.95, vowel: 1 },
  streakLaugh5: { syllables: 6, step: 0.93, vowel: 1 },
};

const MIMES: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
};

function typeDuFichier(f: File): string {
  if (f.type.startsWith("audio/")) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return MIMES[ext] ?? "audio/mpeg";
}

function poids(octets: number): string {
  return octets >= 1024 * 1024
    ? `${(octets / (1024 * 1024)).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} ko`;
}

/** Catégorise les sons pour les regrouper dans la grille. */
const CATEGORIES: { id: string; titre: string; ids: SoundId[] }[] = [
  {
    id: "cartes",
    titre: "Bruitages de la partie",
    ids: ["place", "beat", "collect", "draw", "sweep", "shuffle", "dealCard"],
  },
  {
    id: "rires",
    titre: "Rires & acclamations",
    ids: ["snicker", "chuckle", "taunt", "cheer", "trumpLaugh", "sweepLaugh", "landslideLaugh", "streakLaugh", "streakLaugh4", "streakLaugh5"],
  },
  {
    id: "jetons",
    titre: "Boutique",
    ids: ["coin"],
  },
];

/**
 * Onglet Sons — refonte PR4.
 *
 * Mise en grille 2 colonnes : à gauche le volume général et l'aide, à
 * droite la grille des sons groupés par catégorie. Chaque carte son
 * porte son titre, un bouton « ▶ Écouter » qui joue l'aperçu avec
 * les réglages courants, un bouton d'upload fichier, un player natif
 * si un fichier est en place, et ses curseurs.
 *
 * On ne change pas la logique : les fonctions admin_* sont les mêmes
 * que dans l'onglet d'origine, seul le balisage est revu.
 */
export function Sons({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [profil, setProfil] = useState<SoundContext>("ia");
  const [reglages, setReglages] = useState<SoundSettings>(() => currentSoundSettings("ia"));
  const [busy, setBusy] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [fichiers, setFichiers] = useState<Record<string, SoundFileInfo>>({});
  const [occupe, setOccupe] = useState<SoundId | null>(null);

  useEffect(() => {
    setSoundContext(profil);
    setReglages(currentSoundSettings(profil));
    listSoundFiles(profil)
      .then((l) => setFichiers(Object.fromEntries(l.map((f) => [f.id, f]))))
      .catch(() => setFichiers({}));
  }, [profil]);

  const ecouter = (id: SoundId) => {
    applySoundSettings(reglages, profil);
    sfx[id]();
  };

  const televerser = async (id: SoundId, f: File) => {
    onErreur(null);
    setOccupe(id);
    try {
      if (f.size > SON_MAX_OCTETS) {
        throw new Error(
          `« ${f.name} » pèse ${poids(f.size)} : ${poids(SON_MAX_OCTETS)} au maximum, ` +
            "puisque chaque joueur le télécharge à l'ouverture.",
        );
      }
      const octets = await f.arrayBuffer();
      await registerSample(id, octets, profil);
      const mime = typeDuFichier(f);
      const info = await adminSetSoundFile(id, mime, octets, profil);
      setFichiers((x) => ({ ...x, [id]: info }));
      sfx[id]();
    } catch (e: unknown) {
      clearSample(id, profil);
      setFichiers((x) => {
        const { [id]: _dropped, ...reste } = x;
        return reste;
      });
      onErreur(describeError(e, "Installation impossible."));
    } finally {
      setOccupe(null);
    }
  };

  const retirer = (id: SoundId) => {
    onErreur(null);
    setOccupe(id);
    adminClearSoundFile(id, profil)
      .then(() => {
        clearSample(id, profil);
        setFichiers((x) => {
          const { [id]: _dropped, ...reste } = x;
          return reste;
        });
      })
      .catch((e: unknown) => onErreur(describeError(e, "Retrait impossible.")))
      .finally(() => setOccupe(null));
  };

  const valeur = (id: SoundId, axe: keyof SoundTuning) =>
    reglages.sounds[id]?.[axe] ?? DEFAUTS_AFFICHES[id]?.[axe] ?? 1;

  const regler = (id: SoundId, axe: keyof SoundTuning, v: number) =>
    setReglages((r) => ({
      ...r,
      sounds: { ...r.sounds, [id]: { ...(r.sounds[id] ?? {}), [axe]: v } },
    }));

  const enregistrer = () => {
    setBusy(true);
    onErreur(null);
    adminSaveSoundSettings(reglages, profil)
      .then(() => {
        setEnregistre(true);
        setTimeout(() => setEnregistre(false), 2500);
      })
      .catch((e: unknown) => onErreur(describeError(e, "Enregistrement impossible.")))
      .finally(() => setBusy(false));
  };

  const sonsRanges = useMemo(() => {
    const out: Record<string, SoundId[]> = {};
    for (const cat of CATEGORIES) {
      out[cat.id] = cat.ids.filter((id) => SOUND_IDS.includes(id));
    }
    return out;
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl gold-text">Sons</h1>
        <p className="text-xs text-muted-foreground">
          {SOUND_IDS.length} son{SOUND_IDS.length > 1 ? "s" : ""} au total
        </p>
      </div>

      {/* Sélecteur de profil (contexte) */}
      <div className="panel flex flex-wrap items-center gap-2 p-2">
        <span className="px-2 text-xs text-muted-foreground">Profil :</span>
        <div className="flex overflow-hidden rounded-md border border-border">
          {SOUND_CONTEXTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setProfil(c)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                profil === c
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent",
              )}
            >
              {SOUND_CONTEXT_LABELS[c]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          Réglages et fichiers indépendants par profil
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Colonne gauche : volume général + aide */}
        <aside className="panel space-y-3 p-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            <p className="text-sm font-semibold text-foreground">Volume général</p>
            <Curseur
              label="Tous les sons"
              v={reglages.master}
              min={0}
              max={2}
              pas={0.05}
              onChange={(v) => setReglages((r) => ({ ...r, master: v }))}
            />
          </div>

          <div className="divider" />

          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Chaque son se règle sur trois axes : le volume, la hauteur et la
              vitesse. <span className="font-mono">1,00</span> est la valeur
              d'origine.
            </p>
            <p>
              Les réglages valent pour tous les joueurs dès l'enregistrement.
            </p>
            <p>
              Un son peut aussi être remplacé par un fichier local. Le fichier
              s'installe aussitôt, sans passer par « Enregistrer ».{" "}
              <span className="font-mono">{poids(SON_MAX_OCTETS)}</span> au
              maximum, c'est un effet d'une ou deux secondes que chaque joueur
              télécharge à l'ouverture.
            </p>
          </div>

          <div className="divider" />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={busy}
              onClick={enregistrer}
              className="font-semibold"
            >
              {busy ? "…" : "Enregistrer pour tous"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                applySoundSettings(DEFAULT_SOUND_SETTINGS, profil);
                setReglages(currentSoundSettings(profil));
              }}
            >
              Valeurs d'origine
            </Button>
            {enregistre && (
              <span className="text-xs text-emerald-400">✓ Enregistré</span>
            )}
          </div>
        </aside>

        {/* Colonne droite : grille de sons */}
        <div className="space-y-4 lg:col-span-2">
          {CATEGORIES.map((cat) => {
            const ids = sonsRanges[cat.id] ?? [];
            if (ids.length === 0) return null;
            return (
              <section key={cat.id} className="space-y-2">
                <h2 className="font-display text-sm uppercase tracking-wider text-muted-foreground">
                  {cat.titre}{" "}
                  <span className="text-muted-foreground/60">· {ids.length}</span>
                </h2>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {ids.map((id) => (
                    <CarteSon
                      key={id}
                      id={id}
                      fichier={fichiers[id]}
                      occupe={occupe === id}
                      axes={fichiers[id]
                        ? ["gain", "pitch", "speed"]
                        : ["gain", "pitch", "speed", ...SOUND_EXTRAS[id]]}
                      valeur={(axe) => valeur(id, axe)}
                      regler={(axe, v) => regler(id, axe, v)}
                      onEcouter={() => ecouter(id)}
                      onTeleverser={(f) => televerser(id, f)}
                      onRetirer={() => retirer(id)}
                      sampleDisponible={hasSample(id, profil)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CarteSon({
  id,
  fichier,
  occupe,
  axes,
  valeur,
  regler,
  onEcouter,
  onTeleverser,
  onRetirer,
  sampleDisponible,
}: {
  id: SoundId;
  fichier: SoundFileInfo | undefined;
  occupe: boolean;
  axes: (keyof SoundTuning)[];
  valeur: (axe: keyof SoundTuning) => number;
  regler: (axe: keyof SoundTuning, v: number) => void;
  onEcouter: () => void;
  onTeleverser: (f: File) => void;
  onRetirer: () => void;
  sampleDisponible: boolean;
}) {
  return (
    <article className="panel-2 space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {SOUND_LABELS[id]}
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            <code>{id}</code>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onEcouter}>
          ▶ Écouter
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <label
          className={cn(
            "cursor-pointer rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary",
            occupe && "pointer-events-none opacity-60",
          )}
        >
          {occupe ? "…" : fichier ? "Remplacer" : "Choisir un fichier"}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onTeleverser(f);
            }}
          />
        </label>
        {fichier ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={occupe}
            onClick={onRetirer}
            className="h-6 px-2 text-[10px] text-muted-foreground"
          >
            Retirer
          </Button>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            Son synthétisé
          </span>
        )}
      </div>

      {fichier && (
        <div className="rounded-md border border-border bg-card/40 p-2 text-[10px] text-muted-foreground">
          <p className="mb-1 flex items-center justify-between">
            <span className="font-mono">
              🎵 {fichier.path.split(".").pop()?.toUpperCase() ?? "?"} · {poids(fichier.bytes)}
            </span>
            {fichier.updated_at && (
              <span>{new Date(fichier.updated_at).toLocaleDateString("fr")}</span>
            )}
          </p>
          {sampleDisponible ? (
            <audio
              controls
              preload="none"
              src={fichier.path}
              className="h-8 w-full"
            />
          ) : (
            <p className="text-warning">
              Fichier déposé mais pas encore téléchargé — rechargez la page.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5 pt-1">
        {axes.map((axe) => {
          const b = SOUND_RANGES[axe];
          return (
            <Curseur
              key={axe}
              label={SOUND_TUNING_LABELS[axe]}
              v={valeur(axe)}
              min={b.min}
              max={b.max}
              pas={b.step}
              onChange={(v) => regler(axe, v)}
              libelles={axe === "vowel" ? VOYELLES_LABELS : undefined}
            />
          );
        })}
      </div>
    </article>
  );
}

function Curseur({
  label,
  v,
  min,
  max,
  pas,
  onChange,
  libelles,
}: {
  label: string;
  v: number;
  min: number;
  max: number;
  pas: number;
  onChange: (v: number) => void;
  libelles?: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 accent-[var(--gold)]"
      />
      <span className="w-12 shrink-0 text-right font-mono tabular-nums text-foreground">
        {libelles ? (libelles[Math.round(v)] ?? v) : pas >= 1 ? Math.round(v) : v.toFixed(2)}
      </span>
    </label>
  );
}

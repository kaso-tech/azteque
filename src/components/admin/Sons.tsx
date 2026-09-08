import { useEffect, useState } from "react";
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

/** Ce que valent les réglages propres à chaque son quand nul n'y a touché. */
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

/**
 * Le type d'un fichier, quand le navigateur ne le dit pas.
 *
 * Certains navigateurs remettent une chaîne vide pour un fichier glissé depuis
 * un dossier ; la base, elle, exige un type qui commence par « audio/ ». On le
 * déduit du nom plutôt que de refuser un son parfaitement lisible.
 */
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

export function Sons({ onErreur }: { onErreur: (e: string | null) => void }) {
  const [profil, setProfil] = useState<SoundContext>("ia");
  const [reglages, setReglages] = useState<SoundSettings>(() => currentSoundSettings("ia"));
  const [busy, setBusy] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [fichiers, setFichiers] = useState<Record<string, SoundFileInfo>>({});
  const [occupe, setOccupe] = useState<SoundId | null>(null);

  // Le profil affiché doit aussi être celui qu'on entend en cliquant sur
  // « Écouter » : la console bascule le contexte actif en même temps qu'elle
  // recharge ses réglages et ses fichiers.
  useEffect(() => {
    setSoundContext(profil);
    setReglages(currentSoundSettings(profil));
    listSoundFiles(profil)
      .then((l) => setFichiers(Object.fromEntries(l.map((f) => [f.id, f]))))
      .catch(() => setFichiers({}));
  }, [profil]);

  // L'aperçu doit s'entendre tel qu'il sera : on applique avant de jouer.
  const ecouter = (id: SoundId) => {
    applySoundSettings(reglages, profil);
    sfx[id]();
  };

  /**
   * Installe un fichier à la place d'un son.
   *
   * Il est décodé d'abord, envoyé ensuite : un fichier que le navigateur
   * n'ouvre pas deviendrait un silence chez tous les joueurs, et l'on ne
   * s'en apercevrait qu'en jouant.
   */
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
      // Le son revient à sa synthèse : mieux vaut l'ancien effet qu'un silence.
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

  const curseur = (
    label: string,
    v: number,
    min: number,
    max: number,
    pas: number,
    onChange: (v: number) => void,
    libelles?: string[],
  ) => (
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
      <span className="w-12 shrink-0 text-right tabular-nums text-foreground">
        {libelles ? (libelles[Math.round(v)] ?? v) : pas >= 1 ? Math.round(v) : v.toFixed(2)}
      </span>
    </label>
  );

  return (
    <section className="panel space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {SOUND_CONTEXTS.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={profil === c ? "default" : "outline"}
            onClick={() => setProfil(c)}
            className={cn(profil === c && "font-semibold")}
          >
            {SOUND_CONTEXT_LABELS[c]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Deux jeux de sons indépendants : l'un pour affronter l'IA, l'autre pour le jeu en ligne.
        Chaque réglage et chaque fichier ci-dessous ne vaut que pour le profil sélectionné.
      </p>

      <div>
        <p className="text-sm text-foreground">Volume général</p>
        {curseur("Tous", reglages.master, 0, 2, 0.05, (v) =>
          setReglages((r) => ({ ...r, master: v })),
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Chaque son se règle sur trois axes : le volume, la hauteur et la vitesse. 1,00 est la
          valeur d'origine. Les réglages valent pour tous les joueurs dès l'enregistrement.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Chaque son peut aussi être remplacé par un fichier local — un vrai rire, de vraies
          acclamations. Le fichier s'installe aussitôt, sans passer par « Enregistrer », et le
          retirer rend au son sa synthèse. {poids(SON_MAX_OCTETS)} au maximum : ce sont des effets
          d'une ou deux secondes, que chaque joueur télécharge à l'ouverture.
        </p>
      </div>

      <ul className="space-y-3">
        {SOUND_IDS.map((id) => {
          const fichier = fichiers[id];
          const axes: (keyof SoundTuning)[] = fichier
            ? ["gain", "pitch", "speed"]
            : ["gain", "pitch", "speed", ...SOUND_EXTRAS[id]];
          return (
            <li key={id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{SOUND_LABELS[id]}</p>
                <Button size="sm" variant="outline" onClick={() => ecouter(id)}>
                  ▶ Écouter
                </Button>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <label
                  className={cn(
                    "cursor-pointer rounded-full border border-gold/50 px-3 py-1 text-[0.68rem] text-gold",
                    occupe === id && "pointer-events-none opacity-60",
                  )}
                >
                  {occupe === id ? "…" : fichier ? "Remplacer le fichier" : "Choisir un fichier"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      // Le champ est vidé pour que reprendre le même fichier
                      // après une erreur relance bien l'installation.
                      e.target.value = "";
                      if (f) void televerser(id, f);
                    }}
                  />
                </label>
                {fichier ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={occupe === id}
                    onClick={() => retirer(id)}
                    className="h-7 px-2 text-[0.68rem]"
                  >
                    Retirer
                  </Button>
                ) : (
                  <span className="text-[0.68rem] text-muted-foreground">Son synthétisé</span>
                )}
              </div>
              {fichier && (
                <p className="mt-1 truncate text-[0.68rem] text-muted-foreground">
                  🎵 {(fichier.path.split(".").pop() ?? "").toUpperCase()} · {poids(fichier.bytes)}
                  {!hasSample(id, profil) && " · rechargez la page pour l'entendre"}
                </p>
              )}

              <div className="mt-1.5 space-y-1">
                {axes.map((axe) => {
                  const b = SOUND_RANGES[axe];
                  return (
                    <div key={axe}>
                      {curseur(
                        SOUND_TUNING_LABELS[axe],
                        valeur(id, axe),
                        b.min,
                        b.max,
                        b.step,
                        (v) => regler(id, axe, v),
                        axe === "vowel" ? VOYELLES_LABELS : undefined,
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={busy} onClick={enregistrer} className="font-semibold">
          {busy ? "…" : "Enregistrer pour tous"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            applySoundSettings(DEFAULT_SOUND_SETTINGS, profil);
            setReglages(currentSoundSettings(profil));
          }}
        >
          Valeurs d'origine
        </Button>
        {enregistre && <span className="text-sm text-emerald-400">✓ Enregistré</span>}
      </div>
    </section>
  );
}

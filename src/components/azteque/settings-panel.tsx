/**
 * Panneau paramètres utilisateur.
 *
 * Permet de :
 * - Activer/désactiver chaque son acheté (le bouton n'apparaît plus
 *   dans la barre de la table)
 * - Activer/désactiver chaque sticker acheté
 * - Réordonner les sons (drag à venir — pour l'instant, ordre du
 *   catalogue)
 * - Réception des messages texte / stickers (toggle global)
 *
 * Stockage local uniquement (voir `preferences.ts`). Aucun aller-retour
 * serveur : les préférences sont purement UX.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ownedSounds, ownedStickers, useCatalogue } from "@/lib/azteque/shop";
import { Sticker } from "@/components/azteque/stickers";
import {
  chargerPreferences,
  reinitialiserPreferences,
  setMessagesStickers,
  setMessagesTexte,
  setOrdreSons,
  setSonDesactive,
  setStickerDesactive,
  type MatchPreferences,
} from "@/lib/azteque/preferences";

export interface SettingsPanelProps {
  /** Articles achetés (sticker + sound) */
  owned: ReadonlySet<string>;
  /** Callback pour fermer le panneau. */
  onClose: () => void;
}

export function SettingsPanel({ owned, onClose }: SettingsPanelProps) {
  const catalogue = useCatalogue();
  const mesSons = ownedSounds(owned, catalogue);
  const mesStickers = ownedStickers(owned, catalogue).filter(
    // Exclure les stickers-sons (snd_*) : ils sont gérés dans la section sons.
    (s) => !s.id.startsWith("snd_"),
  );
  const [prefs, setPrefs] = useState<MatchPreferences>(() => chargerPreferences());

  // PR15 — Si un nouveau son est acheté pendant que le panneau est ouvert,
  // on re-pull les préférences pour le voir apparaître sans recharger.
  useEffect(() => {
    setPrefs(chargerPreferences());
  }, [owned]);

  const toggleSon = (soundId: string) => {
    const next = setSonDesactive(soundId, !prefs.sonsDesactives.includes(soundId));
    setPrefs(next);
  };
  const toggleSticker = (id: string) => {
    const next = setStickerDesactive(id, !prefs.stickersDesactives.includes(id));
    setPrefs(next);
  };
  const remonter = (id: string) => {
    const ordre = (prefs.ordreSons.length > 0 ? prefs.ordreSons : mesSons.map((s) => s.soundId ?? s.id));
    const idx = ordre.indexOf(id);
    if (idx > 0) {
      const next = [...ordre];
      [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
      setPrefs(setOrdreSons(next));
    }
  };
  const resetAll = () => {
    setPrefs(reinitialiserPreferences());
  };

  return (
    <div className="panel mt-4 w-full space-y-4 px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between">
        <h2 className="gold-text text-lg">Paramètres de la table</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground underline"
        >
          Fermer
        </button>
      </div>

      {/* Sons */}
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Sons ({mesSons.length})
        </p>
        {mesSons.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Vous n'avez acheté aucun son. Allez en boutique pour en acquérir.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {mesSons.map((s) => {
              const soundId = s.soundId ?? s.id;
              const actif = !prefs.sonsDesactives.includes(soundId);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Sticker id={s.id} className="h-7 w-7" />
                    <span className="text-sm text-foreground">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => remonter(soundId)}
                      className="rounded-md border border-border px-2 py-0.5 text-[0.7rem] text-muted-foreground hover:bg-secondary"
                      title="Remonter dans l'ordre d'affichage"
                    >
                      ↑
                    </button>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[0.7rem]">
                      <input
                        type="checkbox"
                        checked={actif}
                        onChange={() => toggleSon(soundId)}
                        className="h-4 w-4 cursor-pointer accent-gold"
                      />
                      <span className="text-foreground">{actif ? "Affiché" : "Masqué"}</span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Stickers */}
      {mesStickers.length > 0 && (
        <section>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Stickers ({mesStickers.length})
          </p>
          <ul className="mt-2 space-y-1">
            {mesStickers.map((s) => {
              const actif = !prefs.stickersDesactives.includes(s.id);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Sticker id={s.art ?? s.id} className="h-7 w-7" />
                    <span className="text-sm text-foreground">{s.name}</span>
                  </div>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[0.7rem]">
                    <input
                      type="checkbox"
                      checked={actif}
                      onChange={() => toggleSticker(s.id)}
                      className="h-4 w-4 cursor-pointer accent-gold"
                    />
                    <span className="text-foreground">{actif ? "Affiché" : "Masqué"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Réception globale */}
      <section>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Réception
        </p>
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.messagesTexte}
              onChange={(e) => {
                setPrefs(setMessagesTexte(e.target.checked));
              }}
              className="h-4 w-4 cursor-pointer accent-gold"
            />
            Messages texte de l'adversaire
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs.messagesStickers}
              onChange={(e) => {
                setPrefs(setMessagesStickers(e.target.checked));
              }}
              className="h-4 w-4 cursor-pointer accent-gold"
            />
            Stickers visuels de l'adversaire
          </label>
        </div>
      </section>

      <div className="border-t border-border pt-3">
        <Button
          size="sm"
          variant="outline"
          onClick={resetAll}
          className="text-xs"
        >
          Réinitialiser tous les paramètres
        </Button>
      </div>
    </div>
  );
}

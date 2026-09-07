import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_EXTRAS,
  SOUND_IDS,
  SOUND_LABELS,
  SOUND_RANGES,
  SOUND_TUNING_LABELS,
  applySoundSettings,
  currentSoundSettings,
} from "./sfx";

/**
 * Les réglages viennent d'une colonne JSON que seul un administrateur écrit,
 * mais rien ne garantit ce qu'elle contient : une console mal manipulée, une
 * migration à moitié passée, une valeur héritée d'une version antérieure. Un
 * nombre aberrant ne doit jamais rendre le jeu muet par accident ni
 * assourdissant.
 */
describe("réglages du son", () => {
  beforeEach(() => applySoundSettings(DEFAULT_SOUND_SETTINGS));

  it("part des valeurs d'origine", () => {
    const r = currentSoundSettings();
    expect(r.master).toBe(1);
    for (const id of SOUND_IDS) {
      expect(r.sounds[id]).toMatchObject({ gain: 1, pitch: 1, speed: 1 });
    }
    // Un curseur au repos ne doit rien changer au son d'avant la console.
    expect(r.sounds.snicker).toMatchObject({ syllables: 3, vowel: 1 });
    expect(r.sounds.cheer).toMatchObject({ voices: 14, claps: 80 });
  });

  it("ne propose que les réglages qui ont un sens pour chaque son", () => {
    // Un bruit de carton n'a pas de syllabes ; une foule n'a pas de voyelle.
    expect(SOUND_EXTRAS.place).toEqual([]);
    expect(SOUND_EXTRAS.taunt).toContain("syllables");
    expect(SOUND_EXTRAS.cheer).toEqual(["voices", "claps"]);
    for (const id of SOUND_IDS) {
      for (const axe of SOUND_EXTRAS[id]) {
        expect(SOUND_RANGES[axe]).toBeTruthy();
        expect(SOUND_TUNING_LABELS[axe]).toBeTruthy();
      }
    }
  });

  it("nomme chacun des onze sons", () => {
    expect(SOUND_IDS).toHaveLength(11);
    for (const id of SOUND_IDS) expect(SOUND_LABELS[id]).toBeTruthy();
    expect(new Set(Object.values(SOUND_LABELS)).size).toBe(SOUND_IDS.length);
  });

  it("retient un réglage valable", () => {
    applySoundSettings({ master: 0.8, sounds: { snicker: { gain: 1.5, pitch: 0.9 } } });
    const r = currentSoundSettings();
    expect(r.master).toBe(0.8);
    expect(r.sounds.snicker).toMatchObject({ gain: 1.5, pitch: 0.9, speed: 1 });
  });

  it("ramène les valeurs hors plage dans leurs bornes", () => {
    applySoundSettings({
      master: 99,
      sounds: { taunt: { gain: -5, pitch: 100, speed: 0.01 } },
    });
    const r = currentSoundSettings();
    expect(r.master).toBe(2);
    expect(r.sounds.taunt).toMatchObject({ gain: 0, pitch: 2, speed: 0.5 });
  });

  it("ignore ce qui n'est pas un nombre", () => {
    applySoundSettings({
      master: "fort",
      sounds: { cheer: { gain: null, pitch: NaN, speed: Infinity } },
    } as unknown);
    const r = currentSoundSettings();
    expect(r.master).toBe(1);
    expect(r.sounds.cheer).toMatchObject({ gain: 1, pitch: 1, speed: 1 });
  });

  it("survit à n'importe quoi", () => {
    for (const nimporte of [null, undefined, 42, "rien", [], { sounds: "non" }]) {
      applySoundSettings(nimporte);
      const r = currentSoundSettings();
      expect(r.master).toBe(1);
      expect(r.sounds.place).toEqual({ gain: 1, pitch: 1, speed: 1 });
    }
  });

  it("borne aussi les réglages propres aux voix", () => {
    applySoundSettings({
      master: 1,
      sounds: { taunt: { syllables: 99, step: 5, vowel: 7 }, cheer: { voices: -3, claps: 9999 } },
    });
    const r = currentSoundSettings();
    expect(r.sounds.taunt).toMatchObject({ syllables: 8, step: 1.25, vowel: 2 });
    expect(r.sounds.cheer).toMatchObject({ voices: 2, claps: 200 });
  });

  it("ne garde rien d'un son inconnu", () => {
    applySoundSettings({ master: 1, sounds: { inexistant: { gain: 3 } } } as unknown);
    expect(Object.keys(currentSoundSettings().sounds).sort()).toEqual([...SOUND_IDS].sort());
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_IDS,
  SOUND_LABELS,
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

  it("part des valeurs d'origine : tout à 1", () => {
    const r = currentSoundSettings();
    expect(r.master).toBe(1);
    for (const id of SOUND_IDS) {
      expect(r.sounds[id]).toEqual({ gain: 1, pitch: 1, speed: 1 });
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
    expect(r.sounds.snicker).toEqual({ gain: 1.5, pitch: 0.9, speed: 1 });
  });

  it("ramène les valeurs hors plage dans leurs bornes", () => {
    applySoundSettings({
      master: 99,
      sounds: { taunt: { gain: -5, pitch: 100, speed: 0.01 } },
    });
    const r = currentSoundSettings();
    expect(r.master).toBe(2);
    expect(r.sounds.taunt).toEqual({ gain: 0, pitch: 2, speed: 0.5 });
  });

  it("ignore ce qui n'est pas un nombre", () => {
    applySoundSettings({
      master: "fort",
      sounds: { cheer: { gain: null, pitch: NaN, speed: Infinity } },
    } as unknown);
    const r = currentSoundSettings();
    expect(r.master).toBe(1);
    expect(r.sounds.cheer).toEqual({ gain: 1, pitch: 1, speed: 1 });
  });

  it("survit à n'importe quoi", () => {
    for (const nimporte of [null, undefined, 42, "rien", [], { sounds: "non" }]) {
      applySoundSettings(nimporte);
      const r = currentSoundSettings();
      expect(r.master).toBe(1);
      expect(r.sounds.place).toEqual({ gain: 1, pitch: 1, speed: 1 });
    }
  });

  it("ne garde rien d'un son inconnu", () => {
    applySoundSettings({ master: 1, sounds: { inexistant: { gain: 3 } } } as unknown);
    expect(Object.keys(currentSoundSettings().sounds).sort()).toEqual([...SOUND_IDS].sort());
  });
});

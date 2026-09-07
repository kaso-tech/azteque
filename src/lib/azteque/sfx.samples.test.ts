import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Les sons locaux, joués pour de bon.
 *
 * Les tests voisins vérifient les réglages ; ceux-ci vérifient la bascule :
 * dès qu'un fichier est installé, c'est lui qu'on entend et non plus la
 * synthèse, et les curseurs continuent d'agir sur lui. Sans appareil audio, il
 * faut en simuler un — ce qui suit n'est qu'un carnet de ce que le jeu demande
 * à Web Audio.
 */

interface Demarrage {
  buffer: unknown;
  rate: number;
  gain: number;
}

const demarres: Demarrage[] = [];
let oscillateurs = 0;

class FauxParam {
  constructor(public value: number) {}
  setValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
}

class FauxNoeud {
  gain = new FauxParam(1);
  frequency = new FauxParam(440);
  Q = new FauxParam(1);
  playbackRate = new FauxParam(1);
  buffer: unknown = null;
  type = "";
  sortie: FauxNoeud | null = null;
  constructor(public sorte: string) {}
  connect(n: FauxNoeud) {
    this.sortie = n;
    return n;
  }
  start() {
    if (this.sorte === "buffer") {
      // Le gain se lit sur le nœud d'après : c'est là que la console agit.
      demarres.push({
        buffer: this.buffer,
        rate: this.playbackRate.value,
        gain: this.sortie?.gain.value ?? 1,
      });
    }
    if (this.sorte === "osc") oscillateurs += 1;
  }
  stop() {}
}

class FauxContexte {
  currentTime = 0;
  sampleRate = 48000;
  state = "running";
  destination = new FauxNoeud("out");
  resume() {}
  createBuffer(_c: number, frames: number) {
    return { frames, getChannelData: () => new Float32Array(frames) };
  }
  createBufferSource() {
    return new FauxNoeud("buffer");
  }
  createGain() {
    return new FauxNoeud("gain");
  }
  createBiquadFilter() {
    return new FauxNoeud("filtre");
  }
  createOscillator() {
    return new FauxNoeud("osc");
  }
  /** Un fichier valable rend un tampon ; un fichier vide est refusé. */
  decodeAudioData(bytes: ArrayBuffer) {
    return bytes.byteLength > 0
      ? Promise.resolve({ decode: bytes.byteLength } as unknown as AudioBuffer)
      : Promise.reject(new Error("Format inconnu"));
  }
}

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FauxContexte };
});

const { DEFAULT_SOUND_SETTINGS, applySoundSettings, clearSample, hasSample, registerSample, sfx } =
  await import("./sfx");

beforeEach(() => {
  demarres.length = 0;
  oscillateurs = 0;
  clearSample("cheer");
  applySoundSettings(DEFAULT_SOUND_SETTINGS);
});

describe("un son remplacé par un fichier", () => {
  it("refuse un fichier que l'appareil audio n'ouvre pas", async () => {
    await expect(registerSample("cheer", new ArrayBuffer(0))).rejects.toThrow();
    expect(hasSample("cheer")).toBe(false);
  });

  it("se joue à la place de la synthèse", async () => {
    // La foule synthétisée, c'est beaucoup de monde : des voix, des mains, une
    // rumeur de fond.
    sfx.cheer();
    expect(oscillateurs).toBeGreaterThan(10);
    expect(demarres.length).toBeGreaterThan(10);

    demarres.length = 0;
    oscillateurs = 0;
    await registerSample("cheer", new ArrayBuffer(64));
    expect(hasSample("cheer")).toBe(true);
    sfx.cheer();
    // Un seul démarrage : le fichier, et rien de la synthèse par-dessus.
    expect(oscillateurs).toBe(0);
    expect(demarres).toHaveLength(1);
    expect(demarres[0]).toMatchObject({ buffer: { decode: 64 }, rate: 1, gain: 1 });
  });

  it("obéit encore au volume, à la hauteur et à la vitesse", async () => {
    await registerSample("cheer", new ArrayBuffer(64));
    applySoundSettings({ master: 0.5, sounds: { cheer: { gain: 2, pitch: 1.5, speed: 0.75 } } });
    sfx.cheer();
    // Un enregistrement n'a qu'une commande pour la hauteur et la vitesse :
    // les deux curseurs se combinent, 1,5 / 0,75 = 2.
    expect(demarres[0]?.rate).toBe(2);
    expect(demarres[0]?.gain).toBe(1); // 2 × 0,5 de volume général
  });

  it("se tait sans réveiller la synthèse quand le volume tombe à zéro", async () => {
    await registerSample("cheer", new ArrayBuffer(64));
    applySoundSettings({ master: 1, sounds: { cheer: { gain: 0 } } });
    sfx.cheer();
    expect(demarres).toHaveLength(0);
  });

  it("rend le son à sa synthèse quand on retire le fichier", async () => {
    await registerSample("cheer", new ArrayBuffer(64));
    clearSample("cheer");
    sfx.cheer();
    expect(demarres.length).toBeGreaterThan(10);
  });

  it("ne touche pas aux autres sons", async () => {
    await registerSample("cheer", new ArrayBuffer(64));
    demarres.length = 0;
    sfx.taunt();
    // Le rire moqueur reste synthétisé : rien de ce qui démarre n'est le
    // fichier installé pour les acclamations.
    expect(demarres.length).toBeGreaterThan(0);
    expect(demarres.some((d) => (d.buffer as { decode?: number } | null)?.decode === 64)).toBe(
      false,
    );
  });
});

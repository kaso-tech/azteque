// Effets sonores synthétisés (Web Audio) — aucun fichier externe requis.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !enabled) return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Bruit filtré : le frottement du carton (pose, ramassage, pioche). */
function noise(
  at: number,
  duration: number,
  gainValue: number,
  filterFrom: number,
  filterTo: number,
  type: BiquadFilterType = "bandpass",
) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const frames = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(filterFrom, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), t + duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + duration + 0.02);
}

/** Note douce : les accents musicaux (victoire du pli, fin de résolution). */
function tone(
  at: number,
  freq: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = "triangle",
  slideTo?: number,
) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Syllabe vocale filtrée : la base d'un rire. */
function voiceBlip(at: number, freq: number, duration: number, gainValue: number) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq * 1.12, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + duration);

  const formant = ac.createBiquadFilter();
  formant.type = "bandpass";
  formant.Q.value = 4;
  formant.frequency.setValueAtTime(760, t);
  formant.frequency.exponentialRampToValueAtTime(1180, t + duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

  osc.connect(formant).connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

export const sfx = {

  /** La carte quitte la main et se pose sur la table. */
  place() {
    noise(0, 0.13, 0.16, 2600, 700);
    tone(0.01, 190, 0.08, 0.05, "sine", 120);
  },
  /** La seconde carte bat la première. */
  beat() {
    noise(0, 0.16, 0.2, 3800, 900);
    tone(0.02, 420, 0.16, 0.07, "triangle", 660);
    tone(0.09, 660, 0.22, 0.05, "sine", 880);
  },
  /** Le pli est ramassé sur un tas. */
  collect() {
    noise(0, 0.22, 0.14, 1500, 320, "lowpass");
    tone(0.05, 150, 0.14, 0.045, "sine", 96);
  },
  /** Une carte est tirée de la pioche. */
  draw() {
    noise(0, 0.1, 0.1, 3200, 1200);
  },
  /** Atout 10 : tout le tas adverse est raflé. */
  sweep() {
    noise(0, 0.55, 0.22, 900, 4200, "bandpass");
    noise(0.18, 0.45, 0.16, 2400, 400, "lowpass");
    tone(0.02, 330, 0.5, 0.06, "triangle", 990);
    tone(0.22, 494, 0.36, 0.05, "sine", 740);
    tone(0.42, 740, 0.4, 0.045, "triangle", 988);
  },
  /** Petit ricanement bref : une bonne vient d'être ramassée. */
  snicker() {
    const base = 300;
    for (let i = 0; i < 3; i += 1) {
      const at = i * 0.1;
      voiceBlip(at, base * Math.pow(0.88, i), 0.07, 0.06);
      noise(at, 0.04, 0.022, 1600, 620, "bandpass");
    }
  },
  /** Rire plus clair et chantant : un compte vient d'être annoncé. */
  chuckle() {
    const base = 420;
    for (let i = 0; i < 4; i += 1) {
      const at = i * 0.085;
      voiceBlip(at, base * Math.pow(1.05, i), 0.06, 0.055);
    }
    tone(0.02, 660, 0.24, 0.04, "triangle", 990);
  },
  /** Rire moqueur : suite de « ha » descendants. */
  taunt() {
    const base = 250;
    for (let i = 0; i < 5; i += 1) {
      const at = i * 0.16;
      const f = base * Math.pow(0.9, i);
      voiceBlip(at, f, 0.11, 0.075);
      noise(at, 0.06, 0.03, 1400, 500, "bandpass");
    }
  },
  /** Acclamations : applaudissements et clameur. */
  cheer() {
    for (let i = 0; i < 26; i += 1) {
      noise(Math.random() * 1.1, 0.05, 0.05 + Math.random() * 0.05, 2600, 1100, "bandpass");
    }
    noise(0, 1.3, 0.09, 500, 1600, "bandpass");
    tone(0.05, 523, 0.7, 0.045, "triangle", 784);
    tone(0.3, 659, 0.6, 0.04, "sine", 988);
  },
};



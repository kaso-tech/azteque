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
};

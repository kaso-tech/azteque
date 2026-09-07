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
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

/* ---------- Voix ---------- */

/*
 * Les niveaux des voix ci-dessous ont été réglés sur ceux des cartes, mesurés
 * en rendant chaque son hors ligne : filtrer par trois bandes étroites retire
 * beaucoup d'énergie, et à gain égal un rire passait sous le bruit d'une carte
 * posée. Ils visent tous une crête d'environ 0,035, comme « beat » et
 * « sweep », les deux sons les plus marquants du jeu.
 */

/**
 * Un appareil vocal simplifié.
 *
 * Une voix humaine, c'est une source — les cordes vocales, un son riche en
 * harmoniques — filtrée par la bouche et la gorge, qui en renforcent trois
 * bandes étroites : les formants. Leur position fait la voyelle, et c'est ce
 * qui distingue un « ha » d'un bourdonnement. L'ancienne version n'avait qu'un
 * filtre, d'où son côté synthétique.
 *
 * Trois détails achèvent de rendre la chose vivante, et leur absence s'entend
 * plus que leur présence : le souffle du « h » qui ouvre la syllabe, la chute
 * de hauteur pendant qu'on la prononce, et le tremblement involontaire de la
 * voix — aucune corde vocale ne tient une note parfaitement droite.
 */
const VOYELLES = {
  a: [730, 1100, 2450],
  e: [530, 1840, 2480],
  o: [460, 800, 2540],
} as const;

type Voyelle = keyof typeof VOYELLES;

function syllabe(
  at: number,
  {
    duree,
    f0,
    voyelle = "a",
    gain: gainValue,
    chute = 0.82,
    souffle = 0.5,
  }: {
    duree: number;
    /** Hauteur de départ, en hertz. */
    f0: number;
    voyelle?: Voyelle;
    gain: number;
    /** Rapport de la hauteur finale à la hauteur initiale. */
    chute?: number;
    /** Part d'aspiration au tout début — le « h » de « ha ». */
    souffle?: number;
  },
) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;

  const src = ac.createOscillator();
  src.type = "sawtooth";
  src.frequency.setValueAtTime(f0, t);
  src.frequency.exponentialRampToValueAtTime(Math.max(60, f0 * chute), t + duree);

  // Vibrato irrégulier : la hauteur ne tient jamais droite.
  const tremble = ac.createOscillator();
  tremble.type = "sine";
  tremble.frequency.value = 4.5 + Math.random() * 2.5;
  const trembleGain = ac.createGain();
  trembleGain.gain.value = f0 * 0.018;
  tremble.connect(trembleGain).connect(src.frequency);

  // La source glottique est plus douce qu'une dent de scie nue.
  const glotte = ac.createBiquadFilter();
  glotte.type = "lowpass";
  glotte.frequency.value = 3200;

  const sortie = ac.createGain();
  sortie.gain.setValueAtTime(0.0001, t);
  sortie.gain.exponentialRampToValueAtTime(gainValue, t + 0.018);
  sortie.gain.setValueAtTime(gainValue, t + duree * 0.35);
  sortie.gain.exponentialRampToValueAtTime(0.0001, t + duree);

  const formants = VOYELLES[voyelle];
  const poids = [1, 0.62, 0.28];
  src.connect(glotte);
  formants.forEach((f, i) => {
    const bande = ac.createBiquadFilter();
    bande.type = "bandpass";
    bande.frequency.value = f * (0.98 + Math.random() * 0.04);
    // Bandes assez larges pour attraper une harmonique quelle que soit la
    // hauteur : à voix haute, les harmoniques sont espacées de plusieurs
    // centaines de hertz et une bande étroite peut tomber entre deux, ce qui
    // vide la voyelle de sa substance — c'est ce qui rendait le rire clair
    // deux fois plus faible que les autres.
    bande.Q.value = i === 2 ? 7 : 5;
    const g = ac.createGain();
    g.gain.value = poids[i] ?? 0.2;
    glotte.connect(bande).connect(g).connect(sortie);
  });
  sortie.connect(ac.destination);

  src.start(t);
  tremble.start(t);
  src.stop(t + duree + 0.03);
  tremble.stop(t + duree + 0.03);

  if (souffle > 0) {
    noise(at, 0.05, gainValue * souffle * 0.4, 1800, 900, "highpass");
  }
}

/**
 * Un rire : une suite de syllabes qui descendent et s'essoufflent, close par
 * une reprise de souffle. Le tempo et la hauteur ne se répètent jamais tout à
 * fait d'une syllabe à l'autre, sans quoi l'oreille entend une machine.
 */
function rire(
  at: number,
  {
    syllabes,
    f0,
    pas = 0.93,
    tempo,
    voyelle = "a",
    gain: gainValue,
    reprise = true,
  }: {
    syllabes: number;
    f0: number;
    /** Rapport de hauteur d'une syllabe à la suivante. */
    pas?: number;
    tempo: number;
    voyelle?: Voyelle;
    gain: number;
    reprise?: boolean;
  },
) {
  let t = at;
  for (let i = 0; i < syllabes; i += 1) {
    const irregulier = 1 + (Math.random() - 0.5) * 0.18;
    syllabe(t, {
      duree: tempo * 0.62 * irregulier,
      f0: f0 * Math.pow(pas, i) * (1 + (Math.random() - 0.5) * 0.06),
      voyelle,
      gain: gainValue * (1 - i * 0.09),
      souffle: i === 0 ? 0.8 : 0.45,
    });
    t += tempo * irregulier;
  }
  // L'inspiration qui suit : c'est elle qui fait qu'un rire a une fin.
  if (reprise) noise(t - tempo * 0.2, 0.22, gainValue * 0.35, 700, 2200, "bandpass");
}

/**
 * Un riffle : le paquet séparé en deux, puis les deux moitiés relâchées l'une
 * dans l'autre. À l'oreille, une rafale de petits claquements de plus en plus
 * serrés, sous un souffle de carton. Les irrégularités sont voulues — une
 * grille parfaitement régulière sonnerait mécanique.
 */
function riffle(at: number) {
  const n = 22;
  for (let i = 0; i < n; i += 1) {
    // Les cartes tombent d'abord lentement puis s'emballent : l'écart se
    // resserre à mesure que les moitiés se vident.
    const t = at + 0.34 * Math.pow(i / n, 0.72) + Math.random() * 0.006;
    noise(t, 0.018, 0.045 + Math.random() * 0.02, 3400, 1500, "bandpass");
  }
  noise(at, 0.3, 0.045, 900, 2600, "bandpass");
}

export const sfx = {
  /** Le paquet est battu : deux riffles, puis la coupe. */
  shuffle() {
    riffle(0);
    riffle(0.4);
    noise(0.82, 0.17, 0.13, 700, 200, "lowpass");
    tone(0.83, 130, 0.11, 0.045, "sine", 82);
  },
  /** Une carte glisse du paquet vers une main. */
  dealCard() {
    noise(0, 0.07, 0.1, 3600, 1400, "bandpass");
    tone(0.005, 240, 0.05, 0.03, "sine", 150);
  },
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
  /**
   * Ricanement bref, quand on prend une bonne à l'adversaire. Voix moyenne,
   * trois syllabes serrées : de quoi se moquer, pas de quoi triompher.
   */
  snicker() {
    rire(0, { syllabes: 3, f0: 300, pas: 0.9, tempo: 0.15, voyelle: "e", gain: 0.19 });
  },
  /** Rire clair et chantant : un compte vient d'être annoncé. */
  chuckle() {
    rire(0, {
      syllabes: 4,
      f0: 380,
      pas: 1.02,
      tempo: 0.13,
      voyelle: "e",
      gain: 0.24,
      reprise: false,
    });
    tone(0.03, 660, 0.26, 0.035, "triangle", 990);
  },
  /** Rire moqueur : voix grave, syllabes lentes qui descendent. */
  taunt() {
    rire(0, { syllabes: 5, f0: 210, pas: 0.9, tempo: 0.21, voyelle: "a", gain: 0.28 });
  },
  /**
   * Acclamations : une foule, et non une note de victoire.
   *
   * Elle est faite de voix distinctes — chacune sa hauteur, son entrée et sa
   * durée — sous une nappe de mains qui applaudissent, dense au début puis qui
   * se disperse. Une foule qui commencerait et finirait d'un bloc s'entendrait
   * comme un effet ; celle-ci monte et retombe.
   */
  cheer() {
    for (let i = 0; i < 14; i += 1) {
      const depart = Math.random() * 0.7;
      const voyelle = (["a", "e", "o"] as const)[Math.floor(Math.random() * 3)]!;
      syllabe(depart, {
        duree: 0.7 + Math.random() * 0.9,
        f0: 190 + Math.random() * 230,
        voyelle,
        gain: 0.045 + Math.random() * 0.035,
        chute: 0.9 + Math.random() * 0.16,
        souffle: 0.2,
      });
    }
    // Applaudissements : la densité culmine tôt, puis se clairsème.
    for (let i = 0; i < 80; i += 1) {
      const t = Math.pow(Math.random(), 0.55) * 1.9;
      noise(t, 0.035, 0.048 + Math.random() * 0.056, 2800, 1200, "bandpass");
    }
    // La rumeur de fond, qui lie le tout.
    noise(0, 1.9, 0.088, 500, 1400, "bandpass");
  },
};

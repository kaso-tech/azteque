// Effets sonores synthétisés (Web Audio) — aucun fichier externe requis.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/**
 * Le contexte audio, créé au besoin.
 *
 * Séparé de `audio()` parce que décoder un fichier n'est pas le jouer : la
 * console doit pouvoir vérifier qu'un son téléversé s'ouvre, même chez un
 * administrateur qui a coupé le son du jeu.
 */
function creerContexte(): AudioContext | null {
  if (typeof window === "undefined") return null;
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

function audio(): AudioContext | null {
  return enabled ? creerContexte() : null;
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
  // Un volume nul est un ordre de silence, pas une erreur : la console permet
  // de descendre un son à zéro, et une rampe exponentielle ne peut pas
  // atteindre le zéro — elle lève. On se tait plutôt que de rompre.
  if (!(gainValue > 0.00002)) return;
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
  // Un volume nul est un ordre de silence, pas une erreur : la console permet
  // de descendre un son à zéro, et une rampe exponentielle ne peut pas
  // atteindre le zéro — elle lève. On se tait plutôt que de rompre.
  if (!(gainValue > 0.00002)) return;
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
  // Un volume nul est un ordre de silence, pas une erreur : la console permet
  // de descendre un son à zéro, et une rampe exponentielle ne peut pas
  // atteindre le zéro — elle lève. On se tait plutôt que de rompre.
  if (!(gainValue > 0.00002)) return;
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
function riffle(at: number, g = 1, s = 1) {
  const n = 22;
  for (let i = 0; i < n; i += 1) {
    // Les cartes tombent d'abord lentement puis s'emballent : l'écart se
    // resserre à mesure que les moitiés se vident.
    const t = at + 0.34 * s * Math.pow(i / n, 0.72) + Math.random() * 0.006;
    noise(t, 0.018, (0.045 + Math.random() * 0.02) * g, 3400, 1500, "bandpass");
  }
  noise(at, 0.3 * s, 0.045 * g, 900, 2600, "bandpass");
}

/* ---------- Réglages ---------- */

/**
 * Les quinze sons du jeu, réglables depuis la console d'administration.
 *
 * Chacun se règle sur trois axes : le volume, la hauteur et la vitesse. Ce
 * n'est pas un synthétiseur complet — on ne redessine pas un son depuis une
 * page web — mais c'est ce qui permet d'adoucir un effet trop present, de
 * rendre un rire plus grave ou de presser une distribution sans toucher au
 * code ni redéployer.
 */
export const SOUND_IDS = [
  "place",
  "beat",
  "collect",
  "draw",
  "sweep",
  "shuffle",
  "dealCard",
  "snicker",
  "chuckle",
  "taunt",
  "cheer",
  "trumpLaugh",
  "sweepLaugh",
  "landslideLaugh",
  "streakLaugh",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

/** Ce qu'un son doit dire de lui-même dans la console. */
export const SOUND_LABELS: Record<SoundId, string> = {
  place: "Carte posée",
  beat: "Carte battue",
  collect: "Pli ramassé",
  draw: "Pioche",
  sweep: "Atout 10 — tas raflé",
  shuffle: "Battage du paquet",
  dealCard: "Carte distribuée",
  snicker: "Ricanement — bonne volée",
  chuckle: "Rire — compte annoncé",
  taunt: "Rire moqueur — tour perdu",
  cheer: "Acclamations — tour gagné",
  trumpLaugh: "Rire — atout annoncé",
  sweepLaugh: "Rire — tas raflé (Atout 10)",
  landslideLaugh: "Rire — tour dominé (13 bonnes ou plus)",
  streakLaugh: "Rire — trois bonnes d'affilée",
};

export interface SoundTuning {
  /** Volume, 1 = valeur d'origine. */
  gain: number;
  /** Hauteur, 1 = valeur d'origine. */
  pitch: number;
  /** Vitesse, 1 = valeur d'origine ; au-dessus de 1, plus lent. */
  speed: number;
  /** Rires : nombre de syllabes. */
  syllables: number;
  /** Rires : rapport de hauteur d'une syllabe à la suivante. */
  step: number;
  /** Rires : la voyelle prononcée, 0 pour « a », 1 pour « e », 2 pour « o ». */
  vowel: number;
  /** Acclamations : nombre de voix dans la foule. */
  voices: number;
  /** Acclamations : densité des applaudissements. */
  claps: number;
}

/**
 * Ce que chaque son laisse régler au-delà du volume, de la hauteur et de la
 * vitesse. Un bruit de carton n'a pas de syllabes ; une foule n'a pas de
 * voyelle. La console n'affiche que ce qui a du sens.
 */
export const SOUND_EXTRAS: Record<SoundId, (keyof SoundTuning)[]> = {
  place: [],
  beat: [],
  collect: [],
  draw: [],
  sweep: [],
  shuffle: [],
  dealCard: [],
  snicker: ["syllables", "step", "vowel"],
  chuckle: ["syllables", "step", "vowel"],
  taunt: ["syllables", "step", "vowel"],
  cheer: ["voices", "claps"],
  trumpLaugh: ["syllables", "step", "vowel"],
  sweepLaugh: ["syllables", "step", "vowel"],
  landslideLaugh: ["syllables", "step", "vowel"],
  streakLaugh: ["syllables", "step", "vowel"],
};

/** Bornes de chaque réglage : au-delà, le son cesse d'être un son. */
export const SOUND_RANGES: Record<keyof SoundTuning, { min: number; max: number; step: number }> = {
  gain: { min: 0, max: 3, step: 0.05 },
  pitch: { min: 0.5, max: 2, step: 0.05 },
  speed: { min: 0.5, max: 2, step: 0.05 },
  syllables: { min: 1, max: 8, step: 1 },
  step: { min: 0.75, max: 1.25, step: 0.01 },
  vowel: { min: 0, max: 2, step: 1 },
  voices: { min: 2, max: 30, step: 1 },
  claps: { min: 0, max: 200, step: 5 },
};

export const SOUND_TUNING_LABELS: Record<keyof SoundTuning, string> = {
  gain: "Volume",
  pitch: "Hauteur",
  speed: "Vitesse",
  syllables: "Syllabes",
  step: "Descente",
  vowel: "Voyelle",
  voices: "Voix",
  claps: "Applaudissements",
};

export interface SoundSettings {
  /** Volume général, appliqué par-dessus les réglages individuels. */
  master: number;
  sounds: Partial<Record<SoundId, Partial<SoundTuning>>>;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { master: 1, sounds: {} };

let reglages: SoundSettings = DEFAULT_SOUND_SETTINGS;

/**
 * Applique des réglages venus de la base.
 *
 * Ils arrivent d'une colonne `jsonb` que seul un administrateur écrit, mais
 * une valeur aberrante — négative, immense, absente — ne doit pas rendre le jeu
 * muet ou assourdissant : chaque nombre est ramené dans une plage tenable.
 */
export function applySoundSettings(raw: unknown): void {
  const borne = (v: unknown, min: number, max: number, defaut: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : defaut;
  const o = (raw ?? {}) as { master?: unknown; sounds?: Record<string, unknown> };
  const sounds: SoundSettings["sounds"] = {};
  for (const id of SOUND_IDS) {
    const t = (o.sounds?.[id] ?? {}) as Partial<SoundTuning>;
    const defauts = DEFAUTS_PAR_SON[id];
    const regle: Partial<SoundTuning> = {
      gain: borne(t.gain, 0, 3, 1),
      pitch: borne(t.pitch, 0.5, 2, 1),
      speed: borne(t.speed, 0.5, 2, 1),
    };
    for (const clef of SOUND_EXTRAS[id]) {
      const b = SOUND_RANGES[clef];
      regle[clef] = borne(t[clef], b.min, b.max, defauts[clef] ?? 1);
    }
    sounds[id] = regle;
  }
  reglages = { master: borne(o.master, 0, 2, 1), sounds };
}

/**
 * Les valeurs d'origine des réglages propres à chaque son.
 *
 * Elles doivent suivre ce que fait la synthèse : un curseur laissé au repos ne
 * doit rien changer au son que le jeu produisait avant que la console
 * n'existe.
 */
const DEFAUTS_PAR_SON: Record<SoundId, Partial<SoundTuning>> = {
  place: {},
  beat: {},
  collect: {},
  draw: {},
  sweep: {},
  shuffle: {},
  dealCard: {},
  snicker: { syllables: 3, step: 0.9, vowel: 1 },
  chuckle: { syllables: 4, step: 1.02, vowel: 1 },
  taunt: { syllables: 5, step: 0.9, vowel: 0 },
  cheer: { voices: 14, claps: 80 },
  trumpLaugh: { syllables: 2, step: 1.08, vowel: 0 },
  sweepLaugh: { syllables: 4, step: 0.92, vowel: 0 },
  landslideLaugh: { syllables: 7, step: 0.94, vowel: 0 },
  streakLaugh: { syllables: 4, step: 0.97, vowel: 1 },
};

/** Les réglages en vigueur, tels que la console doit les afficher. */
export function currentSoundSettings(): SoundSettings {
  return { master: reglages.master, sounds: { ...reglages.sounds } };
}

/** Les trois facteurs d'un son : volume, hauteur, vitesse. */
function reglage(id: SoundId) {
  const t = reglages.sounds[id] ?? {};
  const d = DEFAUTS_PAR_SON[id];
  const VOYELLE = ["a", "e", "o"] as const;
  return {
    g: (t.gain ?? 1) * reglages.master,
    p: t.pitch ?? 1,
    s: t.speed ?? 1,
    syllabes: Math.round(t.syllables ?? d.syllables ?? 3),
    pas: t.step ?? d.step ?? 0.93,
    voyelle: VOYELLE[Math.round(t.vowel ?? d.vowel ?? 0)] ?? "a",
    voix: Math.round(t.voices ?? d.voices ?? 14),
    claps: Math.round(t.claps ?? d.claps ?? 80),
  };
}

/* ---------- Sons locaux ---------- */

/*
 * Un son du jeu peut être remplacé par un vrai enregistrement, installé depuis
 * la console. Le fichier décodé s'ajoute ici ; à partir de là, la synthèse
 * correspondante ne joue plus. Le retirer suffit à la faire revenir — rien
 * n'est perdu, puisqu'elle n'a jamais été qu'un peu de code.
 */
const echantillons = new Map<SoundId, AudioBuffer>();

/** Vrai si cette chaîne nomme un son du jeu. */
export function isSoundId(v: string): v is SoundId {
  return (SOUND_IDS as readonly string[]).includes(v);
}

/**
 * Installe un fichier à la place d'un son synthétisé.
 *
 * Le décodage sert aussi de contrôle : un fichier que le navigateur ne sait
 * pas ouvrir lève ici, avant d'être envoyé à la base et de rendre le son muet
 * chez tout le monde.
 */
export async function registerSample(id: SoundId, bytes: ArrayBuffer): Promise<void> {
  const ac = creerContexte();
  if (!ac) throw new Error("Ce navigateur ne sait pas lire de son.");
  // `decodeAudioData` vide le tampon qu'on lui passe : on lui en donne une
  // copie, pour que l'appelant puisse encore l'envoyer à la base.
  const buffer = await ac.decodeAudioData(bytes.slice(0)).catch(() => {
    // Le navigateur dit « Unable to decode audio data » : exact, en anglais,
    // et sans dire quoi faire.
    throw new Error("Ce fichier ne s'ouvre pas comme un son. Essayez un MP3, un WAV ou un OGG.");
  });
  echantillons.set(id, buffer);
}

/** Rend un son à sa synthèse. */
export function clearSample(id: SoundId): void {
  echantillons.delete(id);
}

/** Vrai si ce son est joué depuis un fichier. */
export function hasSample(id: SoundId): boolean {
  return echantillons.has(id);
}

/**
 * Joue le fichier installé pour ce son, s'il y en a un.
 *
 * Renvoie vrai dès qu'un fichier existe, y compris quand le son est coupé :
 * ce qui a été remplacé reste remplacé, et la synthèse ne doit jamais prendre
 * le relais dans le dos de l'administrateur.
 */
function echantillon(id: SoundId): boolean {
  const buffer = echantillons.get(id);
  if (!buffer) return false;
  const ac = audio();
  if (!ac) return true;
  const { g, p, s } = reglage(id);
  if (!(g > 0)) return true;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  // Un enregistrement n'a qu'une commande pour la hauteur et la vitesse : le
  // relire plus vite le rend plus aigu. Les deux curseurs se combinent donc,
  // au lieu d'agir séparément comme sur la synthèse.
  src.playbackRate.value = Math.min(4, Math.max(0.25, p / s));
  const gain = ac.createGain();
  gain.gain.value = Math.min(4, g);
  src.connect(gain).connect(ac.destination);
  src.start(ac.currentTime);
  return true;
}

export const sfx = {
  /** Le paquet est battu : deux riffles, puis la coupe. */
  shuffle() {
    if (echantillon("shuffle")) return;
    const { g, s } = reglage("shuffle");
    riffle(0, g, s);
    riffle(0.4 * s, g, s);
    noise(0.82 * s, 0.17 * s, 0.13 * g, 700, 200, "lowpass");
    tone(0.83 * s, 130, 0.11 * s, 0.045 * g, "sine", 82);
  },
  /** Une carte glisse du paquet vers une main. */
  dealCard() {
    if (echantillon("dealCard")) return;
    const { g, p, s } = reglage("dealCard");
    noise(0, 0.07 * s, 0.1 * g, 3600 * p, 1400 * p, "bandpass");
    tone(0.005, 240 * p, 0.05 * s, 0.03 * g, "sine", 150 * p);
  },
  /** La carte quitte la main et se pose sur la table. */
  place() {
    if (echantillon("place")) return;
    const { g, p, s } = reglage("place");
    noise(0, 0.13 * s, 0.16 * g, 2600 * p, 700 * p);
    tone(0.01, 190 * p, 0.08 * s, 0.05 * g, "sine", 120 * p);
  },
  /** La seconde carte bat la première. */
  beat() {
    if (echantillon("beat")) return;
    const { g, p, s } = reglage("beat");
    noise(0, 0.16 * s, 0.2 * g, 3800 * p, 900 * p);
    tone(0.02, 420 * p, 0.16 * s, 0.07 * g, "triangle", 660 * p);
    tone(0.09 * s, 660 * p, 0.22 * s, 0.05 * g, "sine", 880 * p);
  },
  /** Le pli est ramassé sur un tas. */
  collect() {
    if (echantillon("collect")) return;
    const { g, p, s } = reglage("collect");
    noise(0, 0.22 * s, 0.14 * g, 1500 * p, 320 * p, "lowpass");
    tone(0.05 * s, 150 * p, 0.14 * s, 0.045 * g, "sine", 96 * p);
  },
  /** Une carte est tirée de la pioche. */
  draw() {
    if (echantillon("draw")) return;
    const { g, p, s } = reglage("draw");
    noise(0, 0.1 * s, 0.1 * g, 3200 * p, 1200 * p);
  },
  /** Atout 10 : tout le tas adverse est raflé. */
  sweep() {
    if (echantillon("sweep")) return;
    const { g, p, s } = reglage("sweep");
    noise(0, 0.55 * s, 0.22 * g, 900 * p, 4200 * p, "bandpass");
    noise(0.18 * s, 0.45 * s, 0.16 * g, 2400 * p, 400 * p, "lowpass");
    tone(0.02, 330 * p, 0.5 * s, 0.06 * g, "triangle", 990 * p);
    tone(0.22 * s, 494 * p, 0.36 * s, 0.05 * g, "sine", 740 * p);
    tone(0.42 * s, 740 * p, 0.4 * s, 0.045 * g, "triangle", 988 * p);
  },
  /**
   * Ricanement bref, quand on prend une bonne à l'adversaire. Voix moyenne,
   * trois syllabes serrées : de quoi se moquer, pas de quoi triompher.
   */
  snicker() {
    if (echantillon("snicker")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("snicker");
    rire(0, { syllabes, f0: 300 * p, pas, tempo: 0.15 * s, voyelle, gain: 0.19 * g });
  },
  /** Rire clair et chantant : un compte vient d'être annoncé. */
  chuckle() {
    if (echantillon("chuckle")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("chuckle");
    rire(0, {
      syllabes,
      f0: 380 * p,
      pas,
      tempo: 0.13 * s,
      voyelle,
      gain: 0.24 * g,
      reprise: false,
    });
    tone(0.03, 660 * p, 0.26 * s, 0.035 * g, "triangle", 990 * p);
  },
  /** Rire moqueur : voix grave, syllabes lentes qui descendent. */
  taunt() {
    if (echantillon("taunt")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("taunt");
    rire(0, { syllabes, f0: 210 * p, pas, tempo: 0.21 * s, voyelle, gain: 0.28 * g });
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
    if (echantillon("cheer")) return;
    const { g, p, s, voix, claps } = reglage("cheer");
    for (let i = 0; i < voix; i += 1) {
      const depart = Math.random() * 0.7 * s;
      const voyelle = (["a", "e", "o"] as const)[Math.floor(Math.random() * 3)]!;
      syllabe(depart, {
        duree: (0.7 + Math.random() * 0.9) * s,
        f0: (190 + Math.random() * 230) * p,
        voyelle,
        gain: (0.045 + Math.random() * 0.035) * g,
        chute: 0.9 + Math.random() * 0.16,
        souffle: 0.2,
      });
    }
    // Applaudissements : la densité culmine tôt, puis se clairsème.
    for (let i = 0; i < claps; i += 1) {
      const t = Math.pow(Math.random(), 0.55) * 1.9 * s;
      noise(t, 0.035 * s, (0.048 + Math.random() * 0.056) * g, 2800, 1200, "bandpass");
    }
    // La rumeur de fond, qui lie le tout.
    noise(0, 1.9 * s, 0.088 * g, 500, 1400, "bandpass");
  },
  /**
   * Rire bref et affirmé : la couleur d'atout vient d'être fixée pour le
   * tour. Deux syllabes qui montent, comme une déclaration plutôt qu'une
   * moquerie — l'atout se choisit, il ne se vole pas.
   */
  trumpLaugh() {
    if (echantillon("trumpLaugh")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("trumpLaugh");
    rire(0, {
      syllabes,
      f0: 340 * p,
      pas,
      tempo: 0.14 * s,
      voyelle,
      gain: 0.23 * g,
      reprise: false,
    });
    tone(0.04 * s, 520 * p, 0.28 * s, 0.045 * g, "triangle", 780 * p);
  },
  /**
   * Rire qui accompagne le transfert de tas : le 10 d'atout vient de rafler
   * tout le tas adverse. Un léger temps de retard le laisse suivre le
   * souffle du transfert plutôt que le couvrir.
   */
  sweepLaugh() {
    if (echantillon("sweepLaugh")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("sweepLaugh");
    rire(0.1 * s, { syllabes, f0: 260 * p, pas, tempo: 0.16 * s, voyelle, gain: 0.27 * g });
  },
  /**
   * Rire long et retentissant : treize bonnes ou plus en un seul tour, la
   * partie est pliée d'un coup. Plus de syllabes et plus de voix que le rire
   * moqueur d'un tour ordinaire — cette victoire-là n'a rien d'ordinaire.
   */
  landslideLaugh() {
    if (echantillon("landslideLaugh")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("landslideLaugh");
    rire(0, { syllabes, f0: 300 * p, pas, tempo: 0.15 * s, voyelle, gain: 0.3 * g });
  },
  /**
   * Rire malicieux : trois bonnes prises d'affilée sans que l'adversaire
   * n'en reprenne une seule. Une petite fanfare de rien, pour la série
   * plutôt que pour une bonne isolée — c'est déjà le rôle de « snicker ».
   */
  streakLaugh() {
    if (echantillon("streakLaugh")) return;
    const { g, p, s, syllabes, pas, voyelle } = reglage("streakLaugh");
    rire(0, { syllabes, f0: 330 * p, pas, tempo: 0.13 * s, voyelle, gain: 0.24 * g });
    tone(0.05 * s, 587 * p, 0.22 * s, 0.03 * g, "triangle", 880 * p);
  },
};

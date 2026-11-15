// Procedural music theme data and pure arrangement logic. NEW-DESIGN, nothing derived from original Abuse audio.
// A bar is 16 sixteenth-note steps. A song is a form of sections (intro / A / B / break); every section turns a set
// of layers on or off. Core Warden adds layers with its phase (intensity I..III). Dark industrial minor-key palette.
import type { ThemeId } from './audioLogic.ts';

export const STEPS_PER_BAR = 16;
export type Chord = readonly number[];
export type SectionName = 'intro' | 'a' | 'b' | 'break';
export type LayerName = 'pad' | 'arp' | 'bass' | 'kick' | 'snare' | 'hat' | 'perc' | 'lead';
export type LayerMask = Record<LayerName, boolean>;
export type Pattern = (number | null)[];

const MIN: Chord = [0, 3, 7];
const MAJ: Chord = [0, 4, 7];
const DIM: Chord = [0, 3, 6];
const MAJ7: Chord = [0, 4, 7, 11];
const SUS: Chord = [0, 5, 7];

export interface ProgStep {
  /** Semitones above the theme root. */
  r: number;
  chord: Chord;
}

export interface ThemeDef {
  bpm: number;
  /** Chord root in Hz of the first progression step (low octave). */
  root: number;
  /** One chord per bar, looped. */
  prog: ProgStep[];
  /** 16-step note patterns as semitones above the bar root (null = rest). arp sits two octaves up, lead three. */
  arp: Pattern;
  bassLine: Pattern;
  lead: Pattern;
  /** 16-char patterns. kick/snare/hat: 'x' hit, 'o' open hat. perc: 'c' metal clang, 't' tom. */
  kick: string;
  snare: string;
  hat: string;
  perc: string;
  padWave: OscillatorType;
  arpWave: OscillatorType;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  padGain: number;
  arpGain: number;
  bassGain: number;
  leadGain: number;
  /** Music reverb send 0..1 and tempo-synced delay (in beats) with feedback. */
  wet: number;
  delayBeats: number;
  delayFb: number;
  /** Sidechain pump depth 0..0.6 applied to pad and arp on each kick. */
  duck: number;
  form: 'song' | 'loop';
}

/** '0 . 7 . 12' -> [0, null, 7, null, 12]. Always padded or cut to 16 steps. */
function seq(s: string): Pattern {
  const out: Pattern = s.trim().split(/\s+/).map((t) => (t === '.' ? null : Number(t)));
  while (out.length < STEPS_PER_BAR) out.push(null);
  return out.slice(0, STEPS_PER_BAR);
}
const NONE = '................';

export const THEMES: Record<ThemeId, ThemeDef> = {
  // Cryo Airlock: cold ambient synth, glassy sine arpeggio over a sub drone, almost no drums.
  airlock: {
    bpm: 70, root: 55, prog: [{ r: 0, chord: MIN }, { r: -4, chord: MAJ }, { r: -2, chord: MAJ }, { r: -5, chord: MIN }],
    arp: seq('0 . . . 7 . . . 12 . . . 7 . 3 .'), bassLine: seq('0 . . . . . . . . . . . . . . .'), lead: seq('. . . . . . 12 . . . 15 . 14 . . .'),
    kick: NONE, snare: NONE, hat: '..x.......x.....', perc: NONE,
    padWave: 'sine', arpWave: 'sine', bassWave: 'sine', leadWave: 'triangle', padGain: 0.034, arpGain: 0.03, bassGain: 0.06, leadGain: 0.026,
    wet: 0.5, delayBeats: 0.75, delayFb: 0.45, duck: 0.12, form: 'song',
  },
  // Central Transit Shaft: D dorian, steady machine pulse, rising lines.
  shaft: {
    bpm: 86, root: 73.4, prog: [{ r: 0, chord: MIN }, { r: 5, chord: MAJ }, { r: -2, chord: MAJ }, { r: 3, chord: MAJ }],
    arp: seq('0 7 10 12 10 7 5 7 0 7 10 14 12 10 7 5'), bassLine: seq('0 . 0 . . 0 . 0 0 . 0 . . 7 . 5'), lead: seq('12 . . 14 . . 15 . 17 . . . 14 . . .'),
    kick: 'x.......x.....x.', snare: '........x.......', hat: '..x...x...x...x.', perc: '.......t.......t',
    padWave: 'triangle', arpWave: 'triangle', bassWave: 'sawtooth', leadWave: 'square', padGain: 0.028, arpGain: 0.024, bassGain: 0.05, leadGain: 0.016,
    wet: 0.3, delayBeats: 0.75, delayFb: 0.3, duck: 0.35, form: 'song',
  },
  // Sunken Mines: phrygian, slow and heavy, industrial metal percussion and gritty bass.
  mines: {
    bpm: 64, root: 69.3, prog: [{ r: 0, chord: [0, 7, 12] }, { r: 1, chord: [0, 7, 12] }, { r: 0, chord: MIN }, { r: -2, chord: [0, 7, 12] }],
    arp: seq('0 . . 1 . . 7 . . . 0 . . 1 . .'), bassLine: seq('0 . . 0 . . 1 . . . 0 . -2 . . .'), lead: seq('. . . . 12 . . . . . 13 . . . 7 .'),
    kick: 'x.......x..x....', snare: '........x.......', hat: NONE, perc: '..c.....c..c...c',
    padWave: 'sawtooth', arpWave: 'triangle', bassWave: 'sawtooth', leadWave: 'sawtooth', padGain: 0.02, arpGain: 0.03, bassGain: 0.06, leadGain: 0.014,
    wet: 0.42, delayBeats: 1.5, delayFb: 0.4, duck: 0.4, form: 'song',
  },
  // Bio-Labs: lydian, dreamy arpeggio washed in delay and reverb.
  biolabs: {
    bpm: 98, root: 46.25, prog: [{ r: 0, chord: MAJ7 }, { r: 4, chord: MIN }, { r: 2, chord: MAJ }, { r: 7, chord: MAJ }],
    arp: seq('12 16 19 16 14 18 21 18 12 16 19 23 21 18 16 14'), bassLine: seq('0 . . . . . 0 . . . . . 4 . . .'), lead: seq('. . 24 . . . 23 . 21 . . . 19 . . .'),
    kick: 'x.......x.......', snare: NONE, hat: '..x...x...x...x.', perc: NONE,
    padWave: 'sine', arpWave: 'sine', bassWave: 'sine', leadWave: 'triangle', padGain: 0.034, arpGain: 0.03, bassGain: 0.07, leadGain: 0.022,
    wet: 0.55, delayBeats: 0.75, delayFb: 0.55, duck: 0.3, form: 'song',
  },
  // Upper Security Deck: tense E minor pulse, dry and tight, driving square sequence.
  security: {
    bpm: 112, root: 82.4, prog: [{ r: 0, chord: MIN }, { r: 0, chord: MIN }, { r: -4, chord: MAJ }, { r: -2, chord: MAJ }],
    arp: seq('0 0 7 0 3 0 10 7 0 0 7 0 3 0 12 10'), bassLine: seq('0 0 . 0 0 . 0 . 0 0 . 0 0 . 7 .'), lead: seq('12 . . . 15 . 14 . 12 . . . 10 . 7 .'),
    kick: 'x..x..x.x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx', perc: '...............t',
    padWave: 'sawtooth', arpWave: 'square', bassWave: 'sawtooth', leadWave: 'square', padGain: 0.018, arpGain: 0.016, bassGain: 0.05, leadGain: 0.013,
    wet: 0.1, delayBeats: 0.5, delayFb: 0.25, duck: 0.45, form: 'song',
  },
  // Core Vault: locrian, very low and wide dark synth, slow pulse.
  core: {
    bpm: 56, root: 32.7, prog: [{ r: 0, chord: DIM }, { r: 1, chord: MAJ }, { r: 0, chord: DIM }, { r: 6, chord: MAJ }],
    arp: seq('0 . . . . . 6 . . . 1 . . . . .'), bassLine: seq('0 . . . . . . . 1 . . . . . . .'), lead: seq('. . . . 12 . . . . . . . 18 . 13 .'),
    kick: 'x.......x.x.....', snare: NONE, hat: NONE, perc: '.......c........',
    padWave: 'sawtooth', arpWave: 'sine', bassWave: 'sawtooth', leadWave: 'sawtooth', padGain: 0.034, arpGain: 0.03, bassGain: 0.08, leadGain: 0.012,
    wet: 0.5, delayBeats: 1, delayFb: 0.5, duck: 0.4, form: 'song',
  },
  // Core Warden: fast D minor, double kick, aggressive saw lead. Layers stack with the boss phase.
  boss: {
    bpm: 140, root: 73.4, prog: [{ r: 0, chord: MIN }, { r: 0, chord: MIN }, { r: 1, chord: MAJ }, { r: -2, chord: MAJ }],
    arp: seq('0 3 7 12 7 3 10 7 0 3 7 12 15 12 10 7'), bassLine: seq('0 0 . 0 0 . 0 . 0 0 . 0 1 . 0 .'), lead: seq('12 . 15 . 19 . 17 . 15 . 12 . 10 . 12 .'),
    kick: 'x.x.x.xxx.x.x.xx', snare: '....x.......x..x', hat: '.x.x.x.x.x.x.x.x', perc: 'c......c..c.....',
    padWave: 'sawtooth', arpWave: 'sawtooth', bassWave: 'sawtooth', leadWave: 'sawtooth', padGain: 0.028, arpGain: 0.022, bassGain: 0.065, leadGain: 0.02,
    wet: 0.22, delayBeats: 0.75, delayFb: 0.35, duck: 0.5, form: 'loop',
  },
  // Meltdown escape: urgent A phrygian, relentless eighths, two-tone alarm lead.
  meltdown: {
    bpm: 164, root: 65.4, prog: [{ r: 0, chord: MIN }, { r: 1, chord: MAJ }, { r: 0, chord: MIN }, { r: 5, chord: SUS }],
    arp: seq('0 12 7 12 0 12 8 12 0 12 7 12 0 12 8 12'), bassLine: seq('0 . 0 . 0 . 0 . 0 . 0 . 1 . 1 .'), lead: seq('12 12 12 12 7 7 7 7 12 12 12 12 7 7 7 7'),
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xxxxxxxxxxxxxxxx', perc: 'c.......c.......',
    padWave: 'square', arpWave: 'sawtooth', bassWave: 'sawtooth', leadWave: 'square', padGain: 0.024, arpGain: 0.026, bassGain: 0.06, leadGain: 0.018,
    wet: 0.18, delayBeats: 0.5, delayFb: 0.3, duck: 0.5, form: 'loop',
  },
  // Title / attract screen: ominous industrial drone, sparse metal hits, lonely minor motif.
  title: {
    bpm: 52, root: 41.2, prog: [{ r: 0, chord: MIN }, { r: 0, chord: MIN }, { r: -4, chord: MAJ }, { r: -5, chord: DIM }],
    arp: seq('0 . . . . . . . 3 . . . . . 7 .'), bassLine: seq('0 . . . . . . . . . . . . . . .'), lead: seq('. . . . 12 . . . 15 . 14 . . . . .'),
    kick: 'x...............', snare: NONE, hat: NONE, perc: '........c.......',
    padWave: 'sawtooth', arpWave: 'sine', bassWave: 'sine', leadWave: 'triangle', padGain: 0.03, arpGain: 0.03, bassGain: 0.08, leadGain: 0.024,
    wet: 0.6, delayBeats: 1.5, delayFb: 0.5, duck: 0.25, form: 'song',
  },
  // Victory ending: the same palette resolved to major, steady and warm.
  victory: {
    bpm: 96, root: 65.4, prog: [{ r: 0, chord: MAJ }, { r: -3, chord: MIN }, { r: -7, chord: MAJ }, { r: -5, chord: MAJ }],
    arp: seq('12 16 19 24 19 16 19 16 12 16 19 24 26 24 19 16'), bassLine: seq('0 . . . 0 . . . 0 . . . 0 . 7 .'), lead: seq('24 . . . 28 . 26 . 24 . . . 19 . . .'),
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', perc: NONE,
    padWave: 'triangle', arpWave: 'sine', bassWave: 'triangle', leadWave: 'triangle', padGain: 0.032, arpGain: 0.03, bassGain: 0.06, leadGain: 0.024,
    wet: 0.4, delayBeats: 0.75, delayFb: 0.4, duck: 0.25, form: 'song',
  },
};

// ---- Pure arrangement logic ----
export interface FormEntry {
  section: SectionName;
  bars: number;
}
export const FORM_SONG: readonly FormEntry[] = [
  { section: 'intro', bars: 2 }, { section: 'a', bars: 4 }, { section: 'b', bars: 4 }, { section: 'a', bars: 4 }, { section: 'b', bars: 4 }, { section: 'break', bars: 2 },
];
export const FORM_LOOP: readonly FormEntry[] = [{ section: 'a', bars: 4 }, { section: 'b', bars: 4 }, { section: 'a', bars: 4 }, { section: 'b', bars: 4 }];

const ALL_OFF: LayerMask = { pad: false, arp: false, bass: false, kick: false, snare: false, hat: false, perc: false, lead: false };
const mask = (...on: LayerName[]): LayerMask => {
  const m = { ...ALL_OFF };
  for (const k of on) m[k] = true;
  return m;
};
export const SECTION_LAYERS: Record<SectionName, LayerMask> = {
  intro: mask('pad', 'arp'),
  a: mask('pad', 'arp', 'bass', 'kick', 'hat', 'perc'),
  b: mask('pad', 'arp', 'bass', 'kick', 'snare', 'hat', 'perc', 'lead'),
  break: mask('pad', 'lead'),
};
/** Core Warden layers by phase: I is a kick/bass/pad grind, II adds arp, snare and hats, III adds the lead. */
export const INTENSITY_LAYERS: Record<1 | 2 | 3, LayerMask> = {
  1: mask('pad', 'bass', 'kick', 'perc'),
  2: mask('pad', 'bass', 'kick', 'perc', 'arp', 'snare', 'hat'),
  3: mask('pad', 'bass', 'kick', 'perc', 'arp', 'snare', 'hat', 'lead'),
};

export function formOf(def: ThemeDef): readonly FormEntry[] {
  return def.form === 'loop' ? FORM_LOOP : FORM_SONG;
}

export interface FormPos {
  section: SectionName;
  barInSection: number;
  sectionBars: number;
  /** True on the last bar of an A or B section (drum fill on its last beat). */
  fill: boolean;
  /** True on the last bar of a break (riser). */
  riser: boolean;
  /** True on the first bar of any section after the start. */
  sectionStart: boolean;
}

/** Position of absolute bar `bar` in the form. The intro plays once; afterwards the form repeats from its second entry. */
export function formAt(form: readonly FormEntry[], bar: number): FormPos {
  const total = form.reduce((s, e) => s + e.bars, 0);
  let b = bar;
  if (form[0].section === 'intro' && bar >= total) {
    const loopStart = form[0].bars;
    b = loopStart + ((bar - loopStart) % (total - loopStart));
  } else b = bar % total;
  let acc = 0;
  for (const e of form) {
    if (b < acc + e.bars) {
      const i = b - acc;
      return {
        section: e.section, barInSection: i, sectionBars: e.bars,
        fill: (e.section === 'a' || e.section === 'b') && i === e.bars - 1,
        riser: e.section === 'break' && i === e.bars - 1,
        sectionStart: i === 0 && bar > 0,
      };
    }
    acc += e.bars;
  }
  return { section: 'a', barInSection: 0, sectionBars: 1, fill: false, riser: false, sectionStart: false };
}

/** Layers sounding at a form position. `intensity` only filters themes with form 'loop' (the boss). */
export function layersAt(pos: FormPos, intensity: 1 | 2 | 3 = 1, boss = false): LayerMask {
  const base = SECTION_LAYERS[pos.section];
  if (!boss) return base;
  const lim = INTENSITY_LAYERS[intensity];
  const out = { ...ALL_OFF };
  for (const k of Object.keys(out) as LayerName[]) out[k] = base[k] && lim[k];
  return out;
}

/** Tempo scale by boss phase: each phase pushes the tempo ~4%. */
export function bpmFor(def: ThemeDef, intensity: 1 | 2 | 3 = 1): number {
  return def.bpm * (1 + 0.04 * (intensity - 1));
}

export function stepSeconds(t: ThemeDef, intensity: 1 | 2 | 3 = 1): number {
  return 60 / bpmFor(t, intensity) / 4;
}

export function barSeconds(t: ThemeDef, intensity: 1 | 2 | 3 = 1): number {
  return stepSeconds(t, intensity) * STEPS_PER_BAR;
}

/** Seconds of one delay repeat, locked to the tempo. */
export function delaySeconds(t: ThemeDef, intensity: 1 | 2 | 3 = 1): number {
  return (60 / bpmFor(t, intensity)) * t.delayBeats;
}

export function chordAt(def: ThemeDef, bar: number): { rootHz: number; chord: Chord } {
  const p = def.prog[bar % def.prog.length];
  return { rootHz: def.root * Math.pow(2, p.r / 12), chord: p.chord };
}

/** Sidechain gain after a kick: drops to 1-depth at the hit, returns to 1 over `release` seconds (linear, matches the scheduled ramp). */
export function duckGainAt(dt: number, depth: number, release = 0.22): number {
  if (dt < 0) return 1;
  if (dt >= release) return 1;
  const k = dt / release;
  return 1 - depth * (1 - k);
}

/** Drum fill: on the last beat of a fill bar, a snare/tom roll that gets louder (steps 12..15). */
export function fillHit(stepInBar: number): number {
  return stepInBar >= 12 ? 0.5 + (stepInBar - 12) * 0.17 : 0;
}

export function semitone(root: number, st: number): number {
  return root * Math.pow(2, st / 12);
}

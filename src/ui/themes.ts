// Procedural music theme data (pure). One theme per sector plus Core Warden boss and Meltdown. NEW-DESIGN.
// A bar is 8 eighth-note steps. `bars` are semitone offsets of the drone root, one per bar, looped.
import type { ThemeId } from './audioLogic.ts';

export interface ThemeDef {
  bpm: number;
  /** Drone root in Hz (low octave). */
  root: number;
  bars: number[];
  /** 8 semitone offsets over the bar root (null = rest), played two octaves above the root. */
  arp: (number | null)[];
  padWave: OscillatorType;
  arpWave: OscillatorType;
  padGain: number;
  arpGain: number;
  /** 8-char patterns, 'x' = hit. */
  kick: string;
  hat: string;
  /** Bass pulse on every kick step. */
  bass: boolean;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  // Cryo Airlock: cold, sparse, A minor, glassy sine arpeggio.
  airlock: { bpm: 70, root: 55, bars: [0, 0, -2, -4], arp: [0, null, 7, null, 12, null, 7, null], padWave: 'sine', arpWave: 'sine', padGain: 0.03, arpGain: 0.03, kick: '........', hat: '........', bass: false },
  // Central Transit Shaft: D dorian, steady pulse, rising lines.
  shaft: { bpm: 86, root: 73.4, bars: [0, 3, 5, 3], arp: [0, 7, 10, 12, 10, 7, 5, 7], padWave: 'triangle', arpWave: 'triangle', padGain: 0.026, arpGain: 0.026, kick: 'x...x...', hat: '..x...x.', bass: true },
  // Sunken Mines: phrygian, slow and heavy, long dark notes.
  mines: { bpm: 60, root: 69.3, bars: [0, 1, 0, -2], arp: [0, null, null, 1, null, 7, null, null], padWave: 'sawtooth', arpWave: 'triangle', padGain: 0.022, arpGain: 0.03, kick: 'x.......', hat: '........', bass: true },
  // Bio-Labs: lydian, bubbly high sine pattern.
  biolabs: { bpm: 98, root: 46.25, bars: [0, 4, 2, 7], arp: [12, 6, 14, 7, 11, 6, 9, 4], padWave: 'sine', arpWave: 'sine', padGain: 0.03, arpGain: 0.034, kick: 'x.......', hat: '.x.x.x.x', bass: false },
  // Upper Security Deck: tense E minor, driving square sequence.
  security: { bpm: 112, root: 82.4, bars: [0, 0, -4, -2], arp: [0, 0, 7, 0, 3, 0, 10, 7], padWave: 'sawtooth', arpWave: 'square', padGain: 0.02, arpGain: 0.018, kick: 'x..xx...', hat: 'x.x.x.x.', bass: true },
  // Core Vault: locrian, very low and wide, slow pulse.
  core: { bpm: 56, root: 32.7, bars: [0, 1, 0, 6], arp: [0, null, null, null, 6, null, 1, null], padWave: 'sawtooth', arpWave: 'sine', padGain: 0.034, arpGain: 0.03, kick: 'x.......', hat: '........', bass: true },
  // Core Warden: fast D minor, double kick, aggressive saw lead.
  boss: { bpm: 144, root: 73.4, bars: [0, 0, 1, -2], arp: [0, 3, 7, 12, 7, 3, 10, 7], padWave: 'sawtooth', arpWave: 'sawtooth', padGain: 0.03, arpGain: 0.026, kick: 'x.x.x.xx', hat: '.x.x.x.x', bass: true },
  // Meltdown escape: urgent A phrygian, relentless eighths.
  meltdown: { bpm: 156, root: 65.4, bars: [0, 1, 0, 5], arp: [0, 12, 7, 12, 0, 12, 8, 12], padWave: 'square', arpWave: 'sawtooth', padGain: 0.026, arpGain: 0.03, kick: 'x.x.x.x.', hat: 'xxxxxxxx', bass: true },
};

export function stepSeconds(t: ThemeDef): number {
  return 60 / t.bpm / 2;
}

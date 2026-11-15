// Judge Reel timeline (pure, no DOM, no Three): the ~90 s scripted cut list behind EXTRAS > Judge Reel,
// the `?reel` URL param and `__reanimatorReel()`. Each world cut names a deterministic setup plus scripted
// input frames; the runtime steps the real sim with them, so nothing here changes a sim rule.

import type { SectorId3D } from '../game3d/types3d.ts';
import type { InputState3D } from '../game3d/world3d.ts';
import type { DebugSetup3D } from './demo.ts';

type Frame = Partial<InputState3D>;
const rep = (n: number, f: Frame): Frame[] => Array.from({ length: n }, () => ({ ...f }));

export type ReelTarget = 'lab' | 'world' | 'endcard';

export interface ReelWorldPlan {
  /** Name of a SHOWCASE_SCENES entry to reuse, when the cut is exactly that scene. */
  scene?: string;
  setup: DebugSetup3D;
  /** Scripted input frames stepped from the fresh world (cut start). After the last frame the operative idles (empty input, aim ahead). */
  inputs: Frame[];
  /** Freeze the opening set piece at this display time instead of stepping (opening cut only). */
  openingAt?: number;
}

export interface ReelCut {
  id: string;
  /** Seconds from reel start. Cuts are contiguous. */
  start: number;
  duration: number;
  target: ReelTarget;
  /** Sector the player must be in after the scripted inputs (world cuts). */
  sector?: SectorId3D;
  plan?: ReelWorldPlan;
  caption: string;
  sub: string;
  view?: 'modern' | 'classic';
  /** Lab cuts: which view to show. */
  labMode?: 'pass' | 'mutation';
  /** Contains strobing or screen-wide flashes; Reduce flashing replaces them with calm fades. */
  flashy: boolean;
  /** Mid-cut change: after `at` seconds into the cut apply this (classic toggle with CRT transition, lab mutation). */
  beats?: { at: number; view?: 'modern' | 'classic'; labMode?: 'pass' | 'mutation'; crt?: boolean }[];
}

// hp 999: the reel is a showpiece, so no cut may end in a death screen (HUD is hidden, sim rules untouched).
const KIT: DebugSetup3D = { boots: true, tanks: 2, weapons: [1, 2, 3, 4], hp: 999 };
const KIT_LATE: DebugSetup3D = { ...KIT, weapons: [1, 2, 3, 4, 5, 6] };
const BOSS: DebugSetup3D = { ...KIT_LATE, x: 80, y: 0, console: true, openDoors: ['door_boss'], hp: 999, skipIntro: true };


/**
 * Warden script (phase II start): a short opening burst, then a Counter press at tick 72, inside the last 10 ticks of the
 * first charge windup (verified by tests/r13-reel.test.ts). The exposed window takes the 3x counter multiplier, and
 * sustained fire carries the Warden into phase III around tick 145.
 */
/**
 * Combat script from (53, 0): Scan Pulse on tick 0, then stand until the first Crawler opens its parry window
 * (ticks 101-116 on this world since the R13 queue fix), press Counter on tick 110, then Pulse, Scattergun and Grenade (tests/r13-reel.test.ts checks 'parry').
 */
const COMBAT_AIM: Frame = { aimX: 62, aimY: 1.1 };
const COMBAT_INPUTS: Frame[] = [
  { ...COMBAT_AIM, scan: true },
  ...rep(109, { ...COMBAT_AIM }),
  { ...COMBAT_AIM, counter: true },
  ...rep(19, { ...COMBAT_AIM }),
  { ...COMBAT_AIM, weaponSlot: 1, fire: true },
  ...rep(59, { ...COMBAT_AIM, fire: true }),
  { ...COMBAT_AIM, weaponSlot: 2, fire: true },
  ...rep(59, { ...COMBAT_AIM, fire: true }),
  { ...COMBAT_AIM, weaponSlot: 3, fire: true },
  ...rep(59, { ...COMBAT_AIM, fire: true }),
  { ...COMBAT_AIM },
];

/** Reclaimer script from the zone's west gate: run in noisily, press Counter inside the grab windup (tick 68 on this world). */
const HUNTER_INPUTS: Frame[] = [...rep(60, { moveX: 1 }), ...rep(8, {}), { counter: true }, {}];

const WARDEN_AIM: Frame = { aimX: 83, aimY: 2.4 };
const WARDEN_INPUTS: Frame[] = [
  ...rep(20, { ...WARDEN_AIM, fire: true }),
  ...rep(52, { ...WARDEN_AIM }),
  { ...WARDEN_AIM, counter: true },
  { ...WARDEN_AIM },
  ...rep(420, { ...WARDEN_AIM, fire: true }),
  { ...WARDEN_AIM },
];

const DEFS: Omit<ReelCut, 'start'>[] = [
  {
    id: 'hook', duration: 12, target: 'lab', labMode: 'pass', flashy: true,
    caption: '1996 DOS physics, verified frame-exact',
    sub: 'Restoration Lab: original log vs engine replay, 11 fields, PASS. Mutate one constant and it fails.',
    beats: [{ at: 6, labMode: 'mutation' }],
  },
  {
    id: 'classic', duration: 10, target: 'world', sector: 'shaft', flashy: true,
    plan: { scene: 'classic', setup: { ...KIT, x: 28, y: -11 }, inputs: rep(40, { moveX: 1 }) },
    caption: '1996 and 2026, same moment',
    sub: 'Classic View: 320x200, 256 colours, Bayer dither. Same sim underneath.',
    view: 'modern',
    beats: [{ at: 4, view: 'classic', crt: true }, { at: 8, view: 'modern', crt: true }],
  },
  {
    id: 'wake', duration: 10, target: 'world', sector: 'airlock', flashy: true,
    plan: { scene: 'opening-alarm', setup: {}, inputs: [], openingAt: 7.0 },
    caption: 'Cryo wake, vent burst',
    sub: 'The opening set piece plays on the real airlock world.',
    view: 'modern',
  },
  {
    id: 'combat', duration: 14, target: 'world', sector: 'biolabs', flashy: false,
    plan: {
      scene: 'combat',
      setup: { ...KIT, tanks: 4, x: 53, y: 0, openDoors: ['door_airlock_shaft'], aimX: 62, aimY: 1.1 },
      inputs: COMBAT_INPUTS,
    },
    caption: 'Parry, scan, then weapons',
    sub: 'Melee Counter staggers lunging foes. Scan Pulse reveals. Four weapons, each with a job.',
    view: 'modern',
  },
  {
    id: 'hunter', duration: 12, target: 'world', sector: 'biolabs', flashy: false,
    plan: { setup: { ...KIT, weapons: [1, 2, 3], x: 59.6, y: 0, openDoors: ['door_airlock_shaft'] }, inputs: HUNTER_INPUTS },
    caption: 'The Reclaimer hunts by sound',
    sub: 'It hears you run. Counter the grab, or walk quietly and stay above its reach.',
    view: 'modern',
  },
  {
    id: 'warden', duration: 12, target: 'world', sector: 'core', flashy: true,
    plan: { scene: 'boss', setup: { ...BOSS, bossPhase: 2 }, inputs: WARDEN_INPUTS },
    caption: 'Core Warden: counter and phases',
    sub: 'Counter the charge in its last ticks, expose the Warden, and push it into phase III.',
    view: 'modern',
  },
  {
    id: 'meltdown', duration: 12, target: 'world', sector: 'airlock', flashy: true,
    plan: { scene: 'escape', setup: { ...KIT_LATE, x: 23.4, y: 5.2, console: true, meltdownTicks: 2400 }, inputs: rep(60, { moveX: -1 }) },
    caption: 'Meltdown: reach the hatch',
    sub: 'The reactor is gone. The bridge collapses behind you.',
    view: 'modern',
  },
  {
    id: 'endcard', duration: 8, target: 'endcard', flashy: false,
    caption: 'REANIMATOR',
    sub: 'Built with Kiro · spec-driven. Abuse physics restored frame-exact, six-sector 3D metroidvania, deterministic sim, open repo. Press any key to play.',
  },
];

function build(): readonly ReelCut[] {
  let t = 0;
  return DEFS.map((d) => {
    const c: ReelCut = { ...d, start: t };
    t += d.duration;
    return c;
  });
}

export const REEL_CUTS: readonly ReelCut[] = build();

export function reelTotalSeconds(): number {
  const l = REEL_CUTS[REEL_CUTS.length - 1];
  return l.start + l.duration;
}

/** Cut active at `time` seconds, clamped to the first and last cut. */
export function reelCutAt(time: number): ReelCut {
  const t = Math.max(0, time);
  for (let i = REEL_CUTS.length - 1; i >= 0; i--) if (t >= REEL_CUTS[i].start) return REEL_CUTS[i];
  return REEL_CUTS[0];
}

/** Whole-reel progress 0..1. */
export function reelProgress(time: number): number {
  return Math.min(1, Math.max(0, time / reelTotalSeconds()));
}

/** Seconds into the cut containing `time`. */
export function reelCutTime(time: number): number {
  return Math.max(0, Math.min(time, reelTotalSeconds()) - reelCutAt(time).start);
}

/** Lower-third caption opacity: 0.4 s fade in, 0.4 s fade out. `calm` (Reduce flashing) keeps it but never snaps. */
export function captionAlpha(cutTime: number, duration: number): number {
  const fade = 0.4;
  const a = Math.min(cutTime / fade, (duration - cutTime) / fade, 1);
  return Math.max(0, a);
}

/** Beat state (view, lab mode, CRT flag) in force at `cutTime` inside a cut. */
export function reelBeatAt(cut: ReelCut, cutTime: number): { view?: 'modern' | 'classic'; labMode?: 'pass' | 'mutation'; crt: boolean } {
  let view = cut.view;
  let labMode = cut.labMode;
  let crt = false;
  for (const b of cut.beats ?? []) {
    if (cutTime >= b.at) {
      if (b.view) view = b.view;
      if (b.labMode) labMode = b.labMode;
      crt = cutTime - b.at < 0.5 && b.crt === true;
    }
  }
  return { view, labMode, crt };
}

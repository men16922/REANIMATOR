// R13: Core Warden readability rules (pure, node-testable, display side only, no lights, no sim writes).
// The Warden is dark gunmetal armour; only its seams and chest core glow, in the phase colour
// (I cyan, II orange, III red). A cool back halo separates the silhouette from the orange-lit arena.
// When the weak point is exposed the core turns gold-white and pulses well above the seams.

import { BOSS_PHASE_COLORS } from './fx3d.ts';

export type Rgb = readonly [number, number, number];

/** Albedo multiplier for the armour plates (the GLB texture is mid-brown; this lands it near gunmetal). */
export const WARDEN_ARMOUR_ALBEDO = 0.4;
/** Cool rim, chosen opposite the orange arena light so the outline always separates. */
export const WARDEN_RIM_HEX = 0x9fd8ff;
export const WARDEN_RIM_STRENGTH = 0.55;
/** Seam emissive ceiling: seams may never out-glow an exposed core. */
export const WARDEN_SEAM_MAX = 1.6;
/** Core emissive while the weak point is exposed. */
export const WARDEN_WEAK_CORE = 3.2;
/** Gold-white weak point colour (matches the exposed popup tier gold). */
export const WARDEN_WEAK_RGB: Rgb = [1.0, 0.86, 0.36];
/** Cool steel-blue back halo colour. */
export const WARDEN_HALO_RGB: Rgb = [0.32, 0.58, 1.0];
/** Fade the weak-point glow over the last ticks of the window so the close reads. */
export const WARDEN_WEAK_FADE_TICKS = 10;

const SUMMON_RGB: Rgb = [0.62, 0.36, 1.0];
const WINDUP_RGB: Rgb = [1.0, 0.26, 0.1];

export interface WardenLookInput {
  phase: number;
  active: boolean;
  alive: boolean;
  exposedTicks: number;
  winding: boolean;
  /** 0..1 progress through the current windup. */
  windFrac: number;
  summon: boolean;
  /** 0..1 intro wake-up amount while the boss is still dormant. */
  intro: number;
  tSec: number;
  reduce: boolean;
}

export interface WardenLook {
  /** Seam and idle core colour. */
  glow: Rgb;
  /** Seam emissive amount (0..WARDEN_SEAM_MAX). */
  seam: number;
  /** Core emissive amount. */
  core: number;
  coreColor: Rgb;
  /** 0..1 back-halo opacity. */
  halo: number;
  /** 0..1 weak-point sprite strength (0 unless exposed). */
  weak: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function mix(a: Rgb, b: Rgb, k: number): Rgb {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Phase emissive colour, clamped to the three defined phases. */
export function wardenPhaseColor(phase: number): Rgb {
  return BOSS_PHASE_COLORS[clamp(Math.round(phase), 1, 3) - 1];
}

/** 0..1 weak-point strength: 0 when closed, full while open, linear fade over the final ticks. */
export function wardenWeakPulse(exposedTicks: number, tSec: number, reduce: boolean): number {
  if (exposedTicks <= 0) return 0;
  const fade = Math.min(1, exposedTicks / WARDEN_WEAK_FADE_TICKS);
  const beat = reduce ? 0.85 : 0.75 + 0.25 * Math.sin(tSec * 14);
  return fade * beat;
}

export function wardenLook(i: WardenLookInput): WardenLook {
  const phaseRgb = wardenPhaseColor(i.phase);
  if (!i.alive) return { glow: phaseRgb, seam: 0, core: 0, coreColor: phaseRgb, halo: 0, weak: 0 };
  if (!i.active) {
    const k = clamp(i.intro, 0, 1);
    return { glow: phaseRgb, seam: 0.15 + 0.6 * k, core: 0.2 + 0.9 * k, coreColor: phaseRgb, halo: 0.45 * k, weak: 0 };
  }
  const ph = clamp(Math.round(i.phase), 1, 3);
  const breathe = i.reduce ? 0 : 0.18 * Math.sin(i.tSec * (1.6 + ph * 0.9));
  let glow = phaseRgb;
  let seam = 0.5 + 0.15 * ph + breathe;
  let core = 0.45 + 0.2 * ph + breathe;
  if (i.winding) {
    const wf = clamp(i.windFrac, 0, 1);
    glow = mix(phaseRgb, i.summon ? SUMMON_RGB : WINDUP_RGB, 0.35 + 0.5 * wf);
    seam += 0.8 * wf;
    core += 0.6 * wf;
  }
  const weak = wardenWeakPulse(i.exposedTicks, i.tSec, i.reduce);
  let coreColor = glow;
  if (weak > 0) {
    coreColor = WARDEN_WEAK_RGB;
    core = Math.max(core, WARDEN_WEAK_CORE * weak);
    // Seams dim so the eye goes to the opening
    seam *= 0.6;
  }
  return { glow, seam: clamp(seam, 0, WARDEN_SEAM_MAX), core, coreColor, halo: 0.55 + 0.1 * (ph - 1), weak };
}

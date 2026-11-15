// R10 display-side set pieces: pure functions of world state / tick. No THREE, no sim writes, no Math.random.
// The Warden arena reacts to its phase (cracks, vents, light shift, falling debris) and the Meltdown escape escalates with the
// remaining ticks (alarm vignette, debris rate). All of it is derived; saving, loading or skipping frames cannot desync the sim.

export const MELTDOWN_TOTAL_TICKS = 90 * 60;

/** Vent glow x positions on the Warden arena floor. */
export const VENT_XS: readonly number[] = [76.5, 84.2, 92];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0 outside the escape, rising to 1 as `meltdownTicks` falls to 0. Non-increasing in the remaining ticks. */
export function meltdownIntensity(meltdownTicks: number, total = MELTDOWN_TOTAL_TICKS): number {
  if (meltdownTicks < 0) return 0;
  const k = clamp01(1 - meltdownTicks / total);
  return k * k * (3 - 2 * k);
}

/** Alarm vignette opacity 0..1. Pulse rate and depth grow with intensity; reduce-motion holds a calm steady glow. */
export function vignetteAlpha(intensity: number, tSec: number, reduce: boolean): number {
  if (intensity <= 0) return 0;
  const base = 0.18 + 0.5 * intensity;
  if (reduce) return base * 0.6;
  const rate = 1.1 + 3.4 * intensity;
  const pulse = 0.5 + 0.5 * Math.sin(tSec * rate * Math.PI * 2);
  return clamp01(base * (0.7 + 0.3 * pulse) + 0.12 * intensity * pulse);
}

/** Falling debris pieces per second during the escape. */
export function debrisPerSecond(intensity: number, reduce: boolean): number {
  if (intensity <= 0) return 0;
  return (3 + 30 * intensity) * (reduce ? 0.35 : 1);
}

/** Sim ticks between two debris pieces (integer, at least 1), 0 when none. */
export function debrisPeriodTicks(intensity: number, reduce: boolean, hz = 60): number {
  const r = debrisPerSecond(intensity, reduce);
  return r <= 0 ? 0 : Math.max(1, Math.round(hz / r));
}

export interface ArenaSetPiece {
  /** Floor fissure glow 0..1 (phase 2 and up). */
  crack: number;
  /** Vent steam 0..1 (phase 2 and up). */
  steam: number;
  /** Arena light shift toward hot red 0..1 (phase 3). */
  tint: number;
  /** Falling ceiling debris 0..1 (phase 3). */
  debris: number;
}

const smooth = (k: number): number => {
  const c = clamp01(k);
  return c * c * (3 - 2 * c);
};

/** Arena set piece for a Warden phase, eased in over `since` display seconds after the phase began. */
export function arenaSetPiece(phase: number, since: number, alive: boolean): ArenaSetPiece {
  if (!alive || phase < 2) return { crack: 0, steam: 0, tint: 0, debris: 0 };
  const e = smooth(since / 1.6);
  if (phase === 2) return { crack: e, steam: e, tint: 0, debris: 0 };
  return { crack: 1, steam: 1, tint: e, debris: e };
}

/** Final-hatch slow-mo beat on the win event: (scale, seconds). */
export function hatchBeat(reduce: boolean): { scale: number; seconds: number } {
  return reduce ? { scale: 0.7, seconds: 0.25 } : { scale: 0.25, seconds: 1.1 };
}

/** Jagged fissure polyline for crack `i` of `n` on the arena floor face: deterministic, no RNG. */
export function crackPath(i: number, x0: number, x1: number, segs = 6): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const cx = x0 + ((i + 0.5) / 8) * (x1 - x0);
  for (let s = 0; s <= segs; s++) {
    const k = s / segs;
    const jitter = Math.sin((i * 7.13 + s * 2.71) * 1.9) * 0.45 * (0.4 + k);
    out.push({ x: cx + jitter, y: -k * (0.55 + 0.3 * ((i * 5) % 3) / 2) });
  }
  return out;
}

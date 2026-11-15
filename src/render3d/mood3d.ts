// Lighting script, pure logic (no WebGL): deterministic broken-fluorescent flicker, rotating beacon phase, reactor
// pulse. Display-only (R3.3): nothing here reads or writes the simulation. GPU side is mood3dGfx.ts.

import type { SectorId3D } from '../game3d/types3d.ts';

/** Cheap integer hash to 0..1. Deterministic across runs. */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

export type LampMode = 'steady' | 'flicker' | 'dying';

/** Share of ceiling lamps that misbehave per sector: [flicker, dying]. Run-down mines and the core are the worst. */
export const SECTOR_LAMP_FAULTS: Record<SectorId3D, readonly [number, number]> = {
  airlock: [0.14, 0.0],
  shaft: [0.18, 0.04],
  mines: [0.26, 0.1],
  biolabs: [0.16, 0.05],
  security: [0.1, 0.03],
  core: [0.24, 0.12],
};

export function lampMode(sector: SectorId3D, seed: number): LampMode {
  const [f, d] = SECTOR_LAMP_FAULTS[sector];
  const h = hash01(seed * 7919 + 13);
  if (h < d) return 'dying';
  if (h < d + f) return 'flicker';
  return 'steady';
}

/** Stable seed for a lamp from its rounded position (same lamp, same seed, every run). */
export function lampSeed(x: number, y: number): number {
  return Math.round(x * 4) * 73856093 ^ Math.round(y * 4) * 19349663;
}

/**
 * Light level 0..1 of a lamp at `tSec`. 'steady' hums within a few percent. 'flicker' runs normally, then stutters
 * in short bursts. 'dying' stutters often and sits dim between bursts. `reduce` replaces strobing with a slow dim.
 */
export function flickerLevel(mode: LampMode, seed: number, tSec: number, reduce = false): number {
  if (mode === 'steady') return 0.97 + 0.03 * Math.sin(tSec * 50 + seed);
  if (reduce) return mode === 'dying' ? 0.7 + 0.12 * Math.sin(tSec * 0.8 + seed) : 0.92 + 0.06 * Math.sin(tSec * 0.6 + seed);
  const period = mode === 'dying' ? 2.1 + hash01(seed) * 1.2 : 5 + hash01(seed) * 4;
  const burst = mode === 'dying' ? 1.1 : 0.8;
  const phase = (tSec + hash01(seed + 1) * 20) % period;
  const base = mode === 'dying' ? 0.72 : 1;
  if (phase < burst) {
    const slot = Math.floor(phase * 26);
    const on = hash01(seed * 31 + slot + Math.floor((tSec + hash01(seed + 1) * 20) / period) * 97) > 0.48;
    return on ? 1 : 0.06;
  }
  return base * (0.96 + 0.04 * Math.sin(tSec * 50 + seed));
}

/** Beacon sweep angle (radians). Reduced mode parks the beam and only breathes. */
export function beaconAngle(tSec: number, seed: number, reduce: boolean): number {
  return reduce ? seed % 6.28 : tSec * 2.4 + seed;
}

/** Pulse of the reactor glow, 0..1: a slow double thump. */
export function reactorPulse(tSec: number, reduce = false): number {
  if (reduce) return 0.55 + 0.1 * Math.sin(tSec * 0.9);
  const a = 0.5 + 0.5 * Math.sin(tSec * 2.1);
  const b = 0.5 + 0.5 * Math.sin(tSec * 4.2 + 0.8);
  return 0.35 + 0.45 * a * a + 0.2 * b * b * a;
}

/** Whether a decor glow prop is a ceiling or wall lamp that should throw a light shaft and flicker. */
export function isLampProp(p: { kind: string; sx: number; sy: number }): boolean {
  return p.kind === 'glow' && p.sx >= 0.6 && p.sx <= 3 && p.sy >= 0.09;
}

export interface FloorSolid {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  doorId?: string;
}

/** Top of the highest lane solid under (x, y), or `fallback` when nothing is below. */
export function floorBelow(solids: readonly FloorSolid[], x: number, y: number, fallback: number): number {
  let best = fallback;
  for (const s of solids) {
    if (s.doorId || s.minZ > 0 || s.maxZ < 0) continue;
    if (x < s.minX || x > s.maxX || s.maxY > y - 0.3) continue;
    if (s.maxY > best) best = s.maxY;
  }
  return best;
}

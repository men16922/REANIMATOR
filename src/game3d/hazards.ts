// Round 4 environmental hazards: pure, deterministic cycle maths shared by the simulation, the bot, reach3d and the renderer.
// New design, nothing derived from the original game. No randomness: every phase is a function of the tick.
import type { HazardSpawn3D } from './types3d.ts';

export type HazardPhase = 'idle' | 'telegraph' | 'active' | 'recover';

/** Body footprint used for hazard hits (slightly smaller than the 0.42 capsule so grazing is forgiving). */
export const HAZARD_BODY_HALF_W = 0.3;
export const HAZARD_BODY_H = 1.82;
/** Crusher piston travel: resting gap under the ceiling, extra lift while warning, bottom of the slam above the floor. */
export const CRUSHER_REST_GAP = 0.6;
export const CRUSHER_WARN_DROP = 0.5;
export const CRUSHER_SLAM_CLEARANCE = 1.25;
export const CRUSHER_SLAM_TICKS = 6;

export function hazardClock(h: Pick<HazardSpawn3D, 'period' | 'offset'>, tick: number): number {
  return (((tick + h.offset) % h.period) + h.period) % h.period;
}

export function hazardIdleTicks(h: HazardSpawn3D): number {
  return h.period - h.telegraph - h.active - h.recover;
}

export function hazardPhase(h: HazardSpawn3D, tick: number): HazardPhase {
  if (tick < 0) return 'idle';
  const c = hazardClock(h, tick);
  const idle = hazardIdleTicks(h);
  if (c < idle) return 'idle';
  if (c < idle + h.telegraph) return 'telegraph';
  if (c < idle + h.telegraph + h.active) return 'active';
  return 'recover';
}

/** 0..1 progress through the current phase. */
export function hazardPhaseT(h: HazardSpawn3D, tick: number): number {
  if (tick < 0) return 0;
  const c = hazardClock(h, tick);
  const idle = hazardIdleTicks(h);
  if (c < idle) return idle > 0 ? c / idle : 0;
  if (c < idle + h.telegraph) return (c - idle) / h.telegraph;
  if (c < idle + h.telegraph + h.active) return (c - idle - h.telegraph) / h.active;
  return h.recover > 0 ? (c - idle - h.telegraph - h.active) / h.recover : 0;
}

/** Underside of the crusher piston. */
export function crusherBottomY(h: HazardSpawn3D, tick: number): number {
  const ceil = h.y + h.height;
  const rest = ceil - CRUSHER_REST_GAP;
  const warn = rest - CRUSHER_WARN_DROP;
  const slam = h.y + CRUSHER_SLAM_CLEARANCE;
  if (tick < 0) return rest;
  const t = hazardPhaseT(h, tick);
  switch (hazardPhase(h, tick)) {
    case 'idle': return rest;
    case 'telegraph': return rest + (warn - rest) * t;
    case 'active': {
      const f = Math.min(1, (t * h.active) / CRUSHER_SLAM_TICKS);
      return warn + (slam - warn) * f;
    }
    default: return slam + (rest - slam) * t;
  }
}

/** Does a body standing at (x, y) feet overlap the lethal volume of this hazard at this tick? */
export function hazardHits(h: HazardSpawn3D, tick: number, x: number, y: number, halfW = HAZARD_BODY_HALF_W): boolean {
  if (tick < 0) return false;
  if (Math.abs(x - h.x) > h.width / 2 + halfW) return false;
  if (h.kind === 'crusher') {
    return y + HAZARD_BODY_H > crusherBottomY(h, tick) && y < h.y + h.height;
  }
  if (hazardPhase(h, tick) !== 'active') return false;
  if (h.kind === 'rubble') return y < h.y + 1.2 && y + HAZARD_BODY_H > h.y;
  return y < h.y + h.height && y + HAZARD_BODY_H > h.y;
}

/** Ticks a cautious walker needs to get clear of the hazard once it starts crossing. */
export function hazardCrossHorizon(h: HazardSpawn3D): number {
  switch (h.kind) {
    case 'crusher': return 80;
    case 'laser': return 70;
    case 'vent': return 50;
    default: return 26;
  }
}

/** True if the hazard can hurt a body in its column at any of the next `horizon` ticks. */
export function hazardDangerWithin(h: HazardSpawn3D, tick: number, horizon: number): boolean {
  if (tick < 0) return false;
  const ph = (t: number): boolean => {
    if (h.kind === 'crusher') return crusherBottomY(h, t) < h.y + HAZARD_BODY_H + 0.2;
    return hazardPhase(h, t) === 'active';
  };
  for (let k = 0; k <= horizon; k++) if (ph(tick + k)) return true;
  return false;
}

/**
 * Cautious-walker rule shared by the bot and reach3d: stop short of a hazard column that will be dangerous during the crossing.
 * `dir` is the direction of travel (+1/-1), `ahead` how far in front of the body the check looks.
 */
export function hazardHold(h: HazardSpawn3D, tick: number, bx: number, by: number, dir: number, ahead = 3.2): boolean {
  if (tick < 0 || dir === 0) return false;
  if (by < h.y - 2 || by > h.y + (h.kind === 'crusher' ? 3 : h.height)) return false;
  const half = h.width / 2 + HAZARD_BODY_HALF_W;
  const dx = h.x - bx;
  if (Math.abs(dx) <= half) return false; // already inside: keep going
  if (Math.sign(dx) !== dir) return false;
  if (Math.abs(dx) - half > ahead) return false;
  return hazardDangerWithin(h, tick, hazardCrossHorizon(h));
}

/** Longest stretch of ticks in one cycle with no danger. Used by reach3d to prove every crossing has a window. */
export function hazardSafeWindow(h: HazardSpawn3D): number {
  let best = 0;
  let run = 0;
  for (let t = 0; t < h.period * 2; t++) {
    const bad = h.kind === 'crusher' ? crusherBottomY(h, t) < h.y + HAZARD_BODY_H + 0.2 : hazardPhase(h, t) === 'active';
    if (bad) run = 0;
    else best = Math.max(best, ++run);
  }
  return Math.min(best, h.period);
}

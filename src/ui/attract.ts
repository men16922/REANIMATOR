// Title-screen attract mode: a deterministic bot plays a private world behind the title.
// This world is completely separate from the player's world and from any human input.

import { createBot3D, type Bot3D } from '../game3d/bot3d.ts';
import { newWorld3D, stepWorld3D, type WorldState3D } from '../game3d/world3d.ts';
import type { Level3D } from '../game3d/types3d.ts';

let sharedLevel: Level3D | null = null;

/**
 * New world that reuses one immutable Level3D. The renderer builds static geometry per level object,
 * so sharing it avoids rebuilding (and stacking) the sector meshes on every restart or demo loop.
 * The simulation never mutates the level; all mutable state lives in the WorldState3D.
 */
export function freshWorld(): WorldState3D {
  const w = newWorld3D();
  if (sharedLevel) w.level = sharedLevel;
  else sharedLevel = w.level;
  return w;
}

const SIM_HZ = 60;
/** Loop the demo after this much demo time even if the bot is still going (keeps sectors varied). */
const MAX_DEMO_SECONDS = 150;

/** Seconds each reel cut stays on screen. */
export const REEL_SEGMENT_SECONDS = 7;
/** Seconds of black at each end of a cut (the fast-forward and geometry swap hide inside it). */
export const REEL_FADE_SECONDS = 0.35;

export interface ReelCut {
  /** Bot tick the cut starts at (the deterministic bot reaches it from a fresh world). */
  tick: number;
  label: string;
}

/** Highlights of the seeded bot run, measured on the shipped level: combat, sector views, boss, escape. */
export const REEL: readonly ReelCut[] = [
  { tick: 250, label: 'shaft' },
  { tick: 560, label: 'mines' },
  { tick: 1450, label: 'biolabs' },
  { tick: 1760, label: 'security' },
  { tick: 2660, label: 'boss' },
  { tick: 3660, label: 'escape' },
];

export interface AttractShot {
  dolly: number;
  sway: number;
  lift: number;
  lookDown: number;
}

/** Pure camera plan: a wide establishing shot, then a low, closer push-in (gritty side-on framing). */
export function attractShot(segTime: number): AttractShot {
  const u = Math.max(0, Math.min(1, segTime / REEL_SEGMENT_SECONDS));
  const wide = u < 0.5;
  const k = wide ? u / 0.5 : (u - 0.5) / 0.5;
  return wide
    ? { dolly: 19 - 1.5 * k, sway: -2 + 2 * k, lift: 2.4, lookDown: 0.6 }
    : { dolly: 11 - 1.2 * k, sway: 1.2 - 1.0 * k, lift: 0.9, lookDown: 0.3 };
}

/** 0 = clear, 1 = black. Fades out before a cut and in after it. */
export function reelFade(time: number): number {
  const seg = ((time % REEL_SEGMENT_SECONDS) + REEL_SEGMENT_SECONDS) % REEL_SEGMENT_SECONDS;
  if (seg < REEL_FADE_SECONDS) return 1 - seg / REEL_FADE_SECONDS;
  if (seg > REEL_SEGMENT_SECONDS - REEL_FADE_SECONDS) return (seg - (REEL_SEGMENT_SECONDS - REEL_FADE_SECONDS)) / REEL_FADE_SECONDS;
  return 0;
}

export function reelIndex(time: number): number {
  return Math.floor(Math.max(0, time) / REEL_SEGMENT_SECONDS) % REEL.length;
}

export class Attract {
  world: WorldState3D = freshWorld();
  /** Seconds of real time spent in attract mode since the last reset (drives the camera). */
  time = 0;
  /** Set when the world was just replaced so the caller can mask the geometry rebuild with a fade. */
  resetCount = 0;
  private bot: Bot3D = createBot3D(this.world);
  private acc = 0;
  private seg = 0;

  constructor() {
    this.seek(0);
  }

  /** Camera plan for the current cut. */
  get shot(): AttractShot {
    return attractShot(this.time % REEL_SEGMENT_SECONDS);
  }

  get fade(): number {
    return reelFade(this.time);
  }

  get cut(): ReelCut {
    return REEL[this.seg];
  }

  /** Fresh world, bot fast-forwarded to the cut's tick. Deterministic: same cut, same world. */
  private seek(index: number): void {
    this.world = freshWorld();
    this.bot = createBot3D(this.world);
    const target = REEL[index].tick;
    while (this.world.tick < target && this.world.status === 'playing') this.world = stepWorld3D(this.world, this.bot.next(this.world));
    this.seg = index;
    this.acc = 0;
    this.resetCount++;
  }

  /** Advance by real seconds. Returns true when the world was reset during this call. */
  advance(dt: number): boolean {
    const before = this.seg;
    this.time += dt;
    const idx = reelIndex(this.time);
    if (idx !== before) {
      this.seek(idx);
      return true;
    }
    this.acc += Math.min(dt, 0.1);
    const step = 1 / SIM_HZ;
    let n = 0;
    while (this.acc >= step && n < 4) {
      this.acc -= step;
      n++;
      this.world = stepWorld3D(this.world, this.bot.next(this.world));
      if (this.world.status !== 'playing' || this.world.tick / SIM_HZ > MAX_DEMO_SECONDS) {
        this.reset();
        return true;
      }
    }
    return false;
  }

  reset(): void {
    this.time = 0;
    this.seek(0);
  }

  /** Fraction of the real-time step elapsed since the last tick, for render interpolation. */
  get alpha(): number {
    return Math.min(1, this.acc * SIM_HZ);
  }
}

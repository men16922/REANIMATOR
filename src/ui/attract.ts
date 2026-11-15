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

export class Attract {
  world: WorldState3D = freshWorld();
  /** Seconds of real time spent in attract mode since the last reset (drives the camera). */
  time = 0;
  /** Set when the world was just replaced so the caller can mask the geometry rebuild with a fade. */
  resetCount = 0;
  private bot: Bot3D = createBot3D(this.world);
  private acc = 0;

  /** Advance by real seconds. Returns true when the world was reset during this call. */
  advance(dt: number): boolean {
    this.time += dt;
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
    this.world = freshWorld();
    this.bot = createBot3D(this.world);
    this.time = 0;
    this.acc = 0;
    this.resetCount++;
  }

  /** Fraction of the real-time step elapsed since the last tick, for render interpolation. */
  get alpha(): number {
    return Math.min(1, this.acc * SIM_HZ);
  }
}

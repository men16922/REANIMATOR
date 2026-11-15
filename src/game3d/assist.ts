// Input-layer assists (pure, deterministic, no randomness). The simulation never calls these; main.ts applies them
// to the InputState3D it builds, so a recorded input stream replays identically with or without the assist code.
import type { WorldState3D } from './world3d.ts';

/** Aim point within this many metres of an enemy centre is pulled toward it. */
export const AIM_ASSIST_RADIUS = 2.6;
/** Only enemies within this horizontal range of the player count. */
export const AIM_ASSIST_RANGE = 22;
/** Strength at the enemy centre (0..1). The pull fades linearly to 0 at the radius edge. */
export const AIM_ASSIST_STRENGTH = 0.7;

/**
 * Magnet toward the enemy nearest to the cursor (ties broken by enemy order). Returns the input aim unchanged when no live
 * enemy is within reach, so empty-air aiming stays exact.
 */
export function assistAim(w: Readonly<WorldState3D>, aimX: number, aimY: number): { x: number; y: number } {
  const p = w.player.body;
  let best: { x: number; y: number; d: number } | null = null;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - p.x) > AIM_ASSIST_RANGE) continue;
    const cy = e.y + e.height * 0.5;
    const d = Math.hypot(e.x - aimX, cy - aimY);
    if (d <= AIM_ASSIST_RADIUS && (best === null || d < best.d)) best = { x: e.x, y: cy, d };
  }
  if (!best) return { x: aimX, y: aimY };
  const k = AIM_ASSIST_STRENGTH * (1 - best.d / AIM_ASSIST_RADIUS);
  return { x: aimX + (best.x - aimX) * k, y: aimY + (best.y - aimY) * k };
}

/** Auto-fire latch: a fresh press toggles it, releasing does not clear it. Returns the next latch and whether to fire. */
export function stepAutoFire(latched: boolean, pressEdge: boolean, held: boolean): { latched: boolean; fire: boolean } {
  const next = pressEdge ? !latched : latched;
  return { latched: next, fire: next || held };
}

/** Display clock multiplier for the Slow Game assist (the 60 Hz simulation tick itself never changes). */
export const SLOW_GAME_CLOCK = 0.8;
export function displayClock(slow: boolean): number {
  return slow ? SLOW_GAME_CLOCK : 1;
}

// ---- persisted preferences (pure parse helpers, the DOM layer owns localStorage) ----
import { DIFFICULTIES_3D, NO_ASSIST_3D, type AssistOptions3D, type Difficulty3D } from './world3d.ts';

export function parseDifficulty(raw: string | null | undefined): Difficulty3D {
  return (DIFFICULTIES_3D as readonly string[]).includes(raw ?? '') ? (raw as Difficulty3D) : 'normal';
}

export function parseAssist(raw: string | null | undefined): AssistOptions3D {
  const out: AssistOptions3D = { ...NO_ASSIST_3D };
  try {
    const o = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    for (const k of Object.keys(out) as (keyof AssistOptions3D)[]) out[k] = o[k] === true;
  } catch {
    /* corrupt value: all assists off */
  }
  return out;
}

export function difficultyNote(d: Difficulty3D): string {
  switch (d) {
    case 'story': return 'Half damage, softer enemies, more drops, auto checkpoints, respawn right where you fell.';
    case 'hard': return 'More damage taken, faster enemies, weaker healing.';
    default: return 'The intended experience.';
  }
}

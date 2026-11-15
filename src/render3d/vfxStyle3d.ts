// Pure combat-VFX readability rules (node-testable, display side only, no lights, no sim reads).
// Hit flash envelope, death pop, projectile styles, chromatic kick shaping, popup tiers.

export type Rgb = readonly [number, number, number];

// ---------------------------------------------------------------------------------------------------------
// Hit flash: short white-hot rim instead of a long orange fill, so the silhouette and texture stay readable.
// ---------------------------------------------------------------------------------------------------------
/** hitFlashTicks starts at 8 (world3d). Only the first few ticks flash. */
export const HIT_FLASH_START_TICKS = 8;
const HIT_FLASH_CURVE = [1, 0.7, 0.4, 0.18] as const;
/** Warm white: lifts the lit texture toward white without tinting the whole body orange. */
export const HIT_FLASH_HEX = 0xfff1e0;
/** Emissive lerp ceiling for a normal hit. The shared clamp in riggedModels stays 0.35. */
export const HIT_FLASH_PEAK = 0.3;

/** 0..1 envelope for a hit that has `ticksLeft` ticks of hitFlashTicks remaining. 'Reduce flashing' keeps it dim. */
export function hitFlashEnvelope(ticksLeft: number, reduce: boolean, start = HIT_FLASH_START_TICKS): number {
  if (ticksLeft <= 0) return 0;
  const age = Math.max(0, start - ticksLeft);
  const e = age < HIT_FLASH_CURVE.length ? HIT_FLASH_CURVE[age] : 0;
  return reduce ? e * 0.35 : e;
}

/** Emissive lerp amount for a normal hit. */
export function hitFlashAmount(ticksLeft: number, reduce: boolean): number {
  return hitFlashEnvelope(ticksLeft, reduce) * HIT_FLASH_PEAK;
}

/** Player hurt flash lasts this many display seconds (wall clock, so a paused sim never holds it). */
export const PLAYER_HURT_FLASH_SEC = 0.2;
/** Emissive lerp amount for the player's hurt flash: same warm white and 0.3 ceiling as enemies, decays by display time. */
export function playerHurtFlashAmount(ageSec: number, reduce: boolean): number {
  if (!(ageSec >= 0) || ageSec >= PLAYER_HURT_FLASH_SEC) return 0;
  const k = 1 - ageSec / PLAYER_HURT_FLASH_SEC;
  return k * k * HIT_FLASH_PEAK * (reduce ? 0.35 : 1);
}

/** Brighter, 2-frame white pop on the first ticks of death (deathTicks counts up from 1). */
export const DEATH_POP_CAP = 0.85;
export function deathPopAmount(deathTicks: number, reduce: boolean): number {
  if (deathTicks < 1 || deathTicks > 3) return 0;
  const a = deathTicks <= 2 ? DEATH_POP_CAP : 0.3;
  return reduce ? a * 0.4 : a;
}

// ---------------------------------------------------------------------------------------------------------
// Chromatic aberration kick: low ceiling, fast decay.
// ---------------------------------------------------------------------------------------------------------
export const CHROMA_CAP = 0.42;
export const CHROMA_DECAY_PER_SEC = 6.5;
export function stepChroma(c: number, dt: number): number {
  return Math.max(0, Math.min(CHROMA_CAP, c) - dt * CHROMA_DECAY_PER_SEC);
}

// ---------------------------------------------------------------------------------------------------------
// Projectile styles. Enemy shots read as danger (red, green), player shots as allied weapon colours.
// ---------------------------------------------------------------------------------------------------------
export type ProjectileKind = 'pulse' | 'scatter' | 'grenade' | 'rocket' | 'enemy_acid' | 'boss_plasma';

export interface ProjectileStyle {
  hostile: boolean;
  /** White-hot centre. */
  core: Rgb;
  /** Weapon / danger colour used for glow and tail. */
  glow: Rgb;
  coreSize: number;
  glowSize: number;
  /** Tail quad length multiplier (aligned to velocity). 0 = none. */
  tail: number;
  /** Orbiting sparks around the shot (hostile read). */
  ringSparks: number;
  ringRadius: number;
}

const STYLES: Record<string, ProjectileStyle> = {
  pulse: { hostile: false, core: [0.85, 1, 1], glow: [0.1, 0.85, 1], coreSize: 0.2, glowSize: 0.62, tail: 4.5, ringSparks: 0, ringRadius: 0 },
  scatter: { hostile: false, core: [1, 0.95, 0.75], glow: [1, 0.55, 0.12], coreSize: 0.13, glowSize: 0.36, tail: 3, ringSparks: 0, ringRadius: 0 },
  grenade: { hostile: false, core: [1, 0.85, 0.5], glow: [1, 0.45, 0.1], coreSize: 0.3, glowSize: 0.8, tail: 0, ringSparks: 0, ringRadius: 0 },
  rocket: { hostile: false, core: [1, 0.92, 0.65], glow: [1, 0.62, 0.16], coreSize: 0.34, glowSize: 0.9, tail: 5, ringSparks: 0, ringRadius: 0 },
  enemy_acid: { hostile: true, core: [0.85, 1, 0.55], glow: [0.3, 1, 0.12], coreSize: 0.2, glowSize: 0.6, tail: 3.5, ringSparks: 2, ringRadius: 0.3 },
  boss_plasma: { hostile: true, core: [1, 0.85, 0.7], glow: [1, 0.16, 0.1], coreSize: 0.3, glowSize: 0.95, tail: 5, ringSparks: 3, ringRadius: 0.5 },
};
/** Rail beams are not projectiles; colour kept here so every weapon colour lives in one table. */
export const RAIL_STYLE_COLOR: Rgb = [0.75, 0.3, 1];

/** Style for a world projectile. Anything fired by an enemy is hostile regardless of kind. */
export function projectileStyle(kind: ProjectileKind, fromPlayer: boolean): ProjectileStyle {
  const base = STYLES[kind] ?? STYLES.pulse;
  if (!fromPlayer && !base.hostile) return STYLES.enemy_acid;
  return base;
}

/** Angle of an orbiting spark `i` of `n` at time `t` (rad/s spin). */
export function orbitAngle(i: number, n: number, t: number, spin = 11): number {
  return (i / Math.max(1, n)) * Math.PI * 2 + t * spin;
}

// ---------------------------------------------------------------------------------------------------------
// Damage popup tiers: small and brief for ordinary hits, big for crits and exposed weak points.
// ---------------------------------------------------------------------------------------------------------
export interface PopupTier {
  size: number;
  life: number;
  rise: number;
  punch: number;
  rgb: Rgb;
}

export function popupTier(n: number, boss: boolean, exposed: boolean): PopupTier {
  if (boss && exposed) return { size: 1.05 + Math.min(0.5, n / 400), life: 1.0, rise: 3.2, punch: 0.7, rgb: [1, 0.82, 0.25] };
  if (boss) return { size: 0.5, life: 0.6, rise: 2.2, punch: 0.3, rgb: [0.75, 0.85, 0.9] };
  if (n >= 40) return { size: 0.78, life: 0.8, rise: 2.8, punch: 0.6, rgb: [1, 0.6, 0.2] };
  return { size: 0.32, life: 0.45, rise: 1.8, punch: 0.25, rgb: [1, 1, 1] };
}

/**
 * Stack a new popup above any live one it would overlap. `others` are [x, y, size, age] of live popups.
 * Returns the adjusted y. Pure: the pool passes its own arrays.
 */
export function stackedPopupY(
  x: number,
  y: number,
  size: number,
  count: number,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  sizes: ArrayLike<number>,
  ages: ArrayLike<number>,
): number {
  let out = y;
  // Few popups, a couple of passes settle chains (A pushes B above C).
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      if (ages[i] > 0.5) continue;
      const dx = Math.abs(xs[i] - x);
      const dy = out - ys[i];
      const need = (sizes[i] + size) * 0.62;
      if (dx < 0.9 && dy > -need && dy < need) {
        out = ys[i] + need;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

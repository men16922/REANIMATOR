// Pure audio decision logic (no WebAudio, no DOM): event -> sound id mapping, enemy state cues, distance
// attenuation and stereo pan, footstep cadence, theme selection, heartbeat cadence, voice stealing.
// Kept separate from audio.ts so node tests can cover it. NEW-DESIGN, nothing derived from original Abuse audio.
import type { SectorId3D, SoundEventType3D } from '../game3d/types3d.ts';

export type EnemyKindA = 'stalker' | 'crawler' | 'spitter' | 'warden';
export type EnemyStateA = 'dormant' | 'patrol' | 'alert' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';
export type Surface = 'metal' | 'rock' | 'organic' | 'tile' | 'crystal';
export type ThemeId = SectorId3D | 'boss' | 'meltdown';

/** Simulation sound event -> sound id. Events without a mapping stay silent. */
export const EVENT_SOUND: Record<SoundEventType3D, string> = {
  pulse: 'weapon.pulse',
  scatter: 'weapon.scatter',
  grenade: 'weapon.grenade',
  bounce: 'weapon.bounce',
  explosion: 'world.explosion',
  rail: 'weapon.rail',
  dash: 'player.dash',
  jump: 'player.jump',
  double_jump: 'player.double_jump',
  door_blast: 'world.door_blast',
  save_station: 'world.save',
  upgrade: 'world.upgrade',
  hurt: 'player.hurt',
  unlock: 'world.unlock',
  slam: 'enemy.warden.slam',
  pickup: 'world.pickup',
  meltdown: 'stinger.meltdown',
  win: 'stinger.win',
};

export function soundIdForEvent(type: SoundEventType3D): string {
  return EVENT_SOUND[type];
}

// ---- Spatial ----
export const HEAR_NEAR = 4;
export const HEAR_FAR = 30;

/** 1 inside HEAR_NEAR, quadratic fall-off to 0 at HEAR_FAR. */
export function attenuation(dist: number, near = HEAR_NEAR, far = HEAR_FAR): number {
  if (!(dist > near)) return 1;
  if (dist >= far) return 0;
  const k = 1 - (dist - near) / (far - near);
  return k * k;
}

/** Stereo pan in [-0.85, 0.85] from the horizontal offset (positive = source to the right of the listener). */
export function panFor(dx: number, spread = 14): number {
  const p = dx / spread;
  return Math.max(-0.85, Math.min(0.85, p));
}

export interface Spatial {
  gain: number;
  pan: number;
}

export function spatialFor(sx: number, sy: number, lx: number, ly: number): Spatial {
  return { gain: attenuation(Math.hypot(sx - lx, sy - ly)), pan: panFor(sx - lx) };
}

// ---- Enemy cues ----
/** Maps an enemy state transition to a sound id, or null. Spitters spit on attack, others leap. */
export function enemyCue(
  kind: EnemyKindA,
  prev: EnemyStateA | undefined,
  next: EnemyStateA,
  prevAlive: boolean,
  alive: boolean,
): string | null {
  if (prev === undefined) return null;
  if (prevAlive && !alive) return `enemy.${kind}.death`;
  if (!alive || prev === next) return null;
  switch (next) {
    case 'alert': return `enemy.${kind}.alert`;
    case 'windup': return `enemy.${kind}.windup`;
    case 'attack': return `enemy.${kind}.attack`;
    case 'recover':
      return prev === 'attack' && (kind === 'crawler' || kind === 'stalker') ? `enemy.${kind}.land` : null;
    default: return null;
  }
}

// ---- Footsteps and landing ----
const SURFACE: Record<SectorId3D, Surface> = {
  airlock: 'metal',
  shaft: 'metal',
  mines: 'rock',
  biolabs: 'organic',
  security: 'tile',
  core: 'crystal',
};

export function surfaceFor(sector: SectorId3D): Surface {
  return SURFACE[sector];
}

/** Ticks between footsteps for a ground speed, or 0 when standing still. */
export function footstepPeriodTicks(speed: number, topSpeed: number): number {
  const s = Math.abs(speed);
  if (s < 0.6) return 0;
  const k = Math.min(1, s / Math.max(0.001, topSpeed));
  return Math.round(30 - 14 * k); // 30 ticks walking, 16 ticks at full run
}

/** True when a fall is hard enough to sound. vyBefore is negative while falling. */
export function isHardLanding(wasGrounded: boolean, grounded: boolean, vyBefore: number): boolean {
  return !wasGrounded && grounded && vyBefore < -3;
}

// ---- Low health heartbeat ----
export const LOW_HP_FRACTION = 0.3;

/** Ticks between heartbeats; 0 when healthy or dead. Faster as health drops. */
export function heartbeatPeriodTicks(hp: number, maxHp: number): number {
  if (hp <= 0 || maxHp <= 0) return 0;
  const f = hp / maxHp;
  if (f >= LOW_HP_FRACTION) return 0;
  return Math.round(36 + (f / LOW_HP_FRACTION) * 34); // 36 ticks near death .. 70 ticks at threshold
}

// ---- Music theme selection ----
export function selectTheme(sector: SectorId3D, meltdown: boolean, wardenFighting: boolean): ThemeId {
  if (meltdown) return 'meltdown';
  if (sector === 'core' && wardenFighting) return 'boss';
  return sector;
}

// ---- Voices ----
export interface VoiceInfo {
  priority: number;
  startedAt: number;
  endsAt: number;
}

/**
 * Decides what to do when a new voice with `priority` wants to start.
 * Returns the index of the voice to steal, -1 when a slot is free, -2 when the new voice should be dropped.
 * Expired voices (endsAt <= now) are ignored. Steals the lowest-priority voice, oldest first, only if it is
 * not more important than the newcomer.
 */
export function voiceToSteal(voices: readonly VoiceInfo[], now: number, max: number, priority: number): number {
  let live = 0;
  let victim = -1;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (v.endsAt <= now) continue;
    live++;
    if (victim < 0 || v.priority < voices[victim].priority || (v.priority === voices[victim].priority && v.startedAt < voices[victim].startedAt)) victim = i;
  }
  if (live < max) return -1;
  return victim >= 0 && voices[victim].priority <= priority ? victim : -2;
}

/** True when the same sound id was started less than `minGap` seconds ago. */
export function isThrottled(lastStart: number | undefined, now: number, minGap: number): boolean {
  return lastStart !== undefined && now - lastStart < minGap;
}

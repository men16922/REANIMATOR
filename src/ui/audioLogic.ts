// Pure audio decision logic (no WebAudio, no DOM): event -> sound id mapping, enemy state cues, distance
// attenuation and stereo pan, footstep cadence, theme selection, heartbeat cadence, voice stealing.
// Kept separate from audio.ts so node tests can cover it. NEW-DESIGN, nothing derived from original Abuse audio.
import type { SectorId3D, SoundEventType3D } from '../game3d/types3d.ts';

export type EnemyKindA = 'stalker' | 'crawler' | 'spitter' | 'warden';
export type EnemyStateA = 'dormant' | 'patrol' | 'alert' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';
export type Surface = 'metal' | 'rock' | 'organic' | 'tile' | 'crystal';
export type ThemeId = SectorId3D | 'boss' | 'meltdown' | 'title' | 'victory';

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
  // Gameplay-depth events (boss_telegraph is refined per pattern by cueForEvent)
  wall_jump: 'player.wall_jump',
  dash_cancel: 'player.dash_cancel',
  stomp: 'player.stomp',
  combo: 'ui.combo',
  boss_telegraph: 'boss.tele.slam',
  boss_charge: 'boss.charge',
  boss_summon: 'boss.summon',
  boss_phase: 'boss.phase',
  boss_exposed: 'boss.exposed',
  collect: 'world.collect',
  secret: 'world.secret',
  // Round 3 foes (borrowed recipes until dedicated ones exist)
  enemy_drop: 'enemy.crawler.land',
  hive_spawn: 'enemy.crawler.alert',
  hive_destroyed: 'enemy.warden.death',
  // Round 4 hazards (borrowed recipes; cueForEvent softens the warning phase)
  hazard_vent: 'enemy.crawler.land',
  hazard_crush: 'enemy.warden.slam',
  laser_on: 'world.light_on',
  laser_off: 'world.light_off',
  barrel_explode: 'world.explosion',
  switch_on: 'world.unlock',
  elevator_start: 'world.door_blast',
  elevator_stop: 'world.pickup',
  collapse: 'player.stomp',
  // Round 5 Metroid systems (borrowed recipes; cueForEvent retunes them)
  slide: 'player.dash',
  block_break: 'world.door_blast',
  map_reveal: 'world.unlock',
  seal_warn: 'stinger.meltdown',
  seal_close: 'world.door_blast',
};

export function soundIdForEvent(type: SoundEventType3D): string {
  return EVENT_SOUND[type];
}

/** Warden pattern -> warning sound played at the start of its wind-up. */
export const BOSS_TELEGRAPH_SOUND: Record<string, string> = {
  slam: 'boss.tele.slam',
  charge: 'boss.tele.charge',
  volley: 'boss.tele.volley',
  barrage: 'boss.tele.volley',
  summon: 'boss.tele.summon',
};

export interface SoundCue {
  id: string;
  /** Frequency multiplier for oscillator layers. */
  pitch: number;
  gain: number;
}

const PENTATONIC = [0, 2, 4, 7, 9];
/** Combo chime pitch ratio: climbs a major pentatonic scale with the chain length (2 = base), capped near two octaves. */
export function comboPitch(count: number): number {
  const idx = Math.max(0, Math.min(9, Math.floor(count) - 2));
  return Math.pow(2, (PENTATONIC[idx % 5] + 12 * Math.floor(idx / 5)) / 12);
}

/** Rail charge loop pitch in Hz for a charge fraction 0..1: three octaves over the full charge. */
export function chargePitch(frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  return 110 * Math.pow(2, 3 * f);
}

/** Rank reveal pitch ratio: better ranks ring higher. */
export function rankPitch(rank: string): number {
  const i = ['D', 'C', 'B', 'A', 'S'].indexOf(rank);
  return Math.pow(2, (i < 0 ? 0 : i * 3) / 12);
}

/** Final sound for a simulation event, including per-pattern boss warnings and pitch scaling. */
export function cueForEvent(ev: { type: SoundEventType3D; value?: number }, bossPattern = 'none'): SoundCue {
  let id = EVENT_SOUND[ev.type];
  let pitch = 1;
  let gain = 1;
  if (ev.type === 'boss_telegraph' && BOSS_TELEGRAPH_SOUND[bossPattern]) id = BOSS_TELEGRAPH_SOUND[bossPattern];
  else if (ev.type === 'combo') pitch = comboPitch(ev.value ?? 2);
  else if (ev.type === 'boss_phase') pitch = ev.value === 3 ? 0.84 : ev.value === 2 ? 0.92 : 1;
  else if (ev.type === 'stomp') gain = 0.9;
  else if ((ev.type === 'hazard_vent' || ev.type === 'hazard_crush' || ev.type === 'collapse') && ev.value === 0) {
    gain = 0.45;
    pitch = ev.type === 'hazard_vent' ? 1.5 : 1.2;
  } else if (ev.type === 'collapse' && ev.value === 1) gain = 1.1;
  else if (ev.type === 'slide') {
    pitch = 0.7;
    gain = 0.8;
  } else if (ev.type === 'block_break') pitch = ev.value === 1 ? 1.25 : 0.8;
  else if (ev.type === 'map_reveal') pitch = 1.3;
  else if (ev.type === 'seal_warn') {
    pitch = 1 + 0.08 * (ev.value ?? 0);
    gain = ev.value === 4 ? 1 : 0.7;
  } else if (ev.type === 'seal_close') {
    pitch = 0.6;
    gain = 1.15;
  }
  return { id, pitch, gain };
}

// ---- Room acoustics ----
export interface Room {
  /** Reverb return level 0..1. */
  wet: number;
  /** 0 = small room impulse response, 1 = large hall. */
  size: number;
}
const ROOM: Record<ThemeId, Room> = {
  airlock: { wet: 0.2, size: 0.5 },
  shaft: { wet: 0.3, size: 0.95 },
  mines: { wet: 0.36, size: 1 },
  biolabs: { wet: 0.2, size: 0.35 },
  security: { wet: 0.07, size: 0.05 },
  core: { wet: 0.3, size: 0.8 },
  boss: { wet: 0.3, size: 0.8 },
  meltdown: { wet: 0.2, size: 0.4 },
  title: { wet: 0.25, size: 0.8 },
  victory: { wet: 0.3, size: 0.7 },
};
export function roomFor(id: ThemeId): Room {
  return ROOM[id];
}
/** Gains of the small and large convolvers for a room. */
export function roomMix(r: Room): { small: number; large: number } {
  return { small: r.wet * (1 - r.size), large: r.wet * r.size };
}

/** Deterministic stereo impulse response: noise with a power-law decay that darkens as it fades, 8 ms pre-delay. */
export function impulseResponse(sampleRate: number, seconds: number, decay: number, seed = 1): [Float32Array, Float32Array] {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const pre = Math.floor(sampleRate * 0.008);
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    let x = (seed * 2654435761 + c * 40503) >>> 0;
    const out = new Float32Array(len);
    let y = 0;
    for (let i = pre; i < len; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      const n = x / 2147483648 - 1;
      const k = (i - pre) / (len - pre);
      y += (n - y) * (1 - 0.8 * k);
      out[i] = y * Math.pow(1 - k, decay);
    }
    chans.push(out);
  }
  return [chans[0], chans[1]];
}

/** Lowpass cutoff in Hz for a source at `dist`: open up close, rolling off exponentially to 700 Hz at the far limit. */
export function distanceCutoff(dist: number, near = HEAR_NEAR, far = HEAR_FAR): number {
  if (!(dist > near)) return 20000;
  if (dist >= far) return 700;
  const k = (dist - near) / (far - near);
  return 20000 * Math.pow(700 / 20000, k);
}

/** Master trim for crowded moments: 1 with few voices, easing to 0.55 with a full voice pool. */
export function crowdGain(live: number, max = 24): number {
  const k = Math.max(0, Math.min(1, (live - 6) / Math.max(1, max - 6)));
  return 1 - 0.45 * k;
}

/** Background music duck for a loud one-shot: priority 7+ pushes the music down a little. */
export function musicDuckFor(priority: number): number {
  if (priority >= 10) return 0.4;
  if (priority >= 7) return 0.65;
  return 1;
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
  /** Lowpass cutoff in Hz (distance roll-off of high frequencies). */
  lp: number;
}

export function spatialFor(sx: number, sy: number, lx: number, ly: number): Spatial {
  const d = Math.hypot(sx - lx, sy - ly);
  return { gain: attenuation(d), pan: panFor(sx - lx), lp: distanceCutoff(d) };
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

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
  parry: 'combat.parry',
  parry_whiff: 'combat.parry_whiff',
  boss_counter: 'boss.counter',
  scan: 'world.scan',
  // Round 10 Reclaimer: alert is the music sting, grab the catch windup roar, ping a bullet off the plating
  hunter_alert: 'stinger.hunter',
  hunter_grab: 'hunter.grab',
  hunter_ping: 'hunter.ping',
  hunter_counter: 'hunter.counter',
  hunter_off: 'hunter.off',
  boss_telegraph: 'boss.tele.slam',
  boss_charge: 'boss.charge',
  boss_summon: 'boss.summon',
  boss_phase: 'boss.phase',
  boss_exposed: 'boss.exposed',
  collect: 'world.collect',
  secret: 'world.secret',
  // Round 3 foes (dedicated recipes since round 6)
  enemy_drop: 'enemy.drop_land',
  hive_spawn: 'enemy.hive_spawn',
  hive_destroyed: 'enemy.hive_burst',
  // Round 4 hazards. Events with a warning/fire phase (vent, crush, collapse) are refined by cueForEvent
  hazard_vent: 'hazard.vent_burst',
  hazard_crush: 'hazard.crush_slam',
  laser_on: 'hazard.laser_on',
  laser_off: 'hazard.laser_off',
  barrel_explode: 'hazard.barrel',
  switch_on: 'hazard.switch',
  elevator_start: 'hazard.elevator_start',
  elevator_stop: 'hazard.elevator_stop',
  collapse: 'hazard.collapse_crash',
  // Round 5 Metroid systems (seal_warn is refined per bulkhead by cueForEvent)
  slide: 'move.slide',
  block_break: 'world.block_break',
  map_reveal: 'world.map_reveal',
  seal_warn: 'escape.seal_warn',
  seal_close: 'escape.seal_close',
  // Round 6 arms (dedicated recipes; cueForEvent retunes ignition vs sustain)
  flamer: 'weapon.flamer_loop',
  rocket: 'weapon.rocket',
  burn: 'enemy.burn',
  rocket_jump: 'player.rocket_jump',
};

/** Extra sound layered on top of an event's cue: the final hatch warning adds its rising siren. */
export function extraCueForEvent(ev: { type: SoundEventType3D; value?: number }): string | null {
  return ev.type === 'seal_warn' && ev.value === 4 ? 'escape.seal_final' : null;
}

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
  else if (ev.type === 'pickup') id = ev.value === 1 ? 'world.pickup_ammo' : ev.value === 0 ? 'world.pickup_med' : 'world.pickup';
  else if (ev.type === 'explosion' && ev.value === 1) id = 'weapon.rocket_explode';
  else if (ev.type === 'hazard_vent' && ev.value === 0) id = 'hazard.vent_warn';
  else if (ev.type === 'hazard_crush' && ev.value === 0) id = 'hazard.crush_warn';
  else if (ev.type === 'collapse' && ev.value === 0) id = 'hazard.collapse_creak';
  else if (ev.type === 'slide') {
    pitch = 0.85;
    gain = 0.9;
  } else if (ev.type === 'block_break') pitch = ev.value === 1 ? 1.25 : ev.value === 2 ? 0.7 : 0.85;
  else if (ev.type === 'seal_warn') {
    // Each bulkhead sirens a little higher than the last: the route is closing in. The final hatch (4) is the highest.
    pitch = 1 + 0.06 * (ev.value ?? 0);
    gain = ev.value === 4 ? 1 : 0.8;
  } else if (ev.type === 'seal_close') {
    pitch = 0.75;
    gain = 1.1;
  } else if (ev.type === 'flamer') {
    // value 1 = ignition whoosh, 0 = sustain tick (dedicated recipe, so pitch stays near native)
    pitch = ev.value === 1 ? 1 : 1.08;
    gain = ev.value === 1 ? 0.85 : 0.45;
  } else if (ev.type === 'rocket') {
    gain = 0.9;
  } else if (ev.type === 'burn') {
    gain = 0.35;
  } else if (ev.type === 'rocket_jump') {
    gain = 0.8;
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

// ---- Item fanfares (round 6) ----
/** Seconds the display freezes on an item pickup (main.ts ITEM_FREEZE_S). The fanfare's first phrase must land inside it. */
export const ITEM_FREEZE_SECONDS = 0.85;

const FANFARE: Record<string, string> = {
  thruster_boots: 'fanfare.boots',
  energy_tank: 'fanfare.tank',
  crawl_slide: 'fanfare.slide',
  ammo_expansion: 'fanfare.ammo',
  weapon: 'fanfare.weapon',
};
/** Fanfare recipe for an upgrade kind (or 'weapon' for a new weapon), or null when the kind has none. */
export function fanfareFor(kind: string): string | null {
  return FANFARE[kind] ?? null;
}
export const FANFARE_IDS: readonly string[] = Object.values(FANFARE);

// ---- Proximity loops: persistent hum beds for hazards and lifts (round 6) ----
export type LoopKind = 'vent' | 'laser' | 'motor';
/** Output level of each loop kind at full intensity and zero distance (linear, before the SFX bus). */
export const LOOP_BASE: Record<LoopKind, number> = { vent: 0.07, laser: 0.04, motor: 0.07 };
export const MAX_LOOPS = 4;

export interface LoopSource {
  key: string;
  kind: LoopKind;
  x: number;
  y: number;
  /** 0..1 how loud the source is right now (vent warning, laser live, lift moving). */
  level: number;
  /** Playback rate multiplier (lift motor pitch). */
  rate?: number;
}
export interface LoopTarget {
  key: string;
  kind: LoopKind;
  gain: number;
  pan: number;
  lp: number;
  rate: number;
}

/** Loudness of a hazard loop by its cycle phase. Vents hiss softly even when idle; lasers only hum while charging or live. */
export function hazardLoopLevel(kind: 'vent' | 'laser', phase: 'idle' | 'telegraph' | 'active' | 'recover'): number {
  if (kind === 'vent') return phase === 'active' ? 1 : phase === 'telegraph' ? 0.6 : phase === 'recover' ? 0.35 : 0.15;
  return phase === 'active' ? 1 : phase === 'telegraph' ? 0.3 : phase === 'recover' ? 0.15 : 0;
}

/** Loudness and pitch of the cargo lift motor by phase. The empty return runs faster. */
export function elevatorLoop(phase: string): { level: number; rate: number } {
  if (phase === 'rising') return { level: 1, rate: 1 };
  if (phase === 'returning') return { level: 0.8, rate: 1.6 };
  return { level: 0, rate: 1 };
}

/** The audible loops for a listener: distance attenuation, pan and lowpass applied, quiet ones dropped, nearest `max` kept. */
export function planLoops(sources: readonly LoopSource[], lx: number, ly: number, max = MAX_LOOPS): LoopTarget[] {
  const out: LoopTarget[] = [];
  for (const s of sources) {
    const sp = spatialFor(s.x, s.y, lx, ly);
    const gain = sp.gain * Math.max(0, Math.min(1, s.level));
    if (gain < 0.02) continue;
    out.push({ key: s.key, kind: s.kind, gain, pan: sp.pan, lp: sp.lp, rate: s.rate ?? 1 });
  }
  out.sort((a, b) => b.gain - a.gain);
  return out.slice(0, max);
}

// ---- Escape sequence alarm (round 6) ----
/** Seconds of the escape that count as the final dash: tempo and alarm accelerate. */
export const PANIC_TICKS = 600;
/** 0 at the start of the final dash, 1 at zero time left; 0 outside it. */
export function panicLevel(meltdownTicks: number): number {
  if (meltdownTicks <= 0 || meltdownTicks > PANIC_TICKS) return meltdownTicks === 0 ? 1 : 0;
  return (PANIC_TICKS - meltdownTicks) / PANIC_TICKS;
}

/** Ticks between alarm pulses: 45 early, 36 once the last bulkheads sealed (<= 28 s left), then 24 down to 10 in the final 10 s. 0 when no escape. */
export function alarmPeriodTicks(meltdownTicks: number): number {
  if (meltdownTicks <= 0) return 0;
  if (meltdownTicks <= PANIC_TICKS) return Math.round(24 - 14 * panicLevel(meltdownTicks));
  return meltdownTicks <= 28 * 60 ? 36 : 45;
}

/** Alarm pitch ratio: flat early, climbing up to a fifth over the final 10 s. */
export function alarmPitch(meltdownTicks: number): number {
  return 1 + 0.5 * panicLevel(meltdownTicks);
}

/** True on the whole-second ticks of the final 10 s (the countdown beeps). */
export function isCountdownTick(meltdownTicks: number): boolean {
  return meltdownTicks > 0 && meltdownTicks <= PANIC_TICKS && meltdownTicks % 60 === 0;
}

// ---- Mix checks (round 6) ----
/**
 * Linear level at the glue compressor input for voices sounding at once: summed recipe peaks, trimmed by the SFX bus and crowd gain.
 * It is a worst case: peaks rarely align, but it shows how far above the limiter threshold a pile-up can reach.
 */
export function mixLevel(peaks: readonly number[], trim = 0.85): number {
  return peaks.reduce((s, p) => s + p, 0) * trim * crowdGain(peaks.length);
}
/** dB of a linear level (floor -120). */
export function toDb(x: number): number {
  return x > 1e-6 ? 20 * Math.log10(x) : -120;
}

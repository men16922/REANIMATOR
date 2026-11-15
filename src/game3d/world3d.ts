// Deterministic 60 Hz Full 3D side-view Metroidvania simulation for REANIMATOR.
// Gameplay lane is the XY plane (z = 0). Uses motion3d.ts for capsule physics.
// STRICT R3.3: `light` is HUD/renderer only and is never read by movement, combat, pickups, doors, saves, hazards or enemies.

import { stepBody3D, spawnBody3D, floorHeightAt3D, resolveHorizontal3D, ABILITY_3D, type Body3D } from '../engine/motion3d.ts';
import { newLight, tickLight, toggleLight, type Light } from '../game/light.ts';
import { buildCollider3D, buildFacilityMap3D } from './map3d.ts';
import type {
  ActorAnimAction,
  DataLog3D,
  DoorLockKind3D,
  Level3D,
  MapSolid3D,
  PlayerPoseState3D,
  SectorId3D,
  SoundEvent3D,
  WeaponSlot3D,
} from './types3d.ts';

export type { ActorAnimAction, SoundEvent3D, WeaponSlot3D, SectorId3D, PlayerPoseState3D };

export type GameStatus3D = 'playing' | 'won' | 'lost';
export type ObjectivePhase3D = 'console' | 'warden' | 'core' | 'escape' | 'won';
export type EnemyKind3D = 'stalker' | 'crawler' | 'spitter' | 'warden';
/** Core Warden attack patterns. Each has a visible windup (telegraph) before it executes. */
export type BossPattern3D = 'none' | 'slam' | 'volley' | 'charge' | 'barrage' | 'summon';

export interface InputState3D {
  /** -1 (west) .. +1 (east) */
  moveX: number;
  jump: boolean;
  dash: boolean;
  fire: boolean;
  /** Console / Save-Recharge station interaction */
  interact: boolean;
  /** S / Down: drop through a one-way platform */
  dropDown: boolean;
  toggleLight: boolean;
  weaponSlot: WeaponSlot3D | 0; // 0 = keep current
  /** World-space aim point on the z = 0 plane */
  aimX: number;
  aimY: number;
}

export interface PlayerAbilities3D {
  thrusterBoots: boolean;
}

export interface PlayerState3D {
  body: Body3D;
  hp: number;
  maxHp: number;
  abilities: PlayerAbilities3D;
  energyTanks: number;
  aimX: number;
  aimY: number;
  /** +1 east, -1 west; hysteresis-stable facing derived from the aim point */
  facing: 1 | -1;
  weapon: WeaponSlot3D;
  unlocked: Record<WeaponSlot3D, boolean>;
  ammo: Record<2 | 3 | 4, number>;
  fireCooldown: number;
  /** Rail-Cannon charge in ticks while fire is held (0..RAIL_CHARGE_TICKS); release fires */
  railCharge: number;
  dashInvulnTicks: number;
  hurtInvulnTicks: number;
  muzzleFlashTicks: number;
  hurtFlashTicks: number;
  acidCooldown: number;
  kills: number;
}

export interface EnemyState3D {
  id: string;
  kind: EnemyKind3D;
  zone: SectorId3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  radius: number;
  height: number;
  alive: boolean;
  active: boolean;
  phase: 1 | 2 | 3;
  attackCooldown: number;
  /** Warden only: pattern currently winding up or executing */
  bossPattern: BossPattern3D;
  /** Warden only: index into the phase pattern cycle (deterministic) */
  patternIndex: number;
  /** Warden only: ticks left in the weak-point window (damage x2, boss is staggered) */
  exposedTicks: number;
  /** Warden only: -1/+1 locked charge heading */
  chargeDir: number;
  /** Warden only: remaining barrage bursts */
  barrageLeft: number;
  /** Summoned Warden minion slot (dead until summoned; hidden by the renderer while dead) */
  minion: boolean;
  windupTicks: number;
  attackAnimTicks: number;
  staggerTicks: number;
  hitFlashTicks: number;
  deathTicks: number;
  anim: ActorAnimAction;
  homeX: number;
  state: EnemyAIState3D;
  stateTicks: number;
  facing: 1 | -1;
  turnTicks: number;
  speedNow: number;
  lungeTicks: number;
  stuckTicks: number;
  lostTicks: number;
}

export type EnemyAIState3D =
  | 'dormant' | 'patrol' | 'alert' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dead';

export const ENEMY_TURN_DELAY_3D = 8;
export const ENEMY_ALERT_TICKS_3D = 20;
export const ENEMY_LOSE_TICKS_3D = 240;
export const ENEMY_PATROL_RANGE_3D = 4;
export const ENEMY_LUNGE_TICKS_3D = { crawler: 16, stalker: 18 };
/** Max |dvx| per tick when speeding up; braking may use ENEMY_BRAKE_MUL_3D times this. */
export const ENEMY_ACCEL_3D: Record<EnemyKind3D, number> = { crawler: 0.9, stalker: 0.75, spitter: 0.4, warden: 0.25 };
export const ENEMY_BRAKE_MUL_3D = 1.6;

export interface Projectile3D {
  id: number;
  kind: 'pulse' | 'scatter' | 'grenade' | 'enemy_acid' | 'boss_plasma';
  fromPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  radius: number;
  lifeTicks: number;
  bounces: number;
}

export interface ShockwaveRing3D {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  maxRadius: number;
  speed: number;
  damage: number;
  hitPlayer: boolean;
  phase: 1 | 2;
}

export interface ExplosionFX3D {
  id: number;
  x: number;
  y: number;
  z: number;
  maxRadius: number;
  ticksLeft: number;
  maxTicks: number;
  color: number;
}

export interface BeamFX3D {
  id: number;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  ticksLeft: number;
  maxTicks: number;
}

export interface CollectibleState3D {
  id: string;
  kind: 'log';
  sector: SectorId3D;
  title: string;
  x: number;
  y: number;
  z: number;
  taken: boolean;
}

export interface CompletionState3D {
  /** 0..100, rounded: (logs + upgrades + weapons + secrets found) / total */
  percent: number;
  found: number;
  total: number;
  logsFound: number;
  logsTotal: number;
  secretsFound: number;
  secretsTotal: number;
  upgradesFound: number;
  upgradesTotal: number;
  weaponsFound: number;
  weaponsTotal: number;
}

export interface ComboState3D {
  /** Current chain length (kills inside the combo window) */
  count: number;
  ticksLeft: number;
  best: number;
}

export interface RunStats3D {
  deaths: number;
  damageTaken: number;
  bestCombo: number;
  stomps: number;
  wallJumps: number;
  score: number;
}

/** Speedrun / results summary consumed by the results screen. */
export interface RunSummary3D {
  clearTimeTicks: number;
  clearTimeSeconds: number;
  deaths: number;
  kills: number;
  collectiblesFound: number;
  collectiblesTotal: number;
  completionPercent: number;
  secretsFound: number;
  bestCombo: number;
  score: number;
  rank: 'S' | 'A' | 'B' | 'C';
  won: boolean;
}

export interface BarrelState3D {
  id: string;
  x: number;
  y: number;
  z: number;
  hp: number;
  alive: boolean;
  fuseTicks: number; // -1 inactive, >= 0 counting down to chain detonation
  hitFlashTicks: number;
}

export interface PickupState3D {
  id: string;
  kind: 'med' | 'ammo' | 'weapon';
  weapon?: WeaponSlot3D;
  value: number;
  x: number;
  y: number;
  z: number;
  taken: boolean;
}

export interface WorldState3D {
  tick: number;
  status: GameStatus3D;
  phase: ObjectivePhase3D;
  level: Level3D;
  /** Opened door ids (MapSolid3D.doorId) */
  openDoors: Set<string>;
  consoleUnlocked: boolean;
  coreHp: number;
  coreMaxHp: number;
  coreDestroyed: boolean;
  meltdownTicks: number; // -1 until triggered, then 5400 -> 0
  player: PlayerState3D;
  /** Sector the player currently stands in */
  currentRoom: SectorId3D;
  visitedRooms: SectorId3D[];
  collectedUpgrades: Set<string>;
  lastSaveId: string | null;
  saveCooldown: number;
  hint: string;
  hintTicks: number;
  light: Light; // STRICT R3.3: Never read outside HUD/renderer!
  enemies: EnemyState3D[];
  projectiles: Projectile3D[];
  shockwaves: ShockwaveRing3D[];
  explosions: ExplosionFX3D[];
  beams: BeamFX3D[];
  barrels: BarrelState3D[];
  pickups: PickupState3D[];
  /** Data logs (6, one per sector) */
  collectibles: CollectibleState3D[];
  /** Secret room ids found (Cracked Bio-Wall opened) */
  secretsFound: string[];
  completion: CompletionState3D;
  combo: ComboState3D;
  run: RunStats3D;
  events: SoundEvent3D[];
  shakeTicks: number;
  shakeStrength: number;
  nextId: number;
  prevLightButton: boolean;
}

export const WEAPON_META: Record<WeaponSlot3D, { name: string; cooldown: number; initialAmmo: number }> = {
  1: { name: 'PULSE RIFLE', cooldown: 8, initialAmmo: 999 },
  2: { name: 'SCATTERGUN', cooldown: 28, initialAmmo: 28 },
  3: { name: 'GRENADE', cooldown: 34, initialAmmo: 14 },
  4: { name: 'RAIL-CANNON', cooldown: 44, initialAmmo: 10 },
};

/** Weapon that opens each lock kind (0 = not weapon-opened). */
export const DOOR_REQUIRED_WEAPON: Record<DoorLockKind3D, WeaponSlot3D | 0> = {
  blue: 1,
  green: 2,
  yellow: 3,
  red: 4,
  console: 0,
  escape: 0,
};

export const BASE_MAX_HP = 100;
export const ENERGY_TANK_HP = 30;
export const MELTDOWN_TICKS = 90 * 60;
const MUZZLE_HEIGHT = 1.12;

const ENEMY_STATS: Record<EnemyKind3D, { hp: number; radius: number; height: number; speed: number }> = {
  crawler: { hp: 38, radius: 0.42, height: 0.85, speed: 6.1 },
  stalker: { hp: 78, radius: 0.48, height: 1.75, speed: 5.8 },
  spitter: { hp: 62, radius: 0.55, height: 1.55, speed: 3.1 },
  warden: { hp: 2600, radius: 1.05, height: 3.05, speed: 3.35 },
};

/** Weapon x enemy matchup multipliers (index = weapon slot). Crawlers are soft to Scattergun, Stalkers are armored
 * against Pulse but weak to Grenade/Rail, Spitters have a soft shell that precise Pulse shots exploit. */
export const WEAPON_MATCHUP_3D: Record<EnemyKind3D, Record<WeaponSlot3D | 0, number>> = {
  crawler: { 0: 1, 1: 1, 2: 1.35, 3: 1, 4: 1 },
  stalker: { 0: 1, 1: 0.7, 2: 1, 3: 1.25, 4: 1.3 },
  spitter: { 0: 1, 1: 1.3, 2: 0.8, 3: 1, 4: 1 },
  warden: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
};

/** Per-sector enemy damage scaling: gentle start, rising pressure toward the Core. */
export const SECTOR_DAMAGE_3D: Record<SectorId3D, number> = {
  airlock: 0.8,
  shaft: 0.95,
  mines: 1.1,
  biolabs: 1.25,
  security: 1.4,
  core: 1.5,
};

/** Per-sector enemy toughness: soft start, tougher late game. */
export const SECTOR_HP_3D: Record<SectorId3D, number> = {
  airlock: 0.85, shaft: 1, mines: 1.1, biolabs: 1.3, security: 1.45, core: 1.55,
};

export const RAIL_CHARGE_TICKS = 48;
export const COMBO_WINDOW_TICKS = 180;
export const WARDEN_EXPOSED_MULT = 2.0;
export const WARDEN_GUARDED_MULT = 0.8;
export const WARDEN_PHASE_FRACTIONS = [2 / 3, 1 / 3] as const;
export const STOMP_RADIUS = 3.0;
export const STOMP_DAMAGE = 60;
export const COMPLETION_WEAPON_PEDESTALS = 3;

/** Warden pattern cycle per phase (deterministic, no RNG). */
export const WARDEN_CYCLE_3D: Record<1 | 2 | 3, readonly BossPattern3D[]> = {
  1: ['slam', 'volley', 'slam', 'volley'],
  2: ['charge', 'volley', 'slam', 'charge', 'volley'],
  3: ['barrage', 'charge', 'summon', 'slam', 'barrage', 'charge'],
};
const WARDEN_WINDUP: Record<Exclude<BossPattern3D, 'none'>, Record<1 | 2 | 3, number>> = {
  slam: { 1: 36, 2: 30, 3: 26 },
  volley: { 1: 22, 2: 20, 3: 18 },
  charge: { 1: 36, 2: 34, 3: 28 },
  barrage: { 1: 32, 2: 32, 3: 30 },
  summon: { 1: 40, 2: 40, 3: 36 },
};
const WARDEN_COOLDOWN: Record<1 | 2 | 3, number> = { 1: 72, 2: 56, 3: 46 };
const WARDEN_EXPOSED_TICKS: Record<1 | 2 | 3, number> = { 1: 80, 2: 64, 3: 50 };

export function emptyInput3D(): InputState3D {
  return {
    moveX: 0,
    jump: false,
    dash: false,
    fire: false,
    interact: false,
    dropDown: false,
    toggleLight: false,
    weaponSlot: 0,
    aimX: 12,
    aimY: 1.05,
  };
}

function emptyCompletion(level: Level3D): CompletionState3D {
  const logsTotal = level.dataLogs.length;
  const secretsTotal = level.secrets.length;
  const upgradesTotal = level.upgrades.length;
  const weaponsTotal = level.pedestals.length;
  return {
    percent: 0, found: 0, total: logsTotal + secretsTotal + upgradesTotal + weaponsTotal,
    logsFound: 0, logsTotal, secretsFound: 0, secretsTotal,
    upgradesFound: 0, upgradesTotal, weaponsFound: 0, weaponsTotal,
  };
}

/** Recompute the completion block from the world (pure function of state, called once per tick). */
export function updateCompletion3D(w: WorldState3D): void {
  const c = w.completion;
  c.logsFound = w.collectibles.filter((l) => l.taken).length;
  c.secretsFound = w.secretsFound.length;
  c.upgradesFound = w.collectedUpgrades.size;
  c.weaponsFound = w.pickups.filter((pk) => pk.kind === 'weapon' && pk.taken).length;
  c.found = c.logsFound + c.secretsFound + c.upgradesFound + c.weaponsFound;
  c.percent = c.total > 0 ? Math.round((100 * c.found) / c.total) : 0;
}

/** Results-screen summary: clear time, deaths, kills, collection and completion rate. */
export function getRunSummary3D(w: Readonly<WorldState3D>): RunSummary3D {
  const sec = w.tick / 60;
  const pct = w.completion.percent;
  let rank: RunSummary3D['rank'] = 'C';
  if (w.status === 'won') {
    const score = (sec <= 600 ? 2 : sec <= 900 ? 1 : 0) + (w.run.deaths === 0 ? 2 : w.run.deaths <= 2 ? 1 : 0) + (pct >= 85 ? 2 : pct >= 55 ? 1 : 0);
    rank = score >= 5 ? 'S' : score >= 3 ? 'A' : score >= 2 ? 'B' : 'C';
  }
  return {
    clearTimeTicks: w.tick,
    clearTimeSeconds: Number(sec.toFixed(2)),
    deaths: w.run.deaths,
    kills: w.player.kills,
    collectiblesFound: w.completion.logsFound,
    collectiblesTotal: w.completion.logsTotal,
    completionPercent: pct,
    secretsFound: w.completion.secretsFound,
    bestCombo: w.combo.best,
    score: w.run.score,
    rank,
    won: w.status === 'won',
  };
}

export function newWorld3D(): WorldState3D {
  const level = buildFacilityMap3D();
  const spawn = level.spawn;
  const body = spawnBody3D(spawn.x, spawn.y, 0);

  const enemies: EnemyState3D[] = level.enemies.map((sp) => {
    const st = ENEMY_STATS[sp.kind];
    const hpScale = sp.kind === 'warden' ? 1 : SECTOR_HP_3D[sp.zone];
    const minion = sp.id.startsWith('e-core-m') || sp.id.startsWith('e-esc-');
    return {
      id: sp.id,
      kind: sp.kind,
      zone: sp.zone,
      x: sp.x,
      y: sp.y,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: -Math.PI / 2,
      hp: minion ? 0 : Math.round(st.hp * hpScale),
      maxHp: Math.round(st.hp * hpScale),
      radius: st.radius,
      height: st.height,
      alive: !minion,
      active: false,
      phase: 1,
      bossPattern: 'none',
      patternIndex: 0,
      exposedTicks: 0,
      chargeDir: 1,
      barrageLeft: 0,
      minion,
      attackCooldown: sp.kind === 'warden' ? 45 : 30,
      windupTicks: 0,
      attackAnimTicks: 0,
      staggerTicks: 0,
      hitFlashTicks: 0,
      deathTicks: minion ? 999 : 0,
      anim: minion ? 'death' : 'idle',
      homeX: sp.x,
      state: minion ? 'dead' : 'dormant',
      stateTicks: 0,
      facing: -1,
      turnTicks: 0,
      speedNow: 0,
      lungeTicks: 0,
      stuckTicks: 0,
      lostTicks: 0,
    };
  });

  const pickups: PickupState3D[] = [
    ...level.pedestals.map((p) => ({
      id: p.id,
      kind: 'weapon' as const,
      weapon: p.weapon,
      value: WEAPON_META[p.weapon].initialAmmo,
      x: p.x,
      y: p.y,
      z: 0,
      taken: false,
    })),
    ...level.medStations.map((m) => ({
      id: m.id,
      kind: 'med' as const,
      value: m.heal,
      x: m.x,
      y: m.y,
      z: 0,
      taken: false,
    })),
  ];

  return {
    tick: 0,
    status: 'playing',
    phase: 'console',
    level,
    openDoors: new Set<string>(),
    consoleUnlocked: false,
    coreHp: 240,
    coreMaxHp: 240,
    coreDestroyed: false,
    meltdownTicks: -1,
    player: {
      body,
      hp: BASE_MAX_HP,
      maxHp: BASE_MAX_HP,
      abilities: { thrusterBoots: false },
      energyTanks: 0,
      aimX: spawn.x + 8,
      aimY: spawn.y + MUZZLE_HEIGHT,
      facing: 1,
      weapon: 1,
      unlocked: { 1: true, 2: false, 3: false, 4: false },
      ammo: { 2: 0, 3: 0, 4: 0 },
      fireCooldown: 0,
      railCharge: 0,
      dashInvulnTicks: 0,
      hurtInvulnTicks: 0,
      muzzleFlashTicks: 0,
      hurtFlashTicks: 0,
      acidCooldown: 0,
      kills: 0,
    },
    currentRoom: 'airlock',
    visitedRooms: ['airlock'],
    collectedUpgrades: new Set<string>(),
    lastSaveId: null,
    saveCooldown: 0,
    hint: '',
    hintTicks: 0,
    light: newLight(),
    enemies,
    projectiles: [],
    shockwaves: [],
    explosions: [],
    beams: [],
    barrels: level.barrels.map((b) => ({ ...b, z: 0, hp: 20, alive: true, fuseTicks: -1, hitFlashTicks: 0 })),
    pickups,
    collectibles: level.dataLogs.map((l: DataLog3D) => ({
      id: l.id, kind: 'log' as const, sector: l.sector, title: l.title, x: l.x, y: l.y, z: 0, taken: false,
    })),
    secretsFound: [],
    completion: emptyCompletion(level),
    combo: { count: 0, ticksLeft: 0, best: 0 },
    run: { deaths: 0, damageTaken: 0, bestCombo: 0, stomps: 0, wallJumps: 0, score: 0 },
    events: [],
    shakeTicks: 0,
    shakeStrength: 0,
    nextId: 1,
    prevLightButton: false,
  };
}

/** Read-only pose contract consumed by the renderer (riggedModels.ts). */
export function getPlayerPose3D(w: Readonly<WorldState3D>): PlayerPoseState3D {
  const p = w.player;
  const ox = p.body.x;
  const oy = p.body.y + MUZZLE_HEIGHT;
  let dx = p.aimX - ox;
  const dy = p.aimY - oy;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dx = p.facing;
  const len = Math.hypot(dx, dy) || 1;
  const landing =
    p.body.state === 4 ? Math.max(0, 1 - (p.body.landTicks - 1) / ABILITY_3D.landTicks) : 0;
  return {
    aimSignX: p.facing,
    aimPitch: Math.atan2(dy, Math.max(Math.abs(dx), 1e-4)),
    aimDirX: dx / len,
    aimDirY: dy / len,
    vy: p.body.vy,
    grounded: p.body.grounded,
    landingFactor: landing,
    moveX: Math.max(-1, Math.min(1, p.body.vx / ABILITY_3D.runTopSpeed)),
  };
}

/** Raycast in the XY lane (z = 0) against active non-platform solids for Rail-Cannon and line of sight. */
export function castRaySolidDistance3D(
  w: Readonly<WorldState3D>,
  ox: number,
  oy: number,
  _oz: number,
  dx: number,
  dy: number,
  _dz: number,
  maxDist: number,
): number {
  let best = maxDist;
  const col = buildCollider3D(w.level, w.openDoors);
  for (const s of col.solids) {
    if (col.isSolidActive && !col.isSolidActive(s)) continue;
    if (s.kind === 'platform') continue;
    const t = raySolidEntry(s, ox, oy, dx, dy);
    if (t >= 0.05 && t < best) best = t;
  }
  return best;
}

/** Slab entry distance of a z = 0 XY ray into a solid, or -1 when no entry. */
function raySolidEntry(s: MapSolid3D, ox: number, oy: number, dx: number, dy: number): number {
  const invX = Math.abs(dx) > 1e-6 ? 1 / dx : 1e9;
  const invY = Math.abs(dy) > 1e-6 ? 1 / dy : 1e9;
  const tx1 = (s.minX - ox) * invX;
  const tx2 = (s.maxX - ox) * invX;
  const ty1 = (s.minY - oy) * invY;
  const ty2 = (s.maxY - oy) * invY;
  const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
  const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
  if (tmax < 0 || tmin > tmax) return -1;
  return tmin;
}

function pointToSegmentDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 1e-8) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  return (px - (ax + vx * t)) ** 2 + (py - (ay + vy * t)) ** 2;
}

function setHint(w: WorldState3D, text: string): void {
  if (w.hint === text && w.hintTicks > 0) return;
  w.hint = text;
  w.hintTicks = 150;
}

/** Try to open a lock with a weapon. Mismatches leave the world unchanged except for a hint. */
export function tryOpenDoor3D(w: WorldState3D, s: MapSolid3D, weapon: WeaponSlot3D | 0): boolean {
  if (!s.doorId || !s.doorLock || w.openDoors.has(s.doorId)) return false;
  const lock = s.doorLock;
  if (lock === 'escape') {
    if (weapon !== 0) setHint(w, 'EXTRACTION HATCH SEALED UNTIL REACTOR MELTDOWN');
    return false;
  }
  if (lock === 'console') {
    if (!w.consoleUnlocked) return false;
  } else {
    const need = DOOR_REQUIRED_WEAPON[lock];
    if (weapon !== need) {
      setHint(w, `${lock.toUpperCase()} LOCK NEEDS ${WEAPON_META[need as WeaponSlot3D].name}`);
      return false;
    }
    if (lock === 'red' && !w.consoleUnlocked) {
      setHint(w, 'SECURITY CONSOLE OFFLINE');
      return false;
    }
  }
  w.openDoors.add(s.doorId);
  w.events.push({ type: 'door_blast' });
  w.events.push({ type: 'unlock' });
  const secret = w.level.secrets.find((sr) => sr.doorId === s.doorId);
  if (secret && !w.secretsFound.includes(secret.id)) {
    w.secretsFound.push(secret.id);
    w.events.push({ type: 'secret', value: w.secretsFound.length });
    w.run.score += 500;
    setHint(w, `SECRET FOUND: ${secret.name.toUpperCase()}`);
  }
  w.shakeTicks = Math.max(w.shakeTicks, 8);
  w.shakeStrength = Math.max(w.shakeStrength, 0.2);
  return true;
}

function doorSolids(w: Readonly<WorldState3D>): MapSolid3D[] {
  return w.level.solids.filter((s) => s.doorId && !w.openDoors.has(s.doorId));
}

function damagePlayer(w: WorldState3D, rawDamage: number, knockX = 0): void {
  const p = w.player;
  if (p.hurtInvulnTicks > 0 || p.dashInvulnTicks > 0 || w.status !== 'playing') return;
  p.hp = Math.max(0, p.hp - rawDamage);
  w.run.damageTaken += rawDamage;
  w.combo.count = 0; // getting hit breaks the chain
  w.combo.ticksLeft = 0;
  p.hurtInvulnTicks = 28;
  p.hurtFlashTicks = 12;
  p.body.vx += knockX;
  w.shakeTicks = Math.max(w.shakeTicks, 10);
  w.shakeStrength = Math.max(w.shakeStrength, 0.28);
  w.events.push({ type: 'hurt' });
  if (p.hp <= 0) w.status = 'lost';
}

/** Sector-scaled enemy damage (integer). */
function scaledDamage(e: EnemyState3D, base: number): number {
  return Math.max(1, Math.round(base * SECTOR_DAMAGE_3D[e.zone]));
}

function registerKill(w: WorldState3D, e: EnemyState3D): void {
  const p = w.player;
  p.kills++;
  const c = w.combo;
  c.count = c.ticksLeft > 0 ? c.count + 1 : 1;
  c.ticksLeft = COMBO_WINDOW_TICKS;
  c.best = Math.max(c.best, c.count);
  w.run.bestCombo = c.best;
  w.run.score += (e.kind === 'warden' ? 2000 : 100) + (c.count - 1) * 50;
  // Chain reward: every kill refunds the dash; a 3+ chain also patches the hull a little
  p.body.dashCooldown = 0;
  if (c.count >= 3) p.hp = Math.min(p.maxHp, p.hp + 5);
  if (c.count >= 2) w.events.push({ type: 'combo', value: c.count });
}

function damageEnemy(
  w: WorldState3D,
  e: EnemyState3D,
  rawDmg: number,
  knockX = 0,
  stagger = 0,
  weapon: WeaponSlot3D | 0 = 0,
): void {
  if (!e.alive) return;
  let dmg = rawDmg * WEAPON_MATCHUP_3D[e.kind][weapon];
  if (e.kind === 'warden') dmg *= e.exposedTicks > 0 ? WARDEN_EXPOSED_MULT : WARDEN_GUARDED_MULT;
  dmg = Math.max(1, Math.round(dmg));
  e.hp -= dmg;
  e.hitFlashTicks = 8;
  if (e.kind !== 'warden') {
    e.vx += knockX;
    if (stagger > 0) e.staggerTicks = Math.max(e.staggerTicks, Math.min(stagger, 20));
  }

  if (e.kind === 'warden') {
    // Phase thresholds at 2/3 and 1/3 HP: the Warden staggers, is briefly exposed, and its pattern cycle restarts.
    const target: 1 | 2 | 3 = e.hp <= e.maxHp * WARDEN_PHASE_FRACTIONS[1] ? 3 : e.hp <= e.maxHp * WARDEN_PHASE_FRACTIONS[0] ? 2 : 1;
    if (e.hp > 0 && target > e.phase) {
      e.phase = target;
      e.patternIndex = 0;
      e.windupTicks = 0;
      e.bossPattern = 'none';
      e.barrageLeft = 0;
      e.lungeTicks = 0;
      e.exposedTicks = 70;
      e.attackCooldown = 60;
      w.projectiles = w.projectiles.filter((pr) => pr.fromPlayer);
      w.shakeTicks = Math.max(w.shakeTicks, 22);
      w.shakeStrength = Math.max(w.shakeStrength, 0.5);
      w.events.push({ type: 'boss_phase', value: target });
    }
  }

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    e.deathTicks = 1;
    e.anim = 'death';
    registerKill(w, e);
    if (e.kind === 'warden') {
      w.phase = 'core';
      w.pickups.push({ id: `drop-${w.nextId++}`, kind: 'med', value: 50, x: e.x, y: e.y, z: 0, taken: false });
      for (const m of w.enemies) {
        if (m.minion && m.alive) {
          m.alive = false;
          m.hp = 0;
          m.deathTicks = 1;
          m.anim = 'death';
        }
      }
    } else if (w.player.kills % 2 === 1) {
      const ammo = w.player.kills % 4 === 1;
      w.pickups.push({
        id: `drop-${w.nextId++}`,
        kind: ammo ? 'ammo' : 'med',
        value: ammo ? 8 : 18,
        x: e.x,
        y: e.y,
        z: 0,
        taken: false,
      });
    }
  }
}

function damageCore(w: WorldState3D, dmg: number): void {
  if (w.coreDestroyed) return;
  if (w.enemies.some((e) => e.kind === 'warden' && e.alive)) return; // shielded until the Warden falls
  w.coreHp = Math.max(0, w.coreHp - dmg);
  if (w.coreHp === 0) {
    w.coreDestroyed = true;
    w.openDoors.add('door_escape');
    w.meltdownTicks = MELTDOWN_TICKS;
    w.phase = 'escape';
    w.events.push({ type: 'meltdown' });
    w.events.push({ type: 'unlock' });
    // Extraction ambush: the reactor alarm wakes the hold-outs along the escape route
    for (const m of w.enemies) {
      if (!m.id.startsWith('e-esc-') || m.alive) continue;
      const sp = w.level.enemies.find((x) => x.id === m.id)!;
      m.x = sp.x;
      m.y = sp.y;
      m.vx = 0;
      m.vy = 0;
      m.hp = m.maxHp;
      m.alive = true;
      m.active = true;
      m.deathTicks = 0;
      m.anim = 'idle';
      m.hitFlashTicks = 8;
      setEnemyState(m, 'chase', 0);
    }
    triggerExplosion3D(w, w.level.corePos.x, 1.4, 0, 5.2, 0, 0x2bf0ff);
  }
}

function distPointToSolidXY(s: MapSolid3D, x: number, y: number): number {
  const cx = Math.max(s.minX, Math.min(x, s.maxX));
  const cy = Math.max(s.minY, Math.min(y, s.maxY));
  return Math.hypot(x - cx, y - cy);
}

export function triggerExplosion3D(
  w: WorldState3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  maxDamage: number,
  color = 0xff7a2f,
  playerCapDamage = 18,
  byWeapon: WeaponSlot3D | 0 = 0,
): void {
  w.explosions.push({ id: w.nextId++, x, y, z, maxRadius: radius, ticksLeft: 20, maxTicks: 20, color });
  w.events.push({ type: 'explosion' });
  w.shakeTicks = Math.max(w.shakeTicks, 14);
  w.shakeStrength = Math.max(w.shakeStrength, 0.42);

  // Weapon blasts break matching locks (Cracked Bio-Wall for Grenade)
  if (byWeapon !== 0) {
    for (const s of doorSolids(w)) {
      if (distPointToSolidXY(s, x, y) <= radius * 0.8) tryOpenDoor3D(w, s, byWeapon);
    }
  }

  if (maxDamage <= 0) return;

  for (const e of w.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - x, e.y + e.height * 0.5 - y);
    if (d <= radius + e.radius) {
      const falloff = Math.max(0.35, 1 - d / (radius + e.radius + 0.5));
      const kx = d > 0.05 ? ((e.x - x) / d) * 7 : 0;
      damageEnemy(w, e, Math.round(maxDamage * falloff), kx, 12, byWeapon);
    }
  }

  const dc = Math.hypot(w.level.corePos.x - x, 1.2 - y);
  if (dc <= radius + w.level.corePos.radius) damageCore(w, Math.round(maxDamage * 0.85));

  for (const b of w.barrels) {
    if (!b.alive) continue;
    const db = Math.hypot(b.x - x, b.y + 0.6 - y);
    if (db <= radius + 0.6 && b.fuseTicks < 0) {
      b.fuseTicks = 5;
      b.hitFlashTicks = 5;
    }
  }

  if (playerCapDamage > 0) {
    const pb = w.player.body;
    const dp = Math.hypot(pb.x - x, pb.y + 0.9 - y);
    if (dp <= radius * 0.85) {
      const factor = Math.max(0.25, 1 - dp / radius);
      damagePlayer(w, Math.round(playerCapDamage * factor), dp > 0.05 ? ((pb.x - x) / dp) * 6 : 0);
    }
  }
}

function fireWeapon3D(w: WorldState3D, railFrac = 0): void {
  const p = w.player;
  const frac = railFrac;
  const slot = p.weapon;
  if (p.fireCooldown > 0) return;
  if (slot !== 1 && p.ammo[slot] <= 0) {
    p.weapon = 1;
    return;
  }

  const ox = p.body.x;
  const oy = p.body.y + MUZZLE_HEIGHT;
  let dx = p.aimX - ox;
  let dy = p.aimY - oy;
  if (Math.hypot(dx, dy) < 0.05) {
    dx = p.facing;
    dy = 0;
  }
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const mx = ox + dx * 0.72;
  const my = oy + dy * 0.72;

  if (slot === 1) {
    p.fireCooldown = WEAPON_META[1].cooldown;
    p.muzzleFlashTicks = 4;
    w.projectiles.push({
      id: w.nextId++, kind: 'pulse', fromPlayer: true, x: mx, y: my, z: 0,
      vx: dx * 34, vy: dy * 34, vz: 0, damage: 18, radius: 0.22, lifeTicks: 65, bounces: 0,
    });
    w.events.push({ type: 'pulse' });
  } else if (slot === 2) {
    p.ammo[2]--;
    p.fireCooldown = WEAPON_META[2].cooldown;
    p.muzzleFlashTicks = 6;
    w.shakeTicks = Math.max(w.shakeTicks, 5);
    w.shakeStrength = Math.max(w.shakeStrength, 0.14);
    const baseAng = Math.atan2(dy, dx);
    for (let i = -3; i <= 3; i++) {
      const ang = baseAng + i * 0.085;
      w.projectiles.push({
        id: w.nextId++, kind: 'scatter', fromPlayer: true, x: mx, y: my, z: 0,
        vx: Math.cos(ang) * 29, vy: Math.sin(ang) * 29, vz: 0, damage: 13, radius: 0.2, lifeTicks: 34, bounces: 0,
      });
    }
    w.events.push({ type: 'scatter' });
  } else if (slot === 3) {
    p.ammo[3]--;
    p.fireCooldown = WEAPON_META[3].cooldown;
    p.muzzleFlashTicks = 6;
    w.projectiles.push({
      id: w.nextId++, kind: 'grenade', fromPlayer: true, x: mx, y: my + 0.1, z: 0,
      vx: dx * 16.5, vy: dy * 16.5 + 4.0, vz: 0, damage: 86, radius: 0.26, lifeTicks: 90, bounces: 0,
    });
    w.events.push({ type: 'grenade' });
  } else {
    p.ammo[4]--;
    p.fireCooldown = WEAPON_META[4].cooldown;
    p.muzzleFlashTicks = 8;
    w.shakeTicks = Math.max(w.shakeTicks, 8);
    w.shakeStrength = Math.max(w.shakeStrength, 0.26);

    const hitDist = castRaySolidDistance3D(w, ox, oy, 0, dx, dy, 0, 36);
    const ex = ox + dx * hitDist;
    const ey = oy + dy * hitDist;
    w.beams.push({
      id: w.nextId++, x1: mx, y1: my, z1: 0, x2: ex, y2: ey, z2: 0, ticksLeft: 18, maxTicks: 18,
    });
    w.events.push({ type: 'rail' });

    // Locked doors that are the first obstacle on the beam
    for (const s of doorSolids(w)) {
      const t = raySolidEntry(s, ox, oy, dx, dy);
      if (t >= 0 && t <= hitDist + 0.02) tryOpenDoor3D(w, s, 4);
    }
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const d2 = pointToSegmentDistSq(e.x, e.y + e.height * 0.5, ox, oy, ex, ey);
      if (d2 <= (e.radius + 0.45 + 0.5 * frac) ** 2) damageEnemy(w, e, 125 + 135 * frac, dx * (6 + 4 * frac), 30, 4);
    }
    for (const b of w.barrels) {
      if (!b.alive) continue;
      if (pointToSegmentDistSq(b.x, b.y + 0.65, ox, oy, ex, ey) <= 0.72 * 0.72) {
        b.hp = 0;
        b.alive = false;
        triggerExplosion3D(w, b.x, b.y + 0.7, 0, 4.4, 92, 0xff7a2f);
      }
    }
    if (pointToSegmentDistSq(w.level.corePos.x, 1.4, ox, oy, ex, ey) <= 1.8 * 1.8) damageCore(w, Math.round(105 + 100 * frac));
  }
}

function solidHitAt(col: ReturnType<typeof buildCollider3D>, x: number, y: number, r: number): MapSolid3D | null {
  for (const s of col.solids) {
    if (col.isSolidActive && !col.isSolidActive(s)) continue;
    if (s.kind === 'platform') continue;
    if (x + r > s.minX && x - r < s.maxX && y + r > s.minY && y - r < s.maxY) return s;
  }
  return null;
}

function weaponOfProjectile(kind: Projectile3D['kind']): WeaponSlot3D | 0 {
  return kind === 'pulse' ? 1 : kind === 'scatter' ? 2 : kind === 'grenade' ? 3 : 0;
}

function stepProjectiles3D(w: WorldState3D): void {
  const dt = ABILITY_3D.dt;
  const col = buildCollider3D(w.level, w.openDoors);
  const kept: Projectile3D[] = [];
  const blast = (pr: Projectile3D): void =>
    triggerExplosion3D(w, pr.x, pr.y, 0, 4.1, pr.damage, 0xff8a30, 18, 3);

  for (const pr of w.projectiles) {
    pr.lifeTicks--;
    if (pr.lifeTicks <= 0) {
      if (pr.kind === 'grenade') blast(pr);
      continue;
    }
    if (pr.kind === 'grenade') pr.vy -= 21.5 * dt;

    const nextX = pr.x + pr.vx * dt;
    const nextY = pr.y + pr.vy * dt;

    const hit = solidHitAt(col, nextX, nextY, pr.radius);
    if (hit) {
      if (hit.doorId && pr.fromPlayer) {
        if (pr.kind === 'grenade') {
          blast(pr);
        } else {
          tryOpenDoor3D(w, hit, weaponOfProjectile(pr.kind));
        }
        continue;
      }
      if (pr.kind === 'grenade') {
        const fromSide = pr.x + pr.radius <= hit.minX || pr.x - pr.radius >= hit.maxX;
        if (fromSide) pr.vx *= -0.74;
        else pr.vy *= -0.62;
        pr.bounces++;
        w.events.push({ type: 'bounce' });
        if (pr.bounces >= 4) {
          blast(pr);
          continue;
        }
        kept.push(pr);
        continue;
      }
      continue;
    }

    if (pr.kind === 'grenade') {
      const fy = floorHeightAt3D(nextX, 0, pr.y - pr.radius, 0.1, col);
      if (pr.vy < 0 && fy > -Infinity && pr.y - pr.radius >= fy - 0.05 && nextY - pr.radius <= fy) {
        pr.x = nextX;
        pr.y = fy + pr.radius;
        pr.vy = Math.abs(pr.vy) * 0.62;
        pr.vx *= 0.86;
        pr.bounces++;
        w.events.push({ type: 'bounce' });
        if (pr.bounces >= 4) {
          blast(pr);
          continue;
        }
      } else {
        pr.x = nextX;
        pr.y = nextY;
      }
    } else {
      pr.x = nextX;
      pr.y = nextY;
    }

    let consumed = false;
    if (pr.fromPlayer) {
      for (const e of w.enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - pr.x) <= e.radius + pr.radius && pr.y >= e.y - 0.2 && pr.y <= e.y + e.height + 0.35) {
          if (pr.kind === 'grenade') {
            blast(pr);
          } else if (pr.kind === 'scatter') {
            // Close range is the Scattergun's job: damage and knockback fall off with distance travelled
            const travelled = ((34 - pr.lifeTicks) * 29) / 60;
            const near = Math.max(0, 1 - travelled / 5);
            const mult = travelled < 5 ? 1 + 0.7 * near : Math.max(0.55, 1 - (travelled - 5) * 0.08);
            damageEnemy(w, e, pr.damage * mult, Math.sign(pr.vx) * (2.5 + 5.5 * near), Math.round(6 + 14 * near), 2);
          } else {
            damageEnemy(w, e, pr.damage, Math.sign(pr.vx) * 2.5, 0, 1);
          }
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const b of w.barrels) {
          if (!b.alive) continue;
          if (Math.abs(b.x - pr.x) <= 0.55 + pr.radius && pr.y >= b.y && pr.y <= b.y + 1.45) {
            if (pr.kind === 'grenade') {
              blast(pr);
            } else {
              b.hp -= pr.damage;
              b.hitFlashTicks = 6;
              if (b.hp <= 0) {
                b.alive = false;
                triggerExplosion3D(w, b.x, b.y + 0.7, 0, 4.4, 92, 0xff7a2f);
              }
            }
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && Math.hypot(w.level.corePos.x - pr.x, 1.2 - pr.y) <= w.level.corePos.radius) {
        if (pr.kind === 'grenade') blast(pr);
        else damageCore(w, pr.damage);
        consumed = true;
      }
    } else {
      const pb = w.player.body;
      if (
        Math.abs(pb.x - pr.x) <= ABILITY_3D.radius + pr.radius &&
        pr.y >= pb.y &&
        pr.y <= pb.y + ABILITY_3D.height
      ) {
        damagePlayer(w, pr.damage);
        consumed = true;
      }
    }
    if (!consumed) kept.push(pr);
  }
  w.projectiles = kept;
}

/** Deterministic string+counter hash (no Math.random in the sim). */
function enemyHash3D(id: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (n | 0), 2654435761);
  h ^= h >>> 15;
  return h >>> 0;
}

function setEnemyState(e: EnemyState3D, s: EnemyAIState3D, ticks: number): void {
  e.state = s;
  e.stateTicks = ticks;
}

/** Facing flips only after the player stays >0.6 m on the other side for TURN_DELAY ticks. */
function updateFacing(e: EnemyState3D, dirX: 1 | -1, dist: number): void {
  if (dirX === e.facing || dist < 0.6) {
    e.turnTicks = 0;
    return;
  }
  e.turnTicks++;
  if (e.turnTicks >= ENEMY_TURN_DELAY_3D) {
    e.facing = dirX;
    e.turnTicks = 0;
  }
}

function approachVx(e: EnemyState3D, want: number): void {
  const a = ENEMY_ACCEL_3D[e.kind];
  const braking = Math.abs(want) < Math.abs(e.vx) || want * e.vx < 0;
  const lim = braking ? a * ENEMY_BRAKE_MUL_3D : a;
  e.vx += Math.max(-lim, Math.min(lim, want - e.vx));
  if (Math.abs(e.vx) < 0.05 && want === 0) e.vx = 0;
}

function spitterShotClear(w: WorldState3D, e: EnemyState3D): boolean {
  const pb = w.player.body;
  const dx = pb.x - e.x;
  const ty = pb.y + 0.95;
  const sy = e.y + 1.15;
  const len = Math.hypot(dx, ty - sy) || 1;
  return castRaySolidDistance3D(w, e.x, sy, 0, dx / len, (ty - sy) / len, 0, len) >= len - 0.9;
}

function spitterFire(w: WorldState3D, e: EnemyState3D): void {
  const pb = w.player.body;
  const dx = pb.x - e.x;
  const ty = pb.y + 0.95;
  const sy = e.y + 1.15;
  const len = Math.hypot(dx, ty - sy) || 1;
  w.projectiles.push({
    id: w.nextId++, kind: 'enemy_acid', fromPlayer: false,
    x: e.x + (dx / len) * 0.6, y: sy + ((ty - sy) / len) * 0.6, z: 0,
    vx: (dx / len) * 12.5, vy: ((ty - sy) / len) * 12.5, vz: 0,
    damage: scaledDamage(e, 12), radius: 0.24, lifeTicks: 110, bounces: 0,
  });
  e.attackCooldown = 96;
  e.attackAnimTicks = 20;
}

function stepEnemies3D(w: WorldState3D): void {
  const dt = ABILITY_3D.dt;
  const col = buildCollider3D(w.level, w.openDoors);
  const pb = w.player.body;

  for (const e of w.enemies) {
    if (e.hitFlashTicks > 0) e.hitFlashTicks--;
    if (!e.alive) {
      e.deathTicks++;
      e.anim = 'death';
      e.state = 'dead';
      continue;
    }

    const dx = pb.x - e.x;
    const dist = Math.abs(dx) || 1e-4;
    const dirX: 1 | -1 = dx >= 0 ? 1 : -1;
    const dy = pb.y - e.y;
    const stats = ENEMY_STATS[e.kind];
    const isWarden = e.kind === 'warden';

    if (!e.active) {
      const nearPlayer = dist < 24 && Math.abs(dy) < 16;
      if ((e.zone === w.currentRoom && nearPlayer) || e.hitFlashTicks > 0 || (e.zone === 'core' && w.coreDestroyed)) {
        e.active = true;
        e.facing = dirX;
        e.turnTicks = 0;
        if (isWarden) setEnemyState(e, 'chase', 0);
        else setEnemyState(e, 'alert', ENEMY_ALERT_TICKS_3D);
      } else {
        e.anim = 'idle';
        e.state = 'dormant';
        e.yaw = e.facing * (Math.PI / 2);
        continue;
      }
    }

    if (e.attackCooldown > 0) e.attackCooldown--;
    if (e.attackAnimTicks > 0) e.attackAnimTicks--;

    let wantVx = 0;
    let direct = false; // lunge: velocity set by the state, not by accel
    let patrolling = false;
    let moving = true; // whether this tick tries to translate (for stuck detection)

    if (e.staggerTicks > 0) {
      e.staggerTicks--;
      e.windupTicks = 0;
      e.lungeTicks = 0;
      e.state = 'stagger';
      e.stateTicks = e.staggerTicks;
      e.anim = 'idle';
      moving = false;
      if (e.staggerTicks === 0) setEnemyState(e, 'chase', 0);
    } else if (isWarden) {
      const ph = e.phase;
      const spd = stats.speed * (ph === 3 ? 1.45 : ph === 2 ? 1.25 : 1);
      const floorX0 = 72.4;
      const floorX1 = 95.9;
      if (e.exposedTicks > 0) {
        // Weak-point window: the Warden is staggered and takes double damage
        e.exposedTicks--;
        e.state = 'stagger';
        e.stateTicks = e.exposedTicks;
        e.anim = 'idle';
        e.windupTicks = 0;
        moving = false;
        if (e.exposedTicks === 0) {
          setEnemyState(e, 'chase', 0);
          e.attackCooldown = Math.max(e.attackCooldown, 24);
        }
      } else if (e.bossPattern === 'charge' && e.windupTicks === 0 && e.lungeTicks > 0) {
        // Charge: locked heading, hits anything at ground level, ends in a wall crash (exposed)
        direct = true;
        e.state = 'attack';
        e.anim = 'attack';
        e.lungeTicks--;
        e.vx = e.chargeDir * (ph === 3 ? 19 : 17);
        if (Math.abs(pb.x - e.x) <= e.radius + ABILITY_3D.radius + 0.3 && pb.y - e.y < 1.5 && pb.y - e.y > -1.8) {
          damagePlayer(w, scaledDamage(e, 18), e.chargeDir * 9);
        }
        const atWall = (e.chargeDir > 0 && e.x >= floorX1) || (e.chargeDir < 0 && e.x <= floorX0);
        if (atWall || e.lungeTicks <= 0) {
          direct = false;
          e.vx = 0;
          e.lungeTicks = 0;
          e.bossPattern = 'none';
          e.attackCooldown = WARDEN_COOLDOWN[ph];
          e.exposedTicks = atWall ? WARDEN_EXPOSED_TICKS[ph] : Math.round(WARDEN_EXPOSED_TICKS[ph] * 0.4);
          if (atWall) {
            w.shakeTicks = Math.max(w.shakeTicks, 18);
            w.shakeStrength = Math.max(w.shakeStrength, 0.45);
            w.events.push({ type: 'slam' });
          }
          w.events.push({ type: 'boss_exposed', value: ph });
        }
      } else if (e.windupTicks > 0) {
        e.state = 'windup';
        e.windupTicks--;
        e.anim = 'attack';
        moving = false;
        if (e.windupTicks === 0) {
          const pat = e.bossPattern;
          if (pat === 'slam') {
            w.shockwaves.push({
              id: w.nextId++, x: e.x, y: e.y, z: 0, radius: 1.0,
              maxRadius: ph >= 2 ? 15.5 : 13.0, speed: ph === 3 ? 12.0 : ph === 2 ? 10.4 : 8.8,
              damage: scaledDamage(e, ph === 3 ? 20 : ph === 2 ? 18 : 16), hitPlayer: false, phase: ph >= 2 ? 2 : 1,
            });
            w.shakeTicks = Math.max(w.shakeTicks, 14);
            w.shakeStrength = Math.max(w.shakeStrength, 0.36);
            w.events.push({ type: 'slam' });
            e.attackCooldown = WARDEN_COOLDOWN[ph];
            e.bossPattern = 'none';
            e.exposedTicks = WARDEN_EXPOSED_TICKS[ph];
            w.events.push({ type: 'boss_exposed', value: ph });
          } else if (pat === 'volley') {
            const ey = e.y + 1.5;
            const base = Math.atan2(pb.y + 0.9 - ey, dx);
            const n = ph === 1 ? 2 : 3;
            for (let i = -n; i <= n; i++) {
              const ang = base + i * 0.16;
              w.projectiles.push({
                id: w.nextId++, kind: 'boss_plasma', fromPlayer: false,
                x: e.x + Math.cos(ang) * 1.1, y: ey + Math.sin(ang) * 1.1, z: 0,
                vx: Math.cos(ang) * (ph === 3 ? 15 : 13.5), vy: Math.sin(ang) * (ph === 3 ? 15 : 13.5), vz: 0,
                damage: scaledDamage(e, 9), radius: 0.32, lifeTicks: 110, bounces: 0,
              });
            }
            e.attackAnimTicks = 22;
            e.attackCooldown = WARDEN_COOLDOWN[ph];
            e.bossPattern = 'none';
          } else if (pat === 'charge') {
            e.lungeTicks = 60;
            w.events.push({ type: 'boss_charge', value: ph });
          } else if (pat === 'barrage') {
            e.barrageLeft = 3;
            e.stateTicks = 1;
            e.bossPattern = 'barrage';
          } else if (pat === 'summon') {
            let n = 0;
            for (const m of w.enemies) {
              if (!m.minion || m.alive || n >= 2) continue;
              const sx = Math.max(73, Math.min(95.5, e.x + (n === 0 ? -4.2 : 4.2)));
              m.x = sx;
              m.y = e.y;
              m.vx = 0;
              m.vy = 0;
              m.hp = m.maxHp;
              m.alive = true;
              m.active = true;
              m.deathTicks = 0;
              m.anim = 'idle';
              m.hitFlashTicks = 8;
              m.attackCooldown = 40;
              m.facing = dirX;
              setEnemyState(m, 'chase', 0);
              n++;
            }
            if (n > 0) {
              w.events.push({ type: 'boss_summon', value: n });
              w.events.push({ type: 'explosion' });
            }
            e.attackAnimTicks = 30;
            e.attackCooldown = WARDEN_COOLDOWN[ph];
            e.bossPattern = 'none';
          }
        }
      } else if (e.barrageLeft > 0) {
        // Barrage: three expanding rings, alternating offset so one burst has a flat lane (jump/dash) and the next a gap
        e.state = 'attack';
        e.anim = 'attack';
        moving = false;
        e.stateTicks--;
        if (e.stateTicks <= 0) {
          const burst = 3 - e.barrageLeft;
          const off = burst % 2 === 0 ? 0 : Math.PI / 12;
          const ey = e.y + 1.5;
          for (let i = 0; i < 12; i++) {
            const ang = off + (i * Math.PI) / 6;
            w.projectiles.push({
              id: w.nextId++, kind: 'boss_plasma', fromPlayer: false,
              x: e.x + Math.cos(ang) * 1.2, y: ey + Math.sin(ang) * 1.2, z: 0,
              vx: Math.cos(ang) * 9.5, vy: Math.sin(ang) * 9.5, vz: 0,
              damage: scaledDamage(e, 8), radius: 0.3, lifeTicks: 95, bounces: 0,
            });
          }
          w.events.push({ type: 'slam' });
          e.barrageLeft--;
          e.stateTicks = 22;
          if (e.barrageLeft === 0) {
            e.bossPattern = 'none';
            e.attackCooldown = WARDEN_COOLDOWN[ph];
            e.exposedTicks = Math.round(WARDEN_EXPOSED_TICKS[ph] * 0.7);
            w.events.push({ type: 'boss_exposed', value: ph });
          }
        }
      } else {
        e.state = 'chase';
        updateFacing(e, dirX, dist);
        const turning = e.turnTicks > 0;
        if (e.attackCooldown === 0 && dist < 26 && !turning) {
          const cycle = WARDEN_CYCLE_3D[ph];
          const pat = cycle[e.patternIndex % cycle.length];
          e.patternIndex++;
          e.bossPattern = pat;
          e.windupTicks = WARDEN_WINDUP[pat as Exclude<BossPattern3D, 'none'>][ph];
          e.attackAnimTicks = e.windupTicks + 6;
          e.facing = dirX;
          e.turnTicks = 0;
          e.chargeDir = dirX;
          w.events.push({ type: 'boss_telegraph', value: cycle.indexOf(pat) });
        } else if (dist > 2.2) {
          wantVx = turning ? 0 : e.facing * spd;
          e.anim = 'idle';
        } else {
          e.anim = e.attackAnimTicks > 0 ? 'attack' : 'idle';
          if (e.attackCooldown <= 30 && Math.abs(dy) < 1.8) {
            damagePlayer(w, scaledDamage(e, 12), dirX * 7);
            e.attackAnimTicks = 24;
            e.attackCooldown = 68;
          }
        }
      }
      if (e.windupTicks === 0 && wantVx === 0 && e.attackAnimTicks === 0 && !direct && e.barrageLeft === 0) e.anim = 'idle';
    } else {
      // ---- crawler / stalker / spitter ----
      const lostNow = dist > 26 || e.zone !== w.currentRoom || Math.abs(dy) > 24;
      if (e.state === 'chase' || e.state === 'recover') {
        e.lostTicks = lostNow ? e.lostTicks + 1 : 0;
        if (e.lostTicks > ENEMY_LOSE_TICKS_3D && e.state === 'chase') {
          setEnemyState(e, 'patrol', 0);
          e.lostTicks = 0;
          e.turnTicks = 0;
          e.facing = e.x > e.homeX ? -1 : 1;
        }
      }
      const lunger = e.kind !== 'spitter';

      switch (e.state) {
        case 'patrol': {
          patrolling = true;
          e.anim = 'idle';
          if ((e.zone === w.currentRoom && dist < 18 && Math.abs(dy) < 6) || e.hitFlashTicks > 0) {
            e.facing = dirX;
            e.turnTicks = 0;
            setEnemyState(e, 'alert', ENEMY_ALERT_TICKS_3D);
            patrolling = false;
            moving = false;
            break;
          }
          if (e.stateTicks > 0) {
            e.stateTicks--;
            moving = false;
          } else if ((e.x - e.homeX) * e.facing >= ENEMY_PATROL_RANGE_3D || e.stuckTicks > 6) {
            e.stateTicks = 40 + (enemyHash3D(e.id, w.tick) % 51);
            e.facing = e.facing === 1 ? -1 : 1;
            e.stuckTicks = 0;
            moving = false;
          } else {
            wantVx = e.facing * stats.speed * 0.4;
          }
          break;
        }
        case 'alert': {
          moving = false;
          e.anim = 'attack';
          e.stateTicks--;
          if (e.stateTicks <= 0) {
            setEnemyState(e, 'chase', 0);
            e.lostTicks = 0;
          }
          break;
        }
        case 'windup': {
          moving = false;
          e.anim = 'idle';
          e.stateTicks--;
          if (e.windupTicks > 0) e.windupTicks--;
          if (e.stateTicks <= 0) {
            e.windupTicks = 0;
            if (lunger) {
              const crawler = e.kind === 'crawler';
              setEnemyState(e, 'attack', crawler ? ENEMY_LUNGE_TICKS_3D.crawler : ENEMY_LUNGE_TICKS_3D.stalker);
              e.lungeTicks = e.stateTicks;
              e.vx = e.facing * (crawler ? 9 : 10.5);
              e.vy = crawler ? 3.2 : 4.0;
              e.attackAnimTicks = e.lungeTicks;
            } else {
              if (spitterShotClear(w, e)) spitterFire(w, e);
              setEnemyState(e, 'recover', 30);
            }
          }
          break;
        }
        case 'attack': {
          direct = true;
          e.anim = 'attack';
          e.lungeTicks--;
          e.stateTicks = e.lungeTicks;
          e.vx = e.facing * (e.kind === 'crawler' ? 9 : 10.5);
          if (Math.abs(pb.x - e.x) <= e.radius + ABILITY_3D.radius + 0.6 && Math.abs(dy) < 1.55) {
            damagePlayer(w, scaledDamage(e, e.kind === 'stalker' ? 14 : 9), e.facing * 5);
            e.lungeTicks = 0;
          }
          if (e.lungeTicks <= 0) {
            direct = false;
            e.attackCooldown = e.kind === 'stalker' ? 70 : 84;
            e.vx = 0;
            setEnemyState(e, 'recover', e.kind === 'stalker' ? 30 : 40);
          }
          break;
        }
        case 'recover': {
          moving = false;
          e.anim = e.attackAnimTicks > 0 ? 'attack' : 'idle';
          e.stateTicks--;
          if (e.stateTicks <= 0) setEnemyState(e, 'chase', 0);
          break;
        }
        default: {
          // chase
          e.state = 'chase';
          updateFacing(e, dirX, dist);
          const turning = e.turnTicks > 0;
          if (lunger) {
            const reach = e.kind === 'crawler' ? 2.4 : 3.5;
            if (dist <= reach && Math.abs(dy) < 2.2 && e.attackCooldown === 0 && !turning) {
              e.facing = dirX;
              e.turnTicks = 0;
              const wt = e.kind === 'crawler' ? 14 : 18;
              setEnemyState(e, 'windup', wt);
              e.windupTicks = wt;
              moving = false;
              e.anim = 'idle';
              break;
            }
            const rage = e.kind === 'stalker' && dist < 7.5 ? 1.38 : 1.0;
            if (turning) wantVx = 0;
            else if (e.attackCooldown > 0 && dist < 2.2) wantVx = -e.facing * stats.speed * 0.55; // back off while the lunge recharges
            else if (dist > 0.95) wantVx = e.facing * stats.speed * rage;
            if (
              e.kind === 'stalker' && e.hitFlashTicks > 0 && dist < 4 &&
              enemyHash3D(e.id, w.tick >> 4) % 3 === 0
            ) {
              wantVx = -dirX * stats.speed * 0.7; // strafe back when shot at close range
            }
          } else {
            if (e.attackCooldown === 0 && dist < 19 && Math.abs(dy) < 9 && !turning && spitterShotClear(w, e)) {
              e.facing = dirX;
              e.turnTicks = 0;
              setEnemyState(e, 'windup', 12);
              e.windupTicks = 12;
              moving = false;
              e.anim = 'idle';
              break;
            }
            const want = dist > 12.5 ? 1 : dist < 5.5 ? -0.75 : 0;
            wantVx = turning ? 0 : e.facing * stats.speed * want;
          }
          break;
        }
      }
      if (e.state === 'chase') {
        if (e.attackAnimTicks > 0) e.anim = 'attack';
        else if (Math.abs(e.vx) > 4.2) e.anim = 'run';
        else if (Math.abs(e.vx) > 0.6) e.anim = 'walk';
        else e.anim = 'idle';
      } else if (patrolling && Math.abs(e.vx) > 0.4) {
        e.anim = 'walk';
      }
    }

    // Never walk off a ledge deeper than a short hop
    let blocked = false;
    const guardDir = direct ? Math.sign(e.vx) : Math.sign(wantVx);
    if (guardDir !== 0) {
      const ahead = e.x + guardDir * (e.radius + 0.5);
      const fyAhead = floorHeightAt3D(ahead, 0, e.y, 0.1, col);
      if (!(fyAhead > -Infinity) || e.y - fyAhead > 1.3) {
        blocked = true;
        if (direct) {
          e.vx = 0;
          e.lungeTicks = 0;
          e.attackCooldown = e.kind === 'stalker' ? 70 : 84;
          setEnemyState(e, 'recover', e.kind === 'stalker' ? 30 : 40);
        } else wantVx = 0;
      }
    }
    if (!direct) approachVx(e, wantVx);

    const prevX = e.x;
    const pushed = resolveHorizontal3D(e.x + e.vx * dt, e.y, 0, e.radius, e.height, col);
    e.x = pushed.x;
    e.z = 0;
    if (!isWarden && moving && Math.abs(wantVx) > 0.5 && (blocked || Math.abs(e.x - prevX) < 0.002)) e.stuckTicks++;
    else if (Math.abs(e.x - prevX) > 0.01) e.stuckTicks = 0;
    if (!isWarden && e.state === 'chase' && e.stuckTicks > 20) {
      setEnemyState(e, 'recover', 30); // blocked by wall/ledge: stand and idle instead of jittering
      e.stuckTicks = 0;
      e.vx = 0;
    }

    const fy = floorHeightAt3D(e.x, 0, e.y, e.radius, col);
    e.vy = Math.max(-16, e.vy - 24 * dt);
    const ny = e.y + e.vy * dt;
    if (fy > -Infinity && (ny <= fy || (fy > e.y && fy <= e.y + 0.38))) {
      e.y = fy;
      e.vy = 0;
    } else {
      e.y = ny;
    }
    e.yaw = e.facing * (Math.PI / 2);
    e.speedNow = Math.abs(e.vx);
    if (isWarden && e.windupTicks === 0 && e.attackAnimTicks === 0) e.anim = Math.abs(e.vx) > 0.5 ? 'walk' : 'idle';
  }
}

function stepShockwaves3D(w: WorldState3D): void {
  const dt = ABILITY_3D.dt;
  const pb = w.player.body;
  const kept: ShockwaveRing3D[] = [];
  for (const sw of w.shockwaves) {
    sw.radius += sw.speed * dt;
    if (!sw.hitPlayer && Math.abs(Math.abs(pb.x - sw.x) - sw.radius) <= 0.75 && Math.abs(pb.y - sw.y) < 3) {
      // The slam travels along the floor (y 0..0.72 above the Warden's feet); jumping over it dodges cleanly
      if (pb.y < sw.y + 0.72) {
        sw.hitPlayer = true;
        damagePlayer(w, sw.damage, Math.sign(pb.x - sw.x || 1) * 9);
      }
    }
    if (sw.radius < sw.maxRadius) kept.push(sw);
  }
  w.shockwaves = kept;
}

/** Find the sector containing a point (chest height), or null in gaps between rooms. */
export function roomAt3D(level: Level3D, x: number, y: number): SectorId3D | null {
  for (const r of level.rooms) {
    if (x >= r.minX && x < r.maxX && y >= r.minY && y < r.maxY) return r.sector;
  }
  return null;
}

function applyUpgrade(w: WorldState3D, id: string, kind: 'thruster_boots' | 'energy_tank'): void {
  const p = w.player;
  w.collectedUpgrades.add(id);
  if (kind === 'thruster_boots') {
    p.abilities.thrusterBoots = true;
  } else {
    p.energyTanks++;
    p.maxHp = BASE_MAX_HP + ENERGY_TANK_HP * p.energyTanks;
    p.hp = p.maxHp;
  }
  w.events.push({ type: 'upgrade' });
}

/** Down-dash stomp landing: shockwave damage and stagger around the feet; a hit refunds the dash. */
function stompBlast(w: WorldState3D): void {
  const b = w.player.body;
  w.run.stomps++;
  w.events.push({ type: 'stomp' });
  w.explosions.push({ id: w.nextId++, x: b.x, y: b.y + 0.3, z: 0, maxRadius: STOMP_RADIUS, ticksLeft: 14, maxTicks: 14, color: 0x2bf0ff });
  w.shakeTicks = Math.max(w.shakeTicks, 12);
  w.shakeStrength = Math.max(w.shakeStrength, 0.34);
  let hit = false;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - b.x) <= STOMP_RADIUS + e.radius && Math.abs(e.y - b.y) <= 2.2) {
      damageEnemy(w, e, STOMP_DAMAGE, Math.sign(e.x - b.x || 1) * 7, 20, 0);
      hit = true;
    }
  }
  for (const br of w.barrels) {
    if (br.alive && br.fuseTicks < 0 && Math.abs(br.x - b.x) <= STOMP_RADIUS && Math.abs(br.y - b.y) <= 1.5) br.fuseTicks = 5;
  }
  if (hit) b.dashCooldown = 0;
}

function activateSave(w: WorldState3D, id: string): void {
  const p = w.player;
  p.hp = p.maxHp;
  for (const s of [2, 3, 4] as const) {
    if (p.unlocked[s]) p.ammo[s] = Math.max(p.ammo[s], WEAPON_META[s].initialAmmo);
  }
  w.lastSaveId = id;
  w.saveCooldown = 90;
  w.events.push({ type: 'save_station' });
  setHint(w, 'CHECKPOINT SAVED. HULL AND AMMO RESTORED');
}

/** Restore the player at the last Save/Recharge station (or the spawn) after a defeat. */
export function respawnPlayer3D(w: WorldState3D): void {
  if (w.status !== 'lost') return;
  const st = w.level.saveStations.find((s) => s.id === w.lastSaveId);
  const pos = st ? { x: st.x, y: st.y } : { x: w.level.spawn.x, y: w.level.spawn.y };
  const p = w.player;
  p.body = spawnBody3D(pos.x, pos.y, 0);
  p.hp = p.maxHp;
  p.hurtInvulnTicks = 90;
  w.run.deaths++;
  w.combo.count = 0;
  w.combo.ticksLeft = 0;
  w.projectiles = w.projectiles.filter((pr) => pr.fromPlayer);
  w.shockwaves = [];
  if (w.meltdownTicks === 0) w.meltdownTicks = MELTDOWN_TICKS;
  w.status = 'playing';
}

export function stepWorld3D(w: WorldState3D, input: InputState3D): WorldState3D {
  w.events = [];
  if (w.status !== 'playing') return w;
  w.tick++;

  const p = w.player;
  const edgeLight = input.toggleLight && !w.prevLightButton;
  w.prevLightButton = input.toggleLight;
  if (edgeLight) w.light = toggleLight(w.light);
  if (w.tick % 4 === 0) w.light = tickLight(w.light);

  if (input.weaponSlot !== 0 && p.unlocked[input.weaponSlot]) p.weapon = input.weaponSlot;

  if (p.fireCooldown > 0) p.fireCooldown--;
  if (p.dashInvulnTicks > 0) p.dashInvulnTicks--;
  if (p.hurtInvulnTicks > 0) p.hurtInvulnTicks--;
  if (p.muzzleFlashTicks > 0) p.muzzleFlashTicks--;
  if (p.hurtFlashTicks > 0) p.hurtFlashTicks--;
  if (p.acidCooldown > 0) p.acidCooldown--;
  if (w.saveCooldown > 0) w.saveCooldown--;
  if (w.hintTicks > 0 && --w.hintTicks === 0) w.hint = '';
  if (w.shakeTicks > 0) {
    w.shakeTicks--;
    if (w.shakeTicks === 0) w.shakeStrength = 0;
  }

  p.aimX = input.aimX;
  p.aimY = input.aimY;
  const aimDx = p.aimX - p.body.x;
  if (Math.abs(aimDx) > 0.25) p.facing = aimDx > 0 ? 1 : -1;

  const prevState = p.body.state;
  const prevDash = p.body.dashTicks;
  const prevJumps = p.body.jumpsUsed;
  const col = buildCollider3D(w.level, w.openDoors);
  p.body = stepBody3D(
    p.body,
    {
      moveX: input.moveX,
      moveZ: 0,
      jump: input.jump,
      dash: input.dash,
      aimDirX: p.facing,
      aimDirZ: 0,
      dropDown: input.dropDown,
      maxJumps: p.abilities.thrusterBoots ? 2 : 1,
      lockZ: true,
    },
    col,
  );
  if (p.body.dashTicks > prevDash) {
    p.dashInvulnTicks = ABILITY_3D.dashTicks + 4;
    w.events.push({ type: 'dash' });
  }
  if (p.body.wallJumped) {
    w.events.push({ type: 'wall_jump' });
    w.run.wallJumps++;
  } else if (p.body.jumpsUsed >= 2 && prevJumps < 2 && p.body.state === 2) {
    w.events.push({ type: 'double_jump' });
  } else if (p.body.state === 2 && prevState !== 2) {
    w.events.push({ type: 'jump' });
  }
  if (p.body.dashCanceled) w.events.push({ type: 'dash_cancel' });
  if (p.body.stompLanded) stompBlast(w);

  if (w.combo.ticksLeft > 0 && --w.combo.ticksLeft === 0) w.combo.count = 0;

  // Sector tracking
  const room = roomAt3D(w.level, p.body.x, p.body.y + 0.9);
  if (room) {
    w.currentRoom = room;
    if (!w.visitedRooms.includes(room)) w.visitedRooms.push(room);
  }

  // Acid hazard: standing below the pool surface
  if (p.body.grounded && p.acidCooldown === 0) {
    for (const pool of w.level.acidPools) {
      if (p.body.x >= pool.minX && p.body.x <= pool.maxX && p.body.y < pool.surfaceY) {
        damagePlayer(w, 8);
        p.acidCooldown = 28;
      }
    }
  }

  if (p.weapon === 4 && p.unlocked[4] && p.ammo[4] > 0) {
    // Rail-Cannon: hold to charge, release to fire (full charge auto-releases)
    if (input.fire && p.fireCooldown === 0) {
      p.railCharge = Math.min(RAIL_CHARGE_TICKS, p.railCharge + 1);
      if (p.railCharge >= RAIL_CHARGE_TICKS) {
        fireWeapon3D(w, 1);
        p.railCharge = 0;
      }
    } else if (!input.fire && p.railCharge > 0) {
      if (p.fireCooldown === 0) fireWeapon3D(w, p.railCharge / RAIL_CHARGE_TICKS);
      p.railCharge = 0;
    } else if (input.fire) {
      p.railCharge = 0;
    }
  } else {
    p.railCharge = 0;
    if (input.fire) fireWeapon3D(w);
  }

  // Weapon, medical and ammo pickups
  for (const pk of w.pickups) {
    if (pk.taken) continue;
    if (Math.abs(p.body.x - pk.x) <= 1.25 && Math.abs(p.body.y - pk.y) <= 1.4) {
      if (pk.kind === 'weapon' && pk.weapon) {
        pk.taken = true;
        p.unlocked[pk.weapon] = true;
        if (pk.weapon !== 1) p.ammo[pk.weapon as 2 | 3 | 4] += pk.value;
        p.weapon = pk.weapon;
        w.events.push({ type: 'pickup' });
      } else if (pk.kind === 'med' && p.hp < p.maxHp) {
        pk.taken = true;
        p.hp = Math.min(p.maxHp, p.hp + pk.value);
        w.events.push({ type: 'pickup' });
      } else if (pk.kind === 'ammo') {
        pk.taken = true;
        p.ammo[2] += pk.value;
        p.ammo[3] += Math.ceil(pk.value * 0.45);
        p.ammo[4] += Math.ceil(pk.value * 0.35);
        w.events.push({ type: 'pickup' });
      }
    }
  }

  // Data logs
  for (let i = 0; i < w.collectibles.length; i++) {
    const c = w.collectibles[i];
    if (c.taken) continue;
    if (Math.abs(p.body.x - c.x) <= 1.25 && Math.abs(p.body.y - c.y) <= 1.4) {
      c.taken = true;
      w.run.score += 250;
      w.events.push({ type: 'collect', value: i });
      setHint(w, `DATA LOG ${w.collectibles.filter((l) => l.taken).length}/${w.collectibles.length}: ${c.title}`);
    }
  }

  // Upgrades: Thruster Boots / Energy Tank (one-time)
  for (const up of w.level.upgrades) {
    if (w.collectedUpgrades.has(up.id)) continue;
    if (Math.abs(p.body.x - up.x) <= 1.25 && Math.abs(p.body.y - up.y) <= 1.4) applyUpgrade(w, up.id, up.kind);
  }

  // Save / Recharge stations: interact, or first contact with a new station
  for (const st of w.level.saveStations) {
    const d = Math.hypot(p.body.x - st.x, p.body.y - st.y);
    if (d <= st.radius && w.saveCooldown === 0 && (input.interact || w.lastSaveId !== st.id)) {
      activateSave(w, st.id);
    }
  }

  // Security console
  if (!w.consoleUnlocked) {
    const c = w.level.consolePos;
    const dc = Math.hypot(p.body.x - c.x, p.body.y - c.y);
    if (dc <= c.radius && Math.abs(p.body.y - c.y) <= 1.4 && (input.interact || dc <= 1.35)) {
      w.consoleUnlocked = true;
      for (const s of w.level.solids) if (s.doorLock === 'console' && s.doorId) w.openDoors.add(s.doorId);
      w.phase = 'warden';
      w.events.push({ type: 'unlock' });
      setHint(w, 'SECURITY CONSOLE ONLINE. VAULT LOCK ARMED');
    }
  }

  for (const b of w.barrels) {
    if (b.hitFlashTicks > 0) b.hitFlashTicks--;
    if (!b.alive) continue;
    if (b.fuseTicks >= 0) {
      b.fuseTicks--;
      if (b.fuseTicks < 0) {
        b.alive = false;
        triggerExplosion3D(w, b.x, b.y + 0.7, 0, 4.4, 92, 0xff7a2f);
      }
    }
  }

  stepProjectiles3D(w);
  stepEnemies3D(w);
  stepShockwaves3D(w);

  updateCompletion3D(w);
  w.explosions = w.explosions.filter((ex) => --ex.ticksLeft > 0);
  w.beams = w.beams.filter((bm) => --bm.ticksLeft > 0);

  if (w.meltdownTicks > 0) {
    w.meltdownTicks--;
    if (w.meltdownTicks === 0 && w.status === 'playing') w.status = 'lost';
  }
  if (w.coreDestroyed && w.status === 'playing') {
    const ex = w.level.exitPos;
    if (Math.hypot(p.body.x - ex.x, p.body.y - ex.y) <= ex.radius && Math.abs(p.body.y - ex.y) <= 1.5) {
      w.status = 'won';
      w.phase = 'won';
      w.events.push({ type: 'win' });
    }
  }

  return w;
}

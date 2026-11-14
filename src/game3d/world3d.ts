// Deterministic 60 Hz Full 3D side-view Metroidvania simulation for REANIMATOR.
// Gameplay lane is the XY plane (z = 0). Uses motion3d.ts for capsule physics.
// STRICT R3.3: `light` is HUD/renderer only and is never read by movement, combat, pickups, doors, saves, hazards or enemies.

import { stepBody3D, spawnBody3D, floorHeightAt3D, resolveHorizontal3D, ABILITY_3D, type Body3D } from '../engine/motion3d.ts';
import { newLight, tickLight, toggleLight, type Light } from '../game/light.ts';
import { buildCollider3D, buildFacilityMap3D } from './map3d.ts';
import type {
  ActorAnimAction,
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
  phase: 1 | 2;
  attackCooldown: number;
  windupTicks: number;
  attackAnimTicks: number;
  staggerTicks: number;
  hitFlashTicks: number;
  deathTicks: number;
  anim: ActorAnimAction;
}

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
  warden: { hp: 920, radius: 1.05, height: 3.05, speed: 3.35 },
};

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

export function newWorld3D(): WorldState3D {
  const level = buildFacilityMap3D();
  const spawn = level.spawn;
  const body = spawnBody3D(spawn.x, spawn.y, 0);

  const enemies: EnemyState3D[] = level.enemies.map((sp) => {
    const st = ENEMY_STATS[sp.kind];
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
      hp: st.hp,
      maxHp: st.hp,
      radius: st.radius,
      height: st.height,
      alive: true,
      active: false,
      phase: 1,
      attackCooldown: sp.kind === 'warden' ? 45 : 30,
      windupTicks: 0,
      attackAnimTicks: 0,
      staggerTicks: 0,
      hitFlashTicks: 0,
      deathTicks: 0,
      anim: 'idle',
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
  p.hurtInvulnTicks = 28;
  p.hurtFlashTicks = 12;
  p.body.vx += knockX;
  w.shakeTicks = Math.max(w.shakeTicks, 10);
  w.shakeStrength = Math.max(w.shakeStrength, 0.28);
  w.events.push({ type: 'hurt' });
  if (p.hp <= 0) w.status = 'lost';
}

function damageEnemy(w: WorldState3D, e: EnemyState3D, dmg: number, knockX = 0, stagger = 0): void {
  if (!e.alive) return;
  e.hp -= dmg;
  e.hitFlashTicks = 8;
  if (e.kind !== 'warden') e.vx += knockX;
  else if (stagger > 0) e.staggerTicks = Math.max(e.staggerTicks, stagger);

  if (e.kind === 'warden' && e.phase === 1 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
    e.phase = 2;
    e.staggerTicks = 16;
    e.windupTicks = 0;
  }

  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    e.deathTicks = 1;
    e.anim = 'death';
    w.player.kills++;
    if (e.kind === 'warden') {
      w.phase = 'core';
      w.pickups.push({ id: `drop-${w.nextId++}`, kind: 'med', value: 50, x: e.x, y: e.y, z: 0, taken: false });
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
      damageEnemy(w, e, Math.round(maxDamage * falloff), kx, 12);
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

function fireWeapon3D(w: WorldState3D): void {
  const p = w.player;
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
      if (d2 <= (e.radius + 0.45) ** 2) damageEnemy(w, e, 125, dx * 6, 30);
    }
    for (const b of w.barrels) {
      if (!b.alive) continue;
      if (pointToSegmentDistSq(b.x, b.y + 0.65, ox, oy, ex, ey) <= 0.72 * 0.72) {
        b.hp = 0;
        b.alive = false;
        triggerExplosion3D(w, b.x, b.y + 0.7, 0, 4.4, 92, 0xff7a2f);
      }
    }
    if (pointToSegmentDistSq(w.level.corePos.x, 1.4, ox, oy, ex, ey) <= 1.8 * 1.8) damageCore(w, 105);
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
          if (pr.kind === 'grenade') blast(pr);
          else damageEnemy(w, e, pr.damage, Math.sign(pr.vx) * 2.5);
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

function stepEnemies3D(w: WorldState3D): void {
  const dt = ABILITY_3D.dt;
  const col = buildCollider3D(w.level, w.openDoors);
  const pb = w.player.body;

  for (const e of w.enemies) {
    if (e.hitFlashTicks > 0) e.hitFlashTicks--;
    if (!e.alive) {
      e.deathTicks++;
      e.anim = 'death';
      continue;
    }

    const dx = pb.x - e.x;
    const dist = Math.abs(dx) || 1e-4;
    const dirX = dx >= 0 ? 1 : -1;
    const dy = pb.y - e.y;

    if (!e.active) {
      if (e.zone === w.currentRoom || e.hitFlashTicks > 0 || (e.zone === 'core' && w.coreDestroyed)) e.active = true;
      else {
        e.anim = 'idle';
        continue;
      }
    }

    if (e.staggerTicks > 0) {
      e.staggerTicks--;
      e.anim = 'idle';
      continue;
    }
    if (e.attackCooldown > 0) e.attackCooldown--;
    if (e.attackAnimTicks > 0) e.attackAnimTicks--;

    const stats = ENEMY_STATS[e.kind];
    e.yaw = dirX > 0 ? Math.PI / 2 : -Math.PI / 2;
    let wantVx = 0;

    if (e.kind === 'warden') {
      if (e.windupTicks > 0) {
        e.windupTicks--;
        e.anim = 'attack';
        if (e.windupTicks === 0) {
          w.shockwaves.push({
            id: w.nextId++, x: e.x, y: e.y, z: 0, radius: 1.0,
            maxRadius: e.phase === 2 ? 15.5 : 13.0, speed: e.phase === 2 ? 11.2 : 8.8,
            damage: e.phase === 2 ? 26 : 20, hitPlayer: false, phase: e.phase,
          });
          w.shakeTicks = Math.max(w.shakeTicks, 14);
          w.shakeStrength = Math.max(w.shakeStrength, 0.36);
          w.events.push({ type: 'slam' });
          e.attackCooldown = e.phase === 2 ? 78 : 112;
        }
      } else if (e.attackCooldown === 0 && dist < 22) {
        if (w.tick % 2 === 0 || dist < 7.0) {
          e.windupTicks = e.phase === 2 ? 28 : 36;
          e.attackAnimTicks = 42;
        } else {
          const ey = e.y + 1.5;
          const base = Math.atan2(pb.y + 0.9 - ey, dx);
          for (let i = -2; i <= 2; i++) {
            const ang = base + i * 0.16;
            w.projectiles.push({
              id: w.nextId++, kind: 'boss_plasma', fromPlayer: false,
              x: e.x + Math.cos(ang) * 1.1, y: ey + Math.sin(ang) * 1.1, z: 0,
              vx: Math.cos(ang) * 13.5, vy: Math.sin(ang) * 13.5, vz: 0,
              damage: 14, radius: 0.32, lifeTicks: 110, bounces: 0,
            });
          }
          e.attackAnimTicks = 22;
          e.attackCooldown = e.phase === 2 ? 64 : 88;
        }
      } else if (dist > 2.2) {
        wantVx = dirX * stats.speed * (e.phase === 2 ? 1.32 : 1.0);
        e.anim = 'walk';
      } else {
        e.anim = e.attackAnimTicks > 0 ? 'attack' : 'idle';
        if (e.attackCooldown <= 30 && Math.abs(dy) < 1.8) {
          damagePlayer(w, 16, dirX * 7);
          e.attackAnimTicks = 24;
          e.attackCooldown = 68;
        }
      }
    } else if (e.kind === 'spitter') {
      const want = dist > 12.5 ? 1 : dist < 5.5 ? -0.75 : 0;
      wantVx = dirX * stats.speed * want;
      if (e.attackCooldown === 0 && dist < 19 && Math.abs(dy) < 9) {
        const ty = pb.y + 0.95;
        const sy = e.y + 1.15;
        const len = Math.hypot(dx, ty - sy) || 1;
        const clear = castRaySolidDistance3D(w, e.x, sy, 0, dx / len, (ty - sy) / len, 0, len);
        if (clear >= len - 0.9) {
          w.projectiles.push({
            id: w.nextId++, kind: 'enemy_acid', fromPlayer: false,
            x: e.x + (dx / len) * 0.6, y: sy + ((ty - sy) / len) * 0.6, z: 0,
            vx: (dx / len) * 12.5, vy: ((ty - sy) / len) * 12.5, vz: 0,
            damage: 12, radius: 0.24, lifeTicks: 110, bounces: 0,
          });
          e.attackCooldown = 96;
          e.attackAnimTicks = 20;
        }
      }
      e.anim = e.attackAnimTicks > 0 ? 'attack' : Math.abs(want) > 0.1 ? 'walk' : 'idle';
    } else {
      const rage = e.kind === 'stalker' && dist < 7.5 ? 1.38 : 1.0;
      wantVx = dist > 0.95 ? dirX * stats.speed * rage : 0;
      if (dist <= e.radius + ABILITY_3D.radius + 0.75 && Math.abs(dy) < 1.55 && e.attackCooldown === 0) {
        damagePlayer(w, e.kind === 'stalker' ? 14 : 9, dirX * 5);
        e.attackCooldown = e.kind === 'stalker' ? 42 : 34;
        e.attackAnimTicks = 24;
      }
      if (e.attackAnimTicks > 0) e.anim = 'attack';
      else if (Math.abs(wantVx) > 4.2) e.anim = 'run';
      else if (Math.abs(wantVx) > 0.6) e.anim = 'walk';
      else e.anim = 'idle';
    }

    // Never walk off a ledge deeper than a short hop
    if (wantVx !== 0) {
      const ahead = e.x + Math.sign(wantVx) * (e.radius + 0.5);
      const fyAhead = floorHeightAt3D(ahead, 0, e.y, 0.1, col);
      if (!(fyAhead > -Infinity) || e.y - fyAhead > 1.3) wantVx = 0;
    }
    e.vx = e.vx * 0.72 + wantVx * 0.28;
    if (Math.abs(e.vx) < 0.05) e.vx = 0;

    const pushed = resolveHorizontal3D(e.x + e.vx * dt, e.y, 0, e.radius, e.height, col);
    e.x = pushed.x;
    e.z = 0;
    const fy = floorHeightAt3D(e.x, 0, e.y, e.radius, col);
    e.vy = Math.max(-16, e.vy - 24 * dt);
    const ny = e.y + e.vy * dt;
    if (fy > -Infinity && (ny <= fy || (fy > e.y && fy <= e.y + 0.38))) {
      e.y = fy;
      e.vy = 0;
    } else {
      e.y = ny;
    }
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
  if (p.body.jumpsUsed >= 2 && prevJumps < 2 && p.body.state === 2) {
    w.events.push({ type: 'double_jump' });
  } else if (p.body.state === 2 && prevState !== 2) {
    w.events.push({ type: 'jump' });
  }

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

  if (input.fire) fireWeapon3D(w);

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

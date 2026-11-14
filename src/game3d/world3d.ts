// Deterministic 60 Hz Full 3D twin-stick action simulation for REANIMATOR.
// Uses motion3d.ts for capsule physics and strict R3.3 visual-only Light isolation from game/light.ts.

import { stepBody3D, spawnBody3D, floorHeightAt3D, resolveHorizontal3D, ABILITY_3D, type Body3D } from '../engine/motion3d.ts';
import { newLight, tickLight, toggleLight, type Light } from '../game/light.ts';
import {
  buildCollider3D,
  buildFacilityMap3D,
  type Level3D,
  type WeaponSlot3D,
} from './map3d.ts';

export type GameStatus3D = 'playing' | 'won' | 'lost';
export type ObjectivePhase3D = 'console' | 'warden' | 'core' | 'escape' | 'won';
export type EnemyKind3D = 'stalker' | 'crawler' | 'spitter' | 'warden';
export type ActorAnimAction = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'death';

export interface InputState3D {
  moveX: number;
  moveZ: number;
  jump: boolean;
  dash: boolean;
  fire: boolean;
  interact: boolean;
  toggleLight: boolean;
  weaponSlot: WeaponSlot3D | 0; // 0 = keep current
  aimX: number;
  aimY: number;
  aimZ: number;
}

export interface PlayerState3D {
  body: Body3D;
  hp: number;
  maxHp: number;
  aimX: number;
  aimY: number;
  aimZ: number;
  aimYaw: number;
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
  zone: 'A' | 'B' | 'C' | 'D';
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

export interface SoundEvent3D {
  type: 'pulse' | 'scatter' | 'grenade' | 'bounce' | 'explosion' | 'rail' | 'dash' | 'jump' | 'hurt' | 'unlock' | 'slam' | 'pickup' | 'meltdown' | 'win';
}

export interface WorldState3D {
  tick: number;
  status: GameStatus3D;
  phase: ObjectivePhase3D;
  level: Level3D;
  openDoors: Set<string>;
  consoleUnlocked: boolean;
  coreHp: number;
  coreMaxHp: number;
  coreDestroyed: boolean;
  meltdownTicks: number; // -1 until triggered, then 5400 -> 0
  player: PlayerState3D;
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

const ENEMY_STATS: Record<EnemyKind3D, { hp: number; radius: number; height: number; speed: number }> = {
  crawler: { hp: 38, radius: 0.42, height: 0.85, speed: 6.1 },
  stalker: { hp: 78, radius: 0.48, height: 1.75, speed: 5.8 },
  spitter: { hp: 62, radius: 0.55, height: 1.55, speed: 3.1 },
  warden: { hp: 920, radius: 1.05, height: 3.05, speed: 3.35 },
};

export function emptyInput3D(): InputState3D {
  return {
    moveX: 0,
    moveZ: 0,
    jump: false,
    dash: false,
    fire: false,
    interact: false,
    toggleLight: false,
    weaponSlot: 0,
    aimX: 12,
    aimY: 1.05,
    aimZ: 0,
  };
}

export function newWorld3D(): WorldState3D {
  const level = buildFacilityMap3D();
  const spawn = level.spawn;
  const body = spawnBody3D(spawn.x, spawn.y, spawn.z);

  const enemies: EnemyState3D[] = level.enemies.map((sp) => {
    const st = ENEMY_STATS[sp.kind];
    return {
      id: sp.id,
      kind: sp.kind,
      zone: sp.zone,
      x: sp.x,
      y: sp.y,
      z: sp.z,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: -Math.PI / 2,
      hp: st.hp,
      maxHp: st.hp,
      radius: st.radius,
      height: st.height,
      alive: true,
      active: sp.zone === 'A',
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
      z: p.z,
      taken: false,
    })),
    ...level.medStations.map((m) => ({
      id: m.id,
      kind: 'med' as const,
      value: m.heal,
      x: m.x,
      y: m.y,
      z: m.z,
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
      hp: 100,
      maxHp: 100,
      aimX: spawn.x + 8,
      aimY: 1.05,
      aimZ: spawn.z,
      aimYaw: Math.PI / 2,
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
    light: newLight(),
    enemies,
    projectiles: [],
    shockwaves: [],
    explosions: [],
    beams: [],
    barrels: level.barrels.map((b) => ({ ...b, hp: 20, alive: true, fuseTicks: -1, hitFlashTicks: 0 })),
    pickups,
    events: [],
    shakeTicks: 0,
    shakeStrength: 0,
    nextId: 1,
    prevLightButton: false,
  };
}

/** Raycast in XZ (+Y span check) against active solid walls, doors, and pillars for Rail-Cannon & LoS. */
export function castRaySolidDistance3D(
  w: Readonly<WorldState3D>,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): number {
  let best = maxDist;
  const col = buildCollider3D(w.level, w.openDoors);

  // Slab intersection against active solids
  for (const s of col.solids) {
    if (col.isSolidActive && !col.isSolidActive(s)) continue;
    if (s.kind === 'catwalk' && oy > s.maxY + 0.1) continue;
    const invX = Math.abs(dx) > 1e-6 ? 1 / dx : 1e9;
    const invY = Math.abs(dy) > 1e-6 ? 1 / dy : 1e9;
    const invZ = Math.abs(dz) > 1e-6 ? 1 / dz : 1e9;

    const tx1 = (s.minX - ox) * invX;
    const tx2 = (s.maxX - ox) * invX;
    const ty1 = (s.minY - oy) * invY;
    const ty2 = (s.maxY - oy) * invY;
    const tz1 = (s.minZ - oz) * invZ;
    const tz2 = (s.maxZ - oz) * invZ;

    const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2), Math.min(tz1, tz2));
    const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2), Math.max(tz1, tz2));
    if (tmax >= Math.max(0.05, tmin) && tmin < best) {
      best = tmin;
    }
  }

  // Cylinder intersection against pillars
  const horizLen = Math.hypot(dx, dz);
  if (horizLen > 1e-5) {
    const ux = dx / horizLen;
    const uz = dz / horizLen;
    for (const p of col.pillars) {
      const rx = ox - p.x;
      const rz = oz - p.z;
      const b = rx * ux + rz * uz;
      const c = rx * rx + rz * rz - p.radius * p.radius;
      const disc = b * b - c;
      if (disc >= 0) {
        const th = -b - Math.sqrt(disc);
        const t3d = th / horizLen;
        if (t3d >= 0.05 && t3d < best) {
          const hitY = oy + dy * t3d;
          if (hitY >= p.minY && hitY <= p.maxY) best = t3d;
        }
      }
    }
  }

  return best;
}

function pointToSegmentDistSq3D(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const lenSq = vx * vx + vy * vy + vz * vz;
  if (lenSq < 1e-8) return (px - ax) ** 2 + (py - ay) ** 2 + (pz - az) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / lenSq));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  const cz = az + vz * t;
  return (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
}

function damagePlayer(w: WorldState3D, rawDamage: number, knockX = 0, knockZ = 0): void {
  const p = w.player;
  if (p.hurtInvulnTicks > 0 || p.dashInvulnTicks > 0 || w.status !== 'playing') return;
  p.hp = Math.max(0, p.hp - rawDamage);
  p.hurtInvulnTicks = 28;
  p.hurtFlashTicks = 12;
  p.body.vx += knockX;
  p.body.vz += knockZ;
  w.shakeTicks = Math.max(w.shakeTicks, 10);
  w.shakeStrength = Math.max(w.shakeStrength, 0.28);
  w.events.push({ type: 'hurt' });
  if (p.hp <= 0) {
    w.status = 'lost';
  }
}

function damageEnemy(w: WorldState3D, e: EnemyState3D, dmg: number, knockX = 0, knockZ = 0, stagger = 0): void {
  if (!e.alive) return;
  e.hp -= dmg;
  e.hitFlashTicks = 8;
  if (e.kind !== 'warden') {
    e.vx += knockX;
    e.vz += knockZ;
  } else if (stagger > 0) {
    e.staggerTicks = Math.max(e.staggerTicks, stagger);
  }

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
    // Deterministic drop cadence
    if (e.kind === 'warden') {
      w.phase = 'core';
      w.pickups.push({
        id: `drop-${w.nextId++}`,
        kind: 'med',
        value: 50,
        x: e.x,
        y: e.y,
        z: e.z,
        taken: false,
      });
    } else if (w.player.kills % 2 === 1) {
      w.pickups.push({
        id: `drop-${w.nextId++}`,
        kind: w.player.kills % 4 === 1 ? 'ammo' : 'med',
        value: w.player.kills % 4 === 1 ? 8 : 18,
        x: e.x,
        y: Math.max(0, e.y),
        z: e.z,
        taken: false,
      });
    }
  }
}

function damageCore(w: WorldState3D, dmg: number): void {
  if (w.coreDestroyed) return;
  const wardenAlive = w.enemies.some((e) => e.kind === 'warden' && e.alive);
  if (wardenAlive) return; // Shielded until Core Warden is defeated
  w.coreHp = Math.max(0, w.coreHp - dmg);
  if (w.coreHp === 0) {
    w.coreDestroyed = true;
    w.openDoors.add('gate_d');
    w.meltdownTicks = 90 * 60;
    w.phase = 'escape';
    w.events.push({ type: 'meltdown' });
    w.events.push({ type: 'unlock' });
    triggerExplosion3D(w, w.level.corePos.x, 1.4, w.level.corePos.z, 5.2, 0, 0x2bf0ff);
  }
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
): void {
  w.explosions.push({
    id: w.nextId++,
    x,
    y,
    z,
    maxRadius: radius,
    ticksLeft: 20,
    maxTicks: 20,
    color,
  });
  w.events.push({ type: 'explosion' });
  w.shakeTicks = Math.max(w.shakeTicks, 14);
  w.shakeStrength = Math.max(w.shakeStrength, 0.42);

  if (maxDamage <= 0) return;

  // Damage enemies in 3D sphere
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - x, (e.y + e.height * 0.5) - y, e.z - z);
    if (d <= radius + e.radius) {
      const falloff = Math.max(0.35, 1 - d / (radius + e.radius + 0.5));
      const kx = d > 0.05 ? ((e.x - x) / d) * 7 : 0;
      const kz = d > 0.05 ? ((e.z - z) / d) * 7 : 0;
      damageEnemy(w, e, Math.round(maxDamage * falloff), kx, kz, 12);
    }
  }

  // Trigger Power Core if vulnerable
  const dc = Math.hypot(w.level.corePos.x - x, 1.0 - y, w.level.corePos.z - z);
  if (dc <= radius + w.level.corePos.radius) {
    damageCore(w, Math.round(maxDamage * 0.85));
  }

  // Chain-trigger adjacent bio-barrels with staggered 5-tick delay
  for (const b of w.barrels) {
    if (!b.alive) continue;
    const db = Math.hypot(b.x - x, (b.y + 0.6) - y, b.z - z);
    if (db <= radius + 0.6 && b.fuseTicks < 0) {
      b.fuseTicks = 5;
      b.hitFlashTicks = 5;
    }
  }

  // Self-damage check if player stands inside blast
  if (playerCapDamage > 0) {
    const dp = Math.hypot(w.player.body.x - x, (w.player.body.y + 0.9) - y, w.player.body.z - z);
    if (dp <= radius * 0.85) {
      const factor = Math.max(0.25, 1 - dp / radius);
      const kx = dp > 0.05 ? ((w.player.body.x - x) / dp) * 6 : 0;
      const kz = dp > 0.05 ? ((w.player.body.z - z) / dp) * 6 : 0;
      damagePlayer(w, Math.round(playerCapDamage * factor), kx, kz);
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
  const oy = p.body.y + 1.12;
  const oz = p.body.z;
  const tx = p.aimX;
  const ty = Math.max(0.25, p.aimY);
  const tz = p.aimZ;
  let dx = tx - ox;
  let dy = ty - oy;
  let dz = tz - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;

  const mx = ox + dx * 0.72;
  const my = oy + dy * 0.72;
  const mz = oz + dz * 0.72;

  if (slot === 1) {
    p.fireCooldown = WEAPON_META[1].cooldown;
    p.muzzleFlashTicks = 4;
    w.projectiles.push({
      id: w.nextId++,
      kind: 'pulse',
      fromPlayer: true,
      x: mx,
      y: my,
      z: mz,
      vx: dx * 34,
      vy: dy * 34,
      vz: dz * 34,
      damage: 18,
      radius: 0.22,
      lifeTicks: 65,
      bounces: 0,
    });
    w.events.push({ type: 'pulse' });
  } else if (slot === 2) {
    p.ammo[2]--;
    p.fireCooldown = WEAPON_META[2].cooldown;
    p.muzzleFlashTicks = 6;
    w.shakeTicks = Math.max(w.shakeTicks, 5);
    w.shakeStrength = Math.max(w.shakeStrength, 0.14);
    const baseYaw = Math.atan2(dx, dz);
    for (let i = -3; i <= 3; i++) {
      const ang = baseYaw + i * 0.085;
      const sx = Math.sin(ang);
      const sz = Math.cos(ang);
      w.projectiles.push({
        id: w.nextId++,
        kind: 'scatter',
        fromPlayer: true,
        x: mx,
        y: my,
        z: mz,
        vx: sx * 29,
        vy: dy * 22,
        vz: sz * 29,
        damage: 13,
        radius: 0.2,
        lifeTicks: 34,
        bounces: 0,
      });
    }
    w.events.push({ type: 'scatter' });
  } else if (slot === 3) {
    p.ammo[3]--;
    p.fireCooldown = WEAPON_META[3].cooldown;
    p.muzzleFlashTicks = 6;
    const hLen = Math.hypot(dx, dz) || 1;
    w.projectiles.push({
      id: w.nextId++,
      kind: 'grenade',
      fromPlayer: true,
      x: mx,
      y: my + 0.1,
      z: mz,
      vx: (dx / hLen) * 16.5,
      vy: 5.4 + dy * 4.0,
      vz: (dz / hLen) * 16.5,
      damage: 86,
      radius: 0.26,
      lifeTicks: 90,
      bounces: 0,
    });
    w.events.push({ type: 'grenade' });
  } else if (slot === 4) {
    p.ammo[4]--;
    p.fireCooldown = WEAPON_META[4].cooldown;
    p.muzzleFlashTicks = 8;
    w.shakeTicks = Math.max(w.shakeTicks, 8);
    w.shakeStrength = Math.max(w.shakeStrength, 0.26);

    const maxRange = 36;
    const hitDist = castRaySolidDistance3D(w, ox, oy, oz, dx, dy, dz, maxRange);
    const ex = ox + dx * hitDist;
    const ey = oy + dy * hitDist;
    const ez = oz + dz * hitDist;
    w.beams.push({
      id: w.nextId++,
      x1: mx,
      y1: my,
      z1: mz,
      x2: ex,
      y2: ey,
      z2: ez,
      ticksLeft: 18,
      maxTicks: 18,
    });
    w.events.push({ type: 'rail' });

    for (const e of w.enemies) {
      if (!e.alive) continue;
      const d2 = pointToSegmentDistSq3D(e.x, e.y + e.height * 0.5, e.z, ox, oy, oz, ex, ey, ez);
      if (d2 <= (e.radius + 0.45) ** 2) {
        damageEnemy(w, e, 125, dx * 6, dz * 6, 30);
      }
    }
    for (const b of w.barrels) {
      if (!b.alive) continue;
      const d2 = pointToSegmentDistSq3D(b.x, b.y + 0.65, b.z, ox, oy, oz, ex, ey, ez);
      if (d2 <= 0.72 * 0.72) {
        b.hp = 0;
        b.alive = false;
        triggerExplosion3D(w, b.x, b.y + 0.7, b.z, 4.4, 92, 0xff7a2f);
      }
    }
    const dc2 = pointToSegmentDistSq3D(w.level.corePos.x, 1.4, w.level.corePos.z, ox, oy, oz, ex, ey, ez);
    if (dc2 <= 1.8 * 1.8) damageCore(w, 105);
  }
}

function stepProjectiles3D(w: WorldState3D): void {
  const dt = ABILITY_3D.dt;
  const col = buildCollider3D(w.level, w.openDoors);
  const kept: Projectile3D[] = [];

  for (const pr of w.projectiles) {
    pr.lifeTicks--;
    if (pr.lifeTicks <= 0) {
      if (pr.kind === 'grenade') triggerExplosion3D(w, pr.x, pr.y, pr.z, 4.1, pr.damage, 0xff8a30);
      continue;
    }

    if (pr.kind === 'grenade') {
      pr.vy -= 21.5 * dt;
    }

    const nextX = pr.x + pr.vx * dt;
    const nextY = pr.y + pr.vy * dt;
    const nextZ = pr.z + pr.vz * dt;

    // Horizontal solid/pillar collision check
    const pushed = resolveHorizontal3D(nextX, Math.max(0, pr.y), nextZ, pr.radius, 0.45, col);
    if (pushed.hitWall) {
      if (pr.kind === 'grenade') {
        const nx = pushed.x - nextX;
        const nz = pushed.z - nextZ;
        const nLen = Math.hypot(nx, nz) || 1;
        const unx = nx / nLen;
        const unz = nz / nLen;
        const dot = pr.vx * unx + pr.vz * unz;
        if (dot < 0) {
          pr.vx = (pr.vx - 2 * dot * unx) * 0.74;
          pr.vz = (pr.vz - 2 * dot * unz) * 0.74;
        }
        pr.x = pushed.x;
        pr.z = pushed.z;
        pr.bounces++;
        w.events.push({ type: 'bounce' });
      } else {
        continue;
      }
    } else {
      pr.x = nextX;
      pr.z = nextZ;
    }

    // Floor collision
    const floorY = floorHeightAt3D(pr.x, pr.z, Math.max(0, pr.y), pr.radius, col);
    if (pr.kind === 'grenade') {
      if (floorY > -Infinity && nextY - pr.radius <= floorY && pr.vy < 0) {
        pr.y = floorY + pr.radius;
        pr.vy = Math.abs(pr.vy) * 0.62;
        pr.vx *= 0.86;
        pr.vz *= 0.86;
        pr.bounces++;
        w.events.push({ type: 'bounce' });
        if (pr.bounces >= 4) {
          triggerExplosion3D(w, pr.x, pr.y, pr.z, 4.1, pr.damage, 0xff8a30);
          continue;
        }
      } else {
        pr.y = nextY;
      }
    } else {
      if (floorY > -Infinity && nextY <= floorY) continue;
      pr.y = nextY;
    }

    // Actor & Barrel hits
    let consumed = false;
    if (pr.fromPlayer) {
      for (const e of w.enemies) {
        if (!e.alive) continue;
        const dXZ = Math.hypot(e.x - pr.x, e.z - pr.z);
        if (dXZ <= e.radius + pr.radius && pr.y >= e.y - 0.2 && pr.y <= e.y + e.height + 0.35) {
          if (pr.kind === 'grenade') {
            triggerExplosion3D(w, pr.x, pr.y, pr.z, 4.1, pr.damage, 0xff8a30);
          } else {
            const sp = Math.hypot(pr.vx, pr.vz) || 1;
            damageEnemy(w, e, pr.damage, (pr.vx / sp) * 2.5, (pr.vz / sp) * 2.5);
          }
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const b of w.barrels) {
          if (!b.alive) continue;
          const dXZ = Math.hypot(b.x - pr.x, b.z - pr.z);
          if (dXZ <= 0.55 + pr.radius && pr.y >= b.y && pr.y <= b.y + 1.45) {
            if (pr.kind === 'grenade') {
              triggerExplosion3D(w, pr.x, pr.y, pr.z, 4.1, pr.damage, 0xff8a30);
            } else {
              b.hp -= pr.damage;
              b.hitFlashTicks = 6;
              if (b.hp <= 0) {
                b.alive = false;
                triggerExplosion3D(w, b.x, b.y + 0.7, b.z, 4.4, 92, 0xff7a2f);
              }
            }
            consumed = true;
            break;
          }
        }
      }
      if (!consumed && Math.hypot(w.level.corePos.x - pr.x, w.level.corePos.z - pr.z) <= w.level.corePos.radius) {
        if (pr.kind === 'grenade') triggerExplosion3D(w, pr.x, pr.y, pr.z, 4.1, pr.damage, 0xff8a30);
        else damageCore(w, pr.damage);
        consumed = true;
      }
    } else {
      const pb = w.player.body;
      const dXZ = Math.hypot(pb.x - pr.x, pb.z - pr.z);
      if (dXZ <= ABILITY_3D.radius + pr.radius && pr.y >= pb.y && pr.y <= pb.y + ABILITY_3D.height) {
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
    const dz = pb.z - e.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const dirX = dx / dist;
    const dirZ = dz / dist;

    // Zone activation wake-up
    if (!e.active) {
      if (
        (e.zone === 'B' && pb.x > 18) ||
        (e.zone === 'C' && (pb.x > 49.5 || w.openDoors.has('gate_c'))) ||
        (e.zone === 'D' && (pb.x > 74 || w.coreDestroyed)) ||
        e.hitFlashTicks > 0
      ) {
        e.active = true;
      } else {
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

    if (e.kind === 'warden') {
      e.yaw = Math.atan2(dirX, dirZ);

      if (e.windupTicks > 0) {
        e.windupTicks--;
        e.anim = 'attack';
        if (e.windupTicks === 0) {
          // Slam shockwave ring
          w.shockwaves.push({
            id: w.nextId++,
            x: e.x,
            y: e.y,
            z: e.z,
            radius: 1.0,
            maxRadius: e.phase === 2 ? 15.5 : 13.0,
            speed: e.phase === 2 ? 11.2 : 8.8,
            damage: e.phase === 2 ? 26 : 20,
            hitPlayer: false,
            phase: e.phase,
          });
          w.shakeTicks = Math.max(w.shakeTicks, 14);
          w.shakeStrength = Math.max(w.shakeStrength, 0.36);
          w.events.push({ type: 'slam' });
          e.attackCooldown = e.phase === 2 ? 78 : 112;
        }
      } else if (e.attackCooldown === 0 && dist < 15.5) {
        if (w.tick % 2 === 0 || dist < 7.0) {
          // Telegraph Shockwave Slam
          e.windupTicks = e.phase === 2 ? 28 : 36;
          e.attackAnimTicks = 42;
        } else {
          // 5-way Orange Plasma Fan
          const baseAng = Math.atan2(dirX, dirZ);
          for (let i = -2; i <= 2; i++) {
            const ang = baseAng + i * 0.2;
            w.projectiles.push({
              id: w.nextId++,
              kind: 'boss_plasma',
              fromPlayer: false,
              x: e.x + Math.sin(ang) * 1.1,
              y: e.y + 1.5,
              z: e.z + Math.cos(ang) * 1.1,
              vx: Math.sin(ang) * 13.5,
              vy: 0,
              vz: Math.cos(ang) * 13.5,
              damage: 14,
              radius: 0.32,
              lifeTicks: 110,
              bounces: 0,
            });
          }
          e.attackAnimTicks = 22;
          e.attackCooldown = e.phase === 2 ? 64 : 88;
        }
      } else {
        const pursueSpeed = stats.speed * (e.phase === 2 ? 1.32 : 1.0);
        if (dist > 2.2) {
          e.vx = dirX * pursueSpeed;
          e.vz = dirZ * pursueSpeed;
          e.anim = 'walk';
        } else {
          e.vx *= 0.6;
          e.vz *= 0.6;
          e.anim = e.attackAnimTicks > 0 ? 'attack' : 'idle';
          if (e.attackCooldown <= 30 && Math.abs(pb.y - e.y) < 1.8) {
            damagePlayer(w, 16, dirX * 7, dirZ * 7);
            e.attackAnimTicks = 24;
            e.attackCooldown = 68;
          }
        }
      }
    } else if (e.kind === 'spitter') {
      e.yaw = Math.atan2(dirX, dirZ);
      const wantMove = dist > 12.5 ? 1 : dist < 5.5 ? -0.75 : 0;
      e.vx = dirX * stats.speed * wantMove;
      e.vz = dirZ * stats.speed * wantMove;
      if (e.attackCooldown === 0 && dist < 19) {
        const hitDist = castRaySolidDistance3D(w, e.x, e.y + 1.0, e.z, dirX, 0, dirZ, dist);
        if (hitDist >= dist - 0.9) {
          const dyAim = (pb.y + 0.95 - (e.y + 1.15)) / dist;
          w.projectiles.push({
            id: w.nextId++,
            kind: 'enemy_acid',
            fromPlayer: false,
            x: e.x + dirX * 0.6,
            y: e.y + 1.15,
            z: e.z + dirZ * 0.6,
            vx: dirX * 12.5,
            vy: dyAim * 12.5,
            vz: dirZ * 12.5,
            damage: 12,
            radius: 0.24,
            lifeTicks: 110,
            bounces: 0,
          });
          e.attackCooldown = 96;
          e.attackAnimTicks = 20;
        }
      }
      e.anim = e.attackAnimTicks > 0 ? 'attack' : Math.abs(wantMove) > 0.1 ? 'walk' : 'idle';
    } else {
      // Stalker / Crawler melee chase with speed decay from knockback
      e.yaw = Math.atan2(dirX, dirZ);
      const rageMul = e.kind === 'stalker' && dist < 7.5 ? 1.38 : 1.0;
      const wantVx = dist > 0.95 ? dirX * stats.speed * rageMul : 0;
      const wantVz = dist > 0.95 ? dirZ * stats.speed * rageMul : 0;
      e.vx = e.vx * 0.72 + wantVx * 0.28;
      e.vz = e.vz * 0.72 + wantVz * 0.28;

      if (dist <= e.radius + ABILITY_3D.radius + 0.75 && Math.abs(pb.y - e.y) < 1.55) {
        if (e.attackCooldown === 0) {
          damagePlayer(w, e.kind === 'stalker' ? 14 : 9, dirX * 5, dirZ * 5);
          e.attackCooldown = e.kind === 'stalker' ? 42 : 34;
          e.attackAnimTicks = 24;
        }
      }
      if (e.attackAnimTicks > 0) e.anim = 'attack';
      else if (Math.hypot(e.vx, e.vz) > 4.2) e.anim = 'run';
      else if (Math.hypot(e.vx, e.vz) > 0.6) e.anim = 'walk';
      else e.anim = 'idle';
    }

    // Horizontal slide + floor follow
    const nextX = e.x + e.vx * dt;
    const nextZ = e.z + e.vz * dt;
    const pushed = resolveHorizontal3D(nextX, e.y, nextZ, e.radius, e.height, col);
    e.x = pushed.x;
    e.z = pushed.z;
    const fy = floorHeightAt3D(e.x, e.z, e.y, e.radius, col);
    if (fy > -Infinity && Math.abs(fy - e.y) < 1.2) {
      e.y = fy;
      e.vy = 0;
    } else if (fy > -Infinity && e.y > fy) {
      e.vy = Math.max(-16, e.vy - 24 * dt);
      e.y = Math.max(fy, e.y + e.vy * dt);
    }
  }
}

function stepShockwaves3D(w: WorldState3D): void {
  const dt = ABILITY_3D.dt;
  const pb = w.player.body;
  const kept: ShockwaveRing3D[] = [];

  for (const sw of w.shockwaves) {
    sw.radius += sw.speed * dt;
    if (!sw.hitPlayer) {
      const dXZ = Math.hypot(pb.x - sw.x, pb.z - sw.z);
      if (Math.abs(dXZ - sw.radius) <= 0.75) {
        // Core Warden shockwave sits at y = 0..0.72; jumping over y > 0.72 dodges cleanly!
        if (pb.y < sw.y + 0.72) {
          sw.hitPlayer = true;
          const kx = dXZ > 0.1 ? ((pb.x - sw.x) / dXZ) * 9 : 0;
          const kz = dXZ > 0.1 ? ((pb.z - sw.z) / dXZ) * 9 : 0;
          damagePlayer(w, sw.damage, kx, kz);
        }
      }
    }
    if (sw.radius < sw.maxRadius) kept.push(sw);
  }
  w.shockwaves = kept;
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

  // Weapon selection switch
  if (input.weaponSlot !== 0 && p.unlocked[input.weaponSlot]) {
    p.weapon = input.weaponSlot;
  }

  // Cooldowns & timers
  if (p.fireCooldown > 0) p.fireCooldown--;
  if (p.dashInvulnTicks > 0) p.dashInvulnTicks--;
  if (p.hurtInvulnTicks > 0) p.hurtInvulnTicks--;
  if (p.muzzleFlashTicks > 0) p.muzzleFlashTicks--;
  if (p.hurtFlashTicks > 0) p.hurtFlashTicks--;
  if (p.acidCooldown > 0) p.acidCooldown--;
  if (w.shakeTicks > 0) {
    w.shakeTicks--;
    if (w.shakeTicks === 0) w.shakeStrength = 0;
  }

  // Update 360 aim point & upper-body aimYaw
  p.aimX = input.aimX;
  p.aimY = input.aimY;
  p.aimZ = input.aimZ;
  const aimDx = p.aimX - p.body.x;
  const aimDz = p.aimZ - p.body.z;
  if (Math.hypot(aimDx, aimDz) > 0.05) {
    p.aimYaw = Math.atan2(aimDx, aimDz);
  }

  // Step 60 Hz 3D capsule physics
  const prevState = p.body.state;
  const prevDash = p.body.dashTicks;
  const col = buildCollider3D(w.level, w.openDoors);
  p.body = stepBody3D(
    p.body,
    {
      moveX: input.moveX,
      moveZ: input.moveZ,
      jump: input.jump,
      dash: input.dash,
      aimDirX: aimDx,
      aimDirZ: aimDz,
    },
    col,
  );
  if (p.body.dashTicks > prevDash) {
    p.dashInvulnTicks = ABILITY_3D.dashTicks + 4;
    w.events.push({ type: 'dash' });
  }
  if (p.body.state === 2 && prevState !== 2) {
    w.events.push({ type: 'jump' });
  }

  // Acid pool burn hazard (jumping/catwalks avoid it!)
  if (p.body.grounded && p.body.y < -0.15 && p.acidCooldown === 0) {
    for (const pool of w.level.acidPools) {
      if (p.body.x >= pool.minX && p.body.x <= pool.maxX && p.body.z >= pool.minZ && p.body.z <= pool.maxZ) {
        damagePlayer(w, 8);
        p.acidCooldown = 28;
      }
    }
  }

  // Firing
  if (input.fire) fireWeapon3D(w);

  // Pickups & weapon pedestals
  for (const pk of w.pickups) {
    if (pk.taken) continue;
    const dXZ = Math.hypot(p.body.x - pk.x, p.body.z - pk.z);
    if (dXZ <= 1.25 && Math.abs(p.body.y - pk.y) <= 1.4) {
      if (pk.kind === 'weapon' && pk.weapon) {
        pk.taken = true;
        p.unlocked[pk.weapon] = true;
        if (pk.weapon !== 1) p.ammo[pk.weapon] += pk.value;
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

  // Security Console interaction (Catwalk B)
  if (!w.consoleUnlocked) {
    const dc = Math.hypot(p.body.x - w.level.consolePos.x, p.body.z - w.level.consolePos.z);
    if (dc <= w.level.consolePos.radius && Math.abs(p.body.y - w.level.consolePos.y) <= 1.4 && (input.interact || dc <= 1.35)) {
      w.consoleUnlocked = true;
      w.openDoors.add('gate_c');
      w.phase = 'warden';
      w.events.push({ type: 'unlock' });
    }
  }

  // Staggered Barrel fuses
  for (const b of w.barrels) {
    if (b.hitFlashTicks > 0) b.hitFlashTicks--;
    if (!b.alive) continue;
    if (b.fuseTicks >= 0) {
      b.fuseTicks--;
      if (b.fuseTicks < 0) {
        b.alive = false;
        triggerExplosion3D(w, b.x, b.y + 0.7, b.z, 4.4, 92, 0xff7a2f);
      }
    }
  }

  stepProjectiles3D(w);
  stepEnemies3D(w);
  stepShockwaves3D(w);

  // VFX decay
  w.explosions = w.explosions.filter((ex) => --ex.ticksLeft > 0);
  w.beams = w.beams.filter((bm) => --bm.ticksLeft > 0);

  // Meltdown escape timer & Extraction win check
  if (w.meltdownTicks > 0) {
    w.meltdownTicks--;
    if (w.meltdownTicks === 0 && w.status === 'playing') {
      w.status = 'lost';
    }
  }
  if (w.coreDestroyed && w.status === 'playing') {
    const de = Math.hypot(p.body.x - w.level.exitPos.x, p.body.z - w.level.exitPos.z);
    if (de <= w.level.exitPos.radius && Math.abs(p.body.y - w.level.exitPos.y) <= 1.5) {
      w.status = 'won';
      w.phase = 'won';
      w.events.push({ type: 'win' });
    }
  }

  return w;
}

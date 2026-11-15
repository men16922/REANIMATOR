// Round 10: the Reclaimer, an E.M.M.I.-style hunter unit that owns one bounded zone (original design).
//
// Rules (all deterministic, no Math.random, no RNG hash):
//  - Immune to normal fire. Pulse, Scatter, Grenade, Rocket and Flamer ping off the plating (see world3d).
//  - Patrols the zone. Hears noise (running, dashing, jumping, firing) inside the zone and hunts the source.
//  - Standing still, or sneaking at a quarter of run speed, is silent. A very close player is still felt.
//  - A catch is a Melee Counter QTE: the grab windup opens the existing counter window (PARRY_WINDOW_TICKS) for its last
//    ticks. The claw pins the player (no move, jump or dash) so the counter is the answer. Counter in time and the
//    Reclaimer reels with its visor open. Miss and the grab lands for heavy damage.
//  - Disabled for good by a fully charged Rail shot (Overcharge), a Rail shot into the open visor after a counter, or by
//    leaving the zone while carrying the key item (the Rail-Cannon, found inside the zone).
//  - Story and Hard change speed, hearing, the grab windup and the counter window. Normal is the identity preset.
//
// The sim for this unit lives here as pure functions over plain data so tests can drive it without a full world.

import type { SectorId3D } from './types3d.ts';

/** Fixed placement of the zone (part of the level, so every fresh world is identical). */
export interface HunterZoneDef3D {
  id: string;
  sector: SectorId3D;
  name: string;
  /** Horizontal and vertical extent of the zone volume. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** The hunter walks the floor at this height. */
  floorY: number;
  homeX: number;
  /** Weapon slot whose pedestal is the key item. Leaving the zone with it released disables the hunter. */
  keyWeapon: number;
  /** Boundary doors (render only, never solid). `axis` x = vertical door in the west wall, y = hatch in the ceiling. */
  gates: { id: string; x: number; y: number; axis: 'x' | 'y'; size: number }[];
}

export type HunterState3D_Name = 'patrol' | 'alert' | 'chase' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface HunterState3D {
  id: string;
  kind: 'hunter';
  zone: SectorId3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  yaw: number;
  facing: 1 | -1;
  /** Rig-driver compatible view (the renderer feeds this straight to EnemyRigDriver). */
  alive: boolean;
  active: boolean;
  phase: 1 | 2 | 3;
  bossPattern: string;
  exposedTicks: number;
  attackAnimTicks: number;
  hitFlashTicks: number;
  deathTicks: number;
  lungeTicks: number;
  radius: number;
  height: number;
  state: HunterState3D_Name;
  stateTicks: number;
  windupTicks: number;
  staggerTicks: number;
  /** True while the grab windup is inside the counter window. The renderer flashes the hunter white. */
  parryOpen: boolean;
  /** x the hunter is heading for (last place it heard the player). */
  targetX: number;
  /** Ticks since the last noise while hunting. */
  lostTicks: number;
  /** Ticks the hunter ignores noise (after a counter or a landed grab) so the player can slip away. */
  deafTicks: number;
  /** Patrol: +1/-1 heading and the pause left at a turn. */
  patrolDir: 1 | -1;
  waitTicks: number;
  /** Visual spark timer when a bullet pings off the plating. */
  pingTicks: number;
  /** Noise radius the player is making right now (m), for the HUD. */
  noiseNow: number;
  /** 'exit' or 'overcharge' or 'visor' once disabled. */
  disabledBy: '' | 'exit' | 'overcharge' | 'visor';
  /** Statistics for the run. */
  catches: number;
  counters: number;
  /** Ticks the zone has been in an alerted state (colour shift driver). */
  alarmTicks: number;
}

/** Tuning for one difficulty (Normal is the identity preset). */
export interface HunterParams {
  speedMul: number;
  hearMul: number;
  windup: number;
  window: number;
  stagger: number;
}

// ---- constants ----
export const HUNTER_HEIGHT = 2.9;
export const HUNTER_RADIUS = 0.9;
/** Normal-difficulty counter window. Equals the Melee Counter window (PARRY_WINDOW_TICKS); a test pins that. */
export const HUNTER_WINDOW_TICKS = 8;
export const HUNTER_PATROL_SPEED = 2.4;
export const HUNTER_CHASE_SPEED = 6.2;
export const HUNTER_ACCEL = 0.5;
export const HUNTER_ALERT_TICKS = 28;
export const HUNTER_WINDUP_TICKS = 40;
export const HUNTER_STAGGER_TICKS = 110;
/** The grab starts when the player is this close horizontally and within claw reach vertically. */
export const HUNTER_GRAB_RANGE = 2.2;
export const HUNTER_CLAW_REACH = 2.6;
/** The grab still connects if the player is within this horizontal range when the windup ends. */
export const HUNTER_HIT_RANGE = 3.0;
export const HUNTER_GRAB_DAMAGE = 48;
export const HUNTER_RECOVER_TICKS = 150;
/** After a grab or a counter the hunter is deaf this long. */
export const HUNTER_DEAF_TICKS = 150;
/** Chase gives up after this many silent ticks. */
export const HUNTER_LOSE_TICKS = 270;
/** A very close player is felt even when silent. */
export const HUNTER_SENSE_RANGE = 2.8;
/** Rail charge fraction that counts as Overcharge. */
export const HUNTER_OVERCHARGE_FRAC = 0.95;
/** Player speed (m/s) above which footsteps are loud. Sneaking (45% of run speed) stays under it. */
export const HUNTER_QUIET_SPEED = 5.2;
export const HUNTER_SNEAK_SCALE = 0.45;
export const HUNTER_NOISE = { fire: 15, dash: 14, jump: 8, runBase: 3, runPerMps: 1.15 } as const;
export const HUNTER_PING_TICKS = 10;

export const HUNTER_PARAMS: Record<'story' | 'normal' | 'hard', HunterParams> = {
  story: { speedMul: 0.8, hearMul: 0.75, windup: 56, window: 18, stagger: 150 },
  normal: { speedMul: 1, hearMul: 1, windup: HUNTER_WINDUP_TICKS, window: HUNTER_WINDOW_TICKS, stagger: HUNTER_STAGGER_TICKS },
  hard: { speedMul: 1.1, hearMul: 1.1, windup: 36, window: HUNTER_WINDOW_TICKS, stagger: 90 },
};

/** Params with the R8 hazard-warning assist applied (telegraph +20%, like the hazard telegraphs). */
export function hunterParams(difficulty: 'story' | 'normal' | 'hard', hazardWarn: boolean): HunterParams {
  const base = HUNTER_PARAMS[difficulty];
  return hazardWarn ? { ...base, windup: Math.round(base.windup * 1.2) } : base;
}

export function newHunter3D(zone: HunterZoneDef3D): HunterState3D {
  return {
    id: 'hunter-reclaimer',
    kind: 'hunter',
    zone: zone.sector,
    x: zone.homeX,
    y: zone.floorY,
    z: 0,
    vx: 0,
    vy: 0,
    yaw: -Math.PI / 2,
    facing: -1,
    alive: true,
    active: true,
    phase: 1,
    bossPattern: 'none',
    exposedTicks: 0,
    attackAnimTicks: 0,
    hitFlashTicks: 0,
    deathTicks: 0,
    lungeTicks: 0,
    radius: HUNTER_RADIUS,
    height: HUNTER_HEIGHT,
    state: 'patrol',
    stateTicks: 0,
    windupTicks: 0,
    staggerTicks: 0,
    parryOpen: false,
    targetX: zone.homeX,
    lostTicks: 0,
    deafTicks: 0,
    patrolDir: -1,
    waitTicks: 30,
    pingTicks: 0,
    noiseNow: 0,
    disabledBy: '',
    catches: 0,
    counters: 0,
    alarmTicks: 0,
  };
}

/** Plain-data view of the player and the tick for one hunter step. */
export interface HunterCtx {
  zone: HunterZoneDef3D;
  params: HunterParams;
  playerX: number;
  playerY: number;
  playerVx: number;
  playerGrounded: boolean;
  playerDashing: boolean;
  playerFired: boolean;
  playerJumped: boolean;
  /** Player owns the key item (Rail-Cannon). */
  hasKey: boolean;
  /** The world is currently in the zone's sector (the hunter only simulates there). */
  inSector: boolean;
  /** Called when a grab connects. The world applies damage and invulnerability and returns true when the player was actually hurt (a dash dodges it). */
  hit(damage: number, knockX: number): boolean;
  push(type: 'hunter_alert' | 'hunter_grab' | 'hunter_ping' | 'hunter_counter' | 'hunter_off', value?: number): void;
}

export function inHunterZone(zone: HunterZoneDef3D, x: number, y: number): boolean {
  return x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY;
}

/** Noise radius (m) the player makes this tick. 0 = silent. Pure. */
export function playerNoiseRadius(c: Pick<HunterCtx, 'playerVx' | 'playerGrounded' | 'playerDashing' | 'playerFired' | 'playerJumped'>): number {
  let r = 0;
  if (c.playerFired) r = Math.max(r, HUNTER_NOISE.fire);
  if (c.playerDashing) r = Math.max(r, HUNTER_NOISE.dash);
  if (c.playerJumped) r = Math.max(r, HUNTER_NOISE.jump);
  const sp = Math.abs(c.playerVx);
  if (c.playerGrounded && sp > HUNTER_QUIET_SPEED) r = Math.max(r, HUNTER_NOISE.runBase + sp * HUNTER_NOISE.runPerMps);
  return r;
}

/**
 * While the grab windup runs and the player is inside its claw, the player is pinned: movement, jump and dash input are
 * ignored (fire, aim and the Melee Counter still work). The counter is the only way out before the grab lands.
 */
export function hunterSnares(h: Readonly<HunterState3D>, px: number, py: number): boolean {
  if (!h.alive || h.state !== 'windup') return false;
  const dy = py - h.y;
  return Math.abs(px - h.x) <= HUNTER_HIT_RANGE && dy >= -0.6 && dy <= HUNTER_CLAW_REACH;
}

/** True when the hunter is the kind of thing a bullet should ping off (alive and in the world). */
export function hunterBlocksShots(h: Readonly<HunterState3D>): boolean {
  return h.alive;
}

/** Does a point (projectile) touch the hunter body box? */
export function hunterHitsPoint(h: Readonly<HunterState3D>, x: number, y: number, r: number): boolean {
  return h.alive && Math.abs(h.x - x) <= h.radius + r && y >= h.y - 0.1 && y <= h.y + h.height + 0.2;
}

export function disableHunter(h: HunterState3D, how: 'exit' | 'overcharge' | 'visor', c: Pick<HunterCtx, 'push'>): void {
  if (!h.alive) return;
  h.alive = false;
  h.state = 'dead';
  h.stateTicks = 0;
  h.windupTicks = 0;
  h.staggerTicks = 0;
  h.exposedTicks = 0;
  h.parryOpen = false;
  h.vx = 0;
  h.deathTicks = 0;
  h.disabledBy = how;
  c.push('hunter_off', how === 'exit' ? 0 : how === 'visor' ? 1 : 2);
}

/** A bullet struck the plating. Returns true when the hit was absorbed (always, while alive). */
export function pingHunter(h: HunterState3D, c: Pick<HunterCtx, 'push'>): boolean {
  if (!h.alive) return false;
  h.pingTicks = HUNTER_PING_TICKS;
  h.hitFlashTicks = 4;
  c.push('hunter_ping');
  return true;
}

/**
 * A Rail shot hit the hunter. Overcharge (full charge) or a shot into the open visor (staggered after a counter) disables it.
 * Anything else only pings. Returns true when the unit was disabled.
 */
export function railHitHunter(h: HunterState3D, frac: number, c: Pick<HunterCtx, 'push'>): boolean {
  if (!h.alive) return false;
  if (h.state === 'stagger') {
    disableHunter(h, 'visor', c);
    return true;
  }
  if (frac >= HUNTER_OVERCHARGE_FRAC) {
    disableHunter(h, 'overcharge', c);
    return true;
  }
  pingHunter(h, c);
  return false;
}

/** Melee Counter against the hunter. Returns true when the counter landed (the window was open and the player in reach). */
export function counterHunter(h: HunterState3D, playerX: number, params: HunterParams, c: Pick<HunterCtx, 'push'>, zone: HunterZoneDef3D): boolean {
  if (!h.alive || !h.parryOpen) return false;
  const away: 1 | -1 = h.x >= playerX ? 1 : -1;
  h.parryOpen = false;
  h.windupTicks = 0;
  h.state = 'stagger';
  h.staggerTicks = params.stagger;
  h.stateTicks = params.stagger;
  h.exposedTicks = params.stagger;
  h.deafTicks = HUNTER_DEAF_TICKS;
  h.lostTicks = 0;
  h.vx = 0;
  h.counters++;
  h.x = Math.max(zone.minX + 1, Math.min(zone.maxX - 1, h.x + away * 1.4));
  c.push('hunter_counter');
  return true;
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Advance the hunter one 60 Hz tick. */
export function stepHunter3D(h: HunterState3D, c: HunterCtx): void {
  if (h.hitFlashTicks > 0) h.hitFlashTicks--;
  if (h.pingTicks > 0) h.pingTicks--;
  const zone = c.zone;
  const px = c.playerX;
  const py = c.playerY;
  const inZone = inHunterZone(zone, px, py);

  h.parryOpen = false;
  if (!h.alive) {
    h.deathTicks++;
    h.vx = 0;
    h.noiseNow = 0;
    return;
  }

  // Leaving the zone while carrying the key item switches the unit off for good
  if (c.hasKey && !inZone) {
    disableHunter(h, 'exit', c);
    return;
  }

  if (!c.inSector) {
    h.noiseNow = 0;
    h.vx = 0;
    return;
  }

  h.attackAnimTicks = h.attackAnimTicks > 0 ? h.attackAnimTicks - 1 : 0;
  if (h.deafTicks > 0) h.deafTicks--;
  h.exposedTicks = h.state === 'stagger' ? h.staggerTicks : 0;

  // ---- hearing ----
  const noise = inZone ? playerNoiseRadius(c) : 0;
  h.noiseNow = noise;
  const dx = px - h.x;
  const adx = Math.abs(dx);
  const dy = py - h.y;
  const heardRange = noise * c.params.hearMul;
  const heard = inZone && h.deafTicks === 0 && ((noise > 0 && adx <= heardRange && Math.abs(dy) <= 8) || (adx <= HUNTER_SENSE_RANGE && Math.abs(dy) <= HUNTER_CLAW_REACH + 0.4));
  if (heard) {
    h.targetX = px;
    h.lostTicks = 0;
  }

  let wantVx = 0;
  switch (h.state) {
    case 'patrol': {
      if (heard) {
        h.state = 'alert';
        h.stateTicks = HUNTER_ALERT_TICKS;
        h.facing = dx >= 0 ? 1 : -1;
        h.vx = 0;
        c.push('hunter_alert');
        break;
      }
      if (h.waitTicks > 0) {
        h.waitTicks--;
        break;
      }
      const lo = zone.minX + 1.2;
      const hi = zone.maxX - 1.2;
      if ((h.patrolDir === 1 && h.x >= hi) || (h.patrolDir === -1 && h.x <= lo)) {
        h.patrolDir = h.patrolDir === 1 ? -1 : 1;
        h.waitTicks = 60;
        break;
      }
      h.facing = h.patrolDir;
      wantVx = h.patrolDir * HUNTER_PATROL_SPEED * c.params.speedMul;
      break;
    }
    case 'alert': {
      h.vx = 0;
      h.stateTicks--;
      h.facing = (heard ? dx : h.targetX - h.x) >= 0 ? 1 : -1;
      if (h.stateTicks <= 0) {
        h.state = 'chase';
        h.stateTicks = 0;
      }
      break;
    }
    case 'chase': {
      h.lostTicks++;
      const reachY = py - h.y >= -0.6 && py - h.y <= HUNTER_CLAW_REACH;
      // Catch: close enough horizontally with the player inside claw reach. Only a hunter that has noticed the player grabs.
      if (inZone && adx <= HUNTER_GRAB_RANGE && reachY && h.lostTicks < HUNTER_LOSE_TICKS) {
        h.state = 'windup';
        h.windupTicks = c.params.windup;
        h.stateTicks = c.params.windup;
        h.facing = dx >= 0 ? 1 : -1;
        h.vx = 0;
        h.attackAnimTicks = c.params.windup;
        c.push('hunter_grab');
        break;
      }
      if (h.lostTicks >= HUNTER_LOSE_TICKS || !inZone && h.lostTicks > 60) {
        h.state = 'patrol';
        h.waitTicks = 90;
        h.lostTicks = 0;
        h.patrolDir = h.x > zone.homeX ? -1 : 1;
        break;
      }
      const gap = h.targetX - h.x;
      if (Math.abs(gap) > 0.5) {
        h.facing = gap >= 0 ? 1 : -1;
        wantVx = h.facing * HUNTER_CHASE_SPEED * c.params.speedMul;
      }
      break;
    }
    case 'windup': {
      h.vx = 0;
      h.stateTicks--;
      h.windupTicks = Math.max(0, h.windupTicks - 1);
      if (h.windupTicks > 0 && h.windupTicks <= c.params.window) h.parryOpen = true;
      if (h.windupTicks === 0) {
        const reachY = py - h.y >= -0.6 && py - h.y <= HUNTER_CLAW_REACH;
        h.parryOpen = false;
        if (adx <= HUNTER_HIT_RANGE && reachY) {
          if (c.hit(HUNTER_GRAB_DAMAGE, h.facing * 7)) h.catches++;
        }
        h.state = 'recover';
        h.stateTicks = HUNTER_RECOVER_TICKS;
        h.deafTicks = HUNTER_DEAF_TICKS;
        h.lungeTicks = 0;
      }
      break;
    }
    case 'recover': {
      h.vx = 0;
      h.stateTicks--;
      if (h.stateTicks <= 0) {
        h.state = 'patrol';
        h.waitTicks = 40;
        h.lostTicks = 0;
        h.patrolDir = h.x > zone.homeX ? -1 : 1;
      }
      break;
    }
    case 'stagger': {
      h.vx = 0;
      h.staggerTicks--;
      h.stateTicks = h.staggerTicks;
      h.exposedTicks = h.staggerTicks;
      if (h.staggerTicks <= 0) {
        h.state = 'recover';
        h.stateTicks = 50;
        h.exposedTicks = 0;
      }
      break;
    }
    default:
      break;
  }

  if (wantVx !== 0 || h.state === 'patrol' || h.state === 'chase') {
    const accel = HUNTER_ACCEL;
    h.vx = approach(h.vx, wantVx, accel);
  }
  h.x += h.vx / 60;
  h.x = Math.max(zone.minX + 0.8, Math.min(zone.maxX - 0.8, h.x));
  h.y = zone.floorY;
  h.yaw = h.facing * (Math.PI / 2);

  const alarmed = h.state === 'alert' || h.state === 'chase' || h.state === 'windup';
  h.alarmTicks = alarmed ? h.alarmTicks + 1 : Math.max(0, h.alarmTicks - 2);
}

/** HUD summary, a pure function of the sim. */
export interface HunterHud {
  /** Show the HUNTER ZONE pill at all (player in the zone's sector and the unit not yet retired, or just retired). */
  show: boolean;
  inZone: boolean;
  disabled: boolean;
  label: 'QUIET' | 'ALERT' | 'PURSUIT' | 'COUNTER' | 'RECOVERING' | 'EXPOSED' | 'DISABLED';
  /** 0..1 driver for the red colour shift and vignette. */
  alarm: number;
}

export function hunterHud(h: Readonly<HunterState3D>, zone: HunterZoneDef3D, inSector: boolean, px: number, py: number): HunterHud {
  const inZone = inHunterZone(zone, px, py);
  if (!h.alive) {
    return { show: inSector && h.deathTicks < 360, inZone, disabled: true, label: 'DISABLED', alarm: 0 };
  }
  let label: HunterHud['label'] = 'QUIET';
  if (h.state === 'alert') label = 'ALERT';
  else if (h.state === 'chase') label = 'PURSUIT';
  else if (h.state === 'windup') label = 'COUNTER';
  else if (h.state === 'stagger') label = 'EXPOSED';
  else if (h.state === 'recover') label = 'RECOVERING';
  const alarm = Math.min(1, h.alarmTicks / 40);
  return { show: inSector && (inZone || h.alarmTicks > 0), inZone, disabled: false, label, alarm };
}

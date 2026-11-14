// Game rules for REANIMATOR.
// Player motion = verified restored engine (src/engine/motion.ts, 1995 ABUSE.EXE).
// Everything else here (dual-fire weapons, 3 enemy types, hazards, med-stations, core, exit, light) is NEW-DESIGN.
import { step, spawnBody, type Body } from '../engine/motion.ts';
import { tileCollider, parseMap, TILE } from '../engine/collider.ts';
import type { Collider } from '../engine/motion.ts';
import { MAP_ROWS } from './map.ts';
import { newLight, tickLight, toggleLight, type Light } from './light.ts';

/** Simulation rate. Original DOS tick rate was not measured; 15 Hz is a design choice. */
export const SIM_HZ = 15;

export const RULES = {
  playerHp: 100,
  fireDelay: 3, // ticks; matches script-read laser fire_delay1 3 (not observed)
  bulletSpeed: 17,
  bulletLife: 22,
  bulletDamage: 10,
  railCooldown: 22,
  railSpeed: 24,
  railLife: 24,
  railDamage: 30,
  railStagger: 9,
  crawlerHp: 30,
  crawlerSpeed: 2,
  crawlerSight: 200,
  spitterHp: 35,
  spitterSpeed: 1.5,
  spitterSight: 240,
  spitterChargeTicks: 10,
  spitterCooldown: 18,
  wardenHp: 150,
  wardenSpeed: 1.5,
  wardenSight: 260,
  wardenChargeTicks: 12,
  wardenCooldown: 22,
  enemyBulletSpeed: 6.5,
  enemyBulletDamage: 13,
  enemyBulletLife: 44,
  contactDamage: 14,
  wardenContactDamage: 20,
  hazardDamage: 12,
  medHeal: 35,
  invulnTicks: 15,
  pickupRadius: 20,
} as const;

export interface Controls {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  /** optional secondary overcharge rail-slug trigger */
  altFire?: boolean;
  /** aim target in world pixels */
  aimX: number;
  aimY: number;
  /** edge-triggered light toggle */
  toggleLight: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  piercing: boolean;
  hitIds: number[];
}

export interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
}

export interface Crawler {
  id: number;
  x: number;
  y: number;
  vy: number;
  hp: number;
  maxHp: number;
  dir: 1 | -1;
  hurt: number;
  stagger: number;
  dormant: boolean;
}

export interface Spitter {
  id: number;
  x: number;
  y: number;
  baseY: number;
  hp: number;
  maxHp: number;
  dir: 1 | -1;
  hurt: number;
  stagger: number;
  charge: number;
  cooldown: number;
  dormant: boolean;
}

export interface Warden {
  x: number;
  y: number;
  vy: number;
  hp: number;
  maxHp: number;
  dir: 1 | -1;
  hurt: number;
  stagger: number;
  charge: number;
  cooldown: number;
  phase: number;
}

export interface MedStation {
  id: number;
  x: number;
  y: number;
  used: boolean;
}

export type Phase = 'playing' | 'won' | 'lost';

export interface World {
  tick: number;
  phase: Phase;
  player: Body;
  hp: number;
  invuln: number;
  fireCooldown: number;
  railCooldown: number;
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  crawlers: Crawler[];
  spitters: Spitter[];
  warden: Warden | null;
  meds: MedStation[];
  hasCore: boolean;
  light: Light;
  kills: number;
  shots: number;
  railShots: number;
  medsUsed: number;
  hazardHits: number;
}

export const MAP = parseMap(MAP_ROWS);
export const COLLIDER: Collider = tileCollider(MAP);
const feet = (p: { tx: number; ty: number }) => ({ x: p.tx * TILE + TILE / 2, y: (p.ty + 1) * TILE });
export const START = feet(MAP.find('P')[0]);
export const CORE = feet(MAP.find('C')[0]);
export const EXIT = feet(MAP.find('X')[0]);
export const HAZARDS = MAP.find('H');

const hazardSet = new Set(HAZARDS.map((h) => `${h.tx},${h.ty}`));
export function isHazardTile(tx: number, ty: number): boolean {
  return hazardSet.has(`${tx},${ty}`);
}

export function newWorld(): World {
  const wardenSpots = MAP.find('B').map(feet);
  const wSpot = wardenSpots[0];
  return {
    tick: 0,
    phase: 'playing',
    player: spawnBody(START.x, START.y),
    hp: RULES.playerHp,
    invuln: 0,
    fireCooldown: 0,
    railCooldown: 0,
    bullets: [],
    enemyBullets: [],
    crawlers: [
      ...MAP.find('E').map((p) => ({ ...feet(p), dormant: false })),
      ...MAP.find('W').map((p) => ({ ...feet(p), dormant: true })),
    ].map((c, i) => ({
      id: i,
      ...c,
      vy: 0,
      hp: RULES.crawlerHp,
      maxHp: RULES.crawlerHp,
      dir: -1 as const,
      hurt: 0,
      stagger: 0,
    })),
    spitters: [
      ...MAP.find('S').map((p) => ({ ...feet(p), dormant: false })),
      ...MAP.find('D').map((p) => ({ ...feet(p), dormant: true })),
    ].map((s, i) => ({
      id: i,
      x: s.x,
      y: s.y - 6,
      baseY: s.y - 6,
      hp: RULES.spitterHp,
      maxHp: RULES.spitterHp,
      dir: (i % 2 === 0 ? -1 : 1) as 1 | -1,
      hurt: 0,
      stagger: 0,
      charge: 0,
      cooldown: 6,
      dormant: s.dormant,
    })),
    warden: wSpot
      ? {
          x: wSpot.x,
          y: wSpot.y,
          vy: 0,
          hp: RULES.wardenHp,
          maxHp: RULES.wardenHp,
          dir: -1,
          hurt: 0,
          stagger: 0,
          charge: 0,
          cooldown: 10,
          phase: 0,
        }
      : null,
    meds: MAP.find('M').map((p, i) => ({ id: i, ...feet(p), used: false })),
    hasCore: false,
    light: newLight(),
    kills: 0,
    shots: 0,
    railShots: 0,
    medsUsed: 0,
    hazardHits: 0,
  };
}

const solidPx = (x: number, y: number) => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP.w || ty >= MAP.h) return true;
  return MAP.solid(tx, ty);
};

function lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 8));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (solidPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/** One simulation tick. Pure with respect to its input world (returns a new world). */
export function update(w0: World, c: Controls): World {
  if (w0.phase !== 'playing') return w0;
  const w: World = structuredClone(w0);
  w.tick++;

  // ---- light (variant-contract: renderer only, never influences gameplay) ----
  if (c.toggleLight) w.light = toggleLight(w.light);
  w.light = tickLight(w.light);

  // ---- player: restored motion rules ----
  const xm = c.left === c.right ? 0 : c.left ? -1 : 1;
  w.player = step(w.player, { xm, ym: c.jump ? -1 : 0 }, COLLIDER);

  // ---- weapons (primary pulse + secondary piercing rail-slug) ----
  if (w.fireCooldown > 0) w.fireCooldown--;
  if (w.railCooldown > 0) w.railCooldown--;
  const ox = w.player.x, oy = w.player.y - 18;
  const dxAim = c.aimX - ox, dyAim = c.aimY - oy;
  const aimLen = Math.hypot(dxAim, dyAim) || 1;
  const ux = dxAim / aimLen, uy = dyAim / aimLen;

  if (c.altFire && w.railCooldown === 0) {
    w.bullets.push({
      x: ox,
      y: oy,
      vx: ux * RULES.railSpeed,
      vy: uy * RULES.railSpeed,
      life: RULES.railLife,
      damage: RULES.railDamage,
      piercing: true,
      hitIds: [],
    });
    w.railCooldown = RULES.railCooldown;
    w.fireCooldown = Math.max(w.fireCooldown, 3);
    w.shots++;
    w.railShots++;
  } else if (c.fire && w.fireCooldown === 0) {
    w.bullets.push({
      x: ox,
      y: oy,
      vx: ux * RULES.bulletSpeed,
      vy: uy * RULES.bulletSpeed,
      life: RULES.bulletLife,
      damage: RULES.bulletDamage,
      piercing: false,
      hitIds: [],
    });
    w.fireCooldown = RULES.fireDelay;
    w.shots++;
  }

  for (const b of w.bullets) {
    const subSteps = b.piercing ? 6 : 4;
    for (let s = 0; s < subSteps && b.life > 0; s++) {
      b.x += b.vx / subSteps;
      b.y += b.vy / subSteps;
      if (solidPx(b.x, b.y)) { b.life = 0; break; }

      // Hit crawlers
      for (const k of w.crawlers) {
        if (k.hp <= 0 || k.dormant || b.hitIds.includes(k.id)) continue;
        if (Math.abs(k.x - b.x) < 10 && b.y > k.y - 20 && b.y < k.y + 2) {
          b.hitIds.push(k.id);
          k.hp -= b.damage;
          k.hurt = 4;
          if (b.piercing) k.stagger = RULES.railStagger;
          if (k.hp <= 0) w.kills++;
          if (!b.piercing) { b.life = 0; break; }
        }
      }
      if (b.life <= 0) break;

      // Hit spitters (encoded id offset 1000 + s.id)
      for (const sp of w.spitters) {
        const tag = 1000 + sp.id;
        if (sp.hp <= 0 || sp.dormant || b.hitIds.includes(tag)) continue;
        if (Math.hypot(sp.x - b.x, sp.y - 10 - b.y) < 12) {
          b.hitIds.push(tag);
          sp.hp -= b.damage;
          sp.hurt = 4;
          if (b.piercing) { sp.stagger = RULES.railStagger; sp.charge = 0; }
          if (sp.hp <= 0) w.kills++;
          if (!b.piercing) { b.life = 0; break; }
        }
      }
      if (b.life <= 0) break;

      // Hit Core Warden (encoded id -99)
      if (w.warden && w.warden.hp > 0 && !b.hitIds.includes(-99)) {
        const wd = w.warden;
        if (Math.abs(wd.x - b.x) < 16 && b.y > wd.y - 34 && b.y < wd.y + 2) {
          b.hitIds.push(-99);
          wd.hp -= b.damage;
          wd.hurt = 4;
          if (b.piercing) { wd.stagger = RULES.railStagger; wd.charge = 0; }
          if (wd.hp <= 0) { wd.hp = 0; w.kills++; }
          if (!b.piercing) { b.life = 0; break; }
        }
      }
    }
    b.life--;
  }
  w.bullets = w.bullets.filter((b) => b.life > 0);

  // ---- crawlers (Skitter-Husks) ----
  for (const k of w.crawlers) {
    if (k.hp <= 0 || k.dormant) continue;
    if (k.hurt > 0) k.hurt--;
    if (k.stagger > 0) { k.stagger--; continue; }
    const dx = w.player.x - k.x;
    const sees = Math.abs(dx) < RULES.crawlerSight && Math.abs(w.player.y - k.y) < 48;
    if (sees && Math.abs(dx) > 3) k.dir = dx < 0 ? -1 : 1;
    const spd = sees ? RULES.crawlerSpeed + 0.5 : RULES.crawlerSpeed;
    const nx = k.x + k.dir * spd;
    const wallAhead = solidPx(nx + k.dir * 8, k.y - 4);
    const floorAhead = solidPx(nx + k.dir * 8, k.y + 1);
    if (wallAhead || !floorAhead) k.dir = (k.dir * -1) as 1 | -1;
    else k.x = nx;
    if (!solidPx(k.x, k.y + 1)) {
      k.vy = Math.min(k.vy + 1, 12);
      for (let i = 0; i < k.vy && !solidPx(k.x, k.y + 1); i++) k.y++;
    } else {
      k.vy = 0;
    }
    if (w.invuln === 0 && Math.abs(k.x - w.player.x) < 12 && Math.abs(k.y - w.player.y) < 20) {
      w.hp -= RULES.contactDamage;
      w.invuln = RULES.invulnTicks;
    }
  }

  // ---- spitters (Spore-Sentinels) ----
  for (const sp of w.spitters) {
    if (sp.hp <= 0 || sp.dormant) continue;
    if (sp.hurt > 0) sp.hurt--;
    if (sp.stagger > 0) { sp.stagger--; continue; }
    if (sp.cooldown > 0) sp.cooldown--;
    sp.y = sp.baseY + Math.round(Math.sin((w.tick + sp.id * 7) * 0.25) * 4);
    const dx = w.player.x - sp.x, dy = w.player.y - 14 - (sp.y - 8);
    const dist = Math.hypot(dx, dy);
    const sees = dist < RULES.spitterSight && lineOfSight(sp.x, sp.y - 8, w.player.x, w.player.y - 14);

    if (sees) {
      if (Math.abs(dx) > 4) sp.dir = dx < 0 ? -1 : 1;
      if (sp.charge > 0) {
        sp.charge++;
        if (sp.charge >= RULES.spitterChargeTicks) {
          const len = dist || 1;
          w.enemyBullets.push({
            x: sp.x,
            y: sp.y - 4,
            vx: (dx / len) * RULES.enemyBulletSpeed,
            vy: (dy / len) * RULES.enemyBulletSpeed,
            life: RULES.enemyBulletLife,
            damage: RULES.enemyBulletDamage,
          });
          sp.charge = 0;
          sp.cooldown = RULES.spitterCooldown;
        }
      } else if (sp.cooldown === 0) {
        sp.charge = 1;
      }
    } else {
      sp.charge = 0;
      const nx = sp.x + sp.dir * RULES.spitterSpeed;
      if (solidPx(nx + sp.dir * 10, sp.baseY - 8)) sp.dir = (sp.dir * -1) as 1 | -1;
      else sp.x = nx;
    }
  }

  // ---- Core Warden (Sector C Vault Boss) ----
  if (w.warden && w.warden.hp > 0) {
    const wd = w.warden;
    if (wd.hurt > 0) wd.hurt--;
    if (wd.stagger > 0) {
      wd.stagger--;
    } else {
      if (wd.cooldown > 0) wd.cooldown--;
      const dx = w.player.x - wd.x;
      const dy = w.player.y - 16 - (wd.y - 18);
      const dist = Math.hypot(dx, dy);
      const sees = dist < RULES.wardenSight && Math.abs(w.player.y - wd.y) < 110;
      if (sees && Math.abs(dx) > 6) wd.dir = dx < 0 ? -1 : 1;

      if (sees && wd.charge > 0) {
        wd.charge++;
        if (wd.charge >= RULES.wardenChargeTicks) {
          const baseAngle = Math.atan2(dy, dx);
          for (const off of [-0.24, 0, 0.24]) {
            w.enemyBullets.push({
              x: wd.x + wd.dir * 10,
              y: wd.y - 18,
              vx: Math.cos(baseAngle + off) * RULES.enemyBulletSpeed,
              vy: Math.sin(baseAngle + off) * RULES.enemyBulletSpeed,
              life: RULES.enemyBulletLife,
              damage: RULES.enemyBulletDamage,
            });
          }
          wd.charge = 0;
          wd.cooldown = RULES.wardenCooldown;
          wd.phase++;
        }
      } else {
        if (sees && wd.cooldown === 0 && dist > 36) {
          wd.charge = 1;
        } else {
          const nx = wd.x + wd.dir * RULES.wardenSpeed;
          const wall = solidPx(nx + wd.dir * 13, wd.y - 10) || solidPx(nx + wd.dir * 13, wd.y - 24);
          const floor = solidPx(nx + wd.dir * 12, wd.y + 1);
          if (wall || !floor) wd.dir = (wd.dir * -1) as 1 | -1;
          else wd.x = nx;
        }
      }
      if (!solidPx(wd.x, wd.y + 1)) {
        wd.vy = Math.min(wd.vy + 1, 12);
        for (let i = 0; i < wd.vy && !solidPx(wd.x, wd.y + 1); i++) wd.y++;
      } else {
        wd.vy = 0;
      }
      if (w.invuln === 0 && Math.abs(wd.x - w.player.x) < 16 && Math.abs(wd.y - w.player.y) < 30) {
        w.hp -= RULES.wardenContactDamage;
        w.invuln = RULES.invulnTicks;
      }
    }
  }

  // ---- enemy projectiles ----
  for (const eb of w.enemyBullets) {
    eb.x += eb.vx;
    eb.y += eb.vy;
    eb.life--;
    if (solidPx(eb.x, eb.y)) { eb.life = 0; continue; }
    if (
      w.invuln === 0 &&
      Math.abs(eb.x - w.player.x) < 8 &&
      eb.y >= w.player.y - 28 &&
      eb.y <= w.player.y
    ) {
      w.hp -= eb.damage;
      w.invuln = RULES.invulnTicks;
      eb.life = 0;
    }
  }
  w.enemyBullets = w.enemyBullets.filter((eb) => eb.life > 0);

  // ---- floor hazards (H tiles) ----
  if (w.invuln === 0) {
    const ty = Math.floor((w.player.y - 2) / TILE);
    const txL = Math.floor((w.player.x - 4) / TILE);
    const txR = Math.floor((w.player.x + 3) / TILE);
    if (isHazardTile(txL, ty) || isHazardTile(txR, ty)) {
      w.hp -= RULES.hazardDamage;
      w.invuln = RULES.invulnTicks;
      w.hazardHits++;
    }
  }

  if (w.invuln > 0) w.invuln--;

  // ---- Nano-Med Stations (M) ----
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - w.player.x, p.y - w.player.y) < RULES.pickupRadius;
  for (const m of w.meds) {
    if (!m.used && w.hp > 0 && w.hp < RULES.playerHp && near(m)) {
      m.used = true;
      w.hp = Math.min(RULES.playerHp, w.hp + RULES.medHeal);
      w.medsUsed++;
    }
  }

  // ---- Core & Extraction Exit ----
  if (!w.hasCore && near(CORE)) {
    w.hasCore = true;
    for (const k of w.crawlers) k.dormant = false; // escape wave
    for (const sp of w.spitters) sp.dormant = false;
  }
  if (w.hasCore && near(EXIT)) w.phase = 'won';
  if (w.hp <= 0) { w.hp = 0; w.phase = 'lost'; }
  return w;
}

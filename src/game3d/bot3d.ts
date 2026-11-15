// Deterministic closed-loop side-view Metroidvania bot for REANIMATOR.
// Walks the six-sector progression (blue -> green -> Mines upgrades -> yellow -> Bio-Labs -> Security -> red -> Core -> escape)
// by driving the real stepWorld3D. Shared by tools/game/playthrough.ts and tools/smoke/capture-showcase.ts.

import { castRaySolidDistance3D, emptyInput3D, hazardNowTick3D, type InputState3D, type WorldState3D } from './world3d.ts';
import { hazardHold } from './hazards.ts';
import { navReached, navSteer, type NavTarget } from './nav3d.ts';
import type { WeaponSlot3D } from './types3d.ts';

interface BotStep extends NavTarget {
  label: string;
  /** Shoot a lock while standing here until `done` holds */
  fire?: { weapon: WeaponSlot3D; aimX: number; aimY: number };
  done?: (w: WorldState3D) => boolean;
  /** Special behaviour handlers */
  mode?: 'boss' | 'core';
  /** Stand still on the cargo lift car until it has carried the bot to the target height */
  ride?: boolean;
}

export interface Bot3D {
  next(w: WorldState3D): InputState3D;
  readonly stepIndex: number;
  readonly stepLabel: string;
}

const door = (id: string) => (w: WorldState3D) => w.openDoors.has(id);
const has = (slot: WeaponSlot3D) => (w: WorldState3D) => w.player.unlocked[slot];
const upgrade = (id: string) => (w: WorldState3D) => w.collectedUpgrades.has(id);
/** Nest cleared: the bot holds its firing position until the spawner is destroyed. */
const hiveDown = (id: string) => (w: WorldState3D) => !w.hives.find((h) => h.id === id)?.alive;

function buildSteps(w: WorldState3D): BotStep[] {
  const L = w.level;
  const ped = (id: string) => L.pedestals.find((p) => p.id === id)!;
  const sc = ped('ped-scatter');
  const gr = ped('ped-grenade');
  const rl = ped('ped-rail');
  const sv = (id: string) => L.saveStations.find((s) => s.id === id)!;
  return [
    { label: 'airlock crate', x: 7.5, y: 0 },
    { label: 'past crate', x: 12, y: 0, leap: true },
    { label: 'blue door', x: 19.5, y: 0, fire: { weapon: 1, aimX: 24, aimY: 1.4 }, done: door('door_airlock_shaft') },
    { label: 'shaft', x: 26, y: 0 },
    { label: 'grate', x: 33, y: 0 },
    { label: 'down 1', x: 33, y: -2.2 },
    { label: 'down 2', x: 33, y: -4.4 },
    { label: 'down 3', x: 33, y: -6.6 },
    { label: 'down 4', x: 33, y: -8.8 },
    { label: 'floor', x: 33, y: -11 },
    { label: 'scattergun', x: sc.x, y: sc.y, tolX: 0.9, tolY: 0.4, done: has(2) },
    { label: 'green door', x: 28.5, y: -11, fire: { weapon: 2, aimX: 24, aimY: -9.4 }, done: door('door_shaft_mines') },
    { label: 'mines', x: 20, y: -11 },
    { label: 'hive mines', x: 22.5, y: -11, tolX: 0.8, done: hiveDown('hive-mines-1') },
    { label: 'save mines', x: sv('save_mines').x, y: -11, tolX: 1.0, done: (s) => s.lastSaveId === 'save_mines' },
    { label: 'mines edge', x: 16.9, y: -11, tolX: 0.3 },
    { label: 'stone', x: 13, y: -9.6, leap: true },
    { label: 'vault', x: 9.5, y: -8.6, leap: true },
    { label: 'grenade', x: gr.x, y: gr.y, tolX: 0.9, tolY: 0.4, done: has(3) },
    { label: 'tank mines', x: 5.5, y: -8.6, tolX: 0.9, tolY: 0.4, done: upgrade('etank_mines') },
    { label: 'boots', x: 3.0, y: -8.6, tolX: 0.9, tolY: 0.4, done: upgrade('thruster_boots') },
    { label: 'vault east', x: 9.8, y: -8.6, tolX: 0.3 },
    { label: 'stone back', x: 13, y: -9.6, leap: true },
    { label: 'mines floor', x: 18, y: -11, leap: true },
    { label: 'shaft floor', x: 33, y: -11 },
    // Cargo lift: board the car, wait out the dwell, fight the mid-shaft ambush on the way up
    { label: 'lift board', x: 30.9, y: -11, tolX: 0.4 },
    { label: 'lift ride', x: 30.9, y: 0, ride: true },
    { label: 'grate back', x: 33, y: 0 },
    { label: 'yellow door', x: 36, y: 0, fire: { weapon: 3, aimX: 42, aimY: 1.9 }, done: door('door_shaft_biolabs') },
    { label: 'bio-labs', x: 46, y: 0 },
    { label: 'hive bio west', x: 43.5, y: 0, tolX: 0.8, done: hiveDown('hive-bio-1') },
    { label: 'bio switch', x: 49.4, y: 0, tolX: 0.4, done: (s) => s.switches.some((x) => x.id === 'sw-bio-bridge' && x.on) },
    { label: 'plat 1', x: 50, y: 2.2 },
    { label: 'tank bio', x: 55, y: 4.5, tolX: 0.9, tolY: 0.4, leap: true, done: upgrade('etank_biolabs') },
    { label: 'bio grate', x: 65, y: 4.4, leap: true },
    { label: 'security grate', x: 65, y: 8.8 },
    { label: 'hive security', x: 65.5, y: 8.8, tolX: 0.8, done: hiveDown('hive-sec-1') },
    { label: 'console', x: 55.8, y: 8.8, tolX: 0.4, done: (s) => s.consoleUnlocked },
    { label: 'past console', x: 52, y: 8.8, leap: true },
    { label: 'save security', x: sv('save_security').x, y: 8.8, tolX: 1.0, done: (s) => s.lastSaveId === 'save_security' },
    { label: 'security grate back', x: 65, y: 8.8, leap: true },
    { label: 'bio grate back', x: 65, y: 4.4 },
    { label: 'rail', x: rl.x, y: rl.y, tolX: 0.9, tolY: 0.4, done: has(4) },
    // Round 10: leaving the Reclaimer zone with the Rail-Cannon retires the hunter, so the rest of the Bio-Labs work happens west of it
    { label: 'zone exit', x: 57.2, y: 0, tolX: 0.5 },
    { label: 'hive bio east', x: 56.0, y: 0, tolX: 0.8, done: hiveDown('hive-bio-2') },
    { label: 'red door', x: 56.0, y: 0, fire: { weapon: 4, aimX: 70, aimY: 2.0 }, done: door('door_boss') },
    { label: 'core arena', x: 73, y: 0, tolX: 0.8 },
    { label: 'warden', x: 73, y: 0, mode: 'boss', done: (s) => !s.enemies.some((e) => e.kind === 'warden' && e.alive) },
    { label: 'reactor core', x: 87.5, y: 0, mode: 'core', done: (s) => s.coreDestroyed },
    { label: 'escape bio', x: 60, y: 0 },
    { label: 'escape bio west', x: 47, y: 0, tolX: 1.5, leap: true },
    { label: 'escape ledge east', x: 38, y: 0 },
    { label: 'escape up 1', x: 37, y: 2.2 },
    { label: 'escape up 2', x: 38, y: 4.4 },
    { label: 'escape ledge', x: 26.5, y: 5.2, leap: true },
    { label: 'hatch', x: 22, y: 5.2 },
    { label: 'extraction', x: L.exitPos.x, y: L.exitPos.y, tolX: 1.2 },
  ];
}

interface Threat {
  x: number;
  y: number;
  dist: number;
  boss: boolean;
}

function pickThreat(w: WorldState3D): Threat | null {
  const pb = w.player.body;
  const ox = pb.x;
  const oy = pb.y + 1.12;
  let best: (Threat & { score: number }) | null = null;
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const ty = e.y + e.height * 0.52;
    const dist = Math.hypot(e.x - ox, ty - oy);
    if (dist > 17) continue;
    const dx = (e.x - ox) / (dist || 1);
    const dy = (ty - oy) / (dist || 1);
    const wall = castRaySolidDistance3D(w, ox, oy, 0, dx, dy, 0, dist);
    if (wall < dist - e.radius - 0.55) continue;
    const score = dist - (e.kind === 'warden' ? 5 : 0);
    if (!best || score < best.score) best = { x: e.x, y: ty, dist, boss: e.kind === 'warden', score };
  }
  // Nests rank behind live enemies, so the bot clears the brood first and then burns the spawner
  for (const h of w.hives) {
    if (!h.alive) continue;
    const ty = h.y + h.height * 0.5;
    const dist = Math.hypot(h.x - ox, ty - oy);
    if (dist > 15) continue;
    const dx = (h.x - ox) / (dist || 1);
    const dy = (ty - oy) / (dist || 1);
    const wall = castRaySolidDistance3D(w, ox, oy, 0, dx, dy, 0, dist);
    if (wall < dist - h.radius - 0.4) continue;
    const score = dist + 6;
    if (!best || score < best.score) best = { x: h.x, y: ty, dist, boss: false, score };
  }
  return best;
}

function chooseWeapon(w: WorldState3D, t: Threat): WeaponSlot3D {
  const p = w.player;
  if (t.boss && p.unlocked[4] && p.ammo[4] > 0 && t.dist > 5) return 4;
  if (p.unlocked[2] && p.ammo[2] > 3 && t.dist < 6.5) return 2;
  return 1;
}

export function createBot3D(w0: WorldState3D): Bot3D {
  const steps = buildSteps(w0);
  let idx = 0;
  let prevJump = false;
  let bossSide: 1 | -1 = -1;

  return {
    get stepIndex() {
      return idx;
    },
    get stepLabel() {
      return steps[Math.min(idx, steps.length - 1)].label;
    },
    next(w: WorldState3D): InputState3D {
      const inp = emptyInput3D();
      const p = w.player;
      const b = p.body;
      const maxJumps = p.abilities.thrusterBoots ? 2 : 1;

      // Advance finished steps
      while (idx < steps.length - 1) {
        const s = steps[idx];
        const arrived = navReached(b, s) && b.grounded;
        const finished = s.done ? s.done(w) : arrived;
        if (finished) idx++;
        else break;
      }
      const step = steps[idx];
      let target: NavTarget = step;

      if (step.mode === 'boss') {
        const warden = w.enemies.find((e) => e.kind === 'warden' && e.alive);
        if (warden) {
          const dist = Math.abs(warden.x - b.x);
          // Keep ~9 m of space; if cornered against the vault door, run through to the far side
          if (dist < 5.5 && b.x < 73.5 && bossSide === -1) bossSide = 1;
          else if (dist < 5.5 && b.x > 94 && bossSide === 1) bossSide = -1;
          const wantX = warden.x + bossSide * 9;
          target = { x: Math.max(72, Math.min(96, wantX)), y: 0, tolX: 0.8 };
        }
      } else if (step.mode === 'core') {
        target = { x: step.x, y: 0, tolX: 0.8 };
      }

      const nav = navSteer(b, target, prevJump, { maxJumps });
      inp.moveX = nav.moveX;
      inp.jump = nav.jump;
      inp.dropDown = nav.dropDown;
      if (step.ride) {
        inp.moveX = 0;
        inp.jump = false;
        inp.dropDown = false;
      }
      // Cautious walker: stop short of a hazard column that will be dangerous during the crossing
      let holding = false;
      if (!step.mode && !step.ride && b.grounded) {
        for (const h of w.level.hazards) {
          // The meltdown run does not wait for falling rock: the bot trusts its dash and takes the odd hit
          if (h.kind === 'rubble') continue;
          if (hazardHold(h, hazardNowTick3D(w, h), b.x, b.y, inp.moveX)) {
            holding = true;
            break;
          }
        }
      }
      if (holding) {
        inp.moveX = 0;
        inp.jump = false;
      }
      prevJump = inp.jump;

      // Hop incoming shockwaves
      for (const sw of w.shockwaves) {
        const gap = Math.abs(b.x - sw.x) - sw.radius;
        if (b.grounded && gap > -0.8 && gap < 2.2) inp.jump = true;
      }
      // Read the Warden's telegraphs: dash through a charge, hop incoming plasma rings
      const wd = w.enemies.find((e) => e.kind === 'warden' && e.alive);
      if (wd && wd.bossPattern === 'charge' && wd.lungeTicks > 0 && Math.abs(wd.x - b.x) < 5.5 && b.dashCooldown === 0) {
        inp.dash = true;
        inp.moveX = wd.chargeDir;
      }
      for (const pr of w.projectiles) {
        if (pr.fromPlayer || pr.kind !== 'boss_plasma') continue;
        const gx = pr.x - b.x;
        if (b.grounded && Math.abs(gx) < 3.2 && gx * pr.vx < 0 && pr.y > b.y - 0.4 && pr.y < b.y + 1.9) inp.jump = true;
      }
      // Dash long flat stretches during the meltdown run and to cross the Warden
      const flat = Math.abs(target.y - b.y) < 0.5 && Math.abs(target.x - b.x) > 9;
      if (!holding && b.dashCooldown === 0 && b.grounded && ((w.phase === 'escape' && flat) || (step.mode === 'boss' && bossSide === 1 && Math.abs(b.x - target.x) > 6))) {
        inp.dash = true;
      }

      // Aim & fire: enemies first, then the lock/core this step is working on
      const threat = pickThreat(w);
      const standing = navReached(b, step) || step.fire !== undefined;
      if (threat && (threat.dist < 14 || !step.fire)) {
        inp.aimX = threat.x;
        inp.aimY = threat.y;
        inp.weaponSlot = chooseWeapon(w, threat);
        inp.fire = true;
      } else if (step.fire && standing) {
        inp.aimX = step.fire.aimX;
        inp.aimY = step.fire.aimY;
        inp.weaponSlot = step.fire.weapon;
        inp.fire = p.weapon === step.fire.weapon;
      } else if (step.mode === 'core' && !w.coreDestroyed) {
        inp.aimX = w.level.corePos.x;
        inp.aimY = 1.3;
        inp.weaponSlot = p.unlocked[4] && p.ammo[4] > 0 ? 4 : 1;
        inp.fire = true;
      } else {
        inp.aimX = b.x + (nav.moveX || p.facing) * 8;
        inp.aimY = b.y + 1.12;
      }

      // Reclaimer catch: press the Melee Counter while the grab windup is inside its window (the bot never wastes a press)
      const hu = w.hunter;
      if (hu.alive && hu.parryOpen && Math.abs(hu.x - b.x) <= 3.4) inp.counter = true;

      // Console / save interaction
      inp.interact = true;
      return inp;
    },
  };
}

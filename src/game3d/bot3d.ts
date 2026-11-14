// Deterministic closed-loop side-view Metroidvania bot for REANIMATOR.
// Walks the six-sector progression (blue -> green -> Mines upgrades -> yellow -> Bio-Labs -> Security -> red -> Core -> escape)
// by driving the real stepWorld3D. Shared by tools/game/playthrough.ts and tools/smoke/capture-showcase.ts.

import { castRaySolidDistance3D, emptyInput3D, type InputState3D, type WorldState3D } from './world3d.ts';
import { navReached, navSteer, type NavTarget } from './nav3d.ts';
import type { WeaponSlot3D } from './types3d.ts';

interface BotStep extends NavTarget {
  label: string;
  /** Shoot a lock while standing here until `done` holds */
  fire?: { weapon: WeaponSlot3D; aimX: number; aimY: number };
  done?: (w: WorldState3D) => boolean;
  /** Special behaviour handlers */
  mode?: 'boss' | 'core';
}

export interface Bot3D {
  next(w: WorldState3D): InputState3D;
  readonly stepIndex: number;
  readonly stepLabel: string;
}

const door = (id: string) => (w: WorldState3D) => w.openDoors.has(id);
const has = (slot: WeaponSlot3D) => (w: WorldState3D) => w.player.unlocked[slot];
const upgrade = (id: string) => (w: WorldState3D) => w.collectedUpgrades.has(id);

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
    { label: 'green door', x: 31, y: -11, fire: { weapon: 2, aimX: 24, aimY: -9.4 }, done: door('door_shaft_mines') },
    { label: 'mines', x: 20, y: -11 },
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
    { label: 'up 4', x: 33, y: -8.8 },
    { label: 'up 3', x: 33, y: -6.6 },
    { label: 'up 2', x: 33, y: -4.4 },
    { label: 'up 1', x: 33, y: -2.2 },
    { label: 'grate back', x: 33, y: 0 },
    { label: 'yellow door', x: 36, y: 0, fire: { weapon: 3, aimX: 42, aimY: 1.9 }, done: door('door_shaft_biolabs') },
    { label: 'bio-labs', x: 46, y: 0 },
    { label: 'plat 1', x: 50, y: 2.2 },
    { label: 'tank bio', x: 55, y: 4.5, tolX: 0.9, tolY: 0.4, leap: true, done: upgrade('etank_biolabs') },
    { label: 'bio grate', x: 65, y: 4.4, leap: true },
    { label: 'security grate', x: 65, y: 8.8 },
    { label: 'console', x: 55.8, y: 8.8, tolX: 0.4, done: (s) => s.consoleUnlocked },
    { label: 'past console', x: 52, y: 8.8, leap: true },
    { label: 'save security', x: sv('save_security').x, y: 8.8, tolX: 1.0, done: (s) => s.lastSaveId === 'save_security' },
    { label: 'security grate back', x: 65, y: 8.8, leap: true },
    { label: 'bio grate back', x: 65, y: 4.4 },
    { label: 'rail', x: rl.x, y: rl.y, tolX: 0.9, tolY: 0.4, done: has(4) },
    { label: 'bio floor', x: 62, y: 0 },
    { label: 'red door', x: 61, y: 0, fire: { weapon: 4, aimX: 70, aimY: 2.0 }, done: door('door_boss') },
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
      prevJump = nav.jump;
      inp.moveX = nav.moveX;
      inp.jump = nav.jump;
      inp.dropDown = nav.dropDown;

      // Hop incoming shockwaves
      for (const sw of w.shockwaves) {
        const gap = Math.abs(b.x - sw.x) - sw.radius;
        if (b.grounded && gap > -0.8 && gap < 2.2) inp.jump = true;
      }
      // Dash long flat stretches during the meltdown run and to cross the Warden
      const flat = Math.abs(target.y - b.y) < 0.5 && Math.abs(target.x - b.x) > 9;
      if (b.dashCooldown === 0 && b.grounded && ((w.phase === 'escape' && flat) || (step.mode === 'boss' && bossSide === 1 && Math.abs(b.x - target.x) > 6))) {
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

      // Console / save interaction
      inp.interact = true;
      return inp;
    },
  };
}

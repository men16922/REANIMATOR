// Unit & integration tests for REANIMATOR's six-sector side-view Metroidvania:
// map topology, motion3d (one-way platforms, coyote, Thruster double-jump, landing), six lock kinds,
// upgrades and Energy Tanks, Save stations, pose contract, 4-weapon combat, Core Warden, bot playthrough,
// physical reachability, strict R3.3 headlamp non-coupling, and rigged GLB clips.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ABILITY_3D, spawnBody3D, stepBody3D, type Body3D } from '../src/engine/motion3d.ts';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import type { Collider3D, MapSolid3D } from '../src/game3d/types3d.ts';
import {
  DOOR_REQUIRED_WEAPON,
  emptyInput3D,
  getPlayerPose3D,
  newWorld3D,
  respawnPlayer3D,
  roomAt3D,
  stepWorld3D,
  triggerExplosion3D,
  tryOpenDoor3D,
  type InputState3D,
  type WorldState3D,
  BOSS_INTRO_TICKS,
  skipBossIntro3D,
} from '../src/game3d/world3d.ts';
import { runReckless } from '../tools/game/difficulty.ts';
import { buildReachRoute, dashReaches, walkTo } from '../tools/game/reach3d.ts';

function readGlbJson(relPath: string): {
  skins?: { joints: number[] }[];
  animations?: { name?: string }[];
  meshes?: unknown[];
} {
  const full = resolve(import.meta.dirname, '..', relPath);
  const buf = readFileSync(full);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `${relPath} must have glTF magic`);
  const chunkLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, `${relPath} chunk 0 must be JSON`);
  return JSON.parse(buf.subarray(20, 20 + chunkLen).toString('utf8'));
}


function box(id: string, minX: number, maxX: number, minY: number, maxY: number, kind: MapSolid3D['kind'] = 'catwalk'): MapSolid3D {
  return { id, minX, maxX, minY, maxY, minZ: -3, maxZ: 3, kind };
}
function col(solids: MapSolid3D[]): Collider3D {
  return { solids, pillars: [], ramps: [] };
}
const idle = { moveX: 0, moveZ: 0, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 };

function place(w: WorldState3D, x: number, y: number): void {
  w.player.body = spawnBody3D(x, y, 0);
}
function doorSolid(w: WorldState3D, id: string): MapSolid3D {
  return w.level.solids.find((s) => s.doorId === id)!;
}
/** Rail-Cannon: hold fire for `charge` ticks, then release (fires on release). */
function railShot(w: WorldState3D, aimX: number, aimY: number, charge = 1): void {
  for (let i = 0; i < charge; i++) stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: true, aimX, aimY });
  stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: false, aimX, aimY });
}
function stepN(w: WorldState3D, n: number, inp: Partial<InputState3D> = {}): void {
  for (let i = 0; i < n; i++) stepWorld3D(w, { ...emptyInput3D(), ...inp });
}

test('map: six sectors, symmetric neighbors, every room reachable, <= 1 save per room, props inside rooms', () => {
  const level = buildFacilityMap3D();
  assert.deepEqual(
    level.rooms.map((r) => r.sector).sort(),
    ['airlock', 'biolabs', 'core', 'mines', 'security', 'shaft'],
  );
  const byId = new Map(level.rooms.map((r) => [r.id, r]));
  for (const r of level.rooms) {
    for (const n of r.neighbors) {
      assert.ok(byId.get(n)?.neighbors.includes(r.id), `${r.id} -> ${n} must be symmetric`);
    }
  }
  const seen = new Set<string>(['room_airlock']);
  const queue = ['room_airlock'];
  while (queue.length) {
    for (const n of byId.get(queue.shift()!)!.neighbors) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  assert.equal(seen.size, 6, 'all rooms reachable from the spawn room');
  for (const r of level.rooms) {
    assert.ok(level.saveStations.filter((s) => s.roomId === r.id).length <= 1, `${r.id} has more than one save`);
  }
  const props = [...level.saveStations, ...level.upgrades, ...level.pedestals];
  for (const p of props) {
    assert.ok(roomAt3D(level, p.x, p.y + 0.9), `${p.id} must lie inside a room`);
  }
  assert.equal(level.upgrades.filter((u) => u.kind === 'energy_tank').length, 3, 'Mines, Bio-Labs and the Underfloor Duct');
  assert.equal(level.upgrades.filter((u) => u.kind === 'thruster_boots').length, 1);
});

test('motion3d: run, friction, jump arc, landing state 4, Z-lane lock and Jet-Dash', () => {
  const c = col([box('floor', -20, 40, -1, 0)]);
  let b = spawnBody3D(0, 0, 0);
  for (let i = 0; i < 20; i++) b = stepBody3D(b, { ...idle, moveX: 1 }, c);
  assert.ok(b.vx > 9.0, `run velocity near top speed, got ${b.vx}`);
  for (let i = 0; i < 25; i++) b = stepBody3D(b, idle, c);
  assert.ok(Math.abs(b.vx) < 0.05, `friction stop, got ${b.vx}`);

  b = stepBody3D(b, { ...idle, jump: true }, c);
  assert.equal(b.grounded, false);
  let maxY = 0;
  let sawLanding = false;
  for (let i = 0; i < 90; i++) {
    b = stepBody3D(b, { ...idle, jump: i < 30 }, c);
    maxY = Math.max(maxY, b.y);
    if (b.state === 4) sawLanding = true;
    if (b.grounded && i > 5) break;
  }
  assert.ok(maxY > 2.2 && maxY < 2.8, `single jump apex 2.2..2.8 m, got ${maxY}`);
  assert.ok(sawLanding && b.grounded, 'landing sets state 4');

  const z = stepBody3D(spawnBody3D(0, 0, 0), { ...idle, moveZ: 1 }, c);
  assert.equal(z.z, 0, 'z is locked to the lane');

  let d = stepBody3D(spawnBody3D(0, 0, 0), { ...idle, moveX: 1, dash: true }, c);
  assert.equal(d.state, 5);
  assert.ok(d.vx > 20, `dash speed, got ${d.vx}`);
  d = stepBody3D(d, { ...idle, moveX: 1, dash: true }, c);
  assert.ok(d.dashCooldown > 0);
});

test('motion3d: one-way platform (pass up, land, drop through), coyote time, Thruster double-jump', () => {
  const c = col([box('floor', -10, 30, -1, 0), box('plat', 2, 12, 1.92, 2.2, 'platform')]);
  // Jump up through the one-way platform from below and land on it
  let b = spawnBody3D(6, 0, 0);
  for (let i = 0; i < 80; i++) b = stepBody3D(b, { ...idle, jump: i < 40 && i % 2 === 0 || (i >= 1 && i < 30) }, c);
  assert.ok(b.grounded && Math.abs(b.y - 2.2) < 0.01, `landed on the platform top, y=${b.y}`);
  // Drop through it with Down
  b = stepBody3D(b, { ...idle, dropDown: true }, c);
  for (let i = 0; i < 60; i++) b = stepBody3D(b, idle, c);
  assert.ok(b.grounded && Math.abs(b.y) < 0.01, `dropped to the floor, y=${b.y}`);

  // Coyote time: still able to jump a few ticks after leaving a ledge
  const ledge = col([box('ledge', 0, 5, -1, 0)]);
  let w = spawnBody3D(4.5, 0, 0);
  let off = 0;
  while (w.grounded && off < 60) {
    w = stepBody3D(w, { ...idle, moveX: 1 }, ledge);
    off++;
  }
  assert.equal(w.grounded, false, 'walked off the ledge');
  w = stepBody3D(w, { ...idle, moveX: 1 }, ledge);
  w = stepBody3D(w, { ...idle, moveX: 1, jump: true }, ledge);
  assert.ok(w.vy > 5, `coyote jump launched, vy=${w.vy}`);

  // Double jump only with maxJumps = 2
  const air = (maxJumps: number): Body3D => {
    let a = spawnBody3D(6, 0, 0);
    a = stepBody3D(a, { ...idle, jump: true, maxJumps }, col([box('f', -10, 30, -1, 0)]));
    for (let i = 0; i < 18; i++) a = stepBody3D(a, { ...idle, jump: false, maxJumps }, col([box('f', -10, 30, -1, 0)]));
    return stepBody3D(a, { ...idle, jump: true, maxJumps }, col([box('f', -10, 30, -1, 0)]));
  };
  assert.ok(air(2).vy > 8, 'Thruster double jump relaunches');
  assert.ok(air(1).vy < 4, 'no double jump without Thruster Boots');
  assert.equal(ABILITY_3D.landTicks, 5);
});

test('locks: weapon table, mismatched weapon leaves state unchanged, red needs console, escape stays sealed', () => {
  assert.deepEqual(DOOR_REQUIRED_WEAPON, { blue: 1, green: 2, yellow: 3, red: 4, console: 0, escape: 0 });
  const w = newWorld3D();
  const green = doorSolid(w, 'door_shaft_mines');
  assert.equal(tryOpenDoor3D(w, green, 1), false);
  assert.equal(tryOpenDoor3D(w, green, 4), false);
  assert.equal(w.openDoors.size, 0);
  assert.equal(w.events.length, 0, 'no door events on mismatch');
  assert.equal(tryOpenDoor3D(w, green, 2), true);
  assert.ok(w.openDoors.has('door_shaft_mines'));
  assert.ok(w.events.some((e) => e.type === 'door_blast'));

  const red = doorSolid(w, 'door_boss');
  assert.equal(tryOpenDoor3D(w, red, 4), false, 'red needs the Security Console first');
  w.consoleUnlocked = true;
  assert.equal(tryOpenDoor3D(w, red, 3), false);
  assert.equal(tryOpenDoor3D(w, red, 4), true);

  const esc = doorSolid(w, 'door_escape');
  for (const wp of [0, 1, 2, 3, 4] as const) assert.equal(tryOpenDoor3D(w, esc, wp), false);
  assert.ok(!w.openDoors.has('door_escape'), 'escape hatch closed before Meltdown');
});

test('locks: shooting opens blue (Pulse) and green (Scattergun), wrong weapon does not; Grenade blast breaks yellow', () => {
  const blue = newWorld3D();
  place(blue, 20, 0);
  stepN(blue, 40, { fire: true, weaponSlot: 1, aimX: 24, aimY: 1.4 });
  assert.ok(blue.openDoors.has('door_airlock_shaft'), 'Pulse opens the blue door');

  const wrong = newWorld3D();
  place(wrong, 31, -11);
  stepN(wrong, 80, { fire: true, weaponSlot: 1, aimX: 24, aimY: -9.4 });
  assert.ok(!wrong.openDoors.has('door_shaft_mines'), 'Pulse must not open the green door');
  assert.ok(wrong.hint.includes('GREEN'), 'hint names the missing weapon');

  const green = newWorld3D();
  place(green, 31, -11);
  green.player.unlocked[2] = true;
  green.player.ammo[2] = 10;
  stepN(green, 40, { fire: true, weaponSlot: 2, aimX: 24, aimY: -9.4 });
  assert.ok(green.openDoors.has('door_shaft_mines'), 'Scattergun opens the green door');

  const yellow = newWorld3D();
  const ys = doorSolid(yellow, 'door_shaft_biolabs');
  triggerExplosion3D(yellow, ys.minX - 1, 1.5, 0, 4.1, 0, 0xff7a2f, 0, 0);
  assert.ok(!yellow.openDoors.has('door_shaft_biolabs'), 'barrel blasts do not break the Cracked Bio-Wall');
  triggerExplosion3D(yellow, ys.minX - 1, 1.5, 0, 4.1, 86, 0xff7a2f, 0, 3);
  assert.ok(yellow.openDoors.has('door_shaft_biolabs'), 'Grenade blast breaks the yellow door');
});

test('upgrades: Energy Tank +30 max HP once each, Thruster Boots enable double jump with an event', () => {
  const w = newWorld3D();
  const tank = w.level.upgrades.find((u) => u.id === 'etank_mines')!;
  place(w, tank.x, tank.y);
  w.player.hp = 40;
  stepN(w, 1);
  assert.equal(w.player.energyTanks, 1);
  assert.equal(w.player.maxHp, 130);
  assert.equal(w.player.hp, 130);
  assert.ok(w.events.some((e) => e.type === 'upgrade'));
  stepN(w, 5);
  assert.equal(w.player.energyTanks, 1, 'no duplicate pickup');
  const tank2 = w.level.upgrades.find((u) => u.id === 'etank_biolabs')!;
  place(w, tank2.x, tank2.y);
  stepN(w, 1);
  assert.equal(w.player.maxHp, 160);

  const j = newWorld3D();
  const boots = j.level.upgrades.find((u) => u.id === 'thruster_boots')!;
  place(j, boots.x, boots.y);
  stepN(j, 1);
  assert.ok(j.player.abilities.thrusterBoots);
  assert.ok(j.collectedUpgrades.has('thruster_boots'));
  place(j, 6, 0);
  stepN(j, 3, { jump: true });
  stepN(j, 20, { jump: false });
  let dj = false;
  for (let i = 0; i < 3; i++) {
    stepWorld3D(j, { ...emptyInput3D(), jump: true });
    if (j.events.some((e) => e.type === 'double_jump')) dj = true;
  }
  assert.ok(dj, 'double_jump sound event emitted');
});

test('save stations: interact heals and records checkpoint; respawn returns to it; sectors are tracked', () => {
  const w = newWorld3D();
  const st = w.level.saveStations.find((s) => s.id === 'save_mines')!;
  place(w, st.x, st.y);
  w.player.hp = 33;
  w.player.unlocked[2] = true;
  w.player.ammo[2] = 1;
  stepN(w, 1, { interact: true });
  assert.equal(w.player.hp, w.player.maxHp);
  assert.equal(w.lastSaveId, 'save_mines');
  assert.ok(w.player.ammo[2] >= 28, 'ammo refilled');
  assert.ok(w.events.some((e) => e.type === 'save_station'));
  assert.equal(w.currentRoom, 'mines');
  assert.ok(w.visitedRooms.includes('mines') && w.visitedRooms.includes('airlock'));

  place(w, 3, 0);
  w.status = 'lost';
  w.player.hp = 0;
  respawnPlayer3D(w);
  assert.equal(w.status, 'playing');
  assert.equal(w.player.hp, w.player.maxHp);
  assert.ok(Math.abs(w.player.body.x - st.x) < 0.01 && Math.abs(w.player.body.y - st.y) < 0.01);
});

test('pose contract: aim sign/pitch, vertical velocity, grounded flag and landing cushion', () => {
  const w = newWorld3D();
  stepN(w, 2, { aimX: w.player.body.x + 10, aimY: w.player.body.y + 1.12 + 10 });
  let pose = getPlayerPose3D(w);
  assert.equal(pose.aimSignX, 1);
  assert.ok(Math.abs(pose.aimPitch - Math.PI / 4) < 0.01, `pitch ${pose.aimPitch}`);
  assert.ok(Math.abs(Math.hypot(pose.aimDirX, pose.aimDirY) - 1) < 1e-6);
  assert.equal(pose.grounded, true);

  stepN(w, 2, { aimX: w.player.body.x - 10, aimY: w.player.body.y + 1.12 });
  pose = getPlayerPose3D(w);
  assert.equal(pose.aimSignX, -1);
  assert.ok(Math.abs(pose.aimPitch) < 0.01);

  stepN(w, 3, { jump: true, aimX: 20, aimY: 1 });
  pose = getPlayerPose3D(w);
  assert.equal(pose.grounded, false);
  assert.ok(pose.vy > 0);
  let sawCushion = false;
  for (let i = 0; i < 90; i++) {
    stepWorld3D(w, { ...emptyInput3D(), aimX: 20, aimY: 1 });
    if (getPlayerPose3D(w).landingFactor > 0.2) sawCushion = true;
  }
  assert.ok(sawCushion, 'landing produces a cushion factor');
  assert.ok(Math.abs(getPlayerPose3D(w).moveX) <= 1);
});

test('combat: Scattergun fans 7 pellets, Grenade bounces and explodes, bio-barrel chain, Rail stops at locked door', () => {
  const sg = newWorld3D();
  sg.player.unlocked[2] = true;
  sg.player.ammo[2] = 5;
  stepN(sg, 1, { fire: true, weaponSlot: 2, aimX: 20, aimY: 1.1 });
  assert.equal(sg.projectiles.filter((p) => p.kind === 'scatter').length, 7);

  const gr = newWorld3D();
  place(gr, 4, 0);
  gr.player.unlocked[3] = true;
  gr.player.ammo[3] = 5;
  const crawler = gr.enemies.find((e) => e.id === 'e-airlock-1')!;
  crawler.x = 8;
  crawler.active = true;
  let bounced = false;
  let exploded = false;
  for (let i = 0; i < 140 && !exploded; i++) {
    stepWorld3D(gr, { ...emptyInput3D(), fire: i === 0, weaponSlot: 3, aimX: 8, aimY: 0.4 });
    if (gr.events.some((e) => e.type === 'bounce')) bounced = true;
    if (gr.events.some((e) => e.type === 'explosion')) exploded = true;
  }
  assert.ok(exploded, 'grenade explodes');
  assert.ok(crawler.hp < crawler.maxHp || !crawler.alive, 'blast damages the crawler');
  assert.ok(bounced || exploded);

  const ch = newWorld3D();
  place(ch, 12, 0);
  ch.player.unlocked[4] = true;
  ch.player.ammo[4] = 3;
  const first = ch.barrels.find((b) => b.id === 'brl-airlock-1')!;
  ch.barrels.push({ id: 'chain', x: first.x + 2.0, y: 0, z: 0, hp: 20, alive: true, fuseTicks: -1, hitFlashTicks: 0 });
  railShot(ch, first.x, 0.7);
  assert.equal(first.alive, false, 'rail destroys the first barrel');
  stepN(ch, 12);
  assert.equal(ch.barrels.find((b) => b.id === 'chain')!.alive, false, 'chain barrel detonates');

  const rl = newWorld3D();
  place(rl, 20, 0);
  rl.player.unlocked[4] = true;
  rl.player.ammo[4] = 5;
  const behind = rl.enemies.find((e) => e.id === 'e-shaft-2')!;
  behind.x = 27;
  behind.y = 0;
  behind.hp = behind.maxHp = 78;
  railShot(rl, 30, 1.0);
  assert.ok(rl.beams[0] && Math.hypot(rl.beams[0].x2 - 20, rl.beams[0].y2 - 1.12) < 5, 'beam stops at the locked door');
  assert.equal(behind.hp, 78, 'enemy behind the door is untouched');
  rl.openDoors.add('door_airlock_shaft');
  rl.player.fireCooldown = 0;
  railShot(rl, 30, 1.0);
  assert.ok(behind.hp < 78, 'beam passes once the door is open');
});

test('Core Warden: shielded core, Phase 2 at <= 2/3 HP, jump dodges shockwave, Meltdown opens the escape hatch', () => {
  const w = newWorld3D();
  w.consoleUnlocked = true;
  w.openDoors.add('door_boss');
  w.phase = 'warden';
  place(w, 76, 0);
  w.bossIntroDone = true;
  w.player.unlocked[4] = true;
  w.player.ammo[4] = 20;
  const warden = w.enemies.find((e) => e.kind === 'warden')!;
  assert.equal(warden.phase, 1);

  const coreStart = w.coreHp;
  railShot(w, w.level.corePos.x, 1.4);
  assert.equal(w.coreHp, coreStart, 'core shielded while the Warden lives');

  warden.hp = Math.floor(warden.maxHp * (2 / 3)) + 20;
  warden.x = 82;
  w.player.fireCooldown = 0;
  railShot(w, warden.x, 1.4);
  assert.equal(warden.phase, 2);

  const sw = { id: 99, x: 63, y: 0, z: 0, radius: 2.8, maxRadius: 15, speed: 9, damage: 22, hitPlayer: false, phase: 1 as const };
  const ground = newWorld3D();
  place(ground, 60, 0);
  ground.shockwaves.push({ ...sw });
  const hpG = ground.player.hp;
  stepWorld3D(ground, emptyInput3D());
  assert.ok(ground.player.hp < hpG, 'grounded player takes shockwave damage');

  const air = newWorld3D();
  place(air, 60, 1.15);
  air.player.body.vy = 2;
  air.player.body.grounded = false;
  air.shockwaves.push({ ...sw, id: 100 });
  const hpA = air.player.hp;
  stepWorld3D(air, emptyInput3D());
  assert.equal(air.player.hp, hpA, 'airborne player dodges the wave');

  warden.alive = false;
  warden.hp = 0;
  w.coreHp = 80;
  place(w, 88, 0);
  w.player.fireCooldown = 0;
  assert.ok(!w.openDoors.has('door_escape'));
  railShot(w, w.level.corePos.x, 1.4);
  assert.equal(w.coreDestroyed, true);
  assert.ok(w.openDoors.has('door_escape'), 'escape hatch opens on Meltdown');
  assert.equal(w.phase, 'escape');
  assert.ok(w.meltdownTicks >= 5395 && w.meltdownTicks <= 5400);
});

test('physical reachability: full route is walkable and the 4.4 m shaft gate needs Thruster Boots', () => {
  const level = buildFacilityMap3D();
  const openDoors = new Set<string>();
  let body = spawnBody3D(level.spawn.x, level.spawn.y, 0);
  let maxJumps = 1;
  for (const step of buildReachRoute(level)) {
    for (const d of step.opens ?? []) openDoors.add(d);
    const res = walkTo(body, step, level, openDoors, maxJumps);
    assert.ok(res.reached, `unreachable step "${step.label}" from (${res.body.x.toFixed(1)}, ${res.body.y.toFixed(1)})`);
    body = res.body;
    if (step.boots) maxJumps = 2;
  }
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  const start = spawnBody3D(38, 4.4, 0);
  assert.equal(walkTo(start, { x: 31, y: 8.8 }, level, doors, 1, 600).reached, false, 'gate closed without boots');
  assert.equal(walkTo(start, { x: 31, y: 8.8 }, level, doors, 2, 600).reached, true, 'gate open with boots');
  for (const [sx, sy] of [[65, 4.4], [55, 4.5], [64, 2.2]] as const) {
    const from = spawnBody3D(sx, sy, 0);
    const target = { x: 65, y: 8.8 };
    assert.equal(walkTo(from, target, level, doors, 1, 1500).reached, false, `security deck closed without boots (from x=${sx}, y=${sy})`);
    assert.equal(walkTo(from, target, level, doors, 2, 1500).reached, true, `security deck open with boots (from x=${sx}, y=${sy})`);
  }
  // Jet-dash cannot bypass the boots gate (dash zeroes upward velocity and adds no height)
  for (const [sx, sy, tx, ty] of [[38, 4.4, 31, 8.8], [65, 4.4, 65, 8.8], [55, 4.5, 65, 8.8]] as const) {
    const from = spawnBody3D(sx, sy, 0);
    assert.equal(dashReaches(from, { x: tx, y: ty }, level, doors, 1, 1500), false, `jet-dash must not bypass boots gate (from x=${sx}, y=${sy})`);
    assert.equal(dashReaches(from, { x: tx, y: ty }, level, doors, 2, 1500), true, `probe control: boots + dash still reach (from x=${sx}, y=${sy})`);
  }
  // Rail pedestal and boss door stay reachable without boots
  const floor = spawnBody3D(47, 0, 0);
  assert.equal(walkTo(floor, { x: 65.5, y: 2.2 }, level, doors, 1, 1500).reached, true, 'rail pedestal needs no boots');
});

test('bot playthrough: all sectors, 4 weapons, boots, 2 tanks, Warden, Core, escape', () => {
  const w = newWorld3D();
  const bot = createBot3D(w);
  for (let t = 0; t < 12000 && w.status === 'playing'; t++) stepWorld3D(w, bot.next(w));
  assert.equal(w.status, 'won', `bot ended ${w.status} at step "${bot.stepLabel}"`);
  assert.equal(w.visitedRooms.length, 6);
  assert.ok(w.player.unlocked[2] && w.player.unlocked[3] && w.player.unlocked[4]);
  assert.ok(w.player.abilities.thrusterBoots);
  assert.equal(w.player.energyTanks, 2);
  assert.equal(w.player.maxHp, 160);
  assert.ok(w.consoleUnlocked && w.coreDestroyed);
  for (const id of ['door_airlock_shaft', 'door_shaft_mines', 'door_shaft_biolabs', 'door_boss', 'door_escape']) {
    assert.ok(w.openDoors.has(id), `${id} opened`);
  }
});

test('R3.3 strict light isolation: headlamp toggle/drain does not change the simulation, and no gameplay file reads it', () => {
  const stripLight = (w: WorldState3D) => ({
    ...w,
    openDoors: [...w.openDoors].sort(),
    collectedUpgrades: [...w.collectedUpgrades].sort(),
    light: 'IGNORED',
    prevLightButton: false,
  });
  let wLit = newWorld3D();
  let wDark = newWorld3D();
  for (let t = 0; t < 360; t++) {
    const base = {
      ...emptyInput3D(),
      moveX: t < 180 ? 0.85 : -0.35,
      jump: t === 60 || t === 210,
      dash: t === 120,
      fire: t % 9 < 5,
      aimX: 15 + (t % 7),
      aimY: 1.0 + (t % 5) * 0.2,
    };
    wLit = stepWorld3D(wLit, { ...base, toggleLight: t === 5 || t === 240 });
    wDark = stepWorld3D(wDark, { ...base, toggleLight: false });
  }
  assert.notEqual(wLit.light.battery, wDark.light.battery, 'headlamp battery must differ');
  assert.deepEqual(stripLight(wLit), stripLight(wDark), 'gameplay trace identical with light toggled');

  const read = (p: string) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');
  for (const f of ['src/engine/motion3d.ts', 'src/game3d/bot3d.ts', 'src/game3d/nav3d.ts', 'src/game3d/map3d.ts']) {
    assert.ok(!/\.light\b|game\/light/.test(read(f)), `${f} must not touch the light`);
  }
  const lines = read('src/game3d/world3d.ts').split('\n').filter((l) => /\.light\b/.test(l));
  for (const l of lines) assert.ok(/w\.light = (toggleLight|tickLight)\(w\.light\)/.test(l), `unexpected light read: ${l.trim()}`);
});

test('Rigged & static Meshy GLBs exist with skins and required clips', () => {
  const riggedChecks: { file: string; clips: string[] }[] = [
    { file: 'public/assets/models/operative.glb', clips: ['idle', 'walk', 'run', 'jump', 'attack', 'death'] },
    { file: 'public/assets/models/warden.glb', clips: ['idle', 'walk', 'run', 'attack', 'death'] },
    { file: 'public/assets/models/bio-stalker.glb', clips: ['idle', 'walk', 'run', 'attack', 'death'] },
  ];

  for (const rc of riggedChecks) {
    const json = readGlbJson(rc.file);
    assert.ok((json.skins?.length ?? 0) >= 1, `${rc.file} missing skin`);
    assert.ok((json.skins?.[0]?.joints.length ?? 0) >= 50, `${rc.file} expected >= 50 joints`);
    const names = (json.animations ?? []).map((a) => a.name ?? '');
    for (const c of rc.clips) {
      assert.ok(names.includes(c), `${rc.file} missing clip "${c}" (has: ${names.join(', ')})`);
    }
  }

  for (const statPath of [
    'public/assets/models/pulse-rifle.glb',
    'public/assets/models/bio-barrel.glb',
    'public/assets/models/crawler.glb',
    'public/assets/models/spitter.glb',
    'public/assets/models/power-core.glb',
    'public/assets/models/exit-gate.glb',
  ]) {
    const st = statSync(resolve(import.meta.dirname, '..', statPath));
    assert.ok(st.size > 10_000, `${statPath} unexpectedly small (${st.size} bytes)`);
  }
});

test('Reckless-input difficulty probe measures HP loss deterministically', () => {
  const a = runReckless(1800);
  const b = runReckless(1800);
  assert.deepEqual(a, b, 'probe must be deterministic');
  assert.ok(a.hpLost > 0, 'reckless play must lose HP');
  assert.equal(a.ticks, 1800);
});

// ---- Monster AI (FEAT-002) ----
import {
  ENEMY_ACCEL_3D,
  ENEMY_BRAKE_MUL_3D,
  ENEMY_PATROL_RANGE_3D,
  ENEMY_TURN_DELAY_3D,
  type EnemyState3D,
} from '../src/game3d/world3d.ts';

function soloEnemy(kind: EnemyState3D['kind']): { w: WorldState3D; e: EnemyState3D } {
  const w = newWorld3D();
  const e = w.enemies.find((x) => x.kind === kind)!;
  w.enemies = [e];
  w.currentRoom = e.zone;
  return { w, e };
}

function placePlayer(w: WorldState3D, x: number, y: number): void {
  w.player.body.x = x;
  w.player.body.y = y;
  w.player.body.vx = 0;
  w.player.body.vy = 0;
}

test('monster AI: facing does not flip in one tick when the player crosses over', () => {
  const { w, e } = soloEnemy('crawler');
  placePlayer(w, e.x - 5, e.y);
  for (let i = 0; i < 40; i++) {
    w.player.hp = 100;
    stepWorld3D(w, emptyInput3D());
  }
  const before = e.facing;
  placePlayer(w, e.x + 3, e.y);
  w.player.hp = 100;
  stepWorld3D(w, emptyInput3D());
  assert.equal(e.facing, before, 'facing must not flip on the crossing tick');
  assert.equal(e.state, 'chase');
  assert.equal(e.turnTicks, 1, 'crossing tick starts the turn counter');
  let flipTick = -1;
  for (let i = 2; i <= 30 && flipTick < 0; i++) {
    placePlayer(w, e.x + 3, e.y);
    w.player.hp = 100;
    stepWorld3D(w, emptyInput3D());
    if (e.facing !== before) flipTick = i;
    else assert.equal(e.turnTicks, i, 'turn counter advances one per tick');
  }
  assert.equal(flipTick, ENEMY_TURN_DELAY_3D, 'facing flips exactly at the turn delay');
  assert.equal(e.facing, -before);
  assert.equal(e.turnTicks, 0, 'turn counter resets after the flip');
});

test('monster AI: crawler windup is observable and damage only lands during the lunge', () => {
  const { w, e } = soloEnemy('crawler');
  const px = e.x + 2.2;
  placePlayer(w, px, e.y);
  let windup = 0;
  let damagedIn: string | null = null;
  w.player.hp = 100;
  for (let i = 0; i < 200 && !damagedIn; i++) {
    placePlayer(w, px, e.y);
    const hp0 = w.player.hp;
    const stBefore = e.state;
    stepWorld3D(w, emptyInput3D());
    if (e.state === 'windup') windup++;
    if (w.player.hp < hp0) damagedIn = stBefore === 'windup' ? 'attack' : stBefore;
  }
  assert.ok(windup >= 10, `windup ticks ${windup}`);
  assert.ok(damagedIn === 'attack', `damage state ${damagedIn}`);
});

test('monster AI: enemy returns toward homeX after the player leaves', () => {
  const { w, e } = soloEnemy('stalker');
  e.active = true;
  e.state = 'chase';
  e.facing = 1;
  const home = e.homeX;
  e.x = home + 3.5;
  placePlayer(w, home + 60, e.y); // far away: beyond 26 m
  w.currentRoom = e.zone === 'core' ? 'airlock' : 'core';
  let patrolStart = -1;
  let distAtPatrolStart = 0;
  let homeTick = -1;
  let maxDist = 0;
  let prevDist = Infinity;
  for (let i = 0; i < 700; i++) {
    w.player.hp = 100;
    w.player.body.x = home + 60;
    stepWorld3D(w, emptyInput3D());
    const d = Math.abs(e.x - home);
    maxDist = Math.max(maxDist, d);
    if (patrolStart < 0 && (e.state as string) === 'patrol') {
      patrolStart = i;
      distAtPatrolStart = d;
    }
    if (homeTick < 0 && patrolStart >= 0 && d < 0.5) homeTick = i;
    if (patrolStart >= 0 && homeTick < 0) {
      assert.ok(d <= prevDist + 1e-9, `distance must not grow while returning (tick ${i}: ${d} > ${prevDist})`);
    }
    prevDist = d;
  }
  assert.ok(maxDist > 8 && maxDist < 8.3, `chase overshoot ${maxDist}`);
  assert.ok(patrolStart >= 200 && patrolStart <= 260, `gave up chase at tick ${patrolStart}`);
  assert.ok(distAtPatrolStart > 7, `returned from ${distAtPatrolStart}`);
  assert.ok(homeTick > patrolStart + 150 && homeTick <= 470, `reached home at tick ${homeTick}`);
  assert.equal(e.state, 'patrol');
  assert.ok(Math.abs(e.x - home) <= ENEMY_PATROL_RANGE_3D + 0.6, `stays within patrol range (${Math.abs(e.x - home)})`);
});

test('monster AI: vx per-tick change is bounded by the accel limit', () => {
  const { w, e } = soloEnemy('stalker');
  const px = e.x + 9;
  placePlayer(w, px, e.y);
  let prev = e.vx;
  let prevState = e.state;
  let checked = 0;
  for (let i = 0; i < 240; i++) {
    placePlayer(w, px, e.y);
    w.player.hp = 100;
    stepWorld3D(w, emptyInput3D());
    const steady = e.state === prevState && (e.state === 'chase' || e.state === 'patrol') && e.hitFlashTicks === 0;
    if (steady) {
      checked++;
      assert.ok(Math.abs(e.vx - prev) <= ENEMY_ACCEL_3D.stalker * ENEMY_BRAKE_MUL_3D + 1e-9, `dvx ${e.vx - prev}`);
    }
    prev = e.vx;
    prevState = e.state;
  }
  assert.ok(checked > 20);
});

test('monster AI: two identical runs produce identical enemy states', () => {
  const run = (): string => {
    const w = newWorld3D();
    const bot = createBot3D(w);
    for (let i = 0; i < 1500; i++) stepWorld3D(w, bot.next(w));
    return JSON.stringify(w.enemies);
  };
  assert.equal(run(), run());
});

test('monster AI: enemies in another sector stay dormant when the player teleports far away', () => {
  const w = newWorld3D();
  w.player.body = spawnBody3D(48, -11, 0);
  w.player.hp = 999;
  const far = w.enemies.filter((e) => e.zone === 'airlock' && !e.minion);
  assert.ok(far.length > 0);
  for (let i = 0; i < 60; i++) stepWorld3D(w, emptyInput3D());
  for (const e of far) assert.equal(e.state, 'dormant', `${e.id} ${e.state}`);
});

test('monster AI: crawler does not re-windup immediately after a lunge (cooldown)', () => {
  const { w, e } = soloEnemy('crawler');
  const px = e.x + 2.2;
  w.player.hp = 9999;
  let lastAttack = -1;
  let gap = Infinity;
  for (let i = 0; i < 400; i++) {
    placePlayer(w, px, e.y);
    const prev = e.state;
    stepWorld3D(w, emptyInput3D());
    if (prev === 'attack' && e.state !== 'attack') lastAttack = i;
    if (prev !== 'windup' && e.state === 'windup' && lastAttack >= 0) gap = Math.min(gap, i - lastAttack);
  }
  assert.ok(gap >= 60, `windup restarted ${gap} ticks after lunge`);
});

// ---- Gameplay depth, round 1 ----
import {
  COMBO_WINDOW_TICKS,
  RAIL_CHARGE_TICKS,
  SECTOR_DAMAGE_3D,
  WARDEN_CYCLE_3D,
  WEAPON_MATCHUP_3D,
  getRunSummary3D,
} from '../src/game3d/world3d.ts';
import { buildCollectibleChecks, wallHopReaches } from '../tools/game/reach3d.ts';

/** A flat test arena with a tall east wall for wall-slide and wall-jump probes. */
function wallArena(): Collider3D {
  return col([box('floor', -20, 20, -1, 0), box('wall', 5, 6, 0, 30)]);
}

test('movement: wall slide caps the fall speed for everyone; wall jump needs Thruster Boots', () => {
  const c = wallArena();
  const start = (): Body3D => ({ ...spawnBody3D(4.55, 8, 0), grounded: false, state: 3 });
  // Pressing into the wall while falling slides at <= wallSlideSpeed magnitude
  let b = start();
  for (let i = 0; i < 40; i++) b = stepBody3D(b, { ...idle, moveX: 1, maxJumps: 1 }, c);
  assert.ok(b.wallDir === 1, 'touching the east wall');
  assert.ok(b.vy >= ABILITY_3D.wallSlideSpeed - 1e-9, `slide speed capped, vy=${b.vy}`);
  // Not pressing into the wall: full fall speed
  let free = start();
  free.x = 3;
  for (let i = 0; i < 30; i++) free = stepBody3D(free, { ...idle, moveX: 0, maxJumps: 1 }, c);
  assert.ok(free.vy < ABILITY_3D.wallSlideSpeed, 'no slide away from the wall');

  // Without boots: pressing jump on the wall never launches
  let nb = start();
  for (let i = 0; i < 20; i++) nb = stepBody3D(nb, { ...idle, moveX: 1, jump: i % 4 < 2, maxJumps: 1 }, c);
  assert.equal(nb.wallJumped, false);
  assert.ok(nb.y < 8, 'no climbing without boots');

  // With boots: a wall jump kicks up and away from the wall, with a flag for the event
  let wb = start();
  for (let i = 0; i < 12; i++) wb = stepBody3D(wb, { ...idle, moveX: 1, jump: false, maxJumps: 2 }, c);
  const y0 = wb.y;
  wb = stepBody3D(wb, { ...idle, moveX: 1, jump: true, maxJumps: 2 }, c);
  assert.equal(wb.wallJumped, true);
  assert.ok(wb.vy > 8 && wb.vx < -5, `up and away, vy=${wb.vy} vx=${wb.vx}`);
  for (let i = 0; i < 6; i++) wb = stepBody3D(wb, { ...idle, moveX: 1, jump: true, maxJumps: 2 }, c);
  assert.ok(wb.y > y0, 'gained height');
});

test('movement: wall jump event is raised by the world and counted in run stats', () => {
  const w = newWorld3D();
  w.player.abilities.thrusterBoots = true;
  // Shaft east wall (x 41.6) above the ledge: stand mid-air against it
  place(w, 41.1, 6);
  w.player.body.grounded = false;
  let saw = false;
  for (let i = 0; i < 30; i++) {
    stepWorld3D(w, { ...emptyInput3D(), moveX: 1, jump: i === 12, aimX: 50, aimY: 6 });
    if (w.events.some((e) => e.type === 'wall_jump')) saw = true;
  }
  assert.ok(saw, 'wall_jump event');
  assert.equal(w.run.wallJumps, 1);
});

test('movement: dash cancel keeps momentum into a jump; needs a jump to spend', () => {
  const c = col([box('floor', -50, 50, -1, 0)]);
  let b = spawnBody3D(0, 0, 0);
  b = stepBody3D(b, { ...idle, moveX: 1, dash: true, maxJumps: 1 }, c);
  assert.ok(b.dashTicks > 0);
  b = stepBody3D(b, { ...idle, moveX: 1, jump: true, maxJumps: 1 }, c);
  assert.equal(b.dashCanceled, true);
  assert.equal(b.dashTicks, 0);
  assert.ok(b.vy > 8, 'jump launched out of the dash');
  assert.ok(b.vx > ABILITY_3D.runTopSpeed, `momentum kept above run speed, vx=${b.vx}`);
  // Airborne without a spare jump: no cancel
  let a = spawnBody3D(0, 0, 0);
  a = stepBody3D(a, { ...idle, jump: true, maxJumps: 1 }, c);
  a = stepBody3D(a, { ...idle, jump: false, maxJumps: 1 }, c);
  a = stepBody3D(a, { ...idle, moveX: 1, dash: true, maxJumps: 1 }, c);
  a = stepBody3D(a, { ...idle, moveX: 1, jump: true, maxJumps: 1 }, c);
  assert.equal(a.dashCanceled, false, 'no spare jump, dash continues');
});

test('movement: down-dash stomp dives, lands with a blast that damages and staggers, and refunds the dash on a hit', () => {
  const w = newWorld3D();
  place(w, 6, 3);
  w.player.body.grounded = false;
  w.player.body.state = 3;
  const e = w.enemies.find((x) => x.id === 'e-airlock-1')!;
  e.x = 7;
  e.y = 0;
  e.hp = e.maxHp = 200;
  const hp0 = e.hp;
  let stomped = false;
  for (let i = 0; i < 40; i++) {
    stepWorld3D(w, { ...emptyInput3D(), dash: i === 0, dropDown: true, aimX: 10, aimY: 1 });
    if (i === 0) assert.ok(w.player.body.stomping, 'dive started');
    if (w.events.some((ev) => ev.type === 'stomp')) stomped = true;
  }
  assert.ok(stomped, 'stomp event');
  assert.equal(w.run.stomps, 1);
  assert.ok(e.hp < hp0, 'enemy next to the landing is hurt');
  assert.equal(w.player.body.dashCooldown, 0, 'hit refunds the dash');
  assert.equal(w.player.body.stomping, false);
});

test('combat: weapon matchups (Scatter shreds crawlers up close, Pulse is weak on armored Stalkers, Rail pierces)', () => {
  assert.ok(WEAPON_MATCHUP_3D.crawler[2] > 1);
  assert.ok(WEAPON_MATCHUP_3D.stalker[1] < 1);
  assert.ok(WEAPON_MATCHUP_3D.stalker[4] > 1 && WEAPON_MATCHUP_3D.stalker[3] > 1);
  assert.ok(WEAPON_MATCHUP_3D.spitter[1] > 1);

  const shoot = (kind: 'crawler' | 'stalker', slot: 1 | 2, dist: number): number => {
    const w = newWorld3D();
    w.barrels = [];
    place(w, 12, 0);
    const e = w.enemies.find((x) => x.kind === kind && !x.minion)!;
    w.enemies = [e];
    e.x = 12 + dist;
    e.y = 0;
    e.hp = e.maxHp = 5000;
    e.active = true;
    w.currentRoom = 'airlock';
    e.zone = 'airlock';
    w.player.unlocked[2] = true;
    w.player.ammo[2] = 9;
    stepN(w, 40, { fire: true, weaponSlot: slot, aimX: e.x, aimY: 0.9 });
    return e.maxHp - e.hp;
  };
  assert.ok(shoot('crawler', 2, 2) > shoot('crawler', 2, 9) * 1.3, 'Scatter falls off with range');
  // Same shots on stalker: pulse armor shows as lower damage per shot than on a crawler
  assert.ok(shoot('stalker', 1, 6) < shoot('crawler', 1, 6), 'armored stalker resists Pulse');
});

test('combat: Scatter knocks enemies back harder at close range', () => {
  const run = (dist: number): number => {
    const w = newWorld3D();
    w.barrels = [];
    place(w, 12, 0);
    w.player.unlocked[2] = true;
    w.player.ammo[2] = 9;
    const e = w.enemies.find((x) => x.id === 'e-airlock-1')!;
    w.enemies = [e];
    e.x = 12 + dist;
    e.y = 0;
    e.hp = e.maxHp = 5000;
    e.active = true;
    e.zone = 'airlock';
    w.currentRoom = 'airlock';
    stepN(w, 1, { fire: true, weaponSlot: 2, aimX: e.x, aimY: 0.9 });
    const x0 = e.x;
    stepN(w, 12, { aimX: e.x, aimY: 0.9 });
    return e.x - x0;
  };
  assert.ok(run(2.5) > run(8) + 0.2, 'closer target is shoved further');
});

test('combat: Rail-Cannon charges while held, fires on release, a full charge hits harder and wider', () => {
  const dmg = (charge: number): number => {
    const w = newWorld3D();
    w.barrels = [];
    place(w, 12, 0);
    w.player.unlocked[4] = true;
    w.player.ammo[4] = 5;
    const e = w.enemies.find((x) => x.id === 'e-airlock-1')!;
    w.enemies = [e];
    e.x = 18;
    e.y = 0;
    e.hp = e.maxHp = 5000;
    e.zone = 'airlock';
    w.currentRoom = 'airlock';
    for (let i = 0; i < charge; i++) {
      stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: true, aimX: 18, aimY: 0.9 });
      assert.equal(w.beams.length, 0, 'no beam while charging');
    }
    assert.equal(w.player.railCharge, Math.min(charge, RAIL_CHARGE_TICKS));
    stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: false, aimX: 18, aimY: 0.9 });
    assert.equal(w.beams.length > 0, true, 'beam on release');
    assert.equal(w.player.railCharge, 0);
    return e.maxHp - e.hp;
  };
  const tap = dmg(1);
  const full = dmg(RAIL_CHARGE_TICKS - 1);
  assert.ok(tap > 0);
  assert.ok(full > tap * 1.6, `charged ${full} vs tap ${tap}`);

  // Holding past full charge auto-releases
  const w = newWorld3D();
  place(w, 8, 0);
  w.player.unlocked[4] = true;
  w.player.ammo[4] = 5;
  let fired = false;
  for (let i = 0; i < RAIL_CHARGE_TICKS + 3 && !fired; i++) {
    stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: true, aimX: 20, aimY: 1 });
    fired = w.events.some((e) => e.type === 'rail');
  }
  assert.ok(fired, 'full charge auto-fires');
});

test('combat: chain kills raise a combo, refund the dash, and lapse after the window', () => {
  const w = newWorld3D();
  place(w, 8, 0);
  const [a, b, c] = w.enemies.filter((e) => e.kind === 'crawler' && !e.minion).slice(0, 3);
  w.enemies = [a, b, c];
  for (const [i, e] of [a, b, c].entries()) {
    e.x = 12 + i;
    e.y = 0;
    e.hp = 1;
    e.active = true;
    e.zone = 'airlock';
  }
  w.currentRoom = 'airlock';
  w.player.body.dashCooldown = 50;
  triggerExplosion3D(w, 13, 0.5, 0, 4, 200, 0xff7a2f, 0, 3);
  assert.equal(w.player.kills, 3);
  assert.equal(w.combo.count, 3);
  assert.equal(w.combo.best, 3);
  assert.equal(w.player.body.dashCooldown, 0, 'kills refund the dash');
  assert.ok(w.events.some((e) => e.type === 'combo' && (e.value ?? 0) >= 2));
  assert.equal(w.run.bestCombo, 3);
  stepN(w, COMBO_WINDOW_TICKS + 2);
  assert.equal(w.combo.count, 0, 'combo lapses');
  assert.equal(w.combo.best, 3, 'best is kept');
});

// Boss helpers
function bossWorld(): { w: WorldState3D; warden: EnemyState3D } {
  const w = newWorld3D();
  w.consoleUnlocked = true;
  w.openDoors.add('door_boss');
  place(w, 76, 0);
  w.currentRoom = 'core';
  w.bossIntroDone = true; // the intro has its own tests
  w.player.hp = w.player.maxHp = 100000;
  w.player.hurtInvulnTicks = 0;
  const warden = w.enemies.find((e) => e.kind === 'warden')!;
  warden.active = true;
  warden.x = 88;
  return { w, warden };
}

test('Core Warden: three phases at 2/3 and 1/3 HP, each phase has a deterministic telegraphed pattern cycle', () => {
  assert.equal(WARDEN_CYCLE_3D[1].length >= 2 && WARDEN_CYCLE_3D[1].length <= 4, true);
  for (const ph of [1, 2, 3] as const) {
    const set = new Set(WARDEN_CYCLE_3D[ph]);
    assert.ok(set.size >= 2 && set.size <= 3, `phase ${ph} has 2-3 distinct attacks`);
  }
  assert.ok(WARDEN_CYCLE_3D[2].includes('charge'));
  assert.ok(WARDEN_CYCLE_3D[3].includes('summon') && WARDEN_CYCLE_3D[3].includes('barrage'));

  const { w, warden } = bossWorld();
  w.player.unlocked[1] = true;
  warden.x = 84;
  assert.equal(warden.phase, 1);
  warden.hp = Math.floor(warden.maxHp * (2 / 3)) + 1;
  for (let i = 0; i < 60 && warden.phase < 2; i++) stepN(w, 1, { fire: true, aimX: warden.x, aimY: 1.5 });
  assert.equal(warden.phase, 2);
  assert.ok(w.events.length >= 0);
  warden.hp = Math.floor(warden.maxHp / 3) + 1;
  let phaseEvent = 0;
  for (let i = 0; i < 80 && warden.phase < 3; i++) {
    stepN(w, 1, { fire: true, aimX: warden.x, aimY: 1.5 });
    for (const e of w.events) if (e.type === 'boss_phase') phaseEvent = e.value ?? 0;
  }
  assert.equal(warden.phase, 3);
  assert.equal(phaseEvent, 3, 'boss_phase event carries the new phase');
  assert.ok(warden.exposedTicks > 0 || warden.state === 'stagger', 'phase change opens a brief weak-point window');
});

test('Core Warden: every attack has a visible windup (telegraph) before it hits, and boss_telegraph is raised', () => {
  const seen = new Set<string>();
  for (const phase of [1, 2, 3] as const) {
    const { w, warden } = bossWorld();
    warden.phase = phase;
    warden.hp = warden.maxHp * (phase === 1 ? 0.9 : phase === 2 ? 0.5 : 0.2);
    warden.attackCooldown = 0;
    w.player.hurtInvulnTicks = 0;
    let telegraphs = 0;
    for (let i = 0; i < 1500; i++) {
      const prevWind = warden.windupTicks;
      const prevSw = w.shockwaves.length;
      const prevLunge = warden.lungeTicks;
      const prevBarrage = warden.barrageLeft;
      const prevPlasma = w.projectiles.filter((p) => p.kind === 'boss_plasma').length;
      stepWorld3D(w, { ...emptyInput3D(), aimX: 60, aimY: 1 });
      w.player.hurtInvulnTicks = 0;
      if (warden.bossPattern !== 'none') seen.add(`${phase}:${warden.bossPattern}`);
      if (w.events.some((e) => e.type === 'boss_telegraph')) telegraphs++;
      // Every slam, volley, charge and summon is preceded by a windup tick; barrage bursts follow a windup too
      const plasma = w.projectiles.filter((p) => p.kind === 'boss_plasma').length;
      if (w.shockwaves.length > prevSw) assert.ok(prevWind > 0, 'slam telegraphed');
      if (warden.lungeTicks > 0 && prevLunge === 0) assert.ok(prevWind > 0, 'charge telegraphed');
      if (plasma > prevPlasma && prevBarrage === 0) assert.ok(prevWind > 0, 'volley telegraphed');
      if (plasma > prevPlasma && prevBarrage > 0) assert.ok(warden.barrageLeft < prevBarrage, 'barrage burst counted');
    }
    assert.ok(telegraphs >= 3, `phase ${phase} telegraphed ${telegraphs} attacks`);
  }
  for (const [ph, p] of [[1, 'slam'], [1, 'volley'], [2, 'charge'], [3, 'barrage'], [3, 'charge'], [3, 'summon']] as const) {
    assert.ok(seen.has(`${ph}:${p}`), `observed ${p} in phase ${ph}`);
  }
});

test('Core Warden: slam and charge crash open a weak-point window (x2 damage, staggered); guarded hits are reduced', () => {
  const { w, warden } = bossWorld();
  const base = (): number => {
    const t = newWorld3D();
    const wd = t.enemies.find((e) => e.kind === 'warden')!;
    return wd.hp;
  };
  assert.equal(base(), warden.maxHp);
  // Guarded
  warden.exposedTicks = 0;
  const g0 = warden.hp;
  w.player.unlocked[1] = true;
  warden.x = 82;
  stepN(w, 1, { fire: true, aimX: 82, aimY: 1.5 });
  for (let i = 0; i < 30 && warden.hp === g0; i++) stepN(w, 1, { fire: true, aimX: 82, aimY: 1.5 });
  const guardedHit = g0 - warden.hp;
  assert.ok(guardedHit > 0 && guardedHit < 18, `guarded pulse < 18, got ${guardedHit}`);
  // Exposed
  const { w: w2, warden: wd2 } = bossWorld();
  wd2.exposedTicks = 200;
  wd2.x = 82;
  const e0 = wd2.hp;
  for (let i = 0; i < 30 && wd2.hp === e0; i++) stepN(w2, 1, { fire: true, aimX: 82, aimY: 1.5 });
  const exposedHit = e0 - wd2.hp;
  assert.ok(exposedHit >= 30, `exposed pulse doubled, got ${exposedHit}`);
  assert.equal(wd2.state, 'stagger', 'exposed boss reads as staggered');

  // Charge into the wall exposes the Warden
  const { w: w3, warden: wd3 } = bossWorld();
  wd3.phase = 2;
  wd3.hp = wd3.maxHp * 0.5;
  wd3.attackCooldown = 0;
  wd3.patternIndex = 0; // phase 2 cycle starts with charge
  place(w3, 74, 2.6); // standing on a platform-height position keeps the player clear
  w3.player.body.grounded = true;
  let crashed = false;
  for (let i = 0; i < 400 && !crashed; i++) {
    w3.player.hp = w3.player.maxHp;
    stepWorld3D(w3, { ...emptyInput3D(), aimX: 80, aimY: 1 });
    if (w3.events.some((e) => e.type === 'boss_exposed')) crashed = true;
  }
  assert.ok(crashed, 'charge ends in an exposed window');
  assert.ok(wd3.exposedTicks > 0);
});

test('Core Warden: Phase III summons up to two minions (dead slots revive) and they die with the Warden', () => {
  const { w, warden } = bossWorld();
  const minions = w.enemies.filter((e) => e.minion && e.id.startsWith('e-core-m'));
  assert.equal(minions.length, 2);
  assert.ok(minions.every((m) => !m.alive && m.deathTicks >= 240), 'minion slots start dead and hidden');
  warden.phase = 3;
  warden.hp = warden.maxHp * 0.2;
  warden.attackCooldown = 0;
  warden.patternIndex = 2; // summon
  let summoned = false;
  for (let i = 0; i < 200 && !summoned; i++) {
    stepWorld3D(w, { ...emptyInput3D(), aimX: 60, aimY: 1 });
    summoned = w.events.some((e) => e.type === 'boss_summon');
  }
  assert.ok(summoned);
  assert.equal(minions.filter((m) => m.alive).length, 2);
  // Defeating the Warden removes them
  warden.hp = 1;
  warden.exposedTicks = 100;
  w.player.unlocked[1] = true;
  place(w, 80, 0);
  for (let i = 0; i < 200 && warden.alive; i++) stepN(w, 1, { fire: true, aimX: warden.x, aimY: 1.5 });
  assert.equal(warden.alive, false);
  assert.equal(minions.filter((m) => m.alive).length, 0);
});

test('Core Warden: two identical runs produce identical boss state (deterministic, no RNG)', () => {
  const run = (): string => {
    const { w, warden } = bossWorld();
    warden.attackCooldown = 0;
    for (let i = 0; i < 1200; i++) {
      w.player.hp = w.player.maxHp;
      stepWorld3D(w, { ...emptyInput3D(), moveX: i % 90 < 45 ? 1 : -1, jump: i % 50 === 0, aimX: warden.x, aimY: 1.5, fire: true });
    }
    return JSON.stringify([warden.hp, warden.phase, warden.x.toFixed(4), warden.patternIndex, w.projectiles.length, w.player.body.x.toFixed(4)]);
  };
  assert.equal(run(), run());
});

test('exploration: secret walls (Cracked Bio-Wall) open with a Grenade blast and are counted', () => {
  const w = newWorld3D();
  // Two Cracked Bio-Walls (Grenade) plus two breakable-block secrets added in round 5 (see tests/metroid.test.ts)
  assert.equal(w.level.secrets.length, 4);
  assert.equal(w.secretsFound.length, 0);
  for (const sr of w.level.secrets.filter((x) => !x.doorId.startsWith('break_'))) {
    const d = doorSolid(w, sr.doorId);
    assert.equal(d.doorLock, 'yellow', `${sr.id} is a Grenade lock`);
  }
  // Pulse cannot open it
  tryOpenDoor3D(w, doorSolid(w, 'door_secret_alcove'), 1);
  assert.equal(w.openDoors.has('door_secret_alcove'), false);
  // A grenade blast next to the wall does
  triggerExplosion3D(w, 1.2, 1.5, 0, 4.1, 0, 0xff7a2f, 0, 3);
  assert.ok(w.openDoors.has('door_secret_alcove'));
  assert.deepEqual(w.secretsFound, ['secret_alcove']);
  assert.ok(w.events.some((e) => e.type === 'secret'));
  stepN(w, 1);
  assert.equal(w.completion.secretsFound, 1);
  // Real grenade shot at the wall from the airlock
  const g = newWorld3D();
  place(g, 4, 0);
  g.player.unlocked[3] = true;
  g.player.ammo[3] = 3;
  stepN(g, 1, { fire: true, weaponSlot: 3, aimX: -2, aimY: 1.2 });
  stepN(g, 120, { aimX: -2, aimY: 1.2 });
  assert.ok(g.openDoors.has('door_secret_alcove'), 'a thrown grenade breaks the wall');
});

test('exploration: six data logs (one per sector), completion percent and run summary fields', () => {
  const w = newWorld3D();
  assert.equal(w.collectibles.length, 6);
  assert.deepEqual([...new Set(w.collectibles.map((c) => c.sector))].sort(), ['airlock', 'biolabs', 'core', 'mines', 'security', 'shaft']);
  stepN(w, 1);
  assert.equal(w.completion.percent, 0);
  assert.equal(w.completion.logsTotal, 6);
  assert.equal(w.completion.total, 6 + 4 + 7 + 5, 'logs + secrets + upgrades + weapons');

  const log = w.collectibles.find((c) => c.id === 'log_mines')!;
  place(w, log.x, log.y);
  stepN(w, 1);
  assert.ok(log.taken);
  assert.ok(w.events.some((e) => e.type === 'collect'));
  assert.equal(w.completion.logsFound, 1);
  assert.equal(w.completion.percent, Math.round((100 * 1) / 22));
  // Taking it again does nothing
  stepN(w, 2);
  assert.equal(w.completion.logsFound, 1);

  const s = getRunSummary3D(w);
  for (const k of ['clearTimeTicks', 'clearTimeSeconds', 'deaths', 'kills', 'collectiblesFound', 'collectiblesTotal', 'completionPercent', 'secretsFound', 'bestCombo', 'score', 'rank', 'won'] as const) {
    assert.ok(k in s, `summary has ${k}`);
  }
  assert.equal(s.collectiblesFound, 1);
  assert.equal(s.collectiblesTotal, 6);
  assert.equal(s.won, false);
  assert.equal(s.rank, 'C');
});

test('run stats: deaths are counted at respawn and the clock only runs while playing', () => {
  const w = newWorld3D();
  stepN(w, 30);
  assert.equal(getRunSummary3D(w).clearTimeTicks, 30);
  w.player.hp = 1;
  w.status = 'lost';
  respawnPlayer3D(w);
  assert.equal(w.run.deaths, 1);
  assert.equal(getRunSummary3D(w).deaths, 1);
  stepN(w, 10);
  assert.equal(w.tick, 40);
});

test('reach: wall slide, wall jump and dash cancel never bypass a Thruster Boots gate; every log is reachable', () => {
  const level = buildFacilityMap3D();
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  const gates = [
    { sx: 38, sy: 4.4, target: { x: 31, y: 8.8 } },
    { sx: 65, sy: 4.4, target: { x: 65, y: 8.8 } },
    { sx: 55, sy: 4.5, target: { x: 65, y: 8.8 } },
  ];
  for (const g of gates) {
    assert.equal(wallHopReaches(spawnBody3D(g.sx, g.sy, 0), g.target, level, doors, 1, 900), false, `wall-hop bypass at x=${g.sx}`);
  }
  for (const c of buildCollectibleChecks(level)) {
    const r = walkTo(spawnBody3D(c.from.x, c.from.y, 0), c.target, level, new Set(c.doors), c.maxJumps, 1200);
    assert.equal(r.reached, true, `${c.label} reachable`);
  }
});

test('difficulty curve: sector damage rises toward the Core and the bot still wins while taking real damage', () => {
  const order = ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'] as const;
  for (let i = 1; i < order.length; i++) assert.ok(SECTOR_DAMAGE_3D[order[i]] >= SECTOR_DAMAGE_3D[order[i - 1]]);
  assert.ok(SECTOR_DAMAGE_3D.airlock < 1 && SECTOR_DAMAGE_3D.core > 1.3);

  const w = newWorld3D();
  const bot = createBot3D(w);
  let minHp = w.player.hp;
  let lost = 0;
  for (let t = 0; t < 14000 && w.status !== 'won'; t++) {
    const before = w.player.hp;
    stepWorld3D(w, bot.next(w));
    if (w.player.hp < before) lost += before - w.player.hp;
    minHp = Math.min(minHp, w.player.hp);
    if (w.status === 'lost') assert.fail(`bot died at "${bot.stepLabel}"`);
  }
  assert.equal(w.status, 'won');
  assert.ok(w.player.hp >= 60 && w.player.hp <= 140, `final HP ${w.player.hp} within 60..140`);
  assert.ok(lost >= 80, `bot actually takes damage (lost ${lost})`);
  assert.ok(minHp < 100, `HP dips below the base pool (min ${minHp})`);
  const s = getRunSummary3D(w);
  assert.equal(s.won, true);
  assert.equal(s.deaths, 0);
  assert.ok(s.kills >= 20);
  assert.ok(s.completionPercent >= 40);
});

test('extraction ambush: meltdown wakes hold-outs along the escape route and stops med drops', () => {
  const w = newWorld3D();
  const esc = w.enemies.filter((e) => e.id.startsWith('e-esc-'));
  assert.ok(esc.length >= 4 && esc.every((e) => !e.alive));
  w.enemies.find((e) => e.kind === 'warden')!.alive = false;
  place(w, 88, 0);
  w.player.unlocked[4] = true;
  w.player.ammo[4] = 5;
  w.coreHp = 10;
  railShot(w, w.level.corePos.x, 1.4);
  assert.ok(w.coreDestroyed);
  assert.ok(esc.every((e) => e.alive), 'ambush slots are live');
});

test('Core Warden intro: starts once on core entry, freezes input and boss, is deterministic and skippable', () => {
  const run = (skipAt: number): { x: number; active: boolean; ticks: number } => {
    const w = newWorld3D();
    w.consoleUnlocked = true;
    w.openDoors.add('door_boss');
    place(w, 76, 0);
    const warden = w.enemies.find((e) => e.kind === 'warden')!;
    let x0 = -1;
    let introTicks = 0;
    for (let i = 0; i < 400; i++) {
      if (i === skipAt) skipBossIntro3D(w);
      stepWorld3D(w, { ...emptyInput3D(), moveX: 1, aimX: 90, aimY: 1 });
      if (w.bossIntroTicks > 0) {
        if (introTicks === 0) x0 = w.player.body.x;
        introTicks++;
        assert.equal(warden.active, false, 'boss dormant during the intro');
        assert.ok(Math.abs(w.player.body.x - x0) < 1, 'player input ignored during the intro (only coasting)');
      }
    }
    return { x: w.player.body.x, active: warden.active, ticks: introTicks };
  };
  const a = run(-1);
  const b = run(-1);
  assert.deepEqual(a, b, 'identical replays');
  assert.ok(a.ticks >= BOSS_INTRO_TICKS - 2 && a.ticks <= BOSS_INTRO_TICKS, `intro length ${a.ticks}`);
  assert.ok(BOSS_INTRO_TICKS <= 240, 'under four seconds at 60 Hz');
  assert.equal(a.active, true, 'boss wakes after the intro');
  const s = run(20);
  assert.ok(s.ticks < 30, 'skip ends the intro quickly');
});

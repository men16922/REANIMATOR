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
  assert.equal(level.upgrades.filter((u) => u.kind === 'energy_tank').length, 2);
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
  stepN(ch, 1, { fire: true, weaponSlot: 4, aimX: first.x, aimY: 0.7 });
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
  stepN(rl, 1, { fire: true, weaponSlot: 4, aimX: 30, aimY: 1.0 });
  assert.ok(rl.beams[0] && Math.hypot(rl.beams[0].x2 - 20, rl.beams[0].y2 - 1.12) < 5, 'beam stops at the locked door');
  assert.equal(behind.hp, 78, 'enemy behind the door is untouched');
  rl.openDoors.add('door_airlock_shaft');
  rl.player.fireCooldown = 0;
  stepN(rl, 1, { fire: true, weaponSlot: 4, aimX: 30, aimY: 1.0 });
  assert.ok(behind.hp < 78, 'beam passes once the door is open');
});

test('Core Warden: shielded core, Phase 2 at <= 50% HP, jump dodges shockwave, Meltdown opens the escape hatch', () => {
  const w = newWorld3D();
  w.consoleUnlocked = true;
  w.openDoors.add('door_boss');
  w.phase = 'warden';
  place(w, 76, 0);
  w.player.unlocked[4] = true;
  w.player.ammo[4] = 20;
  const warden = w.enemies.find((e) => e.kind === 'warden')!;
  assert.equal(warden.phase, 1);

  const coreStart = w.coreHp;
  stepN(w, 1, { weaponSlot: 4, fire: true, aimX: w.level.corePos.x, aimY: 1.4 });
  assert.equal(w.coreHp, coreStart, 'core shielded while the Warden lives');

  warden.hp = Math.floor(warden.maxHp * 0.5) + 20;
  warden.x = 82;
  w.player.fireCooldown = 0;
  stepN(w, 1, { weaponSlot: 4, fire: true, aimX: warden.x, aimY: 1.4 });
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
  stepN(w, 1, { weaponSlot: 4, fire: true, aimX: w.level.corePos.x, aimY: 1.4 });
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
  let flipTick = -1;
  for (let i = 1; i <= 30 && flipTick < 0; i++) {
    placePlayer(w, e.x + 3, e.y);
    w.player.hp = 100;
    stepWorld3D(w, emptyInput3D());
    if (e.facing !== before) flipTick = i;
  }
  assert.ok(flipTick >= 5 || e.state === 'windup' || e.state === 'attack', `flip delayed (tick ${flipTick})`);
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
  const d0 = Math.abs(e.x - home);
  let maxDist = 0;
  for (let i = 0; i < 700; i++) {
    w.player.hp = 100;
    w.player.body.x = home + 60;
    stepWorld3D(w, emptyInput3D());
    maxDist = Math.max(maxDist, Math.abs(e.x - home));
  }
    assert.ok(Math.abs(e.x - home) <= 4.6, `stays within patrol range (${Math.abs(e.x - home)}, start ${d0})`);
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

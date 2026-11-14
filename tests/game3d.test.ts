// Unit & integration tests for REANIMATOR Full 3D motion, 4-weapon combat,
// Core Warden phases/shockwaves, strict R3.3 headlamp non-coupling, and rigged GLB clips.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ABILITY_3D, spawnBody3D, stepBody3D } from '../src/engine/motion3d.ts';
import { buildCollider3D, buildFacilityMap3D } from '../src/game3d/map3d.ts';
import {
  emptyInput3D,
  newWorld3D,
  stepWorld3D,
  triggerExplosion3D,
  type WorldState3D,
} from '../src/game3d/world3d.ts';

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

test('motion3d: acceleration, friction, jump arc, ramp climb, wall/pillar slide, and Jet-Dash', () => {
  const level = buildFacilityMap3D();
  const col = buildCollider3D(level, new Set());

  // 1. Horizontal acceleration & friction on floor
  let b = spawnBody3D(3.2, 0, 0);
  for (let i = 0; i < 20; i++) {
    b = stepBody3D(b, { moveX: 1, moveZ: 0, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 }, col);
  }
  assert.ok(b.vx > 8.5, `Expected run velocity near top speed, got ${b.vx}`);
  for (let i = 0; i < 25; i++) {
    b = stepBody3D(b, { moveX: 0, moveZ: 0, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 }, col);
  }
  assert.ok(Math.abs(b.vx) < 0.05, `Expected friction stop, got ${b.vx}`);

  // 2. Jump arc & landing
  b = stepBody3D(b, { moveX: 0, moveZ: 0, jump: true, dash: false, aimDirX: 1, aimDirZ: 0 }, col);
  assert.equal(b.grounded, false);
  let maxY = 0;
  for (let i = 0; i < 60; i++) {
    b = stepBody3D(b, { moveX: 0, moveZ: 0, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 }, col);
    if (b.y > maxY) maxY = b.y;
    if (b.grounded && i > 5) break;
  }
  assert.ok(maxY > 1.4, `Expected jump height > 1.4m, got ${maxY}`);
  assert.equal(b.grounded, true);

  // 3. Walkable Ramp3D climb onto Catwalk A (y = 2.2)
  let rampBody = spawnBody3D(9.8, 0, -6.2);
  for (let i = 0; i < 65; i++) {
    rampBody = stepBody3D(
      rampBody,
      { moveX: 1, moveZ: 0, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 },
      col,
    );
  }
  assert.ok(rampBody.x > 15.2, `Expected ramp traversal past x=15.2, got ${rampBody.x}`);
  assert.ok(Math.abs(rampBody.y - 2.2) < 0.15, `Expected catwalk height ~2.2, got ${rampBody.y}`);

  // 4. Cylindrical pillar & south wall slide collision
  let pilBody = spawnBody3D(16.5, 0, 4.8);
  for (let i = 0; i < 35; i++) {
    pilBody = stepBody3D(
      pilBody,
      { moveX: 1, moveZ: 0.25, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 },
      col,
    );
  }
  const distToPillar = Math.hypot(pilBody.x - 18.0, pilBody.z - 4.8);
  assert.ok(distToPillar >= 0.78 + ABILITY_3D.radius - 0.05, `Player penetrated pillar: d=${distToPillar}`);

  // 5. Jet-Dash burst & cooldown
  let dashBody = spawnBody3D(4.0, 0, 0);
  dashBody = stepBody3D(dashBody, { moveX: 0, moveZ: 1, jump: false, dash: true, aimDirX: 1, aimDirZ: 0 }, col);
  assert.equal(dashBody.dashTicks, ABILITY_3D.dashTicks - 1);
  assert.equal(dashBody.dashCooldown, ABILITY_3D.dashCooldownTicks);
  assert.ok(dashBody.vz > 18, `Expected dash velocity burst, got ${dashBody.vz}`);
});

test('world3d: all 4 weapons + 3D grenade bounce + bio-barrel chain detonation + Rail wall stop', () => {
  const w = newWorld3D();

  // [1] Pulse Rifle damages aligned enemy
  const crawler = w.enemies.find((e) => e.id === 'e-a1')!;
  const initHp = crawler.hp;
  const step1 = stepWorld3D(w, {
    ...emptyInput3D(),
    fire: true,
    aimX: crawler.x,
    aimY: 0.55,
    aimZ: crawler.z,
  });
  assert.ok(step1.projectiles.some((p) => p.kind === 'pulse'), 'Pulse projectile should spawn');
  for (let i = 0; i < 30; i++) stepWorld3D(step1, emptyInput3D());
  assert.ok(crawler.hp < initHp, 'Pulse projectile should damage Zone A crawler');

  // [2] Scattergun spawns 7 pellets & decrements ammo
  step1.player.unlocked[2] = true;
  step1.player.ammo[2] = 10;
  step1.player.fireCooldown = 0;
  step1.projectiles = [];
  stepWorld3D(step1, {
    ...emptyInput3D(),
    weaponSlot: 2,
    fire: true,
    aimX: 15,
    aimY: 1.0,
    aimZ: 0,
  });
  assert.equal(step1.player.ammo[2], 9);
  assert.equal(step1.projectiles.filter((p) => p.kind === 'scatter').length, 7);

  // [3] Grenade launcher bounces off floor/wall & triggers chain bio-barrel detonation
  step1.player.unlocked[3] = true;
  step1.player.ammo[3] = 5;
  step1.player.fireCooldown = 0;
  step1.projectiles = [];
  stepWorld3D(step1, {
    ...emptyInput3D(),
    weaponSlot: 3,
    fire: true,
    aimX: 12,
    aimY: 0.2,
    aimZ: 0,
  });
  let maxBounces = 0;
  for (let i = 0; i < 85; i++) {
    stepWorld3D(step1, emptyInput3D());
    for (const p of step1.projectiles) {
      if (p.kind === 'grenade' && p.bounces > maxBounces) maxBounces = p.bounces;
    }
  }
  assert.ok(maxBounces >= 1, `Expected 3D grenade bounce >= 1, got ${maxBounces}`);

  // Barrel domino chain detonation (Zone D barrels d1..d4 spaced ~2.4m apart, blast radius 4.4m)
  const brl1 = step1.barrels.find((b) => b.id === 'brl-d1')!;
  const brl2 = step1.barrels.find((b) => b.id === 'brl-d2')!;
  assert.equal(brl1.alive, true);
  assert.equal(brl2.alive, true);
  brl1.alive = false;
  triggerExplosion3D(step1, brl1.x, 0.7, brl1.z, 4.4, 92);
  assert.ok(brl2.fuseTicks > 0, 'Adjacent barrel should catch staggered domino fuse');
  for (let i = 0; i < 8; i++) stepWorld3D(step1, emptyInput3D());
  assert.equal(brl2.alive, false, 'Adjacent bio-barrel must chain-detonate');

  // [4] Rail-Cannon pierces aligned enemies and terminates on solid divider wall
  const wRail = newWorld3D();
  wRail.player.body.x = 5.0;
  wRail.player.body.z = 0.0;
  wRail.player.unlocked[4] = true;
  wRail.player.ammo[4] = 5;
  wRail.enemies[0].x = 9.0;
  wRail.enemies[0].z = 0.0;
  wRail.enemies[0].alive = true;
  wRail.enemies[0].hp = 50;
  wRail.enemies[1].x = 12.5;
  wRail.enemies[1].z = 0.0;
  wRail.enemies[1].alive = true;
  wRail.enemies[1].hp = 50;
  stepWorld3D(wRail, {
    ...emptyInput3D(),
    weaponSlot: 4,
    fire: true,
    aimX: 28,
    aimY: 1.0,
    aimZ: 0.0,
  });
  assert.equal(wRail.player.ammo[4], 4);
  assert.equal(wRail.beams.length, 1);
  assert.equal(wRail.enemies[0].alive, false, 'First aligned enemy should die to piercing rail');
  assert.equal(wRail.enemies[1].alive, false, 'Second aligned enemy should also die to piercing rail');
  // Beam fired straight at West perimeter wall (x=0) stops cleanly at wall
  wRail.player.fireCooldown = 0;
  stepWorld3D(wRail, {
    ...emptyInput3D(),
    weaponSlot: 4,
    fire: true,
    aimX: -10,
    aimY: 1.0,
    aimZ: 0.0,
  });
  const westBeam = wRail.beams.at(-1)!;
  assert.ok(westBeam.x2 >= -0.05 && westBeam.x2 < 0.6, `Rail beam should stop on West wall x=0, got x2=${westBeam.x2}`);
});

test('Core Warden: Phase 2 at <= 50% HP, jump dodges shockwave ring, Core shielded until Warden dies', () => {
  const w = newWorld3D();
  w.consoleUnlocked = true;
  w.openDoors.add('gate_c');
  w.phase = 'warden';
  w.player.body.x = 64.0;
  w.player.body.z = 0.0;
  w.player.unlocked[4] = true;
  w.player.ammo[4] = 20;

  const warden = w.enemies.find((e) => e.kind === 'warden')!;
  assert.equal(warden.phase, 1);

  // Shooting Power Core while Warden alive does 0 damage
  const coreStartHp = w.coreHp;
  stepWorld3D(w, {
    ...emptyInput3D(),
    weaponSlot: 4,
    fire: true,
    aimX: w.level.corePos.x,
    aimY: 1.4,
    aimZ: w.level.corePos.z,
  });
  assert.equal(w.coreHp, coreStartHp, 'Power Core must remain shielded while Warden is alive');

  // Drop Warden <= 50% HP via Rail-Cannon shot triggers Phase 2
  warden.hp = Math.floor(warden.maxHp * 0.5) + 20;
  warden.x = 69.0;
  warden.z = 0.0;
  w.player.fireCooldown = 0;
  stepWorld3D(w, {
    ...emptyInput3D(),
    weaponSlot: 4,
    fire: true,
    aimX: warden.x,
    aimY: 1.4,
    aimZ: warden.z,
  });
  assert.equal(warden.phase, 2, 'Warden should enter Phase 2 below 50% HP');

  // Grounded player hit by ShockwaveRing vs Jumping player (y > 0.72) takes 0 damage
  const wGround = newWorld3D();
  wGround.player.body.x = 60.0;
  wGround.player.body.z = 0.0;
  wGround.player.body.y = 0.0;
  wGround.shockwaves.push({
    id: 99,
    x: 63.0,
    y: 0,
    z: 0,
    radius: 2.8,
    maxRadius: 15,
    speed: 9.0,
    damage: 22,
    hitPlayer: false,
    phase: 1,
  });
  const hpBeforeGround = wGround.player.hp;
  stepWorld3D(wGround, emptyInput3D());
  assert.ok(wGround.player.hp < hpBeforeGround, 'Grounded player must take shockwave damage');

  const wJump = newWorld3D();
  wJump.player.body.x = 60.0;
  wJump.player.body.z = 0.0;
  wJump.player.body.y = 1.15;
  wJump.player.body.vy = 2.0;
  wJump.player.body.grounded = false;
  wJump.shockwaves.push({
    id: 100,
    x: 63.0,
    y: 0,
    z: 0,
    radius: 2.8,
    maxRadius: 15,
    speed: 9.0,
    damage: 22,
    hitPlayer: false,
    phase: 1,
  });
  const hpBeforeJump = wJump.player.hp;
  stepWorld3D(wJump, emptyInput3D());
  assert.equal(wJump.player.hp, hpBeforeJump, 'Airborne player above y=0.72 must dodge shockwave with 0 damage');

  // After Warden defeated, destroying Power Core opens gate_d and starts 90s meltdown (5400 ticks)
  warden.alive = false;
  warden.hp = 0;
  w.enemies.forEach((e) => { if (e.zone === 'C') e.alive = false; });
  w.coreHp = 80;
  w.player.fireCooldown = 0;
  stepWorld3D(w, {
    ...emptyInput3D(),
    weaponSlot: 4,
    fire: true,
    aimX: w.level.corePos.x,
    aimY: 1.4,
    aimZ: w.level.corePos.z,
  });
  assert.equal(w.coreDestroyed, true);
  assert.equal(w.openDoors.has('gate_d'), true);
  assert.equal(w.phase, 'escape');
  assert.ok(w.meltdownTicks >= 5395 && w.meltdownTicks <= 5400);
});

test('R3.3 Strict Light Isolation: headlamp toggle/drain has zero effect on 360 ticks of 3D simulation', () => {
  const stripLight = (w: WorldState3D) => ({
    ...w,
    openDoors: [...w.openDoors].sort(),
    light: 'IGNORED',
    prevLightButton: false,
  });

  let wLit = newWorld3D();
  let wDark = newWorld3D();

  for (let t = 0; t < 360; t++) {
    const base = {
      ...emptyInput3D(),
      moveX: t < 180 ? 0.85 : -0.35,
      moveZ: t % 90 < 45 ? -0.4 : 0.4,
      jump: t === 60 || t === 210,
      dash: t === 120,
      fire: t % 9 < 5,
      aimX: 15 + (t % 7),
      aimY: 1.0,
      aimZ: ((t % 11) - 5) * 0.4,
    };
    wLit = stepWorld3D(wLit, { ...base, toggleLight: t === 5 || t === 240 });
    wDark = stepWorld3D(wDark, { ...base, toggleLight: false });
  }

  assert.notEqual(wLit.light.battery, wDark.light.battery, 'Headlamp battery must differ');
  assert.deepEqual(stripLight(wLit), stripLight(wDark), 'Gameplay trace must remain byte-identical with light toggled');
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

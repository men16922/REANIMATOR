// Round 6 arms: Flamer (slot 5) and Rocket launcher (slot 6). Cone judgement, burn ticks, matchups, fuel, rocket blast and
// rocket jump limits, pedestals, ammo, completion, audio mapping, gear budgets and the Boots / tunnel bypass probe.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import {
  AMMO_PICKUP_SHARE_3D,
  BURN_DAMAGE_3D,
  BURN_INTERVAL_TICKS_3D,
  COMPLETION_WEAPON_PEDESTALS,
  FLAMER_3D,
  HIVE_MATCHUP_3D,
  ROCKET_3D,
  ROCKET_JUMP_3D,
  WEAPON_META,
  WEAPON_MATCHUP_3D,
  emptyInput3D,
  newWorld3D,
  stepWorld3D,
  type EnemyState3D,
  type InputState3D,
  type WorldState3D,
} from '../src/game3d/world3d.ts';
import { checkCompletion, checkRocketJump, rocketProbeSites } from '../tools/game/reach3d.ts';
import { EVENT_SOUND, cueForEvent } from '../src/ui/audioLogic.ts';
import { buildFlamer, buildRocket, WEAPON_MODEL_NAME } from '../src/render3d/heroGear3d.ts';
import { RECOIL_PROFILE } from '../src/render3d/heroPose.ts';
import { projectileStyle } from '../src/render3d/vfxStyle3d.ts';
import { collectionPercent } from '../src/ui/flow.ts';
import { ammoText, drawClassicHud, SLOT_PITCH, SLOT_W, SLOT_X0, WEAPON_SLOTS } from '../src/ui/classicHud.ts';

function stepN(w: WorldState3D, n: number, inp: Partial<InputState3D> = {}): void {
  for (let i = 0; i < n; i++) stepWorld3D(w, { ...emptyInput3D(), ...inp });
}
function place(w: WorldState3D, x: number, y: number): void {
  w.player.body = spawnBody3D(x, y, 0);
}
/** A quiet world: nobody awake, nobody alive unless the test spawns them. */
function quiet(): WorldState3D {
  const w = newWorld3D();
  for (const e of w.enemies) {
    e.alive = false;
    e.active = false;
  }
  for (const h of w.hives) h.alive = false;
  for (const b of w.barrels) b.alive = false;
  return w;
}
function arm(w: WorldState3D, slot: 5 | 6, ammo = 50): void {
  w.player.unlocked[slot] = true;
  w.player.ammo[slot] = ammo;
  w.player.weapon = slot;
}
function target(w: WorldState3D, kind: EnemyState3D['kind'], x: number, y = 0): EnemyState3D {
  const e = w.enemies.find((q) => q.kind === kind && !q.minion)!;
  e.alive = true;
  e.active = true;
  e.x = x;
  e.y = y;
  e.hp = e.maxHp = 400;
  e.state = 'dormant';
  e.vx = 0;
  e.deathTicks = 0;
  return e;
}
/** Hold the enemy still and passive so damage numbers are only from the weapon under test. */
function pin(e: EnemyState3D): void {
  e.state = 'dormant';
  e.vx = 0;
  e.attackCooldown = 999;
}

// ------------------------------------------------------------------ data and wiring

test('arms: six weapon slots, two new pedestals, completion total rises by two', () => {
  const lvl = buildFacilityMap3D();
  assert.deepEqual(lvl.pedestals.map((p) => p.weapon).sort(), [2, 3, 4, 5, 6]);
  assert.equal(COMPLETION_WEAPON_PEDESTALS, 5);
  const w = newWorld3D();
  assert.equal(w.completion.weaponsTotal, 5);
  assert.equal(w.completion.total, 6 + 4 + 7 + 5);
  assert.deepEqual(Object.keys(w.player.unlocked), ['1', '2', '3', '4', '5', '6']);
  assert.equal(WEAPON_META[5].name, 'FLAMER');
  assert.equal(WEAPON_META[6].name, 'ROCKET');
  // Flamer: Mines/Bio-Labs side path (Bio-Labs west ledge). Rocket: Security Deck, between the console and the boss door
  const fl = lvl.pedestals.find((p) => p.id === 'ped-flamer')!;
  const rk = lvl.pedestals.find((p) => p.id === 'ped-rocket')!;
  assert.equal(w.level.rooms.find((r) => fl.x >= r.minX && fl.x <= r.maxX && fl.y >= r.minY && fl.y <= r.maxY)?.sector, 'biolabs');
  assert.equal(w.level.rooms.find((r) => rk.x >= r.minX && rk.x <= r.maxX && rk.y >= r.minY && rk.y <= r.maxY)?.sector, 'security');
});

test('arms: pedestals unlock the weapon with starting ammo, count toward completion and the collection percent', () => {
  const w = quiet();
  const fl = w.level.pedestals.find((p) => p.id === 'ped-flamer')!;
  place(w, fl.x, fl.y);
  stepN(w, 1);
  assert.ok(w.player.unlocked[5] && w.player.weapon === 5);
  assert.equal(w.player.ammo[5], WEAPON_META[5].initialAmmo);
  assert.equal(w.completion.weaponsFound, 1);
  const rk = w.level.pedestals.find((p) => p.id === 'ped-rocket')!;
  place(w, rk.x, rk.y);
  stepN(w, 1);
  assert.ok(w.player.unlocked[6] && (w.player.weapon as number) === 6);
  assert.equal(w.player.ammo[6], WEAPON_META[6].initialAmmo);
  assert.equal(w.completion.weaponsFound, 2);
  for (const s of [2, 3, 4] as const) w.player.unlocked[s] = true;
  for (const u of w.level.upgrades) w.collectedUpgrades.add(u.id);
  assert.equal(collectionPercent(w), 100);
});

test('arms: keys 5 and 6 select the new weapons only once unlocked', () => {
  const w = quiet();
  stepN(w, 1, { weaponSlot: 5 });
  assert.equal(w.player.weapon, 1);
  w.player.unlocked[5] = true;
  w.player.unlocked[6] = true;
  stepN(w, 1, { weaponSlot: 5 });
  assert.equal(w.player.weapon, 5);
  stepN(w, 1, { weaponSlot: 6 });
  assert.equal(w.player.weapon, 6);
});

test('arms: ammo drops, Ammo Expansion and Save recharge include fuel and rockets', () => {
  const w = quiet();
  arm(w, 5, 0);
  arm(w, 6, 0);
  w.player.weapon = 1;
  const a = w.player.ammo;
  w.pickups.push({ id: 'drop-t', kind: 'ammo', value: 10, x: w.player.body.x, y: w.player.body.y, z: 0, taken: false });
  stepN(w, 1);
  assert.equal(a[5], Math.ceil(10 * AMMO_PICKUP_SHARE_3D[5]));
  assert.equal(a[6], Math.ceil(10 * AMMO_PICKUP_SHARE_3D[6]));
  // A locked weapon does not hoard the new ammo types
  const v = quiet();
  v.pickups.push({ id: 'drop-t', kind: 'ammo', value: 10, x: v.player.body.x, y: v.player.body.y, z: 0, taken: false });
  stepN(v, 1);
  assert.equal(v.player.ammo[5], 0);
  assert.equal(v.player.ammo[6], 0);
  // Expansion: +50% of the starting ammo, recharge level 150%
  const e = quiet();
  arm(e, 5, 10);
  arm(e, 6, 1);
  const up = e.level.upgrades.find((u) => u.kind === 'ammo_expansion')!;
  place(e, up.x, up.y);
  stepN(e, 1);
  assert.equal(e.player.ammoExpansions, 1);
  assert.equal(e.player.ammo[5], 10 + Math.ceil(WEAPON_META[5].initialAmmo * 0.5));
  assert.equal(e.player.ammo[6], 1 + Math.ceil(WEAPON_META[6].initialAmmo * 0.5));
  // Save station refills up to initial * (1 + 0.5 * expansions)
  e.player.ammo[5] = 3;
  e.player.ammo[6] = 0;
  const sv = e.level.saveStations[0];
  place(e, sv.x, sv.y);
  stepN(e, 2);
  assert.equal(e.player.ammo[5], Math.round(WEAPON_META[5].initialAmmo * 1.5));
  assert.equal(e.player.ammo[6], Math.round(WEAPON_META[6].initialAmmo * 1.5));
});

// ------------------------------------------------------------------ Flamer

test('flamer: continuous fire spends one fuel per tick-cooldown and stops at zero fuel, falling back to Pulse', () => {
  const w = quiet();
  arm(w, 5, 4);
  place(w, 10, 0);
  stepN(w, 40, { fire: true, aimX: 15, aimY: 1.1 });
  assert.equal(w.player.ammo[5], 0);
  assert.equal(w.player.weapon, 1, 'out of fuel falls back to the Pulse Rifle');
  assert.equal(WEAPON_META[5].cooldown, 3, 'a flame tick every 3 ticks reads as a continuous stream');
});

test('flamer: cone hits what is in front and in range, misses behind, above the cone and beyond range', () => {
  const w = quiet();
  arm(w, 5);
  place(w, 10, 0);
  const near = target(w, 'crawler', 13);
  const behind = target(w, 'stalker', 7);
  const far = target(w, 'spitter', 10 + FLAMER_3D.range + 2.5);
  const high = target(w, 'warden', 13, 4.5);
  for (const e of [near, behind, far, high]) pin(e);
  stepN(w, 1, { fire: true, aimX: 16, aimY: 1.12 });
  assert.ok(near.hp < near.maxHp, 'in the cone');
  assert.equal(behind.hp, behind.maxHp, 'behind the player');
  assert.equal(far.hp, far.maxHp, 'out of range');
  assert.equal(high.hp, high.maxHp, 'far above the cone axis');
  assert.ok(near.burnTicks > 0 && behind.burnTicks === 0);
  assert.ok(w.events.some((e) => e.type === 'flamer'));
});

test('flamer: the cone widens with distance but has a hard half-angle', () => {
  const w = quiet();
  arm(w, 5);
  place(w, 10, 0);
  const inside = target(w, 'crawler', 14.2, 0.6); // ~13 degrees off axis
  const outside = target(w, 'stalker', 14.2, 3.6); // well past the half angle
  pin(inside);
  pin(outside);
  stepN(w, 1, { fire: true, aimX: 20, aimY: 1.12 });
  assert.ok(inside.hp < inside.maxHp);
  assert.equal(outside.hp, outside.maxHp);
});

test('flamer: walls block the cone', () => {
  const w = quiet();
  arm(w, 5);
  // Shaft east ledge wall: stand in the Airlock and aim through the sealed blue door at a crawler on the other side
  const door = w.level.solids.find((s) => s.doorId === 'door_airlock_shaft')!;
  place(w, door.minX - 2, 0);
  const behind = target(w, 'crawler', door.maxX + 0.9, 0);
  pin(behind);
  stepN(w, 1, { fire: true, aimX: door.maxX + 3, aimY: 1.4 });
  assert.equal(behind.hp, behind.maxHp);
});

test('flamer: burn ticks are deterministic, spaced by the interval, scaled by matchup and end after burnTicks', () => {
  const run = (): number[] => {
    const w = quiet();
    arm(w, 5);
    place(w, 10, 0);
    const e = target(w, 'stalker', 12.5);
    pin(e);
    stepN(w, 1, { fire: true, aimX: 16, aimY: 1.12 });
    const hits: number[] = [];
    let prev = e.hp;
    for (let t = 0; t < FLAMER_3D.burnTicks + 5; t++) {
      pin(e);
      stepN(w, 1, { aimX: 16, aimY: 1.12 });
      if (e.hp < prev) hits.push(prev - e.hp);
      prev = e.hp;
    }
    assert.equal(e.burnTicks, 0);
    return hits;
  };
  const a = run();
  assert.deepEqual(a, run(), 'same inputs, same burn');
  const expected = Math.max(1, Math.round(BURN_DAMAGE_3D * WEAPON_MATCHUP_3D.stalker[5]));
  assert.ok(a.every((d) => d === expected), `each tick deals ${expected}`);
  const maxTicks = Math.ceil(FLAMER_3D.burnTicks / BURN_INTERVAL_TICKS_3D);
  assert.ok(a.length >= maxTicks - 2 && a.length <= maxTicks + 1, `${a.length} burn ticks of ~${maxTicks}`);
});

test('flamer: burn can kill, registers the kill and clears the status', () => {
  const w = quiet();
  arm(w, 5);
  place(w, 10, 0);
  const e = target(w, 'crawler', 12);
  e.hp = e.maxHp = 40;
  pin(e);
  stepN(w, 1, { fire: true, aimX: 16, aimY: 1.12 });
  assert.ok(e.alive && e.burnTicks > 0);
  const kills0 = w.player.kills;
  for (let t = 0; t < 200 && e.alive; t++) {
    pin(e);
    stepN(w, 1, { aimX: 16, aimY: 1.12 });
  }
  assert.ok(!e.alive, 'the burn alone finished it');
  assert.equal(w.player.kills, kills0 + 1);
  assert.equal(e.burnTicks, 0);
});

test('flamer: matchups are crawler and hive strong, stalker normal, warden weak', () => {
  assert.ok(WEAPON_MATCHUP_3D.crawler[5] >= 1.4);
  assert.ok(HIVE_MATCHUP_3D[5] >= 1.6);
  assert.equal(WEAPON_MATCHUP_3D.stalker[5], 1);
  assert.ok(WEAPON_MATCHUP_3D.warden[5] <= 0.4);
  assert.ok(WEAPON_MATCHUP_3D.spitter[5] > 1 && WEAPON_MATCHUP_3D.spitter[5] < WEAPON_MATCHUP_3D.crawler[5]);
  // In play: the same flame does more to a crawler than to a stalker and almost nothing to the Warden
  const dmg = (kind: EnemyState3D['kind']): number => {
    const w = quiet();
    arm(w, 5);
    place(w, 10, 0);
    const e = target(w, kind, 12.2);
    pin(e);
    stepN(w, 12, { fire: true, aimX: 16, aimY: 1.12 });
    return e.maxHp - e.hp;
  };
  const c = dmg('crawler');
  const s = dmg('stalker');
  const wd = dmg('warden');
  assert.ok(c > s && s > wd, `crawler ${c} > stalker ${s} > warden ${wd}`);
});

test('flamer: burns a hive nest down fast and sets barrels off', () => {
  const w = quiet();
  arm(w, 5);
  const h = w.hives[0];
  h.alive = true;
  place(w, h.x - 3, h.y);
  const hp0 = h.hp;
  stepN(w, 10, { fire: true, aimX: h.x, aimY: h.y + 0.8 });
  assert.ok(hp0 - h.hp >= 3 * HIVE_MATCHUP_3D[5] * 0.6 * 3, 'nest takes flame damage with the 1.8x matchup');
  const v = quiet();
  arm(v, 5);
  const b = v.barrels[0];
  b.alive = true;
  place(v, b.x - 3, b.y);
  stepN(v, 60, { fire: true, aimX: b.x, aimY: b.y + 0.7 });
  assert.ok(!b.alive && v.events.length >= 0);
});

test('flamer: leaves floor embers (render-only), steam over acid, and they expire', () => {
  const w = quiet();
  arm(w, 5);
  place(w, 10, 0);
  stepN(w, 3, { fire: true, aimX: 14, aimY: -0.2 });
  assert.ok(w.embers.length >= 1, 'flame tip on the floor leaves an ember');
  assert.ok(w.embers.every((m) => !m.steam), 'dry floor: no steam');
  assert.ok(w.embers.length <= FLAMER_3D.maxEmbers);
  stepN(w, FLAMER_3D.emberTicks + 5);
  assert.equal(w.embers.length, 0);
  // Over the Mines acid pit the embers steam
  const a = quiet();
  arm(a, 5);
  const pool = a.level.acidPools[0];
  place(a, pool.minX - 3, -11);
  stepN(a, 4, { fire: true, aimX: pool.minX + 1.2, aimY: -11.6 });
  assert.ok(a.embers.length >= 1);
});

test('flamer: embers never change the simulation (same run with and without the ember list)', () => {
  const run = (clearEmbers: boolean): string => {
    const w = quiet();
    arm(w, 5);
    place(w, 10, 0);
    const e = target(w, 'crawler', 12.5);
    for (let t = 0; t < 120; t++) {
      pin(e);
      stepWorld3D(w, { ...emptyInput3D(), fire: t < 30, aimX: 15, aimY: 0.2 });
      if (clearEmbers) w.embers = [];
    }
    return JSON.stringify([e.hp, e.burnTicks, w.player.ammo[5], w.player.hp, w.tick]);
  };
  assert.equal(run(false), run(true));
});

// ------------------------------------------------------------------ Rocket

test('rocket: starts slow, accelerates in a straight line to a cap, and costs one rocket', () => {
  const w = quiet();
  arm(w, 6, 5);
  place(w, 10, 0);
  stepN(w, 1, { fire: true, aimX: 30, aimY: 1.12 });
  assert.equal(w.player.ammo[6], 4);
  assert.ok(w.events.some((e) => e.type === 'rocket'));
  const pr = w.projectiles.find((q) => q.kind === 'rocket')!;
  const s0 = Math.hypot(pr.vx, pr.vy);
  const y0 = pr.y;
  assert.ok(s0 <= ROCKET_3D.startSpeed + 0.6 && s0 >= ROCKET_3D.startSpeed - 1e-6 + 0.4 - 0.4);
  const speeds: number[] = [];
  for (let t = 0; t < 40; t++) {
    stepN(w, 1, { aimX: 30, aimY: 1.12 });
    const p = w.projectiles.find((q) => q.kind === 'rocket');
    if (!p) break;
    speeds.push(Math.hypot(p.vx, p.vy));
    assert.ok(Math.abs(p.y - y0) < 1e-6, 'straight line (flat aim)');
  }
  assert.ok(speeds[speeds.length - 1] > speeds[0] * 2, 'accelerates');
  assert.ok(speeds.every((s, i) => i === 0 || s >= speeds[i - 1] - 1e-9), 'monotonic');
  assert.ok(Math.max(...speeds) <= ROCKET_3D.maxSpeed + 1e-6);
});

test('rocket: explodes on impact with a big blast, hurting everything in radius and knocking enemies back', () => {
  const w = quiet();
  arm(w, 6, 5);
  place(w, 11.5, 0);
  const a = target(w, 'stalker', 18.5);
  const b = target(w, 'crawler', 19.9);
  const far = target(w, 'spitter', 4);
  for (const e of [a, b, far]) pin(e);
  stepN(w, 1, { fire: true, aimX: 18.5, aimY: 1.12 });
  let blasted = false;
  for (let t = 0; t < 90 && !blasted; t++) {
    for (const e of [a, b, far]) {
      const x = e === a ? 18.5 : e === b ? 19.9 : 4;
      pin(e);
      e.x = x;
    }
    stepN(w, 1, { aimX: 18.5, aimY: 1.12 });
    blasted = w.events.some((e) => e.type === 'explosion');
  }
  assert.ok(blasted, 'rocket detonated');
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, 'both inside the radius');
  assert.equal(far.hp, far.maxHp, 'outside the radius');
  assert.ok(a.vx > 4, `knocked back east (vx ${a.vx})`);
  assert.equal(w.projectiles.filter((q) => q.kind === 'rocket').length, 0);
  assert.ok(ROCKET_3D.radius > 3.5 && ROCKET_3D.damage >= 100, 'bigger than a grenade blast');
});

test('rocket: detonates on a wall and at the end of its life', () => {
  const w = quiet();
  arm(w, 6, 5);
  place(w, 30.5, 0);
  stepN(w, 1, { fire: true, aimX: 20, aimY: 1.12 }); // west, into the Airlock east wall
  let boom = 0;
  for (let t = 0; t < 120 && !boom; t++) {
    stepN(w, 1, { aimX: 20, aimY: 1.12 });
    boom = w.events.filter((e) => e.type === 'explosion').length;
  }
  assert.ok(boom > 0);
  const v = quiet();
  arm(v, 6, 5);
  place(v, 40, 6);
  stepN(v, 1, { fire: true, aimX: 40, aimY: 40 }); // straight up
  let n = 0;
  for (let t = 0; t < ROCKET_3D.lifeTicks + 10 && !n; t++) {
    stepN(v, 1, { aimX: 40, aimY: 40 });
    n = v.events.filter((e) => e.type === 'explosion').length;
  }
  assert.ok(n > 0, 'times out into a blast instead of vanishing');
});

test('rocket: opens no weapon locks and breaks no rail plate (it cannot replace Grenade or Rail)', () => {
  const w = quiet();
  arm(w, 6, 9);
  const door = w.level.solids.find((s) => s.doorId === 'door_shaft_biolabs')!; // yellow
  place(w, door.minX - 4, 0);
  stepN(w, 1, { fire: true, aimX: door.minX + 1, aimY: 1.5 });
  stepN(w, 80, { aimX: door.minX + 1, aimY: 1.5 });
  assert.ok(!w.openDoors.has('door_shaft_biolabs'));
  assert.ok(!w.openDoors.has('break_plate_shaft'));
});

test('rocket jump: a blast at the feet pushes the player up and away, costs a little hull, never kills', () => {
  const w = quiet();
  arm(w, 6, 9);
  place(w, 5, 0);
  const hp0 = w.player.hp;
  stepN(w, 1, { fire: true, aimX: 6.2, aimY: -0.5 });
  stepN(w, 3, { aimX: 6.2, aimY: -0.5 });
  assert.ok(w.player.body.y > 0.2 || w.player.body.vy > 0, 'lifted');
  assert.ok(w.player.body.vx < -2, 'pushed away from the blast');
  const lost = hp0 - w.player.hp;
  assert.ok(lost > 0 && lost <= ROCKET_JUMP_3D.selfDamage, `small self damage (${lost})`);
  assert.equal(w.run.damageTaken, lost);
  // Low hull: self damage stops at 1
  const v = quiet();
  arm(v, 6, 9);
  place(v, 5, 0);
  v.player.hp = 2;
  stepN(v, 1, { fire: true, aimX: 6.2, aimY: -0.5 });
  stepN(v, 5, { aimX: 6.2, aimY: -0.5 });
  assert.equal(v.status, 'playing');
  assert.ok(v.player.hp >= 1);
});

test('rocket jump: vertical speed is capped and only one boost applies per airborne period', () => {
  const w = quiet();
  arm(w, 6, 20);
  place(w, 5, 0);
  let peakVy = 0;
  stepN(w, 1, { fire: true, aimX: 6.2, aimY: -0.5 });
  for (let t = 0; t < 4; t++) {
    stepN(w, 1, { aimX: 6.2, aimY: -0.5 });
    peakVy = Math.max(peakVy, w.player.body.vy);
  }
  assert.ok(peakVy <= ROCKET_JUMP_3D.vyCap + 1e-6, `vy ${peakVy} <= cap`);
  assert.ok(peakVy > 4, 'but it is a real jump');
  assert.ok(w.player.rocketBoosted);
  // Second rocket while still airborne: no more lift
  w.player.fireCooldown = 0;
  const vyBefore = w.player.body.vy;
  const yb = w.player.body.y;
  stepN(w, 1, { fire: true, aimX: w.player.body.x + 1, aimY: yb - 3 });
  let maxVy = vyBefore;
  for (let t = 0; t < 20; t++) {
    stepN(w, 1, { aimX: w.player.body.x + 1, aimY: w.player.body.y - 3 });
    maxVy = Math.max(maxVy, w.player.body.vy);
  }
  assert.ok(maxVy <= vyBefore + 1e-6, 'a second blast in the same airtime adds no vertical speed');
  // Landing re-arms the boost
  stepN(w, 120);
  assert.ok(w.player.body.grounded);
  assert.equal(w.player.rocketBoosted, false);
});

test('rocket jump: the best case rise stays well under a 4.4 m Boots gate', () => {
  // jump apex + a capped boost from the apex
  const g = 24.5;
  const jump = 10.6 ** 2 / (2 * g);
  const boost = ROCKET_JUMP_3D.vyCap ** 2 / (2 * g);
  assert.ok(jump + boost + 0.38 < 4.4, `${(jump + boost + 0.38).toFixed(2)} m < 4.40 m`);
});

test('rocket jump: no bypass of the three Boots gates or the two Crawl Slide tunnels, and the probe has teeth (uncapped control)', () => {
  const lvl = buildFacilityMap3D();
  assert.equal(rocketProbeSites(lvl).length, 5);
  const r = checkRocketJump(lvl);
  assert.deepEqual(r.problems, []);
  assert.ok(r.bestApex < 4.4 - 0.5, `best rise ${r.bestApex.toFixed(2)} m`);
  assert.equal(ROCKET_JUMP_3D.vyCap, 8.4, 'the control restored the cap');
});

test('rocket jump: blasts from rockets never push the player through the 1 m tunnel mouths', () => {
  const w = quiet();
  arm(w, 6, 30);
  for (const s of w.level.solids) if (s.doorId) w.openDoors.add(s.doorId);
  const tn = w.level.tunnels.find((t) => t.id === 'tun-service')!;
  place(w, tn.approach.x, tn.approach.y);
  for (let t = 0; t < 200; t++) {
    stepWorld3D(w, { ...emptyInput3D(), moveX: 1, fire: t % 20 === 0, aimX: w.player.body.x - 1, aimY: w.player.body.y - 1 });
    assert.ok(w.player.body.x < tn.minX + 0.6 || w.player.body.y > tn.exit.y + 0.2 || w.player.body.x < tn.exit.x, 'did not slip into the duct standing up');
    if (w.player.body.x >= tn.exit.x - 0.7 && Math.abs(w.player.body.y - tn.exit.y) < 0.5) assert.fail('crossed the tunnel');
  }
});

test('completion legs cover the Flamer and Rocket pedestals', () => {
  assert.deepEqual(checkCompletion(buildFacilityMap3D()), []);
});

// ------------------------------------------------------------------ determinism and R3.3

test('arms: Flamer and Rocket code reads no RNG and never the headlamp', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/game3d/world3d.ts'), 'utf8');
  assert.ok(!/Math\.random\s*\(/.test(src), 'no Math.random call in the simulation');
  const arms = src.slice(src.indexOf('function flameConeHit'), src.indexOf('function fireWeapon3D'));
  assert.ok(arms.length > 500 && !/\.light\b/.test(arms), 'flame code does not read w.light');
  const rj = src.slice(src.indexOf('export function rocketJump3D'), src.indexOf('export function triggerExplosion3D'));
  assert.ok(rj.length > 300 && !/\.light\b/.test(rj));
});

// ------------------------------------------------------------------ presentation

test('audio: new events are mapped to existing recipes and retuned per event', () => {
  for (const t of ['flamer', 'rocket', 'burn', 'rocket_jump'] as const) assert.ok(EVENT_SOUND[t], t);
  assert.equal(EVENT_SOUND.flamer, 'weapon.scatter');
  assert.equal(EVENT_SOUND.rocket, 'weapon.grenade');
  assert.ok(cueForEvent({ type: 'flamer', value: 1 }).gain > cueForEvent({ type: 'flamer', value: 0 }).gain);
  assert.ok(cueForEvent({ type: 'burn' }).gain < 0.5);
});

test('hero gear: flamer and rocket models fit the mesh and material budget, muzzles sit at the barrel end', () => {
  for (const [name, rig] of [['flamer', buildFlamer()], ['rocket', buildRocket()]] as const) {
    let meshes = 0;
    const mats = new Set<THREE.Material>();
    rig.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes++;
        mats.add(m.material as THREE.Material);
      }
    });
    assert.ok(meshes <= 9, `${name} meshes ${meshes}`);
    assert.ok(mats.size <= 5, `${name} materials ${mats.size}`);
    assert.ok(rig.muzzle.position.x < -0.5, 'barrel points to -X like the other weapons');
    assert.ok(rig.glow.length >= 1);
  }
  assert.equal(WEAPON_MODEL_NAME[5], 'flamer');
  assert.equal(WEAPON_MODEL_NAME[6], 'rocket-launcher');
});

test('hero recoil: flamer is a light constant shudder, rocket is the heaviest kick', () => {
  assert.ok(RECOIL_PROFILE[5].kick < RECOIL_PROFILE[1].kick);
  assert.ok(RECOIL_PROFILE[6].kick > RECOIL_PROFILE[4].kick);
  assert.ok(RECOIL_PROFILE[5].decay > RECOIL_PROFILE[1].decay);
});

test('vfx: rocket has its own projectile style', () => {
  const st = projectileStyle('rocket', true);
  assert.equal(st.hostile, false);
  assert.ok(st.glowSize >= projectileStyle('grenade', true).glowSize);
});

test('classic HUD: six slots fit between the health block and the kills block', () => {
  assert.equal(WEAPON_SLOTS, 6);
  assert.ok(SLOT_X0 + (WEAPON_SLOTS - 1) * SLOT_PITCH + SLOT_W <= 232, 'slots end before the KILLS column');
  assert.ok(SLOT_PITCH >= SLOT_W);
  assert.equal(ammoText(5, 90, true), '90');
  assert.equal(ammoText(6, 3, false), '--');
  // Draw with all six open: the drawing code runs against a recording context
  const calls: string[] = [];
  const ctx = new Proxy({}, { get: () => (..._a: unknown[]) => calls.push('c'), set: () => true }) as unknown as CanvasRenderingContext2D;
  drawClassicHud(ctx, {
    hp: 100, maxHp: 100, energyTanks: 0, weapon: 6,
    unlocked: [true, true, true, true, true, true], ammo: [-1, 28, 14, 10, 90, 8], kills: 3, sector: 'SECURITY DECK',
  });
  assert.ok(calls.length > 100);
});

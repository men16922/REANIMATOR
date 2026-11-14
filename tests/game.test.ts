import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newWorld, update, CORE, EXIT, RULES, type Controls, type World } from '../src/game/world.ts';
import { LIGHT, newLight, tickLight, toggleLight } from '../src/game/light.ts';
import { reachable } from '../tools/game/reach.ts';
import { START } from '../src/game/world.ts';

const idle: Controls = { left: false, right: false, jump: false, fire: false, aimX: 0, aimY: 0, toggleLight: false };
const run = (w: World, n: number, c: (i: number) => Partial<Controls>) => {
  for (let i = 0; i < n; i++) w = update(w, { ...idle, ...c(i) });
  return w;
};

// ---- light: variant-contract boundaries ----
test('light: drains while on and forces off at 0', () => {
  let l = toggleLight(newLight());
  assert.equal(l.on, true);
  for (let i = 0; i < LIGHT.max / LIGHT.drainPerTick; i++) l = tickLight(l);
  assert.equal(l.battery, 0);
  assert.equal(l.on, false);
});
test('light: relight refused below relightMin, allowed at relightMin', () => {
  assert.equal(toggleLight({ on: false, battery: LIGHT.relightMin - 0.01 }).on, false);
  assert.equal(toggleLight({ on: false, battery: LIGHT.relightMin }).on, true);
});
test('light: recharge is capped at max and toggle off always works', () => {
  let l = { on: false, battery: LIGHT.max - 0.1 };
  for (let i = 0; i < 10; i++) l = tickLight(l);
  assert.equal(l.battery, LIGHT.max);
  assert.equal(toggleLight({ on: true, battery: 3 }).on, false);
});
test('light never changes motion, combat, or enemies', () => {
  const script = (i: number): Partial<Controls> => ({ right: i % 40 < 25, jump: i % 30 === 0, fire: i % 7 === 0, aimX: 400, aimY: 180 });
  const a = run(newWorld(), 300, script);
  const b = run(newWorld(), 300, (i) => ({ ...script(i), toggleLight: i % 11 === 0 }));
  const strip = (w: World) => ({ ...w, light: null });
  assert.notDeepEqual(a.light, b.light);
  assert.deepEqual(strip(a), strip(b));
});

// ---- game flow ----
test('update is deterministic and does not mutate its input', () => {
  const w = newWorld(); const copy = structuredClone(w);
  update(w, { ...idle, right: true });
  assert.deepEqual(w, copy);
  assert.deepEqual(run(newWorld(), 120, () => ({ right: true })), run(newWorld(), 120, () => ({ right: true })));
});
test('map: start -> core -> exit reachable with the restored motion engine', () => {
  assert.equal(reachable(START, CORE).ok, true);
  assert.equal(reachable(CORE, EXIT).ok, true);
});
test('core pickup then exit wins; exit without core does not', () => {
  let w = newWorld();
  w = { ...w, player: { ...w.player, x: EXIT.x, y: EXIT.y, gravity: 0 } };
  w = update(w, idle);
  assert.equal(w.phase, 'playing');
  w = { ...w, player: { ...w.player, x: CORE.x, y: CORE.y, gravity: 0 } };
  w = update(w, idle);
  assert.equal(w.hasCore, true);
  w = { ...w, player: { ...w.player, x: EXIT.x, y: EXIT.y, gravity: 0 } };
  w = update(w, idle);
  assert.equal(w.phase, 'won');
});
test('contact damage with invulnerability, death ends the run, lost world is frozen', () => {
  let w = newWorld();
  const k = w.crawlers[0];
  w = { ...w, hp: RULES.contactDamage, crawlers: [{ ...k, x: w.player.x, y: w.player.y }] };
  w = run(w, 40, () => ({}));
  assert.equal(w.phase, 'lost');
  assert.equal(w.hp, 0);
  assert.deepEqual(update(w, { ...idle, right: true }), w);
});
test('fire delay limits shots and bullets kill a crawler', () => {
  let w = newWorld();
  const k = w.crawlers[0];
  w = { ...w, crawlers: [{ ...k, x: w.player.x + 60, y: w.player.y, dir: 1 }] };
  const n = 30;
  w = run(w, n, () => ({ fire: true, aimX: w.player.x + 60, aimY: w.player.y - 8 }));
  assert.ok(w.shots <= Math.ceil(n / RULES.fireDelay) + 1);
  assert.equal(w.kills, 1);
});
test('restart produces a fresh world', () => {
  const w = run(newWorld(), 50, () => ({ right: true, toggleLight: true }));
  assert.notDeepEqual(w, newWorld());
  assert.deepEqual(newWorld(), newWorld());
});

// ---- upgraded combat, enemies, meds, hazards ----
test('altFire rail-slug pierces multiple crawlers, staggers, and enforces cooldown', () => {
  let w = newWorld();
  const base = w.crawlers[0];
  w = {
    ...w,
    crawlers: [
      { ...base, id: 0, x: w.player.x + 60, y: w.player.y, hp: 30, dormant: false },
      { ...base, id: 1, x: w.player.x + 95, y: w.player.y, hp: 30, dormant: false },
    ],
    spitters: [],
    warden: null,
  };
  w = update(w, { ...idle, altFire: true, aimX: w.player.x + 120, aimY: w.player.y - 10 });
  assert.equal(w.railShots, 1);
  assert.equal(w.railCooldown, RULES.railCooldown);
  w = run(w, 8, () => ({}));
  assert.equal(w.kills, 2);
  assert.equal(w.crawlers[0].hp, 0);
  assert.equal(w.crawlers[1].hp, 0);
  // Attempting immediate altFire during cooldown is blocked
  const before = w.railShots;
  w = update(w, { ...idle, altFire: true, aimX: w.player.x + 120, aimY: w.player.y - 10 });
  assert.equal(w.railShots, before);
});

test('spitter charges and fires enemyBullets with line of sight', () => {
  let w = newWorld();
  const sp = w.spitters[0];
  w = {
    ...w,
    crawlers: [],
    warden: null,
    spitters: [{ ...sp, x: w.player.x + 100, y: w.player.y - 16, baseY: w.player.y - 16, cooldown: 0, charge: 0, dormant: false }],
  };
  w = run(w, RULES.spitterChargeTicks + 2, () => ({}));
  assert.ok(w.enemyBullets.length >= 1, 'spitter should have fired at least one projectile');
});

test('warden takes stagger on rail-slug hit and fires multi-orb burst', () => {
  let w = newWorld();
  assert.ok(w.warden !== null);
  w = {
    ...w,
    crawlers: [],
    spitters: [],
    warden: { ...w.warden!, x: w.player.x + 90, y: w.player.y, cooldown: 0, charge: 0 },
  };
  const hp0 = w.warden!.hp;
  w = update(w, { ...idle, altFire: true, aimX: w.player.x + 90, aimY: w.player.y - 18 });
  w = run(w, 6, () => ({}));
  assert.equal(w.warden!.hp, hp0 - RULES.railDamage);
  assert.ok(w.warden!.stagger > 0, 'rail-slug should stagger warden');
  w = run(w, RULES.wardenChargeTicks + 12, () => ({}));
  assert.ok(w.enemyBullets.length >= 3, 'warden burst fires 3 plasma orbs');
});

test('med-station heals capped at max hp and is single-use; full hp ignores it', () => {
  let w = newWorld();
  const m = w.meds[0];
  w = { ...w, player: { ...w.player, x: m.x, y: m.y, gravity: 0 }, hp: 100 };
  w = update(w, idle);
  assert.equal(w.meds[0].used, false);
  w = { ...w, hp: 60 };
  w = update(w, idle);
  assert.equal(w.meds[0].used, true);
  assert.equal(w.hp, 60 + RULES.medHeal);
  assert.equal(w.medsUsed, 1);
  // Touching again does not heal further
  w = { ...w, hp: 50 };
  w = update(w, idle);
  assert.equal(w.hp, 50);
});

test('light remains completely isolated from combat, spitters, warden, meds, and hazards (R3.3)', () => {
  const script = (i: number): Partial<Controls> => ({
    right: i % 50 < 30,
    jump: i % 25 === 0,
    fire: i % 6 === 0,
    altFire: i % 24 === 0,
    aimX: 600,
    aimY: 480,
  });
  const a = run(newWorld(), 400, script);
  const b = run(newWorld(), 400, (i) => ({ ...script(i), toggleLight: i % 9 === 0 }));
  const strip = (w: World) => ({ ...w, light: null });
  assert.notDeepEqual(a.light, b.light);
  assert.deepEqual(strip(a), strip(b));
});

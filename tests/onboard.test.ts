// R12 onboarding: the first airlock encounter is one-on-one, softer and readable; a defeat before any save is resumable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInput3D, newWorld3D, respawnPlayer3D, stepWorld3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { Onboarding } from '../src/ui/flow.ts';

const foe = (w: WorldState3D, id: string) => w.enemies.find((e) => e.id === id)!;

function idleRun(ticks: number, difficulty: 'normal' | 'hard' = 'normal') {
  const w = newWorld3D({ difficulty });
  let firstLungeTick = -1;
  for (let i = 0; i < ticks && w.status === 'playing'; i++) {
    stepWorld3D(w, emptyInput3D());
    if (firstLungeTick < 0 && w.enemies.some((e) => e.zone === 'airlock' && e.state === 'attack')) firstLungeTick = w.tick;
  }
  return { w, firstLungeTick };
}

test('first crawler is alone: the second crawler and the dropper sleep while it lives', () => {
  const w = newWorld3D();
  for (let i = 0; i < 600; i++) stepWorld3D(w, emptyInput3D());
  assert.equal(foe(w, 'e-airlock-2').active, false);
  assert.equal(foe(w, 'e-drop-airlock').active, false);
  assert.equal(foe(w, 'e-airlock-1').active, true);
});

test('hold ends when the first crawler dies, and on Hard it never applies', () => {
  const w = newWorld3D();
  foe(w, 'e-airlock-1').alive = false;
  for (let i = 0; i < 5; i++) stepWorld3D(w, emptyInput3D());
  assert.equal(foe(w, 'e-airlock-2').active, true);
  const h = newWorld3D({ difficulty: 'hard' });
  for (let i = 0; i < 5; i++) stepWorld3D(h, emptyInput3D());
  assert.equal(foe(h, 'e-airlock-2').active, true);
});

test('a player who stands still survives the first 20 s of a Normal run, and the first lunge is telegraphed', () => {
  const { w, firstLungeTick } = idleRun(1200);
  assert.equal(w.status, 'playing', `died at tick ${w.tick}`);
  assert.ok(firstLungeTick > 100, `first lunge at tick ${firstLungeTick}`);
});

test('defeat before any Save station is resumable and calms the foes near the spawn', () => {
  const w = newWorld3D();
  for (let i = 0; i < 120; i++) stepWorld3D(w, emptyInput3D());
  w.status = 'lost';
  respawnPlayer3D(w);
  assert.equal(w.status, 'playing');
  assert.equal(w.player.body.x, w.level.spawn.x);
  assert.equal(foe(w, 'e-airlock-1').state, 'patrol');
});

test('counter hint offers dash until the player has dashed', () => {
  const w = newWorld3D();
  const e = foe(w, 'e-airlock-1');
  e.active = true; e.state = 'windup';
  e.x = w.player.body.x + 2; e.y = w.player.body.y;
  w.tick = 100;
  const o = new Onboarding();
  assert.deepEqual(o.update(w)?.keys, ['X', 'SHIFT']);
  o.observe({ moveX: 0, jump: false, fire: false, dash: true, toggleLight: false, weaponSlot: 0 });
  assert.deepEqual(o.update(w)?.keys, ['X']);
});

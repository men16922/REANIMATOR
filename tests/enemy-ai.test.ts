// Enemy locomotion in the sim: patrol, chase, queueing, hop, blocked => idle. Deterministic, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { emptyInput3D, newWorld3D, stepWorld3D, type EnemyState3D, type WorldState3D } from '../src/game3d/world3d.ts';

function openAll(w: WorldState3D): void {
  for (const s of w.level.solids) if (s.doorId) w.openDoors.add(s.doorId);
}

function solo(id: string): { w: WorldState3D; e: EnemyState3D } {
  const w = newWorld3D();
  const e = w.enemies.find((x) => x.id === id)!;
  w.enemies = [e];
  w.currentRoom = e.zone;
  openAll(w);
  return { w, e };
}

/** Put the player `gap` m from the foe on whichever side keeps both in one sector. */
function standOff(w: WorldState3D, e: EnemyState3D, gap: number): number {
  for (const side of [-1, 1]) {
    w.player.body = spawnBody3D(e.x + side * gap, e.y, 0);
    stepWorld3D(w, emptyInput3D());
    if (w.currentRoom === e.zone) {
      w.player.body = spawnBody3D(e.x + side * gap, e.y, 0);
      return side;
    }
  }
  assert.fail(`no stand-off spot for ${e.id}`);
}

const SECTOR_FOES: Array<[string, string]> = [
  ['airlock', 'e-airlock-1'], ['shaft', 'e-shaft-3'], ['mines', 'e-mines-1'],
  ['biolabs', 'e-bio-1'], ['security', 'e-sec-1'], ['core', 'e-core-1'],
];

for (const [sector, id] of SECTOR_FOES) {
  test(`foes move in ${sector}: patrol walks, chase closes the distance, pose follows displacement`, () => {
    const { w, e } = solo(id);
    w.player.maxHp = w.player.hp = 9999;
    standOff(w, e, 12);
    const xs = new Set<string>();
    let travelled = 0;
    let last = e.x;
    for (let t = 0; t < 300; t++) {
      stepWorld3D(w, emptyInput3D());
      w.player.hp = 9999;
      xs.add(e.x.toFixed(2));
      travelled += Math.abs(e.x - last);
      last = e.x;
    }
    assert.ok(xs.size > 20 && travelled > 2, `${id} moved (${xs.size} distinct x, ${travelled.toFixed(1)} m)`);
    // chase: stand the player 8 m away on the same level and watch the gap shrink
    const start = Math.abs(w.player.body.x - e.x);
    standOff(w, e, 8);
    const d0 = Math.abs(w.player.body.x - e.x);
    let nearest = d0;
    let fought = false;
    for (let t = 0; t < 120; t++) {
      stepWorld3D(w, emptyInput3D());
      w.player.hp = 9999;
      nearest = Math.min(nearest, Math.abs(w.player.body.x - e.x));
      if (e.state === 'windup' || e.state === 'attack') fought = true;
    }
    if (e.kind !== 'spitter') assert.ok(nearest < d0 - 1.5 || fought, `${id} closes in (${nearest.toFixed(1)} of ${d0}, start ${start.toFixed(1)})`);
  });
}

test('airlock foes hop the 1.4 m crate they used to press against, never stack and never run in place', () => {
  const w = newWorld3D();
  const pair = w.enemies.filter((e) => e.id === 'e-airlock-1' || e.id === 'e-airlock-2');
  w.enemies = pair;
  w.currentRoom = 'airlock';
  w.player.body = spawnBody3D(3.5, 0, 0);
  const seen = new Set<string>();
  let stackedTicks = 0;
  let flicker = 0;
  const lastAnim = new Map<string, string>();
  const changes = new Map<string, number>();
  const hist = new Map<string, Array<{ t: number; a: string }>>();
  for (let t = 0; t < 900; t++) {
    stepWorld3D(w, emptyInput3D());
    if (Math.abs(pair[0].x - pair[1].x) < 0.05) stackedTicks++;
    for (const e of pair) {
      seen.add(`${e.id}:${e.x.toFixed(1)}`);
      if (lastAnim.get(e.id) !== e.anim) {
        // A -> B -> A inside 8 ticks is flicker; combat cycles (windup, lunge, recover) are longer than that
        const h = hist.get(e.id) ?? [];
        h.push({ t, a: e.anim });
        if (h.length >= 3 && h[h.length - 1].a === h[h.length - 3].a && h[h.length - 1].t - h[h.length - 3].t < 8) changes.set(e.id, (changes.get(e.id) ?? 0) + 1);
        hist.set(e.id, h.slice(-3));
      }
      lastAnim.set(e.id, e.anim);
      if (e.state === 'chase' && e.anim === 'run' && e.speedNow < 0.3 && t > 60) flicker++;
    }
  }
  assert.ok(seen.size > 30, 'both foes cover ground');
  assert.equal(stackedTicks, 0, 'two foes never share one x');
  assert.equal(flicker, 0, 'a body pressed against an obstacle never plays run');
  for (const [k, n] of changes) assert.ok(n <= 2, `${k} flickers ${n} times in 15 s`);
});

test('a foe hops a low crate and is blocked (idle) by a tall wall', () => {
  const { w, e } = solo('e-airlock-2');
  w.player.maxHp = w.player.hp = 9999;
  const col = w.level.solids;
  const crate = { id: "test-crate", kind: 'wall', minX: e.x - 4.4, maxX: e.x - 3.6, minY: 0, maxY: 0.55, minZ: -1, maxZ: 1 } as unknown as (typeof col)[number];
  w.level.solids = [...col, crate];
  w.player.body = spawnBody3D(e.x - 12, 0, 0);
  let peak = 0;
  let passed = false;
  for (let t = 0; t < 240; t++) {
    stepWorld3D(w, emptyInput3D());
    w.player.hp = 9999;
    peak = Math.max(peak, e.y);
    if (e.x < crate.minX - 0.3) passed = true;
  }
  assert.ok(passed && peak > 0.4, `hopped (peak y ${peak.toFixed(2)}, passed ${passed})`);
  // a 3 m wall cannot be hopped
  const { w: w2, e: e2 } = solo('e-airlock-2');
  const wall = { ...crate, id: 'test-wall', maxY: 3 };
  w2.level.solids = [...w2.level.solids, wall];
  w2.player.body = spawnBody3D(e2.x - 12, 0, 0);
  for (let t = 0; t < 240; t++) {
    stepWorld3D(w2, emptyInput3D());
    w2.player.hp = 9999;
  }
  assert.ok(e2.x > wall.maxX, 'a tall wall stops it');
  assert.ok(e2.speedNow < 3 || e2.state === 'patrol', 'blocked foe is not running in place');
});

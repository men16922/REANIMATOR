// Round 9 (Abuse feel): fake-wall secret (Vault Nook), pickup magnet, chunky pickup cues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { createBot3D } from '../src/game3d/bot3d.ts';
import {
  LEAN_TICKS_3D,
  MAGNET_RANGE_3D,
  emptyInput3D,
  newWorld3D,
  roomAt3D,
  stepWorld3D,
  type InputState3D,
  type WorldState3D,
} from '../src/game3d/world3d.ts';
import { cueForEvent } from '../src/ui/audioLogic.ts';
import { SOUND_BANK } from '../src/ui/soundBank.ts';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';

function stepN(w: WorldState3D, n: number, inp: Partial<InputState3D> = {}): void {
  for (let i = 0; i < n; i++) stepWorld3D(w, { ...emptyInput3D(), ...inp });
}
function place(w: WorldState3D, x: number, y: number): void {
  w.player.body = spawnBody3D(x, y, 0);
  w.currentRoom = 'security';
}

test('nook: the fake wall is solid until leaned on, then opens, counts as a secret and pays out', () => {
  const w = newWorld3D();
  const wall = w.level.solids.find((s) => s.breakBy === 'lean')!;
  assert.equal(wall.breakId, 'break_lean_security');
  assert.equal(w.level.secrets.find((s) => s.id === 'secret_vault_nook')?.doorId, wall.breakId);
  const total = w.completion.total;
  w.enemies = []; // the wall climber that guards the nook is covered by tests/foes.test.ts
  place(w, 69.1, 10.8); // already against the wall (the body stops at x 69.18)
  // Standing still next to it does nothing
  stepN(w, 60);
  assert.equal(w.openDoors.has(wall.breakId!), false);
  // Leaning for LEAN_TICKS opens it
  stepN(w, LEAN_TICKS_3D - 2, { moveX: 1 });
  assert.equal(w.openDoors.has(wall.breakId!), false, 'not yet');
  stepN(w, 3, { moveX: 1 });
  assert.ok(w.openDoors.has(wall.breakId!));
  assert.deepEqual(w.secretsFound, ['secret_vault_nook']);
  stepN(w, 1);
  assert.equal(w.completion.secretsFound, 1);
  assert.equal(w.completion.total, total);
  assert.equal(w.level.secrets.length, 5);
  // Walk in and take the cache
  w.player.hp = 10;
  w.player.ammo[2] = 0;
  stepN(w, 140, { moveX: 1 });
  assert.ok(w.player.body.x > 72, `entered the nook, x=${w.player.body.x}`);
  assert.equal(w.pickups.filter((p) => p.id.startsWith('cache-') && p.taken).length, 3);
  assert.ok(w.player.ammo[2] > 0 && w.player.hp > 10);
});

test('nook: the sill is reachable from the Security Deck floor with one plain jump (no boots)', () => {
  let best = 0;
  for (let startX = 60; startX <= 66; startX += 0.5) {
    for (let jumpAt = 0; jumpAt < 40; jumpAt += 2) {
      const w = newWorld3D();
      place(w, startX, 8.8);
      w.player.hp = w.player.maxHp = 9999;
      for (let t = 0; t < 120; t++) {
        stepWorld3D(w, { ...emptyInput3D(), moveX: 1, jump: t >= jumpAt && t < jumpAt + 14 });
        best = Math.max(best, w.player.body.grounded ? w.player.body.y : 0);
      }
    }
  }
  assert.ok(best >= 10.7, `a jump chain reaches the 10.8 sill, got ${best}`);
});

test('nook: every cache sits on the pocket floor, inside the walls, clear of the Core arena below', () => {
  const level = buildFacilityMap3D();
  assert.equal(level.caches.length, 3);
  for (const c of level.caches) {
    assert.ok(c.x > 70.8 && c.x < 78, `${c.id} x`);
    assert.equal(c.y, 10.8);
    assert.equal(roomAt3D(level, c.x, c.y + 0.9), null, 'the pocket lies outside every room rectangle, so the sector card never flips');
  }
});

test('magnet: a dropped ammo pack drifts to the player, a med pack only when badly hurt; placed pickups stay put', () => {
  const w = newWorld3D();
  place(w, 20, 0);
  w.currentRoom = 'airlock';
  w.pickups.push({ id: 'drop-a', kind: 'ammo', value: 8, x: 20 + MAGNET_RANGE_3D - 0.5, y: 0, z: 0, taken: false });
  w.pickups.push({ id: 'drop-m', kind: 'med', value: 18, x: 20 - MAGNET_RANGE_3D + 0.5, y: 0, z: 0, taken: false });
  w.player.hp = w.player.maxHp;
  const ammoBefore = w.player.ammo[2];
  const x0 = w.pickups.find((p) => p.id === 'drop-a')!.x;
  stepN(w, 5);
  const a = w.pickups.find((p) => p.id === 'drop-a')!;
  assert.ok(a.x < x0, 'ammo moved toward the player');
  const m = w.pickups.find((p) => p.id === 'drop-m')!;
  assert.equal(m.x, 20 - MAGNET_RANGE_3D + 0.5, 'full-health player does not pull a med pack');
  stepN(w, 60);
  assert.ok(a.taken && w.player.ammo[2] > ammoBefore);
  assert.equal(m.taken, false);
  w.player.hp = Math.floor(w.player.maxHp * 0.9);
  stepN(w, 20);
  assert.equal(m.x, 20 - MAGNET_RANGE_3D + 0.5, 'a lightly hurt player does not pull it either');
  w.player.hp = 50;
  stepN(w, 60);
  assert.ok(m.taken, 'hurt player pulls and takes it');
  const placed = w.pickups.find((p) => p.id === 'med-airlock')!;
  assert.equal(placed.x, 10.0);
});

test('magnet: out of range pickups do not move and the speed is deterministic', () => {
  const run = (): number => {
    const w = newWorld3D();
    place(w, 20, 0);
    w.pickups.push({ id: 'drop-a', kind: 'ammo', value: 8, x: 20 + MAGNET_RANGE_3D + 1, y: 0, z: 0, taken: false });
    stepN(w, 3);
    const far = w.pickups.find((p) => p.id === 'drop-a')!.x;
    assert.equal(far, 20 + MAGNET_RANGE_3D + 1);
    w.player.body.x = 20 + MAGNET_RANGE_3D;
    stepN(w, 4);
    return w.pickups.find((p) => p.id === 'drop-a')!.x;
  };
  assert.equal(run(), run());
});

test('pickup events carry the kind and map to distinct chunky recipes', () => {
  const w = newWorld3D();
  place(w, 20, 0);
  w.currentRoom = 'airlock';
  w.player.hp = 20;
  w.pickups.push({ id: 'drop-x', kind: 'ammo', value: 8, x: 20, y: 0, z: 0, taken: false });
  w.pickups.push({ id: 'drop-y', kind: 'med', value: 18, x: 20, y: 0, z: 0, taken: false });
  const seen: number[] = [];
  for (let i = 0; i < 4; i++) {
    stepWorld3D(w, emptyInput3D());
    for (const e of w.events) if (e.type === 'pickup') seen.push(e.value ?? -1);
  }
  assert.deepEqual(seen.sort(), [0, 1]);
  const ids = [0, 1, 2].map((v) => cueForEvent({ type: 'pickup', value: v }).id);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) assert.ok(id in SOUND_BANK, id);
});

test('bot still wins with the magnet and the extra secret', () => {
  const w = newWorld3D();
  const bot = createBot3D(w);
  let ticks = 0;
  while (w.status === 'playing' && ticks < 12000) {
    stepWorld3D(w, bot.next(w));
    ticks++;
  }
  assert.equal(w.status, 'won');
  console.log(`bot: ${ticks} ticks, hp ${w.player.hp}/${w.player.maxHp}, kills ${w.player.kills}`);
});

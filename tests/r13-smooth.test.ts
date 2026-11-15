import test from 'node:test';
import assert from 'node:assert/strict';
import { measureJitter } from '../tools/game/enemyJitter.ts';

// R13: floor crawlers and stalkers move continuously in the sim. Before the fix, separateEnemies3D teleported queued
// foes 0.6-0.8 m at closed doors and blast knockback launched them at up to 24 m/s (0.4 m per tick).
for (const d of ['story', 'normal', 'hard'] as const) {
  test(`${d}: bot run has no enemy pop over 0.2 m per tick and almost no chase reversals`, () => {
    const s = measureJitter(d);
    assert.equal(s.status, 'won');
    assert.equal(s.deaths, 0);
    assert.ok(s.samples > 2000, `samples ${s.samples}`);
    assert.equal(s.pops, 0, `pops ${s.pops}, max step ${s.maxStep.toFixed(3)} m`);
    assert.ok(s.maxStep <= 0.2, `max step ${s.maxStep}`);
    // A chase step reversal (left, right, left) reads as a shuffle; the bot run had 30-43 of them before
    assert.ok(s.flips <= 6, `chase flips ${s.flips}`);
    if (d === 'hard') assert.ok(s.minHp >= 80, `hard min HP ${s.minHp}`);
  });
}

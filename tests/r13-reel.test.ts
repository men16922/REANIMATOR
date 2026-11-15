// Judge Reel timeline: order, durations, targets and sectors on the real sim.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyInput3D, newWorld3D, stepWorld3D, type InputState3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { applyDebugSetup } from '../src/ui/demo.ts';
import { captionAlpha, reelBeatAt, reelCutAt, reelCutTime, reelProgress, reelTotalSeconds, REEL_CUTS } from '../src/ui/reel.ts';

function idle(w: WorldState3D): InputState3D {
  return { ...emptyInput3D(), aimX: w.player.body.x + w.player.facing * 8, aimY: w.player.body.y + 1.12 };
}

test('cut order, unique ids and contiguous starts', () => {
  assert.deepEqual(
    REEL_CUTS.map((c) => c.id),
    ['hook', 'classic', 'wake', 'combat', 'hunter', 'warden', 'meltdown', 'endcard'],
  );
  assert.equal(new Set(REEL_CUTS.map((c) => c.id)).size, REEL_CUTS.length);
  let t = 0;
  for (const c of REEL_CUTS) {
    assert.equal(c.start, t, c.id);
    assert.ok(c.duration > 0);
    t += c.duration;
  }
});

test('total is about 90 seconds', () => {
  const total = reelTotalSeconds();
  assert.ok(total >= 88 && total <= 92, `total ${total}`);
});

test('targets and helpers', () => {
  assert.equal(REEL_CUTS[0].target, 'lab');
  assert.equal(REEL_CUTS[REEL_CUTS.length - 1].target, 'endcard');
  assert.equal(reelCutAt(0).id, 'hook');
  assert.equal(reelCutAt(12.01).id, 'classic');
  assert.equal(reelCutAt(9999).id, 'endcard');
  assert.equal(reelProgress(0), 0);
  assert.equal(reelProgress(9999), 1);
  assert.equal(reelCutTime(13), 1);
  assert.equal(captionAlpha(0, 10), 0);
  assert.equal(captionAlpha(5, 10), 1);
  assert.equal(captionAlpha(10, 10), 0);
  const hook = REEL_CUTS[0];
  assert.equal(reelBeatAt(hook, 1).labMode, 'pass');
  assert.equal(reelBeatAt(hook, 7).labMode, 'mutation');
  const cl = REEL_CUTS[1];
  assert.equal(reelBeatAt(cl, 1).view, 'modern');
  assert.equal(reelBeatAt(cl, 4.2).view, 'classic');
  assert.equal(reelBeatAt(cl, 4.2).crt, true);
  assert.equal(reelBeatAt(cl, 6).crt, false);
});

test('every world cut lands in its declared sector after its scripted inputs', () => {
  for (const c of REEL_CUTS) {
    if (c.target !== 'world') continue;
    assert.ok(c.plan && c.sector, c.id);
    let w = newWorld3D();
    applyDebugSetup(w, c.plan.setup);
    for (const f of c.plan.inputs) w = stepWorld3D(w, { ...idle(w), ...f });
    for (let i = 0; i < 30; i++) w = stepWorld3D(w, idle(w));
    assert.equal(w.status, 'playing', `${c.id} status`);
    assert.equal(w.currentRoom, c.sector, `${c.id} sector`);
  }
});

test('hunter cut puts the operative in the hunter zone; warden cut has a live Warden', () => {
  const h = REEL_CUTS.find((c) => c.id === 'hunter')!;
  const w = newWorld3D();
  applyDebugSetup(w, h.plan!.setup);
  const z = w.level.hunterZone;
  assert.ok(w.player.body.x >= z.minX - 8 && w.player.body.x <= z.maxX);
  const b = REEL_CUTS.find((c) => c.id === 'warden')!;
  const w2 = newWorld3D();
  applyDebugSetup(w2, b.plan!.setup);
  assert.ok(w2.enemies.some((e) => e.kind === 'warden' && !e.minion && e.alive));
});

test('end card text, English only, no Math.random', () => {
  const end = REEL_CUTS[REEL_CUTS.length - 1];
  const text = `${end.caption} ${end.sub}`;
  assert.ok(text.includes('Built with Kiro'));
  assert.ok(text.includes('spec-driven'));
  for (const c of REEL_CUTS) assert.ok(/^[\x20-\x7E·]+$/.test(`${c.caption}${c.sub}`), `${c.id} English`);
  assert.ok(!readFileSync(new URL('../src/ui/reel.ts', import.meta.url), 'utf8').includes('Math.random'));
});

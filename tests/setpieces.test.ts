import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MELTDOWN_TOTAL_TICKS, arenaSetPiece, crackPath, debrisPeriodTicks, debrisPerSecond, hatchBeat, meltdownIntensity, vignetteAlpha,
} from '../src/render3d/setpieces3d.ts';
import { MELTDOWN_TICKS, emptyInput3D, newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import { FxDirector } from '../src/render3d/fx3d.ts';

test('meltdown intensity: 0 outside, monotonic rise to 1, pure', () => {
  assert.equal(MELTDOWN_TOTAL_TICKS, MELTDOWN_TICKS);
  assert.equal(meltdownIntensity(-1), 0);
  assert.equal(meltdownIntensity(MELTDOWN_TICKS), 0);
  assert.equal(meltdownIntensity(0), 1);
  let prev = -1;
  for (let t = MELTDOWN_TICKS; t >= 0; t -= 37) {
    const v = meltdownIntensity(t);
    assert.ok(v >= prev - 1e-12 && v >= 0 && v <= 1);
    assert.equal(v, meltdownIntensity(t));
    prev = v;
  }
});

test('vignette and debris escalate with intensity; reduce motion is calmer and steady', () => {
  assert.equal(vignetteAlpha(0, 1, false), 0);
  assert.ok(vignetteAlpha(1, 0.3, false) > vignetteAlpha(0.2, 0.3, false) * 0.9);
  assert.equal(vignetteAlpha(0.6, 0.1, true), vignetteAlpha(0.6, 7.7, true));
  assert.ok(vignetteAlpha(0.6, 0.1, true) < 0.5);
  for (const t of [0, 0.2, 0.5, 0.9]) assert.ok(vignetteAlpha(1, t, false) <= 1);
  assert.equal(debrisPerSecond(0, false), 0);
  assert.ok(debrisPerSecond(1, false) > debrisPerSecond(0.3, false));
  assert.ok(debrisPerSecond(1, true) < debrisPerSecond(1, false));
  assert.ok(debrisPeriodTicks(1, false) < debrisPeriodTicks(0.2, false));
  assert.equal(debrisPeriodTicks(0, false), 0);
});

test('arena set piece: phase 1 quiet, phase 2 cracks and vents, phase 3 adds tint and debris, dead boss quiet', () => {
  assert.deepEqual(arenaSetPiece(1, 5, true), { crack: 0, steam: 0, tint: 0, debris: 0 });
  const p2 = arenaSetPiece(2, 5, true);
  assert.ok(p2.crack === 1 && p2.steam === 1 && p2.tint === 0 && p2.debris === 0);
  assert.equal(arenaSetPiece(2, 0, true).crack, 0, 'eases in from the phase change');
  const p3 = arenaSetPiece(3, 5, true);
  assert.ok(p3.tint === 1 && p3.debris === 1);
  assert.deepEqual(arenaSetPiece(3, 5, false), { crack: 0, steam: 0, tint: 0, debris: 0 });
});

test('crack paths and hatch beat are deterministic; reduce motion shortens the beat', () => {
  assert.deepEqual(crackPath(3, 73, 95), crackPath(3, 73, 95));
  const pts = crackPath(2, 73, 95);
  assert.ok(pts.every((p) => p.y <= 0 && p.x > 70 && p.x < 98));
  assert.ok(hatchBeat(true).seconds < hatchBeat(false).seconds && hatchBeat(true).scale > hatchBeat(false).scale);
});

test('set piece emitters and win beat never touch the simulation', () => {
  const run = (observe: boolean): string => {
    const w = newWorld3D();
    const fx = new FxDirector();
    w.coreDestroyed = true;
    w.meltdownTicks = 1200;
    for (let i = 0; i < 120; i++) {
      stepWorld3D(w, emptyInput3D());
      if (observe) {
        fx.observe(w);
        fx.update(1 / 60, w);
      }
    }
    return JSON.stringify([w.tick, w.meltdownTicks, w.player.hp, w.player.body.x, w.player.body.y]);
  };
  assert.equal(run(true), run(false));
});

test('win event requests the final hatch slow-mo (shorter with reduce motion)', () => {
  const beat = (reduce: boolean): number => {
    const w = newWorld3D();
    const fx = new FxDirector();
    fx.reduce = reduce;
    fx.observe(w, true);
    w.tick++;
    w.events = [{ type: 'win' }];
    fx.observe(w);
    fx.slowmo.step(1 / 60);
    return fx.slowmo.scale;
  };
  assert.ok(beat(false) < beat(true));
  assert.ok(beat(false) < 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAIT,
  GROUND_ACCEL_MAX,
  GROUND_SPEED_MAX,
  SPRINT_STRIDE_MAX,
  gaitCycleRate,
  runBlend,
  sprintStretch,
  stepGroundSpeed,
  strideLength,
} from '../src/render3d/enemyRig3d.ts';

test('a one-frame collision snap does not spin the legs', () => {
  // Steady 4 m/s chase, then one 0.8 m snap (48 m/s reading), then back to 4 m/s
  let s = 0;
  for (let i = 0; i < 60; i++) s = stepGroundSpeed(s, 4 / 60, 1 / 60);
  assert.ok(Math.abs(s - 4) < 0.05);
  const snapped = stepGroundSpeed(s, 0.8, 1 / 60);
  assert.ok(snapped <= s + GROUND_ACCEL_MAX / 60 + 1e-9, `snap read ${snapped}`);
  assert.ok(snapped <= GROUND_SPEED_MAX);
  // Gait phase advance during the snap frame stays a small fraction of a cycle
  assert.ok(gaitCycleRate('stalker', snapped) / 60 < 0.07);
  let back = snapped;
  for (let i = 0; i < 6; i++) back = stepGroundSpeed(back, 4 / 60, 1 / 60);
  assert.ok(Math.abs(back - 4) < 0.1, 'recovers within six frames');
});

test('stops and starts still track the sim closely', () => {
  let s = 0;
  // Sim chase acceleration: 0.75 m/s per tick
  for (let i = 1; i <= 12; i++) s = stepGroundSpeed(s, (0.75 * i) / 60, 1 / 60);
  assert.ok(s > 0.75 * 12 * 0.85, `accel tracking ${s}`);
  for (let i = 0; i < 4; i++) s = stepGroundSpeed(s, 0, 1 / 60);
  assert.ok(s < 0.5, `stop tracking ${s}`);
});

test('sprinting lengthens the stride instead of spinning the run clip', () => {
  const g = GAIT.stalker;
  assert.equal(sprintStretch('stalker', g.runRef), 1);
  assert.equal(sprintStretch('stalker', 3), 1);
  assert.ok(sprintStretch('stalker', 40) <= SPRINT_STRIDE_MAX);
  const ts = (v: number) => gaitCycleRate('stalker', v) * g.runDur;
  assert.ok(ts(9.6) < 1.45, `aggro chase run timeScale ${ts(9.6)}`);
  // Cadence still rises with speed
  let prev = 0;
  for (let v = 0.5; v <= 12; v += 0.25) {
    const c = gaitCycleRate('stalker', v);
    assert.ok(c > prev);
    prev = c;
    assert.ok(Math.abs(c * strideLength('stalker', v) - v) < 1e-9);
  }
});

test('a 3.8 m/s chase is a run, not a sped-up walk', () => {
  assert.ok(runBlend('stalker', 3.8) > 0.99);
  assert.ok(runBlend('stalker', 1.5) === 0);
});

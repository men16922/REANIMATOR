import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseTransition, scuttleAmp, crawlerStride, gaitStep } from '../src/render3d/enemyMotion.ts';

const ch = (lift: number, pitch = 0, roll = 0, yaw = 0) => ({ lift, pitch, roll, yaw });

test('scuttleAmp is zero at rest and grows with speed', () => {
  assert.equal(scuttleAmp(0), 0);
  assert.equal(scuttleAmp(0.2), 0);
  assert.ok(scuttleAmp(1) > 0);
  assert.ok(scuttleAmp(3) >= scuttleAmp(1));
  assert.ok(scuttleAmp(20) <= 0.24);
});

test('scuttle amplitude matches stride/(2pi) so planted feet travel at ground speed', () => {
  const v = 2;
  const ideal = crawlerStride(v) / (2 * Math.PI);
  assert.ok(scuttleAmp(v) / ideal > 0.9 && scuttleAmp(v) / ideal < 1.2);
  assert.ok(gaitStep('crawler', v) > 0);
});

test('PoseTransition does not snap on a clip change and settles on the target', () => {
  const t = new PoseTransition();
  for (let i = 0; i < 10; i++) t.step('crawl', ch(0.12, 0.1), 1 / 60, true);
  const first = t.step('crouch', ch(0, 0.3), 1 / 60, true);
  assert.ok(first.lift > 0.09, `lift ${first.lift}`);
  assert.ok(first.pitch < 0.15);
  let o = first;
  for (let i = 0; i < 60; i++) o = t.step('crouch', ch(0, 0.3), 1 / 60, true);
  assert.ok(Math.abs(o.lift) < 1e-3 && Math.abs(o.pitch - 0.3) < 1e-3);
});

test('PoseTransition passes high-frequency target motion through and resets when dead', () => {
  const t = new PoseTransition();
  t.step('crawl', ch(0), 1 / 60, true);
  const a = t.step('crawl', ch(0.1), 1 / 60, true);
  assert.equal(a.lift, 0.1);
  const d = t.step('death', ch(0.5), 1 / 60, false);
  assert.equal(d.lift, 0.5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crawlerFootSpeed,
  crawlerStride,
  gaitStep,
  latchHysteresis,
  proceduralEnemyPose,
  runLean,
  smoothDisplaySpeed,
  stepEnemyYaw,
  wrapAngle,
  type ProcPoseInput,
} from '../src/render3d/enemyMotion.ts';
import { EnemyRigDriver, type RigEnemyLike } from '../src/render3d/enemyRig3d.ts';

const base: ProcPoseInput = {
  kind: 'crawler', alive: true, speed: 0, vy: 0, winding: false, windFrac: 0, striking: false, shot: 0, land: 0,
  stagger: 0, recoil: 0, lean: 0, deathTicks: 0, tSec: 0, gait: 0, phase: 0, alerting: false,
};

test('crawler stride matches ground speed (skate ratio 0.8..1.25) across normal speeds', () => {
  for (let v = 0.5; v <= 8; v += 0.25) {
    const ratio = crawlerFootSpeed(v) / v;
    assert.ok(ratio > 0.8 && ratio < 1.25, `speed ${v} ratio ${ratio}`);
  }
  assert.ok(crawlerStride(6) > crawlerStride(2), 'stride grows with speed');
});

test('crawler gait cadence stays under 4 Hz at the fastest sim speed (no 13 Hz buzz)', () => {
  const hz = gaitStep('crawler', 6.1) / (2 * Math.PI);
  assert.ok(hz < 4, `stride Hz ${hz}`);
  assert.ok(gaitStep('crawler', 6) > gaitStep('crawler', 2) * 1.5);
});

test('smoothed display speed removes the step: no frame changes by more than 20% of a speed jump', () => {
  let s = 0;
  let prev = s;
  let maxStep = 0;
  for (let i = 0; i < 90; i++) {
    s = smoothDisplaySpeed(s, 6, 1 / 60);
    maxStep = Math.max(maxStep, s - prev);
    prev = s;
  }
  assert.ok(maxStep < 6 * 0.2, `max step ${maxStep}`);
  assert.ok(Math.abs(s - 6) < 0.05, 'converges');
});

test('crawler pose amplitude is continuous from standstill to a walk (no pop when it starts moving)', () => {
  const a = proceduralEnemyPose({ ...base, speed: 0.41, gait: 1 });
  const b = proceduralEnemyPose({ ...base, speed: 0.39, gait: 1 });
  assert.ok(Math.abs(a.lift - b.lift) < 0.06, 'lift step');
  assert.ok(Math.abs(a.yaw - b.yaw) < 0.2, 'yaw step');
});

test('turn is not instant: a 180 degree flip takes at least 10 frames at 60 Hz', () => {
  let yaw = 0;
  let frames = 0;
  while (Math.abs(wrapAngle(Math.PI - yaw)) > 0.05 && frames < 600) {
    yaw = stepEnemyYaw(yaw, Math.PI, 1 / 60, 7);
    frames++;
  }
  assert.ok(frames >= 10 && frames < 120, `frames ${frames}`);
});

test('hysteresis: a speed oscillating around the threshold does not flap the walking state', () => {
  let on = false;
  let flips = 0;
  for (let i = 0; i < 300; i++) {
    const speed = 0.38 + Math.sin(i * 0.9) * 0.1; // inside the 0.25..0.5 dead band
    const next = latchHysteresis(on, speed, 0.5, 0.25);
    if (next !== on) flips++;
    on = next;
  }
  assert.equal(flips, 0);
  // A single threshold at 0.38 would flip on nearly every other frame for the same trace
  let naive = false;
  let naiveFlips = 0;
  for (let i = 0; i < 300; i++) {
    const n = 0.38 + Math.sin(i * 0.9) * 0.1 > 0.38;
    if (n !== naive) naiveFlips++;
    naive = n;
  }
  assert.ok(naiveFlips > 50);
});

test('rigged stalker leans into the run and not at rest; warden leans less', () => {
  assert.equal(runLean('stalker', 0), 0);
  assert.ok(runLean('stalker', 5.5) > 0.15);
  assert.ok(runLean('warden', 5.5) < runLean('stalker', 5.5));
  assert.ok(runLean('stalker', 2) < runLean('stalker', 5));
  const e: RigEnemyLike = {
    kind: 'stalker', alive: true, active: true, state: 'chase', x: 0, y: 0, yaw: 1.57, facing: 1, vx: 5.5, vy: 0, phase: 1,
    bossPattern: '', exposedTicks: 0, windupTicks: 0, attackAnimTicks: 0, staggerTicks: 0, hitFlashTicks: 0, deathTicks: 0, lungeTicks: 0,
  };
  const d = new EnemyRigDriver('stalker', e);
  let x = 0;
  let still = 0;
  for (let i = 0; i < 90; i++) still = d.step(e, { x: 20, y: 0 }, 1 / 60, i / 60, x).ch.spine;
  const idleSpine = still;
  let run = 0;
  for (let i = 0; i < 120; i++) {
    x += 5.5 / 60;
    run = d.step({ ...e, x }, { x: 40, y: 0 }, 1 / 60, (90 + i) / 60, x).ch.spine;
  }
  assert.ok(run - idleSpine > 0.1, `lean ${run - idleSpine}`);
});

test('rigged foot speed tracks ground speed while running (skate under 25%)', () => {
  const e: RigEnemyLike = {
    kind: 'stalker', alive: true, active: true, state: 'chase', x: 0, y: 0, yaw: 1.57, facing: 1, vx: 5.8, vy: 0, phase: 1,
    bossPattern: '', exposedTicks: 0, windupTicks: 0, attackAnimTicks: 0, staggerTicks: 0, hitFlashTicks: 0, deathTicks: 0, lungeTicks: 0,
  };
  const d = new EnemyRigDriver('stalker', e);
  let x = 0;
  for (let i = 0; i < 180; i++) {
    x += 5.8 / 60;
    const f = d.step({ ...e, x }, { x: 60, y: 0 }, 1 / 60, i / 60, x);
    if (i > 40) assert.ok(Math.abs(f.footSpeed - 5.8) / 5.8 < 0.25, `frame ${i} foot ${f.footSpeed}`);
  }
});

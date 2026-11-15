import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapsePose,
  dropAnticipation,
  flinchPose,
  flinchStep,
  landSquash,
  proceduralEnemyPose,
  spitKick,
  stepEnemyYaw,
  surfaceWave,
  turnAmount,
  turnSquash,
  wrapAngle,
  type Flinch,
  type ProcPoseInput,
} from '../src/render3d/enemyMotion.ts';
import { GAIT, gaitCycleRate, strideLength } from '../src/render3d/enemyRig3d.ts';
import { SHOWCASE_NAMES } from '../src/ui/demo.ts';

const base: ProcPoseInput = {
  kind: 'crawler', alive: true, speed: 0, vy: 0, winding: false, windFrac: 0, striking: false, shot: 0, land: 0,
  stagger: 0, recoil: 0, lean: 0, deathTicks: 0, tSec: 0, gait: 0, phase: 0, alerting: false,
};

test('rigged foot speed equals ground speed for every speed (no foot slide)', () => {
  for (const kind of ['stalker', 'warden'] as const) {
    for (let v = 0.5; v <= 7; v += 0.25) {
      const foot = gaitCycleRate(kind, v) * strideLength(kind, v);
      assert.ok(Math.abs(foot - v) < 1e-9, `${kind} ${v}`);
    }
    assert.ok(GAIT[kind].blendLo < GAIT[kind].blendHi);
  }
});

test('turn-around: yaw flip is continuous and bounded per frame, and squash is bounded and returns to 1', () => {
  let yaw = 0;
  let prev = yaw;
  let maxStep = 0;
  for (let i = 0; i < 120; i++) {
    yaw = stepEnemyYaw(yaw, Math.PI, 1 / 60, 7);
    maxStep = Math.max(maxStep, Math.abs(wrapAngle(yaw - prev)));
    assert.ok(turnSquash(Math.PI - yaw) >= 0.9 && turnSquash(Math.PI - yaw) <= 1);
    prev = yaw;
  }
  assert.ok(maxStep <= 0.2 + 1e-9, `step ${maxStep}`);
  assert.ok(Math.abs(wrapAngle(Math.PI - yaw)) < 0.05);
  assert.equal(turnAmount(0), 0);
  assert.equal(turnSquash(0), 1);
  assert.ok(turnSquash(Math.PI) < 0.95);
});

test('flinch: a hit kicks, then amplitude and knockback decay to exactly zero; knockback is bounded and opposes facing', () => {
  let f: Flinch = { amp: 0, kb: 0 };
  f = flinchStep(f, 1 / 60, true, 1);
  assert.ok(f.amp > 0.8);
  assert.ok(f.kb < 0, 'pushed against facing 1');
  for (let i = 0; i < 20; i++) f = flinchStep(f, 1 / 60, true, 1);
  assert.ok(Math.abs(f.kb) <= 0.3 + 1e-9);
  for (let i = 0; i < 120; i++) f = flinchStep(f, 1 / 60, false, 1);
  assert.deepEqual(f, { amp: 0, kb: 0 });
  const pose = flinchPose(f.amp);
  assert.deepEqual(pose, { pitch: -0, sy: 1, sxz: 1 });
  assert.ok(flinchPose(1).sy < 1);
});

test('landing squash returns to 1, heavy droppers squash harder', () => {
  assert.deepEqual(landSquash(0, true), { sy: 1, sxz: 1 });
  assert.ok(landSquash(1, true).sy < landSquash(1, false).sy);
  const p = proceduralEnemyPose({ ...base, land: 1, heavy: true });
  assert.equal(p.clip, 'land');
  assert.ok(p.sy < 0.7);
  assert.equal(proceduralEnemyPose({ ...base, land: 0, heavy: true }).sy <= 1.0001, true);
});

test('ceiling dropper coils before it drops and the wall crawl wave moves with the gait', () => {
  const a0 = dropAnticipation(0, 0);
  assert.deepEqual([a0.sx, a0.sy, a0.sz, a0.pitch, a0.shake], [1, 1, 1, -0, 0]);
  const a1 = dropAnticipation(1, 0.3);
  assert.ok(a1.sy > 1.1 && a1.sx < 0.9);
  const w = proceduralEnemyPose({ ...base, winding: true, windFrac: 1, surface: 'ceiling', tSec: 0.3 });
  assert.equal(w.clip, 'crouch');
  assert.ok(w.sy > 1.1, 'stretches toward the ceiling instead of floor crouch');
  const floorW = proceduralEnemyPose({ ...base, winding: true, windFrac: 1, tSec: 0.3 });
  assert.ok(floorW.sy < 0.8);
  let lo = 9;
  let hi = -9;
  for (let i = 0; i < 100; i++) {
    const p = proceduralEnemyPose({ ...base, speed: 3, surface: 'wall', gait: i * 0.1 });
    lo = Math.min(lo, p.yaw);
    hi = Math.max(hi, p.yaw);
  }
  assert.ok(hi - lo > 0.3, `wave range ${hi - lo}`);
  const s0 = surfaceWave(1.2, 3);
  const s1 = surfaceWave(1.2, 3);
  assert.deepEqual(s0, s1);
});

test('spitter recoil kicks back and settles to zero', () => {
  assert.equal(spitKick(0), 0);
  assert.ok(spitKick(1) > 0.1);
  const p = proceduralEnemyPose({ ...base, kind: 'spitter', shot: 1 });
  assert.equal(p.clip, 'spit');
  assert.ok(p.kick > 0.1);
  assert.equal(proceduralEnemyPose({ ...base, kind: 'spitter', shot: 0 }).kick, 0);
});

test('Reclaimer collapse: buckles, thuds and settles, deterministic and bounded', () => {
  assert.deepEqual(collapsePose(0), { sink: 0, squashY: 1 });
  let maxSink = 0;
  for (let t = 0; t < 240; t++) {
    const c = collapsePose(t);
    assert.ok(c.sink >= -0.001 && c.sink < 0.12);
    assert.ok(c.squashY > 0.9 && c.squashY <= 1);
    maxSink = Math.max(maxSink, c.sink);
  }
  assert.ok(maxSink > 0.05);
  assert.deepEqual(collapsePose(77), collapsePose(77));
  const end = collapsePose(240);
  assert.ok(Math.abs(end.sink - 0.06) < 0.002);
});

test('bestiary showcase is registered', () => {
  assert.ok(SHOWCASE_NAMES.includes('bestiary'));
});

// R5 enemy rig: stride-locked gait, pose-state continuity, hit recoil, boss patterns, head-leads-body, and a bot
// playthrough that measures foot skating, yaw rate and bone-pose jumps with analyzeEnemyTrace. Render-only code,
// so none of this touches the simulation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import { analyzeEnemyTrace, type EnemyTraceFrame } from '../src/render3d/enemyMotion.ts';
import {
  EnemyRigDriver,
  GAIT,
  ProcSecondary,
  channelsToArray,
  gaitCycleRate,
  runBlend,
  strideLength,
  type RigEnemyLike,
} from '../src/render3d/enemyRig3d.ts';

function foe(over: Partial<RigEnemyLike> = {}): RigEnemyLike {
  return {
    kind: 'stalker', alive: true, active: true, state: 'chase', x: 0, y: 0, yaw: Math.PI / 2, facing: 1, vx: 0, vy: 0,
    phase: 1, bossPattern: 'none', exposedTicks: 0, windupTicks: 0, attackAnimTicks: 0, staggerTicks: 0,
    hitFlashTicks: 0, deathTicks: 0, lungeTicks: 0, ...over,
  };
}
const PLAYER = { x: 6, y: 0 };

test('gait: cycle rate x stride equals ground speed for every speed, walk/run mix is monotonic', () => {
  for (const kind of ['stalker', 'warden'] as const) {
    let prev = 0;
    for (let sp = 0.3; sp <= 8; sp += 0.1) {
      assert.ok(Math.abs(gaitCycleRate(kind, sp) * strideLength(kind, sp) - sp) < 1e-9);
      const rb = runBlend(kind, sp);
      assert.ok(rb >= prev - 1e-12 && rb >= 0 && rb <= 1);
      prev = rb;
    }
    assert.equal(runBlend(kind, GAIT[kind].blendLo - 0.1), 0);
    assert.equal(runBlend(kind, GAIT[kind].blendHi + 0.1), 1);
  }
});

test('driver: blend weights stay normalised and follow speed (idle -> walk -> run)', () => {
  const e = foe();
  const d = new EnemyRigDriver('stalker', e);
  let x = 0;
  const seen = { idle: 0, walk: 0, run: 0 };
  for (let i = 0; i < 360; i++) {
    const speed = i < 90 ? 0 : i < 180 ? 2.2 : 6;
    x += speed / 60;
    const f = d.step({ ...e, x, vx: speed }, PLAYER, 1 / 60, i / 60, x);
    const w = f.weights;
    assert.ok(Math.abs(w.idle + w.walk + w.run + w.attack + w.death - 1) < 1e-6);
    if (i === 85) seen.idle = w.idle;
    if (i === 175) seen.walk = w.walk;
    if (i === 355) seen.run = w.run;
  }
  assert.ok(seen.idle > 0.95 && seen.walk > 0.8 && seen.run > 0.8, JSON.stringify(seen));
});

test('driver: head turns before the body and both respect the 12 rad/s cap', () => {
  const e = foe({ yaw: -Math.PI / 2, facing: -1 });
  const d = new EnemyRigDriver('stalker', e);
  for (let i = 0; i < 60; i++) d.step(e, PLAYER, 1 / 60, i / 60, 0);
  const flip = { ...e, yaw: Math.PI / 2, facing: 1 as const };
  let lastBody = -Math.PI / 2;
  let maxRate = 0;
  let headLed = false;
  for (let i = 0; i < 40; i++) {
    const f = d.step(flip, PLAYER, 1 / 60, 1 + i / 60, 0);
    const dy = Math.abs(Math.atan2(Math.sin(f.bodyYaw - lastBody), Math.cos(f.bodyYaw - lastBody)));
    maxRate = Math.max(maxRate, dy * 60);
    lastBody = f.bodyYaw;
    if (Math.abs(f.headRel) > 0.3) headLed = true;
    assert.ok(Math.abs(f.headRel) <= 0.95 + 1e-9);
  }
  assert.ok(headLed, 'head leads the body through the turn');
  assert.ok(maxRate <= 12 + 1e-6, `body rate ${maxRate}`);
});

test('driver: windup crouches, leap tucks, landing squashes, no channel jumps on state edges', () => {
  const e = foe();
  const d = new EnemyRigDriver('stalker', e);
  const seq: Partial<RigEnemyLike>[] = [];
  for (let i = 0; i < 30; i++) seq.push({});
  for (let i = 0; i < 18; i++) seq.push({ state: 'windup', windupTicks: 18 - i });
  for (let i = 0; i < 20; i++) seq.push({ state: 'attack', attackAnimTicks: 20 - i, lungeTicks: 10, vy: 4, vx: 6 });
  for (let i = 0; i < 40; i++) seq.push({ state: 'recover', vy: i === 0 ? -5 : 0 });
  let prev: number[] | null = null;
  let maxStep = 0;
  const peak = { crouch: 0, tuck: 0, land: 0 };
  seq.forEach((o, i) => {
    const f = d.step({ ...e, ...o }, PLAYER, 1 / 60, i / 60, 0);
    const arr = channelsToArray(f.ch);
    if (prev) for (let k = 0; k < arr.length; k++) maxStep = Math.max(maxStep, Math.abs(arr[k] - prev[k]));
    prev = arr;
    if (f.poseState === 'windup') peak.crouch = Math.max(peak.crouch, f.ch.kneeL);
    if (f.poseState === 'strike' || f.poseState === 'leap') peak.tuck = Math.max(peak.tuck, f.ch.kneeR);
    if (f.poseState === 'land') peak.land = Math.max(peak.land, f.ch.hipsDrop);
  });
  assert.ok(peak.crouch > 0.5, `crouch ${peak.crouch}`);
  assert.ok(peak.tuck > 0.8, `tuck ${peak.tuck}`);
  assert.ok(peak.land > 0.05, `land ${peak.land}`);
  assert.ok(maxStep < 0.2, `max channel step ${maxStep}`);
});

test('driver: hit recoil is a damped spring that tips back from a frontal hit and settles', () => {
  const e = foe({ x: 0, facing: 1 });
  const d = new EnemyRigDriver('stalker', e);
  for (let i = 0; i < 30; i++) d.step(e, PLAYER, 1 / 60, i / 60, 0);
  let minSpine = 0;
  let maxSpine = -9;
  let last = 0;
  for (let i = 0; i < 180; i++) {
    const f = d.step({ ...e, hitFlashTicks: i === 0 ? 6 : Math.max(0, 6 - i) }, PLAYER, 1 / 60, 1 + i / 60, 0);
    minSpine = Math.min(minSpine, f.ch.spine);
    maxSpine = Math.max(maxSpine, f.ch.spine);
    last = f.ch.spine;
  }
  assert.ok(minSpine < -0.12, `tips back ${minSpine}`);
  assert.ok(maxSpine > minSpine + 0.05, 'overshoots back (spring)');
  assert.ok(Math.abs(last) < 0.12, `settles ${last}`);
});

test('driver: death sags bones with different delays and never starts from a jump', () => {
  const e = foe();
  const d = new EnemyRigDriver('stalker', e);
  for (let i = 0; i < 30; i++) d.step(e, PLAYER, 1 / 60, i / 60, 0);
  const frames: ReturnType<typeof d.step>[] = [];
  let prev: number[] | null = null;
  let maxStep = 0;
  for (let t = 1; t <= 150; t++) {
    const f = d.step({ ...e, alive: false, state: 'dead', deathTicks: t }, PLAYER, 1 / 60, 1 + t / 60, 0);
    frames.push(f);
    const arr = channelsToArray(f.ch);
    if (prev) for (let k = 0; k < arr.length; k++) maxStep = Math.max(maxStep, Math.abs(arr[k] - prev[k]));
    prev = arr;
  }
  assert.equal(frames[149].poseState, 'dead');
  assert.ok(maxStep < 0.2, `death step ${maxStep}`);
  // the head sags later than the hips: at tick 30 the hips are further along their travel than the head
  const f30 = frames[29].ch;
  const f149 = frames[149].ch;
  assert.ok(f149.headPitch > 0.4 && f149.hipsDrop > 0.04, 'bones end sagged');
  assert.ok(f30.hipsDrop / f149.hipsDrop > f30.headPitch / f149.headPitch, 'hips settle before the head');
});

test('warden: pattern poses (slam overhead, volley level, summon wide, kneel when exposed, roar on phase change)', () => {
  const base = foe({ kind: 'warden', y: 0, vx: 0 });
  const run = (over: Partial<RigEnemyLike>[], n: number) => {
    const d = new EnemyRigDriver('warden', base);
    let f = d.step(base, PLAYER, 1 / 60, 0, 0);
    for (let i = 0; i < n; i++) f = d.step({ ...base, ...over[Math.min(i, over.length - 1)] }, PLAYER, 1 / 60, i / 60, 0);
    return f;
  };
  const slam = run([{ bossPattern: 'slam', state: 'windup', windupTicks: 1 }], 70);
  assert.equal(slam.poseState, 'windup');
  assert.ok(slam.ch.armUpL > 1.5 && slam.ch.armUpR > 1.5, 'arms raised overhead');
  const volley = run([{ bossPattern: 'volley', state: 'attack', attackAnimTicks: 20 }], 70);
  assert.ok(volley.ch.armUpL > 1.1 && volley.ch.armUpL < 2.0, `arms level ${volley.ch.armUpL}`);
  const summon = run([{ bossPattern: 'summon', state: 'windup', windupTicks: 1 }], 70);
  assert.ok(summon.ch.armOutL > 0.5, 'arms spread');
  const kneel = run([{ exposedTicks: 50, state: 'stagger', staggerTicks: 50 }], 80);
  assert.equal(kneel.poseState, 'stagger');
  assert.ok(kneel.ch.hipsDrop > 0.5 && kneel.ch.kneeL > 1.2, 'kneels');
  const roarSeq: Partial<RigEnemyLike>[] = [{ phase: 1 }];
  const d = new EnemyRigDriver('warden', { ...base, phase: 1 });
  d.step({ ...base, phase: 1 }, PLAYER, 1 / 60, 0, 0);
  let sawRoar = false;
  let maxArms = 0;
  for (let i = 0; i < 90; i++) {
    const f = d.step({ ...base, phase: 2 }, PLAYER, 1 / 60, i / 60, 0);
    if (f.poseState === 'roar') sawRoar = true;
    maxArms = Math.max(maxArms, f.ch.armOutL);
  }
  void roarSeq;
  assert.ok(sawRoar && maxArms > 0.5, 'roar pose on phase change');
});

test('single-mesh foes: springs overshoot after a squash and surface angle turns at a capped rate', () => {
  const sec = new ProcSecondary(0);
  const inp = { alive: true, sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0, vx: 0, dropping: false, shot: 0, surfaceTarget: 0, spitter: false };
  for (let i = 0; i < 30; i++) sec.step(inp, 1 / 60);
  let minY = 9;
  let maxY = 0;
  for (let i = 0; i < 90; i++) {
    const o = sec.step({ ...inp, sy: i < 6 ? 0.7 : 1 }, 1 / 60);
    minY = Math.min(minY, o.sy);
    if (i > 8) maxY = Math.max(maxY, o.sy);
  }
  assert.ok(minY < 0.9 && maxY > 1.005, `squash ${minY} then stretch ${maxY}`);
  const wall = new ProcSecondary(0);
  let last = 0;
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    const o = wall.step({ ...inp, surfaceTarget: Math.PI }, 1 / 60);
    worst = Math.max(worst, Math.abs(o.surf - last));
    last = o.surf;
  }
  assert.ok(worst <= 8 / 60 + 1e-9, `surface step ${worst}`);
});

test('bot playthrough: rigged foes never skate (<2%), never snap yaw, never jump bone poses', () => {
  for (const stride of [1, 2]) {
    const w = newWorld3D();
    const bot = createBot3D(w);
    const drivers = new Map<string, EnemyRigDriver>();
    const traces = new Map<string, EnemyTraceFrame[]>();
    for (let t = 0; t < 7000 && w.status === 'playing'; t++) {
      stepWorld3D(w, bot.next(w));
      if (t % stride !== 0) continue;
      const dt = stride / 60;
      const player = { x: w.player.body.x, y: w.player.body.y };
      for (const e of w.enemies) {
        if (e.kind !== 'stalker' && e.kind !== 'warden') continue;
        if (!e.alive && e.deathTicks === 0) continue; // unspawned minion slot, hidden
        let d = drivers.get(e.id);
        if (!d) drivers.set(e.id, (d = new EnemyRigDriver(e.kind === 'warden' ? 'warden' : 'stalker', e)));
        const f = d.step(e, player, dt, t / 60, e.x);
        let tr = traces.get(e.id);
        if (!tr) traces.set(e.id, (tr = []));
        tr.push({ t: t / 60, yaw: f.bodyYaw, clip: f.clip, timeScale: f.timeScale, x: e.x, footSpeed: f.footSpeed, pose: channelsToArray(f.ch), poseState: f.poseState });
      }
    }
    let frames = 0;
    let moving = 0;
    let skate = 0;
    let worstYawRate = 0;
    let worstPose = 0;
    let worstTransition = 0;
    let jumps = 0;
    for (const tr of traces.values()) {
      const rep = analyzeEnemyTrace(tr, { poseLimit: 0.25 * stride });
      frames += tr.length;
      moving += rep.movingFrames;
      skate += rep.skateFrames;
      worstYawRate = Math.max(worstYawRate, rep.maxYawRate);
      worstPose = Math.max(worstPose, rep.maxPoseStep);
      worstTransition = Math.max(worstTransition, rep.maxTransitionJump);
      jumps += rep.poseJumps;
      assert.equal(rep.yawJumps, 0);
    }
    assert.ok(frames > 0, 'bot run produced rigged enemy frames');
    assert.ok(skate / Math.max(1, moving) < 0.02, `stride ${stride} skate ${skate}/${moving}`);
    assert.ok(worstYawRate <= 12 + 1e-6, `yaw rate ${worstYawRate}`);
    assert.equal(jumps, 0, `pose jumps (worst step ${worstPose})`);
    assert.ok(worstTransition < 0.25 * stride, `transition jump ${worstTransition}`);
    if (process.env.RIG_STATS) console.log(`stride ${stride}: frames ${frames} moving ${moving} skate ${skate} yawRate ${worstYawRate.toFixed(2)} poseStep ${worstPose.toFixed(3)} transJump ${worstTransition.toFixed(3)}`);
  }
});

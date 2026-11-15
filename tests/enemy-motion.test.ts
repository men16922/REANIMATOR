// Render-only enemy motion: yaw smoothing, procedural crawler/spitter poses, and trace checks for yaw jumps
// and foot skating. Pure helpers only (no WebGL), driven by the deterministic simulation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import {
  analyzeEnemyTrace,
  gaitStep,
  proceduralEnemyPose,
  stepEnemyYaw,
  wrapAngle,
  type EnemyTraceFrame,
  type ProcPoseInput,
} from '../src/render3d/enemyMotion.ts';

function pose(over: Partial<ProcPoseInput>): ReturnType<typeof proceduralEnemyPose> {
  return proceduralEnemyPose({
    kind: 'crawler',
    alive: true,
    speed: 0,
    vy: 0,
    winding: false,
    windFrac: 0,
    striking: false,
    shot: 0,
    land: 0,
    stagger: 0,
    recoil: 0,
    lean: 0,
    deathTicks: 0,
    tSec: 1,
    gait: 0,
    phase: 0,
    alerting: false,
    ...over,
  });
}

test('stepEnemyYaw: a pi facing flip never turns 0.5 rad in one frame, even on long frames', () => {
  for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.1, 0.5]) {
    let yaw = -Math.PI / 2;
    let maxStep = 0;
    for (let i = 0; i < 120; i++) {
      const next = stepEnemyYaw(yaw, Math.PI / 2, dt);
      maxStep = Math.max(maxStep, Math.abs(wrapAngle(next - yaw)));
      yaw = next;
    }
    assert.ok(maxStep < 0.5, `dt=${dt} maxStep=${maxStep}`);
    assert.ok(Math.abs(wrapAngle(yaw - Math.PI / 2)) < 0.05, 'converges to target');
  }
});

test('procedural crawler: distinct clips per phase, gait scales with speed, land squashes', () => {
  assert.equal(pose({}).clip, 'idle');
  assert.equal(pose({ alerting: true }).clip, 'alert');
  assert.equal(pose({ speed: 5 }).clip, 'crawl');
  assert.equal(pose({ speed: 5 }).timeScale, 1);
  assert.equal(pose({ winding: true, windFrac: 1 }).clip, 'crouch');
  assert.ok(pose({ winding: true, windFrac: 1 }).sy < 0.75, 'crouch squashes');
  assert.equal(pose({ striking: true, vy: 4 }).clip, 'leap');
  assert.ok(pose({ vy: 4, striking: true }).pitch < pose({ vy: -4, striking: true }).pitch, 'nose up rising, down falling');
  assert.ok(pose({ land: 1 }).sy < 0.85, 'landing squash');
  assert.equal(pose({ stagger: 1 }).clip, 'stagger');
  assert.ok(pose({ stagger: 1 }).pitch < -0.2, 'knockback tips the body back');
  assert.ok(gaitStep('crawler', 6) > gaitStep('crawler', 1));
  assert.ok(gaitStep('crawler', 99) <= 2 * Math.PI * 6.5 + 1e-9);
});

test('procedural spitter: hover, inflate, spit kick', () => {
  assert.equal(pose({ kind: 'spitter' }).clip, 'hover');
  const w = pose({ kind: 'spitter', winding: true, windFrac: 1 });
  assert.equal(w.clip, 'inflate');
  assert.ok(w.sx > 1.2);
  assert.equal(pose({ kind: 'spitter', shot: 1 }).clip, 'spit');
});

test('death falls, then sinks and shrinks instead of popping out', () => {
  const early = pose({ alive: false, deathTicks: 12 });
  const down = pose({ alive: false, deathTicks: 40 });
  const fading = pose({ alive: false, deathTicks: 200 });
  assert.ok(down.roll > early.roll && down.roll > 1.4, 'fell over');
  assert.ok(fading.sx < 0.7 && fading.visible, 'shrinking but still visible');
  assert.equal(pose({ alive: false, deathTicks: 240 }).visible, false);
  // Monotonic scale: no sudden pop between consecutive ticks
  let prev = 1;
  for (let t = 1; t <= 240; t++) {
    const s = pose({ alive: false, deathTicks: t }).sx;
    assert.ok(prev - s <= 0.02 + 1e-9, `scale pop at tick ${t}`);
    prev = s;
  }
});

test('analyzeEnemyTrace flags yaw jumps and skating on synthetic traces', () => {
  const jump: EnemyTraceFrame[] = [
    { t: 0, yaw: -1.57, clip: 'idle', timeScale: 1, x: 0 },
    { t: 1 / 60, yaw: 1.57, clip: 'idle', timeScale: 1, x: 0 },
  ];
  assert.equal(analyzeEnemyTrace(jump).yawJumps, 1);
  const skate: EnemyTraceFrame[] = [];
  for (let i = 0; i < 10; i++) skate.push({ t: i / 60, yaw: 0, clip: 'walk', timeScale: 1, x: i * (5 / 60) });
  assert.ok(analyzeEnemyTrace(skate).skateFrames > 0, 'walking at 5 m/s with a 2.2 m/s clip skates');
  const ok = skate.map((f, i) => ({ ...f, clip: 'run', timeScale: 5 / 5.5, x: i * (5 / 60) }));
  assert.equal(analyzeEnemyTrace(ok).skateFrames, 0);
});

test('bot playthrough: smoothed enemy yaw has no >=0.5 rad frame jump at 60 and 30 fps, and no skating', () => {
  for (const stride of [1, 2]) {
    const w = newWorld3D();
    const bot = createBot3D(w);
    const yaws = new Map<string, number>();
    const traces = new Map<string, EnemyTraceFrame[]>();
    let worstYaw = 0;
    let totalSkate = 0;
    let moving = 0;
    for (let t = 0; t < 6000 && w.status === 'playing'; t++) {
      stepWorld3D(w, bot.next(w));
      if (t % stride !== 0) continue;
      const dt = stride / 60;
      for (const e of w.enemies) {
        const prevYaw = yaws.get(e.id) ?? e.yaw;
        const yaw = stepEnemyYaw(prevYaw, e.yaw, dt, 7);
        yaws.set(e.id, yaw);
        const speed = Math.abs(e.vx);
        const clip = !e.alive || e.state === 'stagger' || e.state === 'windup' || e.state === 'attack' || e.attackAnimTicks > 0
          ? 'stagger'
          : speed > 4.2 ? 'run' : speed > 0.4 ? 'walk' : 'idle';
        const ref = clip === 'run' ? 5.5 : 2.2;
        const timeScale = clip === 'idle' || clip === 'stagger' ? 1 : Math.max(0.45, Math.min(1.8, speed / ref));
        let tr = traces.get(e.id);
        if (!tr) traces.set(e.id, (tr = []));
        tr.push({ t: (t / 60), yaw, clip, timeScale, x: e.x });
      }
    }
    for (const tr of traces.values()) {
      const rep = analyzeEnemyTrace(tr);
      worstYaw = Math.max(worstYaw, rep.maxYawStep);
      totalSkate += rep.skateFrames;
      moving += tr.length;
      assert.equal(rep.yawJumps, 0);
    }
    assert.ok(moving > 0, 'bot run produced enemy frames');
    assert.ok(worstYaw < 0.5, `stride ${stride} worst yaw step ${worstYaw}`);
    // Speeds below the 0.45 clip clamp are the only tolerated mismatch; the sim's accel ramps stay rare
    assert.ok(totalSkate / moving < 0.02, `stride ${stride} skate fraction ${totalSkate / moving}`);
  }
});

// ---- R13: surface travel speed drives the crawler gait ----
import { enemyTravelSpeed } from '../src/render3d/enemyMotion.ts';

test('wall/ceiling crawler travel speed uses hypot(vx, vy) and drives a non-zero gait', () => {
  for (const surface of ['wall', 'ceiling']) {
    const e = { surface, state: 'patrol', speedNow: 0, vx: 0, vy: 3 };
    const s = enemyTravelSpeed(e);
    assert.equal(s, 3);
    assert.ok(gaitStep('crawler', s) > 0);
    // The old |vx|-only rule would have read 0 on a vertical climb
    assert.equal(Math.abs(e.vx), 0);
  }
  assert.ok(Math.abs(enemyTravelSpeed({ surface: 'wall', state: 'chase', speedNow: 0, vx: 3, vy: 4 }) - 5) < 1e-9);
});

test('floor crawler travel speed uses the achieved speed; attack and dropping fall back to |vx|', () => {
  assert.equal(enemyTravelSpeed({ surface: 'floor', state: 'chase', speedNow: 2.5, vx: 9, vy: 0 }), 2.5);
  assert.equal(enemyTravelSpeed({ surface: 'floor', state: 'attack', speedNow: 2.5, vx: -4, vy: 0 }), 4);
  assert.equal(enemyTravelSpeed({ surface: 'ceiling', dropping: true, state: 'drop', speedNow: 0, vx: -1, vy: -6 }), 1);
});

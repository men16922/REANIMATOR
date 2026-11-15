import test from 'node:test';
import assert from 'node:assert/strict';
import { gaitStep, proceduralEnemyPose, type ProcPoseInput } from '../src/render3d/enemyMotion.ts';

const base: ProcPoseInput = {
  kind: 'crawler', alive: true, speed: 0, vy: 0, winding: false, windFrac: 0, striking: false, shot: 0, land: 0,
  stagger: 0, recoil: 0, lean: 0, deathTicks: 0, tSec: 0, gait: 0, phase: 0, alerting: false,
};

/** Peak-to-peak range of each pose channel over two seconds of integrated gait at a fixed ground speed. */
function range(speed: number): Record<'lift' | 'roll' | 'yaw' | 'pitch' | 'sz', number> {
  const lo = { lift: 9, roll: 9, yaw: 9, pitch: 9, sz: 9 };
  const hi = { lift: -9, roll: -9, yaw: -9, pitch: -9, sz: -9 };
  let gait = 0;
  for (let i = 0; i < 120; i++) {
    const p = proceduralEnemyPose({ ...base, speed, gait, tSec: i / 60 });
    gait += gaitStep('crawler', speed) / 60;
    for (const k of Object.keys(lo) as (keyof typeof lo)[]) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  return { lift: hi.lift - lo.lift, roll: hi.roll - lo.roll, yaw: hi.yaw - lo.yaw, pitch: hi.pitch - lo.pitch, sz: hi.sz - lo.sz };
}

test('single-mesh crawlers scuttle visibly: stride motion is large when moving and small when stopped', () => {
  const still = range(0);
  const walk = range(2.5);
  const run = range(6);
  assert.equal(proceduralEnemyPose({ ...base, speed: 0 }).clip, 'idle');
  assert.equal(proceduralEnemyPose({ ...base, speed: 2.5 }).clip, 'crawl');
  // The old pose moved by 0.05 m / 0.05 rad at best. The scuttle must be clearly visible.
  assert.ok(walk.lift > 0.07 && run.lift > walk.lift - 1e-9, `lift ${walk.lift}`);
  assert.ok(walk.roll > 0.12 && walk.yaw > 0.15 && walk.sz > 0.06, `roll ${walk.roll} yaw ${walk.yaw} sz ${walk.sz}`);
  assert.ok(run.roll >= walk.roll && run.yaw >= walk.yaw);
  assert.ok(still.lift < 0.01 && still.roll < 0.05 && still.yaw < 0.2, 'idle stays calm');
  assert.ok(walk.yaw > still.yaw * 1.5, 'moving swings wider than idle');
});

test('gait rate follows ground speed', () => {
  assert.ok(gaitStep('crawler', 6) > gaitStep('crawler', 2) * 1.5);
});

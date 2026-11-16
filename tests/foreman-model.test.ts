// R20: Slag Foreman mesh asset, manifest entry and procedural pose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { foremanGaitStep, foremanPose, FOREMAN_DEATH_VANISH_TICKS, type ForemanPoseInput } from '../src/render3d/foremanMotion.ts';

const root = resolve(import.meta.dirname, '..');
const base: ForemanPoseInput = { alive: true, speed: 0, winding: false, windFrac: 0, striking: false, stagger: 0, recoil: 0, deathTicks: 0, tSec: 1, gait: 0 };

test('foreman.glb is a compact textured static mesh registered in the manifest', () => {
  const file = resolve(root, 'public/assets/models/foreman.glb');
  assert.ok(existsSync(file));
  assert.ok(statSync(file).size < 1.5 * 1024 * 1024, 'optimized size stays under 1.5 MB');
  const buf = readFileSync(file);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'glTF magic');
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { skins?: unknown[]; materials?: unknown[] };
  assert.equal(json.skins?.length ?? 0, 0, 'static mesh, no skin');
  assert.ok((json.materials?.length ?? 0) >= 1);
  const m = JSON.parse(readFileSync(resolve(root, 'reference/manifests/meshy-assets.json'), 'utf8')) as { assets: Record<string, unknown>[] };
  const e = m.assets.find((a) => a.id === 'foreman');
  assert.ok(e, 'manifest entry');
  assert.equal(e.taskId, '01a1e486-d3af-77ee-9ff1-4299e1aca7ee');
  assert.equal(e.previewTaskId, '01a1e486-4542-7679-aaa2-19ebba9bc310');
  assert.equal(e.optimizedBytes, statSync(file).size);
  assert.ok((e.optimizedTriangles as number) <= 8500);
  assert.match(String(e.prompt), /Foundry brute mutant/);
});

test('foreman pose: deterministic, telegraph rears back, strike lunges forward', () => {
  const idle = foremanPose(base);
  assert.deepEqual(idle, foremanPose(base));
  const wind = foremanPose({ ...base, winding: true, windFrac: 1 });
  const strike = foremanPose({ ...base, striking: true });
  assert.ok(wind.pitch < idle.pitch - 0.2, 'rears back during the telegraph');
  assert.ok(wind.sy < 1, 'coils down');
  assert.ok(strike.pitch > idle.pitch + 0.2, 'leans into the strike');
  assert.ok(wind.heat > idle.heat);
  const walk = foremanPose({ ...base, speed: 2, gait: 1.2 });
  assert.ok(walk.lift > 0, 'footfalls bob the body');
  assert.equal(foremanGaitStep(0), 0);
  assert.ok(foremanGaitStep(3) > foremanGaitStep(1));
});

test('foreman collapse falls face-down then vanishes; reduced motion calms the idle sway', () => {
  const a = foremanPose({ ...base, alive: false, deathTicks: 0 });
  const b = foremanPose({ ...base, alive: false, deathTicks: 40 });
  assert.ok(b.pitch > 1.2 && b.pitch > a.pitch);
  assert.ok(foremanPose({ ...base, alive: false, deathTicks: FOREMAN_DEATH_VANISH_TICKS }).visible === false);
  const loud = foremanPose({ ...base, speed: 2, gait: 1.2 });
  const calm = foremanPose({ ...base, speed: 2, gait: 1.2, reduceMotion: true });
  assert.ok(Math.abs(calm.roll) < Math.abs(loud.roll));
});

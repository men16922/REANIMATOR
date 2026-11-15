// Pure-part tests for tools/meshy/terrain-kit.ts (no network, no writes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { RAW_TASKS, TERRAIN_KIT, buildPlan, formatPlan, parseArgs, parseEnv, registerSection } from '../tools/meshy/terrain-kit.ts';

test('kit has the 11 required pieces with low poly targets', () => {
  assert.equal(TERRAIN_KIT.length, 11);
  assert.equal(new Set(TERRAIN_KIT.map((p) => p.id)).size, 11);
  for (const p of TERRAIN_KIT) {
    assert.ok(p.targetPolycount > 0 && p.targetPolycount <= 4000, p.id);
    assert.ok(p.prompt.length > 30, p.id);
  }
});

test('plan building and --only filter', () => {
  const plan = buildPlan();
  assert.equal(plan.length, 11);
  assert.equal(plan[0].outFile, `public/assets/models/terrain/${plan[0].id}.glb`);
  assert.deepEqual(buildPlan(TERRAIN_KIT, ['steel-girder']).map((s) => s.id), ['steel-girder']);
  assert.match(formatPlan(plan), /11 pieces/);
});

test('args and env parsing', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--only', 'a,b']), { dryRun: true, only: ['a', 'b'], skipOptimize: false, ingestRaw: false });
  assert.equal(parseArgs(['--ingest-raw']).ingestRaw, true);
  assert.equal(parseEnv('# c\nMESHY_API_KEY="abc"\n').MESHY_API_KEY, 'abc');
});

test('register section is marked and idempotent-replaceable', () => {
  const s = registerSection([{ id: 'x', outFile: 'public/assets/models/terrain/x.glb', bytes: 1234, tris: 99, taskId: 'abcdef012345', prompt: 'a|b' }]);
  assert.match(s, /terrain-kit:begin/);
  assert.match(s, /terrain-kit:end/);
  assert.match(s, /1,234 B \/ 99/);
  assert.ok(!s.includes('a|b'));
});

test('--dry-run prints the plan without network', () => {
  const out = execFileSync(process.execPath, ['tools/meshy/terrain-kit.ts', '--dry-run'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, MESHY_API_KEY: '' },
    encoding: 'utf8',
  });
  assert.match(out, /Terrain kit plan: 11 pieces/);
  assert.match(out, /no network/);
});

test('ingest mode has task ids for every kit piece and prompts carry shape hints', () => {
  for (const p of TERRAIN_KIT) {
    const t = RAW_TASKS[p.id];
    assert.ok(t && t.previewTaskId.length === 36 && t.refineTaskId.length === 36, p.id);
    assert.equal(p.targetPolycount, 4000, p.id);
  }
  const prompt = (id: string) => TERRAIN_KIT.find((p) => p.id === id)!.prompt;
  for (const id of ['wall-panel', 'floor-grate', 'platform-edge-trim', 'timber-brace', 'security-bulkhead-frame']) assert.match(prompt(id), /flat thin/i, id);
  for (const id of ['pipe-cluster', 'steel-girder', 'reactor-conduit']) assert.match(prompt(id), /long horizontal/i, id);
  assert.match(prompt('support-pillar'), /tall slender/i);
});

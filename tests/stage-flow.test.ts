import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearFromWorld, defaultProgress, formatStageTime, isStageUnlocked, mergeAbilities, nextStage, parseProgress, recordClear, serializeProgress,
} from '../src/game3d/stageFlow.ts';
import { newWorld3D } from '../src/game3d/world3d.ts';
import { visibleMenu } from '../src/ui/menu.ts';

test('fresh progress: only stage 1 is open', () => {
  const p = defaultProgress();
  assert.deepEqual([1, 2, 3].map((s) => isStageUnlocked(p, s as 1 | 2 | 3)), [true, false, false]);
});

test('parse: null, corrupt, wrong types and old saves default-merge', () => {
  for (const raw of [null, undefined, '', '{', 'null', '5', '[]', '{"cleared":3,"best":"x"}']) assert.deepEqual(parseProgress(raw), defaultProgress());
  const p = parseProgress('{"cleared":{"1":true,"2":"yes","9":true},"best":{"1":91.5,"2":-3,"3":"fast"},"extra":1}');
  assert.equal(p.cleared[1], true);
  assert.equal(p.cleared[2], false);
  assert.equal(p.best[1], 91.5);
  assert.equal(p.best[2], null);
  assert.equal(p.best[3], null);
  assert.equal(isStageUnlocked(p, 2), true);
  assert.equal(isStageUnlocked(p, 3), false);
});

test('serialize round trip', () => {
  let p = recordClear(defaultProgress(), 1, 120).progress;
  p = recordClear(p, 2, 200.5).progress;
  assert.deepEqual(parseProgress(serializeProgress(p)), p);
  assert.equal(isStageUnlocked(p, 3), true);
});

test('recordClear keeps the faster time and flags new bests', () => {
  const a = recordClear(defaultProgress(), 2, 100);
  assert.equal(a.newBest, true);
  const b = recordClear(a.progress, 2, 150);
  assert.equal(b.newBest, false);
  assert.equal(b.progress.best[2], 100);
  const c = recordClear(b.progress, 2, 90.2);
  assert.equal(c.newBest, true);
  assert.equal(c.progress.best[2], 90.2);
  assert.equal(recordClear(defaultProgress(), 3, NaN).progress.best[3], null);
  assert.equal(recordClear(defaultProgress(), 3, NaN).progress.cleared[3], true);
});

test('recordClear does not mutate its input', () => {
  const p = defaultProgress();
  recordClear(p, 1, 50);
  assert.deepEqual(p, defaultProgress());
});

test('nextStage and time format', () => {
  assert.equal(nextStage(1), 2);
  assert.equal(nextStage(3), null);
  assert.equal(formatStageTime(null), '--:--');
  assert.equal(formatStageTime(75.34), '01:15.3');
  assert.equal(formatStageTime(5), '00:05.0');
});

test('mergeAbilities fills missing ability flags with false', () => {
  assert.deepEqual(mergeAbilities({ thrusterBoots: true }), { thrusterBoots: true, crawlSlide: false, blastCore: false, scanLens: false, thermalPlating: false });
  assert.equal(mergeAbilities(null).blastCore, false);
  assert.equal(mergeAbilities({ scanLens: 1 as unknown as boolean }).scanLens, false);
});

test('clearFromWorld only reports a clear for the world stage', () => {
  const w = newWorld3D({ stage: 2 });
  assert.equal(clearFromWorld(w), null);
  w.stageClear = { stage: 2, timeTicks: 600, timeSeconds: 10, kills: 3, totalEnemies: 9, completionPercent: 20 };
  assert.equal(clearFromWorld(w)?.kills, 3);
});

test('title menu offers a Stages entry', () => {
  assert.ok(visibleMenu(false).some((m) => m.id === 'stages-open'));
});

test('debug hooks are gated on a build flag, not on the URL alone', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
  assert.match(src, /const DEBUG_HOOKS = import\.meta\.env\.DEV \|\| \(import\.meta\.env\.VITE_DEBUG_HOOKS === '1' && /);
  assert.ok(!/const DEBUG_HOOKS = [^;]*\|\| \/\[\?&\]debug/.test(src));
});

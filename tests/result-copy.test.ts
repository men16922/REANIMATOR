import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canResume, resultCheckpointLine } from '../src/ui/resultCopy.ts';
import { readLayers } from '../src/ui/debugLayers.ts';

test('result copy: won has no checkpoint line', () => {
  assert.equal(resultCheckpointLine({ won: true, lastSaveId: 'mines_save', nearRespawn: true }), '');
});

test('result copy: lost, no save, not Story retries from the start with the run kept', () => {
  assert.equal(resultCheckpointLine({ won: false, lastSaveId: null, nearRespawn: false }), 'Press C or Enter to retry from the start. Your run is kept.');
});

test('result copy: lost with a save on a Save-station difficulty', () => {
  assert.equal(resultCheckpointLine({ won: false, lastSaveId: 'mines_save', nearRespawn: false }), 'Press C or Enter to resume at the last Save station.');
});

test('result copy: Story respawns near where you fell, with or without a save', () => {
  const line = 'Press C or Enter to resume near where you fell.';
  assert.equal(resultCheckpointLine({ won: false, lastSaveId: null, nearRespawn: true }), line);
  assert.equal(resultCheckpointLine({ won: false, lastSaveId: 'mines_save', nearRespawn: true }), line);
});

test('canResume matches the copy: a defeat is always resumable and the line always offers it', () => {
  for (const lastSaveId of [null, undefined, '', 'save_a']) {
    for (const nearRespawn of [false, true]) {
      const line = resultCheckpointLine({ won: false, lastSaveId, nearRespawn });
      assert.equal(canResume({ lastSaveId, nearRespawn }), true);
      assert.ok(line.startsWith('Press C or Enter'));
    }
  }
});

test('debug layers: loading logo outranks everything, then intro, then title', () => {
  assert.equal(readLayers({ mode: 'playing', titleHidden: true, loadingHidden: false, introHidden: true }).topLayer, 'loading');
  assert.equal(readLayers({ mode: 'playing', titleHidden: true, loadingHidden: true, introHidden: false }).topLayer, 'intro');
  assert.equal(readLayers({ mode: 'title', titleHidden: false, loadingHidden: true, introHidden: true }).topLayer, 'title');
  const play = readLayers({ mode: 'playing', titleHidden: true, loadingHidden: true, introHidden: true });
  assert.deepEqual(play, { title: false, loading: false, intro: false, showcase: false, topLayer: 'playing' });
  assert.equal(readLayers({ mode: 'showcase', titleHidden: true, loadingHidden: true, introHidden: true }).topLayer, 'showcase');
});

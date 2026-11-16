import test from 'node:test';
import assert from 'node:assert/strict';
import { addToRun, defaultRecords, parseBestRun, parseRecords, serializeBestRun, serializeRecords, summarizeRun, updateBestRun, updateRecords, type RunLog } from '../src/game3d/records.ts';

const run = (s: number, d: number, k: number) => ({ seconds: s, deaths: d, kills: k });

test('summary needs all three stages, then sums time, deaths and kills', () => {
  let log: RunLog = {};
  log = addToRun(log, 1, run(100, 1, 10));
  log = addToRun(log, 2, run(200, 0, 20));
  assert.equal(summarizeRun(log), null);
  log = addToRun(log, 3, run(300.5, 2, 30));
  const s = summarizeRun(log);
  assert.ok(s);
  assert.equal(s.totalSeconds, 600.5);
  assert.equal(s.totalDeaths, 3);
  assert.equal(s.totalKills, 60);
  assert.deepEqual(s.perStage.map((p) => p.stage), [1, 2, 3]);
});

test('clearing stage 1 starts a new run; replaying a later stage replaces its entry', () => {
  let log = addToRun(addToRun(addToRun({}, 1, run(10, 0, 1)), 2, run(20, 0, 2)), 3, run(30, 0, 3));
  log = addToRun(log, 3, run(25, 1, 4));
  assert.equal(summarizeRun(log)?.totalSeconds, 55);
  log = addToRun(log, 1, run(9, 0, 1));
  assert.equal(summarizeRun(log), null);
});

test('invalid results are ignored', () => {
  const log = addToRun({}, 1, run(10, 0, 1));
  assert.equal(addToRun(log, 2, run(NaN, 0, 1)), log);
  assert.equal(addToRun(log, 2, run(5, -1, 1)), log);
});

test('best full-run total: first run, faster run, slower run, bad input', () => {
  assert.deepEqual(updateBestRun(null, 600), { best: 600, isNew: true });
  assert.deepEqual(updateBestRun(600, 550), { best: 550, isNew: true });
  assert.deepEqual(updateBestRun(550, 700), { best: 550, isNew: false });
  assert.deepEqual(updateBestRun(550, NaN), { best: 550, isNew: false });
});

test('best-run storage round-trips and survives garbage', () => {
  assert.equal(parseBestRun(serializeBestRun(432.5)), 432.5);
  assert.equal(parseBestRun(serializeBestRun(null)), null);
  for (const bad of [null, undefined, '', '{', '[]', '{"bestTotal":"x"}', '{"bestTotal":-3}', '{"bestTotal":0}']) assert.equal(parseBestRun(bad), null);
});

test('migration: v1 stage records are untouched by the separate full-run key', () => {
  const v1 = serializeRecords(updateRecords(defaultRecords(), 2, run(120, 3, 10)).records);
  assert.equal(parseBestRun(v1), null);
  assert.deepEqual(parseRecords(v1)[2], { bestTime: 120, fewestDeaths: 3, mostKills: 10 });
  assert.equal(parseRecords(serializeBestRun(500))[1].bestTime, null);
});

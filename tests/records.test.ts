import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRecords, parseRecords, recordSummary, RECORDS_KEY, serializeRecords, updateRecords } from '../src/game3d/records.ts';

class MemStore {
  m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, v); }
}

test('first clear sets all records and flags them new', () => {
  const u = updateRecords(defaultRecords(), 2, { seconds: 120.5, deaths: 3, kills: 10 });
  assert.ok(u.newBestTime && u.newFewestDeaths && u.newMostKills);
  assert.deepEqual(u.records[2], { bestTime: 120.5, fewestDeaths: 3, mostKills: 10 });
  assert.equal(u.records[1].bestTime, null);
});

test('better run improves, worse run keeps the old record', () => {
  const a = updateRecords(defaultRecords(), 1, { seconds: 100, deaths: 2, kills: 8 }).records;
  const worse = updateRecords(a, 1, { seconds: 140, deaths: 5, kills: 4 });
  assert.ok(!worse.newBestTime && !worse.newFewestDeaths && !worse.newMostKills);
  assert.deepEqual(worse.records[1], a[1]);
  const better = updateRecords(a, 1, { seconds: 90, deaths: 0, kills: 9 });
  assert.ok(better.newBestTime && better.newFewestDeaths && better.newMostKills);
  assert.deepEqual(better.records[1], { bestTime: 90, fewestDeaths: 0, mostKills: 9 });
  assert.equal(a[1].bestTime, 100, 'input not mutated');
});

test('invalid run values change nothing', () => {
  const u = updateRecords(defaultRecords(), 3, { seconds: NaN, deaths: -1, kills: Infinity });
  assert.deepEqual(u.records[3], { bestTime: null, fewestDeaths: null, mostKills: null });
  assert.ok(!u.newBestTime);
});

test('parse survives corrupt and partial storage', () => {
  assert.deepEqual(parseRecords(null), defaultRecords());
  assert.deepEqual(parseRecords('{not json'), defaultRecords());
  assert.deepEqual(parseRecords('42'), defaultRecords());
  const p = parseRecords(JSON.stringify({ 1: { bestTime: 'x', fewestDeaths: 2, mostKills: -4 }, 2: 7, 9: {} }));
  assert.deepEqual(p[1], { bestTime: null, fewestDeaths: 2, mostKills: null });
  assert.deepEqual(p[2], { bestTime: null, fewestDeaths: null, mostKills: null });
});

test('records round-trip through an in-memory storage stub', () => {
  const s = new MemStore();
  const u = updateRecords(parseRecords(s.getItem(RECORDS_KEY)), 2, { seconds: 75.25, deaths: 1, kills: 6 });
  s.setItem(RECORDS_KEY, serializeRecords(u.records));
  const again = parseRecords(s.getItem(RECORDS_KEY));
  assert.deepEqual(again, u.records);
  assert.equal(recordSummary(again[2]), 'Fewest deaths 1 · Most kills 6');
  assert.equal(recordSummary(again[1]), '');
});

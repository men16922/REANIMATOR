// Restoration Lab pure model: match grid, mismatch search, playback state machine, pose, view fit, sprite data.
// Uses the real S1/S2/S3/M05 fixtures through the same scenario/replay/comparator code as `make check`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHlog } from '../tools/reference/hlog.ts';
import { compare } from '../tools/reference/compare.ts';
import { windowOf, replay, expectedRows, type Fixture, type Scenario } from '../tools/reference/scenario.ts';
import {
  LAB_SPEEDS, LAB_TICK_HZ, SPRITE_H, SPRITE_W, cardTitle, fieldMismatchCounts, firstMismatch, fitView, initialPlayback, matchGrid,
  nextMismatchTick, playAdvance, playReduce, poseOf, runBounds, runFrame, spriteRows, summarize, toScreenX, toScreenY, type Pose,
} from '../src/ui/labModel.ts';

const root = resolve(import.meta.dirname, '..');
const fx = JSON.parse(readFileSync(resolve(root, 'reference/fixtures/scenarios.json'), 'utf8')) as Fixture;

function runCase(s: Scenario, mutation: boolean) {
  const rows = parseHlog(readFileSync(resolve(root, s.expected), 'utf8'));
  const w = windowOf(rows, s);
  assert.ok(w.ok);
  const sc = mutation ? { ...s, terrain: { ...s.terrain, wallLeftX: s.terrain.wallLeftX + 3 } } : s;
  const expected = expectedRows(fx, w.rows);
  const actual = replay(sc, w.rows);
  return { expected, actual, cmp: compare(expected, actual, fx.measuredFields) };
}

// ---- match grid ----

test('every scenario (S1, S2, S3, sealed M05) is a fully green grid', () => {
  assert.equal(fx.scenarios.length, 4);
  for (const s of fx.scenarios) {
    const { expected, actual, cmp } = runCase(s, false);
    const grid = matchGrid(expected, actual, fx.measuredFields);
    const sum = summarize(grid);
    assert.equal(cmp.status, 'PASS', s.id);
    assert.equal(sum.ticks, s.endN - s.startN + 1, s.id);
    assert.equal(sum.fields, 11);
    assert.equal(sum.cells, sum.ticks * 11);
    assert.equal(sum.allMatch, true, s.id);
    assert.equal(sum.mismatched, 0);
    assert.equal(firstMismatch(grid), null);
    assert.equal(nextMismatchTick(grid, 0), null);
    assert.ok(fieldMismatchCounts(grid).every((c) => c === 0));
  }
});

test('S1 is the 100 tick x 11 field case: 1100 cells', () => {
  const s = fx.scenarios[0];
  const { expected, actual } = runCase(s, false);
  assert.equal(summarize(matchGrid(expected, actual, fx.measuredFields)).cells, 1100);
});

test('demo mutation (wall +3 px) is detected, and agrees with the comparator on the first difference', () => {
  let detected = 0;
  for (const s of fx.scenarios) {
    const { expected, actual, cmp } = runCase(s, true);
    const grid = matchGrid(expected, actual, fx.measuredFields);
    const first = firstMismatch(grid);
    if (cmp.status === 'PASS') {
      assert.equal(first, null, `${s.id}: scenario never touches the wall, mutation must be harmless`);
      continue;
    }
    detected++;
    assert.equal(cmp.status, 'FAIL');
    assert.ok(first, s.id);
    assert.equal(first.tick, cmp.firstDifference!.index, `${s.id} first tick`);
    assert.equal(fx.measuredFields[first.field], cmp.firstDifference!.field, `${s.id} first field`);
    const sum = summarize(grid);
    assert.ok(!sum.allMatch && sum.mismatched >= 1 && sum.badTicks >= 1);
    assert.equal(sum.matched + sum.mismatched, sum.cells);
  }
  assert.ok(detected >= 2, 'S1 and S3 both press into the wall');
});

test('S1 mutation: first mismatch is n=33 x (tick 30, the first wall hit), then keeps diverging', () => {
  const s = fx.scenarios[0];
  const { expected, actual } = runCase(s, true);
  const grid = matchGrid(expected, actual, fx.measuredFields);
  const first = firstMismatch(grid)!;
  assert.equal(first.tick, 30);
  assert.equal(fx.measuredFields[first.field], 'x');
  assert.equal(nextMismatchTick(grid, 30), 31);
  assert.equal(nextMismatchTick(grid, grid.length - 1), 30, 'wraps to the first mismatch');
});

test('matchGrid handles length mismatch and NaN as mismatches (never as a silent match)', () => {
  const g = matchGrid([{ a: 1 }, { a: 2 }], [{ a: 1 }], ['a']);
  assert.deepEqual(g, [[true], [false]]);
  assert.deepEqual(matchGrid([{ a: NaN }], [{ a: NaN }], ['a']), [[false]]);
  assert.equal(summarize([]).allMatch, false, 'an empty grid proves nothing');
});

// ---- playback state machine ----

test('playback: play/pause/toggle, step, seek clamp, restart, speed', () => {
  let s = initialPlayback(9);
  assert.deepEqual([s.tick, s.playing, s.speedIdx], [0, false, 2]);
  s = playReduce(s, { type: 'play' });
  assert.equal(s.playing, true);
  s = playReduce(s, { type: 'toggle' });
  assert.equal(s.playing, false);
  s = playReduce(s, { type: 'step', by: -1 });
  assert.equal(s.tick, 0, 'step clamps at 0');
  s = playReduce(s, { type: 'seek', tick: 99 });
  assert.equal(s.tick, 9, 'seek clamps at max');
  s = playReduce(s, { type: 'step', by: 1 });
  assert.equal(s.tick, 9);
  s = playReduce(s, { type: 'restart' });
  assert.equal(s.tick, 0);
  s = playReduce(playReduce(s, { type: 'play' }), { type: 'step', by: 1 });
  assert.equal(s.playing, false, 'stepping pauses');
  for (let i = 0; i < LAB_SPEEDS.length; i++) s = playReduce(s, { type: 'cycleSpeed' });
  assert.equal(s.speedIdx, 2, 'speed cycles back');
  assert.equal(playReduce(s, { type: 'speed', idx: 99 }).speedIdx, LAB_SPEEDS.length - 1);
});

test('playback: 15 Hz at 1x, fractions carry, speed scales, stops on the last tick', () => {
  let s = playReduce(initialPlayback(100), { type: 'play' });
  s = playAdvance(s, 1000);
  assert.equal(s.tick, LAB_TICK_HZ, 'one second at 1x is 15 ticks');
  s = playAdvance(s, 40);
  assert.equal(s.tick, 15, '40 ms is 0.6 tick: not yet');
  s = playAdvance(s, 40);
  assert.equal(s.tick, 16, 'carried fraction reaches the next tick');
  const fast = playAdvance(playReduce(playReduce(initialPlayback(100), { type: 'speed', idx: 4 }), { type: 'play' }), 1000);
  assert.equal(fast.tick, LAB_TICK_HZ * 4);
  const slow = playAdvance(playReduce(playReduce(initialPlayback(100), { type: 'speed', idx: 0 }), { type: 'play' }), 1000);
  assert.equal(slow.tick, 3, '0.25x: 3.75 ticks');
  const end = playAdvance(playReduce(initialPlayback(10), { type: 'play' }), 60_000);
  assert.deepEqual([end.tick, end.playing], [10, false]);
  assert.equal(playReduce(end, { type: 'play' }).tick, 0, 'play on the last tick starts over');
  const paused = initialPlayback(10);
  assert.equal(playAdvance(paused, 5000), paused, 'a paused clip never advances');
  assert.equal(playAdvance(playReduce(paused, { type: 'play' }), -5).tick, 0);
});

test('playback: load resets, clamps tick, and never leaves a stale playing flag', () => {
  let s = playReduce(initialPlayback(9), { type: 'play' });
  s = playReduce(s, { type: 'load', max: 34, tick: 20 });
  assert.deepEqual([s.max, s.tick, s.playing], [34, 20, false]);
  s = playReduce(s, { type: 'load', max: 5, tick: 20 });
  assert.equal(s.tick, 5);
  assert.equal(playReduce(s, { type: 'load', max: -3 }).max, 0);
});

// ---- pose and view ----

test('poseOf maps every state seen in the four logs to a pose', () => {
  const seen = new Set<number>();
  for (const s of fx.scenarios) for (const r of runCase(s, false).expected) seen.add(r.state);
  const poses: Record<number, Pose> = { 2: 'idle', 4: 'rise', 5: 'fall', 6: 'land', 10: 'run' };
  assert.deepEqual([...seen].sort((a, b) => a - b), [2, 4, 5, 6, 10]);
  for (const st of seen) assert.equal(poseOf({ state: st, gravity: 0, xvel: 0, yvel: 0 }), poses[st]);
  assert.equal(poseOf({ state: 99, gravity: 1, xvel: 0, yvel: -3 }), 'rise');
  assert.equal(poseOf({ state: 99, gravity: 1, xvel: 0, yvel: 3 }), 'fall');
  assert.equal(poseOf({ state: 99, gravity: 0, xvel: 4, yvel: 0 }), 'run');
});

test('fitView keeps both runs, the floor and the wall inside the canvas for every scenario and both resolutions', () => {
  for (const s of fx.scenarios) for (const mutation of [false, true]) {
    const { expected, actual } = runCase(s, mutation);
    const terrain = { ...s.terrain, wallLeftX: Math.min(s.terrain.wallLeftX, s.terrain.wallLeftX + (mutation ? 3 : 0)) };
    const b = runBounds([expected, actual], terrain, SPRITE_W, SPRITE_H);
    for (const [w, h, integer] of [[320, 200, true], [640, 400, false]] as const) {
      const v = fitView(b, w, h, integer);
      if (integer) assert.equal(v.scale, Math.floor(v.scale));
      assert.ok(v.scale >= 1, `${s.id} ${w}`);
      for (const r of [...expected, ...actual]) {
        const x = toScreenX(v, r.x), y = toScreenY(v, r.y);
        assert.ok(x - (SPRITE_W / 2) * v.scale >= -1 && x + (SPRITE_W / 2) * v.scale <= w + 1, `${s.id} x in view`);
        assert.ok(y - SPRITE_H * v.scale >= -1 && y <= h + 1, `${s.id} y in view`);
      }
      assert.ok(toScreenY(v, s.terrain.floorY) < h, 'floor line visible');
      assert.ok(toScreenX(v, s.terrain.wallLeftX) >= 0, 'collision plane visible');
    }
  }
});

test('S1 has no ceiling in view (-1000 means none) but S2 does', () => {
  const [s1, s2] = [fx.scenarios[0], fx.scenarios[1]];
  const b1 = runBounds([runCase(s1, false).expected], s1.terrain, SPRITE_W, SPRITE_H);
  const b2 = runBounds([runCase(s2, false).expected], s2.terrain, SPRITE_W, SPRITE_H);
  assert.ok(b1.y0 > -100, 'framing is not stretched toward y=-1000');
  assert.ok(b2.y0 <= s2.terrain.ceilY - 3, 'ceiling at 43 is framed');
});

// ---- sprite ----

test('sprite frames: 22 rows x 12 columns, known glyphs only, feet on the last pose rows', () => {
  const poses: Pose[] = ['idle', 'run', 'rise', 'fall', 'land'];
  const keys = new Set('.oasvghr'.split(''));
  for (const p of poses) for (const f of [0, 1] as const) {
    const rows = spriteRows(p, f);
    assert.equal(rows.length, SPRITE_H, `${p}${f} rows`);
    for (const r of rows) {
      assert.equal(r.length, SPRITE_W, `${p}${f} "${r}"`);
      for (const ch of r) assert.ok(keys.has(ch) || ch === 'a' || ch === 'h', `${p} glyph ${ch}`);
    }
    assert.ok(rows.some((r) => r.includes('v')), `${p} has a visor`);
  }
  assert.notDeepEqual(spriteRows('run', 0), spriteRows('run', 1), 'run alternates two strides');
  assert.deepEqual(spriteRows('idle', 1), spriteRows('idle', 0), 'static poses ignore the stride');
  assert.equal(runFrame(0), 0);
  assert.equal(runFrame(2), 1);
  assert.equal(runFrame(4), 0);
});

test('scenario card titles', () => {
  assert.deepEqual(cardTitle('S1-spawn-fall-run-wall'), { code: 'S1', name: 'Spawn · Fall · Run · Wall' });
  assert.deepEqual(cardTitle('S2-jump'), { code: 'S2', name: 'Jump' });
  assert.deepEqual(cardTitle('S3-wall-air-jump'), { code: 'S3', name: 'Wall · Air · Jump' });
  assert.deepEqual(cardTitle('M05-holdout-jump-in-place'), { code: 'M05', name: 'Jump · In place' });
});

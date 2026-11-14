import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, type Row } from '../tools/reference/compare.ts';
import { parseHlog, HlogError } from '../tools/reference/hlog.ts';
import { loadFixture, runScenario } from '../tools/reference/verify.ts';
import { step, spawnBody, type Body } from '../src/engine/motion.ts';

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ x: i, y: 2 * i }));

// ---- comparator (VERIFICATION_CONTRACT section 9) -------------------------------
test('comparator: identical -> PASS', () => {
  assert.equal(compare(rows(5), rows(5), ['x', 'y']).status, 'PASS');
});
test('comparator: injected difference -> FAIL with first difference', () => {
  const a = rows(5); a[3].y = 99;
  const r = compare(rows(5), a, ['x', 'y']);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.firstDifference, { index: 3, field: 'y', expected: 6, actual: 99 });
});
test('comparator: length mismatch -> FAIL', () => {
  assert.equal(compare(rows(5), rows(4), ['x']).status, 'FAIL');
});
test('comparator: missing actual field -> FAIL', () => {
  const a = rows(3).map((r) => ({ x: r.x }));
  assert.equal(compare(rows(3), a, ['x', 'y']).status, 'FAIL');
});
test('comparator: corrupt expected -> ERROR', () => {
  const e = rows(3); (e[1] as Record<string, number>).y = NaN;
  assert.equal(compare(e, rows(3), ['x', 'y']).status, 'ERROR');
});
test('comparator: missing / empty expected -> NOT RUN, never PASS', () => {
  assert.equal(compare(undefined, rows(2), ['x']).status, 'NOT RUN');
  assert.equal(compare([], [], ['x']).status, 'NOT RUN');
});
test('comparator: no measured fields -> ERROR', () => {
  assert.equal(compare(rows(2), rows(2), []).status, 'ERROR');
});

// ---- hlog loader -------------------------------------------------------------------
test('hlog: rejects empty, malformed, and non-contiguous input', () => {
  assert.throws(() => parseHlog(''), HlogError);
  assert.throws(() => parseHlog('(0 0 0 0  (1 2 3))'), HlogError);
  const f = '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0';
  assert.throws(() => parseHlog(`(0 0 0 0  (${f}))(2 0 0 0  (${f}))`), HlogError);
  assert.throws(() => parseHlog(`(0 0 0 0  (${f}))garbage`), HlogError);
});

// ---- engine boundaries -----------------------------------------------------------
const T = { floorY: 91, ceilY: 43, wallLeftX: 32 };
test('engine: pure (does not mutate its input body)', () => {
  const b = spawnBody(58, 61); const copy = { ...b };
  step(b, { xm: 1, ym: 0 }, T);
  assert.deepEqual(b, copy);
});
test('engine: left wall clamps x and zeroes velocity', () => {
  let b: Body = { ...spawnBody(32, 91), gravity: 0 };
  for (let i = 0; i < 5; i++) b = step(b, { xm: -1, ym: 0 }, T);
  assert.equal(b.x, 32); assert.equal(b.xvel, 0); assert.equal(b.state, 2);
});
test('engine: floor stops a fall', () => {
  let b = spawnBody(58, 61);
  for (let i = 0; i < 40; i++) b = step(b, { xm: 0, ym: 0 }, T);
  assert.equal(b.y, 91); assert.equal(b.gravity, 0);
});

// ---- verifier on real fixtures + mutations ---------------------------------------
test('verifier: development scenarios PASS on the original reference', () => {
  const fx = loadFixture();
  for (const s of fx.scenarios.filter((x) => !x.holdout)) assert.equal(runScenario(fx, s).status, 'PASS', s.id);
});
test('verifier: mutated terrain (wall off by one) -> FAIL, proving the check is not vacuous', () => {
  const fx = loadFixture();
  const s = structuredClone(fx.scenarios[0]); s.terrain.wallLeftX = 31;
  assert.equal(runScenario(fx, s).status, 'FAIL');
});
test('verifier: mutated input script -> ERROR (declared input differs from recorded input)', () => {
  const fx = loadFixture();
  const s = structuredClone(fx.scenarios[0]); s.inputs[0].from = 31;
  assert.equal(runScenario(fx, s).status, 'ERROR');
});
test('verifier: missing reference file -> NOT RUN', () => {
  const fx = loadFixture();
  const s = structuredClone(fx.scenarios[0]); s.expected = 'reference/fixtures/expected/does-not-exist.txt';
  assert.equal(runScenario(fx, s).status, 'NOT RUN');
});

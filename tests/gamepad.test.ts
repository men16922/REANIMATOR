import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeadzone, emptyPadIntent, mapGamepad, risingEdge, type PadSnapshot } from '../src/game3d/gamepad.ts';
import { defaultSettings, parseSettings, serializeSettings } from '../src/game3d/settings.ts';

const pad = (axes: number[] = [0, 0, 0, 0], pressed: number[] = [], values: Record<number, number> = {}): PadSnapshot => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) })),
});

test('deadzone zeroes small stick input and rescales the rest', () => {
  assert.deepEqual(applyDeadzone(0.2, 0.1), { x: 0, y: 0 });
  const full = applyDeadzone(1, 0);
  assert.ok(Math.abs(full.x - 1) < 1e-9 && full.y === 0);
  const mid = applyDeadzone(0.625, 0);
  assert.ok(mid.x > 0 && mid.x < 0.6);
  assert.deepEqual(applyDeadzone(NaN, 0), { x: 0, y: 0 });
});

test('null or idle pad maps to the empty intent', () => {
  assert.deepEqual(mapGamepad(null), emptyPadIntent());
  assert.deepEqual(mapGamepad(pad()), emptyPadIntent());
});

test('stick and dpad move; dpad wins; drop through on stick down or dpad down', () => {
  assert.equal(mapGamepad(pad([1, 0, 0, 0])).moveX, 1);
  assert.equal(mapGamepad(pad([-1, 0, 0, 0])).moveX, -1);
  assert.equal(mapGamepad(pad([0.1, 0, 0, 0])).moveX, 0);
  assert.equal(mapGamepad(pad([-1, 0, 0, 0], [15])).moveX, 1);
  assert.equal(mapGamepad(pad([0, 1, 0, 0])).dropDown, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [13])).dropDown, true);
});

test('face buttons, triggers, bumpers and start', () => {
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [0])).jump, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [1])).dash, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [2])).fire, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [], { 7: 0.9 })).fire, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [], { 7: 0.1 })).fire, false);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [3])).interact, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [4])).weaponPrev, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [5])).weaponNext, true);
  assert.equal(mapGamepad(pad([0, 0, 0, 0], [9])).start, true);
});

test('aim prefers the right stick, falls back to the left stick, y is up', () => {
  assert.equal(mapGamepad(pad()).aim, null);
  const r = mapGamepad(pad([0, 0, 0, -1])).aim!;
  assert.ok(r.y > 0.9 && Math.abs(r.x) < 1e-9);
  const l = mapGamepad(pad([1, 0, 0, 0])).aim!;
  assert.ok(l.x > 0.9);
  const both = mapGamepad(pad([1, 0, -1, 0])).aim!;
  assert.ok(both.x < 0);
});

test('risingEdge fires once', () => {
  assert.equal(risingEdge(false, true), true);
  assert.equal(risingEdge(true, true), false);
  assert.equal(risingEdge(true, false), false);
});

test('settings roundtrip and safe parse', () => {
  const s = { reduceFx: true, largeHud: true };
  assert.deepEqual(parseSettings(serializeSettings(s)), s);
  assert.deepEqual(parseSettings(null), defaultSettings());
  assert.deepEqual(parseSettings('{not json'), defaultSettings());
  assert.deepEqual(parseSettings('{"reduceFx":"yes","largeHud":1}'), defaultSettings());
  assert.deepEqual(parseSettings('{"reduceFx":true}'), { reduceFx: true, largeHud: false });
});

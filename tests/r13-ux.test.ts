import test from 'node:test';
import assert from 'node:assert/strict';
import { readLayers } from '../src/ui/debugLayers.ts';
import { mergedPopupText, popupCeilWorldY, PopupPool } from '../src/render3d/popups3d.ts';
import { classicStatusText } from '../src/ui/classicHud.ts';
import { newWorld3D, visibleHint } from '../src/game3d/world3d.ts';

const OPTS = { size: 1, life: 1, r: 1, g: 1, b: 1, rise: 1, punch: 0.5, stack: true };

test('readLayers: a layer counts only when it is really on screen', () => {
  const l = readLayers({ mode: 'playing', titleHidden: true, loadingHidden: true, introHidden: true });
  assert.deepEqual(l, { title: false, loading: false, intro: false, showcase: false, topLayer: 'playing' });
  const t = readLayers({ mode: 'title', titleHidden: false, loadingHidden: false, introHidden: true });
  assert.equal(t.topLayer, 'loading');
  assert.equal(readLayers({ mode: 'showcase', titleHidden: true, loadingHidden: true, introHidden: true }).topLayer, 'showcase');
});

test('mergedPopupText: count suffix, or the summed value when too long', () => {
  assert.equal(mergedPopupText(14, 2), '14x2');
  assert.equal(mergedPopupText(14, 3), '14x3');
  assert.equal(mergedPopupText(120, 12), String(120 * 12));
});

test('PopupPool merges identical rapid hits and keeps different values apart', () => {
  const p = new PopupPool();
  p.spawn('14', 3, 2, { ...OPTS, merge: 14 });
  p.spawn('14', 3.2, 2, { ...OPTS, merge: 14 });
  assert.equal(p.count, 1);
  assert.equal(p.text[0], '14x2');
  p.spawn('9', 3, 2, { ...OPTS, merge: 9 });
  assert.equal(p.count, 2);
  p.spawn('14', 30, 2, { ...OPTS, merge: 14 });
  assert.equal(p.count, 3, 'far apart popups do not merge');
});

test('PopupPool does not merge once the popup is older than 0.4 s', () => {
  const p = new PopupPool();
  p.spawn('14', 3, 2, { ...OPTS, merge: 14 });
  p.age[0] = 0.5;
  p.spawn('14', 3, 2, { ...OPTS, merge: 14 });
  assert.equal(p.count, 2);
});

test('PopupPool.write clamps glyph y to the ceiling', () => {
  const p = new PopupPool();
  p.spawn('14', 3, 50, { ...OPTS });
  const n = p.write(1.2, 5);
  assert.ok(n > 0);
  for (let i = 0; i < n; i++) assert.ok(p.aPos[i * 4 + 1] <= 5 + 1e-6);
  const m = p.write(1.2);
  assert.ok(p.aPos[1] > 5 && m === n);
});

test('visibleHint: a sector-scoped hint is hidden outside its sector', () => {
  const w = newWorld3D();
  w.hint = 'RECLAIMER OFFLINE. THE ZONE IS SAFE';
  w.hintTicks = 100;
  w.hintSector = 'biolabs';
  w.currentRoom = 'core';
  assert.equal(visibleHint(w), '');
  w.currentRoom = 'biolabs';
  assert.equal(visibleHint(w), w.hint);
  w.hintSector = '';
  w.currentRoom = 'core';
  assert.equal(visibleHint(w), w.hint, 'global hints show everywhere');
  w.hintTicks = 0;
  assert.equal(visibleHint(w), '');
});

test('classicStatusText: ready, cooling and clamped values', () => {
  assert.equal(classicStatusText({ dashPct: 100, lightOn: true, batteryPct: 80.4, scan: 'READY', boots: false }), 'DASH RDY  LIGHT ON 80%  SCAN READY');
  assert.equal(classicStatusText({ dashPct: -5, lightOn: false, batteryPct: 140, scan: '4S', boots: true }), 'DASH 0%  LIGHT OFF 100%  SCAN 4S  BOOTS');
});

test('popupCeilWorldY maps an NDC ceiling onto the z = 0 lane', () => {
  assert.equal(popupCeilWorldY(-1, 1, 0), 5);
  assert.equal(popupCeilWorldY(-0.5, 0.5, 0.5), 10);
  assert.equal(popupCeilWorldY(0.2, 0.2, 0.5), Infinity);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readLayers } from '../src/ui/debugLayers.ts';
import { mergedPopupText, popupCeilWorldY, PopupPool, POPUP_MERGE_MAX } from '../src/render3d/popups3d.ts';
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

test('PopupPool: merging stops at the cap and ignores popups that floated away', () => {
  const pool = new PopupPool();
  const o = { size: 1, life: 1, r: 1, g: 1, b: 1, merge: 14 };
  for (let i = 0; i < 12; i++) pool.spawn('14', 0, 1, o);
  assert.ok(pool.count >= 2, 'sustained fire starts new popups instead of growing one forever');
  assert.ok(Math.max(...Array.from(pool.hits.slice(0, pool.count))) <= POPUP_MERGE_MAX);
  const p2 = new PopupPool();
  p2.spawn('14', 0, 1, o);
  p2.update(0.3);
  p2.spawn('14', 0, 1 - 2, o);
  assert.equal(p2.count, 2, 'a hit far below the risen popup is its own number');
});

test('door lock hints are bound to the sector where they fired (roomHint)', async () => {
  const { tryOpenDoor3D } = await import('../src/game3d/world3d.ts');
  const w = newWorld3D();
  const door = w.level.solids.find((s) => s.doorId && s.doorLock === 'blue');
  assert.ok(door);
  w.currentRoom = 'airlock';
  tryOpenDoor3D(w, door!, 0);
  assert.equal(w.hintSector, 'airlock', 'door lock hints are bound to the place');
});

test('setHint defaults to a global hint (pickups and saves survive a sector change)', async () => {
  const { setHint } = await import('../src/game3d/world3d.ts');
  const w = newWorld3D();
  w.currentRoom = 'airlock';
  setHint(w, 'PICKED UP');
  assert.equal(w.hintSector, '', 'a plain setHint carries no sector');
  w.currentRoom = 'biolabs';
  assert.equal(visibleHint(w), w.hint);
});

test('stepGlide: a pop becomes a decaying offset, the runner keeps its speed and never surges', async () => {
  const { stepGlide, GLIDE_WINDOW } = await import('../src/render3d/enemyMotion.ts');
  const dt = 1 / 60, v = 6.1;
  // pop: raw jumps 0.7 m ahead; the display stays put (offset -0.7) and the offset decays
  let raw = 0.7, off = -0.7, snap = GLIDE_WINDOW, active = true, disp = 0, maxExtra = 0, maxGap = 0, last = 0;
  for (let i = 0; i < 400 && active; i++) {
    raw += v * dt;
    const g = stepGlide(off, snap, dt);
    const next = raw + g.off;
    maxExtra = Math.max(maxExtra, Math.abs(next - disp - v * dt));
    maxGap = Math.max(maxGap, Math.abs(g.off));
    disp = next; off = g.off; snap = g.snap; active = g.active; last = i;
  }
  assert.equal(active, false, 'the glide ends');
  assert.ok(last < 60, `and ends within a second (${last} frames)`);
  assert.ok(maxGap <= 0.7, `the gap never grows past the pop (${maxGap.toFixed(3)} m): no lag build-up behind a runner`);
  assert.ok(maxExtra < 0.1, `per-frame extra over the run speed stays small (${maxExtra.toFixed(3)} m)`);
  assert.equal(disp, raw);
  assert.deepEqual(stepGlide(3, GLIDE_WINDOW, dt), { off: 0, snap: 0, active: false }, 'a teleport is not glided');
});

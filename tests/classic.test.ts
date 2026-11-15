// Classic View pure logic: palette, Bayer dither, quantiser, integer-scale layout, aim remap, transition curve,
// preference parsing, pixel font and HUD helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bayerThreshold,
  BAYER4,
  buildPalette,
  CLASSIC_HEIGHT,
  classicOrthoHalf,
  computeClassicLayout,
  ditherQuantize,
  nearestPaletteIndex,
  PALETTE_SIZE,
  parseCrt,
  parseViewMode,
  remapNdcToClassic,
  toggleViewMode,
  transitionFrame,
  transitionLabel,
  viewLabel,
} from '../src/render3d/classicLogic.ts';
import { ammoText, fitText, hpSegments, hudKey } from '../src/ui/classicHud.ts';
import { glyphRows, GLYPH_CHARS, GLYPH_H, GLYPH_W, textPixels, textWidth } from '../src/ui/pixelFont.ts';

test('palette: 256 deterministic colours, dark to light ramps', () => {
  const a = buildPalette();
  const b = buildPalette();
  assert.equal(a.length, PALETTE_SIZE * 3);
  assert.deepEqual([...a], [...b]);
  const luma = (i: number): number => a[i * 3] * 0.3 + a[i * 3 + 1] * 0.59 + a[i * 3 + 2] * 0.11;
  for (let r = 0; r < 16; r++) for (let s = 1; s < 16; s++) assert.ok(luma(r * 16 + s) >= luma(r * 16 + s - 1) - 1e-9, `ramp ${r} step ${s}`);
  const distinct = new Set<string>();
  for (let i = 0; i < PALETTE_SIZE; i++) distinct.add(`${a[i * 3]},${a[i * 3 + 1]},${a[i * 3 + 2]}`);
  assert.ok(distinct.size >= 240, `distinct colours ${distinct.size}`);
});

test('quantiser: palette colours map to themselves, extremes map to dark and light', () => {
  const p = buildPalette();
  for (const i of [0, 17, 99, 150, 255]) {
    const j = nearestPaletteIndex(p, p[i * 3] / 255, p[i * 3 + 1] / 255, p[i * 3 + 2] / 255);
    assert.deepEqual([p[j * 3], p[j * 3 + 1], p[j * 3 + 2]], [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
  }
  const black = nearestPaletteIndex(p, 0, 0, 0);
  const white = nearestPaletteIndex(p, 1, 1, 1);
  assert.ok(p[black * 3] + p[black * 3 + 1] + p[black * 3 + 2] < 60);
  assert.ok(p[white * 3] + p[white * 3 + 1] + p[white * 3 + 2] > 600);
});

test('bayer 4x4: permutation of 0..15, centred thresholds, tiles every 4 px', () => {
  assert.deepEqual([...BAYER4].sort((x, y) => x - y), Array.from({ length: 16 }, (_, i) => i));
  let sum = 0;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) sum += bayerThreshold(x, y);
  assert.ok(Math.abs(sum) < 1e-9);
  assert.equal(bayerThreshold(5, 9), bayerThreshold(1, 1));
  assert.equal(bayerThreshold(-3, -3), bayerThreshold(1, 1));
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) assert.ok(bayerThreshold(x, y) >= -0.5 && bayerThreshold(x, y) < 0.5);
});

test('dither: flat mid-tone alternates between two palette entries across the matrix', () => {
  const p = buildPalette();
  // Between two adjacent shades of ramp 5 (olive).
  const lo = 5 * 16 + 6;
  const hi = 5 * 16 + 7;
  const mix = [0, 1, 2].map((c) => (p[lo * 3 + c] + p[hi * 3 + c]) / 2 / 255) as [number, number, number];
  const seen = new Set<number>();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) seen.add(ditherQuantize(p, x, y, mix[0], mix[1], mix[2]).index);
  assert.ok(seen.size >= 2, 'dither must use more than one entry');
  const a = ditherQuantize(p, 2, 3, 0.4, 0.3, 0.2);
  const b = ditherQuantize(p, 6, 7, 0.4, 0.3, 0.2);
  assert.equal(a.index, b.index);
});

test('layout: height 200, integer scale, pixel perfect at 16:10', () => {
  for (const [bw, bh, scale] of [[1280, 800, 4], [1920, 1200, 6], [1600, 1000, 5], [320, 200, 1]] as const) {
    const l = computeClassicLayout(bw, bh);
    assert.equal(l.h, CLASSIC_HEIGHT);
    assert.equal(l.w, 320);
    assert.equal(l.scale, scale);
    assert.equal(l.viewW, 320 * scale);
    assert.equal(l.offX, 0);
    assert.equal(l.offY, 0);
  }
});

test('layout: non-multiple buffers get centred black bars and never overflow', () => {
  for (const [bw, bh] of [[1440, 900], [880, 550], [1000, 800], [150, 90], [2000, 1000]] as const) {
    const l = computeClassicLayout(bw, bh);
    assert.ok(Number.isInteger(l.scale) && l.scale >= 1);
    assert.equal(l.viewW, l.w * l.scale);
    assert.equal(l.viewH, 200 * l.scale);
    assert.ok(l.offX >= 0 && l.offX + l.viewW <= bw || l.scale === 1, `x fit ${bw}x${bh}`);
    assert.ok(l.offY >= 0 || l.scale === 1);
  }
  const l = computeClassicLayout(1440, 900);
  assert.equal(l.scale, 4);
  assert.equal(l.offX, 80);
  assert.equal(l.offY, 50);
});

test('aim remap: identity without bars, centre stays centre, bar edge falls outside', () => {
  const exact = computeClassicLayout(1280, 800);
  const m = remapNdcToClassic(0.25, -0.5, exact, 1280, 800);
  assert.ok(Math.abs(m.x - 0.25) < 1e-9 && Math.abs(m.y + 0.5) < 1e-9);
  const boxed = computeClassicLayout(1440, 900);
  const c = remapNdcToClassic(0, 0, boxed, 1440, 900);
  assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.y) < 1e-9);
  assert.ok(remapNdcToClassic(-1, 0, boxed, 1440, 900).x < -1);
});

test('ortho half extents follow aspect and zoom', () => {
  const a = classicOrthoHalf(1.6, 1);
  assert.ok(Math.abs(a.halfW / a.halfH - 1.6) < 1e-9);
  assert.ok(classicOrthoHalf(1.6, 2).halfH < a.halfH);
});

test('transition: 0.4 s, mosaic peaks at the switch, no mosaic at the ends', () => {
  assert.equal(transitionFrame(0).block, 1);
  assert.equal(transitionFrame(0).switched, false);
  const mid = transitionFrame(0.2);
  assert.equal(mid.switched, true);
  assert.ok(mid.block >= 28);
  assert.equal(transitionFrame(0.4).done, true);
  assert.equal(transitionFrame(0.4).block, 1);
  assert.equal(transitionFrame(5).t, 1);
  assert.equal(transitionFrame(-1).t, 0);
  assert.equal(transitionLabel('classic'), '1996');
  assert.equal(transitionLabel('modern'), '2026');
});

test('preferences: parse, toggle, labels', () => {
  assert.equal(parseViewMode('classic'), 'classic');
  for (const bad of [null, undefined, '', 'Classic', 'modern', 'x']) assert.equal(parseViewMode(bad as string | null), 'modern');
  assert.equal(toggleViewMode('modern'), 'classic');
  assert.equal(toggleViewMode('classic'), 'modern');
  assert.equal(parseCrt('1'), true);
  for (const bad of [null, undefined, '0', 'true', '']) assert.equal(parseCrt(bad as string | null), false);
  assert.equal(viewLabel('classic'), 'Classic 1996');
  assert.equal(viewLabel('modern'), 'Modern');
});

test('pixel font: every glyph is 5x7 and text layout is consistent', () => {
  for (const ch of GLYPH_CHARS) {
    const rows = glyphRows(ch);
    assert.equal(rows.length, GLYPH_H, ch);
    for (const r of rows) assert.equal(r.length, GLYPH_W, ch);
  }
  for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.ok(textPixels(ch).length > 0, ch);
  assert.deepEqual(glyphRows('a'), glyphRows('A'));
  assert.deepEqual(glyphRows('@'), glyphRows('?'));
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('1996'), 4 * 6 - 1);
  const px = textPixels('HP');
  assert.ok(px.every(([x, y]) => x >= 0 && x < textWidth('HP') && y >= 0 && y < GLYPH_H));
});

test('classic HUD helpers', () => {
  assert.equal(hpSegments(0, 100, 12), 0);
  assert.equal(hpSegments(1, 1000, 12), 1);
  assert.equal(hpSegments(100, 100, 12), 12);
  assert.equal(hpSegments(50, 100, 12), 6);
  assert.equal(ammoText(1, 5, true), 'INF');
  assert.equal(ammoText(2, 14, true), '14');
  assert.equal(ammoText(3, 5, false), '--');
  assert.equal(ammoText(4, -3, true), 'INF');
  assert.equal(fitText('Cryo Airlock Bay Extra', 14), 'CRYO AIRLOCK B');
  const base = { hp: 10, maxHp: 120, energyTanks: 0, weapon: 1 as const, unlocked: [true, false, false, false, false, false] as const, ammo: [-1, 0, 0, 0, 0, 0] as const, kills: 0, sector: 'A' };
  assert.notEqual(hudKey(base), hudKey({ ...base, hp: 11 }));
  assert.equal(hudKey(base), hudKey({ ...base }));
});

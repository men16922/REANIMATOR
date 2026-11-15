import test from 'node:test';
import assert from 'node:assert/strict';
import { beaconAngle, flickerLevel, floorBelow, hash01, isLampProp, lampMode, lampSeed, reactorPulse, SECTOR_LAMP_FAULTS } from '../src/render3d/mood3d.ts';
import { ChunkPool, DecalPool, decalFade, DECAL_LIFE, GoreSim, goreScale, parseGoreLevel } from '../src/render3d/gore3d.ts';
import { SECTOR_GRADE } from '../src/render3d/fx3d.ts';

test('hash01 is deterministic and in range', () => {
  for (let i = 0; i < 200; i++) {
    const h = hash01(i);
    assert.ok(h >= 0 && h < 1);
    assert.equal(h, hash01(i));
  }
});

test('flickerLevel: deterministic, bounded, steady lamps stay near 1', () => {
  for (let t = 0; t < 30; t += 0.037) {
    for (const mode of ['steady', 'flicker', 'dying'] as const) {
      const a = flickerLevel(mode, 123, t);
      assert.equal(a, flickerLevel(mode, 123, t));
      assert.ok(a >= 0 && a <= 1.0001);
      if (mode === 'steady') assert.ok(a >= 0.94);
    }
  }
});

test('flickerLevel: a flicker lamp does go dark in bursts, a dying lamp more often', () => {
  const dark = (mode: 'flicker' | 'dying'): number => {
    let n = 0;
    for (let t = 0; t < 60; t += 1 / 60) if (flickerLevel(mode, 42, t) < 0.2) n++;
    return n;
  };
  assert.ok(dark('flicker') > 0);
  assert.ok(dark('dying') > dark('flicker'));
});

test('flickerLevel: reduce flashing removes strobing (never below 0.6)', () => {
  for (let t = 0; t < 60; t += 1 / 30) {
    assert.ok(flickerLevel('flicker', 7, t, true) > 0.8);
    assert.ok(flickerLevel('dying', 7, t, true) > 0.55);
  }
});

test('lampMode: fault share per sector is roughly as configured', () => {
  for (const [sector, [f, d]] of Object.entries(SECTOR_LAMP_FAULTS)) {
    let flick = 0;
    let dying = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const m = lampMode(sector as keyof typeof SECTOR_LAMP_FAULTS, i);
      if (m === 'flicker') flick++;
      if (m === 'dying') dying++;
    }
    assert.ok(Math.abs(flick / N - f) < 0.04, `${sector} flicker ${flick / N}`);
    assert.ok(Math.abs(dying / N - d) < 0.04, `${sector} dying ${dying / N}`);
  }
});

test('lampSeed is stable; isLampProp skips thin indicator strips', () => {
  assert.equal(lampSeed(3.25, 9), lampSeed(3.25, 9));
  assert.ok(isLampProp({ kind: 'glow', sx: 1.2, sy: 0.1 }));
  assert.ok(!isLampProp({ kind: 'glow', sx: 0.5, sy: 0.05 }));
  assert.ok(!isLampProp({ kind: 'halo', sx: 1.2, sy: 0.1 }));
});

test('beacon and reactor helpers', () => {
  assert.ok(beaconAngle(2, 1, false) > beaconAngle(1, 1, false));
  assert.equal(beaconAngle(1, 1, true), beaconAngle(50, 1, true));
  for (let t = 0; t < 20; t += 0.05) {
    const p = reactorPulse(t);
    assert.ok(p >= 0.3 && p <= 1.01);
    const r = reactorPulse(t, true);
    assert.ok(r >= 0.4 && r <= 0.7);
  }
});

test('floorBelow finds the highest lane solid under the lamp', () => {
  const solids = [
    { minX: 0, maxX: 10, minY: -1, maxY: 0, minZ: -1, maxZ: 1 },
    { minX: 2, maxX: 6, minY: 2, maxY: 3, minZ: -1, maxZ: 1 },
    { minX: 2, maxX: 6, minY: 2, maxY: 5, minZ: -1, maxZ: 1, doorId: 'd' },
    { minX: 2, maxX: 6, minY: 2, maxY: 4, minZ: 1.5, maxZ: 3 },
  ];
  assert.equal(floorBelow(solids, 4, 8, -9), 3);
  assert.equal(floorBelow(solids, 8, 8, -9), 0);
  assert.equal(floorBelow(solids, 20, 8, -9), -9);
});

test('gore level parsing and scale', () => {
  assert.equal(parseGoreLevel(null), 'full');
  assert.equal(parseGoreLevel('low'), 'low');
  assert.equal(parseGoreLevel('off'), 'off');
  assert.equal(parseGoreLevel('bogus'), 'full');
  assert.equal(goreScale('full'), 1);
  assert.equal(goreScale('off'), 0);
  assert.ok(goreScale('low') > 0 && goreScale('low') < 1);
});

test('DecalPool: ring reuse at capacity and lifetime expiry', () => {
  const d = new DecalPool(4);
  for (let i = 0; i < 10; i++) d.add(i, 0, 0, 1, 0, true, 1, 0, 0, 5);
  assert.equal(d.count, 4);
  assert.equal(d.spawned, 10);
  d.update(4.9);
  assert.equal(d.count, 4);
  d.update(0.2);
  assert.equal(d.count, 0);
});

test('decalFade holds then fades to zero', () => {
  assert.equal(decalFade(0, DECAL_LIFE), 1);
  assert.equal(decalFade(DECAL_LIFE - 10, DECAL_LIFE), 1);
  assert.ok(decalFade(DECAL_LIFE - 3, DECAL_LIFE) > 0.4 && decalFade(DECAL_LIFE - 3, DECAL_LIFE) < 0.6);
  assert.equal(decalFade(DECAL_LIFE, DECAL_LIFE), 0);
});

test('ChunkPool: chunks fall, bounce, settle on the floor and expire', () => {
  const c = new ChunkPool(8);
  c.add(0, 3, 0, 2, 4, 0, 0.2, 0.2, 0.2, 0, 1, 0, 0, 0, 0, 5, 5, 0);
  let landed = 0;
  for (let t = 0; t < 3; t += 1 / 60) c.update(1 / 60, () => landed++);
  assert.equal(landed, 1);
  assert.ok(Math.abs(c.y[0] - 0) < 1e-6);
  assert.equal(c.vy[0], 0);
  for (let t = 0; t < 6; t += 1 / 60) c.update(1 / 60);
  assert.equal(c.count, 0);
});

test('GoreSim: counts follow the level and Off spawns nothing', () => {
  const run = (level: 'full' | 'low' | 'off'): { chunks: number; decals: number } => {
    const g = new GoreSim();
    g.level = level;
    g.spawnKill('stalker', 0, 1, 0, 1);
    return { chunks: g.chunks.count, decals: g.decals.count };
  };
  const full = run('full');
  const low = run('low');
  const off = run('off');
  assert.ok(full.chunks >= 10 && full.decals >= 4);
  assert.ok(low.chunks > 0 && low.chunks < full.chunks);
  assert.deepEqual(off, { chunks: 0, decals: 0 });
  const g = new GoreSim();
  g.level = 'off';
  g.spawnHit('crawler', 0, 1, 0, 1);
  assert.equal(g.chunks.count, 0);
});

test('GoreSim: crawler gore is green, stalker gore is red; deterministic', () => {
  const mean = (kind: 'crawler' | 'stalker'): number[] => {
    const g = new GoreSim();
    g.spawnKill(kind, 0, 1, 0, 1);
    let r = 0, gg = 0;
    for (let i = 0; i < g.decals.count; i++) { r += g.decals.r[i]; gg += g.decals.g[i]; }
    return [r, gg];
  };
  const [cr, cg] = mean('crawler');
  const [sr, sg] = mean('stalker');
  assert.ok(cg > cr);
  assert.ok(sr > sg);
  assert.deepEqual(mean('crawler'), mean('crawler'));
});

test('GoreSim: landing chunks leave stains that fade away', () => {
  const g = new GoreSim();
  g.spawnKill('stalker', 0, 1, 0, 1);
  const before = g.decals.count;
  for (let t = 0; t < 2; t += 1 / 60) g.update(1 / 60);
  assert.ok(g.decals.count > before);
  for (let t = 0; t < 30; t += 1 / 60) g.update(1 / 60);
  assert.equal(g.decals.count, 0);
  assert.equal(g.chunks.count, 0);
});

test('sector grade table keeps readability: positive gains, saturation and contrast in range, rusty mines', () => {
  for (const [name, gr] of Object.entries(SECTOR_GRADE)) {
    for (const v of gr.gain) assert.ok(v >= 0.75 && v <= 1.2, `${name} gain`);
    assert.ok(gr.sat >= 0.85 && gr.sat <= 1.2, `${name} sat`);
    assert.ok(gr.contrast >= 1.0 && gr.contrast <= 1.2, `${name} contrast`);
    assert.ok(gr.vignette <= 0.65, `${name} vignette`);
  }
  assert.ok(SECTOR_GRADE.mines.gain[0] > SECTOR_GRADE.mines.gain[2] + 0.25);
  assert.ok(SECTOR_GRADE.biolabs.gain[1] > SECTOR_GRADE.biolabs.gain[0]);
});

// R25 terrain surfaces: shader-chunk guard, per-stage looks, edge trim geometry, strip tiling, texture files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { patchNormalChunk, surfaceLookFor, type SurfaceId } from '../src/render3d/terrainSurfaces.ts';
import { buildTrimGeometry, wantsEdgeTrim, TRIM_HEIGHT } from '../src/render3d/edgeTrim.ts';
import { makeTileableWH, TEXTURES } from '../tools/meshy/textures.ts';

test('three still exposes the normal-map sampling call the two-surface patch rewrites', () => {
  const patched = patchNormalChunk(THREE.ShaderChunk.normal_fragment_maps);
  assert.ok(patched, 'three changed normal_fragment_maps: update applyTwoSurface');
  assert.ok(patched.includes('normalMap2') && patched.includes('vTopFace'));
  assert.equal(patchNormalChunk('// no sampling here'), null);
});

test('stage 2 and 3 use separate top and side textures, grates use the grating', () => {
  assert.deepEqual([surfaceLookFor(2, 'mines').top, surfaceLookFor(2, 'mines').side], ['foundry-iron', 'foundry-wall']);
  assert.deepEqual([surfaceLookFor(3, 'core').top, surfaceLookFor(3, 'core').side], ['reactor-floor-calm', 'reactor-wall']);
  for (const stage of [1, 2, 3]) assert.equal(surfaceLookFor(stage, 'shaft', 'grate').top, 'steel-grating');
  assert.equal(surfaceLookFor(1, 'biolabs').top, 's1-floor');
});

test('every texture the looks reference ships as albedo and normal WebP', () => {
  const ids = new Set<SurfaceId>();
  for (const stage of [1, 2, 3]) for (const sector of ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'] as const) for (const cls of [undefined, 'grate']) {
    const l = surfaceLookFor(stage, sector, cls);
    ids.add(l.top);
    ids.add(l.side);
  }
  for (const id of ids) {
    assert.ok(existsSync(`public/assets/textures/${id}.webp`), `${id}.webp`);
    assert.ok(existsSync(`public/assets/textures/${id}-n.webp`), `${id}-n.webp`);
    assert.ok(TEXTURES.some((t) => t.id === id), `${id} registered`);
  }
  assert.ok(existsSync('public/assets/textures/hazard-trim.webp'));
  assert.ok(!existsSync('public/assets/textures/s1-floor-r.webp'), 'unused roughness maps are no longer shipped');
});

test('edge trim: only wide, thick-enough platform and catwalk lips; one merged geometry with world-anchored U', () => {
  assert.equal(wantsEdgeTrim('platform', 4, 0.28), true);
  assert.equal(wantsEdgeTrim('catwalk', 10, 1.2), true);
  assert.equal(wantsEdgeTrim('platform', 1, 0.28), false);
  assert.equal(wantsEdgeTrim('wall', 8, 3), false);
  assert.equal(wantsEdgeTrim('crate', 2, 1), false);
  assert.equal(buildTrimGeometry([]), null);
  const g = buildTrimGeometry([{ minX: 0, maxX: 4, top: 2, z: 1 }, { minX: 4, maxX: 6, top: 2, z: 1 }])!;
  assert.equal(g.attributes.position.count, 8);
  assert.ok(Math.abs(g.boundingBox!.max.y - 2) < 1e-6 && Math.abs(g.boundingBox!.min.y - (2 - TRIM_HEIGHT)) < 1e-6);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Second strip starts at x=4: its first U equals the first strip's right-edge U (continuous run).
  assert.ok(Math.abs(uv.getX(4) - uv.getX(1)) < 1e-6);
});

test('strip tiling cross-fades along x only and wraps without a seam', () => {
  const w = 16;
  const h = 4;
  const src = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) src[(y * w + x) * 3 + c] = x * 15 + y;
  const out = makeTileableWH(src, w, h, 3, true, false);
  for (let y = 0; y < h; y++) {
    const first = out[(y * w) * 3];
    const last = out[(y * w + w - 1) * 3];
    assert.ok(Math.abs(first - last) <= 24, `row ${y} edges close (${first} vs ${last})`);
  }
  // Rows are not mixed vertically: same x, different y keeps the row offset.
  assert.equal(out[(1 * w + 8) * 3] - out[(0 * w + 8) * 3], 1);
});

// Build/dispose pairing for the render modules that own GPU resources (geometry, material, texture) and scene children.
// A module's dispose() must remove everything it added and free every resource it created, so replacing a level
// (restart, demo checkpoint, showcase cut) never stacks meshes or textures. Runs in node with a stubbed 2D canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { buildDecor3D } from '../src/render3d/decor3d.ts';
import { buildHazards3D } from '../src/render3d/hazards3d.ts';
import { buildMetroid3D } from '../src/render3d/metroid3d.ts';
import { buildMood3D } from '../src/render3d/mood3dGfx.ts';

const level = buildFacilityMap3D();

function withCanvasStub<T>(fn: () => T): T {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    return fn();
  } finally {
    g.document = prev;
  }
}

interface Tracked {
  geos: Set<THREE.BufferGeometry>;
  mats: Set<THREE.Material>;
  texs: Set<THREE.Texture>;
}

function collect(scene: THREE.Scene): Tracked {
  const t: Tracked = { geos: new Set(), mats: new Set(), texs: new Set() };
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) t.geos.add(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      t.mats.add(mat);
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) t.texs.add(v);
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const e of Object.values(u)) if (e.value instanceof THREE.Texture) t.texs.add(e.value);
    }
  });
  return t;
}

function watch(t: Tracked): { disposed: Set<unknown> } {
  const disposed = new Set<unknown>();
  for (const x of [...t.geos, ...t.mats, ...t.texs]) x.addEventListener('dispose', () => disposed.add(x));
  return { disposed };
}

const MODULES: Array<{ name: string; build: (s: THREE.Scene) => { dispose(): void }; ownsTextures: boolean }> = [
  { name: 'decor3d', build: (s) => buildDecor3D(s, level, new Proxy({}, { get: () => new THREE.Texture() }) as never), ownsTextures: false },
  { name: 'mood3dGfx', build: (s) => buildMood3D(s, level), ownsTextures: true },
  { name: 'hazards3d', build: (s) => buildHazards3D(s, level), ownsTextures: true },
  { name: 'metroid3d', build: (s) => buildMetroid3D(s, level), ownsTextures: true },
];

for (const mod of MODULES) {
  test(`${mod.name}: dispose() removes its scene children and frees every geometry and material`, () => {
    withCanvasStub(() => {
      const scene = new THREE.Scene();
      const before = scene.children.length;
      const built = mod.build(scene);
      assert.ok(scene.children.length > before, 'build adds scene children');
      const tracked = collect(scene);
      assert.ok(tracked.geos.size > 0);
      const { disposed } = watch(tracked);
      built.dispose();
      assert.equal(scene.children.length, before, 'scene children return to baseline');
      const missedGeo = [...tracked.geos].filter((g) => !disposed.has(g)).length;
      const missedMat = [...tracked.mats].filter((m) => !disposed.has(m)).length;
      assert.equal(missedGeo, 0, `${missedGeo} geometries not disposed`);
      assert.equal(missedMat, 0, `${missedMat} materials not disposed`);
      if (mod.ownsTextures) {
        const missedTex = [...tracked.texs].filter((x) => !disposed.has(x)).length;
        assert.equal(missedTex, 0, `${missedTex} textures not disposed`);
      }
    });
  });

  test(`${mod.name}: repeated build/dispose keeps the scene flat`, () => {
    withCanvasStub(() => {
      const scene = new THREE.Scene();
      let baseline = -1;
      for (let i = 0; i < 4; i++) {
        const built = mod.build(scene);
        built.dispose();
        let n = 0;
        scene.traverse(() => n++);
        if (baseline < 0) baseline = n;
        assert.equal(n, baseline, `iteration ${i}: object count stays at ${baseline}`);
      }
    });
  });
}

test('scene3dFull tears the previous level down before building a new one', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/render3d/scene3dFull.ts', import.meta.url), 'utf8');
  const build = src.slice(src.indexOf('private ensureWorldBuilt'), src.indexOf('private teardownLevel'));
  assert.match(build, /if \(this\.builtLevelRef\) this\.teardownLevel\(\)/);
  assert.match(build, /this\.levelRoots = this\.scene\.children\.filter/);
  // Per-batch texture clones are tracked and freed with the level.
  assert.match(src, /this\.levelTextures\.push\(t\)/);
  assert.match(src, /for \(const t of owned\) t\.dispose\(\)/);
  // Context loss pauses rendering instead of throwing.
  assert.match(src, /webglcontextlost/);
  assert.match(src, /if \(this\.contextLost\) return;/);
});

// Layout-only draw-call budget guards (no WebGL): static solid batching and decor mesh/material counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import type { SectorId3D } from '../src/game3d/types3d.ts';
import { buildDecor3D } from '../src/render3d/decor3d.ts';
import { BOSS_CAM_BASE_DIST, BOSS_CAM_MAX_DIST, bossCameraBlend, bossFramingWanted } from '../src/render3d/bossCamera.ts';
import { frontLiftGlsl } from '../src/render3d/frontLift.ts';
import { buildGrenade, buildRail, buildScatter } from '../src/render3d/heroGear3d.ts';
import { buildHazards3D } from '../src/render3d/hazards3d.ts';
import { mergeStaticChildren } from '../src/render3d/meshMerge.ts';
import { buildBatchGeometry, classifySolid, planSolidMeshCount } from '../src/render3d/solidBatches.ts';

const level = buildFacilityMap3D();
const sectorAt = (x: number, y: number): SectorId3D => {
  for (const r of level.rooms) if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) return r.sector;
  return 'shaft';
};

test('static solids batch into a small number of meshes per sector', () => {
  const plan = planSolidMeshCount(level.solids, sectorAt);
  assert.ok(plan.meshes < level.solids.length / 2, `batched ${plan.meshes} of ${level.solids.length} solids`);
  assert.ok(plan.meshes <= 30, `total solid meshes ${plan.meshes} <= 30`);
  for (const [sector, n] of Object.entries(plan.perSector)) assert.ok(n <= 8, `${sector} solid meshes ${n} <= 8`);
  assert.ok(plan.materials <= 30);
});

test('doors and fading walls stay individual meshes, everything else merges', () => {
  for (const s of level.solids) {
    const info = classifySolid(s);
    if (s.kind === 'door') assert.equal(info.individual, true, s.id);
    if (s.kind === 'catwalk' || s.kind === 'platform' || s.kind === 'crate' || s.kind === 'console') assert.equal(info.individual, false, s.id);
  }
});

test('merged batch geometry keeps per-solid UV and color data', () => {
  const geo = buildBatchGeometry([
    { cx: 0, cy: 0, cz: 0, sx: 2, sy: 1, sz: 1, rx: 3, ry: 2, ox: 0.25, oy: 0.5, color: new THREE.Color(0xff0000) },
    { cx: 5, cy: 0, cz: 0, sx: 1, sy: 1, sz: 1, rx: 1, ry: 1, ox: 0, oy: 0, color: new THREE.Color(0x00ff00) },
  ]);
  assert.ok(geo);
  assert.equal(geo.getAttribute('position').count, 48);
  for (const name of ['normal', 'uv', 'color']) assert.equal(geo.getAttribute(name).count, 48);
  const uv = geo.getAttribute('uv');
  assert.ok(Math.max(...Array.from({ length: 24 }, (_, i) => uv.getX(i))) <= 3.25 + 1e-6);
  assert.ok(Math.min(...Array.from({ length: 24 }, (_, i) => uv.getY(i))) >= 0.5 - 1e-6);
  assert.ok(geo.boundingBox && geo.boundingBox.max.x >= 5.5);
});

test('decor mesh and material counts stay within budget', () => {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    const scene = new THREE.Scene();
    const t = () => new THREE.Texture();
    const tex = new Proxy({}, { get: () => t() }) as never;
    const decor = buildDecor3D(scene, level, tex);
    let meshes = 0;
    const mats = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) {
        meshes++;
        for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
      }
    });
    const perRoomStatic = level.rooms.length * 3 + level.acidPools.length;
    assert.ok(meshes <= 40 + perRoomStatic, `decor meshes ${meshes}`);
    assert.ok(mats.size <= 60, `decor materials ${mats.size}`);
    // setView hides rooms outside the window and shows the ones inside.
    const r0 = level.rooms[0];
    decor.setView(r0.minX, r0.maxX, r0.minY, r0.maxY);
    let hidden = 0;
    scene.traverse((o) => {
      if (o.name.startsWith('decor-backwall:') && !o.visible) hidden++;
    });
    assert.ok(hidden >= 1, 'distant back walls hidden');
  } finally {
    g.document = prev;
  }
});

function meshStats(root: THREE.Object3D): { meshes: number; materials: number } {
  let meshes = 0;
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) mats.add(mm);
  });
  return { meshes, materials: mats.size };
}

test('mergeStaticChildren merges same-material meshes and keeps animated parts', () => {
  const root = new THREE.Group();
  const a = new THREE.MeshStandardMaterial();
  const b = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a);
    m.position.set(i * 2, 0, 0);
    root.add(m);
  }
  const keep = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), a);
  root.add(keep);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(1), b));
  const r = mergeStaticChildren(root, new Set([keep]));
  assert.equal(r.before, 5);
  assert.equal(r.after, 2);
  assert.equal(root.children.length, 3); // merged + kept + sphere
  const merged = r.merged[0];
  merged.geometry.computeBoundingBox();
  assert.ok(merged.geometry.boundingBox!.max.x >= 6.5, 'baked positions survive the merge');
});

test('hero weapon rigs stay within mesh and material budgets', () => {
  for (const [name, rig] of [['scatter', buildScatter()], ['grenade', buildGrenade()], ['rail', buildRail()]] as const) {
    const s = meshStats(rig.root);
    assert.ok(s.meshes <= 9, `${name} meshes ${s.meshes} <= 9`);
    assert.ok(s.materials <= 5, `${name} materials ${s.materials} <= 5`);
  }
});

test('hazard meshes per level stay within budget and the steam is a soft shader, not an opaque cone', () => {
  const scene = new THREE.Scene();
  const hz = buildHazards3D(scene, level);
  const s = meshStats(scene);
  assert.ok(s.meshes <= 30, `hazard meshes ${s.meshes}`);
  assert.ok(s.materials <= 26, `hazard materials ${s.materials}`);
  let plumes = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material instanceof THREE.ShaderMaterial) {
      plumes++;
      assert.equal(m.material.transparent, true);
      assert.equal(m.material.depthWrite, false);
      assert.notEqual(m.material.blending, THREE.AdditiveBlending);
      assert.ok(m.position.z < 0, 'steam sheet sits behind the character lane');
    }
  });
  assert.ok(plumes >= 1);
  hz.dispose();
});

test('boss camera: no change at k=0, zooms out and centers both actors, never loses the player', () => {
  const still = bossCameraBlend({ px: 10, py: 4, bx: 30, by: 6, k: 0, fovDeg: 38, aspect: 1.42 });
  assert.deepEqual(still, { fx: 10, fy: 4, dist: BOSS_CAM_BASE_DIST });

  const near = bossCameraBlend({ px: 10, py: 4, bx: 12, by: 5, k: 1, fovDeg: 38, aspect: 1.42 });
  assert.equal(near.dist, BOSS_CAM_BASE_DIST, 'close boss needs no extra zoom');

  const mid = bossCameraBlend({ px: 10, py: 4, bx: 28, by: 6, k: 1, fovDeg: 38, aspect: 1.42 });
  assert.ok(mid.dist > BOSS_CAM_BASE_DIST && mid.dist <= BOSS_CAM_MAX_DIST);
  const tan = Math.tan((38 * Math.PI) / 360);
  const halfW = mid.dist * tan * 1.42;
  assert.ok(Math.abs(mid.fx - 10) + 1 < halfW && Math.abs(28 - mid.fx) + 1 < halfW, 'both actors inside the frame');

  const far = bossCameraBlend({ px: 0, py: 4, bx: 60, by: 4, k: 1, fovDeg: 38, aspect: 1.42 });
  assert.equal(far.dist, BOSS_CAM_MAX_DIST);
  assert.ok(Math.abs(far.fx - 0) < far.dist * tan * 1.42, 'player stays on screen when the pair cannot fit');
  assert.ok(far.fx > 0, 'still leans toward the boss');

  const half = bossCameraBlend({ px: 10, py: 4, bx: 28, by: 6, k: 0.5, fovDeg: 38, aspect: 1.42 });
  assert.ok(half.dist > BOSS_CAM_BASE_DIST && half.dist < mid.dist);
  assert.ok(half.fx > 10 && half.fx < mid.fx);
});

test('boss framing only applies to a live boss with no cinematic in charge', () => {
  assert.equal(bossFramingWanted(true, 10, 2, false), true);
  assert.equal(bossFramingWanted(false, 10, 2, false), false);
  assert.equal(bossFramingWanted(true, 10, 2, true), false);
  assert.equal(bossFramingWanted(true, 60, 2, false), false);
});

test('front lift shader snippet targets camera-facing faces only', () => {
  const g = frontLiftGlsl(0.3, [0.02, 0.02, 0.02]);
  assert.match(g, /smoothstep\(0\.45, 0\.95, normal\.z\)/);
  assert.match(g, /totalEmissiveRadiance \+=/);
});

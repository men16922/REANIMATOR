// Layout-only draw-call budget guards (no WebGL): static solid batching and decor mesh/material counts.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import type { SectorId3D } from '../src/game3d/types3d.ts';
import { buildDecor3D } from '../src/render3d/decor3d.ts';
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

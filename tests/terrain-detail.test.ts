// R14 terrain relief: deterministic, bounded, collision-neutral geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { buildTerrainDetail } from '../src/render3d/terrainDetail.ts';
import type { SectorId3D } from '../src/game3d/types3d.ts';

const level = buildFacilityMap3D();
const sectorAt = (x: number, y: number): SectorId3D => {
  for (const r of level.rooms) if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) return r.sector;
  return 'shaft';
};

test('terrain detail is deterministic and covers every sector', () => {
  const a = buildTerrainDetail(level, sectorAt);
  const b = buildTerrainDetail(level, sectorAt);
  assert.deepEqual(a.map((u) => [u.key, u.triangles]), b.map((u) => [u.key, u.triangles]));
  const sectors = new Set(a.map((u) => u.sector));
  for (const s of ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'] as const) assert.ok(sectors.has(s), `${s} has relief`);
});

test('terrain detail stays within a triangle and strip budget', () => {
  const units = buildTerrainDetail(level, sectorAt);
  const tris = units.reduce((n, u) => n + u.triangles, 0);
  assert.ok(tris < 150000, `total triangles ${tris}`);
  assert.ok(units.length <= 24, `strips ${units.length}`);
  for (const u of units) {
    assert.ok(u.geometry.attributes.color && u.geometry.attributes.normal && !u.geometry.attributes.uv);
  }
});

test('terrain detail never reads or mutates the collision level', () => {
  const before = JSON.stringify(level.solids);
  buildTerrainDetail(level, sectorAt);
  assert.equal(JSON.stringify(level.solids), before);
});

test('chamfered batch boxes keep extents, normals and UV bake (R24)', async () => {
  const THREE = await import('three');
  const { buildBatchGeometry, bevelFor } = await import('../src/render3d/solidBatches.ts');
  assert.equal(bevelFor(4, 0.05, 4, 'floor'), 0);
  assert.equal(bevelFor(4, 1, 1, 'door'), 0);
  const geo = buildBatchGeometry([
    { cx: 10, cy: 2, cz: -1, sx: 4, sy: 1, sz: 2, rx: 2, ry: 1, ox: 0.25, oy: 0, color: new THREE.Color(0x808080), bevel: 0.08 },
  ])!;
  assert.ok(geo.index);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  assert.ok(Math.abs(bb.max.x - 12) < 1e-5 && Math.abs(bb.min.x - 8) < 1e-5);
  assert.ok(Math.abs(bb.max.y - 2.5) < 1e-5 && Math.abs(bb.min.z + 2) < 1e-5);
  const n = geo.getAttribute('normal');
  const pos = geo.getAttribute('position');
  const ix = geo.index!;
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4);
  // Every triangle winds along its stored normal.
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
    const e1 = new THREE.Vector3(pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a));
    const e2 = new THREE.Vector3(pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a));
    const f = e1.cross(e2);
    assert.ok(f.dot(new THREE.Vector3(n.getX(a), n.getY(a), n.getZ(a))) > 0, `tri ${t / 3} winding`);
  }
});

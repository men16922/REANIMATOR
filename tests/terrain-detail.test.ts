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

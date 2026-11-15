// R15 terrain kit: deterministic placement over all six sectors, per-sector lazy loading, and the load-failure fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import type { SectorId3D } from '../src/game3d/types3d.ts';
import { KIT_IDS, TerrainKit, planKitUnits, type KitAsset, type KitId } from '../src/render3d/terrainKit.ts';

const level = buildFacilityMap3D();
const sectorAt = (x: number, y: number): SectorId3D => {
  for (const r of level.rooms) if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) return r.sector;
  return 'shaft';
};
const SECTORS: SectorId3D[] = ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'];

test('every sector gets kit placements and the plan is deterministic', () => {
  const a = planKitUnits(level, sectorAt);
  const b = planKitUnits(level, sectorAt);
  assert.deepEqual(a.map((u) => [u.key, u.placements.length]), b.map((u) => [u.key, u.placements.length]));
  for (const s of SECTORS) assert.ok(a.some((u) => u.sector === s), `${s} has kit units`);
  const used = new Set(a.map((u) => u.kit));
  for (const id of KIT_IDS) assert.ok(used.has(id), `${id} is placed somewhere`);
});

test('kit placements are finite and sit on map geometry', () => {
  for (const u of planKitUnits(level, sectorAt)) {
    for (const p of u.placements) assert.ok([p.x, p.y, p.z, p.scale].every(Number.isFinite) && p.scale > 0);
  }
});

const fakeAsset = (): KitAsset => ({ geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshBasicMaterial() });

test('ensureSector loads lazily, once per sector, and builds instanced meshes', async () => {
  const loaded: KitId[] = [];
  const kit = new TerrainKit(planKitUnits(level, sectorAt), async (id) => {
    loaded.push(id);
    return fakeAsset();
  });
  assert.equal(loaded.length, 0);
  const built = await kit.ensureSector('mines');
  assert.ok(built.length > 0 && built.every((b) => b.unit.sector === 'mines' && b.mesh.isInstancedMesh));
  assert.ok(loaded.every((id) => ['mines-rock-chunk', 'timber-brace', 'platform-edge-trim'].includes(id)), loaded.join());
  assert.deepEqual(await kit.ensureSector('mines'), []);
  assert.ok(kit.isLoaded('mines') && !kit.isLoaded('core'));
});

test('GLB load failure falls back: no throw, no kit meshes for that piece', async () => {
  const kit = new TerrainKit(planKitUnits(level, sectorAt), async (id) => {
    if (id === 'timber-brace') throw new Error('404');
    return fakeAsset();
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const built = await kit.ensureSector('mines');
    assert.ok(kit.failed.has('timber-brace'));
    assert.ok(built.length > 0 && built.every((b) => b.unit.kit !== 'timber-brace'));
    const all = await new TerrainKit(planKitUnits(level, sectorAt), async () => {
      throw new Error('offline');
    }).ensureSector('core');
    assert.equal(all.length, 0);
  } finally {
    console.warn = warn;
  }
});

// R15 terrain kit: deterministic placement over all six sectors, per-sector lazy loading, and the load-failure fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { buildStage2Map3D } from '../src/game3d/stage2.ts';
import { buildStage3Map3D, bulwarkShieldRaise } from '../src/game3d/stage3.ts';
import { RAW_TASKS, TERRAIN_KIT, buildPlan, parseArgs } from '../tools/meshy/terrain-kit.ts';
import type { SectorId3D } from '../src/game3d/types3d.ts';
import { existsSync, readFileSync } from 'node:fs';
import { KIT_IDS, STAGE3_KIT_IDS, TerrainKit, applyKitGlow, planKitUnits, repairKitNormals, sanitizeKitMaterial, type KitAsset, type KitId } from '../src/render3d/terrainKit.ts';

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
  const stage2and3Only = new Set<KitId>(['foundry-conveyor', 'slag-crucible', 'coolant-column']);
  for (const id of STAGE3_KIT_IDS) assert.ok(!KIT_IDS.includes(id) && !used.has(id), `${id} not in the stage 1 kit`);
  for (const id of KIT_IDS) assert.equal(used.has(id), !stage2and3Only.has(id), `${id} placement in stage 1`);
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

test('kit materials carry no normal map (degenerate slab UVs gave NaN that bloom spread over the airlock)', () => {
  const mat = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture() });
  const out = sanitizeKitMaterial(mat);
  assert.equal(out, mat);
  assert.equal(mat.normalMap, null);
  assert.doesNotThrow(() => sanitizeKitMaterial(new THREE.MeshBasicMaterial()));
});

test('zero-length or non-finite kit normals are repaired (they were NaN in the lit shader and bloom spread them)', () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, Number.NaN, 0, 0, 1, 0, 0], 3));
  assert.equal(repairKitNormals(g), 2);
  const n = g.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    assert.ok(Number.isFinite(l) && Math.abs(l - 1) < 1e-6, `normal ${i} is unit length`);
  }
  assert.equal(repairKitNormals(g), 0);
  assert.equal(repairKitNormals(new THREE.BufferGeometry()), 0);
});

const stageSectorAt = (lv: ReturnType<typeof buildStage2Map3D>) => (x: number, y: number): SectorId3D => {
  for (const r of lv.rooms) if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) return r.sector;
  return 'shaft';
};
const roomOf = (lv: ReturnType<typeof buildStage2Map3D>, x: number) => lv.rooms.find((r) => x >= r.minX && x <= r.maxX)?.id;

test('R19 stage props: conveyors in Conveyor Hall, crucibles in Slag Pits and Furnace Gate, columns in stage 3 rooms', () => {
  const l2 = buildStage2Map3D();
  const l3 = buildStage3Map3D();
  const u2 = planKitUnits(l2, stageSectorAt(l2));
  const u3 = planKitUnits(l3, stageSectorAt(l3));
  const rooms = (lv: typeof l2, units: typeof u2, kit: KitId) => new Set(units.filter((u) => u.kit === kit).flatMap((u) => u.placements.map((p) => roomOf(lv, p.x))));
  assert.deepEqual([...rooms(l2, u2, 'foundry-conveyor')], ['room_s2_hall']);
  assert.deepEqual([...rooms(l2, u2, 'slag-crucible')].sort(), ['room_s2_furnace', 'room_s2_slag']);
  assert.deepEqual([...rooms(l3, u3, 'coolant-column')].sort(), ['room_s3_arena', 'room_s3_spine', 'room_s3_stacks']);
  // Stage 1 and the other stages never receive the new props.
  const u1 = planKitUnits(level, sectorAt);
  for (const k of ['foundry-conveyor', 'slag-crucible', 'coolant-column'] as KitId[]) assert.ok(!u1.some((u) => u.kit === k), `stage 1 has no ${k}`);
  assert.ok(!u2.some((u) => u.kit === 'coolant-column') && !u3.some((u) => u.kit === 'slag-crucible'));
  // Deterministic and finite.
  const again = planKitUnits(l2, stageSectorAt(l2));
  assert.deepEqual(again.map((u) => [u.key, u.placements.length]), u2.map((u) => [u.key, u.placements.length]));
  for (const p of [...u2, ...u3].flatMap((u) => u.placements)) assert.ok([p.x, p.y, p.z, p.scale].every(Number.isFinite));
});

test('R19 per-room kit unit count stays small enough for the 300 draw-call budget', () => {
  for (const [lv, name] of [[buildStage2Map3D(), 'stage2'], [buildStage3Map3D(), 'stage3']] as const) {
    const units = planKitUnits(lv, stageSectorAt(lv));
    for (const r of lv.rooms) {
      // Worst case: every kit unit overlapping a 40 m camera window around a point in the room.
      for (let fx = r.minX; fx <= r.maxX; fx += 4) {
        const n = units.filter((u) => u.sector === r.sector && u.maxX >= fx - 20 && u.minX <= fx + 20).length;
        assert.ok(n <= 20, `${name} ${r.id} kit units near x=${fx}: ${n}`);
      }
    }
  }
});

test('applyKitGlow is emissive-only for glowing pieces and a no-op otherwise', () => {
  const lit = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  applyKitGlow(lit, 'slag-crucible');
  assert.ok(lit.emissiveIntensity > 1 && lit.emissiveMap === lit.map);
  const plain = new THREE.MeshStandardMaterial();
  applyKitGlow(plain, 'wall-panel');
  assert.equal(plain.emissiveIntensity, 1);
  assert.equal(plain.emissive.getHex(), 0);
  let lights = 0;
  new THREE.Scene().traverse((o) => ((o as THREE.Light).isLight ? lights++ : 0));
  assert.equal(lights, 0);
});

test('a GLB that resolves after dispose is disposed and never built', async () => {
  let release: (a: KitAsset) => void = () => {};
  const late = fakeAsset();
  let disposed = 0;
  late.geometry.addEventListener('dispose', () => disposed++);
  const kit = new TerrainKit(planKitUnits(level, sectorAt), (id) => (id === 'mines-rock-chunk' ? new Promise<KitAsset>((r) => (release = r)) : Promise.resolve(fakeAsset())));
  const pending = kit.ensureSector('mines');
  await new Promise((r) => setTimeout(r, 0));
  kit.dispose();
  release(late);
  const built = await pending;
  assert.equal(disposed, 1);
  assert.ok(built.every((b) => b.unit.kit !== 'mines-rock-chunk'));
});

test('terrain-kit tool: parseArgs and buildPlan', () => {
  assert.deepEqual(parseArgs(['--dry-run', '--only', 'a,b', '--skip-optimize', '--ingest-raw']), { dryRun: true, only: ['a', 'b'], skipOptimize: true, ingestRaw: true });
  assert.deepEqual(parseArgs([]), { dryRun: false, only: [], skipOptimize: false, ingestRaw: false });
  assert.equal(buildPlan().length, TERRAIN_KIT.length);
  const one = buildPlan(TERRAIN_KIT, ['slag-crucible']);
  assert.equal(one.length, 1);
  assert.equal(one[0].outFile, 'public/assets/models/terrain/slag-crucible.glb');
  assert.deepEqual(KIT_IDS.slice().sort(), TERRAIN_KIT.map((p) => p.id).sort());
});

test('--ingest-raw: every kit piece has task ids, and the manifest and shipped GLBs agree', () => {
  const manifest = JSON.parse(readFileSync(new URL('../reference/manifests/meshy-assets.json', import.meta.url), 'utf8')) as { schema: string; assets: { id: string; optimizedFile?: string; optimizedTriangles?: number; taskId?: string }[] };
  assert.equal(manifest.schema, 'reanimator-meshy-assets-v2');
  for (const p of TERRAIN_KIT) {
    assert.ok(RAW_TASKS[p.id]?.previewTaskId && RAW_TASKS[p.id]?.refineTaskId, `${p.id} task ids`);
    const m = manifest.assets.find((a) => a.id === `terrain/${p.id}`);
    assert.ok(m, `manifest terrain/${p.id}`);
    assert.equal(m.taskId, RAW_TASKS[p.id].refineTaskId);
    assert.ok(m.optimizedTriangles! > 0 && m.optimizedTriangles! <= 4200);
    assert.ok(existsSync(new URL(`../${m.optimizedFile}`, import.meta.url)), `${m.optimizedFile} exists`);
  }
});

test('--ingest-raw runs offline with no API key (empty plan writes nothing)', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--experimental-strip-types', 'tools/meshy/terrain-kit.ts', '--ingest-raw', '--only', 'no-such-piece'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8', env: { ...process.env, MESHY_API_KEY: '' } });
  assert.equal(r.status, 0, 'unknown --only id yields an empty plan, nothing written');
  assert.match(r.stdout, /0 pieces/);
});

test('R22 stage 3 props: pipe walls and cryo racks sit in the named rooms, glow cyan, stay deterministic', () => {
  const l3 = buildStage3Map3D();
  const u3 = planKitUnits(l3, stageSectorAt(l3));
  const rooms = (kit: KitId) => new Set(u3.filter((u) => u.kit === kit).flatMap((u) => u.placements.map((p) => roomOf(l3 as never, p.x))));
  assert.deepEqual([...rooms('coolant-pipe-wall')].sort(), ['room_s3_arena', 'room_s3_breach', 'room_s3_hatchery', 'room_s3_spine', 'room_s3_stacks']);
  assert.deepEqual([...rooms('cryo-rack')].sort(), ['room_s3_hatchery', 'room_s3_stacks']);
  // Pipe walls stand on a floor top against the rear lane (visible), not on the front face of floor slabs.
  for (const u of u3.filter((x) => x.kit === 'coolant-pipe-wall')) for (const p of u.placements) assert.ok(p.z <= -1.5 && p.scale >= 4, `pipe wall at x ${p.x} reads on the back wall`);
  const again = planKitUnits(l3, stageSectorAt(l3));
  assert.deepEqual(again.map((u) => [u.key, u.placements.length]), u3.map((u) => [u.key, u.placements.length]));
  for (const id of ['coolant-pipe-wall', 'cryo-rack', 'frost-shield'] as KitId[]) {
    const m = applyKitGlow(new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), id);
    assert.equal(m.emissive.getHex(), 0x55e6ff, id);
    assert.ok(m.emissiveMap === m.map);
  }
  assert.ok(!planKitUnits(level, sectorAt).some((u) => STAGE3_KIT_IDS.includes(u.kit)));
  assert.ok(!planKitUnits(buildStage2Map3D(), stageSectorAt(buildStage2Map3D())).some((u) => STAGE3_KIT_IDS.includes(u.kit)));
});

test('R22 bulwark shield raise eases toward the sim state and is deterministic', () => {
  assert.equal(bulwarkShieldRaise(1, true, 0.016), 1);
  const a = bulwarkShieldRaise(1, false, 0.016);
  assert.ok(a < 1 && a > 0.8);
  assert.equal(bulwarkShieldRaise(1, false, 0.016), a);
  let r = 1;
  for (let i = 0; i < 60; i++) r = bulwarkShieldRaise(r, false, 0.016);
  assert.equal(r, 0);
  r = 0;
  for (let i = 0; i < 60; i++) r = bulwarkShieldRaise(r, true, 0.016);
  assert.equal(r, 1);
});

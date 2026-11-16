// R15/R19 Meshy terrain kit: 14 optimised GLBs instanced over the map as visual-only dressing (collision solids untouched).
// Placement is a pure, deterministic function of the level (id hash, no Math.random). Each (kit piece, sector, 24 m strip)
// becomes one InstancedMesh, so the draw cost is countable without WebGL (drawBudget). GLBs load lazily per sector; when
// a GLB fails to load that piece is skipped and the R14 procedural relief (terrainDetail.ts) simply stays as the look.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MapSolid3D } from '../game3d/map3d.ts';
import type { Level3D, SectorId3D } from '../game3d/types3d.ts';

export type KitId =
  | 'wall-panel'
  | 'floor-grate'
  | 'support-pillar'
  | 'pipe-cluster'
  | 'steel-girder'
  | 'platform-edge-trim'
  | 'mines-rock-chunk'
  | 'timber-brace'
  | 'specimen-tank'
  | 'security-bulkhead-frame'
  | 'reactor-conduit'
  | 'foundry-conveyor'
  | 'slag-crucible'
  | 'coolant-column'
  | 'coolant-pipe-wall'
  | 'cryo-rack'
  | 'frost-shield';

export const KIT_IDS: readonly KitId[] = [
  'wall-panel',
  'floor-grate',
  'support-pillar',
  'pipe-cluster',
  'steel-girder',
  'platform-edge-trim',
  'mines-rock-chunk',
  'timber-brace',
  'specimen-tank',
  'security-bulkhead-frame',
  'reactor-conduit',
  'foundry-conveyor',
  'slag-crucible',
  'coolant-column',
];

/** R22 Stage 3 props: placed by ROOM_RULES only (no sector rules), so they are listed apart from the stage 1 kit. */
export const STAGE3_KIT_IDS: readonly KitId[] = ['coolant-pipe-wall', 'cryo-rack'];

export const kitUrl = (id: KitId): string => `/assets/models/terrain/${id}.glb`;

export const KIT_STRIP_M = 24;

/** face: on the front plane of a solid at least 1 m tall. stand: upright on a floor top (rear lane). lay: flat on a floor top. edge: along a floor's front lip. beam: lying along the rear lane of a floor top. */
type Mode = 'face' | 'stand' | 'lay' | 'edge' | 'beam';
interface Rule {
  kit: KitId;
  mode: Mode;
  /** Longest side of the placed piece (m). */
  size: number;
  /** Spacing between instances along the solid (m). */
  pitch: number;
  /** Per-solid cap. */
  max: number;
  /** Height above the solid base as a fraction of its height (face). */
  at?: number;
}

const RULES: Record<SectorId3D, Rule[]> = {
  airlock: [
    { kit: 'wall-panel', mode: 'face', size: 2.2, pitch: 2.6, max: 8, at: 0.45 },
    { kit: 'floor-grate', mode: 'lay', size: 1.6, pitch: 3.2, max: 6 },
    { kit: 'security-bulkhead-frame', mode: 'face', size: 3.2, pitch: 7, max: 3, at: 0.4 },
  ],
  shaft: [
    { kit: 'steel-girder', mode: 'beam', size: 3.4, pitch: 3.6, max: 8, at: 0.92 },
    { kit: 'support-pillar', mode: 'stand', size: 3.0, pitch: 6, max: 4 },
    { kit: 'pipe-cluster', mode: 'face', size: 2.4, pitch: 3.4, max: 6, at: 0.3 },
  ],
  mines: [
    { kit: 'mines-rock-chunk', mode: 'stand', size: 1.3, pitch: 2.4, max: 8 },
    { kit: 'timber-brace', mode: 'face', size: 2.6, pitch: 3.2, max: 6, at: 0.55 },
    { kit: 'platform-edge-trim', mode: 'edge', size: 2.2, pitch: 2.2, max: 8 },
  ],
  biolabs: [
    { kit: 'specimen-tank', mode: 'stand', size: 2.0, pitch: 5, max: 4 },
    { kit: 'pipe-cluster', mode: 'face', size: 2.4, pitch: 3.4, max: 6, at: 0.3 },
    { kit: 'wall-panel', mode: 'face', size: 2.2, pitch: 2.8, max: 8, at: 0.6 },
  ],
  security: [
    { kit: 'security-bulkhead-frame', mode: 'face', size: 3.2, pitch: 6, max: 4, at: 0.4 },
    { kit: 'wall-panel', mode: 'face', size: 2.2, pitch: 2.6, max: 8, at: 0.65 },
    { kit: 'floor-grate', mode: 'lay', size: 1.6, pitch: 3.2, max: 6 },
  ],
  core: [
    { kit: 'reactor-conduit', mode: 'face', size: 3.0, pitch: 3.6, max: 6, at: 0.35 },
    { kit: 'support-pillar', mode: 'stand', size: 3.2, pitch: 6, max: 4 },
    { kit: 'steel-girder', mode: 'beam', size: 3.4, pitch: 3.6, max: 8, at: 0.92 },
  ],
};

/**
 * R19 per-room extras for stage 2 and 3 (room ids come from StageKit: room_<tag>_<key>). Stage 1 rooms are not listed, so
 * its kit is unchanged. Render only: collision solids are never touched.
 */
const ROOM_RULES: Record<string, Rule[]> = {
  room_s2_hall: [{ kit: 'foundry-conveyor', mode: 'beam', size: 4.6, pitch: 5.4, max: 3 }],
  room_s2_slag: [{ kit: 'slag-crucible', mode: 'stand', size: 2.8, pitch: 9, max: 1 }],
  room_s2_furnace: [{ kit: 'slag-crucible', mode: 'stand', size: 3.0, pitch: 9, max: 1 }],
  room_s3_breach: [{ kit: 'coolant-pipe-wall', mode: 'face', size: 3.0, pitch: 6, max: 2, at: 0.5 }],
  room_s3_stacks: [
    { kit: 'coolant-column', mode: 'stand', size: 3.6, pitch: 10, max: 1 },
    { kit: 'coolant-pipe-wall', mode: 'face', size: 3.0, pitch: 6, max: 2, at: 0.5 },
    { kit: 'cryo-rack', mode: 'stand', size: 2.6, pitch: 7, max: 2 },
  ],
  room_s3_hatchery: [
    { kit: 'coolant-pipe-wall', mode: 'face', size: 3.0, pitch: 6, max: 2, at: 0.5 },
    { kit: 'cryo-rack', mode: 'stand', size: 2.4, pitch: 8, max: 1 },
  ],
  room_s3_spine: [
    { kit: 'coolant-column', mode: 'stand', size: 3.6, pitch: 10, max: 1 },
    { kit: 'coolant-pipe-wall', mode: 'face', size: 3.0, pitch: 6, max: 2, at: 0.5 },
  ],
  room_s3_arena: [
    { kit: 'coolant-column', mode: 'stand', size: 3.8, pitch: 9, max: 1 },
    { kit: 'coolant-pipe-wall', mode: 'face', size: 3.2, pitch: 6, max: 2, at: 0.5 },
  ],
};

/** Glow is emissive only (no lights): the albedo drives the emissive map so only the bright molten or coolant parts glow. */
const KIT_GLOW: Partial<Record<KitId, { color: number; intensity: number }>> = {
  'slag-crucible': { color: 0xff7a2a, intensity: 1.4 },
  'coolant-column': { color: 0x55e6ff, intensity: 1.2 },
  'coolant-pipe-wall': { color: 0x55e6ff, intensity: 0.9 },
  'cryo-rack': { color: 0x55e6ff, intensity: 0.9 },
  'frost-shield': { color: 0x55e6ff, intensity: 1.1 },
};

export interface KitPlacement {
  kit: KitId;
  sector: SectorId3D;
  x: number;
  y: number;
  z: number;
  /** Uniform scale applied to the unit-normalised piece (longest side = 1). */
  scale: number;
  rotY: number;
  /** World-space bounding radius used for view culling. */
  radius: number;
}

export interface KitUnit {
  key: string;
  kit: KitId;
  sector: SectorId3D;
  placements: KitPlacement[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isStatic(s: MapSolid3D): boolean {
  return !s.dynamic && !s.doorId && !s.collapseId && !s.bridgeId && !s.breakId;
}

/** Placements for one solid (world space, base-centre origin pieces). Exported for tests. */
export function kitPlacementsForSolid(s: MapSolid3D, sector: SectorId3D, roomId?: string): KitPlacement[] {
  if (!isStatic(s)) return [];
  const kind = s.kind ?? 'wall';
  if (kind !== 'wall' && kind !== 'catwalk' && kind !== 'platform') return [];
  const sx = s.maxX - s.minX;
  const top = s.visualMaxY ?? s.maxY;
  const sy = top - s.minY;
  if (sx < 1.6) return [];
  const rnd = rng(hashId(`kit:${s.id}`));
  const floorLike = kind !== 'wall' || sy <= 1.6;
  const out: KitPlacement[] = [];
  // Room extras skip the ceiling slab (top above 8 m), which is out of sight.
  const rules = roomId && ROOM_RULES[roomId] && top < 8 ? [...RULES[sector], ...ROOM_RULES[roomId]] : RULES[sector];
  for (const r of rules) {
    if (r.mode === 'face' ? sy < 1.0 : !floorLike) continue;
    const margin = r.size * 0.5 + 0.2;
    if (sx < margin * 2) continue;
    let n = 0;
    for (let x = s.minX + margin + rnd() * r.pitch * 0.4; x <= s.maxX - margin && n < r.max; x += r.pitch * (0.9 + rnd() * 0.3), n++) {
      let y = 0;
      let z = 0;
      let scale = r.size;
      let rotY = 0;
      switch (r.mode) {
        case 'face':
          scale = Math.min(r.size, sy * 1.6);
          y = Math.max(s.minY + 0.1, s.minY + sy * (r.at ?? 0.5) - scale * 0.25);
          z = s.maxZ + 0.02;
          break;
        case 'beam':
          y = top;
          z = s.minZ + 0.7;
          break;
        case 'stand':
          y = top;
          z = s.minZ + 0.9 + rnd() * 1.1;
          scale = r.size * (0.75 + rnd() * 0.5);
          rotY = rnd() * Math.PI * 2;
          break;
        case 'lay':
          y = top + 0.01;
          z = s.maxZ - 0.5 - rnd() * 0.4;
          break;
        case 'edge':
          y = top;
          z = s.maxZ - 0.2;
          break;
      }
      out.push({ kit: r.kit, sector, x, y, z, scale, rotY, radius: scale * 0.75 });
    }
  }
  return out;
}

/** Instanced units (one per kit piece, sector and strip). Pure: no GLB, no renderer. */
export function planKitUnits(level: Level3D, sectorAt: (x: number, y: number) => SectorId3D): KitUnit[] {
  const map = new Map<string, KitUnit>();
  for (const s of level.solids) {
    const top = s.visualMaxY ?? s.maxY;
    const cx = (s.minX + s.maxX) * 0.5;
    const cy = (s.minY + top) * 0.5;
    const sector = sectorAt(cx, cy);
    const roomId = level.rooms.find((r) => cx >= r.minX && cx <= r.maxX && cy >= r.minY - 0.5 && cy <= r.maxY + 0.5)?.id;
    for (const p of kitPlacementsForSolid(s, sector, roomId)) {
      const key = `${sector}|${p.kit}|${Math.floor(p.x / KIT_STRIP_M)}`;
      let u = map.get(key);
      if (!u) {
        u = { key, kit: p.kit, sector, placements: [], minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        map.set(key, u);
      }
      u.placements.push(p);
      u.minX = Math.min(u.minX, p.x - p.radius);
      u.maxX = Math.max(u.maxX, p.x + p.radius);
      u.minY = Math.min(u.minY, p.y);
      u.maxY = Math.max(u.maxY, p.y + p.radius * 2);
    }
  }
  return [...map.values()];
}

export interface KitAsset {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/** Loads one GLB and returns its single mesh baked to a base-centred origin with the longest side = 1. */
export async function loadKitAsset(id: KitId, loader: GLTFLoader = new GLTFLoader()): Promise<KitAsset> {
  const gltf = await loader.loadAsync(kitUrl(id));
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error(`terrain kit ${id}: no mesh`);
  const m: THREE.Mesh = mesh;
  const geometry = m.geometry.clone();
  geometry.applyMatrix4(m.matrixWorld);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const longest = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geometry.scale(1 / longest, 1 / longest, 1 / longest);
  const material = sanitizeKitMaterial((Array.isArray(m.material) ? m.material[0] : m.material).clone());
  applyKitGlow(material, id);
  repairKitNormals(geometry);
  return { geometry, material };
}

/**
 * Some Meshy GLBs carry a few zero-length normals (degenerate triangles). normalize(vec3(0)) is NaN in the lit fragment
 * shader, the NaN lands in the half-float HDR target, and UnrealBloomPass blurs it over a large part of the frame (the
 * airlock rendered black while those pieces were on screen). Zero or non-finite normals are replaced by +Y. Returns the
 * number repaired. Exported for tests.
 */
export function repairKitNormals(geometry: THREE.BufferGeometry): number {
  const n = geometry.getAttribute('normal');
  if (!n) return 0;
  let fixed = 0;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i);
    const y = n.getY(i);
    const z = n.getZ(i);
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len) || len < 1e-3) {
      n.setXYZ(i, 0, 1, 0);
      fixed++;
    }
  }
  if (fixed > 0) n.needsUpdate = true;
  return fixed;
}

/**
 * Kit pieces are thin slabs whose side faces have degenerate UVs. three's derivative-based normal mapping
 * (perturbNormal2Arb) divides by that near-zero UV area and yields NaN/Inf, and the bloom blur then smears the one bad
 * pixel over the whole frame (the airlock rendered black with the wall-panel kit on screen). The kit is lit by the
 * baked albedo and the scene lights only, so the normal map is dropped. Exported for tests.
 */
export function sanitizeKitMaterial<T extends THREE.Material>(mat: T): T {
  const std = mat as unknown as THREE.MeshStandardMaterial;
  if (std.normalMap) {
    std.normalMap = null;
    std.needsUpdate = true;
  }
  return mat;
}

/** Adds the emissive glow for kit pieces that have one. No-op for the rest. Exported for tests. */
export function applyKitGlow<T extends THREE.Material>(mat: T, id: KitId): T {
  const g = KIT_GLOW[id];
  const std = mat as unknown as THREE.MeshStandardMaterial;
  if (g && std.isMeshStandardMaterial) {
    std.emissive = new THREE.Color(g.color);
    std.emissiveIntensity = g.intensity;
    std.emissiveMap = std.map;
    std.needsUpdate = true;
  }
  return mat;
}

export type KitAssetLoader = (id: KitId) => Promise<KitAsset>;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Builds the InstancedMesh for a unit; geometry and material are shared with the asset. */
export function buildKitInstanced(unit: KitUnit, asset: KitAsset): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, unit.placements.length);
  unit.placements.forEach((p, i) => {
    _q.setFromAxisAngle(UP, p.rotY);
    _p.set(p.x, p.y, p.z);
    _s.setScalar(p.scale);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = `terrain-kit:${unit.key}`;
  mesh.userData.sector = unit.sector;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeKitAsset(a: KitAsset): void {
  a.geometry.dispose();
  const mat = a.material as THREE.MeshStandardMaterial;
  for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
  a.material.dispose();
}

export interface KitBuilt {
  mesh: THREE.InstancedMesh;
  unit: KitUnit;
}

/**
 * Lazy per-sector kit. ensureSector(sector) loads only the GLBs that sector uses (each GLB once, shared by sectors) and
 * resolves with the new instanced meshes. A failed GLB is remembered in `failed` and its pieces are not drawn, so the R14
 * procedural terrain remains the only relief there. Never throws.
 */
export class TerrainKit {
  readonly failed = new Set<KitId>();
  private readonly assets = new Map<KitId, Promise<KitAsset | null>>();
  private readonly done = new Set<SectorId3D>();
  private readonly owned: KitAsset[] = [];
  private disposed = false;

  private readonly units: readonly KitUnit[];
  private readonly load: KitAssetLoader;

  constructor(units: readonly KitUnit[], load: KitAssetLoader = loadKitAsset) {
    this.units = units;
    this.load = load;
  }

  private asset(id: KitId): Promise<KitAsset | null> {
    let p = this.assets.get(id);
    if (!p) {
      p = this.load(id).then(
        (a) => {
          if (this.disposed) {
            disposeKitAsset(a);
            return null;
          }
          this.owned.push(a);
          return a;
        },
        (err) => {
          this.failed.add(id);
          console.warn(`[terrainKit] ${id} failed, keeping R14 procedural terrain:`, err);
          return null;
        },
      );
      this.assets.set(id, p);
    }
    return p;
  }

  isLoaded(sector: SectorId3D): boolean {
    return this.done.has(sector);
  }

  async ensureSector(sector: SectorId3D): Promise<KitBuilt[]> {
    if (this.done.has(sector)) return [];
    this.done.add(sector);
    const out: KitBuilt[] = [];
    for (const unit of this.units) {
      if (unit.sector !== sector) continue;
      const a = await this.asset(unit.kit);
      if (a) out.push({ mesh: buildKitInstanced(unit, a), unit });
    }
    return out;
  }

  dispose(): void {
    this.disposed = true;
    for (const a of this.owned) disposeKitAsset(a);
    this.owned.length = 0;
  }
}

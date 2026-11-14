// Async glTF (.glb) asset loader, cache, per-instance material cloning, and calibrated 2.5D transforms.
// All 6 models are original Meshy 7.1 Flagship assets verified in reference/manifests/meshy-assets.json.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

export type ModelId = 'operative' | 'warden' | 'crawler' | 'spitter' | 'power-core' | 'exit-gate';

export const ALL_MODEL_IDS: readonly ModelId[] = [
  'operative',
  'warden',
  'crawler',
  'spitter',
  'power-core',
  'exit-gate',
];

export interface ModelSpec {
  id: ModelId;
  url: string;
  height: number;
  yawRight: number;
  yawFront: number;
}

export const MODEL_CONFIG: Record<ModelId, ModelSpec> = {
  operative: { id: 'operative', url: '/assets/models/operative.glb', height: 31, yawRight: Math.PI / 2, yawFront: 0 },
  warden: { id: 'warden', url: '/assets/models/warden.glb', height: 42, yawRight: Math.PI / 2, yawFront: 0 },
  crawler: { id: 'crawler', url: '/assets/models/crawler.glb', height: 19, yawRight: Math.PI / 2, yawFront: 0 },
  spitter: { id: 'spitter', url: '/assets/models/spitter.glb', height: 22, yawRight: Math.PI / 2, yawFront: 0 },
  'power-core': { id: 'power-core', url: '/assets/models/power-core.glb', height: 24, yawRight: Math.PI / 2, yawFront: 0 },
  'exit-gate': { id: 'exit-gate', url: '/assets/models/exit-gate.glb', height: 46, yawRight: Math.PI / 2, yawFront: 0 },
};

const cache = new Map<ModelId, THREE.Object3D>();
const loadedSet = new Set<ModelId>();
const failedSet = new Set<ModelId>();
let loadStarted = false;
let version = 0;

export function getLoadedModels(): ModelId[] {
  return [...loadedSet];
}

export function getFailedModels(): ModelId[] {
  return [...failedSet];
}

export function getModelsVersion(): number {
  return version;
}

export function isModelLoaded(id: ModelId): boolean {
  return cache.has(id);
}

/** Kick off parallel loading of all 6 .glb models (idempotent). */
export function preloadModels(): void {
  if (loadStarted) return;
  loadStarted = true;
  const loader = new GLTFLoader();

  for (const id of ALL_MODEL_IDS) {
    const spec = MODEL_CONFIG[id];
    loader.load(
      spec.url,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.frustumCulled = false;
          }
        });
        cache.set(id, root);
        loadedSet.add(id);
        failedSet.delete(id);
        version++;
      },
      undefined,
      (err) => {
        console.warn(`Failed loading ${spec.url}:`, err);
        failedSet.add(id);
      },
    );
  }
}

/** Articulated procedural fallback mesh used only for the brief milliseconds while .glb downloads. */
function makeFallback(id: ModelId): THREE.Group {
  const g = new THREE.Group();
  const h = MODEL_CONFIG[id].height;
  const colorMap: Record<ModelId, number> = {
    operative: 0x7da4c8,
    warden: 0xb85a2a,
    crawler: 0x993028,
    spitter: 0x3b8f55,
    'power-core': 0x45d8ff,
    'exit-gate': 0x3bd07a,
  };
  const mat = new THREE.MeshStandardMaterial({
    color: colorMap[id],
    roughness: 0.45,
    metalness: 0.55,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(h * 0.45, h, h * 0.35), mat);
  body.position.y = h / 2;
  g.add(body);
  return g;
}

/**
 * Instantiate an independent scaled copy of a model whose origin sits flush at bottom center (y = 0)
 * with its own cloned materials so hurt flashes / emissive glows can animate independently.
 */
export function instantiateModel(id: ModelId): { group: THREE.Group; isReal: boolean; materials: THREE.MeshStandardMaterial[] } {
  const spec = MODEL_CONFIG[id];
  const tpl = cache.get(id);
  if (!tpl) {
    const fb = makeFallback(id);
    const mats: THREE.MeshStandardMaterial[] = [];
    fb.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const std = m as THREE.MeshStandardMaterial;
        std.userData.baseEmissive = std.emissive.clone();
        std.userData.baseEmissiveIntensity = std.emissiveIntensity;
        mats.push(std);
      }
    });
    return { group: fb, isReal: false, materials: mats };
  }

  const root = cloneSkeleton(tpl);
  const scale = spec.height;
  root.scale.set(scale, scale, scale);

  const mats: THREE.MeshStandardMaterial[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const src = mesh.material;
      if (Array.isArray(src)) {
        mesh.material = src.map((m) => cloneMat(m, mats));
      } else if (src) {
        mesh.material = cloneMat(src, mats);
      }
    }
  });

  const holder = new THREE.Group();
  holder.add(root);
  return { group: holder, isReal: true, materials: mats };
}

function cloneMat(m: THREE.Material, out: THREE.MeshStandardMaterial[]): THREE.Material {
  const c = m.clone();
  if ((c as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const std = c as THREE.MeshStandardMaterial;
    std.userData.baseEmissive = std.emissive.clone();
    std.userData.baseEmissiveIntensity = std.emissiveIntensity;
    out.push(std);
  }
  return c;
}

/** Apply an emissive override tint (`amount` 0..1) relative to each material's natural texture emission. */
export function tintMaterials(mats: THREE.MeshStandardMaterial[], hex: number, amount: number): void {
  const target = new THREE.Color(hex);
  for (const m of mats) {
    const base = (m.userData.baseEmissive as THREE.Color | undefined) ?? new THREE.Color(0x000000);
    const baseInt = (m.userData.baseEmissiveIntensity as number | undefined) ?? 1;
    if (amount <= 0) {
      m.emissive.copy(base);
      m.emissiveIntensity = baseInt;
    } else {
      m.emissive.copy(base).lerp(target, Math.min(1, amount));
      m.emissiveIntensity = Math.max(baseInt, 0.25 + amount * 2.2);
    }
  }
}

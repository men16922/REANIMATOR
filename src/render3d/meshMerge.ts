// Draw-call reduction for small static prop rigs (hero weapons, hive sacs, hazard frames).
// Direct child meshes that share a material and a shadow flag are baked into one mesh in the parent's local space.
// Pure THREE geometry work, no renderer access, so the saving is testable without WebGL.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface MergeResult {
  /** Mesh count before and after (direct children only). */
  before: number;
  after: number;
  merged: THREE.Mesh[];
}

/**
 * Merges the direct child meshes of `root` that share a material instance and the same cast/receive shadow flags.
 * Meshes listed in `keep` (animated or individually addressed parts) and groups of one are left untouched.
 * Original geometries of merged meshes are disposed.
 */
export function mergeStaticChildren(root: THREE.Object3D, keep: ReadonlySet<THREE.Object3D> = new Set()): MergeResult {
  const buckets = new Map<string, THREE.Mesh[]>();
  const matIds = new Map<THREE.Material, number>();
  let before = 0;
  for (const c of root.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material) || m.children.length > 0) continue;
    before++;
    let id = matIds.get(m.material);
    if (id === undefined) {
      id = matIds.size;
      matIds.set(m.material, id);
    }
    const key = `${id}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
    const list = buckets.get(key);
    if (list) list.push(m);
    else buckets.set(key, [m]);
  }
  const merged: THREE.Mesh[] = [];
  let after = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) {
      after += list.length;
      continue;
    }
    const geos: THREE.BufferGeometry[] = [];
    for (const m of list) {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      geos.push(g);
    }
    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!geo) {
      after += list.length;
      continue;
    }
    const first = list[0];
    const out = new THREE.Mesh(geo, first.material);
    out.castShadow = first.castShadow;
    out.receiveShadow = first.receiveShadow;
    out.name = `${first.name || 'merged'}:merged`;
    for (const m of list) {
      root.remove(m);
      m.geometry.dispose();
    }
    root.add(out);
    merged.push(out);
    after++;
  }
  return { before, after, merged };
}

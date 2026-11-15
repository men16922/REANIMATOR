// Frees GPU-side resources owned by one cloned actor subtree (rigged or static glTF clone, hero gear, pick proxies).
// What a clone shares with the glTF cache (geometry, source textures) is kept; what it owns is released:
//   - geometry that is not in the shared set (procedural gear, fallback capsules/boxes, pick proxies)
//   - every material (clones; re-uploaded on demand if a shared one is disposed by mistake)
//   - SkinnedMesh skeletons: Skeleton.boneTexture is a DataTexture that Material.dispose() never frees
//   - the AnimationMixer's cached bindings for the model root
// Pure THREE, no WebGL needed, so the pairing is checkable under node.

import * as THREE from 'three';

export interface DisposeActorOptions {
  /** Geometry owned by the glTF cache. It outlives every clone and must not be disposed. */
  isSharedGeometry?: (g: THREE.BufferGeometry) => boolean;
  mixer?: THREE.AnimationMixer;
  /** Root the mixer was created on (uncacheRoot target). Defaults to `root`. */
  mixerRoot?: THREE.Object3D;
}

/** Collects the geometries of a loaded glTF scene (the shared set). */
export function collectGeometries(root: THREE.Object3D, into: Set<THREE.BufferGeometry>): void {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g) into.add(g);
  });
}

export function disposeActorTree(root: THREE.Object3D, opts: DisposeActorOptions = {}): void {
  if (opts.mixer) {
    opts.mixer.stopAllAction();
    opts.mixer.uncacheRoot(opts.mixerRoot ?? root);
  }
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((o as THREE.SkinnedMesh).skeleton);
    if (m.geometry && !opts.isSharedGeometry?.(m.geometry)) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) for (const x of mat) x.dispose();
    else mat?.dispose();
  });
  for (const s of skeletons) s.dispose();
}

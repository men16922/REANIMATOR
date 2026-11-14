// Rigged multi-clip GLB model loader & Three.js AnimationMixer controller.
// Uses SkeletonUtils.clone to preserve skinning & inverseBindMatrices across instances,
// attaches pulse-rifle.glb to Operative's mixamorig:RightHand bone, and applies post-mixer upper-body aim.

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorAnimAction } from '../game3d/world3d.ts';

export { THREE };

export type ModelKey3D =
  | 'operative'
  | 'warden'
  | 'bio-stalker'
  | 'pulse-rifle'
  | 'bio-barrel'
  | 'crawler'
  | 'spitter'
  | 'power-core'
  | 'exit-gate';

export interface RiggedInstance {
  id: 'operative' | 'warden' | 'bio-stalker';
  root: THREE.Group;
  modelRoot: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<ActorAnimAction, THREE.AnimationAction>>;
  currentAnim: ActorAnimAction;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
  hips?: THREE.Object3D;
  spine1?: THREE.Object3D;
  spine2?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  rightForeArm?: THREE.Object3D;
  rightHand?: THREE.Object3D;
  riflePivot?: THREE.Group;
  muzzleLocal?: THREE.Object3D;
}

export const RIFLE_SOCKET = {
  // pulse-rifle local: -X barrel tip, +X buttstock, +Y top rail, -Y grip/magazine.
  // Aligns barrel forward out of Mixamo RightHand with top rail upward and stock tucked toward forearm.
  pos: [-0.01, 0.14, 0.04] as [number, number, number],
  rot: [-0.15, Math.PI * 0.5, -Math.PI * 0.52] as [number, number, number],
  scale: 0.72,
};

const MODEL_FILES: Record<ModelKey3D, string> = {
  operative: '/assets/models/operative.glb',
  warden: '/assets/models/warden.glb',
  'bio-stalker': '/assets/models/bio-stalker.glb',
  'pulse-rifle': '/assets/models/pulse-rifle.glb',
  'bio-barrel': '/assets/models/bio-barrel.glb',
  crawler: '/assets/models/crawler.glb',
  spitter: '/assets/models/spitter.glb',
  'power-core': '/assets/models/power-core.glb',
  'exit-gate': '/assets/models/exit-gate.glb',
};

const cache = new Map<ModelKey3D, GLTF>();
const failedKeys: ModelKey3D[] = [];
let loadPromise: Promise<{ ok: boolean; loaded: ModelKey3D[] }> | null = null;

export async function preloadAllModels3D(): Promise<{ ok: boolean; loaded: ModelKey3D[] }> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const loader = new GLTFLoader();
    const keys = Object.keys(MODEL_FILES) as ModelKey3D[];
    const loaded: ModelKey3D[] = [];
    failedKeys.length = 0;
    await Promise.all(
      keys.map(async (key) => {
        try {
          const gltf = await loader.loadAsync(MODEL_FILES[key]);
          cache.set(key, gltf);
          loaded.push(key);
        } catch (err) {
          failedKeys.push(key);
          console.warn(`[models3d] failed to load ${key}:`, err);
        }
      }),
    );
    return { ok: loaded.length === keys.length, loaded };
  })();
  return loadPromise;
}

export function getLoadedModelNames3D(): ModelKey3D[] {
  return [...cache.keys()];
}

export function getFailedModelNames3D(): ModelKey3D[] {
  return [...failedKeys];
}

export function instantiateStaticModel3D(
  key: Exclude<ModelKey3D, 'operative' | 'warden' | 'bio-stalker'>,
  heightScale = 1,
  ground = true,
): {
  root: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  baseEmissive: THREE.Color[];
} {
  const root = new THREE.Group();
  const materials: THREE.MeshStandardMaterial[] = [];
  const baseEmissive: THREE.Color[] = [];
  const gltf = cache.get(key);

  if (gltf) {
    const clone = gltf.scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        const srcMat = obj.material;
        if (srcMat instanceof THREE.MeshStandardMaterial) {
          const clonedMat = srcMat.clone();
          obj.material = clonedMat;
          materials.push(clonedMat);
          baseEmissive.push(clonedMat.emissive.clone());
        }
      }
    });
    clone.scale.setScalar(heightScale);
    if (ground) {
      clone.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(clone);
      clone.position.y -= box.min.y;
    }
    root.add(clone);
  } else {
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(0.6 * heightScale, heightScale, 0.6 * heightScale),
      new THREE.MeshStandardMaterial({ color: 0x5c7080, roughness: 0.5, metalness: 0.4 }),
    );
    fallback.position.y = heightScale * 0.5;
    root.add(fallback);
  }

  return { root, materials, baseEmissive };
}

export function instantiateRiggedModel3D(
  id: 'operative' | 'warden' | 'bio-stalker',
  targetHeight: number,
  attachRifle = false,
): RiggedInstance {
  const root = new THREE.Group();
  const gltf = cache.get(id);
  const materials: THREE.MeshStandardMaterial[] = [];
  const baseEmissive: THREE.Color[] = [];

  let modelRoot: THREE.Object3D;
  if (gltf) {
    modelRoot = SkeletonUtils.clone(gltf.scene);
    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    const rawH = Math.max(0.1, box.max.y - box.min.y);
    const scale = targetHeight / rawH;
    modelRoot.scale.setScalar(scale);
    modelRoot.position.y = -box.min.y * scale;
  } else {
    const grp = new THREE.Group();
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(targetHeight * 0.18, targetHeight * 0.55, 6, 12),
      new THREE.MeshStandardMaterial({ color: id === 'operative' ? 0x3ad6ff : 0xc44438, roughness: 0.45 }),
    );
    capsule.position.y = targetHeight * 0.5;
    capsule.castShadow = true;
    grp.add(capsule);
    modelRoot = grp;
  }

  let hips: THREE.Object3D | undefined;
  let spine1: THREE.Object3D | undefined;
  let spine2: THREE.Object3D | undefined;
  let rightArm: THREE.Object3D | undefined;
  let rightForeArm: THREE.Object3D | undefined;
  let rightHand: THREE.Object3D | undefined;

  modelRoot.traverse((obj) => {
    const cname = obj.name.replace(/:/g, '');
    if (cname === 'mixamorigHips') hips = obj;
    else if (cname === 'mixamorigSpine1') spine1 = obj;
    else if (cname === 'mixamorigSpine2') spine2 = obj;
    else if (cname === 'mixamorigRightArm') rightArm = obj;
    else if (cname === 'mixamorigRightForeArm') rightForeArm = obj;
    else if (cname === 'mixamorigRightHand') rightHand = obj;

    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false; // Prevent animated SkinnedMesh culling
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const nextMats = mats.map((m) => {
        if (m instanceof THREE.MeshStandardMaterial) {
          const cm = m.clone();
          materials.push(cm);
          baseEmissive.push(cm.emissive.clone());
          return cm;
        }
        return m;
      });
      obj.material = Array.isArray(obj.material) ? nextMats : nextMats[0];
    }
  });

  root.add(modelRoot);

  // Attach Pulse Rifle prop to Operative's RightHand bone
  let riflePivot: THREE.Group | undefined;
  let muzzleLocal: THREE.Object3D | undefined;
  if (attachRifle && rightHand) {
    riflePivot = new THREE.Group();
    riflePivot.position.set(...RIFLE_SOCKET.pos);
    riflePivot.rotation.set(...RIFLE_SOCKET.rot);
    riflePivot.scale.setScalar(RIFLE_SOCKET.scale);
    const rifleObj = instantiateStaticModel3D('pulse-rifle', 1.0, false);
    riflePivot.add(rifleObj.root);
    muzzleLocal = new THREE.Object3D();
    muzzleLocal.position.set(-0.52, 0.04, 0.0); // Barrel tip along pulse-rifle -X
    riflePivot.add(muzzleLocal);
    rightHand.add(riflePivot);
  }

  const mixer = new THREE.AnimationMixer(modelRoot);
  const actions: Partial<Record<ActorAnimAction, THREE.AnimationAction>> = {};
  if (gltf) {
    for (const clip of gltf.animations) {
      const name = clip.name as ActorAnimAction;
      const action = mixer.clipAction(clip);
      if (name === 'death' || name === 'jump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      actions[name] = action;
    }
  }

  const initial: ActorAnimAction = actions.idle ? 'idle' : actions.walk ? 'walk' : 'run';
  actions[initial]?.play();

  return {
    id,
    root,
    modelRoot,
    mixer,
    actions,
    currentAnim: initial,
    materials,
    baseEmissive,
    hips,
    spine1,
    spine2,
    rightArm,
    rightForeArm,
    rightHand,
    riflePivot,
    muzzleLocal,
  };
}

export function stepRiggedAnimation3D(
  inst: RiggedInstance,
  desired: ActorAnimAction,
  dt: number,
  timeScale = 1,
  upperBodyDeltaYaw = 0,
  aimWeaponReady = false,
): void {
  const target: ActorAnimAction = inst.actions[desired]
    ? desired
    : desired === 'run' && inst.actions.walk
      ? 'walk'
      : desired === 'jump' && inst.actions.run
        ? 'run'
        : inst.actions.idle
          ? 'idle'
          : inst.currentAnim;

  if (target !== inst.currentAnim) {
    const prev = inst.actions[inst.currentAnim];
    const next = inst.actions[target];
    if (next) {
      next.reset();
      if (target === 'death') {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      next.play();
      if (prev && prev !== next) {
        prev.crossFadeTo(next, desired === 'death' ? 0.1 : 0.14, true);
      }
    }
    inst.currentAnim = target;
  }

  const active = inst.actions[inst.currentAnim];
  if (active) {
    active.timeScale = inst.currentAnim === 'run' || inst.currentAnim === 'walk' ? timeScale : 1;
  }

  inst.mixer.update(dt);

  // Post-mixer additive upper-body twist toward cursor aim
  if (Math.abs(upperBodyDeltaYaw) > 0.005 && inst.spine1 && inst.spine2) {
    const clamped = Math.max(-0.9, Math.min(0.9, upperBodyDeltaYaw));
    inst.spine1.rotation.y += clamped * 0.42;
    inst.spine2.rotation.y += clamped * 0.58;
  }

  // Keep Operative's weapon arm raised forward at hip/chest level when aiming
  if (aimWeaponReady && inst.currentAnim !== 'death' && inst.rightArm && inst.rightForeArm) {
    if (inst.currentAnim === 'run' || inst.currentAnim === 'walk') {
      inst.rightArm.rotation.x += 0.44;
      inst.rightArm.rotation.z -= 0.06;
      inst.rightForeArm.rotation.x += 0.28;
    }
  }
}

export function flashRiggedMaterials3D(inst: RiggedInstance, hex: number, amount: number): void {
  const c = new THREE.Color(hex);
  for (let i = 0; i < inst.materials.length; i++) {
    const m = inst.materials[i];
    m.emissive.copy(inst.baseEmissive[i]).lerp(c, amount);
    m.emissiveIntensity = Math.max(1, 1 + amount * 1.5);
  }
}

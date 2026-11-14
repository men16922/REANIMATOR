// Rigged multi-clip GLB model loader & Three.js AnimationMixer controller.
// Features Metroid Dread / 1995 Abuse split-body articulation:
//   - Lower body tracks facing hemisphere & reverses walk/run cycle when backpedaling
//   - Upper spine pitches smoothly & quaternion-aims both arms + pulse-rifle along exact XY 360 aim vector
//   - Velocity-locked 3-phase jump clip scrubbing (strips baked pre-jump squat & +0.42m root jump spike)
//   - Touchdown landing knee/hip cushion on grounded landing frames

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorAnimAction, PlayerPoseState3D } from '../game3d/types3d.ts';

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
  hipsBaseY: number;
  spine?: THREE.Object3D;
  spine1?: THREE.Object3D;
  spine2?: THREE.Object3D;
  head?: THREE.Object3D;
  leftShoulder?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  leftForeArm?: THREE.Object3D;
  leftHand?: THREE.Object3D;
  rightShoulder?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  rightForeArm?: THREE.Object3D;
  rightHand?: THREE.Object3D;
  riflePivot?: THREE.Group;
  muzzleLocal?: THREE.Object3D;
}

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

// Scratch math objects for zero-GC per-frame IK
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _vAimFwd = new THREE.Vector3();
const _vCharRight = new THREE.Vector3();
const _vOrthoUp = new THREE.Vector3();
const _vShoulder = new THREE.Vector3();
const _vElbow = new THREE.Vector3();
const _vHand = new THREE.Vector3();
const _vTarget = new THREE.Vector3();
const _vForegrip = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vLocalDir = new THREE.Vector3();
const _vBasisX = new THREE.Vector3();
const _vBasisZ = new THREE.Vector3();
const _qParentWorld = new THREE.Quaternion();
const _qInvParent = new THREE.Quaternion();
const _qWorld = new THREE.Quaternion();
const _qTwist = new THREE.Quaternion();
const _mBasis = new THREE.Matrix4();

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
  let spine: THREE.Object3D | undefined;
  let spine1: THREE.Object3D | undefined;
  let spine2: THREE.Object3D | undefined;
  let head: THREE.Object3D | undefined;
  let leftShoulder: THREE.Object3D | undefined;
  let leftArm: THREE.Object3D | undefined;
  let leftForeArm: THREE.Object3D | undefined;
  let leftHand: THREE.Object3D | undefined;
  let rightShoulder: THREE.Object3D | undefined;
  let rightArm: THREE.Object3D | undefined;
  let rightForeArm: THREE.Object3D | undefined;
  let rightHand: THREE.Object3D | undefined;

  modelRoot.traverse((obj) => {
    const cname = obj.name.replace(/:/g, '');
    if (cname === 'mixamorigHips') hips = obj;
    else if (cname === 'mixamorigSpine') spine = obj;
    else if (cname === 'mixamorigSpine1') spine1 = obj;
    else if (cname === 'mixamorigSpine2') spine2 = obj;
    else if (cname === 'mixamorigHead') head = obj;
    else if (cname === 'mixamorigLeftShoulder') leftShoulder = obj;
    else if (cname === 'mixamorigLeftArm') leftArm = obj;
    else if (cname === 'mixamorigLeftForeArm') leftForeArm = obj;
    else if (cname === 'mixamorigLeftHand') leftHand = obj;
    else if (cname === 'mixamorigRightShoulder') rightShoulder = obj;
    else if (cname === 'mixamorigRightArm') rightArm = obj;
    else if (cname === 'mixamorigRightForeArm') rightForeArm = obj;
    else if (cname === 'mixamorigRightHand') rightHand = obj;

    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
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

  const hipsBaseY = hips ? hips.position.y : 0.9;
  root.add(modelRoot);

  // Attach Pulse Rifle prop to Operative's RightHand bone with trigger pocket at pivot origin
  let riflePivot: THREE.Group | undefined;
  let muzzleLocal: THREE.Object3D | undefined;
  if (attachRifle && rightHand) {
    riflePivot = new THREE.Group();
    riflePivot.scale.setScalar(0.84);
    const rifleObj = instantiateStaticModel3D('pulse-rifle', 1.0, false);
    // pulse-rifle local spans x: -0.50 (muzzle) .. +0.50 (stock), +Y top rail.
    // Offset -0.18 along X places trigger guard directly in RightHand palm and stock against shoulder.
    rifleObj.root.position.set(-0.18, 0.02, 0.0);
    riflePivot.add(rifleObj.root);
    muzzleLocal = new THREE.Object3D();
    muzzleLocal.position.set(-0.69, 0.055, 0.0);
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
    hipsBaseY,
    spine,
    spine1,
    spine2,
    head,
    leftShoulder,
    leftArm,
    leftForeArm,
    leftHand,
    rightShoulder,
    rightArm,
    rightForeArm,
    rightHand,
    riflePivot,
    muzzleLocal,
  };
}

/** Orients a Mixamo bone so its local +Y axis points strictly along worldDir, updating its world matrix. */
function aimBoneAlongWorldDir(bone: THREE.Object3D | undefined, worldDir: THREE.Vector3, rollY = 0): void {
  if (!bone || !bone.parent) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qParentWorld);
  _qInvParent.copy(_qParentWorld).invert();
  _vLocalDir.copy(worldDir).normalize().applyQuaternion(_qInvParent).normalize();
  bone.quaternion.setFromUnitVectors(Y_AXIS, _vLocalDir);
  if (Math.abs(rollY) > 1e-4) {
    _qTwist.setFromAxisAngle(Y_AXIS, rollY);
    bone.quaternion.multiply(_qTwist);
  }
  bone.updateMatrixWorld(true);
}

/**
 * Applies full split-body quaternion IK for the Side-View Metroidvania Operative:
 * 1) Tilts spine & head toward vertical aimPitch.
 * 2) Locks right arm + forearm into trigger-ready cheek-weld along XY aimFwd.
 * 3) Locks left arm + forearm onto the rifle's forward foregrip (eliminates unarmed sprinter flail).
 * 4) Locks riflePivot world basis strictly onto (-aimFwd, orthoUp, cross) so barrel = laser sight.
 */
function applyTwoHandedRifleIK(inst: RiggedInstance, pose: PlayerPoseState3D): void {
  _vAimFwd.set(pose.aimDirX, pose.aimDirY, 0);
  if (_vAimFwd.lengthSq() < 1e-6) _vAimFwd.set(pose.aimSignX, 0, 0);
  else _vAimFwd.normalize();

  // Facing +X -> character right is +Z (toward camera); facing -X -> character right is -Z
  _vCharRight.set(0, 0, pose.aimSignX);
  _vOrthoUp.crossVectors(_vCharRight, _vAimFwd).normalize();

  // 1. Additive torso & helmet pitch toward aim elevation
  const clampedPitch = Math.max(-0.85, Math.min(0.85, pose.aimPitch));
  if (inst.spine) inst.spine.rotation.x -= clampedPitch * 0.16;
  if (inst.spine1) inst.spine1.rotation.x -= clampedPitch * 0.26;
  if (inst.spine2) inst.spine2.rotation.x -= clampedPitch * 0.28;
  if (inst.head) inst.head.rotation.x -= Math.max(-0.65, Math.min(0.65, pose.aimPitch - clampedPitch * 0.45));
  inst.root.updateMatrixWorld(true);

  if (!inst.rightArm || !inst.rightForeArm || !inst.rightHand) return;

  // 2. Right arm (trigger hand): shoulder -> dropped elbow -> forward chest/shoulder pocket
  inst.rightArm.getWorldPosition(_vShoulder);
  _vTarget
    .copy(_vShoulder)
    .addScaledVector(_vAimFwd, 0.14)
    .addScaledVector(_vOrthoUp, -0.15)
    .addScaledVector(_vCharRight, 0.04);
  _vDir.subVectors(_vTarget, _vShoulder);
  aimBoneAlongWorldDir(inst.rightArm, _vDir);

  inst.rightForeArm.getWorldPosition(_vElbow);
  _vTarget
    .copy(_vShoulder)
    .addScaledVector(_vAimFwd, 0.34)
    .addScaledVector(_vOrthoUp, -0.02)
    .addScaledVector(_vCharRight, -0.02);
  _vDir.subVectors(_vTarget, _vElbow);
  aimBoneAlongWorldDir(inst.rightForeArm, _vDir);

  // Align rightHand world orientation cleanly so fingers wrap grip naturally
  inst.rightHand.updateWorldMatrix(true, false);
  inst.rightHand.getWorldPosition(_vHand);

  // 3. Left arm (support foregrip hand): cradle forward handguard along aimFwd
  if (inst.leftArm && inst.leftForeArm) {
    _vForegrip
      .copy(_vHand)
      .addScaledVector(_vAimFwd, 0.24)
      .addScaledVector(_vOrthoUp, 0.01);

    inst.leftArm.getWorldPosition(_vShoulder);
    _vElbow
      .copy(_vShoulder)
      .lerp(_vForegrip, 0.48)
      .addScaledVector(_vOrthoUp, -0.16)
      .addScaledVector(_vCharRight, -0.05);
    _vDir.subVectors(_vElbow, _vShoulder);
    aimBoneAlongWorldDir(inst.leftArm, _vDir);

    inst.leftForeArm.getWorldPosition(_vElbow);
    _vDir.subVectors(_vForegrip, _vElbow);
    aimBoneAlongWorldDir(inst.leftForeArm, _vDir);
  }

  // 4. Lock pulse-rifle world basis directly onto XY aim ray (-X = barrel, +Y = top rail)
  if (inst.riflePivot && inst.rightHand.parent) {
    inst.rightHand.getWorldQuaternion(_qParentWorld);
    _qInvParent.copy(_qParentWorld).invert();

    _vBasisX.copy(_vAimFwd).negate();
    _vBasisZ.crossVectors(_vBasisX, _vOrthoUp).normalize();
    _mBasis.makeBasis(_vBasisX, _vOrthoUp, _vBasisZ);
    _qWorld.setFromRotationMatrix(_mBasis);

    inst.riflePivot.quaternion.copy(_qInvParent).multiply(_qWorld);
    // Keep trigger area centered in right palm along forearm-to-hand offset
    inst.riflePivot.position.set(0.0, 0.045, 0.01 * pose.aimSignX);
    inst.riflePivot.updateMatrixWorld(true);
  }
}

export function stepRiggedAnimation3D(
  inst: RiggedInstance,
  desired: ActorAnimAction,
  dt: number,
  timeScale = 1,
  upperBodyDeltaYaw = 0,
  aimWeaponReady = false,
  pose?: PlayerPoseState3D,
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
      if (target === 'death' || target === 'jump') {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      next.play();
      if (prev && prev !== next) {
        const fadeDur = desired === 'death' ? 0.1 : desired === 'jump' ? 0.05 : 0.12;
        prev.crossFadeTo(next, fadeDur, desired !== 'jump');
      }
    }
    inst.currentAnim = target;
  }

  const active = inst.actions[inst.currentAnim];
  if (pose && inst.currentAnim === 'jump' && active) {
    // Velocity-locked 3-phase jump clip scrubbing (skips 0.00..0.50s ground squat):
    //   vy >= 0 -> 0.53s..0.80s (rising knee-tuck)
    //   vy <  0 -> 0.80s..1.08s (falling leg extension)
    const jumpTime =
      pose.vy >= 0
        ? 0.53 + (1 - Math.min(1, pose.vy / 10.6)) * 0.27
        : 0.80 + Math.min(1, -pose.vy / 15.0) * 0.28;
    active.timeScale = 0;
    active.time = jumpTime;
  } else if (active) {
    if (pose && (inst.currentAnim === 'run' || inst.currentAnim === 'walk')) {
      const signedRun = pose.moveX * pose.aimSignX;
      const mag = Math.max(0.58, Math.min(1.18, Math.abs(pose.moveX) * 1.12));
      active.timeScale = signedRun < -0.05 ? -mag : mag;
    } else {
      active.timeScale = inst.currentAnim === 'run' || inst.currentAnim === 'walk' ? timeScale : 1;
    }
  }

  inst.mixer.update(dt);

  // Strip baked +0.42m jump root translation & apply touchdown landing cushion
  if (pose && inst.hips) {
    if (!pose.grounded) {
      inst.hips.position.y = inst.hipsBaseY + (pose.vy > 0 ? 0.03 : 0);
    } else if (pose.landingFactor > 0.01) {
      inst.hips.position.y = Math.min(inst.hips.position.y, inst.hipsBaseY) - pose.landingFactor * 0.13;
    }
  }

  if (pose && inst.currentAnim !== 'death' && aimWeaponReady) {
    applyTwoHandedRifleIK(inst, pose);
  } else {
    // Legacy enemy or non-IK additive yaw twist
    if (Math.abs(upperBodyDeltaYaw) > 0.005 && inst.spine1 && inst.spine2) {
      const clamped = Math.max(-0.9, Math.min(0.9, upperBodyDeltaYaw));
      inst.spine1.rotation.y += clamped * 0.42;
      inst.spine2.rotation.y += clamped * 0.58;
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

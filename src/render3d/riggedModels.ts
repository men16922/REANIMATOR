// Rigged multi-clip GLB model loader & Three.js AnimationMixer controller.
// Features Metroid Dread / 1996 Abuse split-body articulation:
//   - Lower body tracks facing hemisphere & reverses walk/run cycle when backpedaling
//   - Upper spine pitches smoothly & quaternion-aims both arms + pulse-rifle along exact XY 360 aim vector
//   - Velocity-locked 3-phase jump clip scrubbing (strips baked pre-jump squat & +0.42m root jump spike)
//   - Touchdown landing knee/hip cushion on grounded landing frames

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ActorAnimAction, PlayerPoseState3D } from '../game3d/types3d.ts';
import { RECOIL_PROFILE, type HeroFrame } from './heroPose.ts';
import { collectGeometries, disposeActorTree } from './disposeActor.ts';
import { GAIT, type EnemyRigFrame, type RigChannels, type RigKind } from './enemyRig3d.ts';
import { WARDEN_ARMOUR_ALBEDO } from './wardenLook3d.ts';

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
  /** Rest-pose quaternions of additively tweaked bones (spine/head), captured on first step */
  restRot?: Map<THREE.Object3D, THREE.Quaternion>;
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
  leftUpLeg?: THREE.Object3D;
  leftLeg?: THREE.Object3D;
  rightUpLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  /** Uniform scale applied to modelRoot (metres per model unit) */
  modelScale: number;
  riflePivot?: THREE.Group;
  muzzleLocal?: THREE.Object3D;
  /** Enemy weight-blended animation state (see stepEnemyRigAnimation3D) */
  enemyBlend?: { started: boolean; deathStarted: boolean };
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
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _vAxis = new THREE.Vector3();
const _qDelta = new THREE.Quaternion();
const _qModel = new THREE.Quaternion();

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

let sharedGeoms: Set<THREE.BufferGeometry> | null = null;
let sharedGeomsFor = -1;

/** True for geometry owned by the loaded glTF scenes (shared by every clone). */
export function isSharedActorGeometry3D(g: THREE.BufferGeometry): boolean {
  if (!sharedGeoms || sharedGeomsFor !== cache.size) {
    sharedGeoms = new Set();
    for (const gltf of cache.values()) collectGeometries(gltf.scene, sharedGeoms);
    sharedGeomsFor = cache.size;
  }
  return sharedGeoms.has(g);
}

/**
 * Frees what one actor clone owns: cloned materials, procedural geometry (hero gear, pick proxy, fallback shapes),
 * skeleton bone textures and mixer bindings. glTF-shared geometry stays. Call after removing the root from the scene.
 */
export function disposeActor3D(root: THREE.Object3D, mixer?: THREE.AnimationMixer, mixerRoot?: THREE.Object3D): void {
  disposeActorTree(root, { isSharedGeometry: isSharedActorGeometry3D, mixer, mixerRoot });
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
  let modelScale = 1;
  if (gltf) {
    modelRoot = SkeletonUtils.clone(gltf.scene);
    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    const rawH = Math.max(0.1, box.max.y - box.min.y);
    const scale = targetHeight / rawH;
    modelRoot.scale.setScalar(scale);
    modelRoot.position.y = -box.min.y * scale;
    modelScale = scale;
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
  let leftUpLeg: THREE.Object3D | undefined;
  let leftLeg: THREE.Object3D | undefined;
  let rightUpLeg: THREE.Object3D | undefined;
  let rightLeg: THREE.Object3D | undefined;

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
    else if (cname === 'mixamorigLeftUpLeg') leftUpLeg = obj;
    else if (cname === 'mixamorigLeftLeg') leftLeg = obj;
    else if (cname === 'mixamorigRightUpLeg') rightUpLeg = obj;
    else if (cname === 'mixamorigRightLeg') rightLeg = obj;

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
    leftUpLeg,
    leftLeg,
    rightUpLeg,
    rightLeg,
    modelScale,
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


/** Per-frame presentation input for the Operative (render only; see heroPose.ts). */
export interface HeroRigInput {
  frame: HeroFrame;
  tSec: number;
  /** World side of the wall being touched: -1 west, +1 east (0 none) */
  wallDir: number;
}

/** Rotates a bone about an axis given in rig space, independent of the bone's own local axes. */
function rotateBoneAboutRigAxis(inst: RiggedInstance, bone: THREE.Object3D | undefined, axis: THREE.Vector3, angle: number): void {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return;
  inst.modelRoot.getWorldQuaternion(_qModel);
  _vAxis.copy(axis).applyQuaternion(_qModel);
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qParentWorld);
  _qInvParent.copy(_qParentWorld).invert();
  _qDelta.setFromAxisAngle(_vAxis, angle);
  bone.quaternion.premultiply(_qParentWorld.premultiply(_qDelta)).premultiply(_qInvParent);
}

/** Additive procedural pose (crouch, landing squash, stomp tuck, lean, twist, hit-back) on top of the clip. */
function applyHeroOffsets(inst: RiggedInstance, hero: HeroRigInput): void {
  const o = hero.frame.offsets;
  const prof = RECOIL_PROFILE[hero.frame.shown];
  const rec = hero.frame.recoil;
  // Legs: thigh forward = negative about the rig X axis, knee fold = positive (verified against the GLB rest pose)
  for (const [up, low] of [
    [inst.leftUpLeg, inst.leftLeg],
    [inst.rightUpLeg, inst.rightLeg],
  ] as const) {
    rotateBoneAboutRigAxis(inst, up, X_AXIS, -o.thigh);
    rotateBoneAboutRigAxis(inst, low, X_AXIS, o.knee);
  }
  const lean = o.lean - rec * prof.rock;
  if (inst.spine) inst.spine.rotation.x += lean * 0.3;
  if (inst.spine1) inst.spine1.rotation.x += lean * 0.35;
  if (inst.spine2) inst.spine2.rotation.x += lean * 0.35;
  if (inst.head) inst.head.rotation.x += o.headPitch - rec * prof.rock * 0.5 - lean * 0.2;
  if (Math.abs(o.twist) > 1e-4 && inst.spine1 && inst.spine2) {
    inst.spine1.rotation.y += o.twist * 0.45;
    inst.spine2.rotation.y += o.twist * 0.55;
  }
  if (hero.frame.railFrac > 0 && inst.spine2) {
    inst.spine2.rotation.z += Math.sin(hero.tSec * 63) * 0.014 * hero.frame.railFrac;
  }
}

/**
 * Applies full split-body quaternion IK for the Side-View Metroidvania Operative:
 * 1) Tilts spine & head toward vertical aimPitch.
 * 2) Locks right arm + forearm into trigger-ready cheek-weld along XY aimFwd.
 * 3) Locks left arm + forearm onto the rifle's forward foregrip (eliminates unarmed sprinter flail).
 * 4) Locks riflePivot world basis strictly onto (-aimFwd, orthoUp, cross) so barrel = laser sight.
 */
function applyTwoHandedRifleIK(inst: RiggedInstance, pose: PlayerPoseState3D, hero?: HeroRigInput): void {
  _vAimFwd.set(pose.aimDirX, pose.aimDirY, 0);
  if (_vAimFwd.lengthSq() < 1e-6) _vAimFwd.set(pose.aimSignX, 0, 0);
  else _vAimFwd.normalize();

  // Presentation layer: muzzle climb from recoil, low-ready (swap / save), rail charge tremor, pull-back distance
  let back = 0;
  let foregrip = 0.24;
  if (hero) {
    const prof = RECOIL_PROFILE[hero.frame.shown];
    const f = hero.frame;
    const tremor = f.railFrac > 0 ? Math.sin(hero.tSec * 71) * 0.022 * f.railFrac : 0;
    const ang = pose.aimSignX * (f.recoil * prof.climb + tremor) - pose.aimSignX * f.lower * 0.85;
    if (Math.abs(ang) > 1e-5) {
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const fx = _vAimFwd.x * c - _vAimFwd.y * sn;
      const fy = _vAimFwd.x * sn + _vAimFwd.y * c;
      _vAimFwd.set(fx, fy, 0);
    }
    back = f.recoil * prof.back;
    foregrip = prof.foregrip;
  }

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
    .addScaledVector(_vAimFwd, 0.14 - back * 0.5)
    .addScaledVector(_vOrthoUp, -0.15)
    .addScaledVector(_vCharRight, 0.04);
  _vDir.subVectors(_vTarget, _vShoulder);
  aimBoneAlongWorldDir(inst.rightArm, _vDir);

  inst.rightForeArm.getWorldPosition(_vElbow);
  _vTarget
    .copy(_vShoulder)
    .addScaledVector(_vAimFwd, 0.34 - back)
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
      .addScaledVector(_vAimFwd, foregrip)
      .addScaledVector(_vOrthoUp, 0.01);

    inst.leftArm.getWorldPosition(_vShoulder);
    if (hero && hero.frame.offsets.wallHand > 0.01 && hero.wallDir !== 0) {
      // Support hand leaves the rifle and presses flat on the wall at head height
      _vTarget.set(_vShoulder.x + hero.wallDir * 0.5, _vShoulder.y + 0.26, _vShoulder.z);
      _vForegrip.lerp(_vTarget, Math.min(1, hero.frame.offsets.wallHand));
    }
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
    if (back > 0) {
      _vLocalDir.copy(_vAimFwd).multiplyScalar(-back / inst.modelScale).applyQuaternion(_qInvParent);
      inst.riflePivot.position.add(_vLocalDir);
    }
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
  hero?: HeroRigInput,
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

  // Additive spine/head tweaks must start from the rest pose each frame; otherwise bones that the active clip
  // does not animate accumulate rotation frame after frame (the head spinning). Animated tracks overwrite this.
  if (!inst.restRot) {
    inst.restRot = new Map();
    for (const b of [inst.spine, inst.spine1, inst.spine2, inst.head]) if (b) inst.restRot.set(b, b.quaternion.clone());
  }
  for (const [b, q] of inst.restRot) b.quaternion.copy(q);

  inst.mixer.update(dt);

  // Strip baked +0.42m jump root translation & apply touchdown landing cushion
  if (pose && inst.hips) {
    if (!pose.grounded) {
      inst.hips.position.y = inst.hipsBaseY + (pose.vy > 0 ? 0.03 : 0);
    } else if (hero) {
      inst.hips.position.y -= hero.frame.offsets.hipsDrop / inst.modelScale;
    } else if (pose.landingFactor > 0.01) {
      inst.hips.position.y = Math.min(inst.hips.position.y, inst.hipsBaseY) - pose.landingFactor * 0.13;
    }
  }

  if (hero && inst.currentAnim !== 'death') applyHeroOffsets(inst, hero);

  if (pose && inst.currentAnim !== 'death' && aimWeaponReady) {
    applyTwoHandedRifleIK(inst, pose, hero);
  } else {
    // Legacy enemy or non-IK additive yaw twist
    if (Math.abs(upperBodyDeltaYaw) > 0.005 && inst.spine1 && inst.spine2) {
      const clamped = Math.max(-0.9, Math.min(0.9, upperBodyDeltaYaw));
      inst.spine1.rotation.y += clamped * 0.42;
      inst.spine2.rotation.y += clamped * 0.58;
    }
  }
}

/** Hit flash never exceeds this lerp toward a warm tint, so no enemy turns into a white silhouette. */
export const ENEMY_FLASH_MAX_3D = 0.35;
const _flashColor = new THREE.Color();

export function flashRiggedMaterials3D(inst: RiggedInstance, hex: number, amount: number, cap = ENEMY_FLASH_MAX_3D): void {
  flashMaterials3D(inst.materials, inst.baseEmissive, hex, amount, cap);
}

/** Shared flash for rigged and static enemies: clamped lerp, emissiveIntensity pinned to 1 (no bloom blowout). */
export function flashMaterials3D(
  materials: THREE.MeshStandardMaterial[],
  baseEmissive: THREE.Color[],
  hex: number,
  amount: number,
  cap = ENEMY_FLASH_MAX_3D,
): void {
  _flashColor.setHex(hex);
  const k = Math.min(cap, Math.max(0, amount));
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    m.emissive.copy(baseEmissive[i]).lerp(_flashColor, k);
    m.emissiveIntensity = 1;
  }
}

/**
 * Keeps enemy materials out of saturation under sun 1.9 + hemisphere 1.35 + exposure 1.4 and gives each kind a
 * distinct tint. Mutates baseEmissive in place so later flashes lerp from the clamped value.
 */
export function tuneEnemyMaterials3D(
  materials: THREE.MeshStandardMaterial[],
  baseEmissive: THREE.Color[],
  tintHex: number,
): void {
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    m.roughness = Math.max(0.55, m.roughness);
    m.metalness = Math.min(0.35, m.metalness);
    m.envMapIntensity = 0.6;
    m.emissiveIntensity = 1;
    m.color.multiply(_flashColor.setHex(tintHex));
    const e = baseEmissive[i];
    const peak = Math.max(e.r, e.g, e.b);
    if (peak > 0.35) e.multiplyScalar(0.35 / peak);
    m.emissive.copy(e);
  }
}

/** Hull emissive ceiling for the Core Warden: only the core and seams may glow, never the whole plate. */
export const WARDEN_EMISSIVE_PEAK_3D = 0.28;
/** Whole-body flash multiplier for the Warden (the shared flash is tuned for small enemies). */
export const WARDEN_FLASH_SCALE_3D = 0.3;

/**
 * Core Warden material pass: a heavy gunmetal colossus instead of the shared lifted, rough, half-metal enemy look.
 * Dark albedo, high metalness, emissive capped so only baked-in glow (core, seams) survives.
 */
export function tuneWardenMaterials3D(materials: THREE.MeshStandardMaterial[], baseEmissive: THREE.Color[]): void {
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    m.color.multiplyScalar(WARDEN_ARMOUR_ALBEDO);
    m.metalness = 0.82;
    m.roughness = Math.min(0.62, Math.max(0.42, m.roughness));
    m.envMapIntensity = 0.9;
    m.emissiveIntensity = 1;
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
    const e = baseEmissive[i];
    const peak = Math.max(e.r, e.g, e.b);
    if (peak > WARDEN_EMISSIVE_PEAK_3D) e.multiplyScalar(WARDEN_EMISSIVE_PEAK_3D / peak);
    m.emissive.copy(e);
  }
}

/**
 * Render-only readability pass for dark enemies: a fresnel rim plus a small albedo self-lift injected into the
 * standard shader. No lights are added. Works for skinned and static meshes (shader chunks are shared).
 */
export function applyEnemyRim3D(materials: THREE.MeshStandardMaterial[], rimHex: number, rim = 0.55, lift = 0.16): void {
  const rimColor = new THREE.Color(rimHex);
  for (const m of materials) {
    const uniforms = { uEnemyRim: { value: rimColor.clone().multiplyScalar(rim) }, uEnemyLift: { value: lift } };
    m.userData.enemyRim = uniforms;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uEnemyRim = uniforms.uEnemyRim;
      shader.uniforms.uEnemyLift = uniforms.uEnemyLift;
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 uEnemyRim;\nuniform float uEnemyLift;\nvoid main() {')
        .replace(
          '#include <opaque_fragment>',
          `float enemyRimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
  outgoingLight += uEnemyRim * enemyRimF + diffuseColor.rgb * uEnemyLift;
  #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => 'enemy-rim-v1';
    m.needsUpdate = true;
  }
}

export interface WardenLookUniforms3D {
  uEnemyRim: { value: THREE.Color };
  uWardenGlow: { value: THREE.Color };
  uWardenCoreColor: { value: THREE.Color };
  uWardenSeam: { value: number };
  uWardenCore: { value: number };
  uWardenMin: { value: THREE.Vector3 };
  uWardenSize: { value: THREE.Vector3 };
}

/**
 * R13 Core Warden shader pass (replaces applyEnemyRim3D for the boss): cool fresnel rim plus procedural
 * armour seams and a chest core in mesh-local normalised space, so the glow rides the skinned body.
 * Colours and amounts are uniforms driven per frame from wardenLook(); no lights are added.
 */
export function applyWardenLook3D(inst: RiggedInstance, rimHex: number, rim: number): WardenLookUniforms3D {
  const box = new THREE.Box3();
  let found = false;
  inst.modelRoot.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (found || !(o as THREE.Mesh).isMesh || !g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox) box.copy(g.boundingBox);
    found = true;
  });
  const size = new THREE.Vector3(1, 1, 1);
  if (found) box.getSize(size);
  const u: WardenLookUniforms3D = {
    uEnemyRim: { value: new THREE.Color(rimHex).multiplyScalar(rim) },
    uWardenGlow: { value: new THREE.Color(0, 0, 0) },
    uWardenCoreColor: { value: new THREE.Color(0, 0, 0) },
    uWardenSeam: { value: 0 },
    uWardenCore: { value: 0 },
    uWardenMin: { value: found ? box.min.clone() : new THREE.Vector3(-0.5, 0, -0.5) },
    uWardenSize: { value: new THREE.Vector3(Math.max(1e-4, size.x), Math.max(1e-4, size.y), Math.max(1e-4, size.z)) },
  };
  for (const m of inst.materials) {
    m.userData.enemyRim = u;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform vec3 uWardenMin;\nuniform vec3 uWardenSize;\nvarying vec3 vWardenN;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWardenN = (position - uWardenMin) / uWardenSize;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          'uniform vec3 uEnemyRim;\nuniform vec3 uWardenGlow;\nuniform vec3 uWardenCoreColor;\nuniform float uWardenSeam;\nuniform float uWardenCore;\nvarying vec3 vWardenN;\nvoid main() {',
        )
        .replace(
          '#include <opaque_fragment>',
          `float wRimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
  vec3 wN = vWardenN;
  float wB1 = abs(fract(wN.y * 9.0 + sin(wN.x * 13.0 + wN.z * 7.0) * 0.35) - 0.5);
  float wB2 = abs(fract(wN.x * 6.0 + wN.z * 5.0 + sin(wN.y * 17.0) * 0.3) - 0.5);
  float wCell = fract(sin(dot(floor(wN * vec3(6.0, 9.0, 5.0)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float wSeam = smoothstep(0.04, 0.0, min(wB1, wB2)) * step(0.35, wCell);
  vec2 wCd = (wN.xy - vec2(0.5, 0.63)) * vec2(1.0, 1.25);
  float wCoreD = dot(wCd, wCd);
  float wCore = exp(-wCoreD * 140.0) + 0.35 * exp(-wCoreD * 28.0);
  outgoingLight += uEnemyRim * wRimF + uWardenGlow * (wSeam * uWardenSeam) + uWardenCoreColor * (wCore * uWardenCore);
  #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => 'warden-look-v1';
    m.needsUpdate = true;
  }
  return u;
}

const ATTACK_START_FRAC = 0.35;
const BLEND_ACTIONS = ['idle', 'walk', 'run', 'attack', 'death'] as const;

/**
 * Weight-blended enemy clip stepper. The rig driver (enemyRig3d.ts) owns the crossfade weights and a stride-locked
 * gait phase: walk and run share one normalised phase, so their feet stay in step while the mix changes with speed
 * and the cycle rate is exactly ground speed / stride (no sliding). Attack plays through once per strike, death once.
 */
export function stepEnemyRigAnimation3D(inst: RiggedInstance, kind: RigKind, frame: EnemyRigFrame, dt: number): void {
  const st = (inst.enemyBlend ??= { started: false, deathStarted: false });
  if (!st.started) {
    for (const name of BLEND_ACTIONS) {
      const a = inst.actions[name];
      if (!a) continue;
      a.reset();
      a.enabled = true;
      a.setLoop(name === 'attack' || name === 'death' ? THREE.LoopOnce : THREE.LoopRepeat, name === 'attack' || name === 'death' ? 1 : Infinity);
      a.clampWhenFinished = name === 'attack' || name === 'death';
      a.play();
    }
    st.started = true;
  }
  const w = frame.weights;
  const atk = inst.actions.attack;
  if (atk && frame.attackRestart) {
    atk.reset();
    atk.enabled = true;
    atk.play();
    atk.time = ATTACK_START_FRAC * atk.getClip().duration;
  }
  const death = inst.actions.death;
  if (death && w.death > 0.001 && !st.deathStarted) {
    death.reset();
    death.enabled = true;
    death.play();
    st.deathStarted = true;
  }
  if (frame.poseState !== 'dead' && st.deathStarted) st.deathStarted = false;
  const g = GAIT[kind];
  const walk = inst.actions.walk;
  const run = inst.actions.run;
  if (walk) {
    walk.timeScale = 0;
    walk.time = frame.gaitPhase * g.walkDur;
    walk.setEffectiveWeight(w.walk);
  }
  if (run) {
    run.timeScale = 0;
    run.time = frame.gaitPhase * g.runDur;
    run.setEffectiveWeight(w.run);
  }
  inst.actions.idle?.setEffectiveWeight(w.idle);
  atk?.setEffectiveWeight(w.attack);
  death?.setEffectiveWeight(w.death);
  const top = frame.clip as ActorAnimAction;
  if (inst.actions[top]) inst.currentAnim = top;
  inst.mixer.update(dt);
}

/**
 * Lays the driver's additive channels on top of the freshly evaluated clip pose. Bones are rotated about rig axes
 * (not their own local axes), parents before children, starting from the clip pose every frame so nothing accumulates.
 */
export function applyEnemyRigChannels3D(inst: RiggedInstance, ch: RigChannels): void {
  if (inst.hips && Math.abs(ch.hipsDrop) > 1e-5) inst.hips.position.y -= ch.hipsDrop / inst.modelScale;
  rotateBoneAboutRigAxis(inst, inst.leftUpLeg, X_AXIS, -ch.thighL);
  rotateBoneAboutRigAxis(inst, inst.leftLeg, X_AXIS, ch.kneeL);
  rotateBoneAboutRigAxis(inst, inst.rightUpLeg, X_AXIS, -ch.thighR);
  rotateBoneAboutRigAxis(inst, inst.rightLeg, X_AXIS, ch.kneeR);
  rotateBoneAboutRigAxis(inst, inst.spine, X_AXIS, ch.spine * 0.3);
  rotateBoneAboutRigAxis(inst, inst.spine1, X_AXIS, ch.spine * 0.35);
  rotateBoneAboutRigAxis(inst, inst.spine2, X_AXIS, ch.spine * 0.35);
  rotateBoneAboutRigAxis(inst, inst.spine1, Y_AXIS, ch.spineTwist * 0.4);
  rotateBoneAboutRigAxis(inst, inst.spine2, Y_AXIS, ch.spineTwist * 0.6);
  rotateBoneAboutRigAxis(inst, inst.spine2, Z_AXIS, ch.spineRoll);
  rotateBoneAboutRigAxis(inst, inst.head, X_AXIS, ch.headPitch);
  rotateBoneAboutRigAxis(inst, inst.head, Y_AXIS, ch.headYaw);
  rotateBoneAboutRigAxis(inst, inst.leftArm, X_AXIS, -ch.armUpL);
  rotateBoneAboutRigAxis(inst, inst.leftArm, Z_AXIS, ch.armOutL);
  rotateBoneAboutRigAxis(inst, inst.leftForeArm, X_AXIS, -ch.foreL);
  rotateBoneAboutRigAxis(inst, inst.rightArm, X_AXIS, -ch.armUpR);
  rotateBoneAboutRigAxis(inst, inst.rightArm, Z_AXIS, -ch.armOutR);
  rotateBoneAboutRigAxis(inst, inst.rightForeArm, X_AXIS, -ch.foreR);
  inst.root.updateMatrixWorld(true);
}

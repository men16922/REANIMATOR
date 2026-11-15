// Round 10: render side of the Reclaimer hunter. Reuses the existing rigged Bio-Stalker GLB (taller, dark steel tint, a
// glowing visor bar) and draws the zone boundary gates as emissive bars. No new assets, no lights, about 6 draw calls.
// All colour and state decisions are pure functions at the top so node tests cover them without WebGL.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HunterState3D, HunterZoneDef3D } from '../game3d/hunter3d.ts';
import { HUNTER_HEIGHT } from '../game3d/hunter3d.ts';
import { EnemyRigDriver } from './enemyRig3d.ts';
import { collapsePose, flinchPose, flinchStep, type Flinch } from './enemyMotion.ts';
import {
  applyEnemyRigChannels3D,
  applyEnemyRim3D,
  flashRiggedMaterials3D,
  disposeActor3D,
  instantiateRiggedModel3D,
  stepEnemyRigAnimation3D,
  type RiggedInstance,
} from './riggedModels.ts';
import { PARRY_FLASH_CAP, parryFlashAmount } from './vfxStyle3d.ts';

/** Zone gate and visor colours by unit state. */
export const HUNTER_COLORS = {
  quiet: 0xffa23a,
  alarm: 0xff2a20,
  exposed: 0x66f0ff,
  off: 0x38ff8a,
  dead: 0x2a1410,
} as const;

/** Gunmetal body material for the unit (flat dark steel, faint warm emissive; visor and flashes carry the colour). */
export const HUNTER_STEEL = { color: 0x39434f, metalness: 0.55, roughness: 0.5, env: 0.5, emissive: 0x140605 } as const;

/** Cool, narrow rim for the steel body. The shared enemy rim (0.7, lift 0.12) washes a dark metal out to pale grey. */
export const HUNTER_RIM = { rim: 0.22, lift: 0 } as const;

/** Flat gunmetal on one material: drops every colour/PBR map so no flesh albedo or baked emissive survives. */
function steelOne(m: THREE.MeshStandardMaterial): void {
  m.map = null;
  m.emissiveMap = null;
  m.metalnessMap = null;
  m.roughnessMap = null;
  m.aoMap = null;
  m.vertexColors = false;
  m.color.setHex(HUNTER_STEEL.color);
  m.metalness = HUNTER_STEEL.metalness;
  m.roughness = HUNTER_STEEL.roughness;
  m.envMapIntensity = HUNTER_STEEL.env;
  m.emissive.setHex(HUNTER_STEEL.emissive);
  m.emissiveIntensity = 1;
  m.needsUpdate = true;
}

/**
 * Applies the hunter steel to EVERY material slot of every mesh under `root` (single material or material array).
 * Non-standard slots are replaced by a steel MeshStandardMaterial so no slot keeps its original look. Returns the unique
 * steel materials in first-seen order (the caller uses them for flashes).
 */
export function applyHunterSteel(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const out = new Set<THREE.MeshStandardMaterial>();
  const swap = (m: THREE.Material): THREE.MeshStandardMaterial => {
    let st: THREE.MeshStandardMaterial;
    if (m instanceof THREE.MeshStandardMaterial) st = m;
    else {
      st = new THREE.MeshStandardMaterial();
      m.dispose();
    }
    steelOne(st);
    out.add(st);
    return st;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return [...out];
}

/** Bone-local placement for a plate: the rig is scaled to the unit height, so a root-space offset must be divided by the bone's world scale. */
export function boneLocalOffset(rootOffset: THREE.Vector3, boneWorldScale: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(rootOffset.x / boneWorldScale.x, rootOffset.y / boneWorldScale.y, rootOffset.z / boneWorldScale.z);
}

export type HunterLook = 'quiet' | 'alarm' | 'exposed' | 'off';

/** Which colour set the unit and its gates show right now. */
export function hunterLook(h: Pick<HunterState3D, 'alive' | 'state'>): HunterLook {
  if (!h.alive) return 'off';
  if (h.state === 'stagger') return 'exposed';
  if (h.state === 'alert' || h.state === 'chase' || h.state === 'windup') return 'alarm';
  return 'quiet';
}

/** Body flash for the unit: parry window white, exposed cyan, alarm red pulse, quiet a dim amber. `amount` 0 means no flash. */
export function hunterFlash(h: HunterState3D, tick: number, tSec: number, reduce: boolean): { hex: number; amount: number; cap?: number } {
  if (!h.alive) return { hex: 0x000000, amount: 0 };
  const parry = parryFlashAmount(h.parryOpen, tick, reduce);
  if (parry > 0) return { hex: 0xffffff, amount: parry, cap: PARRY_FLASH_CAP };
  if (h.pingTicks > 0) return { hex: 0xffe9b0, amount: 0.15 };
  const pulse = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(tSec * (h.state === 'chase' ? 14 : 8));
  switch (hunterLook(h)) {
    // The lerp runs in linear space, so even 0.1 turns the dark steel bright red. Keep state tints faint (the visor,
    // seams and gates carry the colour); the windup ramps higher as the grab tell.
    case 'exposed': return { hex: HUNTER_COLORS.exposed, amount: reduce ? 0.05 : 0.045 + 0.02 * Math.sin(tSec * 18) };
    case 'alarm': return { hex: HUNTER_COLORS.alarm, amount: h.state === 'windup' ? 0.015 + 0.035 * (1 - h.windupTicks / Math.max(1, h.stateTicks + h.windupTicks)) : 0.01 + 0.015 * pulse };
    default: return { hex: HUNTER_COLORS.quiet, amount: 0 };
  }
}

const GATE_DEPTH = 3.4;

/** Hard-surface armour: near-black gunmetal, high metalness, low roughness, so the env reflection draws a cool rim. */
export const HUNTER_ARMOUR = { color: 0x1c232b, metalness: 0.92, roughness: 0.28, env: 1.1, hazard: 0xc9981a } as const;
/** Bone groups that carry a merged armour mesh (one mesh per bone, steel + accent + hazard as material groups). */
export const HUNTER_ARMOUR_BONES = ['spine2', 'leftArm', 'rightArm', 'leftForeArm', 'rightForeArm'] as const;

interface ArmourParts {
  steel: THREE.BufferGeometry[];
  accent: THREE.BufferGeometry[];
  hazard: THREE.BufferGeometry[];
}

/**
 * Body measurements in rig-root space (metres, rest pose), read from the rig itself so the plates hug this model
 * instead of a generic human. The Bio-Stalker has a short torso (hips 1.66 m, neck 2.35 m on a 2.9 m unit) and a
 * narrow chest, so fixed human-sized plates stuck out above the neck and behind the back.
 */
export interface HunterFit {
  /** Chest band: bottom (Spine1) and top (Neck) heights */
  chestLow: number;
  chestHigh: number;
  /** Torso surface along +Z (front) and -Z (back) inside the chest band */
  front: number;
  back: number;
  /** Distance between the two upper-arm joints */
  shoulderSpan: number;
}

/** Fit for a body from its bone heights and the skinned surface (falls back to bone-derived depth with no mesh). */
export function hunterFit(bones: { spine1: THREE.Vector3; neck: THREE.Vector3; leftArm: THREE.Vector3; rightArm: THREE.Vector3 }, surface?: { front: number; back: number }): HunterFit {
  const chestLow = bones.spine1.y;
  const chestHigh = Math.max(chestLow + 0.1, bones.neck.y);
  const span = Math.max(0.2, Math.abs(bones.leftArm.x - bones.rightArm.x));
  const zc = (bones.spine1.z + bones.neck.z) / 2;
  return {
    chestLow,
    chestHigh,
    front: surface ? surface.front : zc + span * 0.4,
    back: surface ? surface.back : zc - span * 0.4,
    shoulderSpan: span,
  };
}

/** Front/back of the skinned torso inside the chest band, |x| under a third of the shoulder span (arms excluded). */
function torsoSurface(rig: RiggedInstance, low: number, high: number, halfX: number): { front: number; back: number } | undefined {
  let mesh: THREE.SkinnedMesh | undefined;
  rig.modelRoot.traverse((o) => {
    if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) return undefined;
  const pos = mesh.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let front = -Infinity;
  let back = Infinity;
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v);
    rig.root.worldToLocal(v.applyMatrix4(mesh.matrixWorld));
    if (v.y < low || v.y > high || Math.abs(v.x) > halfX) continue;
    front = Math.max(front, v.z);
    back = Math.min(back, v.z);
  }
  return front > back ? { front, back } : undefined;
}

/**
 * Bone-local transform for a plate authored in rig-root space. The bones sit inside a model root scaled to the unit
 * height (1.706 for the Stalker), so the local matrix divides out the bone's world scale and rotation:
 * local = inverse(boneWorld) * rootWorld * rootSpace. Applying it under the bone reproduces `rootSpace` exactly.
 */
export function plateLocalMatrix(boneWorld: THREE.Matrix4, rootWorld: THREE.Matrix4, rootSpace: THREE.Matrix4): THREE.Matrix4 {
  return new THREE.Matrix4().copy(boneWorld).invert().multiply(rootWorld).multiply(rootSpace);
}

const _up = new THREE.Vector3(0, 1, 0);

/** Places a geometry in rig-root space: centre `c`, orientation `q`. */
function place(g: THREE.BufferGeometry, c: THREE.Vector3, q: THREE.Quaternion): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1)));
  return g;
}
const eul = (x: number, y: number, z: number): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function rootPos(rig: RiggedInstance, bone: THREE.Object3D): THREE.Vector3 {
  return rig.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
}

/** Plate geometry for one bone group, in rig-root space, sized from the fit. Local +Z faces forward. */
export function armourParts(fit: HunterFit, key: (typeof HUNTER_ARMOUR_BONES)[number], p: THREE.Vector3, end?: THREE.Vector3): ArmourParts {
  const parts: ArmourParts = { steel: [], accent: [], hazard: [] };
  const id = new THREE.Quaternion();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const depth = Math.max(0.12, fit.front - fit.back);
  if (key === 'spine2') {
    // Chest plate on the front surface between Spine1 and the neck, a collar bar, core light, hazard slashes, low back fins
    const h = fit.chestHigh - fit.chestLow;
    const w = fit.shoulderSpan * 0.78;
    const cy = fit.chestLow + h * 0.5;
    const t = 0.07;
    parts.steel.push(place(new THREE.BoxGeometry(w, h * 0.95, t), V(p.x, cy, fit.front + t * 0.3), id));
    parts.steel.push(place(new THREE.BoxGeometry(w * 1.08, 0.06, depth * 0.5), V(p.x, fit.chestHigh - 0.03, fit.front - depth * 0.18), eul(-0.2, 0, 0)));
    parts.accent.push(place(new THREE.BoxGeometry(0.09, 0.09, 0.03), V(p.x, cy + h * 0.08, fit.front + t * 0.85), id));
    for (let i = -1; i <= 1; i++) parts.hazard.push(place(new THREE.BoxGeometry(w * 0.16, 0.035, 0.02), V(p.x + i * w * 0.3, fit.chestLow + h * 0.14, fit.front + t * 0.85), eul(0, 0, 0.7)));
    // Back plate and three short fins hugging the back
    parts.steel.push(place(new THREE.BoxGeometry(w * 0.9, h * 0.9, t), V(p.x, cy, fit.back - t * 0.3), id));
    for (let i = 0; i < 3; i++) parts.steel.push(place(new THREE.BoxGeometry(0.035, h * (0.55 - i * 0.1), 0.12), V(p.x + (i - 1) * w * 0.22, cy + h * 0.1, fit.back - 0.07), eul(0.35, 0, (i - 1) * 0.12)));
    parts.accent.push(place(new THREE.BoxGeometry(0.035, 0.035, 0.035), V(p.x + w * 0.22, cy + h * 0.42, fit.back - 0.13), id));
    return parts;
  }
  const s = Math.sign(p.x) || 1;
  if (key === 'leftArm' || key === 'rightArm') {
    // Pauldron capping the shoulder joint, a raised rim and one accent seam
    const pw = fit.shoulderSpan * 0.42;
    const pd = depth * 0.95;
    const zc = (fit.front + fit.back) / 2;
    parts.steel.push(place(new THREE.BoxGeometry(pw, 0.07, pd), V(p.x + s * pw * 0.12, p.y + 0.08, zc), eul(0, 0, -s * 0.3)));
    parts.steel.push(place(new THREE.BoxGeometry(pw * 0.7, 0.07, pd * 0.75), V(p.x + s * pw * 0.2, p.y + 0.14, zc), eul(0, 0, -s * 0.3)));
    parts.accent.push(place(new THREE.BoxGeometry(pw * 0.9, 0.02, 0.02), V(p.x + s * pw * 0.12, p.y + 0.1, zc + pd * 0.5), eul(0, 0, -s * 0.3)));
    return parts;
  }
  // Forearm bracer along elbow-to-hand with a short forward claw blade
  const e = end ?? p.clone().add(V(s * 0.3, -0.3, 0));
  const d = e.clone().sub(p);
  const len = Math.max(0.15, d.length());
  d.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d);
  const th = Math.max(0.07, depth * 0.24);
  parts.steel.push(place(new THREE.BoxGeometry(th, len * 0.75, th), p.clone().addScaledVector(d, len * 0.5), q));
  parts.accent.push(place(new THREE.BoxGeometry(th * 1.08, len * 0.08, th * 1.08), p.clone().addScaledVector(d, len * 0.7), q));
  parts.steel.push(place(new THREE.ConeGeometry(th * 0.3, len * 0.4, 4), e.clone().addScaledVector(d, len * 0.2), q));
  return parts;
}

function mergeGroup(g: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!g.length) return null;
  const m = mergeGeometries(g, false);
  for (const x of g) x.dispose();
  return m;
}

interface GateView {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

export class HunterView {
  readonly root = new THREE.Group();
  private readonly scene: THREE.Scene;
  private rig: RiggedInstance;
  private driver: EnemyRigDriver;
  private visor: THREE.Mesh;
  private visorMat: THREE.MeshBasicMaterial;
  private gates: GateView[] = [];
  private visorBase = new THREE.Vector3(1, 1, 1);
  private armour: THREE.Mesh[] = [];
  private armourMats: THREE.Material[] = [];
  private accentMat = new THREE.MeshBasicMaterial({ color: HUNTER_COLORS.quiet, toneMapped: false });
  private readonly proxy: THREE.Mesh;
  private prevX: number;
  private curX: number;
  private lastTick = -1;
  private lodAcc = 0;

  constructor(scene: THREE.Scene, zone: HunterZoneDef3D, h: HunterState3D) {
    this.scene = scene;
    this.root.name = 'hunter-view';
    this.rig = instantiateRiggedModel3D('bio-stalker', HUNTER_HEIGHT, false);
    this.rig.root.name = `hunter:${h.id}`;
    // Dark steel plating with a hot rim, distinct from the green Stalker. The Stalker texture is flesh orange and a
    // colour multiply cannot remove a hue, so the hunter drops the albedo and emissive maps for a flat gunmetal.
    const steel = applyHunterSteel(this.rig.modelRoot);
    this.rig.materials.length = 0;
    this.rig.baseEmissive.length = 0;
    for (const m of steel) {
      this.rig.materials.push(m);
      this.rig.baseEmissive.push(m.emissive.clone());
    }
    applyEnemyRim3D(this.rig.materials, 0x8fb4ff, HUNTER_RIM.rim, HUNTER_RIM.lift);
    this.rig.root.rotation.order = 'YXZ';
    this.visorMat = new THREE.MeshBasicMaterial({ color: HUNTER_COLORS.quiet, toneMapped: false });
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.12), this.visorMat);
    this.visor.name = 'hunter-visor';
    // Local +Z is the facing direction (the root yaws to the facing)
    this.visor.position.set(0, HUNTER_HEIGHT * 0.9, 0.2);
    this.rig.root.add(this.visor);
    this.buildArmour();
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(1.6, HUNTER_HEIGHT, 1.6), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.visible = false;
    this.proxy.position.y = HUNTER_HEIGHT / 2;
    this.rig.root.add(this.proxy);
    this.rig.root.userData = { hunterId: h.id, kind: 'hunter', state: h.state };
    this.root.add(this.rig.root);
    this.driver = new EnemyRigDriver('stalker', h);
    this.prevX = h.x;
    this.curX = h.x;

    for (const g of zone.gates) {
      const mat = new THREE.MeshBasicMaterial({ color: HUNTER_COLORS.quiet, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
      const geo = g.axis === 'x' ? new THREE.BoxGeometry(0.14, g.size, GATE_DEPTH) : new THREE.BoxGeometry(g.size, 0.14, GATE_DEPTH);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `hunter-gate:${g.id}`;
      if (g.axis === 'x') mesh.position.set(g.x, zone.floorY + g.size / 2, -0.2);
      else mesh.position.set(g.x, g.y, -0.2);
      this.root.add(mesh);
      this.gates.push({ mesh, mat });
    }
    scene.add(this.root);
  }

  /** Hard-surface plates parented to the rig bones, merged to one mesh per bone. Needs the bones, so the capsule fallback skips it. */
  private buildArmour(): void {
    const rig = this.rig;
    rig.root.updateMatrixWorld(true);
    if (!rig.spine1 || !rig.spine2 || !rig.leftArm || !rig.rightArm) return;
    const neck = rig.head?.parent ?? rig.spine2;
    const bones = { spine1: rootPos(rig, rig.spine1), neck: rootPos(rig, neck), leftArm: rootPos(rig, rig.leftArm), rightArm: rootPos(rig, rig.rightArm) };
    const span = Math.abs(bones.leftArm.x - bones.rightArm.x);
    this.fit = hunterFit(bones, torsoSurface(rig, bones.spine1.y, bones.neck.y, span / 3));
    const steel = new THREE.MeshStandardMaterial({ color: HUNTER_ARMOUR.color, metalness: HUNTER_ARMOUR.metalness, roughness: HUNTER_ARMOUR.roughness, envMapIntensity: HUNTER_ARMOUR.env, emissive: 0x05080c });
    const hazard = new THREE.MeshStandardMaterial({ color: HUNTER_ARMOUR.hazard, metalness: 0.3, roughness: 0.55, emissive: 0x2a1c00 });
    const mats: THREE.Material[] = [steel, this.accentMat, hazard];
    this.armourMats.push(steel, hazard);
    const ident = new THREE.Matrix4();
    for (const key of HUNTER_ARMOUR_BONES) {
      const bone = rig[key];
      if (!bone) continue;
      const hand = key === 'leftForeArm' ? rig.leftHand : key === 'rightForeArm' ? rig.rightHand : undefined;
      const parts = armourParts(this.fit, key, rootPos(rig, bone), hand ? rootPos(rig, hand) : undefined);
      const sets = [mergeGroup(parts.steel), mergeGroup(parts.accent), mergeGroup(parts.hazard)];
      const used = sets.filter((g): g is THREE.BufferGeometry => !!g);
      const geo = mergeGeometries(used, true);
      for (const g of used) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, sets.map((g, i) => (g ? mats[i] : null)).filter((m): m is THREE.Material => !!m));
      mesh.name = `hunter-armour:${key}`;
      mesh.castShadow = false;
      // Geometry is in rig-root space: the bone-local matrix divides out the model scale and the bone rotation
      plateLocalMatrix(bone.matrixWorld, rig.root.matrixWorld, ident).decompose(mesh.position, mesh.quaternion, mesh.scale);
      bone.add(mesh);
      this.armour.push(mesh);
    }
    // Visor on the face: just above the head joint, flush with the front of the head
    if (rig.head) {
      const hp = rootPos(rig, rig.head);
      this.visor.position.set(hp.x, hp.y + 0.14, this.fit.front - 0.02);
      this.visor.updateMatrix();
      plateLocalMatrix(rig.head.matrixWorld, rig.root.matrixWorld, this.visor.matrix).decompose(this.visor.position, this.visor.quaternion, this.visor.scale);
      rig.head.add(this.visor);
      this.visorBase.copy(this.visor.scale);
    }
  }

  /** Measured body fit (null on the capsule fallback). Tests check plates sit on the body. */
  fit: HunterFit | null = null;
  private flinch: Flinch = { amp: 0, kb: 0 };
  private prevHit = 0;

  /** Meshes this view adds (tests assert the draw budget). */
  meshCount(): number {
    let n = 0;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) n++;
    });
    return n;
  }

  update(h: HunterState3D, tick: number, a: number, dt: number, tSec: number, player: { x: number; y: number }, reduce: boolean): void {
    if (tick !== this.lastTick) {
      this.prevX = this.curX;
      this.curX = h.x;
      this.lastTick = tick;
    }
    // Far from the player the skinned rig is not worth posing
    if (Math.abs(this.curX - player.x) > 45) {
      this.rig.root.visible = false;
      return;
    }
    const ex = Math.abs(this.curX - this.prevX) > 4 ? this.curX : this.prevX + (this.curX - this.prevX) * a;
    const rig = this.rig;
    rig.root.userData.state = h.alive ? h.state : 'dead';
    this.lodAcc += dt;
    const frame = this.driver.step(h, player, this.lodAcc, tSec, ex);
    stepEnemyRigAnimation3D(rig, 'stalker', frame, this.lodAcc);
    applyEnemyRigChannels3D(rig, frame.ch);
    this.lodAcc = 0;
    const hitEdge = h.alive && h.hitFlashTicks > this.prevHit;
    this.prevHit = h.hitFlashTicks;
    this.flinch = h.alive ? flinchStep(this.flinch, dt, hitEdge, h.facing, 0.3) : { amp: 0, kb: 0 };
    const fl = flinchPose(this.flinch.amp);
    const col3 = h.alive ? { sink: 0, squashY: 1 } : collapsePose(h.deathTicks);
    rig.root.position.set(ex + this.flinch.kb, h.y - col3.sink, 0);
    rig.root.rotation.set(frame.rootPitch + fl.pitch * 0.4, frame.bodyYaw, 0);
    rig.root.scale.set(1, Math.max(0.001, frame.rootScaleY) * fl.sy * col3.squashY, 1);
    rig.root.visible = true;

    const f = hunterFlash(h, tick, tSec, reduce);
    flashRiggedMaterials3D(rig, f.hex, f.amount, f.cap);

    // Visor and gates share the unit's look
    const look = hunterLook(h);
    const col = h.alive ? HUNTER_COLORS[look] : HUNTER_COLORS.dead;
    this.visorMat.color.setHex(col);
    this.accentMat.color.setHex(col);
    this.visor.scale.set(this.visorBase.x, this.visorBase.y * (h.alive ? 1 : 0.4), this.visorBase.z);
    const pulse = reduce ? 0.8 : 0.65 + 0.35 * Math.sin(tSec * (look === 'alarm' ? 12 : 3));
    for (const g of this.gates) {
      g.mat.color.setHex(HUNTER_COLORS[look]);
      g.mat.opacity = look === 'off' ? 0.22 : 0.3 + 0.35 * pulse;
    }
  }

  dispose(): void {
    this.scene.remove(this.root);
    disposeActor3D(this.rig.root, this.rig.mixer, this.rig.modelRoot);
    for (const g of this.gates) {
      g.mesh.geometry.dispose();
      g.mat.dispose();
    }
    for (const m of this.armour) m.geometry.dispose();
    for (const m of this.armourMats) m.dispose();
    this.accentMat.dispose();
    this.visor.geometry.dispose();
    this.visorMat.dispose();
    this.proxy.geometry.dispose();
    (this.proxy.material as THREE.Material).dispose();
  }
}

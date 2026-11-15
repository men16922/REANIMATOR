// Round 10: render side of the Reclaimer hunter. Reuses the existing rigged Bio-Stalker GLB (taller, dark steel tint, a
// glowing visor bar) and draws the zone boundary gates as emissive bars. No new assets, no lights, about 6 draw calls.
// All colour and state decisions are pure functions at the top so node tests cover them without WebGL.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HunterState3D, HunterZoneDef3D } from '../game3d/hunter3d.ts';
import { HUNTER_HEIGHT } from '../game3d/hunter3d.ts';
import { EnemyRigDriver } from './enemyRig3d.ts';
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
  if (h.pingTicks > 0) return { hex: 0xffe9b0, amount: 0.35 };
  const pulse = reduce ? 0.7 : 0.5 + 0.5 * Math.sin(tSec * (h.state === 'chase' ? 14 : 8));
  switch (hunterLook(h)) {
    case 'exposed': return { hex: HUNTER_COLORS.exposed, amount: reduce ? 0.35 : 0.3 + 0.12 * Math.sin(tSec * 18) };
    case 'alarm': return { hex: HUNTER_COLORS.alarm, amount: h.state === 'windup' ? 0.25 + 0.3 * (1 - h.windupTicks / Math.max(1, h.stateTicks + h.windupTicks)) : 0.12 + 0.16 * pulse };
    default: return { hex: HUNTER_COLORS.quiet, amount: 0.05 };
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

const _up = new THREE.Vector3(0, 1, 0);

/** Places a geometry in rig-root space: centre `c`, orientation from euler `e` (or a quaternion). */
function place(g: THREE.BufferGeometry, c: THREE.Vector3, q: THREE.Quaternion, sc?: THREE.Vector3): THREE.BufferGeometry {
  g.applyMatrix4(new THREE.Matrix4().compose(c, q, sc ?? new THREE.Vector3(1, 1, 1)));
  return g;
}
const eul = (x: number, y: number, z: number): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

function rootPos(rig: RiggedInstance, bone: THREE.Object3D): THREE.Vector3 {
  return rig.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
}

function armourParts(rig: RiggedInstance, key: (typeof HUNTER_ARMOUR_BONES)[number], bone: THREE.Object3D): ArmourParts {
  const parts: ArmourParts = { steel: [], accent: [], hazard: [] };
  const p = rootPos(rig, bone);
  const id = new THREE.Quaternion();
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (key === 'spine2') {
    // Chest plate with a lower hazard band, glowing core, back fins and an antenna
    parts.steel.push(place(new THREE.BoxGeometry(1.0, 0.72, 0.3), p.clone().add(V(0, 0.02, 0.3)), id));
    parts.steel.push(place(new THREE.BoxGeometry(1.1, 0.14, 0.34), p.clone().add(V(0, 0.42, 0.28)), eul(-0.25, 0, 0)));
    parts.accent.push(place(new THREE.BoxGeometry(0.18, 0.18, 0.06), p.clone().add(V(0, 0.1, 0.47)), id));
    for (let i = -1; i <= 1; i++) parts.hazard.push(place(new THREE.BoxGeometry(0.2, 0.09, 0.05), p.clone().add(V(i * 0.3, -0.26, 0.47)), eul(0, 0, 0.7)));
    for (let i = 0; i < 3; i++) parts.steel.push(place(new THREE.BoxGeometry(0.07, 0.5 - i * 0.1, 0.4), p.clone().add(V((i - 1) * 0.2, 0.26 + i * 0.03, -0.3)), eul(0.4, 0, (i - 1) * 0.15)));
    parts.steel.push(place(new THREE.CylinderGeometry(0.014, 0.022, 1.0, 5), p.clone().add(V(0.3, 0.75, -0.3)), eul(0.12, 0, -0.1)));
    parts.accent.push(place(new THREE.BoxGeometry(0.06, 0.06, 0.06), p.clone().add(V(0.33, 1.25, -0.33)), id));
    return parts;
  }
  const s = Math.sign(p.x) || 1;
  if (key === 'leftArm' || key === 'rightArm') {
    // Pauldron: a slab and a raised rim over the shoulder, with one accent seam
    parts.steel.push(place(new THREE.BoxGeometry(0.52, 0.16, 0.56), p.clone().add(V(s * 0.1, 0.18, 0)), eul(0, 0, -s * 0.28)));
    parts.steel.push(place(new THREE.BoxGeometry(0.4, 0.2, 0.4), p.clone().add(V(s * 0.16, 0.32, 0)), eul(0, 0, -s * 0.28)));
    parts.accent.push(place(new THREE.BoxGeometry(0.5, 0.03, 0.04), p.clone().add(V(s * 0.1, 0.22, 0.29)), eul(0, 0, -s * 0.28)));
    return parts;
  }
  // Forearm bracer along elbow-to-hand with a forward claw blade
  const hand = key === 'leftForeArm' ? rig.leftHand : rig.rightHand;
  const end = hand ? rootPos(rig, hand) : p.clone().add(V(s * 0.6, -0.1, 0));
  const d = end.clone().sub(p);
  const len = Math.max(0.3, d.length());
  d.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d);
  parts.steel.push(place(new THREE.BoxGeometry(0.2, len * 0.8, 0.2), p.clone().addScaledVector(d, len * 0.45), q));
  parts.accent.push(place(new THREE.BoxGeometry(0.215, len * 0.1, 0.215), p.clone().addScaledVector(d, len * 0.62), q));
  const blade = new THREE.ConeGeometry(0.07, 0.8, 4);
  parts.steel.push(place(blade, end.clone().addScaledVector(d, 0.3), q));
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
    for (let i = 0; i < this.rig.materials.length; i++) {
      const m = this.rig.materials[i];
      m.map = null;
      m.emissiveMap = null;
      m.vertexColors = false;
      m.color.setHex(HUNTER_STEEL.color);
      m.metalness = HUNTER_STEEL.metalness;
      m.roughness = HUNTER_STEEL.roughness;
      m.envMapIntensity = HUNTER_STEEL.env;
      m.emissiveIntensity = 1;
      this.rig.baseEmissive[i].setHex(HUNTER_STEEL.emissive);
      m.emissive.copy(this.rig.baseEmissive[i]);
      m.needsUpdate = true;
    }
    applyEnemyRim3D(this.rig.materials, 0x8fb4ff, 0.7, 0.12);
    this.rig.root.rotation.order = 'YXZ';
    this.visorMat = new THREE.MeshBasicMaterial({ color: HUNTER_COLORS.quiet, toneMapped: false });
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.3), this.visorMat);
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
    const steel = new THREE.MeshStandardMaterial({ color: HUNTER_ARMOUR.color, metalness: HUNTER_ARMOUR.metalness, roughness: HUNTER_ARMOUR.roughness, envMapIntensity: HUNTER_ARMOUR.env, emissive: 0x05080c });
    const hazard = new THREE.MeshStandardMaterial({ color: HUNTER_ARMOUR.hazard, metalness: 0.3, roughness: 0.55, emissive: 0x2a1c00 });
    const mats: THREE.Material[] = [steel, this.accentMat, hazard];
    this.armourMats.push(steel, hazard);
    for (const key of HUNTER_ARMOUR_BONES) {
      const bone = rig[key];
      if (!bone) continue;
      const parts = armourParts(rig, key, bone);
      const sets = [mergeGroup(parts.steel), mergeGroup(parts.accent), mergeGroup(parts.hazard)];
      const used = sets.filter((g): g is THREE.BufferGeometry => !!g);
      const geo = mergeGeometries(used, true);
      for (const g of used) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, sets.map((g, i) => (g ? mats[i] : null)).filter((m): m is THREE.Material => !!m));
      mesh.name = `hunter-armour:${key}`;
      mesh.castShadow = false;
      rig.root.add(mesh);
      mesh.updateMatrixWorld(true);
      bone.attach(mesh);
      this.armour.push(mesh);
    }
    // The visor follows the head bone when there is one
    if (rig.head) {
      this.visor.updateMatrixWorld(true);
      rig.head.attach(this.visor);
      this.visorBase.copy(this.visor.scale);
    }
  }

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
    rig.root.position.set(ex, h.y, 0);
    rig.root.rotation.set(frame.rootPitch, frame.bodyYaw, 0);
    rig.root.scale.set(1, Math.max(0.001, frame.rootScaleY), 1);
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

// Round 10: render side of the Reclaimer hunter. Reuses the existing rigged Bio-Stalker GLB (taller, dark steel tint, a
// glowing visor bar) and draws the zone boundary gates as emissive bars. No new assets, no lights, about 6 draw calls.
// All colour and state decisions are pure functions at the top so node tests cover them without WebGL.
import * as THREE from 'three';
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
    this.visor.scale.set(1, h.alive ? 1 : 0.4, 1);
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
    this.visor.geometry.dispose();
    this.visorMat.dispose();
    this.proxy.geometry.dispose();
    (this.proxy.material as THREE.Material).dispose();
  }
}

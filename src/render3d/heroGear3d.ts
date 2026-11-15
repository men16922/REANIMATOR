// Procedural gear for the Operative: four weapon models parented to the rifle pivot on the right hand bone, a
// headlamp lens on the helmet and a diegetic HP pack on the back. Meshes only, no lights (R3.3: the lamp lens is a
// visual follower of w.light, never an input to the simulation). No network assets: all geometry is built here.
//
// Weapon local space (before the pivot's 0.84 scale): grip at the origin, barrel toward -X, top rail toward +Y,
// the same convention as the pulse-rifle GLB so the IK basis in riggedModels.ts aligns every weapon.

import * as THREE from 'three';
import type { RiggedInstance } from './riggedModels.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeStaticChildren } from './meshMerge.ts';
import { hpColorHex, hpPulse, hpSegments, type HeroFrame, type HeroWeapon } from './heroPose.ts';

export interface GlowPart {
  mat: THREE.MeshBasicMaterial;
  base: THREE.Color;
}

export interface WeaponRig {
  slot: HeroWeapon;
  name: 'pulse-rifle' | 'scatter-gun' | 'grenade-drum' | 'rail-cannon' | 'flamer' | 'rocket-launcher';
  root: THREE.Object3D;
  muzzle: THREE.Object3D;
  glow: GlowPart[];
  coils: THREE.Mesh[];
  /** Extra visuals that follow the weapon's visibility (pulse emitter ring) */
  extra?: THREE.Object3D;
}

export const WEAPON_MODEL_NAME: Record<HeroWeapon, WeaponRig['name']> = {
  1: 'pulse-rifle',
  2: 'scatter-gun',
  3: 'grenade-drum',
  4: 'rail-cannon',
  5: 'flamer',
  6: 'rocket-launcher',
};

const GLOW_COLOR: Record<HeroWeapon, number> = { 1: 0x39e6ff, 2: 0xff7a28, 3: 0xb8ff3a, 4: 0x9a5cff, 5: 0xff5a14, 6: 0xffc23a };

const GUN_STEEL = new THREE.MeshStandardMaterial({ color: 0x3a424c, metalness: 0.72, roughness: 0.36 });
const GUN_DARK = new THREE.MeshStandardMaterial({ color: 0x171b21, metalness: 0.55, roughness: 0.5 });
const GUN_WARM = new THREE.MeshStandardMaterial({ color: 0x5a3b26, metalness: 0.3, roughness: 0.62 });

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}

/** Cylinder whose axis runs along X (barrels), spanning [x0, x1]. */
function tube(parent: THREE.Object3D, r: number, x0: number, x1: number, mat: THREE.Material, y = 0, z = 0, r1 = r): THREE.Mesh {
  const len = Math.abs(x1 - x0);
  // CylinderGeometry radiusTop is at +Y; after the +90deg Z turn +Y maps to -X, so radiusTop is the muzzle end
  const m = addMesh(parent, new THREE.CylinderGeometry(r1, r, len, 14), mat, (x0 + x1) / 2, y, z);
  m.rotation.z = Math.PI / 2;
  return m;
}

function glowMat(hex: number, k: number): { mat: THREE.MeshBasicMaterial; part: GlowPart } {
  const base = new THREE.Color(hex);
  const mat = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(k) });
  return { mat, part: { mat, base } };
}

function ring(parent: THREE.Object3D, rad: number, tubeR: number, x: number, y: number, mat: THREE.Material): THREE.Mesh {
  const m = addMesh(parent, new THREE.TorusGeometry(rad, tubeR, 8, 20), mat, x, y, 0);
  m.rotation.y = Math.PI / 2; // torus axis along X
  return m;
}

export function buildScatter(): WeaponRig {
  const root = new THREE.Group();
  const glow: GlowPart[] = [];
  box(root, 0.34, 0.1, 0.085, GUN_STEEL, -0.02, 0.03, 0); // receiver
  box(root, 0.3, 0.11, 0.075, GUN_WARM, 0.27, 0.0, 0).rotation.z = -0.12; // stock
  box(root, 0.07, 0.15, 0.06, GUN_DARK, 0.05, -0.1, 0).rotation.z = 0.25; // grip
  tube(root, 0.052, -0.12, -0.6, GUN_STEEL, 0.035); // fat main barrel
  tube(root, 0.032, -0.12, -0.5, GUN_DARK, -0.035); // magazine tube
  box(root, 0.2, 0.075, 0.105, GUN_DARK, -0.33, -0.065, 0); // pump foregrip
  const flare = tube(root, 0.052, -0.58, -0.665, GUN_DARK, 0.035, 0, 0.098); // wide choke flare
  flare.castShadow = false;
  const g = glowMat(GLOW_COLOR[2], 1.6);
  glow.push(g.part);
  ring(root, 0.097, 0.012, -0.662, 0.035, g.mat);
  for (const s of [-1, 1]) box(root, 0.16, 0.012, 0.01, g.mat, -0.02, 0.045, s * 0.047); // side heat vents
  box(root, 0.3, 0.016, 0.03, GUN_DARK, -0.28, 0.093, 0); // sight rib
  const muzzle = new THREE.Object3D();
  muzzle.position.set(-0.7, 0.035, 0);
  root.add(muzzle);
  mergeStaticChildren(root);
  return { slot: 2, name: 'scatter-gun', root, muzzle, glow, coils: [] };
}

export function buildGrenade(): WeaponRig {
  const root = new THREE.Group();
  const glow: GlowPart[] = [];
  box(root, 0.3, 0.1, 0.09, GUN_STEEL, 0.04, 0.03, 0); // receiver
  box(root, 0.2, 0.09, 0.07, GUN_DARK, 0.28, 0.0, 0); // short stock
  box(root, 0.07, 0.15, 0.06, GUN_DARK, 0.06, -0.1, 0).rotation.z = 0.25; // grip
  tube(root, 0.058, -0.1, -0.58, GUN_STEEL, 0.03, 0, 0.066); // fat launch tube
  // revolving drum with six chambers, axis along Z
  const drum = addMesh(root, new THREE.CylinderGeometry(0.115, 0.115, 0.12, 18), GUN_DARK, -0.12, -0.02, 0);
  drum.rotation.x = Math.PI / 2;
  const g = glowMat(GLOW_COLOR[3], 1.5);
  glow.push(g.part);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    for (const s of [-1, 1]) {
      const c = addMesh(root, new THREE.CylinderGeometry(0.026, 0.026, 0.012, 10), g.mat, -0.12 + Math.cos(a) * 0.072, -0.02 + Math.sin(a) * 0.072, s * 0.061);
      c.rotation.x = Math.PI / 2;
      c.castShadow = false;
    }
  }
  ring(root, 0.07, 0.012, -0.575, 0.03, g.mat);
  box(root, 0.18, 0.02, 0.04, GUN_STEEL, -0.2, 0.115, 0); // carry rail
  const muzzle = new THREE.Object3D();
  muzzle.position.set(-0.64, 0.03, 0);
  root.add(muzzle);
  mergeStaticChildren(root);
  return { slot: 3, name: 'grenade-drum', root, muzzle, glow, coils: [] };
}

export function buildRail(): WeaponRig {
  const root = new THREE.Group();
  const glow: GlowPart[] = [];
  box(root, 0.36, 0.12, 0.1, GUN_STEEL, 0.02, 0.03, 0); // capacitor block
  box(root, 0.24, 0.1, 0.075, GUN_DARK, 0.3, 0.0, 0); // stock
  box(root, 0.07, 0.15, 0.06, GUN_DARK, 0.06, -0.1, 0).rotation.z = 0.25; // grip
  // twin rails with the plasma core running between them
  for (const s of [-1, 1]) box(root, 0.95, 0.04, 0.026, GUN_STEEL, -0.5, 0.05, s * 0.036);
  const g = glowMat(GLOW_COLOR[4], 1.0);
  glow.push(g.part);
  const core = tube(root, 0.014, 0.0, -0.96, g.mat, 0.05);
  core.castShadow = false;
  const coils: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const c = ring(root, 0.078, 0.016, -0.17 - i * 0.16, 0.05, g.mat);
    c.castShadow = false;
    coils.push(c);
  }
  box(root, 0.07, 0.08, 0.1, GUN_DARK, -0.98, 0.05, 0); // muzzle fork
  box(root, 0.14, 0.02, 0.04, GUN_DARK, -0.1, 0.105, 0); // scope bar
  const muzzle = new THREE.Object3D();
  muzzle.position.set(-1.02, 0.05, 0);
  root.add(muzzle);
  mergeStaticChildren(root, new Set(coils));
  return { slot: 4, name: 'rail-cannon', root, muzzle, glow, coils };
}

/** Flamer: a fuel tank slung under a short heat-shielded nozzle with a glowing pilot light. */
export function buildFlamer(): WeaponRig {
  const root = new THREE.Group();
  const glow: GlowPart[] = [];
  box(root, 0.3, 0.1, 0.085, GUN_STEEL, 0.02, 0.03, 0); // receiver
  box(root, 0.2, 0.09, 0.07, GUN_WARM, 0.28, 0.0, 0).rotation.z = -0.1; // stock
  box(root, 0.07, 0.15, 0.06, GUN_DARK, 0.06, -0.1, 0).rotation.z = 0.25; // grip
  tube(root, 0.04, -0.1, -0.5, GUN_STEEL, 0.04); // nozzle barrel
  tube(root, 0.062, -0.38, -0.56, GUN_DARK, 0.04, 0, 0.074); // heat shroud around the tip
  // pressurised fuel tank riding above the receiver, axis along X
  tube(root, 0.075, -0.02, -0.32, GUN_DARK, 0.145);
  box(root, 0.03, 0.05, 0.09, GUN_STEEL, -0.1, 0.1, 0); // tank strap
  const g = glowMat(GLOW_COLOR[5], 1.7);
  glow.push(g.part);
  ring(root, 0.058, 0.011, -0.545, 0.04, g.mat); // nozzle heat ring
  const pilot = addMesh(root, new THREE.SphereGeometry(0.02, 8, 6), g.mat, -0.595, 0.04, 0); // pilot flame
  pilot.castShadow = false;
  for (const s of [-1, 1]) box(root, 0.12, 0.012, 0.01, g.mat, -0.02, 0.05, s * 0.044); // side vents
  const muzzle = new THREE.Object3D();
  muzzle.position.set(-0.62, 0.04, 0);
  root.add(muzzle);
  mergeStaticChildren(root);
  return { slot: 5, name: 'flamer', root, muzzle, glow, coils: [] };
}

/** Rocket launcher: a fat shoulder tube with a flared rear exhaust and a warhead tip showing at the muzzle. */
export function buildRocket(): WeaponRig {
  const root = new THREE.Group();
  const glow: GlowPart[] = [];
  tube(root, 0.085, 0.3, -0.62, GUN_STEEL, 0.06, 0, 0.09); // main launch tube
  tube(root, 0.1, 0.3, 0.4, GUN_DARK, 0.06, 0, 0.12); // rear exhaust flare
  tube(root, 0.1, -0.58, -0.66, GUN_DARK, 0.06, 0, 0.1); // muzzle collar
  box(root, 0.07, 0.15, 0.06, GUN_DARK, 0.08, -0.07, 0).rotation.z = 0.25; // grip
  box(root, 0.06, 0.12, 0.05, GUN_DARK, -0.28, -0.08, 0); // foregrip
  box(root, 0.22, 0.03, 0.04, GUN_STEEL, -0.1, 0.17, 0); // sight rail
  box(root, 0.04, 0.06, 0.03, GUN_DARK, -0.22, 0.2, 0); // front post
  const g = glowMat(GLOW_COLOR[6], 1.6);
  glow.push(g.part);
  const tip = tube(root, 0.04, -0.6, -0.72, g.mat, 0.06, 0, 0.012); // warhead tip pointing out of the tube
  tip.castShadow = false;
  ring(root, 0.092, 0.012, -0.5, 0.06, g.mat); // armed band
  const muzzle = new THREE.Object3D();
  muzzle.position.set(-0.74, 0.06, 0);
  root.add(muzzle);
  mergeStaticChildren(root);
  return { slot: 6, name: 'rocket-launcher', root, muzzle, glow, coils: [] };
}

function buildPulseWrapper(inst: RiggedInstance): WeaponRig | null {
  const pivot = inst.riflePivot;
  if (!pivot || !inst.muzzleLocal) return null;
  const root = pivot.children.find((c) => c !== inst.muzzleLocal) ?? new THREE.Group();
  const g = glowMat(GLOW_COLOR[1], 1.6);
  const holder = new THREE.Group();
  ring(holder, 0.034, 0.008, -0.665, 0.055, g.mat); // cyan emitter ring at the muzzle
  pivot.add(holder);
  return { slot: 1, name: 'pulse-rifle', root, muzzle: inst.muzzleLocal, glow: [g.part], coils: [], extra: holder };
}

export interface HeroGearTelemetry {
  weaponModel: WeaponRig['name'];
  lensOn: number;
  packColor: number;
  packSegments: number;
  railGlow: number;
}

const _tmpC = new THREE.Color();

function fillColor(arr: Float32Array, startVertex: number, count: number, c: THREE.Color): void {
  for (let v = startVertex; v < startVertex + count; v++) {
    arr[v * 3] = c.r;
    arr[v * 3 + 1] = c.g;
    arr[v * 3 + 2] = c.b;
  }
}

export class HeroGear {
  readonly weapons: Partial<Record<HeroWeapon, WeaponRig>> = {};
  private shown: HeroWeapon = 1;
  private readonly lensMat: THREE.MeshBasicMaterial;
  /** Pack colors live in one vertex-colored mesh: 4 segments (2 faces each) then the beacon. */
  private packCol: THREE.BufferAttribute | null = null;
  private lastLens = 0;
  private lastPackColor = 0x3dff7a;
  private lastSegments = 4;
  private lastRailGlow = 0;
  readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor(inst: RiggedInstance) {
    const pivot = inst.riflePivot;
    const pulse = buildPulseWrapper(inst);
    if (pulse) this.weapons[1] = pulse;
    for (const w of [buildScatter(), buildGrenade(), buildRail(), buildFlamer(), buildRocket()]) {
      this.weapons[w.slot] = w;
      pivot?.add(w.root);
      w.root.visible = false;
    }
    this.lensMat = new THREE.MeshBasicMaterial({ color: 0x0a0c0e });
    this.attachLens(inst);
    this.attachPack(inst);
    this.setShown(1);
    for (const w of Object.values(this.weapons)) {
      w?.root.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && !this.materials.includes(o.material)) this.materials.push(o.material);
      });
    }
  }

  /** Mounts a world-axis-aligned object on a bone at the bone's rest pose so it follows the bone afterwards. */
  private mount(bone: THREE.Object3D, obj: THREE.Object3D, offset: THREE.Vector3): void {
    bone.updateWorldMatrix(true, false);
    const wp = new THREE.Vector3();
    bone.getWorldPosition(wp).add(offset);
    const ws = bone.getWorldScale(new THREE.Vector3()).x || 1;
    const wq = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    obj.position.copy(bone.worldToLocal(wp));
    obj.quaternion.copy(wq);
    obj.scale.setScalar(1 / ws);
    bone.add(obj);
  }

  private attachLens(inst: RiggedInstance): void {
    if (!inst.head) return;
    const g = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), GUN_DARK);
    housing.castShadow = true;
    g.add(housing);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), this.lensMat);
    lens.position.set(0, 0, 0.0165);
    g.add(lens);
    for (const s of [-1, 1]) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.004), this.lensMat);
      led.position.set(s * 0.036, 0, 0.0165);
      g.add(led);
    }
    mergeStaticChildren(g);
    this.mount(inst.head, g, new THREE.Vector3(0, 0.09, 0.182));
  }

  private attachPack(inst: RiggedInstance): void {
    const bone = inst.spine2 ?? inst.spine1;
    if (!bone) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.1), GUN_DARK);
    body.castShadow = true;
    g.add(body);
    // Four HP segments on both side faces (the camera sees one or the other depending on facing) and the top beacon:
    // one vertex-colored mesh instead of nine, recolored per frame in update().
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const seg = new THREE.BoxGeometry(0.012, 0.05, 0.05);
        seg.translate(s * 0.127, 0.105 - i * 0.07, 0);
        parts.push(seg);
      }
    }
    const beaconGeo = new THREE.BoxGeometry(0.1, 0.02, 0.05);
    beaconGeo.translate(0, 0.16, 0);
    parts.push(beaconGeo);
    const vertsPer = parts[0].attributes.position.count;
    const lit = new Float32Array((parts.length - 1) * vertsPer * 3 + beaconGeo.attributes.position.count * 3).fill(1);
    for (const p of parts) p.deleteAttribute('uv');
    const geo = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    if (geo) {
      this.packCol = new THREE.BufferAttribute(lit, 3);
      this.packCol.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('color', this.packCol);
      g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
    }
    this.mount(bone, g, new THREE.Vector3(0, -0.02, -0.265));
  }

  private setShown(slot: HeroWeapon): void {
    this.shown = slot;
    for (const key of [1, 2, 3, 4, 5, 6] as const) {
      const w = this.weapons[key];
      if (w) w.root.visible = key === slot;
    }
    const extra = this.weapons[1]?.extra;
    if (extra) extra.visible = slot === 1;
  }

  activeMuzzle(): THREE.Object3D | undefined {
    return (this.weapons[this.shown] ?? this.weapons[1])?.muzzle;
  }

  get shownSlot(): HeroWeapon {
    return this.shown;
  }

  /** Per-frame visual update. `lampK` is the renderer's smoothed 0..1 headlamp state (render only). */
  update(tSec: number, f: HeroFrame, lampK: number): void {
    if (f.shown !== this.shown) this.setShown(f.shown);

    // Weapon glow: idle hum, brighter on a shot, rail ramps with charge
    const cur = this.weapons[this.shown];
    if (cur) {
      const hum = 0.55 + 0.1 * Math.sin(tSec * 3);
      const k = hum + f.recoil * 1.6 + (this.shown === 4 ? f.railFrac * 2.6 : 0);
      for (const gp of cur.glow) {
        _tmpC.copy(gp.base);
        if (this.shown === 4) _tmpC.lerp(new THREE.Color(1, 0.92, 1), f.railFrac * 0.65);
        gp.mat.color.copy(_tmpC).multiplyScalar(Math.max(0.15, k) * 1.4);
      }
      if (this.shown === 4) {
        this.lastRailGlow = f.railFrac;
        const flutter = f.railFrac > 0 ? 1 + 0.16 * f.railFrac * Math.sin(tSec * 60) : 1;
        cur.coils.forEach((c, i) => {
          const wave = f.railFrac > 0 ? 1 + 0.1 * f.railFrac * Math.sin(tSec * 24 - i * 1.3) : 1;
          c.scale.setScalar(flutter * wave);
        });
      }
    }
    if (this.shown !== 4) this.lastRailGlow = 0;

    // Headlamp lens: follows w.light through the renderer's smoothed lampK (visual only)
    const lens = f.alive ? lampK : 0;
    this.lastLens = lens;
    this.lensMat.color.setRGB(0.85, 0.97, 1).multiplyScalar(0.05 + lens * 3.2);

    // Diegetic HP pack
    const hex = hpColorHex(f.hpFrac);
    const lit = hpSegments(f.hpFrac, f.alive);
    const pulse = hpPulse(f.hpFrac, tSec, f.alive);
    this.lastPackColor = hex;
    this.lastSegments = lit;
    const col = this.packCol;
    if (col) {
      const arr = col.array as Float32Array;
      const segVerts = 24; // BoxGeometry vertex count
      for (let i = 0; i < 4; i++) {
        // segments drain from the bottom up: index 0 is the top segment and stays lit longest
        _tmpC.setHex(hex).multiplyScalar(i < lit ? 2.2 * pulse : 0.06);
        for (let face = 0; face < 2; face++) fillColor(arr, (i * 2 + face) * segVerts, segVerts, _tmpC);
      }
      _tmpC.setHex(hex).multiplyScalar(f.alive ? 2.6 * pulse : 0.03);
      fillColor(arr, 8 * segVerts, segVerts, _tmpC);
      col.needsUpdate = true;
    }
  }

  telemetry(): HeroGearTelemetry {
    return {
      weaponModel: WEAPON_MODEL_NAME[this.shown],
      lensOn: Math.round(this.lastLens * 100) / 100,
      packColor: this.lastPackColor,
      packSegments: this.lastSegments,
      railGlow: Math.round(this.lastRailGlow * 100) / 100,
    };
  }
}

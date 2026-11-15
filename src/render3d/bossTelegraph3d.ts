// Core Warden attack telegraphs and boss glow. Display-only: reads the world, never writes to it.
// All materials are unlit MeshBasicMaterial / Sprite (no lights). Everything is pooled and built once.

import * as THREE from 'three';
import type { EnemyState3D, WorldState3D } from '../game3d/world3d.ts';
import { BOSS_PHASE_COLORS } from './fx3d.ts';

/** Floor extent the Warden may charge across (mirrors floorX0/floorX1 in world3d.ts). */
export const BOSS_FLOOR_X0 = 72.4;
export const BOSS_FLOOR_X1 = 95.9;
/** Max rays shown for a volley/barrage preview (barrage fires 12). */
export const RAY_CAPACITY = 12;

export interface Ray {
  x: number;
  y: number;
  ang: number;
  len: number;
  width: number;
  a: number;
}

/** 0..1 progress of a windup, given the largest windupTicks value seen for it. */
export function windProgress(windupTicks: number, start: number): number {
  if (start <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - windupTicks / start));
}

/**
 * Predicted plasma lanes for the current volley/barrage windup. Pure so it can be unit tested.
 * Volley: 2n+1 rays (n = 2 in phase I, else 3) fanned 0.16 rad around the aim at the player.
 * Barrage: 12 rays, burst offset alternates 0 / PI/12 (burst = 3 - barrageLeft).
 */
export function predictRays(e: Pick<EnemyState3D, 'x' | 'y' | 'phase' | 'bossPattern' | 'barrageLeft'>, aimX: number, aimY: number, prog: number): Ray[] {
  const out: Ray[] = [];
  const ey = e.y + 1.5;
  const a = 0.12 + 0.55 * prog;
  if (e.bossPattern === 'volley') {
    const n = e.phase === 1 ? 2 : 3;
    const base = Math.atan2(aimY + 0.9 - ey, aimX - e.x);
    for (let i = -n; i <= n; i++) out.push({ x: e.x, y: ey, ang: base + i * 0.16, len: 6 + 10 * prog, width: 0.05 + 0.05 * prog, a });
  } else if (e.bossPattern === 'barrage') {
    const burst = e.barrageLeft > 0 ? 3 - e.barrageLeft : 0;
    const off = burst % 2 === 0 ? 0 : Math.PI / 12;
    for (let i = 0; i < 12; i++) out.push({ x: e.x, y: ey, ang: off + (i * Math.PI) / 6, len: 4 + 6 * prog, width: 0.05 + 0.04 * prog, a });
  }
  return out;
}

/** Write rays as 4-vertex quads (rgba vertex colours fade to the tail). Returns the number of quads. */
export function fillRayQuads(pos: Float32Array, col: Float32Array, rays: readonly Ray[], r: number, g: number, b: number): number {
  const n = Math.min(RAY_CAPACITY, rays.length);
  for (let i = 0; i < n; i++) {
    const q = rays[i];
    const c = Math.cos(q.ang);
    const s = Math.sin(q.ang);
    const hx = -s * q.width;
    const hy = c * q.width;
    const ex = q.x + c * q.len;
    const ey = q.y + s * q.len;
    const o = i * 12;
    pos.set([q.x - hx, q.y - hy, 0.35, q.x + hx, q.y + hy, 0.35, ex + hx, ey + hy, 0.35, ex - hx, ey - hy, 0.35], o);
    const k = i * 16;
    col.set([r, g, b, q.a, r, g, b, q.a, r, g, b, 0, r, g, b, 0], k);
  }
  return n;
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 10;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const ox of [18, 74]) {
    g.beginPath();
    g.moveTo(ox, 8);
    g.lineTo(ox + 32, 32);
    g.lineTo(ox, 56);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function exposedTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 54px "Arial Black", Impact, sans-serif';
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = '#2a1500';
  g.strokeText('EXPOSED', 128, 34);
  g.fillStyle = '#ffd24a';
  g.fillText('EXPOSED', 128, 34);
  g.fillStyle = '#ffd24a';
  g.beginPath();
  g.moveTo(104, 66);
  g.lineTo(152, 66);
  g.lineTo(128, 92);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Only set `map` when there is one: an explicit `map: undefined` makes three.js warn once per material.
export const additive = (color: number, map?: THREE.Texture): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    ...(map ? { map } : {}),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

export class BossTelegraph3D {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly laneBars: THREE.Mesh[] = [];
  private readonly chargeLane: THREE.Mesh;
  private readonly chargeTex: THREE.CanvasTexture;
  private readonly chargeFloor: THREE.Mesh;
  private readonly rays: THREE.Mesh;
  private readonly rayPos = new Float32Array(RAY_CAPACITY * 12);
  private readonly rayCol = new Float32Array(RAY_CAPACITY * 16);
  private readonly rayGeo = new THREE.BufferGeometry();
  private readonly muzzle: THREE.Sprite;
  private readonly portals: { ring: THREE.Mesh; inner: THREE.Mesh }[] = [];
  private readonly exposed: THREE.Sprite;
  private readonly coreGlow: THREE.Sprite;
  private windStart = 0;
  private lastPattern = '';
  private readonly tmp = new THREE.Color();

  constructor() {
    this.group.name = 'boss-telegraph';
    const radial = radialTexture();

    this.dome = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56, 1, 0, Math.PI), additive(0xff3b2f));
    this.dome.renderOrder = 6;
    this.group.add(this.dome);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.16), additive(0xff3b2f));
      m.geometry.translate(0.5, 0, 0);
      m.renderOrder = 6;
      this.group.add(m);
      this.laneBars.push(m);
    }

    this.chargeTex = chevronTexture();
    this.chargeLane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.9), additive(0xff6a2a, this.chargeTex));
    this.chargeLane.geometry.translate(0.5, 0, 0);
    this.chargeLane.renderOrder = 6;
    this.group.add(this.chargeLane);
    this.chargeFloor = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), additive(0xffb040));
    this.chargeFloor.geometry.translate(0.5, 0, 0);
    this.chargeFloor.renderOrder = 6;
    this.group.add(this.chargeFloor);

    this.rayGeo.setAttribute('position', new THREE.BufferAttribute(this.rayPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rayGeo.setAttribute('color', new THREE.BufferAttribute(this.rayCol, 4).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < RAY_CAPACITY; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    this.rayGeo.setIndex(idx);
    this.rays = new THREE.Mesh(
      this.rayGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    this.rays.frustumCulled = false;
    this.rays.renderOrder = 6;
    this.group.add(this.rays);

    const sprMat = (map: THREE.Texture, color: number): THREE.SpriteMaterial =>
      new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.muzzle = new THREE.Sprite(sprMat(radial, 0xff4020));
    this.muzzle.renderOrder = 7;
    this.group.add(this.muzzle);
    this.coreGlow = new THREE.Sprite(sprMat(radial, 0x33ffe0));
    this.coreGlow.renderOrder = 7;
    this.group.add(this.coreGlow);

    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), additive(0xa060ff));
      const inner = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 6), additive(0xd0a0ff));
      ring.renderOrder = inner.renderOrder = 6;
      this.group.add(ring, inner);
      this.portals.push({ ring, inner });
    }

    const ex = new THREE.SpriteMaterial({ map: exposedTexture(), transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    this.exposed = new THREE.Sprite(ex);
    this.exposed.renderOrder = 29;
    this.group.add(this.exposed);
    for (const c of this.group.children) c.visible = false;
  }

  private hideAll(): void {
    for (const c of this.group.children) c.visible = false;
  }

  /**
   * @param wd boss state; (bx,by) interpolated foot position
   * @param aim player's interpolated feet position (target of the volley lines)
   * @param intro 0..1 awakening amount (core glow ramps up during the intro)
   */
  update(w: WorldState3D, wd: EnemyState3D | null, bx: number, by: number, aimX: number, aimY: number, tSec: number, reduce: boolean, intro: number, introActive: boolean): void {
    this.hideAll();
    if (!wd || (!wd.alive && !introActive)) return;
    const c = BOSS_PHASE_COLORS[Math.min(3, Math.max(1, wd.phase)) - 1];
    this.tmp.setRGB(c[0], c[1], c[2]);
    const pulse = reduce ? 0.7 : 0.6 + 0.4 * Math.sin(tSec * 6);
    const dormant = !wd.active;

    // Core glow: breathes in phase colour, flares while exposed, ramps in during the intro.
    const exposed = wd.exposedTicks > 0;
    this.coreGlow.visible = wd.alive;
    this.coreGlow.position.set(bx, by + wd.height * 0.6, 0.9);
    const base = dormant ? 0.4 + 1.2 * intro : 1.35;
    const sc = exposed ? 3.6 + (reduce ? 0 : Math.sin(tSec * 14) * 0.5) : base + (reduce ? 0 : Math.sin(tSec * 3) * 0.15);
    this.coreGlow.scale.set(sc, sc, 1);
    const cgm = this.coreGlow.material as THREE.SpriteMaterial;
    this.tmp.setRGB(c[0], c[1], c[2]);
    cgm.color.copy(exposed ? this.tmp.set(1.0, 0.82, 0.3) : this.tmp);
    cgm.opacity = exposed ? 0.7 : dormant ? 0.1 + 0.3 * intro : 0.22 + 0.08 * pulse;

    if (exposed && wd.counterExposed) {
      // Counter hit: the core flares gold-white and the weak point is marked (the 3x damage window)
      cgm.color.set(1.0, 0.95, 0.6);
      cgm.opacity = 0.9;
      this.coreGlow.scale.setScalar(sc * 1.35);
    }
    if (exposed) {
      const f = Math.min(1, wd.exposedTicks / 24);
      this.exposed.visible = true;
      this.exposed.position.set(bx, by + wd.height + 0.9 + (reduce ? 0 : Math.sin(tSec * 5) * 0.12), 1.2);
      this.exposed.scale.set(2.8, 1.05, 1);
      (this.exposed.material as THREE.SpriteMaterial).opacity = f;
    }

    // windup bookkeeping: largest windupTicks seen for this pattern is the total
    const pat = wd.bossPattern;
    if (wd.windupTicks > 0 && (pat !== this.lastPattern || wd.windupTicks > this.windStart)) this.windStart = Math.max(this.windStart, wd.windupTicks);
    if (wd.windupTicks === 0 && wd.barrageLeft === 0) this.windStart = 0;
    this.lastPattern = pat;
    if (!wd.alive || dormant) return;
    if (wd.parryOpen) {
      // Counter window: the muzzle core blinks gold so the press timing reads at a glance
      this.muzzle.visible = true;
      this.muzzle.position.set(bx, by + wd.height * 0.6, 0.95);
      const gs = reduce ? 3.4 : 3.0 + Math.sin(tSec * 60) * 0.7;
      this.muzzle.scale.set(gs, gs, 1);
      const gm = this.muzzle.material as THREE.SpriteMaterial;
      gm.color.setRGB(1, 0.85, 0.3);
      gm.opacity = 0.95;
    }
    const prog = wd.windupTicks > 0 ? windProgress(wd.windupTicks, this.windStart) : wd.barrageLeft > 0 ? 1 : 0;
    const flick = reduce ? 1 : 0.75 + 0.25 * Math.sin(tSec * 30);

    if (pat === 'slam' && wd.windupTicks > 0) {
      const reach = wd.phase >= 2 ? 15.5 : 13;
      this.dome.visible = true;
      this.dome.position.set(bx, by + 0.05, 0.3);
      this.dome.scale.setScalar(0.6 + prog * 3.4);
      (this.dome.material as THREE.MeshBasicMaterial).opacity = (0.3 + 0.6 * prog) * flick;
      for (let i = 0; i < 2; i++) {
        const bar = this.laneBars[i];
        bar.visible = true;
        bar.position.set(bx, by + 0.1, 0.3);
        bar.scale.set(reach * (i === 0 ? 1 : -1) * prog, 1, 1);
        (bar.material as THREE.MeshBasicMaterial).opacity = (0.15 + 0.6 * prog) * flick;
      }
    } else if (pat === 'charge' && (wd.windupTicks > 0 || wd.lungeTicks > 0)) {
      const dir = wd.chargeDir || 1;
      const edge = dir > 0 ? BOSS_FLOOR_X1 : BOSS_FLOOR_X0;
      const len = Math.max(1, Math.abs(edge - bx));
      const live = wd.lungeTicks > 0;
      const op = live ? 0.9 : 0.2 + 0.6 * prog;
      this.chargeLane.visible = true;
      this.chargeLane.position.set(bx, by + 0.95, 0.2);
      this.chargeLane.scale.set(len * dir, 1, 1);
      this.chargeTex.repeat.set(Math.max(1, len / 2.2), 1);
      this.chargeTex.offset.x = (dir > 0 ? -1 : 1) * ((tSec * (live ? 4 : 1.6)) % 1);
      (this.chargeLane.material as THREE.MeshBasicMaterial).opacity = op * 0.8 * flick;
      this.chargeFloor.visible = true;
      this.chargeFloor.position.set(bx, by + 0.08, 0.25);
      this.chargeFloor.scale.set(len * dir, 1, 1);
      (this.chargeFloor.material as THREE.MeshBasicMaterial).opacity = op * flick;
    } else if ((pat === 'volley' && wd.windupTicks > 0) || pat === 'barrage') {
      const rays = predictRays(wd, aimX, aimY, prog);
      const n = fillRayQuads(this.rayPos, this.rayCol, rays, 1.0, 0.3 + 0.3 * prog, 0.15);
      this.rayGeo.setDrawRange(0, n * 6);
      (this.rayGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.rayGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
      this.rays.visible = n > 0;
      this.muzzle.visible = true;
      this.muzzle.position.set(bx, by + 1.5, 0.7);
      const ms = 0.5 + prog * 2.4;
      this.muzzle.scale.set(ms, ms, 1);
      const mm = this.muzzle.material as THREE.SpriteMaterial;
      mm.color.setRGB(1, 0.3 + 0.5 * prog, 0.15 + 0.4 * prog);
      mm.opacity = 0.3 + 0.65 * prog;
    } else if (pat === 'summon' && wd.windupTicks > 0) {
      let k = 0;
      for (const m of w.enemies) {
        if (!m.minion || m.alive || k >= 2) continue;
        const sx = Math.max(73, Math.min(95.5, wd.x + (k === 0 ? -4.2 : 4.2)));
        const pt = this.portals[k];
        pt.ring.visible = pt.inner.visible = true;
        pt.ring.position.set(sx, by + 1.2, 0.4);
        pt.inner.position.copy(pt.ring.position);
        pt.ring.scale.setScalar(0.3 + prog * 1.25);
        pt.inner.scale.setScalar(0.4 + prog * 1.6);
        pt.inner.rotation.z = tSec * (2 + 4 * prog);
        (pt.ring.material as THREE.MeshBasicMaterial).opacity = (0.35 + 0.6 * prog) * flick;
        (pt.inner.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.6 * prog;
        k++;
      }
    }
  }
}

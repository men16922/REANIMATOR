// World-space number popups (damage, combo "x3"). Pure pool (node-testable) plus one instanced glyph layer:
// a single canvas atlas, one InstancedMesh, one draw call, no lights. Display-side only.

import * as THREE from 'three';
import { stackedPopupY } from './vfxStyle3d.ts';

export const POPUP_GLYPHS = '0123456789x';
export const POPUP_CAPACITY = 40;
export const POPUP_MAX_CHARS = 5;
export const GLYPH_CAPACITY = POPUP_CAPACITY * POPUP_MAX_CHARS;

export interface PopupOpts {
  size: number;
  life: number;
  r: number;
  g: number;
  b: number;
  /** initial upward speed (world units / s) */
  rise?: number;
  /** pop-in scale overshoot */
  punch?: number;
  /** Push above any live popup this one would overlap. */
  stack?: boolean;
  /** Merge into a live, recent popup of the same kind near x: "14", then "14x2", "14x3" (or the summed value when it will not fit). */
  merge?: number;
}

/** World-y at which the z = 0 lane reaches NDC y = ceil, given projected NDC y at world y = 0 (a) and y = 10 (b). Infinity when the projection is degenerate. */
export function popupCeilWorldY(a: number, b: number, ceilNdc: number): number {
  return b > a ? ((ceilNdc - a) / (b - a)) * 10 : Infinity;
}

/** Text for a merged damage popup. Glyph atlas has digits and 'x' only; POPUP_MAX_CHARS bounds the length. */
export function mergedPopupText(value: number, hits: number): string {
  const t = `${value}x${hits}`;
  return t.length <= POPUP_MAX_CHARS ? t : String(value * hits);
}

/** Fixed-capacity pool. Oldest popup is recycled when full. No allocation after construction. */
export class PopupPool {
  count = 0;
  /** Total spawned since creation (telemetry). */
  spawned = 0;
  private cursor = 0;
  readonly text: string[] = new Array(POPUP_CAPACITY).fill('');
  readonly x = new Float32Array(POPUP_CAPACITY);
  readonly y = new Float32Array(POPUP_CAPACITY);
  readonly vy = new Float32Array(POPUP_CAPACITY);
  readonly age = new Float32Array(POPUP_CAPACITY);
  readonly life = new Float32Array(POPUP_CAPACITY);
  readonly size = new Float32Array(POPUP_CAPACITY);
  readonly punch = new Float32Array(POPUP_CAPACITY);
  /** Merge key (damage value, 0 = not mergeable) and hit count per slot. */
  readonly mergeVal = new Float32Array(POPUP_CAPACITY);
  readonly hits = new Float32Array(POPUP_CAPACITY);
  readonly col = new Float32Array(POPUP_CAPACITY * 3);
  // GPU-facing instance data
  readonly aPos = new Float32Array(GLYPH_CAPACITY * 4);
  readonly aUv = new Float32Array(GLYPH_CAPACITY * 4);
  readonly aCol = new Float32Array(GLYPH_CAPACITY * 4);

  spawn(text: string, x: number, y: number, o: PopupOpts): void {
    if (o.merge) {
      for (let k = 0; k < this.count; k++) {
        if (this.mergeVal[k] === o.merge && this.age[k] < 0.4 && Math.abs(this.x[k] - x) < 0.9 && Math.abs(this.size[k] - o.size) < 1e-6) {
          this.hits[k]++;
          this.text[k] = mergedPopupText(o.merge, this.hits[k]);
          this.age[k] = Math.min(this.age[k], 0.12);
          this.spawned++;
          return;
        }
      }
    }
    if (o.stack) y = stackedPopupY(x, y, o.size, this.count, this.x, this.y, this.size, this.age);
    let i: number;
    if (this.count < POPUP_CAPACITY) {
      i = this.count++;
    } else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % POPUP_CAPACITY;
    }
    this.text[i] = text.slice(0, POPUP_MAX_CHARS);
    this.x[i] = x;
    this.y[i] = y;
    this.vy[i] = o.rise ?? 2.2;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.size[i] = o.size;
    this.punch[i] = o.punch ?? 0.5;
    this.mergeVal[i] = o.merge ?? 0;
    this.hits[i] = 1;
    this.col[i * 3] = o.r;
    this.col[i * 3 + 1] = o.g;
    this.col[i * 3 + 2] = o.b;
    this.spawned++;
  }

  update(dt: number): void {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.removeAt(i);
        continue;
      }
      this.y[i] += this.vy[i] * dt;
      this.vy[i] *= Math.max(0, 1 - 2.6 * dt);
    }
  }

  private removeAt(i: number): void {
    const l = --this.count;
    if (i === l) return;
    this.text[i] = this.text[l];
    for (const a of [this.x, this.y, this.vy, this.age, this.life, this.size, this.punch, this.mergeVal, this.hits]) a[i] = a[l];
    for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.col[l * 3 + k];
  }

  /** Scale envelope: pop-in overshoot, settle, shrink on the way out. */
  static scaleAt(t: number, punch: number): number {
    if (t < 0.12) return 0.4 + (1 + punch - 0.4) * (t / 0.12);
    if (t < 0.28) return 1 + punch * (1 - (t - 0.12) / 0.16);
    return t > 0.75 ? 1 - (t - 0.75) * 1.2 : 1;
  }

  /** Pack glyph quads. Returns the instance count. */
  write(z: number, maxY = Infinity): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const t = this.age[i] / this.life[i];
      const s = this.size[i] * PopupPool.scaleAt(t, this.punch[i]);
      const txt = this.text[i];
      const adv = s * 0.62;
      const x0 = this.x[i] - (adv * (txt.length - 1)) / 2;
      const alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      for (let c = 0; c < txt.length; c++) {
        const gi = POPUP_GLYPHS.indexOf(txt[c]);
        if (gi < 0) continue;
        const o = n * 4;
        this.aPos[o] = x0 + c * adv;
        this.aPos[o + 1] = Math.min(this.y[i], maxY - s * 0.7);
        this.aPos[o + 2] = z;
        this.aPos[o + 3] = s;
        // atlas: 4 columns x 3 rows
        this.aUv[o] = (gi % 4) / 4;
        this.aUv[o + 1] = 1 - (Math.floor(gi / 4) + 1) / 3;
        this.aUv[o + 2] = 1 / 4;
        this.aUv[o + 3] = 1 / 3;
        this.aCol[o] = this.col[i * 3];
        this.aCol[o + 1] = this.col[i * 3 + 1];
        this.aCol[o + 2] = this.col[i * 3 + 2];
        this.aCol[o + 3] = alpha;
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }
}

const VERT = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aUv;
attribute vec4 aCol;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vUv = aUv.xy + uv * aUv.zw;
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  mv.xy += position.xy * aPos.w;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
}
`;

function makeAtlas(): THREE.CanvasTexture {
  const cw = 64;
  const ch = 96;
  const c = document.createElement('canvas');
  c.width = cw * 4;
  c.height = ch * 3;
  const g = c.getContext('2d')!;
  g.font = 'bold 72px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (let i = 0; i < POPUP_GLYPHS.length; i++) {
    const cx = (i % 4) * cw + cw / 2;
    const cy = Math.floor(i / 4) * ch + ch / 2;
    g.lineWidth = 10;
    g.strokeStyle = '#000';
    g.strokeText(POPUP_GLYPHS[i], cx, cy);
    g.fillStyle = '#fff';
    g.fillText(POPUP_GLYPHS[i], cx, cy);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One instanced draw for every popup glyph. */
export class PopupLayer {
  readonly mesh: THREE.Mesh;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aUv: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;

  private readonly pool: PopupPool;

  constructor(pool: PopupPool) {
    this.pool = pool;
    const base = new THREE.PlaneGeometry(1, 1.4);
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(pool.aPos, 4);
    this.aUv = new THREE.InstancedBufferAttribute(pool.aUv, 4);
    this.aCol = new THREE.InstancedBufferAttribute(pool.aCol, 4);
    for (const a of [this.aPos, this.aUv, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aUv', this.aUv);
    this.geo.setAttribute('aCol', this.aCol);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uAtlas: { value: makeAtlas() } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    this.mesh.name = 'fx-popups';
    this.mesh.visible = false;
  }

  /** World-y ceiling for popup baselines (set by the scene from the screen-space limit under the boss bar). */
  maxY = Infinity;

  sync(): void {
    const n = this.pool.write(1.2, this.maxY);
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.aPos.needsUpdate = true;
    this.aUv.needsUpdate = true;
    this.aCol.needsUpdate = true;
  }
}

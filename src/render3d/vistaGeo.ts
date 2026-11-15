// Tiny non-indexed geometry builder for the sector vistas. Pure data (typed arrays), no DOM, no WebGL.
// Every vertex carries: position, normal, linear RGB, an animation descriptor (mode, phase, speed, amplitude) and a pivot.
// The animation itself runs in the vista vertex shader (vista3d.ts), so a whole sector vista is two merged meshes.
import * as THREE from 'three';

export type V3 = [number, number, number];

/** Vertex-shader animation modes. Keep in sync with VERT in vista3d.ts. */
export const ANIM = {
  STATIC: 0,
  /** Slow brightness breathing. */
  PULSE: 1,
  /** Stuttering light (flat steady glow when Reduce flashing is on). */
  FLICKER: 2,
  /** Wraps vertically inside [piv.z, piv.z + am]; sp > 0 falls, sp < 0 rises. ph >= 0.5 disables the end fade. */
  WRAP: 3,
  /** Rotates in the XY plane around the pivot. */
  SPIN: 4,
  /** Swings in the XY plane around the pivot (searchlights). */
  SWEEP: 5,
  /** Scales around the pivot (breathing). */
  BREATHE: 6,
  /** Brightness wave travelling along x. */
  CHASE_X: 7,
  /** Horizontal sway that grows with height (tentacles). */
  SWAY: 8,
  /** Rotates around the vertical axis through the pivot. */
  SPIN_Y: 9,
  /** Brightness wave travelling along y (hologram scanlines). */
  CHASE_Y: 10,
} as const;

export interface Anim {
  m: number;
  ph?: number;
  sp?: number;
  am?: number;
  piv?: V3;
}

export interface GeoData {
  pos: Float32Array;
  nor: Float32Array;
  col: Float32Array;
  anim: Float32Array;
  piv: Float32Array;
  count: number;
}

const _c = new THREE.Color();
/** Linear RGB from an sRGB hex, scaled by k. */
export function rgb(hex: number, k = 1): V3 {
  _c.setHex(hex);
  return [_c.r * k, _c.g * k, _c.b * k];
}

const BOX_FACES: readonly (readonly [number, number, number, number])[] = [
  [4, 5, 7, 6], // +z
  [2, 6, 7, 3], // +y
  [0, 1, 5, 4], // -y
  [1, 3, 7, 5], // +x
  [0, 4, 6, 2], // -x
];

export class Geo {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private an: number[] = [];
  private pv: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private push(p: V3, n: V3, c: V3, a: Anim | undefined, def: V3): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.an.push(a?.m ?? 0, a?.ph ?? 0, a?.sp ?? 0, a?.am ?? 0);
    const pv = a?.piv ?? def;
    this.pv.push(pv[0], pv[1], pv[2]);
  }

  tri(a: V3, b: V3, c: V3, ca: V3, cb: V3, cc: V3, an: Anim | undefined, def: V3): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const n: V3 = [nx, ny, nz];
    this.push(a, n, ca, an, def);
    this.push(b, n, cb, an, def);
    this.push(c, n, cc, an, def);
  }

  quad(a: V3, b: V3, c: V3, d: V3, ca: V3, cb: V3, cc: V3, cd: V3, an: Anim | undefined, def: V3): void {
    this.tri(a, b, c, ca, cb, cc, an, def);
    this.tri(a, c, d, ca, cc, cd, an, def);
  }

  /** Quad in an XY plane at depth z (faces +z). Corner colors: bottom-left, bottom-right, top-right, top-left. */
  quadXY(x0: number, y0: number, x1: number, y1: number, z: number, cBL: V3, cBR: V3, cTR: V3, cTL: V3, an?: Anim): void {
    const def: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, z];
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], cBL, cBR, cTR, cTL, an, def);
  }

  /** Vertical gradient quad: cB at the bottom edge, cT at the top edge. */
  gradXY(x0: number, y0: number, x1: number, y1: number, z: number, cB: V3, cT: V3, an?: Anim): void {
    this.quadXY(x0, y0, x1, y1, z, cB, cB, cT, cT, an);
  }

  /** Box centered on (cx, cy, cz), rotated by rz then ry. The back (-z) face is skipped: the camera never sees it. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, cBot: V3, cTop: V3 = cBot, an?: Anim, rz = 0, ry = 0): void {
    const corners: V3[] = [];
    const cr = Math.cos(rz), sr = Math.sin(rz), cy_ = Math.cos(ry), sy_ = Math.sin(ry);
    for (let i = 0; i < 8; i++) {
      let x = (i & 1 ? 0.5 : -0.5) * sx;
      let y = (i & 2 ? 0.5 : -0.5) * sy;
      let z = (i & 4 ? 0.5 : -0.5) * sz;
      const rx = x * cr - y * sr;
      const ry2 = x * sr + y * cr;
      x = rx; y = ry2;
      const qx = x * cy_ + z * sy_;
      const qz = -x * sy_ + z * cy_;
      corners.push([cx + qx, cy + y, cz + qz]);
    }
    const def: V3 = [cx, cy, cz];
    const colOf = (i: number): V3 => (i & 2 ? cTop : cBot);
    for (const [a, b, c, d] of BOX_FACES) {
      this.quad(corners[a], corners[b], corners[c], corners[d], colOf(a), colOf(b), colOf(c), colOf(d), an, def);
    }
  }

  /** Open tapered tube from p0 to p1 (radius r0 -> r1). */
  tube(p0: V3, p1: V3, r0: number, r1: number, sides: number, c0: V3, c1: V3 = c0, an?: Anim): void {
    const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
    const al = Math.hypot(ax, ay, az) || 1;
    const dx = ax / al, dy = ay / al, dz = az / al;
    const h: V3 = Math.abs(dy) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let ux = dy * h[2] - dz * h[1], uy = dz * h[0] - dx * h[2], uz = dx * h[1] - dy * h[0];
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
    const def: V3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
    const ring = (p: V3, r: number, i: number): V3 => {
      const a = (i / sides) * Math.PI * 2;
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      return [p[0] + ux * ca + vx * sa, p[1] + uy * ca + vy * sa, p[2] + uz * ca + vz * sa];
    };
    for (let i = 0; i < sides; i++) {
      this.quad(ring(p0, r0, i), ring(p0, r0, i + 1), ring(p1, r1, i + 1), ring(p1, r1, i), c0, c0, c1, c1, an, def);
    }
  }

  /** Squashed sphere. cTop / cBot color the upper and lower halves with a gradient. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, lat: number, lon: number, cBot: V3, cTop: V3, an?: Anim): void {
    const def: V3 = [cx, cy, cz];
    const pt = (i: number, j: number): V3 => {
      const th = (i / lat) * Math.PI;
      const ph = (j / lon) * Math.PI * 2;
      return [cx + rx * Math.sin(th) * Math.cos(ph), cy + ry * Math.cos(th), cz + rz * Math.sin(th) * Math.sin(ph)];
    };
    const mix = (i: number): V3 => {
      const t = 1 - i / lat;
      return [cBot[0] + (cTop[0] - cBot[0]) * t, cBot[1] + (cTop[1] - cBot[1]) * t, cBot[2] + (cTop[2] - cBot[2]) * t];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        this.quad(pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1), mix(i), mix(i + 1), mix(i + 1), mix(i), an, def);
      }
    }
  }

  /** Filled disc facing +z. */
  disc(cx: number, cy: number, z: number, r: number, seg: number, cCenter: V3, cEdge: V3 = cCenter, an?: Anim): void {
    const def: V3 = [cx, cy, z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([cx, cy, z], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z], cCenter, cEdge, cEdge, an, def);
    }
  }

  /** Searchlight cone: bright apex, black tip edge. Angle is measured from +x. */
  beam(px: number, py: number, z: number, ang: number, len: number, halfWidth: number, color: V3, an?: Anim): void {
    const tx = px + Math.cos(ang) * len, ty = py + Math.sin(ang) * len;
    const nx = -Math.sin(ang) * halfWidth, ny = Math.cos(ang) * halfWidth;
    const black: V3 = [0, 0, 0];
    this.tri([px, py, z], [tx + nx, ty + ny, z], [tx - nx, ty - ny, z], color, black, black, an, [px, py, z]);
  }

  data(): GeoData {
    return {
      pos: new Float32Array(this.pos),
      nor: new Float32Array(this.nor),
      col: new Float32Array(this.col),
      anim: new Float32Array(this.an),
      piv: new Float32Array(this.pv),
      count: this.pos.length / 3,
    };
  }
}

export function toBufferGeometry(d: GeoData, withAnim: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.col, 3));
  if (withAnim) {
    g.setAttribute('aA', new THREE.BufferAttribute(d.anim, 4));
    g.setAttribute('aP', new THREE.BufferAttribute(d.piv, 3));
  }
  return g;
}

// Static solid batching: merges per-solid boxes into one mesh per (sector, material class).
// Pure geometry and layout logic, no renderer access, so draw-call budgets are testable without WebGL.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapSolid3D } from '../game3d/map3d.ts';
import type { SectorId3D } from '../game3d/types3d.ts';

export type SolidClass = 'grate' | 'floor' | 'wall' | 'crate' | 'console' | 'door';

export interface SolidClassInfo {
  cls: SolidClass;
  /** Material is transparent (tall foreground wall). */
  transparent: boolean;
  /** Needs its own mesh (moves, or fades per object), so it is never merged. */
  individual: boolean;
}

/** Mirrors the legacy per-solid material branches in scene3dFull.addSolidMesh. */
export function classifySolid(s: MapSolid3D): SolidClassInfo {
  if (s.kind === 'door') return { cls: 'door', transparent: true, individual: true };
  if (s.kind === 'catwalk') return { cls: s.minY >= 0.5 ? 'grate' : 'floor', transparent: false, individual: false };
  if (s.kind === 'crate') return { cls: 'crate', transparent: false, individual: false };
  if (s.kind === 'console') return { cls: 'console', transparent: false, individual: false };
  const transparent = Boolean(!s.visualMaxY && s.maxY > 2.5 && s.minZ > 0);
  const individual = s.kind === 'wall' && !s.visualMaxY && s.maxY > 2.5 && s.minZ > -2.5;
  return { cls: 'wall', transparent, individual };
}

export interface BatchKey {
  key: string;
  sector: SectorId3D;
  cls: SolidClass;
  transparent: boolean;
}

export function batchKeyFor(sector: SectorId3D, info: SolidClassInfo): BatchKey {
  return { key: `${sector}|${info.cls}|${info.transparent ? 't' : 'o'}`, sector, cls: info.cls, transparent: info.transparent };
}

/** Number of meshes the static solids need once batched (merged buckets plus individual solids). */
export function planSolidMeshCount(
  solids: readonly MapSolid3D[],
  sectorAt: (x: number, y: number) => SectorId3D,
): { meshes: number; materials: number; perSector: Record<string, number> } {
  const keys = new Set<string>();
  const mats = new Set<string>();
  const perSector: Record<string, number> = {};
  let individual = 0;
  for (const s of solids) {
    const info = classifySolid(s);
    const cx = (s.minX + s.maxX) * 0.5;
    const cy = (s.minY + (s.visualMaxY ?? s.maxY)) * 0.5;
    const sector = sectorAt(cx, cy);
    if (info.individual) {
      individual++;
      perSector[sector] = (perSector[sector] ?? 0) + 1;
      continue;
    }
    const k = batchKeyFor(sector, info);
    if (!keys.has(k.key)) perSector[sector] = (perSector[sector] ?? 0) + 1;
    keys.add(k.key);
    mats.add(`${k.cls}|${k.sector}|${k.transparent}`);
  }
  return { meshes: keys.size + individual, materials: mats.size + individual, perSector };
}

export interface BatchItem {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  ox: number;
  oy: number;
  /** Linear-space vertex color. */
  color: THREE.Color;
  /** Optional edge chamfer (m). Absent or 0 keeps the plain 24-vertex box. */
  bevel?: number;
  /** World-space box projection: UV = world coordinate / tile on the two axes facing the dominant normal. Side/bottom faces get `sideTone`. */
  world?: { tile: number; sideTone: number };
}

/** Chamfer width for a solid: capped by its thinnest side so slabs and grates never invert. 0 below 0.12 m. */
export function bevelFor(sx: number, sy: number, sz: number, cls: SolidClass): number {
  if (cls === 'door' || cls === 'console') return 0;
  const m = Math.min(sx, sy, sz);
  if (m < 0.12) return 0;
  return Math.min(cls === 'crate' ? 0.05 : 0.08, m * 0.3);
}

/**
 * Chamfered box: 6 inset faces, 12 edge strips and 8 corner triangles, indexed, with position/normal/uv/color-ready
 * attributes like BoxGeometry. UVs are planar per dominant normal axis (0..1 across the full box), so the per-item
 * repeat/offset bake works unchanged. Top-facing bevels get a warm "worn edge" tint through `tone` (see buildBatchGeometry).
 */
export function chamferBoxGeometry(sx: number, sy: number, sz: number, b: number): { geometry: THREE.BufferGeometry; tone: number[] } {
  const h = [sx / 2, sy / 2, sz / 2];
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const tone: number[] = [];
  const idx: number[] = [];
  const planar = (p: number[], n: number[]): [number, number] => {
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    if (ax >= ay && ax >= az) return [(p[2] + h[2]) / sz, (p[1] + h[1]) / sy];
    if (ay >= az) return [(p[0] + h[0]) / sx, (p[2] + h[2]) / sz];
    return [(p[0] + h[0]) / sx, (p[1] + h[1]) / sy];
  };
  const poly = (pts: number[][], n: number[], t: number): void => {
    const l = Math.hypot(n[0], n[1], n[2]);
    const nn = [n[0] / l, n[1] / l, n[2] / l];
    const base = pos.length / 3;
    for (const p of pts) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nn[0], nn[1], nn[2]);
      const [u, v] = planar(p, nn);
      uv.push(u, v);
      tone.push(t);
    }
    // Wind so the face points along n (flip when the cross product disagrees).
    const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]];
    const e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = cx * nn[0] + cy * nn[1] + cz * nn[2] < 0;
    for (let i = 1; i < pts.length - 1; i++) {
      if (flip) idx.push(base, base + i + 1, base + i);
      else idx.push(base, base + i, base + i + 1);
    }
  };
  const S = [-1, 1];
  // Faces (inset on the two tangent axes).
  for (let a = 0; a < 3; a++) {
    const t1 = (a + 1) % 3;
    const t2 = (a + 2) % 3;
    for (const sa of S) {
      const pts: number[][] = [];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 0, 0];
        p[a] = sa * h[a];
        p[t1] = u * (h[t1] - b);
        p[t2] = v * (h[t2] - b);
        pts.push(p);
      }
      const n = [0, 0, 0];
      n[a] = sa;
      poly(pts, n, 1);
    }
  }
  // Edges: along axis e, between faces on axes a and c.
  for (let e = 0; e < 3; e++) {
    const a = (e + 1) % 3;
    const c = (e + 2) % 3;
    for (const sa of S) {
      for (const sc of S) {
        const p0 = [0, 0, 0];
        const p1 = [0, 0, 0];
        const p2 = [0, 0, 0];
        const p3 = [0, 0, 0];
        for (const [p, ee, ra, rc] of [[p0, -1, 1, 0], [p1, 1, 1, 0], [p2, 1, 0, 1], [p3, -1, 0, 1]] as const) {
          p[e] = ee * (h[e] - b);
          p[a] = sa * (ra ? h[a] : h[a] - b);
          p[c] = sc * (rc ? h[c] : h[c] - b);
        }
        const n = [0, 0, 0];
        n[a] = sa;
        n[c] = sc;
        const top = n[1] > 0 ? 1.3 : n[1] < 0 ? 0.72 : 1.08;
        poly([p0, p1, p2, p3], n, top);
      }
    }
  }
  // Corners.
  for (const sx_ of S) {
    for (const sy_ of S) {
      for (const sz_ of S) {
        const s3 = [sx_, sy_, sz_];
        const pts = [0, 1, 2].map((k) => {
          const p = [0, 0, 0];
          for (let i = 0; i < 3; i++) p[i] = s3[i] * (i === k ? h[i] : h[i] - b);
          return p;
        });
        poly(pts, s3, sy_ > 0 ? 1.3 : 0.72);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return { geometry: g, tone };
}

/** Builds one merged box geometry; UV repeat/offset are baked per item so all items share one texture. */
export function buildBatchGeometry(items: readonly BatchItem[]): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const it of items) {
    let g: THREE.BufferGeometry;
    let tone: number[] | null = null;
    if (it.bevel && it.bevel > 0) {
      const c = chamferBoxGeometry(it.sx, it.sy, it.sz, it.bevel);
      g = c.geometry;
      tone = c.tone;
    } else {
      g = new THREE.BoxGeometry(it.sx, it.sy, it.sz);
    }
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * it.rx + it.ox, uv.getY(i) * it.ry + it.oy);
    g.translate(it.cx, it.cy, it.cz);
    if (it.world) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(nor.getX(i));
        const ay = Math.abs(nor.getY(i));
        const az = Math.abs(nor.getZ(i));
        const t = it.world.tile;
        if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i) / t, pos.getZ(i) / t);
        else if (ax >= az) uv.setXY(i, pos.getZ(i) / t, pos.getY(i) / t);
        else uv.setXY(i, pos.getX(i) / t, pos.getY(i) / t);
      }
    }
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let k = tone ? tone[i] : 1;
      if (it.world && (g.attributes.normal as THREE.BufferAttribute).getY(i) < 0.5) k *= it.world.sideTone;
      col[i * 3] = it.color.r * k;
      col[i * 3 + 1] = it.color.g * k;
      col[i * 3 + 2] = it.color.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  if (merged) merged.computeBoundingBox();
  return merged;
}

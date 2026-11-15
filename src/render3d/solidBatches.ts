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
}

/** Builds one merged box geometry; UV repeat/offset are baked per item so all items share one texture. */
export function buildBatchGeometry(items: readonly BatchItem[]): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const it of items) {
    const g = new THREE.BoxGeometry(it.sx, it.sy, it.sz);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * it.rx + it.ox, uv.getY(i) * it.ry + it.oy);
    g.translate(it.cx, it.cy, it.cz);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = it.color.r;
      col[i * 3 + 1] = it.color.g;
      col[i * 3 + 2] = it.color.b;
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

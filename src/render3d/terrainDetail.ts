// R14 terrain relief: low-poly rock, stalactites, wall ribs, trim pipes and rubble merged into a few meshes per 16 m
// strip. Render-only (collision solids are untouched) and light-free. Pure THREE geometry, no renderer access, so the
// draw-call cost is testable without WebGL: one mesh per (sector, strip), counted by drawBudget.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapSolid3D } from '../game3d/map3d.ts';
import type { Level3D, SectorId3D } from '../game3d/types3d.ts';

export const DETAIL_STRIP_M = 16;

export interface TerrainDetailUnit {
  key: string;
  sector: SectorId3D;
  geometry: THREE.BufferGeometry;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  triangles: number;
}

/** Per-sector palette (linear-ish sRGB hex). rock is the main body, accent a lighter or wet highlight. */
const LOOK: Record<SectorId3D, { body: number; accent: number; pipe: number }> = {
  airlock: { body: 0x5c6c7c, accent: 0x8fb4d4, pipe: 0x7d8da0 },
  shaft: { body: 0x6b5a4a, accent: 0xc8903c, pipe: 0x8a6a48 },
  mines: { body: 0x5e5243, accent: 0x7fcf6a, pipe: 0x6a5a44 },
  biolabs: { body: 0x6f8b86, accent: 0x9be8cf, pipe: 0x86a9a2 },
  security: { body: 0x4a5668, accent: 0xff7a5a, pipe: 0x6b7a92 },
  core: { body: 0x6a4e48, accent: 0xff5a3a, pipe: 0x8a5e52 },
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(g: THREE.BufferGeometry, color: THREE.Color, rnd: () => number, jitter = 0.12): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  // Per-face tone variation keeps the flat-shaded facets readable.
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd() - 0.5) * 2 * jitter;
    for (let v = 0; v < 3; v++) {
      col[(i + v) * 3] = color.r * k;
      col[(i + v) * 3 + 1] = color.g * k;
      col[(i + v) * 3 + 2] = color.b * k;
    }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (ng !== g) g.dispose();
  return ng;
}

/** Displaced icosahedron: a faceted boulder. */
function boulder(rnd: () => number, r: number, x: number, y: number, z: number, color: THREE.Color, squash = 0.7): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) {
      k = 0.72 + rnd() * 0.5;
      seen.set(key, k);
    }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  g.rotateY(rnd() * Math.PI * 2);
  g.translate(x, y, z);
  g.computeVertexNormals();
  return paint(g, color, rnd, 0.16);
}

function spike(rnd: () => number, r: number, h: number, x: number, y: number, z: number, color: THREE.Color, down: boolean): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 5, 1);
  g.rotateY(rnd() * 3);
  if (down) g.rotateX(Math.PI);
  g.translate(x + (rnd() - 0.5) * 0.1, y + (down ? -h / 2 : h / 2), z);
  return paint(g, color, rnd, 0.14);
}

function slab(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color, rnd, 0.06);
}

function pipe(len: number, r: number, x: number, y: number, z: number, color: THREE.Color, rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, 8, 1);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color, rnd, 0.05);
}

function isStatic(s: MapSolid3D): boolean {
  return !s.dynamic && !s.doorId && !s.collapseId && !s.bridgeId && !s.breakId;
}

/** Geometry pieces for one solid (world space). Exported for tests. */
export function detailPiecesForSolid(s: MapSolid3D, sector: SectorId3D): THREE.BufferGeometry[] {
  if (!isStatic(s)) return [];
  const kind = s.kind ?? 'wall';
  if (kind !== 'wall' && kind !== 'catwalk' && kind !== 'platform') return [];
  const sx = s.maxX - s.minX;
  const top = s.visualMaxY ?? s.maxY;
  const sy = top - s.minY;
  if (sx < 0.8) return [];
  const rnd = rng(hashId(s.id));
  const look = LOOK[sector];
  const body = new THREE.Color(look.body);
  const accent = new THREE.Color(look.accent);
  const pipeC = new THREE.Color(look.pipe);
  const out: THREE.BufferGeometry[] = [];
  const front = s.maxZ;
  const back = s.minZ;
  const floorLike = kind !== 'wall' || sy <= 1.6;
  const tall = kind === 'wall' && sy >= 2.5;

  if (sector === 'mines') {
    if (floorLike) {
      const maxN = 18;
      let n = 0;
      // Back boulders give depth, small foreground rubble stays below knee height.
      for (let x = s.minX + 0.4; x < s.maxX - 0.3 && n < maxN; x += 0.9 + rnd() * 1.0, n++) {
        out.push(boulder(rnd, 0.5 + rnd() * 0.7, x, top + 0.1, back + 0.7 + rnd() * 1.2, body));
        if (rnd() < 0.55) out.push(boulder(rnd, 0.1 + rnd() * 0.13, x + (rnd() - 0.5) * 0.8, top + 0.04, front - 0.35 - rnd() * 0.9, body, 0.6));
        if (rnd() < 0.18) out.push(spike(rnd, 0.1, 0.5 + rnd() * 0.5, x + 0.3, top, back + 0.5 + rnd(), accent, false));
      }
      if (sy > 0.5) {
        // Thin ledge fascia: a few chunks hanging off the front face so the edge is not a flat box.
        for (let x = s.minX + 0.5, k = 0; x < s.maxX - 0.4 && k < 10; x += 1.4 + rnd() * 1.4, k++) {
          out.push(boulder(rnd, 0.28 + rnd() * 0.22, x, s.minY + sy * (0.2 + rnd() * 0.5), front + 0.02, body, 0.9));
        }
      }
    } else {
      // Wall face: outcrops on the front plane, wide stalactites if this is a ceiling slab.
      const maxN = 24;
      let n = 0;
      if (sx > 6 && sy < 2) {
        for (let x = s.minX + 0.5; x < s.maxX - 0.3 && n < maxN; x += 0.8 + rnd() * 1.1, n++) {
          const big = rnd() < 0.3;
          out.push(spike(rnd, big ? 0.34 : 0.18, big ? 1.5 + rnd() * 0.9 : 0.6 + rnd() * 0.7, x, s.minY, back + 0.5 + rnd() * (front - back - 1.0), body, true));
        }
      } else {
        const cols = Math.max(1, Math.floor(sx / 1.3));
        const rows = Math.max(1, Math.min(7, Math.floor(sy / 1.5)));
        for (let c = 0; c < cols && n < maxN; c++) {
          for (let r = 0; r < rows && n < maxN; r++, n++) {
            if (rnd() < 0.3) continue;
            const x = s.minX + ((c + 0.5 + (rnd() - 0.5) * 0.6) / cols) * sx;
            const y = s.minY + ((r + 0.5 + (rnd() - 0.5) * 0.6) / rows) * sy;
            out.push(boulder(rnd, 0.32 + rnd() * 0.4, x, y, front + 0.04, body, 0.85));
          }
        }
      }
    }
    return out;
  }

  if (tall) {
    // Structural ribs with a cap and base flange, plus a conduit run.
    const pitch = 2.6;
    const n = Math.max(1, Math.floor(sx / pitch));
    for (let i = 0; i < Math.min(n, 12); i++) {
      const x = s.minX + ((i + 0.5) / n) * sx;
      out.push(slab(0.2, sy, 0.14, x, s.minY + sy / 2, front + 0.07, body, rnd));
      out.push(slab(0.34, 0.16, 0.2, x, s.minY + 0.08, front + 0.1, accent, rnd));
      out.push(slab(0.34, 0.16, 0.2, x, top - 0.08, front + 0.1, accent, rnd));
    }
    out.push(pipe(sx - 0.2, 0.07, (s.minX + s.maxX) / 2, s.minY + Math.min(sy * 0.6, 2.1), front + 0.12, pipeC, rnd));
    return out;
  }
  if (floorLike && sx >= 1.6) {
    // Front edge conduit with brackets, and a recessed service strip on the face.
    out.push(pipe(sx - 0.3, 0.07, (s.minX + s.maxX) / 2, top - 0.2, front + 0.08, pipeC, rnd));
    for (let x = s.minX + 0.6; x < s.maxX - 0.4; x += 2.2) out.push(slab(0.1, 0.3, 0.1, x, top - 0.2, front + 0.06, body, rnd));
    if (sy > 0.5) out.push(slab(sx - 0.4, 0.07, 0.05, (s.minX + s.maxX) / 2, s.minY + sy * 0.3, front + 0.03, accent, rnd));
    // R24 floor clutter: low scrap and rubble piles on the rear lane so decks are not bare planes (behind the character lane).
    let piles = 0;
    for (let x = s.minX + 0.8 + rnd() * 1.2; x < s.maxX - 0.6 && piles < 8; x += 2.4 + rnd() * 2.2, piles++) {
      const z = back + 0.35 + rnd() * 0.9;
      const k = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < k; i++) out.push(boulder(rnd, 0.08 + rnd() * 0.16, x + (rnd() - 0.5) * 0.7, top + 0.02, z + (rnd() - 0.5) * 0.4, body, 0.6));
      if (rnd() < 0.4) out.push(slab(0.3 + rnd() * 0.4, 0.05, 0.22 + rnd() * 0.2, x + 0.3, top + 0.03, z + 0.2, pipeC, rnd));
      if (rnd() < 0.15) out.push(slab(0.08, 0.04, 0.08, x - 0.2, top + 0.05, z, accent, rnd));
    }
  }
  return out;
}

/** Merged detail meshes (geometry only) grouped per sector and 16 m strip. */
export function buildTerrainDetail(level: Level3D, sectorAt: (x: number, y: number) => SectorId3D): TerrainDetailUnit[] {
  const buckets = new Map<string, { sector: SectorId3D; geos: THREE.BufferGeometry[] }>();
  for (const s of level.solids) {
    const top = s.visualMaxY ?? s.maxY;
    const sector = sectorAt((s.minX + s.maxX) * 0.5, (s.minY + top) * 0.5);
    const pieces = detailPiecesForSolid(s, sector);
    if (pieces.length === 0) continue;
    const strip = Math.floor((s.minX + s.maxX) / 2 / DETAIL_STRIP_M);
    const key = `${sector}|${strip}`;
    let b = buckets.get(key);
    if (!b) {
      b = { sector, geos: [] };
      buckets.set(key, b);
    }
    b.geos.push(...pieces);
  }
  const units: TerrainDetailUnit[] = [];
  for (const [key, b] of buckets) {
    const merged = mergeGeometries(b.geos);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    merged.computeBoundingBox();
    const bb = merged.boundingBox!;
    units.push({
      key,
      sector: b.sector,
      geometry: merged,
      minX: bb.min.x,
      maxX: bb.max.x,
      minY: bb.min.y,
      maxY: bb.max.y,
      triangles: merged.attributes.position.count / 3,
    });
  }
  return units;
}

/** Shared material for every detail mesh (vertex-colored, faceted). */
export function makeTerrainDetailMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.22 });
}

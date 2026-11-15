// Code-level draw-call estimator per sector (no WebGL, no renderer). It counts the meshes the scene would submit when the
// camera window sits over a sector, using the same culling rules as scene3dFull (view window overlap) and a fixed allowance
// for actors, fx and hero gear. Real browser numbers are unverified; this guards the structure that produces them.
import * as THREE from 'three';
import type { MapSolid3D } from '../game3d/map3d.ts';
import type { Level3D, SectorId3D } from '../game3d/types3d.ts';
import { batchKeyFor, classifySolid } from './solidBatches.ts';
import { buildTerrainDetail } from './terrainDetail.ts';

export const SECTOR_DRAW_BUDGET = 300;
/** Player rig, enemies, pickups, projectiles and fx pools that are alive in a typical frame. */
export const ACTOR_FX_ALLOWANCE = 70;
/** Door dressing (lamps, signs, hazard stripes) plus the instanced solid trim mesh. */
export const DRESSING_MESHES = 4;
/** Camera window half extents (m), measured at the far zoom (dist 20, fov 38, aspect 16:9) plus the 4 m margin of applyViewCulling. */
export const WINDOW_HALF_W = 19.4;
export const WINDOW_HALF_H = 10.9;

export interface ViewParts {
  decorRoot: THREE.Object3D;
  decor: { setView(minX: number, maxX: number, minY: number, maxY: number): void };
  vistaRoot: THREE.Object3D;
  vista: { setView(minX: number, maxX: number, minY: number, maxY: number): void };
  ambientRoot: THREE.Object3D;
  ambient: { setView(minX: number, maxX: number, minY: number, maxY: number): void };
  hazardsRoot: THREE.Object3D;
}

export interface SectorDrawEstimate {
  sector: SectorId3D;
  solids: number;
  /** R14 terrain relief strips (merged rock, rib and conduit meshes). */
  terrain: number;
  decor: number;
  vista: number;
  ambient: number;
  hazards: number;
  dressing: number;
  allowance: number;
  total: number;
  /** Shadow-casting meshes among the decor and solids (the shadow pass draws them a second time). */
  shadowCasters: number;
  /** total plus the shadow pass; renderer.info.render.calls accumulates this per frame (see docs/R9_WORLD.md). */
  withShadowPass: number;
  /** Camera focus (x, y) that produced the worst case. */
  worstAt: { x: number; y: number };
}

/** Visible, drawable meshes under root (an invisible ancestor hides its subtree, like three.js does). */
export function countVisibleMeshes(root: THREE.Object3D): { meshes: number; casters: number } {
  let meshes = 0;
  let casters = 0;
  const walk = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    const p = o as THREE.Points;
    if (m.isMesh || p.isPoints) {
      meshes++;
      if (m.castShadow) casters++;
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  return { meshes, casters };
}

interface SolidUnit {
  key: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  individual: boolean;
}

/** Merged batch buckets (one bbox per key) and individual solids, each with a culling rect like scene3dFull. */
export function planSolidUnits(solids: readonly MapSolid3D[], sectorAt: (x: number, y: number) => SectorId3D): SolidUnit[] {
  const buckets = new Map<string, SolidUnit>();
  const units: SolidUnit[] = [];
  for (const s of solids) {
    const info = classifySolid(s);
    const top = s.visualMaxY ?? s.maxY;
    const sector = sectorAt((s.minX + s.maxX) * 0.5, (s.minY + top) * 0.5);
    if (info.individual) {
      units.push({ key: s.id, minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: top, individual: true });
      continue;
    }
    const key = batchKeyFor(sector, info).key;
    const b = buckets.get(key);
    if (!b) {
      const u: SolidUnit = { key, minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: top, individual: false };
      buckets.set(key, u);
      units.push(u);
    } else {
      b.minX = Math.min(b.minX, s.minX);
      b.maxX = Math.max(b.maxX, s.maxX);
      b.minY = Math.min(b.minY, s.minY);
      b.maxY = Math.max(b.maxY, top);
    }
  }
  return units;
}

/**
 * Worst-case estimate per sector. Focus points are sampled every 4 m along each room of the sector (floor and mid height),
 * the decor and vista views are set to the camera window around each focus, and the highest total wins.
 */
export function estimateSectorDrawCalls(level: Level3D, parts: ViewParts): SectorDrawEstimate[] {
  const sectorAt = (x: number, y: number): SectorId3D => {
    for (const r of level.rooms) if (x >= r.minX && x <= r.maxX && y >= r.minY - 0.5 && y <= r.maxY + 0.5) return r.sector;
    return 'shaft';
  };
  const units = planSolidUnits(level.solids, sectorAt);
  const detail = buildTerrainDetail(level, sectorAt);
  const hazards = countVisibleMeshes(parts.hazardsRoot).meshes;
  const out: SectorDrawEstimate[] = [];
  const sectors = [...new Set(level.rooms.map((r) => r.sector))];
  for (const sector of sectors) {
    let best: SectorDrawEstimate | null = null;
    for (const room of level.rooms.filter((r) => r.sector === sector)) {
      const ys = [room.minY + 1.7, (room.minY + room.maxY) / 2];
      for (let fx = room.minX; fx <= room.maxX + 1e-6; fx += 4) {
        for (const fy of ys) {
          const vx0 = fx - WINDOW_HALF_W;
          const vx1 = fx + WINDOW_HALF_W;
          const vy0 = fy - WINDOW_HALF_H;
          const vy1 = fy + WINDOW_HALF_H;
          parts.decor.setView(vx0, vx1, vy0, vy1);
          parts.vista.setView(vx0, vx1, vy0, vy1);
          parts.ambient.setView(vx0, vx1, vy0, vy1);
          const d = countVisibleMeshes(parts.decorRoot);
          const v = countVisibleMeshes(parts.vistaRoot);
          const a = countVisibleMeshes(parts.ambientRoot);
          const solids = units.filter((u) => u.maxX >= vx0 && u.minX <= vx1 && u.maxY >= vy0 && u.minY <= vy1).length;
          const terrain = detail.filter((u) => u.maxX >= vx0 && u.minX <= vx1 && u.maxY >= vy0 && u.minY <= vy1).length;
          const total = solids + terrain + d.meshes + v.meshes + a.meshes + hazards + DRESSING_MESHES + ACTOR_FX_ALLOWANCE;
          if (!best || total > best.total) {
            const casters = d.casters + Math.ceil(solids * 0.5);
            best = {
              sector,
              solids,
              terrain,
              decor: d.meshes,
              vista: v.meshes,
              ambient: a.meshes,
              hazards,
              dressing: DRESSING_MESHES,
              allowance: ACTOR_FX_ALLOWANCE,
              total,
              shadowCasters: casters,
              withShadowPass: total + casters,
              worstAt: { x: fx, y: fy },
            };
          }
        }
      }
    }
    if (best) out.push(best);
  }
  detail.forEach((u) => u.geometry.dispose());
  return out;
}

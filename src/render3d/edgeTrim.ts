// R25 platform edge trim: a thin hazard-chevron band on the camera-facing lip of walkable platforms and catwalks.
// Render only. Pure geometry (one merged quad strip per sector, so one draw call each) plus a cached texture loader.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface TrimStrip {
  minX: number;
  maxX: number;
  /** Top of the band (world Y). */
  top: number;
  /** Z of the camera-facing plane the band floats on. */
  z: number;
}

/** Band height in metres and horizontal repeat length of the chevron texture. */
export const TRIM_HEIGHT = 0.22;
export const TRIM_REPEAT_M = 2.0;

/** Which solids get a trim band: walkable platform or catwalk lips wide and thick enough to carry it. */
export function wantsEdgeTrim(kind: string, width: number, thickness: number): boolean {
  return (kind === 'platform' || kind === 'catwalk') && width >= 1.6 && thickness >= 0.2;
}

/** Quads facing +z with world-anchored U so neighbouring bands share one continuous chevron run. */
export function buildTrimGeometry(strips: readonly TrimStrip[]): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const s of strips) {
    const w = s.maxX - s.minX;
    if (w <= 0) continue;
    const g = new THREE.PlaneGeometry(w, TRIM_HEIGHT);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (s.minX + uv.getX(i) * w) / TRIM_REPEAT_M, uv.getY(i));
    g.translate((s.minX + s.maxX) * 0.5, s.top - TRIM_HEIGHT * 0.5, s.z);
    geos.push(g);
  }
  if (geos.length === 0) return null;
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  merged?.computeBoundingBox();
  return merged;
}

let trimTex: Promise<THREE.Texture> | null = null;
export function loadTrimTexture(): Promise<THREE.Texture> {
  if (!trimTex) {
    trimTex = new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        '/assets/textures/hazard-trim.webp',
        (t) => {
          t.wrapS = THREE.RepeatWrapping;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 4;
          resolve(t);
        },
        undefined,
        () => reject(new Error('hazard trim texture failed')),
      );
    });
    trimTex.catch(() => {
      trimTex = null;
    });
  }
  return trimTex;
}

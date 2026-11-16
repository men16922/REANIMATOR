// R24 terrain surfaces: Meshy-generated tileable textures (public/assets/textures) applied to collision-solid batches.
// Render only. Every surface is optional: until a texture loads (or when it fails) the batch keeps its procedural facility map.
import * as THREE from 'three';
import type { SectorId3D, StageId3D } from '../game3d/types3d.ts';

export type SurfaceId = 's1-floor' | 's1-wall' | 'mines-rock' | 'foundry-iron' | 'foundry-wall' | 'reactor-frost' | 'reactor-floor-calm' | 'reactor-wall' | 'steel-grating';

export interface SurfaceTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
}

const cache = new Map<SurfaceId, Promise<SurfaceTextures>>();

function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 4;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.needsUpdate = true;
        resolve(t);
      },
      undefined,
      () => reject(new Error(`terrain texture failed: ${url}`)),
    );
  });
}

/** Loads one albedo + normal pair (cached). Rejects when either file is missing. */
export function loadSurface(id: SurfaceId): Promise<SurfaceTextures> {
  let p = cache.get(id);
  if (!p) {
    p = Promise.all([loadTex(`/assets/textures/${id}.webp`, true), loadTex(`/assets/textures/${id}-n.webp`, false)]).then(([albedo, normal]) => ({ albedo, normal }));
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return p;
}

export interface SurfaceLook {
  /** Texture for upward faces (platform and floor tops). */
  top: SurfaceId;
  /** Texture for walls, undersides and slab fronts. */
  side: SurfaceId;
  /** Linear multiplier on the albedo for tops / sides (the raw textures are mid-dark; sides sit darker for value separation). */
  topTint: THREE.Color;
  sideTint: THREE.Color;
  /** World metres covered by one texture repeat. */
  tile: number;
}

/** Tint with a linear gain: the stage lighting is dim, so tops are lifted above 1 to read as lit surfaces. */
const c = (hex: number, gain = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(gain);

/** Texture identity per (stage, sector). Stage 2 reads as cast iron, Stage 3 as frosted reactor steel. */
export function surfaceLookFor(stage: StageId3D | number, sector: SectorId3D, cls?: string): SurfaceLook {
  // R25: open grating on elevated catwalks (bars read bright against the dark void below).
  if (cls === 'grate') {
    const warm = stage === 2 ? 0xe8b898 : stage === 3 ? 0xa8c4dc : sector === 'mines' ? 0xd8c4a8 : 0xc8d4dc;
    return { top: 'steel-grating', side: 'steel-grating', topTint: c(warm, 2.4), sideTint: c(warm, 1.3), tile: 2.5 };
  }
  if (stage === 2) return { top: 'foundry-iron', side: 'foundry-wall', topTint: c(0xffa070, 2.0), sideTint: c(0xb08060, 1.7), tile: 3 };
  if (stage === 3) return { top: 'reactor-floor-calm', side: 'reactor-wall', topTint: c(0x7a90ac, 1.25), sideTint: c(0x7890ac, 1.7), tile: 3 };
  switch (sector) {
    case 'mines':
      return { top: 'mines-rock', side: 'mines-rock', topTint: c(0xe0c8b0, 2.1), sideTint: c(0x8a7660, 1.5), tile: 4 };
    case 'biolabs':
      return { top: 's1-floor', side: 's1-wall', topTint: c(0xb8dccc, 2.1), sideTint: c(0x6a8c80, 1.5), tile: 3 };
    case 'core':
      return { top: 's1-floor', side: 's1-wall', topTint: c(0xe0b8a4, 2.1), sideTint: c(0x8a5a4a, 1.5), tile: 3 };
    case 'shaft':
      return { top: 's1-floor', side: 's1-wall', topTint: c(0xd8c4a8, 2.1), sideTint: c(0x7a6a58, 1.5), tile: 3 };
    default:
      return { top: 's1-floor', side: 's1-wall', topTint: c(0xd0e0ec, 2.1), sideTint: c(0x728494, 1.5), tile: 3 };
  }
}

export interface TwoSurfaceUniforms {
  map2: { value: THREE.Texture | null };
  normalMap2: { value: THREE.Texture | null };
}

/**
 * Patches a standard material so upward faces (object-space normal.y > 0.5) sample `map`/`normalMap` and every other
 * face samples `map2`/`normalMap2`. One material, one draw call per batch.
 */
/** Rewrites three's normal-map sampling so it blends two maps by `vTopFace`; null when the chunk no longer has the expected call (three upgrade). */
export function patchNormalChunk(chunk: string): string | null {
  const needle = 'texture2D( normalMap, vNormalMapUv )';
  if (!chunk.includes(needle)) return null;
  return chunk.replaceAll(needle, 'mix(texture2D( normalMap2, vNormalMapUv ), texture2D( normalMap, vNormalMapUv ), vTopFace)');
}

/**
 * Patches a standard material so upward faces (object-space normal.y > 0.5) sample `map`/`normalMap` and every other
 * face samples `map2`/`normalMap2`. One material, one draw call per batch. If any of three's shader chunks no longer
 * match what the patch expects, the material is left unpatched (all faces use the top texture) and a warning is logged.
 */
export function applyTwoSurface(mat: THREE.MeshStandardMaterial, u: TwoSurfaceUniforms): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer): void => {
    prev.call(mat, shader, renderer);
    const need = (src: string, token: string): boolean => src.includes(token);
    const normalChunk = patchNormalChunk(THREE.ShaderChunk.normal_fragment_maps);
    const ok =
      normalChunk !== null &&
      need(shader.vertexShader, '#include <common>') &&
      need(shader.vertexShader, '#include <begin_vertex>') &&
      need(shader.fragmentShader, '#include <common>') &&
      need(shader.fragmentShader, '#include <map_fragment>') &&
      need(shader.fragmentShader, '#include <normal_fragment_maps>');
    if (!ok) {
      console.warn('[terrainSurfaces] three shader chunks changed; two-surface patch skipped');
      return;
    }
    shader.uniforms.map2 = u.map2;
    shader.uniforms.normalMap2 = u.normalMap2;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTopFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTopFace = step(0.5, normal.y);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTopFace;\nuniform sampler2D map2;\nuniform sampler2D normalMap2;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n diffuseColor *= mix(texture2D(map2, vMapUv), texture2D(map, vMapUv), vTopFace);\n#endif')
      .replace('#include <normal_fragment_maps>', normalChunk as string);
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = (): string => `${key()}|twosurface`;
  mat.needsUpdate = true;
}

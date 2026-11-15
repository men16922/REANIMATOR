// Front-face lift for full-depth solids. The side camera looks at the +z face of walls and stepping stones; the sun comes from
// above and often sits behind an overhang, so those faces drop to ambient only and read as black slabs. This adds a small
// albedo-tinted emissive term that scales with how squarely the face points at the camera (view-space normal.z), so tops and
// undersides keep their lighting. Render only: no simulation reads, no extra lights.
import * as THREE from 'three';

/** Shader snippet appended after emissivemap_fragment (normal and diffuseColor are already defined there). */
export function frontLiftGlsl(lift: number, floorTint: readonly [number, number, number]): string {
  const f = (n: number): string => n.toFixed(4);
  return `
  float frontFacing = smoothstep(0.45, 0.95, normal.z);
  totalEmissiveRadiance += (diffuseColor.rgb * ${f(lift)} + vec3(${f(floorTint[0])}, ${f(floorTint[1])}, ${f(floorTint[2])})) * frontFacing;`;
}

/** Hook a MeshStandardMaterial so camera-facing faces never fall to pure black. */
export function applyFrontLift(mat: THREE.MeshStandardMaterial, lift = 0.32, floorTint: readonly [number, number, number] = [0.018, 0.024, 0.032]): void {
  const glsl = frontLiftGlsl(lift, floorTint);
  mat.onBeforeCompile = (shader): void => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>${glsl}`);
  };
  mat.customProgramCacheKey = (): string => `frontlift:${lift}:${floorTint.join(',')}`;
  mat.needsUpdate = true;
}

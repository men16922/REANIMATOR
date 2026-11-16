// Sector vistas seen through the back-wall windows: landmark silhouettes and additive glow at z -6 .. -24.
// Render-only (never read by the sim, no PointLights). Per sector: window frames, glass, one opaque silhouette mesh and
// one additive glow mesh. Animation runs in the vertex shader, so a sector costs 4 draw calls and no per-frame CPU work
// beyond a few uniforms. Hidden sectors are culled with the decor view window.
import * as THREE from 'three';
import type { Level3D, SectorId3D } from '../game3d/types3d.ts';
import { toBufferGeometry } from './vistaGeo.ts';
import { VISTA_HAZE, layoutAllVistas, type VistaData } from './vistaScenes.ts';

export * from './vistaScenes.ts';

export interface VistaTelemetry {
  /** Sector the player is in (the vista that matters most right now). */
  sector: SectorId3D | null;
  /** True when that sector's vista is drawn this frame. */
  visible: boolean;
  /** Draw calls added by all visible vistas. */
  drawCalls: number;
}

export interface VistaUpdate {
  playerX: number;
  playerY: number;
  /** Reduce flashing: no flicker, slower motion, narrower searchlight sweep. */
  reduce: boolean;
  /** Meltdown running (w.meltdownTicks >= 0 after the core fell). Tints and speeds the vistas red. */
  meltdown: boolean;
}

export interface Vista3D {
  update(tSec: number, u: VistaUpdate): void;
  /** Hides vistas whose room lies outside the camera window. */
  setView(minX: number, maxX: number, minY: number, maxY: number): void;
  /** Classic View: quantised, dithered, no glass reflections. */
  setClassic(on: boolean): void;
  telemetry(): VistaTelemetry;
  dispose(): void;
}

/** GLSL for the stage luminance ramp, shared by the vista and ambient shaders. Needs uRampA/B/C and uGrade uniforms. */
export const GRADE_UNIFORMS = /* glsl */ `
uniform vec3 uRampA;
uniform vec3 uRampB;
uniform vec3 uRampC;
uniform float uGrade;
`;
export const GRADE_APPLY = /* glsl */ `
  if (uGrade > 0.0) {
    float gLum = clamp(dot(c, vec3(0.299, 0.587, 0.114)) * 1.7, 0.0, 1.0);
    vec3 gCol = gLum < 0.5 ? mix(uRampA, uRampB, gLum * 2.0) : mix(uRampB, uRampC, (gLum - 0.5) * 2.0);
    c = mix(c, gCol, uGrade);
  }
`;
/** Uniform block for a stage ramp (all zeros for Stage 1: no grade). */
export function gradeUniforms(stage: number | undefined): Record<string, { value: unknown }> {
  const r = STAGE_RAMP[stage ?? 1];
  return {
    uRampA: { value: new THREE.Color(r ? r.a : 0) },
    uRampB: { value: new THREE.Color(r ? r.b : 0) },
    uRampC: { value: new THREE.Color(r ? r.c : 0) },
    uGrade: { value: r ? r.grade : 0 },
  };
}

const VERT = /* glsl */ `
attribute vec4 aA;
attribute vec3 aP;
uniform float uTime;
uniform float uReduce;
uniform float uMelt;
varying vec3 vCol;
varying float vB;
varying vec3 vW;
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec3 p = position;
  float m = aA.x;
  float ph = aA.y;
  float sp = aA.z;
  float am = aA.w;
  float rs = mix(1.0, 0.4, uReduce);
  float ms = 1.0 + uMelt * 1.6;
  float t = uTime;
  float b = 1.0;
  if (m > 0.5) {
    if (m < 1.5) {
      b = 0.68 + 0.32 * sin(t * sp * rs * ms + ph);
    } else if (m < 2.5) {
      if (uReduce > 0.5) {
        b = 0.8 + 0.2 * sin(t * 0.7 + ph);
      } else {
        float h = hash11(floor(t * sp + ph));
        b = h > 0.8 ? 0.12 : 0.82 + 0.18 * h;
      }
    } else if (m < 3.5) {
      float y0 = aP.z;
      float k = mod((aP.y - y0) - t * sp * rs, am);
      p.y += (y0 + k) - aP.y;
      b = ph > 0.5 ? 1.0 : sin(3.14159 * k / am);
    } else if (m < 4.5) {
      float a = ph + t * sp * rs * ms;
      vec2 d = p.xy - aP.xy;
      p.xy = aP.xy + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
    } else if (m < 5.5) {
      float a = am * sin(t * sp * rs + ph) * mix(1.0, 0.35, uReduce);
      vec2 d = p.xy - aP.xy;
      p.xy = aP.xy + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
    } else if (m < 6.5) {
      float s = 1.0 + am * sin(t * sp * rs + ph);
      p = aP + (p - aP) * s;
      b = 0.9 + 0.1 * sin(t * sp * rs + ph);
    } else if (m < 7.5) {
      b = 0.55 + 0.45 * sin(p.x * 0.8 - t * sp * rs + ph);
    } else if (m < 8.5) {
      p.x += am * sin(t * sp * rs + ph + p.y * 0.7);
    } else if (m < 9.5) {
      float a = ph + t * sp * rs * ms;
      vec3 d = p - aP;
      p.x = aP.x + d.x * cos(a) + d.z * sin(a);
      p.z = aP.z - d.x * sin(a) + d.z * cos(a);
    } else {
      b = 0.5 + 0.5 * sin(p.y * 5.0 - t * sp * rs + ph);
    }
  }
  vCol = color;
  vB = b;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const VISTA_FRAG = /* glsl */ `
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uMelt;
uniform float uDim;
uniform float uClassic;
uniform vec4 uClip;
${GRADE_UNIFORMS}
varying vec3 vCol;
varying float vB;
varying vec3 vW;
void main() {
  if (vW.x < uClip.x || vW.x > uClip.y || vW.y < uClip.z || vW.y > uClip.w) discard;
  float edge = min(min(vW.x - uClip.x, uClip.y - vW.x), min(vW.y - uClip.z, uClip.w - vW.y));
  float edgeF = smoothstep(0.0, 3.0, edge);
  vec3 c = vCol * vB;
  float f = clamp((-vW.z - 4.0) / 18.0, 0.0, 1.0);
  #ifdef ADDITIVE
    c *= (1.0 - 0.6 * f) * edgeF;
  #else
    c = mix(c, uHaze, clamp(f * uHazeAmt + (1.0 - edgeF), 0.0, 1.0));
  #endif
  ${GRADE_APPLY}
  c *= uDim;
  c = mix(c, c * vec3(1.6, 0.5, 0.38) + vec3(0.03, 0.0, 0.0), uMelt);
  if (uClassic > 0.5) {
    c = floor(c * 5.0 + 0.5) / 5.0;
    #ifdef ADDITIVE
      if (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0 && dot(c, vec3(0.33)) < 0.25) discard;
    #endif
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const GLASS_VERT = /* glsl */ `
varying vec3 vCol;
varying vec3 vW;
void main() {
  vCol = color;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Fresnel-style rim plus diagonal reflection streaks that slide with the camera (fake parallax reflection).
const GLASS_FRAG = /* glsl */ `
uniform float uClassic;
uniform vec3 uRefl;
uniform float uGlassGrade;
varying vec3 vCol;
varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float fres = pow(1.0 - clamp(V.z, 0.0, 1.0), 1.5);
  float d = vW.x * 0.55 + vW.y * 0.9 + cameraPosition.x * 0.35;
  float streak = smoothstep(0.82, 1.0, sin(d * 0.9)) * 0.5 + smoothstep(0.9, 1.0, sin(d * 0.37 + 1.3)) * 0.5;
  float a = 0.045 + fres * 0.9 + streak * 0.12;
  vec3 base = mix(vCol, uRefl * dot(vCol, vec3(0.333)) * 1.5, uGlassGrade);
  vec3 c = base * (0.35 + streak * 0.9) + uRefl * fres * 0.4;
  if (uClassic > 0.5) {
    a = 0.05;
    c = vCol * 0.4;
  }
  gl_FragColor = vec4(c, clamp(a, 0.0, 0.5));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

interface SectorVista {
  data: VistaData;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  melt: { value: number };
  dim: { value: number };
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Stage 2 Foundry (soot, ember, furnace glow) and Stage 3 Reactor (deep navy, cold blue, ice). Stage 1 keeps its sector palettes. */
export const STAGE_RAMP: Record<number, { a: number; b: number; c: number; haze: number; grade: number } | undefined> = {
  2: { a: 0x0c0605, b: 0x7a2a0c, c: 0xffa24a, haze: 0x1c0d07, grade: 0.88 },
  3: { a: 0x040810, b: 0x1c4f9a, c: 0xb4e0ff, haze: 0x08182e, grade: 0.88 },
};

export function buildVista3D(scene: THREE.Scene, level: Level3D): Vista3D {
  const root = new THREE.Group();
  root.name = 'vista3d';
  scene.add(root);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const uTime = { value: 0 };
  const uReduce = { value: 0 };
  const uClassic = { value: 0 };

  const frameMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.6 }));
  const refl = new THREE.Color(level.stage?.id === 2 ? 0xff9a52 : level.stage?.id === 3 ? 0x6aa8ff : 0x000000);
  // Stage 1 keeps the original raw cool-blue reflection (0.6, 0.75, 0.9) exactly.
  if (!level.stage) refl.setRGB(0.6, 0.75, 0.9, THREE.LinearSRGBColorSpace);
  const glassMat = track(
    new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      uniforms: {
        uClassic,
        uRefl: { value: refl },
        uGlassGrade: { value: level.stage ? 0.85 : 0 },
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
  );

  const sectors: SectorVista[] = [];
  for (const data of layoutAllVistas(level)) {
    const room = level.rooms.find((r) => r.id === data.roomId);
    if (!room) continue;
    const group = new THREE.Group();
    group.name = `vista:${data.sector}`;
    const meshes: THREE.Mesh[] = [];
    const melt = { value: 0 };
    const dim = { value: 0.55 };
    const common = { uTime, uReduce, uClassic, uMelt: melt, uDim: dim, uClip: { value: new THREE.Vector4(...data.clip) } };
    const ramp = STAGE_RAMP[level.stage?.id ?? 1];
    const shader = (additive: boolean): THREE.ShaderMaterial =>
      track(
        new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: VISTA_FRAG,
          defines: additive ? { ADDITIVE: '' } : {},
          uniforms: { ...common, uHaze: { value: new THREE.Color(ramp ? ramp.haze : VISTA_HAZE[data.sector]) },
            uHazeAmt: { value: additive ? 0 : 0.75 },
            uRampA: { value: new THREE.Color(ramp ? ramp.a : 0) },
            uRampB: { value: new THREE.Color(ramp ? ramp.b : 0) },
            uRampC: { value: new THREE.Color(ramp ? ramp.c : 0) },
            uGrade: { value: ramp ? ramp.grade : 0 },
          },
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: additive,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: !additive,
        }),
      );
    const add = (mesh: THREE.Mesh, name: string, order: number): void => {
      mesh.name = `vista-${name}:${data.sector}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      group.add(mesh);
      meshes.push(mesh);
    };
    const sil = new THREE.Mesh(track(toBufferGeometry(data.sil, true)), shader(false));
    add(sil, 'sil', -2);
    const glow = new THREE.Mesh(track(toBufferGeometry(data.glow, true)), shader(true));
    add(glow, 'glow', -1);
    const frames = new THREE.Mesh(track(toBufferGeometry(data.frames, false)), frameMat);
    frames.receiveShadow = true;
    add(frames, 'frame', 0);
    if (data.glass) add(new THREE.Mesh(track(toBufferGeometry(data.glass, false)), glassMat), 'glass', 3);
    root.add(group);
    sectors.push({ data, group, meshes, melt, dim, minX: room.minX, maxX: room.maxX, minY: room.minY, maxY: room.maxY });
  }

  let activeSector: SectorId3D | null = null;
  let lastT = 0;
  let meltLevel = 0;

  return {
    update(tSec: number, u: VistaUpdate): void {
      const dt = Math.min(0.1, Math.max(0, tSec - lastT));
      lastT = tSec;
      uTime.value = tSec;
      uReduce.value = u.reduce ? 1 : 0;
      meltLevel += ((u.meltdown ? 1 : 0) - meltLevel) * Math.min(1, dt * 1.2);
      activeSector = null;
      for (const s of sectors) {
        s.melt.value = s.data.sector === 'core' ? meltLevel : meltLevel * 0.4;
        if (u.playerX >= s.minX && u.playerX <= s.maxX && u.playerY >= s.minY - 1 && u.playerY <= s.maxY + 1) activeSector = s.data.sector;
      }
      // R24: calm background. Neighbour sectors seen past the room edge (the flat haze patch under Bio-Labs) sit well below the active vista.
      for (const s of sectors) {
        const want = s.data.sector === activeSector ? 0.82 : 0.3;
        s.dim.value += (want - s.dim.value) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
      }
    },
    setView(minX: number, maxX: number, minY: number, maxY: number): void {
      for (const s of sectors) s.group.visible = s.maxX >= minX && s.minX <= maxX && s.maxY >= minY && s.minY <= maxY;
    },
    setClassic(on: boolean): void {
      uClassic.value = on ? 1 : 0;
    },
    telemetry(): VistaTelemetry {
      let drawCalls = 0;
      for (const s of sectors) if (s.group.visible) drawCalls += s.meshes.length;
      const act = sectors.find((s) => s.data.sector === activeSector);
      return { sector: activeSector, visible: act ? act.group.visible : false, drawCalls };
    },
    dispose(): void {
      scene.remove(root);
      for (const d of disposables) d.dispose();
      root.clear();
      sectors.length = 0;
    },
  };
}

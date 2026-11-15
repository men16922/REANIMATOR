// Ambient life renderer: far silhouettes, additive event glow and one pooled Points mesh per sector (3 draw calls).
// Display only: reads nothing from the sim beyond player position, the Meltdown flag and Reduce motion, adds no lights.
// Animation runs in the vertex shaders from a CPU clock that slows under Reduce and speeds up under Meltdown, so
// toggling either never makes the scene jump. Hidden sectors are culled with the decor view window.
import * as THREE from 'three';
import type { Level3D, SectorId3D } from '../game3d/types3d.ts';
import { toBufferGeometry } from './vistaGeo.ts';
import { VISTA_HAZE } from './vistaScenes.ts';
import { layoutAllAmbient, type AmbientData } from './ambientScenes.ts';

export interface AmbientTelemetry {
  sector: SectorId3D | null;
  visible: boolean;
  drawCalls: number;
  /** Ambient events placed in the sector the player is in. */
  events: number;
  /** Pooled points in that sector. */
  points: number;
}

export interface AmbientUpdate {
  playerX: number;
  playerY: number;
  reduce: boolean;
  meltdown: boolean;
  /** Drawing-buffer height in px; point sizes scale with it (default 900). */
  viewH?: number;
}

export interface Ambient3D {
  update(tSec: number, u: AmbientUpdate): void;
  setView(minX: number, maxX: number, minY: number, maxY: number): void;
  setClassic(on: boolean): void;
  telemetry(): AmbientTelemetry;
  dispose(): void;
}

const VERT = /* glsl */ `
attribute vec4 aA;
attribute vec3 aP;
uniform float uClock;
uniform float uReduce;
uniform float uMelt;
varying vec3 vCol;
varying float vB;
varying vec3 vW;
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec2 rot(vec2 d, float a) { return vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a)); }
void main() {
  vec3 p = position;
  float m = floor(aA.x + 0.5);
  float ph = aA.y;
  float sp = aA.z;
  float am = aA.w;
  float t = uClock;
  float b = 1.0;
  if (m == 1.0) {
    p.x += fract(t * sp + ph) * am - am * 0.5;
  } else if (m == 2.0) {
    float a = am * sin(t * sp + ph) * mix(1.0, 0.35, uReduce);
    p.xy = aP.xy + rot(p.xy - aP.xy, a);
  } else if (m == 3.0) {
    p.xy = aP.xy + rot(p.xy - aP.xy, ph + t * sp);
  } else if (m == 4.0) {
    b = uReduce > 0.5 ? 0.75 : (fract(t * sp + ph) < 0.5 ? 1.0 : 0.12);
  } else if (m == 5.0) {
    b = 0.65 + 0.35 * sin(t * sp + ph);
  } else if (m == 6.0) {
    float k = floor(t * sp + ph);
    float f = fract(t * sp + ph);
    b = (uReduce > 0.5 || hash11(k) < 0.72) ? 0.0 : pow(1.0 - f, 6.0) * (0.6 + 0.4 * step(0.5, fract(f * 9.0)));
  } else if (m == 7.0) {
    p.x += am * sin(t * sp + ph);
  } else if (m == 8.0) {
    p.y += am * sin(t * sp + ph);
    b = 0.6 + 0.4 * sin(t * sp * 1.7 + ph);
  } else if (m == 9.0) {
    b = uReduce > 0.5 ? 0.85 : (hash11(floor(t * sp + ph)) > 0.82 ? 0.15 : 0.85);
  } else if (m == 10.0) {
    float a = ph + t * sp;
    vec3 d = p - aP;
    p.x = aP.x + d.x * cos(a) + d.z * sin(a);
    p.z = aP.z - d.x * sin(a) + d.z * cos(a);
  } else if (m == 11.0) {
    p = aP + (p - aP) * (1.0 + am * sin(t * sp + ph));
  }
  vCol = color;
  vB = b;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uHaze;
uniform float uHazeAmt;
uniform float uMelt;
uniform float uClassic;
uniform vec4 uClip;
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
    c *= (1.0 - 0.5 * f) * edgeF;
  #else
    c = mix(c, uHaze, clamp(f * uHazeAmt + (1.0 - edgeF), 0.0, 1.0));
  #endif
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

const PT_VERT = /* glsl */ `
attribute vec4 aK;
attribute vec4 aB;
uniform float uClock;
uniform float uReduce;
uniform float uMelt;
uniform float uPx;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vW;
void main() {
  float kind = floor(aK.x + 0.5);
  float ph = aK.y;
  float sp = aK.z;
  float size = aK.w;
  float t = uClock;
  vec2 box = aB.xy;
  vec2 vel = aB.zw;
  vec3 p = position;
  float alpha = 1.0;
  float sz = size;
  if (kind == 5.0) {
    float c = fract(t * sp * 0.35 + ph);
    float live = step(c, 0.3) * (1.0 - uMelt) * (uReduce > 0.5 ? 0.0 : 1.0);
    float u = c / 0.3;
    vec2 d = vec2(vel.x * (ph - 0.5) * 2.0, vel.y * (0.4 + ph * 0.6)) * u * 0.5 + vec2(0.0, -2.4) * u * u * 0.5;
    p.xy += d;
    alpha = live * (1.0 - u);
  } else {
    vec2 s = (vel * t + vec2(ph * 13.7, fract(ph * 7.31) * box.y)) ;
    vec2 w = fract(s / box) - 0.5;
    p.xy += w * box;
    float life = fract(s.y / box.y);
    if (kind == 0.0) {
      alpha = 0.35 + 0.35 * sin(t * sp + ph * 40.0);
      p.x += 0.2 * sin(t * sp * 0.5 + ph * 30.0);
    } else if (kind == 2.0) {
      alpha = sin(3.14159 * life) * 0.55;
      sz = size * (0.6 + life * 1.6);
      p.x += 0.35 * sin(t * sp * 0.6 + ph * 30.0) * life;
    } else if (kind == 3.0) {
      alpha = sin(3.14159 * life) * 0.8;
      p.x += 0.12 * sin(t * sp * 2.0 + ph * 30.0);
    } else {
      alpha = 0.8;
    }
  }
  vCol = color;
  vAlpha = alpha;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, sz * uPx / max(0.5, -mv.z));
}
`;

const PT_FRAG = /* glsl */ `
uniform float uMelt;
uniform float uClassic;
uniform vec4 uClip;
varying vec3 vCol;
varying float vAlpha;
varying vec3 vW;
void main() {
  if (vAlpha <= 0.002) discard;
  if (vW.x < uClip.x || vW.x > uClip.y || vW.y < uClip.z || vW.y > uClip.w) discard;
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float soft = uClassic > 0.5 ? 1.0 : 1.0 - r * r;
  vec3 c = vCol * vAlpha * soft;
  c = mix(c, c * vec3(1.6, 0.5, 0.38), uMelt);
  if (uClassic > 0.5) c = floor(c * 5.0 + 0.5) / 5.0;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Pixels per metre at 1 m distance for the point-size attenuation (900 px tall view, 38 deg fov). */
const POINT_PX = 1300;

/** Point-size scale for a drawing buffer of viewH px tall (1300 at the 900 px reference). */
export function pointPxFor(viewH: number | undefined): number {
  const h = viewH && Number.isFinite(viewH) && viewH > 0 ? viewH : 900;
  return (POINT_PX * h) / 900;
}

interface SectorAmbient {
  data: AmbientData;
  group: THREE.Group;
  meshes: THREE.Object3D[];
  melt: { value: number };
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function buildAmbient3D(scene: THREE.Scene, level: Level3D): Ambient3D {
  const root = new THREE.Group();
  root.name = 'ambient3d';
  scene.add(root);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const uClock = { value: 0 };
  const uReduce = { value: 0 };
  const uPx = { value: POINT_PX };
  const uClassic = { value: 0 };

  const sectors: SectorAmbient[] = [];
  for (const data of layoutAllAmbient(level)) {
    const room = level.rooms.find((r) => r.id === data.roomId);
    if (!room) continue;
    const group = new THREE.Group();
    group.name = `ambient:${data.sector}`;
    const meshes: THREE.Object3D[] = [];
    const melt = { value: 0 };
    const clip = { value: new THREE.Vector4(...data.clip) };
    const common = { uClock, uReduce, uClassic, uMelt: melt, uClip: clip };
    const shader = (additive: boolean): THREE.ShaderMaterial =>
      track(
        new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          defines: additive ? { ADDITIVE: '' } : {},
          uniforms: { ...common, uHaze: { value: new THREE.Color(VISTA_HAZE[data.sector]) }, uHazeAmt: { value: additive ? 0 : 0.7 } },
          vertexColors: true,
          side: THREE.DoubleSide,
          transparent: additive,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: !additive,
        }),
      );
    const add = (o: THREE.Object3D, name: string, order: number): void => {
      o.name = `ambient-${name}:${data.sector}`;
      o.frustumCulled = false;
      o.renderOrder = order;
      group.add(o);
      meshes.push(o);
    };
    add(new THREE.Mesh(track(toBufferGeometry(data.far, true)), shader(false)), 'far', -1.5);
    add(new THREE.Mesh(track(toBufferGeometry(data.ev, true)), shader(true)), 'event', -0.5);
    const pg = track(new THREE.BufferGeometry());
    pg.setAttribute('position', new THREE.BufferAttribute(data.pts.pos, 3));
    pg.setAttribute('aK', new THREE.BufferAttribute(data.pts.kind, 4));
    pg.setAttribute('aB', new THREE.BufferAttribute(data.pts.box, 4));
    pg.setAttribute('color', new THREE.BufferAttribute(data.pts.col, 3));
    const pm = track(
      new THREE.ShaderMaterial({
        vertexShader: PT_VERT,
        fragmentShader: PT_FRAG,
        uniforms: { ...common, uPx },
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    add(new THREE.Points(pg, pm), 'points', 1);
    root.add(group);
    sectors.push({ data, group, meshes, melt, minX: room.minX, maxX: room.maxX, minY: room.minY, maxY: room.maxY });
  }

  let activeSector: SectorId3D | null = null;
  let lastT = 0;
  let meltLevel = 0;

  return {
    update(tSec: number, u: AmbientUpdate): void {
      const dt = Math.min(0.1, Math.max(0, tSec - lastT));
      lastT = tSec;
      uReduce.value = u.reduce ? 1 : 0;
      uPx.value = pointPxFor(u.viewH);
      meltLevel += ((u.meltdown ? 1 : 0) - meltLevel) * Math.min(1, dt * 1.2);
      uClock.value += dt * (u.reduce ? 0.4 : 1) * (1 + meltLevel * 0.8);
      activeSector = null;
      for (const s of sectors) {
        s.melt.value = s.data.sector === 'core' ? meltLevel : meltLevel * 0.4;
        if (u.playerX >= s.minX && u.playerX <= s.maxX && u.playerY >= s.minY - 1 && u.playerY <= s.maxY + 1) activeSector = s.data.sector;
      }
    },
    setView(minX: number, maxX: number, minY: number, maxY: number): void {
      for (const s of sectors) s.group.visible = s.maxX >= minX && s.minX <= maxX && s.maxY >= minY && s.minY <= maxY;
    },
    setClassic(on: boolean): void {
      uClassic.value = on ? 1 : 0;
    },
    telemetry(): AmbientTelemetry {
      let drawCalls = 0;
      for (const s of sectors) if (s.group.visible) drawCalls += s.meshes.length;
      const act = sectors.find((s) => s.data.sector === activeSector);
      return { sector: activeSector, visible: act ? act.group.visible : false, drawCalls, events: act ? act.data.events.length : 0, points: act ? act.data.pts.count : 0 };
    },
    dispose(): void {
      scene.remove(root);
      for (const d of disposables) d.dispose();
      root.clear();
      sectors.length = 0;
    },
  };
}

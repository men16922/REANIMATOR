// GPU side of the game-feel layer: instanced particle quads (2 draw calls: additive + alpha) and one merged
// post pass (vignette, chromatic aberration, grain, colour grade, low-HP pulse). No lights are added.

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { ParticlePool, PostParams } from './fx3d.ts';

const VERT = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aCol;
attribute vec2 aMisc;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vUv = uv;
  vCol = aCol;
  vec2 q = position.xy;
  q.x *= aMisc.y;
  float c = cos(aMisc.x);
  float s = sin(aMisc.x);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * aPos.w;
  vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform float uHard;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vec2 d = vUv - 0.5;
  float soft = 1.0 - smoothstep(0.0, 0.5, length(d));
  float box = (1.0 - smoothstep(0.38, 0.5, abs(d.x))) * (1.0 - smoothstep(0.38, 0.5, abs(d.y)));
  float m = mix(soft * soft, box, uHard);
  gl_FragColor = vec4(vCol.rgb, vCol.a * m);
}
`;

/** One pool rendered as a single instanced draw. */
export class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;

  constructor(private readonly pool: ParticlePool, additive: boolean, hard: boolean) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(pool.aPos, 4);
    this.aCol = new THREE.InstancedBufferAttribute(pool.aCol, 4);
    this.aMisc = new THREE.InstancedBufferAttribute(pool.aMisc, 2);
    for (const a of [this.aPos, this.aCol, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aCol', this.aCol);
    this.geo.setAttribute('aMisc', this.aMisc);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uHard: { value: hard ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 19;
    this.mesh.name = additive ? 'fx-particles-add' : 'fx-particles-alpha';
  }

  /** Pack the pool and flag GPU upload. */
  sync(): void {
    const n = this.pool.write();
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aMisc.needsUpdate = true;
  }
}

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime, uVig, uChroma, uGrain, uSat, uContrast, uLowHp, uPulse;
uniform vec3 uGain, uLift, uFlash;
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  // Near-zero at rest (sub-pixel at the edges); only the hit/explosion kick (uChroma) splits the channels visibly.
  float k = 0.0002 + uChroma * 0.006;
  vec2 off = c * k * (0.35 + r2 * 3.0);
  vec3 col;
  col.r = texture2D(tDiffuse, vUv + off).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv - off).b;

  col = col * uGain + uLift;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;

  float edge = smoothstep(0.18, 0.62, length(c * vec2(1.0, 1.05)));
  col *= 1.0 - uVig * edge;
  // low-HP: red pulsing vignette
  float hurt = uLowHp * uPulse * smoothstep(0.1, 0.6, length(c));
  col = mix(col, col * vec3(1.0, 0.25, 0.2) + vec3(0.18, 0.0, 0.0) * hurt, hurt * 0.85);

  float g = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain * (1.15 - l);
  col += uFlash;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

export function createPostPass(): ShaderPass {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVig: { value: 0.45 },
      uChroma: { value: 0 },
      uGrain: { value: 0.04 },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uLowHp: { value: 0 },
      uPulse: { value: 0 },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uFlash: { value: new THREE.Vector3(0, 0, 0) },
    },
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
  });
}

export function applyPostParams(pass: ShaderPass, p: PostParams, tSec: number): void {
  const u = pass.uniforms;
  u.uTime.value = tSec;
  u.uVig.value = p.vignette;
  u.uChroma.value = p.chroma;
  u.uGrain.value = p.grain;
  u.uSat.value = p.sat;
  u.uContrast.value = p.contrast;
  u.uLowHp.value = p.lowHp;
  u.uPulse.value = p.pulse;
  (u.uGain.value as THREE.Vector3).set(p.gain[0], p.gain[1], p.gain[2]);
  (u.uLift.value as THREE.Vector3).set(p.lift[0], p.lift[1], p.lift[2]);
  (u.uFlash.value as THREE.Vector3).set(p.flash[0], p.flash[1], p.flash[2]);
}

// ---- Blast materials (R4): noise fireball, shock ring, ground wave. All additive, no lights, no wireframe. ----

const BLAST_NOISE = /* glsl */ `
float bh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bn(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1,0,0)), f.x), mix(bh(i + vec3(0,1,0)), bh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(bh(i + vec3(0,0,1)), bh(i + vec3(1,0,1)), f.x), mix(bh(i + vec3(0,1,1)), bh(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float bfbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * bn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
`;

const FIREBALL_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
uniform float uP;
uniform float uSeed;
${BLAST_NOISE}
void main() {
  vObj = position;
  // Lumpy surface that boils outward, so the silhouette is never a clean sphere.
  float lump = bfbm(position * 2.1 + vec3(0.0, -uP * 2.0, uSeed)) - 0.45;
  vec3 pos = position * (1.0 + lump * 0.55);
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FIREBALL_FRAG = /* glsl */ `
varying vec3 vObj;
varying vec3 vN;
uniform float uP;
uniform float uSeed;
uniform vec3 uTint;
${BLAST_NOISE}
void main() {
  float n = smoothstep(0.2, 0.85, bfbm(vObj * 3.4 + vec3(0.0, -uP * 2.4, uSeed)));
  float facing = clamp(vN.z, 0.0, 1.0);
  float core = pow(facing, 0.8);
  // Burn-off: the noise threshold climbs with age so the ball breaks up into embers instead of fading evenly.
  float cut = uP * 0.95;
  float a = smoothstep(cut, cut + 0.22, n * 0.75 + core * 0.4);
  float heat = clamp((n * 0.75 + core * 0.3 - 0.1) * (1.05 - uP * 0.8), 0.0, 1.0);
  vec3 ember = vec3(0.35, 0.05, 0.02);
  vec3 fire = mix(ember, vec3(1.0, 0.45, 0.08), smoothstep(0.1, 0.5, heat));
  fire = mix(fire, vec3(1.0, 0.92, 0.6), smoothstep(0.7, 1.0, heat) * 0.8);
  fire = mix(fire, fire * uTint * 1.6, 0.35);
  gl_FragColor = vec4(fire * (0.85 - 0.4 * uP), a * (1.0 - uP * uP));
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const RING_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uP;
uniform vec3 uTint;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float front = 1.0 - pow(1.0 - min(1.0, uP * 1.5), 2.0);
  float w = 0.05 + 0.09 * (1.0 - uP);
  float band = smoothstep(w, 0.0, abs(r - front * 0.96));
  float tail = smoothstep(front * 0.96, front * 0.6, r) * 0.18 * step(r, front * 0.96);
  float ang = atan(d.y, d.x);
  float jag = 0.8 + 0.2 * sin(ang * 13.0 + uP * 9.0);
  float a = (band * jag + tail) * (1.0 - uP) * (1.0 - uP);
  gl_FragColor = vec4(mix(vec3(1.0, 0.85, 0.6), uTint, 0.5) * 0.9, a * 0.8);
}
`;

const WAVE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uT;
uniform vec3 uTint;
float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
void main() {
  // u runs tail (0) to leading edge (1); v runs floor (0) to crest (1).
  float u = vUv.x;
  float v = vUv.y;
  float crest = 0.35 + 0.65 * u;
  float flick = n2(vec2(v * 5.0 - uT * 7.0, u * 4.0)) * 0.5 + n2(vec2(v * 11.0, u * 8.0 - uT * 9.0)) * 0.5;
  float body = smoothstep(crest + 0.15 * flick, crest * 0.4, v) * smoothstep(0.0, 0.5, u);
  float edge = smoothstep(0.78, 0.97, u) * smoothstep(1.0, 0.0, v * 1.1);
  float a = clamp(body * 0.85 + edge * 0.9, 0.0, 1.0) * (0.75 + 0.25 * flick);
  vec3 col = mix(uTint, vec3(1.0, 0.92, 0.7), edge);
  gl_FragColor = vec4(col * 1.3, a);
}
`;

function blastMaterial(vert: string, frag: string, uniforms: Record<string, THREE.IUniform>, side: THREE.Side = THREE.FrontSide): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side });
}

/** Noise fireball for a sphere of radius 1 (progress uP 0..1). */
export function createFireballMaterial(color: number, seed: number): THREE.ShaderMaterial {
  return blastMaterial(FIREBALL_VERT, FIREBALL_FRAG, { uP: { value: 0 }, uSeed: { value: seed }, uTint: { value: new THREE.Color(color) } });
}

/** Expanding shock ring on a unit plane. */
export function createShockRingMaterial(color: number): THREE.ShaderMaterial {
  return blastMaterial(RING_VERT, RING_FRAG, { uP: { value: 0 }, uTint: { value: new THREE.Color(color) } }, THREE.DoubleSide);
}

/** Floor shock wave (boss slam) on a plane: leading edge at u = 1. */
export function createGroundWaveMaterial(color: number): THREE.ShaderMaterial {
  return blastMaterial(RING_VERT, WAVE_FRAG, { uT: { value: 0 }, uTint: { value: new THREE.Color(color) } }, THREE.DoubleSide);
}

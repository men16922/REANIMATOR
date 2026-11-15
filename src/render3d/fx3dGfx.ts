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
uniform vec3 uGain, uLift;
varying vec2 vUv;
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  float k = 0.0030 + uChroma * 0.020;
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
}

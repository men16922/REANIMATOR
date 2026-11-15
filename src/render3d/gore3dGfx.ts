// GPU side of the gore: one InstancedMesh for chunks and one instanced decal draw. No lights are added.

import * as THREE from 'three';
import { decalFade, type ChunkPool, type DecalPool } from './gore3d.ts';

/** Meat chunks: low-poly instanced icosahedra, lit by the scene so they fall into shadow like everything else. */
export class ChunkLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly col = new THREE.Color();

  constructor(private readonly pool: ChunkPool) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.08, flatShading: true });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), mat, pool.capacity);
    this.mesh.name = 'gore-chunks';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.col.setRGB(1, 1, 1)); // allocate instanceColor before the first render
    (this.mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
  }

  sync(): void {
    const p = this.pool;
    const n = p.count;
    for (let i = 0; i < n; i++) {
      const k = p.scaleOf(i);
      const pop = Math.min(1, p.age[i] * 14);
      const s = k * pop;
      this.dummy.position.set(p.x[i], p.y[i], p.z[i]);
      this.dummy.rotation.set(p.rx[i], p.ry[i], 0);
      this.dummy.scale.set(p.sx[i] * s, p.sy[i] * s, p.sz[i] * s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.col.setRGB(p.r[i], p.g[i], p.b[i]));
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

const DECAL_VERT = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aCol;
attribute vec2 aMisc;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vUv = uv;
  vCol = aCol;
  vec2 q = position.xy * aPos.w;
  float c = cos(aMisc.x);
  float s = sin(aMisc.x);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec3 p = aMisc.y > 0.5 ? vec3(q.x * 1.5, 0.0, -q.y * 0.55) : vec3(q.x, q.y, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos.xyz + p, 1.0);
}
`;

const DECAL_FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vCol;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vCol.a;
  if (a < 0.01) discard;
  // darker rim and a wet glint toward the middle
  vec3 col = vCol.rgb * (0.55 + 0.5 * t.r) + vec3(0.06) * smoothstep(0.7, 1.0, t.r);
  gl_FragColor = vec4(col, a * 0.92);
}
`;

function makeSplatTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  // main blot with a ragged edge
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  const pts = 18;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const r = 26 + rnd() * 16;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // streaks and droplets
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 30 + rnd() * 28;
    const r = 1.5 + rnd() * 5;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = r * 0.8;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28);
    ctx.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Splatter decals (floor and back wall) in one instanced draw. */
export class DecalLayer {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly map: THREE.CanvasTexture;

  constructor(private readonly pool: DecalPool) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(pool.capacity * 4), 4);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(pool.capacity * 4), 4);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(pool.capacity * 2), 2);
    for (const a of [this.aPos, this.aCol, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.aPos);
    this.geo.setAttribute('aCol', this.aCol);
    this.geo.setAttribute('aMisc', this.aMisc);
    this.geo.instanceCount = 0;
    this.map = makeSplatTexture();
    const mat = new THREE.ShaderMaterial({
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      uniforms: { uMap: { value: this.map } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'gore-decals';
  }

  sync(): void {
    const p = this.pool;
    const n = p.count;
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const misc = this.aMisc.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o4 = i * 4;
      const grow = Math.min(1, p.age[i] * 5); // splat spreads out quickly
      pos[o4] = p.x[i]; pos[o4 + 1] = p.y[i]; pos[o4 + 2] = p.z[i];
      pos[o4 + 3] = p.size[i] * (0.4 + 0.6 * grow);
      col[o4] = p.r[i]; col[o4 + 1] = p.g[i]; col[o4 + 2] = p.b[i];
      col[o4 + 3] = decalFade(p.age[i], p.life[i]);
      misc[i * 2] = p.rot[i];
      misc[i * 2 + 1] = p.floor[i];
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aMisc.needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.map.dispose();
  }
}

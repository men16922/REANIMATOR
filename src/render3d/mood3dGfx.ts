// GPU side of the lighting script. Everything is emissive and additive (no lights): one instanced draw for the
// lamp light shafts plus floor light pools, one for the rotating warning beacons. Flicker is a per-instance level.

import * as THREE from 'three';
import type { Level3D } from '../game3d/types3d.ts';
import { layoutAllDecor } from './decor3d.ts';
import { beaconAngle, flickerLevel, floorBelow, isLampProp, lampMode, lampSeed, type LampMode } from './mood3d.ts';

const LAMP_VERT = /* glsl */ `
attribute float aPart;
attribute vec4 aPos;
attribute vec4 aShape;
attribute vec3 aCol;
varying vec4 vCol;
varying vec3 vUvPart;
void main() {
  vec2 u = position.xy + 0.5;
  vUvPart = vec3(u, aPart);
  vCol = vec4(aCol, aShape.w);
  vec3 p;
  if (aPart < 0.5) {
    float v = 1.0 - u.y;
    p = vec3((u.x - 0.5) * mix(0.5, aShape.x, v), -v * aPos.w, 0.12);
  } else {
    // floor pool: centred on the z=0 lane, lying on the floor found under the lamp
    p = vec3((u.x - 0.5) * aShape.y, -aPos.w + 0.05, -aPos.z + (u.y - 0.5) * 2.8);
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos.xyz + p, 1.0);
}
`;

const LAMP_FRAG = /* glsl */ `
varying vec4 vCol;
varying vec3 vUvPart;
void main() {
  vec2 u = vUvPart.xy;
  float a;
  if (vUvPart.z < 0.5) {
    float v = 1.0 - u.y;
    a = pow(1.0 - v, 1.4) * smoothstep(0.5, 0.12, abs(u.x - 0.5)) * 0.2;
  } else {
    float d = length((u - 0.5) * 2.0);
    a = pow(max(0.0, 1.0 - d), 1.6) * 0.34;
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`;

const BEACON_VERT = /* glsl */ `
attribute vec4 aPos;
attribute vec4 aCol;
varying vec2 vUv;
varying vec4 vCol;
varying float vAng;
void main() {
  vUv = position.xy * 2.0;
  vCol = aCol;
  vAng = aPos.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos.xyz + vec3(position.xy * 9.0, 0.0), 1.0);
}
`;

const BEACON_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vAng;
void main() {
  float d = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  float beam = pow(max(0.0, cos(ang - vAng)), 8.0) + pow(max(0.0, cos(ang - vAng - 3.14159)), 8.0);
  float falloff = pow(max(0.0, 1.0 - d), 1.3);
  float lamp = smoothstep(0.1, 0.0, d) * 1.4;
  float a = (beam * falloff * 0.55 + lamp) * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`;

interface LampSlot {
  index: number;
  mode: LampMode;
  seed: number;
  base: number;
}

export interface Mood3D {
  update(tSec: number, reduce: boolean): void;
  /** Number of lamp shafts and beacons built (telemetry / tests). */
  readonly lampCount: number;
  readonly beaconCount: number;
  dispose(): void;
}

export function buildMood3D(scene: THREE.Scene, level: Level3D): Mood3D {
  const layouts = layoutAllDecor(level);
  const col = new THREE.Color();

  // ---- lamp shafts + floor pools ----
  const lamps: { x: number; y: number; z: number; len: number; width: number; pool: number; color: number; mode: LampMode; seed: number; base: number }[] = [];
  for (const lay of layouts) {
    const room = level.rooms.find((r) => r.id === lay.roomId);
    if (!room) continue;
    for (const p of lay.props) {
      if (!isLampProp(p)) continue;
      const floor = floorBelow(level.solids, p.x, p.y, room.minY);
      const len = Math.min(7, Math.max(1.6, p.y - p.sy * 0.5 - floor));
      const seed = lampSeed(p.x, p.y);
      lamps.push({
        x: p.x, y: p.y - p.sy * 0.5, z: p.z + 0.2, len,
        width: 1.4 + Math.min(2.4, p.sx * 1.3),
        pool: 2.6 + Math.min(3, p.sx * 1.5),
        color: p.color,
        mode: lampMode(lay.sector, seed),
        seed,
        base: 1,
      });
    }
  }
  const n = lamps.length;
  const partPos = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1));
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4);
  const aShape = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  aShape.setUsage(THREE.DynamicDrawUsage);
  const slots: LampSlot[] = [];
  lamps.forEach((l, i) => {
    aPos.setXYZW(i, l.x, l.y, l.z, l.len);
    col.setHex(l.color);
    // pull the tint toward warm white so rust-orange lamps and cold ones both read as light, not paint
    aCol.setXYZ(i, col.r * 0.8 + 0.2, col.g * 0.8 + 0.2, col.b * 0.8 + 0.2);
    // a capped (very tall) drop has no real floor under it: skip the pool rather than float it in mid air
    aShape.setXYZW(i, l.width, l.len >= 7 ? 0 : l.pool, 0, 1);
    if (l.mode !== 'steady') slots.push({ index: i, mode: l.mode, seed: l.seed, base: l.base });
  });
  geo.setAttribute('aPos', aPos);
  geo.setAttribute('aShape', aShape);
  geo.setAttribute('aCol', aCol);
  geo.instanceCount = n;
  const lampMat = new THREE.ShaderMaterial({
    vertexShader: LAMP_VERT,
    fragmentShader: LAMP_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const lampMesh = new THREE.Mesh(geo, lampMat);
  lampMesh.frustumCulled = false;
  lampMesh.renderOrder = 6;
  lampMesh.name = 'mood-lamps';
  lampMesh.visible = n > 0;
  scene.add(lampMesh);

  // ---- rotating warning beacons (security deck and core vault) ----
  const beacons: { x: number; y: number; seed: number; r: number; g: number; b: number }[] = [];
  for (const room of level.rooms) {
    if (room.sector !== 'security' && room.sector !== 'core') continue;
    const step = room.sector === 'core' ? 12 : 16;
    for (let x = room.minX + 6; x < room.maxX - 3; x += step) {
      const seed = lampSeed(x, room.maxY);
      beacons.push(room.sector === 'core'
        ? { x, y: room.maxY - 1.4, seed: seed % 6, r: 1.0, g: 0.42, b: 0.12 }
        : { x, y: room.maxY - 1.4, seed: seed % 6, r: 1.0, g: 0.12, b: 0.1 });
    }
  }
  const bn = beacons.length;
  const bGeo = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  bGeo.index = base.index;
  bGeo.setAttribute('position', base.getAttribute('position'));
  const bPos = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, bn) * 4), 4);
  const bCol = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, bn) * 4), 4);
  bPos.setUsage(THREE.DynamicDrawUsage);
  bCol.setUsage(THREE.DynamicDrawUsage);
  beacons.forEach((b, i) => {
    bPos.setXYZW(i, b.x, b.y, -1.55, 0);
    bCol.setXYZW(i, b.r, b.g, b.b, 1);
  });
  bGeo.setAttribute('aPos', bPos);
  bGeo.setAttribute('aCol', bCol);
  bGeo.instanceCount = bn;
  const bMesh = new THREE.Mesh(
    bGeo,
    new THREE.ShaderMaterial({
      vertexShader: BEACON_VERT,
      fragmentShader: BEACON_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  bMesh.frustumCulled = false;
  bMesh.renderOrder = 7;
  bMesh.name = 'mood-beacons';
  bMesh.visible = bn > 0;
  scene.add(bMesh);

  return {
    lampCount: n,
    beaconCount: bn,
    update(tSec: number, reduce: boolean): void {
      const sh = aShape.array as Float32Array;
      for (const s of slots) sh[s.index * 4 + 3] = flickerLevel(s.mode, s.seed, tSec, reduce) * s.base;
      aShape.needsUpdate = slots.length > 0;
      const bp = bPos.array as Float32Array;
      const bc = bCol.array as Float32Array;
      for (let i = 0; i < bn; i++) {
        bp[i * 4 + 3] = beaconAngle(tSec, beacons[i].seed, reduce);
        bc[i * 4 + 3] = reduce ? 0.55 + 0.1 * Math.sin(tSec * 0.9) : 1;
      }
      bPos.needsUpdate = bn > 0;
      bCol.needsUpdate = bn > 0;
    },
    dispose(): void {
      scene.remove(lampMesh);
      scene.remove(bMesh);
      geo.dispose();
      bGeo.dispose();
      lampMat.dispose();
      (bMesh.material as THREE.Material).dispose();
    },
  };
}

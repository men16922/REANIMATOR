// Buffer invariants for instanced / merged render meshes (guards GL_INVALID_OPERATION "Vertex buffer is not big enough").
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { buildDecor3D, buildDoorDressingMeshes, DOOR_LAMPS_PER_DOOR } from '../src/render3d/decor3d.ts';

const level = buildFacilityMap3D();
const COLORS = { blue: 1, green: 2, yellow: 3, red: 4, console: 5, escape: 6 };

function checkObject(root: THREE.Object3D): number {
  let meshes = 0;
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g) return;
    meshes++;
    const pos = g.getAttribute('position');
    assert.ok(pos, `${o.name || o.type} has position`);
    for (const [name, a] of Object.entries(g.attributes)) {
      assert.equal(a.count, pos.count, `${o.name || o.type}.${name} count matches position`);
    }
    if (g.index) {
      let max = 0;
      for (let i = 0; i < g.index.count; i++) max = Math.max(max, g.index.getX(i));
      assert.ok(max < pos.count, `${o.name || o.type} index in range`);
    }
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      assert.ok(im.instanceMatrix.count >= im.count, `${o.name || o.type} instanceMatrix >= count`);
      if (im.instanceColor) assert.ok(im.instanceColor.count >= im.count, `${o.name || o.type} instanceColor >= count`);
    }
  });
  return meshes;
}

function stubTex(): never {
  const t = () => new THREE.Texture();
  return new Proxy({}, { get: () => t() }) as never;
}

test('door dressing instance buffers cover every written instance', () => {
  const doors = level.solids.filter((s) => s.kind === 'door' && s.doorId);
  assert.ok(doors.length > 0);
  const dress = buildDoorDressingMeshes(level.solids, stubTex(), COLORS);
  assert.ok(dress);
  assert.equal(dress.lamps.count, doors.length * DOOR_LAMPS_PER_DOOR);
  assert.equal(dress.lamps.instanceMatrix.count, dress.lamps.count);
  assert.equal(dress.signs.count, doors.length);
  const g = new THREE.Group();
  g.add(dress.lamps, dress.signs);
  if (dress.hazard) g.add(dress.hazard);
  checkObject(g);
});

test('decor3d meshes satisfy buffer invariants', () => {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    const scene = new THREE.Scene();
    buildDecor3D(scene, level, stubTex());
    assert.ok(checkObject(scene) > 0);
  } finally {
    g.document = prev;
  }
});

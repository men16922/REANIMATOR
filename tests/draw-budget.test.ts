// Per-sector draw-call budget (code-level estimate, no WebGL). Fails when any sector exceeds 300 or decor adds a light.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { buildDecor3D } from '../src/render3d/decor3d.ts';
import { buildHazards3D } from '../src/render3d/hazards3d.ts';
import { buildAmbient3D } from '../src/render3d/ambient3d.ts';
import { buildVista3D } from '../src/render3d/vista3d.ts';
import { SECTOR_DRAW_BUDGET, estimateSectorDrawCalls, countVisibleMeshes } from '../src/render3d/drawBudget.ts';

const level = buildFacilityMap3D();

function withStubDom<T>(fn: () => T): T {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    return fn();
  } finally {
    g.document = prev;
  }
}

function build() {
  const scene = new THREE.Scene();
  const tex = new Proxy({}, { get: () => new THREE.Texture() }) as never;
  const decor = buildDecor3D(scene, level, tex);
  const vista = buildVista3D(scene, level);
  const ambient = buildAmbient3D(scene, level);
  const hz = buildHazards3D(scene, level);
  const root = (n: string) => scene.getObjectByName(n) as THREE.Object3D;
  return { scene, decor, vista, ambient, hz, parts: { decor, vista, ambient, ambientRoot: root('ambient3d'), decorRoot: root('decor3d'), vistaRoot: root('vista3d'), hazardsRoot: root('hazards3d') } };
}

test('every sector stays within the draw-call budget', () => {
  withStubDom(() => {
    const b = build();
    const est = estimateSectorDrawCalls(level, b.parts);
    assert.equal(est.length, 6);
    for (const e of est) {
      assert.ok(e.total <= SECTOR_DRAW_BUDGET, `${e.sector} estimate ${e.total} > ${SECTOR_DRAW_BUDGET} (${JSON.stringify(e)})`);
      assert.ok(e.solids > 0 && e.decor > 0 && e.vista > 0 && e.ambient > 0, `${e.sector} counts every layer`);
    }
    b.hz.dispose();
  });
});

test('the estimator fails when a sector is over budget (guard is live)', () => {
  withStubDom(() => {
    const b = build();
    // Pile on 300 extra visible meshes under the decor root: the worst sector must now exceed the budget.
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial();
    for (let i = 0; i < 300; i++) b.parts.decorRoot.add(new THREE.Mesh(geo, mat));
    const est = estimateSectorDrawCalls(level, b.parts);
    assert.ok(est.some((e) => e.total > SECTOR_DRAW_BUDGET));
    b.hz.dispose();
  });
});

test('decor adds no lights and scales per room, not per prop', () => {
  withStubDom(() => {
    const b = build();
    let lights = 0;
    b.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) lights++;
    });
    assert.equal(lights, 0, 'decor, vista and hazards add no lights');
    const all = countVisibleMeshes(b.parts.decorRoot).meshes;
    b.decor.setView(0, 1, 0, 1);
    const few = countVisibleMeshes(b.parts.decorRoot).meshes;
    assert.ok(few < all, 'setView culls per-room meshes');
    b.hz.dispose();
  });
});

test('R14 terrain relief is counted, merged per strip, and light-free', () => {
  withStubDom(() => {
    const b = build();
    const est = estimateSectorDrawCalls(level, b.parts);
    for (const e of est) assert.ok(e.terrain >= 0 && e.terrain <= 12, `${e.sector} terrain strips ${e.terrain}`);
    assert.ok(est.some((e) => e.terrain > 0), 'at least one sector carries terrain relief');
    b.hz.dispose();
  });
});

test('R15 terrain kit is counted per sector and stays within its own share', () => {
  withStubDom(() => {
    const b = build();
    const est = estimateSectorDrawCalls(level, b.parts);
    for (const e of est) assert.ok(e.kit > 0 && e.kit <= 16, `${e.sector} kit meshes ${e.kit}`);
    b.hz.dispose();
  });
});

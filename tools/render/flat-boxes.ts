// Diagnostic: lists box meshes that render as a flat colour (MeshBasicMaterial without a map), the "untextured placeholder block"
// look. Builds the node-buildable scene parts with a stubbed canvas, so no WebGL is needed.
// Usage: node tools/render/flat-boxes.ts   (exit 0 always; prints the list. tests/flat-boxes.test.ts pins the result.)
import * as THREE from 'three';
import { buildFacilityMap3D } from '../../src/game3d/map3d.ts';
import { buildDecor3D } from '../../src/render3d/decor3d.ts';
import { buildHazards3D } from '../../src/render3d/hazards3d.ts';
import { buildMetroid3D } from '../../src/render3d/metroid3d.ts';

export interface FlatBox { name: string; owner: string; size: [number, number, number]; color: string; world: [number, number, number] }

/** Meshes with BoxGeometry, a MeshBasicMaterial and no map, whose largest scaled side is at least `minSize` metres. */
export function findFlatBoxes(root: THREE.Object3D, owner: string, minSize = 0.3): FlatBox[] {
  const out: FlatBox[] = [];
  root.updateMatrixWorld(true);
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !(m.geometry instanceof THREE.BoxGeometry)) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshBasicMaterial) || mat.map) continue;
      m.getWorldScale(s);
      const g = m.geometry.parameters;
      const size: [number, number, number] = [g.width * s.x, g.height * s.y, g.depth * s.z];
      if (Math.max(...size) < minSize) continue;
      m.getWorldPosition(p);
      out.push({ name: m.name || '(unnamed)', owner, size, color: '#' + mat.color.getHexString(), world: [p.x, p.y, p.z] });
    }
  });
  return out;
}

/** Builds metroid3d, hazards3d and decor3d over the real level with a stubbed canvas and returns every flat box found. */
export function scanFlatBoxes(minSize = 0.3): FlatBox[] {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    const level = buildFacilityMap3D();
    const found: FlatBox[] = [];
    const parts: [string, (scene: THREE.Scene) => void][] = [
      ['metroid3d', (sc) => buildMetroid3D(sc, level)],
      ['hazards3d', (sc) => buildHazards3D(sc, level)],
      ['decor3d', (sc) => buildDecor3D(sc, level, new Proxy({}, { get: () => new THREE.Texture() }) as never)],
    ];
    for (const [owner, build] of parts) {
      const scene = new THREE.Scene();
      build(scene);
      found.push(...findFlatBoxes(scene, owner, minSize));
    }
    return found;
  } finally {
    g.document = prev;
  }
}

if (process.argv[1] && process.argv[1].endsWith('flat-boxes.ts')) {
  const list = scanFlatBoxes();
  for (const b of list) console.log(`${b.owner}\t${b.name}\t${b.color}\t${b.size.map((v) => v.toFixed(2)).join('x')}\t@${b.world.map((v) => v.toFixed(1)).join(',')}`);
  console.log(`${list.length} flat box(es) >= 0.3 m`);
}

// R9 world dressing: per-sector identity, lane rules for the new props, Meltdown render hook (no WebGL).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import {
  LANE_BACK_Z,
  LANE_FRONT_Z,
  MAX_PROPS_PER_ROOM,
  MELT_SPARKS,
  buildDecor3D,
  layoutAllDecor,
  meltSparkPosition,
  propBounds,
} from '../src/render3d/decor3d.ts';

const level = buildFacilityMap3D();
const layouts = layoutAllDecor(level);

test('each sector layout has a unique prop signature', () => {
  const sig = (l: (typeof layouts)[number]) => new Set(l.props.map((p) => `${p.kind}:${p.color.toString(16)}`));
  const sigs = new Map(layouts.map((l) => [l.sector, sig(l)]));
  assert.equal(sigs.size, 6);
  for (const [sector, mine] of sigs) {
    const unique = [...mine].filter((k) => [...sigs].every(([s, o]) => s === sector || !o.has(k)));
    assert.ok(unique.length >= 6, `${sector} has ${unique.length} sector-only kind:color pairs`);
  }
});

test('sector motifs are present', () => {
  const has = (sector: string, pred: (p: (typeof layouts)[number]['props'][number]) => boolean) =>
    layouts.filter((l) => l.sector === sector).some((l) => l.props.some(pred));
  assert.ok(has('mines', (p) => p.color === 0x7a6a58), 'mines rails');
  assert.ok(has('mines', (p) => p.color === 0x6a3a22), 'mines ore cart');
  assert.ok(has('mines', (p) => p.kind === 'glowCyl' && p.color === 0x58e8cc), 'mines drip glow');
  assert.ok(has('biolabs', (p) => p.kind === 'glowCyl' && p.sx < 0.5), 'biolabs specimen jars');
  assert.ok(has('security', (p) => p.color === 0x7a1c22), 'security banners');
  assert.ok(has('security', (p) => p.kind === 'glow' && p.color === 0xff3a3a), 'security laser grid');
  assert.ok(has('core', (p) => p.kind === 'pulse' && p.sx > 4.5), 'core reactor rings');
  assert.ok(has('airlock', (p) => p.color === 0x86f0ff), 'airlock cryo pods');
  assert.ok(has('airlock', (p) => p.kind === 'box' && p.sy <= 0.03 && p.color === 0xc4e8f4), 'airlock frost patches');
});

test('every sector has its own dark foreground silhouettes, near the ceiling and out of the lane', () => {
  for (const l of layouts) {
    const room = level.rooms.find((r) => r.id === l.roomId)!;
    const fg = l.props.filter((p) => p.kind === 'fg');
    assert.ok(fg.length >= 3, `${l.roomId} fg ${fg.length}`);
    for (const p of fg) {
      assert.ok(p.z >= LANE_FRONT_Z);
      assert.ok(propBounds(p).minY >= room.maxY - 1.0);
    }
  }
});

test('new props keep the lane, prop cap and window rules', () => {
  for (const l of layouts) {
    assert.ok(l.props.length <= MAX_PROPS_PER_ROOM);
    for (const p of l.props) {
      const decal = p.kind === 'box' && p.sy <= 0.03;
      assert.ok(p.z <= LANE_BACK_Z || p.z >= LANE_FRONT_Z || decal, `${l.roomId} ${p.kind} z=${p.z}`);
    }
  }
});

test('meltdown sparks are deterministic functions of time', () => {
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < MELT_SPARKS; i += 7) {
    meltSparkPosition(i, 3.3, a);
    meltSparkPosition(i, 3.3, b);
    assert.deepEqual(a, b);
    assert.ok(a[2] >= -2.4 && a[2] <= 2.0, 'sparks stay out of the near camera plane');
  }
});

test('decor.setMeltdown tints materials, shows sparks, and respects reduced motion', () => {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    const scene = new THREE.Scene();
    const tex = new Proxy({}, { get: () => new THREE.Texture() }) as never;
    const decor = buildDecor3D(scene, level, tex);
    const sparks = scene.getObjectByName('decor-melt-sparks')!;
    assert.equal(sparks.visible, false);
    assert.equal(decor.meltdownLevel(), 0);
    decor.setMeltdown(true, 0, false);
    for (let t = 0; t < 6; t += 0.1) decor.update(t, 10, 2, false);
    assert.ok(decor.meltdownLevel() > 0.9);
    assert.equal(sparks.visible, true);
    let tinted = 0;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.isMeshStandardMaterial && m.emissive.r > 0.01) tinted++;
    });
    assert.ok(tinted >= 2, `tinted materials ${tinted}`);
    // Reduced motion: steady tint, no sparks.
    decor.setMeltdown(true, 6, true);
    decor.update(6.1, 10, 2, true);
    assert.equal(sparks.visible, false);
    // Off again: level eases back to 0 and the tint clears.
    decor.setMeltdown(false, 7, false);
    for (let t = 6.2; t < 20; t += 0.1) decor.update(t, 10, 2, false);
    assert.equal(decor.meltdownLevel(), 0);
    assert.equal(sparks.visible, false);
    let lights = 0;
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) lights++;
    });
    assert.equal(lights, 0);
    decor.dispose();
  } finally {
    g.document = prev;
  }
});

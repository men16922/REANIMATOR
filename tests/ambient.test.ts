// Ambient life: deterministic seeded layout, finite geometry inside the clip box, moving far events and particles in every
// sector, vertex budget, view culling, Reduce and Classic uniforms. Layout is pure; the mesh builder needs no canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { AMBIENT_MAX_POINTS_PER_SECTOR, AMBIENT_MAX_VERTS_PER_SECTOR, layoutAllAmbient, layoutAmbient } from '../src/render3d/ambientScenes.ts';
import { buildAmbient3D } from '../src/render3d/ambient3d.ts';

const level = buildFacilityMap3D();

test('layout is deterministic per room', () => {
  for (const room of level.rooms) {
    const a = layoutAmbient(room);
    const b = layoutAmbient(room);
    assert.deepEqual(Array.from(a.far.pos), Array.from(b.far.pos));
    assert.deepEqual(Array.from(a.ev.anim), Array.from(b.ev.anim));
    assert.deepEqual(Array.from(a.pts.pos), Array.from(b.pts.pos));
    assert.deepEqual(a.events, b.events);
  }
});

test('every sector has moving far events, particles, finite geometry inside its clip and a vertex budget', () => {
  const all = layoutAllAmbient(level);
  assert.equal(new Set(all.map((d) => d.sector)).size, 6);
  for (const d of all) {
    assert.ok(d.events.length >= 1, `${d.sector} has events`);
    assert.ok(d.pts.count > 0 && d.pts.count <= AMBIENT_MAX_POINTS_PER_SECTOR, `${d.sector} points ${d.pts.count}`);
    assert.ok(d.far.count + d.ev.count <= AMBIENT_MAX_VERTS_PER_SECTOR, `${d.sector} verts ${d.far.count + d.ev.count}`);
    let moving = 0;
    for (const g of [d.far, d.ev]) {
      for (const v of [g.pos, g.col, g.anim, g.piv]) for (const x of v) assert.ok(Number.isFinite(x), `${d.sector} finite`);
      for (let i = 0; i < g.count; i++) if (g.anim[i * 4] > 0.5) moving++;
    }
    assert.ok(moving > 0, `${d.sector} has animated vertices`);
    for (const arr of [d.pts.pos, d.pts.kind, d.pts.box, d.pts.col]) for (const x of arr) assert.ok(Number.isFinite(x));
    // Static anchor positions (non-travelling) stay inside the clip box; travelling events are clipped by the shader.
    for (const g of [d.far, d.ev]) {
      for (let i = 0; i < g.count; i++) {
        if (g.anim[i * 4] === 1) continue;
        const x = g.pos[i * 3];
        const y = g.pos[i * 3 + 1];
        assert.ok(x >= d.clip[0] - 8 && x <= d.clip[1] + 8 && y >= d.clip[2] - 8 && y <= d.clip[3] + 8, `${d.sector} vertex near clip (${x}, ${y})`);
      }
    }
  }
});

test('builder adds 3 draw calls per sector, no lights, honors setView, reduce and classic', () => {
  const scene = new THREE.Scene();
  const amb = buildAmbient3D(scene, level);
  let lights = 0;
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight) lights++;
  });
  assert.equal(lights, 0);
  amb.setView(-1e6, 1e6, -1e6, 1e6);
  assert.equal(amb.telemetry().drawCalls, 18);
  amb.setView(0, 1, 0, 1);
  assert.ok(amb.telemetry().drawCalls < 18, 'culls hidden sectors');
  amb.update(1, { playerX: 5, playerY: 2, reduce: false, meltdown: false });
  assert.equal(amb.telemetry().sector, 'airlock');
  const mats: THREE.ShaderMaterial[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (m && m.uniforms) mats.push(m);
  });
  assert.ok(mats.length > 0);
  amb.setClassic(true);
  amb.update(1.1, { playerX: 5, playerY: 2, reduce: true, meltdown: false });
  for (const m of mats) {
    assert.equal(m.uniforms.uClassic.value, 1);
    assert.equal(m.uniforms.uReduce.value, 1);
  }
  const clock = mats[0].uniforms.uClock.value as number;
  amb.update(2.1, { playerX: 5, playerY: 2, reduce: true, meltdown: false });
  const slow = (mats[0].uniforms.uClock.value as number) - clock;
  assert.ok(slow > 0 && slow < 0.5, `reduce slows the clock (${slow})`);
  amb.dispose();
});

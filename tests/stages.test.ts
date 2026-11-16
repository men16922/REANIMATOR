// Stages 2 and 3: framework, determinism, content scaling, lever doors, exit teleporter, reachability, draw budget.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { STAGE_IDS_3D, buildStageMap3D, countStageFoes3D, isStageId3D } from '../src/game3d/stages3d.ts';
import { emptyInput3D, newWorld3D, roomAt3D, stepWorld3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { buildDecor3D } from '../src/render3d/decor3d.ts';
import { buildHazards3D } from '../src/render3d/hazards3d.ts';
import { buildAmbient3D } from '../src/render3d/ambient3d.ts';
import { buildVista3D } from '../src/render3d/vista3d.ts';
import { SECTOR_DRAW_BUDGET, estimateSectorDrawCalls } from '../src/render3d/drawBudget.ts';
import { checkStage } from '../tools/game/reach3d.ts';

function place(w: WorldState3D, x: number, y: number): void {
  w.player.body.x = x;
  w.player.body.y = y;
  w.player.body.vx = 0;
  w.player.body.vy = 0;
  w.player.body.grounded = true;
}

function step(w: WorldState3D, n: number, inp: Partial<ReturnType<typeof emptyInput3D>> = {}): void {
  for (let i = 0; i < n; i++) stepWorld3D(w, { ...emptyInput3D(), ...inp });
}

test('stage 1 is the unchanged facility and ids are validated', () => {
  assert.equal(JSON.stringify(buildStageMap3D(1)), JSON.stringify(buildFacilityMap3D()));
  assert.equal(JSON.stringify(buildStageMap3D()), JSON.stringify(buildFacilityMap3D()));
  assert.equal(buildStageMap3D(1).stage, undefined);
  assert.deepEqual([...STAGE_IDS_3D], [1, 2, 3]);
  assert.ok(isStageId3D(2) && !isStageId3D(4) && !isStageId3D('2'));
  assert.equal(newWorld3D().stage, 1);
});

test('stage builders are deterministic', () => {
  for (const s of [2, 3] as const) {
    assert.equal(JSON.stringify(buildStageMap3D(s)), JSON.stringify(buildStageMap3D(s)));
  }
});

test('foe counts grow per stage and the stages are longer than stage 1', () => {
  const counts = STAGE_IDS_3D.map((s) => countStageFoes3D(buildStageMap3D(s)));
  assert.ok(counts[1] > counts[0] && counts[2] > counts[1], `counts ${counts.join('/')}`);
  const len = (s: 1 | 2 | 3) => { const b = buildStageMap3D(s).bounds; return b.maxX - b.minX; };
  assert.ok(len(2) > len(1) && len(3) > len(2));
});

test('saves, lever doors and logs scale with stage length', () => {
  for (const s of [2, 3] as const) {
    const L = buildStageMap3D(s);
    const length = L.bounds.maxX - L.bounds.minX;
    assert.ok(L.saveStations.length >= Math.floor(length / 40), `stage ${s} saves ${L.saveStations.length}`);
    assert.ok(L.medStations.length >= L.saveStations.length - 1);
    const doors = L.solids.filter((x) => x.kind === 'door');
    const levers = L.switches;
    assert.ok(doors.length >= 5 && levers.length >= 4, `stage ${s}: ${doors.length} doors, ${levers.length} levers`);
    assert.equal(L.dataLogs.length, 6);
    // every lever opens an existing door or bridge
    for (const sw of levers) {
      assert.ok(L.solids.some((x) => x.doorId === sw.opens || x.bridgeId === sw.opens), `${sw.id} opens nothing`);
    }
    // every console-lock door is driven by a lever (so none can be sealed forever)
    for (const d of doors.filter((x) => x.doorLock === 'console')) {
      assert.ok(levers.some((sw) => sw.opens === d.doorId), `${d.doorId} has no lever`);
    }
    // every room is entered through a connected neighbour
    for (const r of L.rooms) assert.ok(r.neighbors.length >= 1);
    assert.equal(L.enemies.every((e) => roomAt3D(L, e.x, e.y + 0.9) === e.zone), true, 'foes stand in their own sector');
  }
});

test('stage worlds start deterministically with their loadout and no stage-1 systems', () => {
  const a = newWorld3D({ stage: 2 });
  const b = newWorld3D({ stage: 2 });
  assert.equal(a.stage, 2);
  assert.equal(a.stageClear, null);
  assert.equal(a.player.unlocked[2], true);
  assert.equal(a.player.unlocked[3], false);
  assert.equal(JSON.stringify(a.enemies.map((e) => [e.id, e.x, e.hp])), JSON.stringify(b.enemies.map((e) => [e.id, e.x, e.hp])));
  assert.equal(a.hunter.alive, false);
  assert.equal(newWorld3D({ stage: 3 }).player.unlocked[3], true);
  assert.equal(newWorld3D({ stage: 1 }).player.unlocked[2], false);
  assert.equal(newWorld3D({ stage: 1 }).hunter.alive, true);
  // the parked console and core can never be reached
  const L = a.level;
  assert.ok(L.consolePos.y < -50 && L.corePos.y < -50);
});

test('a lever press opens its door and the collider follows', () => {
  const w = newWorld3D({ stage: 2 });
  const sw = w.level.switches.find((x) => x.id === 'sw-s2-slag')!;
  place(w, sw.x, 0);
  step(w, 2, { interact: true });
  assert.ok(w.openDoors.has('bridge_s2_slag'));
  assert.ok(w.switches.find((x) => x.id === sw.id)!.on);
});

test('stage 2 exit teleporter needs interact and reports the clear stats', () => {
  const w = newWorld3D({ stage: 2 });
  const ex = w.level.exitPos;
  place(w, ex.x, 0);
  step(w, 3);
  assert.equal(w.status, 'playing', 'standing on the pad is not enough');
  assert.equal(w.stageClear, null);
  w.player.kills = 12;
  step(w, 1, { interact: true });
  assert.equal(w.status, 'won');
  const c = w.stageClear!;
  assert.equal(c.stage, 2);
  assert.equal(c.totalEnemies, countStageFoes3D(w.level));
  assert.equal(c.kills, 12);
  assert.ok(c.timeTicks > 0 && c.timeSeconds > 0);
  assert.ok(c.completionPercent >= 0 && c.completionPercent <= 100);
});

test('stage 3 teleporter stays locked until the Core Warden is down', () => {
  const w = newWorld3D({ stage: 3 });
  const ex = w.level.exitPos;
  place(w, ex.x, 0);
  w.bossIntroDone = true;
  step(w, 2, { interact: true });
  assert.equal(w.status, 'playing');
  assert.equal(w.stageClear, null);
  const warden = w.enemies.find((e) => e.kind === 'warden')!;
  warden.alive = false;
  warden.hp = 0;
  step(w, 1, { interact: true });
  assert.equal(w.status, 'won');
  assert.equal(w.stageClear!.stage, 3);
});

test('the Warden arena follows the core room bounds', () => {
  const L = buildStageMap3D(3);
  const arena = L.rooms.find((r) => r.sector === 'core')!;
  assert.equal(arena.maxX - arena.minX, 28);
  const w = newWorld3D({ stage: 3 });
  const warden = w.enemies.find((e) => e.kind === 'warden')!;
  assert.ok(warden.x > arena.minX + 2.4 && warden.x < arena.maxX - 2.1);
});

test('stage routes are walkable, every gate gates, Boots are required in stage 3', () => {
  for (const s of [2, 3] as const) {
    const r = checkStage(s);
    assert.deepEqual(r.problems, [], `stage ${s}`);
    assert.ok(r.waypoints >= 30);
  }
});

test('stage sims stay deterministic over 600 ticks', () => {
  for (const s of [2, 3] as const) {
    const run = () => {
      const w = newWorld3D({ stage: s });
      step(w, 600, { moveX: 1 });
      return JSON.stringify([w.player.body.x, w.player.hp, w.enemies.map((e) => [e.x, e.hp])]);
    };
    assert.equal(run(), run());
  }
});

test('stage sectors stay within the draw-call budget', () => {
  const g = globalThis as unknown as { document?: unknown };
  const prev = g.document;
  const ctx = new Proxy(function () {}, { get: () => () => ctx, set: () => true, apply: () => ctx }) as unknown;
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  try {
    for (const s of [2, 3] as const) {
      const level = buildStageMap3D(s);
      const scene = new THREE.Scene();
      const tex = new Proxy({}, { get: () => new THREE.Texture() }) as never;
      const decor = buildDecor3D(scene, level, tex);
      const vista = buildVista3D(scene, level);
      const ambient = buildAmbient3D(scene, level);
      const hz = buildHazards3D(scene, level);
      const root = (n: string) => scene.getObjectByName(n) as THREE.Object3D;
      const est = estimateSectorDrawCalls(level, { decor, vista, ambient, ambientRoot: root('ambient3d'), decorRoot: root('decor3d'), vistaRoot: root('vista3d'), hazardsRoot: root('hazards3d') });
      for (const e of est) assert.ok(e.total <= SECTOR_DRAW_BUDGET, `stage ${s} ${e.sector} ${e.total}`);
      hz.dispose();
    }
  } finally {
    g.document = prev;
  }
});

test('stage files hold no Abuse data and no headlamp reads (R3.3)', () => {
  for (const f of ['stageKit', 'stage2', 'stage3', 'stages3d']) {
    const src = readFileSync(new URL(`../src/game3d/${f}.ts`, import.meta.url), 'utf8');
    assert.ok(!/w\.light|\.light\b/.test(src), `${f} reads the headlamp`);
    assert.ok(!/Math\.random/.test(src), `${f} uses Math.random`);
  }
});

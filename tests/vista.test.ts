// Pure layout tests for render3d/vista3d (no DOM, no WebGL): windows, determinism, bounds, budgets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { layoutRoomDecor, WINDOW_CLEAR_Z } from '../src/render3d/decor3d.ts';
import {
  VISTA_MAX_VERTS_PER_SECTOR,
  layoutAllVistas,
  layoutVista,
  vistaWindows,
  type VistaData,
} from '../src/render3d/vista3d.ts';

const level = buildFacilityMap3D();
const sameData = (a: VistaData, b: VistaData): boolean => {
  const eq = (x: Float32Array, y: Float32Array): boolean => x.length === y.length && x.every((v, i) => v === y[i]);
  return eq(a.sil.pos, b.sil.pos) && eq(a.glow.pos, b.glow.pos) && eq(a.sil.col, b.sil.col) && eq(a.glow.anim, b.glow.anim) && eq(a.frames.pos, b.frames.pos);
};

test('vista layout is deterministic', () => {
  const a = layoutAllVistas(level);
  const b = layoutAllVistas(level);
  assert.equal(a.length, level.rooms.length);
  a.forEach((v, i) => assert.ok(sameData(v, b[i]), v.roomId));
});

test('every sector has window openings inside its room, clear of the edges', () => {
  for (const room of level.rooms) {
    const wins = vistaWindows(room);
    assert.ok(wins.length >= 1, `${room.id} has a window`);
    for (const w of wins) {
      assert.ok(w.minX >= room.minX + 1.5 && w.maxX <= room.maxX - 1.5, `${w.id} x inside room`);
      assert.ok(w.minY >= room.minY + 1 && w.maxY <= room.maxY - 0.5, `${w.id} y inside room`);
      assert.ok(w.maxX - w.minX >= 4 && w.maxY - w.minY >= 3, `${w.id} is a real opening`);
    }
    for (let i = 1; i < wins.length; i++) assert.ok(wins[i].minX > wins[i - 1].maxX + 1, `${room.id} windows do not overlap`);
  }
});

test('vista geometry is finite, bounded and sits behind the back wall', () => {
  for (const v of layoutAllVistas(level)) {
    for (const [name, g] of [['sil', v.sil], ['glow', v.glow]] as const) {
      assert.ok(g.count > 0, `${v.roomId} ${name} not empty`);
      assert.ok(g.count % 3 === 0, `${v.roomId} ${name} whole triangles`);
      assert.ok(g.pos.every(Number.isFinite) && g.col.every(Number.isFinite) && g.anim.every(Number.isFinite), `${v.roomId} ${name} finite`);
      let maxZ = -Infinity;
      for (let i = 0; i < g.count; i++) maxZ = Math.max(maxZ, g.pos[i * 3 + 2]);
      assert.ok(maxZ <= -3.2, `${v.roomId} ${name} stays behind the wall (maxZ ${maxZ})`);
    }
    assert.ok(v.sil.count + v.glow.count <= VISTA_MAX_VERTS_PER_SECTOR, `${v.roomId} verts ${v.sil.count + v.glow.count}`);
  }
});

test('vista glow stays additive-safe: bounded color channels, animation modes known', () => {
  for (const v of layoutAllVistas(level)) {
    for (const g of [v.sil, v.glow]) {
      assert.ok(g.col.every((c) => c >= 0 && c <= 2.5), `${v.roomId} color range`);
      for (let i = 0; i < g.count; i++) {
        const m = g.anim[i * 4];
        assert.ok(Number.isInteger(m) && m >= 0 && m <= 10, `${v.roomId} mode ${m}`);
      }
    }
  }
});

test('flashing modes are limited so Reduce flashing can tame them', () => {
  // Flicker is mode 2, searchlight sweep mode 5. Both must exist only as shader modes the reduce uniform handles.
  const sec = layoutAllVistas(level);
  const sweepSectors = sec.filter((v) => v.glow.anim.some((_, i) => i % 4 === 0 && v.glow.anim[i] === 5)).map((v) => v.sector);
  assert.deepEqual(sweepSectors, ['security']);
  const flicker = sec.filter((v) => v.glow.anim.some((_, i) => i % 4 === 0 && v.glow.anim[i] === 2)).length;
  assert.ok(flicker >= 3);
});

test('windows are free of back-wall structure, glass only on glazed windows', () => {
  for (const room of level.rooms) {
    const wins = vistaWindows(room);
    for (const p of layoutRoomDecor(room).props) {
      if (p.z > WINDOW_CLEAR_Z) continue;
      for (const w of wins) {
        const inside = p.x > w.minX && p.x < w.maxX && p.y > w.minY && p.y < w.maxY;
        assert.ok(!inside, `${room.id} ${p.kind} at (${p.x}, ${p.y}) blocks ${w.id}`);
      }
    }
    const v = layoutVista(room);
    assert.equal(v.glass === null, wins.every((w) => w.style === 'broken'), `${room.id} glass`);
  }
});

test('mines openings snap to the displaced rock grid', () => {
  const mines = level.rooms.find((r) => r.sector === 'mines')!;
  const cell = (mines.maxX - mines.minX) / Math.max(2, Math.round((mines.maxX - mines.minX) / 1.2));
  for (const w of vistaWindows(mines)) {
    const k = (w.minX - mines.minX) / cell;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `${w.id} snapped`);
    assert.equal(w.style, 'broken');
  }
});

test('stage grade shaders avoid the reserved gl_ prefix and Stage 1 stays ungraded', async () => {
  const { GRADE_APPLY, GRADE_UNIFORMS, VISTA_FRAG, gradeUniforms, STAGE_RAMP } = await import('../src/render3d/vista3d.ts');
  assert.ok(!/\bgl_[A-Za-z]*\s*=/.test(GRADE_APPLY), 'no local named gl_*');
  assert.ok(!/\bfloat\s+gl_/.test(GRADE_APPLY));
  for (const [label, src] of [['GRADE_APPLY', GRADE_APPLY], ['VISTA_FRAG', VISTA_FRAG]] as const) {
    assert.ok(!/\b(?:float|vec[234]|int|bool)\s+gl_/.test(src), `${label}: no gl_ local declaration`);
    assert.ok(!/\bgl_(?!FragCoord|FragColor|Position|PointCoord|FrontFacing|FragDepth)\w*\s*=/.test(src), `${label}: no gl_ assignment`);
  }
  assert.ok(VISTA_FRAG.includes(GRADE_APPLY.trim()) && VISTA_FRAG.includes(GRADE_UNIFORMS.trim()), 'vista shares the grade snippet');
  for (const name of ['uRampA', 'uRampB', 'uRampC', 'uGrade']) assert.ok(GRADE_UNIFORMS.includes(name));
  assert.equal(gradeUniforms(1).uGrade.value, 0);
  assert.equal(gradeUniforms(undefined).uGrade.value, 0);
  assert.ok((gradeUniforms(2).uGrade.value as number) > 0.5);
  assert.ok((gradeUniforms(3).uGrade.value as number) > 0.5);
  // Stage 2 ramp is warm (red above blue), Stage 3 is cold (blue above red) at the body stop.
  const warm = STAGE_RAMP[2]!.b;
  const cold = STAGE_RAMP[3]!.b;
  assert.ok(((warm >> 16) & 255) > (warm & 255));
  assert.ok((cold & 255) > ((cold >> 16) & 255));
});

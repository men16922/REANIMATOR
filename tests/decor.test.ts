// Pure layout tests for render3d/decor3d.ts (no DOM, no WebGL).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import {
  LANE_BACK_Z,
  LANE_FRONT_Z,
  MAX_PROPS_PER_ROOM,
  layoutAllDecor,
  layoutRoomDecor,
  mulberry32,
  propBounds,
} from '../src/render3d/decor3d.ts';

const level = buildFacilityMap3D();

test('decor rng and layouts are deterministic', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.deepEqual(layoutAllDecor(level), layoutAllDecor(level));
});

test('decor props stay inside room rects', () => {
  for (const room of level.rooms) {
    const l = layoutRoomDecor(room);
    assert.ok(l.props.length > 0, `${room.id} has props`);
    for (const p of l.props) {
      const b = propBounds(p);
      assert.ok(b.minX >= room.minX && b.maxX <= room.maxX, `${room.id} x bounds ${p.kind}`);
      assert.ok(b.minY >= room.minY - 0.001 && b.maxY <= room.maxY + 0.001, `${room.id} y bounds ${p.kind}`);
    }
  }
});

test('decor props never occupy the gameplay lane (floor decals excepted)', () => {
  for (const l of layoutAllDecor(level)) {
    for (const p of l.props) {
      const decal = p.kind === 'box' && p.sy <= 0.03;
      const ok = p.z <= LANE_BACK_Z || p.z >= LANE_FRONT_Z || decal;
      assert.ok(ok, `${l.roomId} ${p.kind} at z=${p.z}`);
    }
  }
});

test('decor prop count stays within budget', () => {
  let total = 0;
  for (const l of layoutAllDecor(level)) {
    assert.ok(l.props.length <= MAX_PROPS_PER_ROOM);
    total += l.props.length;
  }
  assert.ok(total <= 1200, `total props ${total}`);
});

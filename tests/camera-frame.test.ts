import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import {
  CAM_BASE_DIST,
  CAM_PLAYER_SCREEN_Y,
  CAM_ZOOM_MAX,
  CAM_ZOOM_MIN,
  clampFocusToRect,
  dynamicZoomTarget,
  frameHalfExtents,
  FrameRectSmoother,
  outsideFraction,
  screenYFraction,
  sectorCameraHint,
  stepZoom,
  verticalFocusOffset,
} from '../src/render3d/cameraFrame.ts';

const FOV = 38;
const ASPECT = 1200 / 843;

test('clamp keeps frustum inside a wide room and centers a narrow one', () => {
  const { halfW, halfH } = frameHalfExtents(CAM_BASE_DIST, FOV, ASPECT);
  const rect = { minX: 0, maxX: 60, minY: 0, maxY: 30 };
  const c = clampFocusToRect(-5, 100, halfW, halfH, rect);
  assert.equal(c.x, halfW);
  assert.equal(c.y, 30 - halfH);
  const narrow = clampFocusToRect(3, 3, halfW, halfH, { minX: 0, maxX: halfW, minY: 0, maxY: 6 });
  assert.equal(narrow.x, halfW / 2);
  assert.equal(narrow.y, 3);
});

test('vertical composition puts the player at the requested screen height', () => {
  const { halfH } = frameHalfExtents(CAM_BASE_DIST, FOV, ASPECT);
  const fy = 5 + verticalFocusOffset(halfH);
  const s = screenYFraction(5, fy, halfH);
  assert.ok(Math.abs(s - CAM_PLAYER_SCREEN_Y) < 1e-9);
  assert.ok(s >= 0.4 && s <= 0.45);
});

test('every room, sampled player positions: frustum stays in the room and the player stays on screen', () => {
  const rooms = buildFacilityMap3D().rooms;
  let total = 0;
  let bad = 0;
  for (const r of rooms) {
    const hint = sectorCameraHint(r.sector);
    const dist = CAM_BASE_DIST * hint.distMul * 1.1;
    const { halfW, halfH } = frameHalfExtents(dist, FOV, ASPECT);
    for (let i = 0; i <= 10; i++) {
      for (let j = 0; j <= 6; j++) {
        const px = r.minX + ((r.maxX - r.minX) * i) / 10;
        const py = r.minY + ((r.maxY - r.minY) * j) / 6;
        const fy0 = py + 0.9 + verticalFocusOffset(halfH, hint.screenY);
        const c = clampFocusToRect(px, fy0, halfW, halfH, r);
        total++;
        const wideEnough = r.maxX - r.minX >= 2 * halfW && r.maxY - r.minY >= 2 * halfH;
        if (wideEnough) assert.ok(outsideFraction(c.x, c.y, halfW, halfH, r) < 1e-9, `${r.id} frustum inside`);
        else assert.ok(outsideFraction(c.x, c.y, halfW, halfH, r) < 0.5, `${r.id} mostly inside`);
        const sy = screenYFraction(py, c.y, halfH);
        const sx = 0.5 + (px - c.x) / (2 * halfW);
        const eps = 1e-9;
        if (sy < -eps || sy > 1 + eps || sx < -eps || sx > 1 + eps) bad++;
      }
    }
  }
  assert.ok(bad / total < 0.02, `player offscreen ratio ${bad}/${total}`);
});

test('dynamic zoom is bounded, deterministic and smooth', () => {
  assert.equal(dynamicZoomTarget({ distances: [] }), dynamicZoomTarget({ distances: [] }));
  const crowd = dynamicZoomTarget({ distances: [3, 5, 7, 9, 11, 13] });
  const duel = dynamicZoomTarget({ distances: [4] });
  assert.ok(crowd > duel);
  for (const z of [crowd, duel, dynamicZoomTarget({ distances: [] })]) assert.ok(z >= CAM_ZOOM_MIN && z <= CAM_ZOOM_MAX);
  let z = 1;
  for (let i = 0; i < 600; i++) z = stepZoom(z, crowd, 1 / 60);
  assert.ok(Math.abs(z - crowd) < 0.01);
  assert.ok(stepZoom(1, crowd, 1 / 60) - 1 < 0.01, 'no snap');
});

test('room rect smoothing settles in about 0.4 s and snaps on teleport', () => {
  const sm = new FrameRectSmoother();
  const a = { minX: 0, maxX: 20, minY: 0, maxY: 10 };
  const b = { minX: 20, maxX: 40, minY: -5, maxY: 12 };
  sm.update(1 / 60, a, 10, 5);
  let r = sm.rect;
  for (let i = 0; i < 24; i++) r = sm.update(1 / 60, b, 21, 5);
  assert.ok(Math.abs(r.minX - 20) < 1.5 && r.minX > 0 && r.minX < 20 + 1e-6 || r.minX >= 18, 'mostly settled by 0.4 s');
  const t = sm.update(1 / 60, a, 5, 5);
  assert.equal(t.maxX, 20, 'teleport snaps');
});

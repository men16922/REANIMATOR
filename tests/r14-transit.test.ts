// R14 track A: Metroid-style room transitions. A side-door crossing holds the pace for a short walk-through, the new
// room's foes near the entrance stay passive for a grace window, no foe spawns on a doorway, and the camera clamp pans
// at a capped speed with the operative always in frame. All deterministic, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import {
  doorways3D, DOORWAY_CLEAR_M_3D, emptyInput3D, ENTRY_GRACE_RADIUS_3D, ENTRY_GRACE_TICKS_3D, newWorld3D, stepWorld3D,
  TRANSITION_TICKS_3D, type WorldState3D,
} from '../src/game3d/world3d.ts';
import {
  clampFocusToRect, frameHalfExtents, FrameRectSmoother, rectIncludingPlayer, ROOM_EASE_MAX_SPEED, ROOM_EASE_RATE,
  CAM_BASE_DIST, verticalFocusOffset,
} from '../src/render3d/cameraFrame.ts';

const right = () => ({ ...emptyInput3D(), moveX: 1, aimX: 60, aimY: 1 });

/** Airlock, standing west of the open Airlock-Shaft door, all foes and nests asleep or gone except `keep`. */
function atAirlockDoor(keep: string[] = []): WorldState3D {
  const w = newWorld3D();
  for (const e of w.enemies) if (!keep.includes(e.id)) e.alive = false;
  for (const h of w.hives) h.alive = false;
  w.openDoors.add('door_airlock_shaft');
  w.player.body = spawnBody3D(21.5, 0, 0);
  w.player.unlocked[1] = true;
  for (let i = 0; i < 5; i++) stepWorld3D(w, emptyInput3D());
  assert.equal(w.currentRoom, 'airlock');
  return w;
}

function walkUntilShaft(w: WorldState3D, input = right): number {
  for (let i = 0; i < 400 && w.currentRoom !== 'shaft'; i++) stepWorld3D(w, input());
  assert.equal(w.currentRoom, 'shaft');
  return w.tick;
}

test('transition window is 0.4 to 0.8 s and the grace window is longer than it', () => {
  assert.ok(TRANSITION_TICKS_3D >= 24 && TRANSITION_TICKS_3D <= 48, `${TRANSITION_TICKS_3D} ticks`);
  assert.ok(ENTRY_GRACE_TICKS_3D > TRANSITION_TICKS_3D);
  assert.ok(ENTRY_GRACE_RADIUS_3D > 0 && DOORWAY_CLEAR_M_3D > 0);
});

test('a side-door crossing auto-walks through the door: jump, dash and fire wait, then control returns', () => {
  const w = atAirlockDoor();
  walkUntilShaft(w);
  assert.equal(w.transitionTicks, TRANSITION_TICKS_3D);
  assert.equal(w.transitionDir, 1);
  assert.equal(w.entryGraceTicks, ENTRY_GRACE_TICKS_3D);
  const x0 = w.player.body.x;
  const y0 = w.player.body.y;
  const shots0 = w.projectiles.length;
  for (let i = 0; i < TRANSITION_TICKS_3D; i++) {
    // Pushing back, jumping and firing are all ignored while the operative steps through
    stepWorld3D(w, { ...emptyInput3D(), moveX: -1, jump: true, dash: true, fire: true, aimX: 60, aimY: 1 });
    assert.equal(w.status, 'playing');
  }
  assert.equal(w.transitionTicks, 0);
  assert.ok(w.projectiles.length <= shots0, 'no shots during the walk-through');
  assert.equal(w.player.fireCooldown, 0, 'never fired');
  assert.ok(w.player.body.x > x0 + 0.8, `walked into the room: ${x0.toFixed(2)} -> ${w.player.body.x.toFixed(2)}`);
  assert.ok(Math.abs(w.player.body.y - y0) < 0.05, 'no jump');
  // Control is back: pushing left now moves left
  const x1 = w.player.body.x;
  for (let i = 0; i < 20; i++) stepWorld3D(w, { ...emptyInput3D(), moveX: -1, aimX: 0, aimY: 1 });
  assert.ok(w.player.body.x < x1, 'control returned');
});

test('the transition is deterministic', () => {
  const run = () => {
    const w = atAirlockDoor(['e-shaft-3']);
    walkUntilShaft(w);
    for (let i = 0; i < 200; i++) stepWorld3D(w, right());
    return JSON.stringify([w.tick, w.player.body.x, w.player.body.y, w.player.hp, w.enemies.map((e) => [e.x, e.y, e.state])]);
  };
  assert.equal(run(), run());
});

test('entry grace: a foe near the entrance stays passive, then wakes; a shot releases it at once', () => {
  const w = atAirlockDoor(['e-shaft-3']);
  const e = w.enemies.find((x) => x.id === 'e-shaft-3')!;
  e.x = 30;
  e.homeX = 30;
  walkUntilShaft(w);
  const hp0 = w.player.hp;
  const ex = e.x;
  for (let i = 0; i < ENTRY_GRACE_TICKS_3D - 2; i++) {
    stepWorld3D(w, { ...emptyInput3D(), aimX: 60, aimY: 1 });
    assert.ok(Math.hypot(e.x - w.player.body.x, e.y - w.player.body.y) < ENTRY_GRACE_RADIUS_3D);
  }
  assert.equal(w.player.hp, hp0, 'no damage during the grace window');
  assert.equal(e.x, ex, 'foe held its spot');
  for (let i = 0; i < 240; i++) stepWorld3D(w, { ...emptyInput3D(), aimX: 60, aimY: 1 });
  assert.notEqual(e.x, ex, 'foe moves after the grace window');

  // Shooting a passive foe releases it: it reacts inside the window
  const v = atAirlockDoor(['e-shaft-3']);
  const f = v.enemies.find((x) => x.id === 'e-shaft-3')!;
  f.x = 30;
  f.homeX = 30;
  walkUntilShaft(v);
  for (let i = 0; i < TRANSITION_TICKS_3D; i++) stepWorld3D(v, { ...emptyInput3D(), aimX: f.x, aimY: f.y + 0.8 });
  const fx = f.x;
  for (let i = 0; i < 60 && !v.graceReleased.includes(f.id); i++) stepWorld3D(v, { ...emptyInput3D(), fire: true, aimX: f.x, aimY: f.y + 0.8 });
  assert.ok(v.graceReleased.includes(f.id), 'hit foe is released');
  assert.ok(v.entryGraceTicks > 0, 'still inside the grace window');
  for (let i = 0; i < 40; i++) stepWorld3D(v, { ...emptyInput3D(), aimX: f.x, aimY: f.y + 0.8 });
  assert.ok(!f.alive || f.x !== fx || f.state !== 'dormant', 'released foe reacts');
});

test('teleports and respawns do not start a transition', () => {
  const w = newWorld3D();
  for (const e of w.enemies) e.alive = false;
  w.player.body = spawnBody3D(30, 0, 0);
  stepWorld3D(w, emptyInput3D());
  assert.equal(w.currentRoom, 'shaft');
  assert.equal(w.transitionTicks, 0);
  assert.equal(w.entryGraceTicks, 0);
});

test('no transition hold during the meltdown escape', () => {
  const w = atAirlockDoor();
  w.meltdownTicks = 3000;
  walkUntilShaft(w);
  assert.equal(w.transitionTicks, 0);
});

test('no foe or nest spawns within the doorway clearance of a sector door', () => {
  const w = newWorld3D();
  const doors = doorways3D(w.level);
  assert.ok(doors.length >= 4, `${doors.length} doorways`);
  for (const d of doors) {
    for (const e of w.level.enemies) {
      const dist = Math.hypot(e.x - d.x, e.y - d.y);
      assert.ok(dist >= DOORWAY_CLEAR_M_3D, `${e.id} is ${dist.toFixed(2)} m from ${d.id}`);
    }
    for (const h of w.level.hives) {
      const dist = Math.hypot(h.x - d.x, h.y - d.y);
      assert.ok(dist >= DOORWAY_CLEAR_M_3D, `${h.id} is ${dist.toFixed(2)} m from ${d.id}`);
    }
  }
});

test('camera: a room change pans at the capped speed and the operative stays in frame', () => {
  const { halfW, halfH } = frameHalfExtents(CAM_BASE_DIST, 38, 16 / 9);
  const airlock = { minX: -9, maxX: 24, minY: -3.4, maxY: 14.2 };
  const shaft = { minX: 24, maxX: 42, minY: -12, maxY: 14 };
  const dt = 1 / 60;
  const sweep = (rate: number, maxSpeed: number): number => {
    const sm = new FrameRectSmoother();
    let px = 22;
    const py = 0;
    sm.update(dt, airlock, px, py, rate, maxSpeed);
    let prev = clampFocusToRect(px, py + verticalFocusOffset(halfH), halfW, halfH, rectIncludingPlayer(sm.rect, px, py, halfW, halfH));
    let maxPan = 0;
    for (let i = 0; i < 120; i++) {
      px += 3 / 60;
      const r = sm.update(dt, px >= 24 ? shaft : airlock, px, py, rate, maxSpeed);
      const c = clampFocusToRect(px, py + verticalFocusOffset(halfH), halfW, halfH, rectIncludingPlayer(r, px, py, halfW, halfH));
      maxPan = Math.max(maxPan, Math.hypot(c.x - prev.x, c.y - prev.y) / dt);
      // Same edge margin as the room clamp at a door before R14 (the door sits at the frame edge); never outside
      assert.ok(Math.abs(px - c.x) < halfW && Math.abs(py - c.y) < halfH, `player in frame at tick ${i}`);
      prev = c;
    }
    return maxPan;
  };
  const eased = sweep(ROOM_EASE_RATE, ROOM_EASE_MAX_SPEED);
  const before = sweep(8, Infinity);
  // Edges move at most 16 m/s; the centered vertical axis and the walk add a little on top
  assert.ok(eased <= ROOM_EASE_MAX_SPEED * 1.5, `eased pan ${eased.toFixed(1)} m/s`);
  assert.ok(before > eased * 2, `R7 clamp whipped at ${before.toFixed(1)} m/s vs ${eased.toFixed(1)} m/s eased`);
  const whip = new FrameRectSmoother();
  whip.update(dt, airlock, 23.9, 0);
  const r0 = { ...whip.rect };
  const r1 = whip.update(dt, shaft, 24.1, 0);
  assert.ok(Math.abs(r1.minX - r0.minX) / dt > 50, 'default rate jumps');
  // Reduce motion: an infinite rate cuts straight to the new room
  const cut = new FrameRectSmoother();
  cut.update(dt, airlock, 23.9, 0, Infinity);
  assert.deepEqual(cut.update(dt, shaft, 24.1, 0, Infinity), shaft);
});

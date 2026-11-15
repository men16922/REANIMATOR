// UI flow logic: run stats and rank, onboarding hints, attract-mode isolation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInput3D, newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import { Attract, freshWorld } from '../src/ui/attract.ts';
import {
  buildRunStats,
  collectionPercent,
  formatClock,
  Onboarding,
  ONBOARDING_WINDOW_TICKS,
  rankFor,
  retryTip,
  RETRY_TIPS,
  SECTOR_SUBTITLE,
} from '../src/ui/flow.ts';

test('rankFor: S needs a clean, complete, fast win; losses are always C', () => {
  assert.equal(rankFor(true, 800, 0, 100), 'S');
  assert.equal(rankFor(true, 800, 1, 100), 'A');
  assert.equal(rankFor(true, 2000, 5, 60), 'B');
  assert.equal(rankFor(true, 2000, 5, 10), 'C');
  assert.equal(rankFor(false, 100, 0, 100), 'C');
});

test('collectionPercent counts upgrades and weapons 2-4', () => {
  const w = newWorld3D();
  assert.equal(collectionPercent(w), 0);
  for (const s of [2, 3, 4] as const) w.player.unlocked[s] = true;
  for (const u of w.level.upgrades) w.collectedUpgrades.add(u.id);
  assert.equal(collectionPercent(w), 100);
});

test('buildRunStats converts ticks to seconds and ranks the run', () => {
  const w = newWorld3D();
  w.tick = 60 * 90;
  w.status = 'won';
  for (const s of [2, 3, 4] as const) w.player.unlocked[s] = true;
  for (const u of w.level.upgrades) w.collectedUpgrades.add(u.id);
  for (const l of w.collectibles) l.taken = true;
  for (const pk of w.pickups) pk.taken = true;
  w.secretsFound.push(...w.level.secrets.map((x) => x.id));
  const st = buildRunStats(w, 0);
  assert.equal(st.seconds, 90);
  assert.equal(st.rank, 'S');
  assert.equal(formatClock(st.seconds), '01:30');
});

test('every sector has a title-card subtitle and tips cycle', () => {
  const w = newWorld3D();
  for (const r of w.level.rooms) assert.ok(SECTOR_SUBTITLE[r.sector].length > 0, r.sector);
  assert.equal(retryTip(1), RETRY_TIPS[0]);
  assert.equal(retryTip(RETRY_TIPS.length + 1), RETRY_TIPS[0]);
});

test('onboarding shows basic controls in order and retires each after the action', () => {
  const w = newWorld3D();
  const ob = new Onboarding();
  w.tick = 10;
  assert.equal(ob.update(w), null, 'nothing before the opening beat');
  w.tick = 120;
  assert.equal(ob.update(w)?.id, 'move');
  ob.observe({ ...emptyInput3D(), moveX: 1 });
  assert.equal(ob.update(w)?.id, 'jump');
  ob.observe({ ...emptyInput3D(), jump: true });
  assert.equal(ob.update(w)?.id, 'fire');
  ob.observe({ ...emptyInput3D(), fire: true });
  assert.equal(ob.update(w)?.id, 'dash');
  ob.observe({ ...emptyInput3D(), dash: true });
  assert.equal(ob.update(w), null);
  w.tick = ONBOARDING_WINDOW_TICKS + 1;
  assert.equal(new Onboarding().update(w), null, 'hints stop after five minutes');
});

test('onboarding explains a lock when the player stands next to it, then retires it once opened', () => {
  const w = newWorld3D();
  w.tick = 200;
  const door = w.level.solids.find((s) => s.doorId && s.doorLock === 'blue');
  assert.ok(door);
  w.player.body.x = door.minX - 1;
  w.player.body.y = (door.minY + door.maxY) / 2;
  const ob = new Onboarding();
  const hint = ob.update(w);
  assert.equal(hint?.id, 'door-blue');
  w.openDoors.add(door.doorId as string);
  assert.notEqual(ob.update(w)?.id, 'door-blue');
});

test('persisted done hints are not shown again', () => {
  const w = newWorld3D();
  w.tick = 200;
  const ob = new Onboarding(['move', 'jump', 'fire', 'dash', 'light']);
  assert.equal(ob.update(w), null);
});

test('attract mode runs a private world and shares one level with fresh worlds', () => {
  const human = freshWorld();
  const before = JSON.stringify([human.player.body.x, human.tick]);
  const a = new Attract();
  assert.equal(a.world.level, human.level, 'one immutable level is shared (no geometry rebuild)');
  for (let i = 0; i < 120; i++) a.advance(1 / 60);
  assert.ok(a.world.tick > 60, 'bot advanced');
  assert.equal(JSON.stringify([human.player.body.x, human.tick]), before, 'human world untouched');
  const w2 = stepWorld3D(freshWorld(), emptyInput3D());
  assert.equal(w2.tick, 1);
});

test('attract mode loops after the demo ends', () => {
  const a = new Attract();
  const base = a.resetCount;
  a.world.status = 'lost';
  const reset = a.advance(1 / 60);
  assert.ok(reset);
  assert.equal(a.world.status, 'playing');
  assert.equal(a.resetCount, base + 1);
});

// ---------------- R2 fixes ----------------
import { readFileSync } from 'node:fs';
import { attractShot, REEL, REEL_SEGMENT_SECONDS, reelFade, reelIndex } from '../src/ui/attract.ts';

test('reel: cut index cycles, fades are black at cut edges and clear mid-cut', () => {
  assert.equal(reelIndex(0), 0);
  assert.equal(reelIndex(REEL_SEGMENT_SECONDS + 0.1), 1);
  assert.equal(reelIndex(REEL_SEGMENT_SECONDS * REEL.length + 0.1), 0);
  assert.equal(reelFade(0), 1);
  assert.equal(reelFade(REEL_SEGMENT_SECONDS / 2), 0);
  assert.ok(reelFade(REEL_SEGMENT_SECONDS - 0.01) > 0.9);
});

test('reel: shot goes from a wide view to a closer one', () => {
  assert.ok(attractShot(0.5).dolly > attractShot(REEL_SEGMENT_SECONDS - 0.5).dolly + 4);
});

test('attract: seeking to a cut is deterministic and lands on the cut tick', () => {
  const a = new Attract();
  const b = new Attract();
  assert.equal(a.world.tick, REEL[0].tick);
  assert.equal(a.world.player.body.x, b.world.player.body.x);
  a.advance(REEL_SEGMENT_SECONDS + 0.05);
  assert.ok(a.world.tick >= REEL[1].tick);
  assert.equal(a.cut, REEL[1]);
});

test('combo/rail pills respect the hidden attribute (CSS must not override it)', () => {
  const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.pill\[hidden\]\s*\{\s*display:\s*none/);
});

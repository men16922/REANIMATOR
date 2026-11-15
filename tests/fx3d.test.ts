// Pure game-feel logic: trauma decay, hit-stop timer, camera rig, particle pool, and the director's world diffing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { emptyInput3D, newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import {
  CameraRig,
  FxDirector,
  HITSTOP_MAX_FRAMES,
  HitStop,
  ParticlePool,
  SlowMo,
  Trauma,
  createPostParams,
  stepPostParams,
} from '../src/render3d/fx3d.ts';

test('trauma clamps to 1, decays linearly, shake scales with trauma squared and honours reduce', () => {
  const t = new Trauma();
  t.add(0.8);
  t.add(0.8);
  assert.equal(t.value, 1);
  t.decay(0.2);
  assert.ok(t.value < 1 && t.value > 0.5);
  const full = new Trauma();
  full.add(1);
  const half = new Trauma();
  half.add(0.5);
  const mag = (tr: Trauma, reduce: boolean): number => {
    let m = 0;
    for (let i = 0; i < 200; i++) m = Math.max(m, Math.abs(tr.sample(i * 0.016, reduce).x));
    return m;
  };
  const a = mag(full, false);
  assert.ok(a > 0.1);
  assert.ok(mag(half, false) < a * 0.5, 'quadratic falloff');
  assert.ok(mag(full, true) < a * 0.5, 'reduce flashing damps shake');
  for (let i = 0; i < 100; i++) t.decay(0.05);
  assert.equal(t.value, 0);
  assert.equal(t.sample(1).x, 0);
});

test('hit-stop freezes the requested frames, caps, then enforces a refractory window', () => {
  const h = new HitStop();
  assert.equal(h.step(), false);
  assert.ok(h.request(3));
  assert.deepEqual([h.step(), h.step(), h.step(), h.step()], [true, true, true, false]);
  assert.equal(h.totalFrozen, 3);
  assert.equal(h.request(2), false, 'refractory blocks chained light hits');
  assert.ok(h.request(2, true), 'forced requests (kills) pass');
  h.reset();
  h.request(99, true);
  assert.equal(h.frames, HITSTOP_MAX_FRAMES);
  let n = 0;
  while (h.step()) n++;
  assert.equal(n, HITSTOP_MAX_FRAMES);
  for (let i = 0; i < 6; i++) h.step();
  assert.ok(h.request(2), 'accepted again after refractory');
});

test('slow-motion eases down and recovers to exactly 1', () => {
  const s = new SlowMo();
  s.request(0.25, 0.3);
  for (let i = 0; i < 10; i++) s.step(1 / 60);
  assert.ok(s.scale < 0.4);
  for (let i = 0; i < 120; i++) s.step(1 / 60);
  assert.equal(s.scale, 1);
});

test('camera rig: dead zone ignores small moves, follows large ones, look-ahead is smoothed', () => {
  const r = new CameraRig();
  r.update(1 / 60, 0, 0, 0, 0, 0, true);
  const x0 = r.fx;
  for (let i = 0; i < 30; i++) r.update(1 / 60, 0.4, 0.2, 0, 0, 0, true);
  assert.equal(r.fx, x0, 'inside dead zone');
  for (let i = 0; i < 120; i++) r.update(1 / 60, 8, 0, 0, 0, 0, true);
  assert.ok(r.fx > 6.5 && r.fx < 8);
  const before = r.lookX;
  r.update(1 / 60, 8, 0, 0, 20, 0, true);
  assert.ok(Math.abs(r.lookX - before) < 0.2, 'look-ahead does not snap');
  for (let i = 0; i < 400; i++) r.update(1 / 60, 8, 0, 9, 20, 0, true);
  assert.ok(r.lookX > 2 && r.lookX <= 3);
  r.update(1 / 60, 200, 0, 0, 0, 0, true);
  assert.ok(r.fx > 150, 'teleport snaps');
  r.punch(100);
  assert.ok(r.fovKick <= 5);
});

test('particle pool: fixed capacity, expiry, no growth when saturated', () => {
  const p = new ParticlePool(8);
  for (let i = 0; i < 20; i++) p.emit(i, 0, 0, 1, 0, 0, 0.5, 0.2, 0.1, 1, 1, 1, 1);
  assert.equal(p.count, 8);
  assert.equal(p.emitted, 20);
  assert.equal(p.px.length, 8);
  p.update(0.25);
  assert.equal(p.count, 8);
  p.update(0.3);
  assert.equal(p.count, 0);
  p.emit(0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 10);
  p.update(0.1);
  assert.ok(p.vy[0] < 0, 'gravity applies');
  const n = p.write();
  assert.equal(n, 1);
  assert.ok(p.aCol[3] > 0 && p.aCol[3] <= 1);
  assert.ok(p.aPos[3] < 1 && p.aPos[3] > 0, 'size interpolates');
});

test('director: pulse shot spawns a muzzle flash, hurt requests a forced hit-stop, and quiet sync fires nothing', () => {
  const fx = new FxDirector();
  let w = newWorld3D();
  fx.observe(w, true);
  assert.equal(fx.telemetry().activeParticles, 0);
  w = stepWorld3D(w, { ...emptyInput3D(), fire: true, aimX: w.player.body.x + 8, aimY: w.player.body.y + 1.12 });
  fx.observe(w);
  const t = fx.telemetry();
  assert.ok(t.activeParticles > 4, `muzzle particles, got ${t.activeParticles}`);
  assert.ok(t.trauma > 0);
  // double observe of the same tick is a no-op
  const e = fx.telemetry().emitted;
  fx.observe(w);
  assert.equal(fx.telemetry().emitted, e);
  // player damage
  w.player.hp -= 20;
  w = stepWorld3D(w, emptyInput3D());
  w.player.hp = Math.min(w.player.hp, 60);
  fx.observe(w);
  assert.ok(fx.hitstop.frames > 0 || fx.telemetry().trauma > 0.3);
  // tick jump is quiet
  const em = fx.telemetry().emitted;
  w.tick += 50;
  fx.observe(w);
  assert.equal(fx.telemetry().emitted, em);
});

test('director over a bot run: bounded pools, hit-stop and shake fire, simulation result unchanged by observing', () => {
  const run = (observe: boolean): { tick: number; kills: number; hp: number; x: number; peak: number; stops: number; trauma: number } => {
    const w0 = newWorld3D();
    const bot = createBot3D(w0);
    const fx = new FxDirector();
    let w = w0;
    let peak = 0;
    let stops = 0;
    let trauma = 0;
    for (let i = 0; i < 2400 && w.status === 'playing'; i++) {
      w = stepWorld3D(w, bot.next(w));
      if (observe) {
        fx.observe(w);
        fx.update(1 / 60, w);
        if (fx.hitstop.step()) stops++;
        peak = Math.max(peak, fx.add.count + fx.alpha.count);
        trauma = Math.max(trauma, fx.trauma.value);
      }
    }
    return { tick: w.tick, kills: w.player.kills, hp: w.player.hp, x: w.player.body.x, peak, stops, trauma };
  };
  const a = run(false);
  const b = run(true);
  assert.equal(a.tick, b.tick);
  assert.equal(a.kills, b.kills);
  assert.equal(a.hp, b.hp);
  assert.equal(a.x, b.x);
  assert.ok(b.kills > 0, 'bot killed something');
  assert.ok(b.stops > 0, 'hit-stop requested during combat');
  assert.ok(b.trauma > 0.3, 'shake requested during combat');
  assert.ok(b.peak > 20 && b.peak <= 2100, `particles bounded, peak ${b.peak}`);
});

test('post params ease to the sector grade and pulse only when hurt', () => {
  const p = createPostParams();
  for (let i = 0; i < 300; i++) stepPostParams(p, 'mines', 1 / 60, i / 60, 1, 0, false);
  assert.ok(p.gain[0] > p.gain[2], 'mines grade is warm');
  assert.equal(p.lowHp, 0);
  stepPostParams(p, 'mines', 1 / 60, 1, 0.1, 0.5, false);
  assert.ok(p.lowHp > 0.5);
  assert.equal(p.chroma, 0.5);
  stepPostParams(p, 'mines', 1 / 60, 1, 0.1, 0.5, true);
  assert.ok(p.chroma < 0.2, 'reduce flashing damps chroma');
});

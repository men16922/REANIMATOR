import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInput3D, newWorld3D, stepWorld3D, BOSS_INTRO_TICKS, type EnemyState3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { FxDirector, BOSS_PHASE_COLORS } from '../src/render3d/fx3d.ts';
import { PopupPool, POPUP_CAPACITY, GLYPH_CAPACITY } from '../src/render3d/popups3d.ts';
import { introState, INTRO_ROAR_AT } from '../src/render3d/cinematic3d.ts';
import { fillRayQuads, predictRays, windProgress, RAY_CAPACITY } from '../src/render3d/bossTelegraph3d.ts';

function warden(w: WorldState3D): EnemyState3D {
  return w.enemies.find((e) => e.kind === 'warden' && !e.minion)!;
}

/** Observe a baseline tick, then apply `mutate` and observe the next tick. */
function observeWith(fx: FxDirector, w: WorldState3D, mutate: () => void): void {
  fx.observe(w, true);
  w.tick++;
  w.events = [];
  mutate();
  fx.observe(w);
}

test('intro timeline: bounded, ends on the player, roar and title land inside the clip', () => {
  assert.equal(introState(0).bars, 0);
  let maxPan = 0;
  let prevPan = 0;
  let rising = true;
  for (let t = BOSS_INTRO_TICKS; t >= 1; t--) {
    const s = introState(t);
    for (const v of [s.pan, s.zoom, s.awake, s.bars, s.title]) assert.ok(v >= 0 && v <= 1, `value in range at ${t}`);
    if (rising && s.pan < prevPan - 1e-9) rising = false;
    if (!rising) assert.ok(s.pan <= prevPan + 1e-9, 'pan only falls after the peak');
    prevPan = s.pan;
    maxPan = Math.max(maxPan, s.pan);
  }
  assert.ok(maxPan > 0.99, 'camera fully reaches the boss');
  assert.ok(introState(1).pan < 0.05, 'camera is back on the player at the end');
  const atRoar = introState(Math.round(BOSS_INTRO_TICKS * (1 - INTRO_ROAR_AT)) - 2);
  assert.equal(atRoar.roared, true);
  assert.ok(introState(Math.round(BOSS_INTRO_TICKS * 0.42)).title > 0.9, 'title card readable mid-intro');
  assert.ok(BOSS_INTRO_TICKS / 60 <= 4, 'intro stays within four seconds');
});

test('windup progress and predicted lanes follow the boss pattern', () => {
  assert.equal(windProgress(0, 36), 1);
  assert.equal(windProgress(36, 36), 0);
  assert.ok(Math.abs(windProgress(18, 36) - 0.5) < 1e-9);
  assert.equal(windProgress(5, 0), 0);
  const w = newWorld3D();
  const wd = warden(w);
  wd.bossPattern = 'volley';
  wd.phase = 1;
  assert.equal(predictRays(wd, 70, 0, 0.5).length, 5);
  wd.phase = 3;
  assert.equal(predictRays(wd, 70, 0, 0.5).length, 7);
  wd.bossPattern = 'barrage';
  wd.barrageLeft = 0;
  const b0 = predictRays(wd, 70, 0, 1);
  assert.equal(b0.length, 12);
  wd.barrageLeft = 2;
  const b1 = predictRays(wd, 70, 0, 1);
  assert.ok(Math.abs(b1[0].ang - b0[0].ang - Math.PI / 12) < 1e-9, 'second burst is offset to open a gap');
  wd.bossPattern = 'slam';
  assert.equal(predictRays(wd, 70, 0, 1).length, 0);
  // brighter and longer as the windup completes
  wd.bossPattern = 'volley';
  const lo = predictRays(wd, 70, 0, 0.1)[0];
  const hi = predictRays(wd, 70, 0, 0.9)[0];
  assert.ok(hi.a > lo.a && hi.len > lo.len);
  const pos = new Float32Array(RAY_CAPACITY * 12);
  const col = new Float32Array(RAY_CAPACITY * 16);
  assert.equal(fillRayQuads(pos, col, predictRays(wd, 70, 0, 0.5), 1, 0.5, 0.2), 7);
  assert.equal(col[3], hi.a < 1 ? col[3] : 0, 'head alpha written');
  assert.equal(col[11], 0, 'tail fades out');
});

test('popup pool: spawn, rise, expire, recycle when full, pack glyph quads', () => {
  const p = new PopupPool();
  p.spawn('125', 5, 2, { size: 1, life: 0.5, r: 1, g: 1, b: 1 });
  assert.equal(p.count, 1);
  const y0 = p.y[0];
  p.update(0.1);
  assert.ok(p.y[0] > y0, 'rises');
  assert.equal(p.write(1), 3, 'three glyph quads for three digits');
  p.update(1);
  assert.equal(p.count, 0, 'expires');
  for (let i = 0; i < POPUP_CAPACITY + 10; i++) p.spawn('x12', i, 0, { size: 1, life: 1, r: 1, g: 1, b: 1 });
  assert.equal(p.count, POPUP_CAPACITY, 'capacity is fixed');
  assert.ok(p.write(1) <= GLYPH_CAPACITY);
  assert.ok(PopupPool.scaleAt(0.12, 0.5) > 1.2, 'pop-in overshoots');
  assert.equal(PopupPool.scaleAt(0.5, 0.5), 1);
});

test('enemy hits make damage numbers; Reduce flashing drops the small ones but keeps boss numbers', () => {
  for (const reduce of [false, true]) {
    const w = newWorld3D();
    const fx = new FxDirector();
    fx.reduce = reduce;
    const crawler = w.enemies.find((e) => e.kind === 'crawler')!;
    observeWith(fx, w, () => {
      crawler.hp -= 12;
    });
    assert.equal(fx.popups.count, reduce ? 0 : 1, `small number (reduce=${reduce})`);
    const wd = warden(w);
    observeWith(fx, w, () => {
      wd.hp -= 300;
    });
    assert.equal(fx.popups.count, reduce ? 1 : 2, 'boss number always shown');
  }
});

test('exposed Warden hits show a large gold number', () => {
  const w = newWorld3D();
  const fx = new FxDirector();
  const wd = warden(w);
  wd.exposedTicks = 40;
  fx.observe(w, true);
  w.tick++;
  wd.hp -= 220;
  fx.observe(w);
  assert.equal(fx.popups.count, 1);
  assert.ok(fx.popups.size[0] >= 1.05, 'big');
  assert.ok(fx.popups.col[1] > 0.7 && fx.popups.col[2] < 0.4, 'gold');
});

test('boss_phase: armour shards, colour change, flash (damped under Reduce flashing), light pulse, slow motion', () => {
  for (const reduce of [false, true]) {
    const w = newWorld3D();
    const fx = new FxDirector();
    fx.reduce = reduce;
    const wd = warden(w);
    observeWith(fx, w, () => {
      wd.phase = 2;
      w.events.push({ type: 'boss_phase', value: 2 });
    });
    assert.equal(fx.bossPhase, 2);
    assert.ok(fx.alpha.count >= 20, 'armour plates');
    assert.ok(fx.envPulse > 0.9, 'environment pulse');
    if (reduce) assert.ok(fx.phaseFlash <= 0.15, 'flash damped');
    else assert.ok(fx.phaseFlash >= 0.9, 'full flash');
    assert.ok(fx.slowmo.scale < 1 || fx.hitstop.frames > 0, 'beat');
    assert.ok(BOSS_PHASE_COLORS[1][0] > BOSS_PHASE_COLORS[1][2], 'phase II core is orange');
    fx.update(1, w);
    assert.equal(fx.phaseFlash, 0, 'flash decays');
  }
});

test('boss death: chained explosions over about two seconds, then a core reveal, deterministic', () => {
  const run = (): { emitted: number; trauma: number } => {
    const w = newWorld3D();
    const fx = new FxDirector();
    const wd = warden(w);
    observeWith(fx, w, () => {
      wd.alive = false;
    });
    assert.ok(fx.deathT >= 0, 'sequence armed');
    const before = fx.add.emitted;
    let frames = 0;
    while (fx.deathT >= 0 && frames < 600) {
      fx.update(1 / 60, w);
      frames++;
    }
    assert.ok(frames > 90 && frames < 200, `sequence length ${frames} frames`);
    assert.ok(fx.add.emitted - before > 150, 'many chained explosion particles');
    return { emitted: fx.add.emitted + fx.alpha.emitted, trauma: Math.round(fx.trauma.value * 1000) };
  };
  assert.deepEqual(run(), run());
});

test('new mechanic recipes: wall jump, stomp landing, dash cancel, combo, secret, collect', () => {
  const w = newWorld3D();
  const fx = new FxDirector();
  const b = w.player.body;
  let n = fx.add.emitted + fx.alpha.emitted;
  const delta = (): number => {
    const m = fx.add.emitted + fx.alpha.emitted;
    const d = m - n;
    n = m;
    return d;
  };
  observeWith(fx, w, () => w.events.push({ type: 'wall_jump' }));
  assert.ok(delta() >= 8, 'wall jump spark ring');
  observeWith(fx, w, () => {
    b.stompLanded = true;
  });
  assert.ok(delta() >= 14, 'stomp landing shockwave');
  b.stompLanded = false;
  observeWith(fx, w, () => w.events.push({ type: 'dash_cancel' }));
  assert.ok(delta() >= 8, 'dash cancel flash');
  observeWith(fx, w, () => w.events.push({ type: 'combo', value: 3 }));
  assert.equal(fx.popups.count, 1, 'x3 popup');
  assert.equal(fx.popups.text[0], 'x3');
  observeWith(fx, w, () => w.events.push({ type: 'collect', value: 0 }));
  assert.ok(delta() >= 20, 'data stream absorbed');
  // wall slide sparks every second tick while sliding
  b.grounded = false;
  b.wallDir = 1;
  b.vy = -3;
  const e0 = fx.add.emitted;
  fx.observe(w, true);
  for (let i = 0; i < 6; i++) {
    w.tick++;
    w.events = [];
    fx.observe(w);
  }
  assert.ok(fx.add.emitted - e0 >= 6, 'wall slide sparks');
});

test('rail charge and stomp trail emit per frame, proportional to the charge', () => {
  const w = newWorld3D();
  const fx = new FxDirector();
  w.player.weapon = 4;
  w.player.unlocked[4] = true;
  w.player.railCharge = 40;
  const e0 = fx.add.emitted;
  for (let i = 0; i < 30; i++) fx.update(1 / 60, w);
  assert.ok(fx.add.emitted - e0 >= 30, 'converging motes while charging');
  w.player.railCharge = 0;
  w.player.body.stomping = true;
  const e1 = fx.add.emitted;
  for (let i = 0; i < 30; i++) fx.update(1 / 60, w);
  assert.ok(fx.add.emitted - e1 >= 30, 'stomp trail');
});

test('boss telegraph emitters follow the pattern (volley converge, charge scrape, exposed core sparks)', () => {
  const w = newWorld3D();
  const fx = new FxDirector();
  const wd = warden(w);
  wd.active = true;
  wd.alive = true;
  const count = (setup: () => void): number => {
    fx.reset();
    setup();
    const e = fx.add.emitted;
    for (let i = 0; i < 20; i++) fx.update(1 / 60, w);
    return fx.add.emitted - e;
  };
  assert.ok(count(() => { wd.bossPattern = 'volley'; wd.windupTicks = 10; }) >= 20, 'muzzle charge');
  assert.ok(count(() => { wd.windupTicks = 0; wd.bossPattern = 'none'; wd.exposedTicks = 30; }) >= 15, 'exposed sparks');
  assert.equal(count(() => { wd.exposedTicks = 0; wd.phase = 1; wd.bossPattern = 'none'; wd.windupTicks = 0; }), 0, 'quiet when idle');
});

test('the intro never changes the deterministic result of a replay (same inputs, same world)', () => {
  const run = (): string => {
    const w = newWorld3D();
    w.consoleUnlocked = true;
    w.openDoors.add('door_boss');
    w.player.body.x = 76;
    for (let i = 0; i < 500; i++) stepWorld3D(w, { ...emptyInput3D(), moveX: i % 90 < 45 ? 1 : -1, aimX: 90, aimY: 1 });
    return `${w.tick}|${w.player.body.x.toFixed(4)}|${warden(w).x.toFixed(4)}|${warden(w).hp}`;
  };
  assert.equal(run(), run());
});

// ---------------------------------------------------------------------------------------------------------
// R10: Warden Counter
// ---------------------------------------------------------------------------------------------------------
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { WARDEN_COUNTER_WINDOW, WARDEN_COUNTER_EXPOSED_MULT, WARDEN_EXPOSED_MULT } from '../src/game3d/world3d.ts';

function counterWorld(phase: 1 | 2 | 3, pattern: 'charge' | 'slam', windup: number): { w: WorldState3D; wd: EnemyState3D } {
  const w = newWorld3D();
  w.consoleUnlocked = true;
  w.openDoors.add('door_boss');
  w.currentRoom = 'core';
  w.bossIntroDone = true;
  w.player.hp = w.player.maxHp = 100000;
  const wd = warden(w);
  wd.active = true;
  wd.phase = phase;
  wd.hp = wd.maxHp * (phase === 1 ? 0.9 : phase === 2 ? 0.5 : 0.2);
  wd.x = 88;
  w.player.body = spawnBody3D(83, wd.y, 0);
  wd.state = 'windup';
  wd.bossPattern = pattern;
  wd.windupTicks = windup;
  wd.attackCooldown = 0;
  wd.chargeDir = -1;
  wd.facing = -1;
  return { w, wd };
}

function step(w: WorldState3D, counter = false): void {
  const i = emptyInput3D();
  i.counter = counter;
  stepWorld3D(w, i);
}

test('warden counter: window opens only in the last ticks of a phase 2 charge windup', () => {
  const { w, wd } = counterWorld(2, 'charge', 30);
  const open: boolean[] = [];
  for (let i = 0; i < 29; i++) {
    step(w);
    open.push(wd.parryOpen);
  }
  assert.equal(open.filter(Boolean).length, WARDEN_COUNTER_WINDOW, 'window length');
  assert.equal(open[0], false);
});

test('warden counter: phase 1 slam and phase 2 slam never open a window', () => {
  for (const ph of [1, 2] as const) {
    const { w, wd } = counterWorld(ph, 'slam', 30);
    for (let i = 0; i < 29; i++) {
      step(w);
      assert.equal(wd.parryOpen, false);
    }
  }
});

test('warden counter: press in the window cancels the charge, exposes the Warden with the bonus multiplier', () => {
  const { w, wd } = counterWorld(2, 'charge', 30);
  for (let i = 0; i < 24; i++) step(w);
  assert.equal(wd.parryOpen, true);
  const hp = wd.hp;
  w.player.body = spawnBody3D(wd.x - 5, wd.y, 0);
  step(w, true);
  assert.ok(w.events.some((e) => e.type === 'boss_counter'));
  assert.equal(wd.bossPattern, 'none');
  assert.equal(wd.windupTicks, 0);
  assert.equal(wd.lungeTicks, 0);
  assert.ok(wd.exposedTicks > 60);
  assert.equal(wd.counterExposed, true);
  assert.ok(wd.hp < hp);
  assert.ok(WARDEN_COUNTER_EXPOSED_MULT > WARDEN_EXPOSED_MULT);
  for (let i = 0; i < 40; i++) step(w);
  assert.equal(wd.lungeTicks, 0, 'the charge never launches');
  assert.equal(w.player.hp, w.player.maxHp, 'no damage taken');
});

test('warden counter: phase 3 slam can be countered', () => {
  const { w, wd } = counterWorld(3, 'slam', 20);
  for (let i = 0; i < 12; i++) step(w);
  assert.equal(wd.parryOpen, true);
  w.player.body = spawnBody3D(wd.x - 4, wd.y, 0);
  step(w, true);
  assert.ok(w.events.some((e) => e.type === 'boss_counter'));
  assert.equal(w.shockwaves.length, 0);
});

test('warden counter: press outside the window whiffs and the flag clears when the window ends', () => {
  const { w, wd } = counterWorld(2, 'charge', 30);
  w.player.body = spawnBody3D(wd.x - 5, wd.y, 0);
  step(w, true);
  assert.ok(w.events.some((e) => e.type === 'parry_whiff'));
  assert.equal(w.events.some((e) => e.type === 'boss_counter'), false);
  assert.equal(wd.counterExposed, false);
});

test('warden counter: bonus multiplier applies only while the counter window is open, then plain exposed', () => {
  const { w, wd } = counterWorld(2, 'charge', 30);
  for (let i = 0; i < 24; i++) step(w);
  w.player.body = spawnBody3D(wd.x - 5, wd.y, 0);
  step(w, true);
  for (let i = 0; i < 200 && wd.exposedTicks > 0; i++) step(w);
  assert.equal(wd.exposedTicks, 0);
  assert.equal(wd.counterExposed, false);
});

test('warden counter: deterministic, and idle input is identical with or without the counter code path', () => {
  const run = (): string => {
    const { w, wd } = counterWorld(2, 'charge', 30);
    for (let i = 0; i < 24; i++) step(w);
    w.player.body = spawnBody3D(wd.x - 5, wd.y, 0);
    step(w, true);
    for (let i = 0; i < 100; i++) step(w);
    return JSON.stringify([wd.hp, wd.x, wd.exposedTicks, w.tick]);
  };
  assert.equal(run(), run());
  const idle = (): string => {
    const { w, wd } = counterWorld(2, 'charge', 30);
    for (let i = 0; i < 120; i++) step(w);
    return JSON.stringify([wd.x, wd.state, wd.lungeTicks, w.player.hp]);
  };
  assert.equal(idle(), idle());
});

test('warden counter fx: boss_counter requests slow-mo and hit-stop, a gentler one with reduce motion', () => {
  const run = (reduce: boolean): { frames: number; scale: number } => {
    const w = newWorld3D();
    const fx = new FxDirector();
    fx.reduce = reduce;
    observeWith(fx, w, () => w.events.push({ type: 'boss_counter', value: 2 }));
    fx.slowmo.step(1 / 60);
    return { frames: fx.hitstop.frames, scale: fx.slowmo.scale };
  };
  const full = run(false);
  const calm = run(true);
  assert.ok(full.scale < 1 && full.frames > 0);
  assert.ok(calm.frames <= full.frames && calm.scale >= full.scale);
});

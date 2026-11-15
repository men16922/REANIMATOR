// R10 opening set piece: pure timeline, the one enemy it touches, and the guarantee that it never changes sim state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { newWorld3D, stepWorld3D, emptyInput3D } from '../src/game3d/world3d.ts';
import { OPENING_BARS, OPENING_TITLE, OPENING_WAKE, OPENING_BEATS, OPENING_ENEMY_ID, OPENING_SECONDS, OPENING_VENT, OpeningClock, openingState, openingView } from '../src/ui/opening.ts';
import { SHOWCASE_SCENES } from '../src/ui/demo.ts';

test('timeline: beats are ordered and the whole piece stays under 11 s', () => {
  const B = OPENING_BEATS;
  const order = [B.lampOn, B.lampSteady, B.alarmOn, B.rattle, B.burst, B.prompt, B.handoff];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `beat ${i}`);
  assert.ok(OPENING_SECONDS < 11);
});

test('timeline: wakes in the dark, frost clears, lamp ends steady, alarm fades after the burst', () => {
  const a = openingState(0);
  assert.equal(a.dark, 1);
  assert.ok(a.frost > 0.99 && a.lamp === 0 && a.alarm === 0);
  assert.ok(openingState(5).frost < 0.01);
  assert.ok(openingState(OPENING_BEATS.lampSteady + 0.6).lamp >= 0.99);
  const mid = openingState(OPENING_BEATS.alarmOn + 1.5);
  assert.ok(mid.alarm > 0.9);
  assert.ok(openingState(OPENING_BEATS.burst + 2).alarm < 0.05);
  assert.ok(openingState(OPENING_SECONDS).dark < 0.01);
});

test('timeline: the headlamp stutters in the default mode and ramps once with Reduce flashing', () => {
  let flips = 0;
  let prev = openingState(0).lamp > 0.05;
  for (let t = 0; t < OPENING_BEATS.lampSteady + 0.2; t += 1 / 60) {
    const on = openingState(t).lamp > 0.05;
    if (on !== prev) flips++;
    prev = on;
  }
  assert.ok(flips >= 6, `flicker flips ${flips}`);
  let last = 0;
  let rflips = 0;
  prev = false;
  for (let t = 0; t < OPENING_SECONDS; t += 1 / 60) {
    const s = openingState(t, true);
    assert.ok(s.lamp >= last - 1e-9, 'reduce: lamp never drops');
    last = s.lamp;
    const on = s.lamp > 0.05;
    if (on !== prev) rflips++;
    prev = on;
    assert.equal(s.rattle, 0);
    assert.equal(s.burstFlash, 0);
    assert.equal(s.sweep, 0);
    assert.ok(s.alarm <= 0.5 + 1e-9);
  }
  assert.equal(rflips, 1);
});

test('the opening hides exactly one existing airlock crawler until the vent bursts, and spawns nothing', () => {
  const w = newWorld3D();
  const e = w.enemies.find((x) => x.id === OPENING_ENEMY_ID);
  assert.ok(e && e.kind === 'crawler' && e.zone === 'airlock');
  assert.ok(Math.abs(OPENING_VENT.x - e.x) < 1.5, 'vent sits above the crawler');
  assert.deepEqual([...openingView(openingState(1)).hideEnemyIds], [OPENING_ENEMY_ID]);
  assert.equal(openingView(openingState(OPENING_BEATS.burst + 0.01)).hideEnemyIds.size, 0);
});

test('clock: the burst edge fires once, never when skipped before it, and skip finishes the piece', () => {
  const c = new OpeningClock();
  let fired = 0;
  for (let i = 0; i < 700; i++) {
    c.advance(1 / 60);
    if (c.takeBurst()) fired++;
  }
  assert.equal(fired, 1);
  assert.ok(c.finished);
  const s = new OpeningClock();
  s.advance(2);
  s.skip();
  assert.ok(s.finished && !s.takeBurst());
  assert.equal(s.state(false).done, true);
  assert.equal(s.state(false).enemyHidden, false);
});

test('the opening is display-side: sim hash does not depend on it and the module has no randomness or sim imports', () => {
  const src = readFileSync(new URL('../src/ui/opening.ts', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(src));
  assert.ok(!/game3d\/world3d/.test(src));
  const run = (): string => {
    let w = newWorld3D();
    for (let i = 0; i < 120; i++) w = stepWorld3D(w, emptyInput3D());
    return JSON.stringify([w.tick, w.player.body.x, w.player.hp, w.enemies.map((e) => [e.id, e.x, e.state])]);
  };
  openingState(3);
  assert.equal(run(), run());
});

test('showcase scenes for the opening exist and use the airlock', () => {
  for (const n of ['opening', 'opening-wake', 'opening-alarm']) {
    const sc = SHOWCASE_SCENES[n];
    assert.ok(sc && sc.kind === 'world' && sc.sector === 'airlock' && sc.openingAt !== undefined, n);
  }
  assert.ok(SHOWCASE_SCENES.opening.openingAt! > OPENING_BEATS.burst);
});

test('R11: wake pose rises from a kneel to standing by about 5 s, quicker with Reduce flashing, and never exceeds 0..1', () => {
  assert.equal(openingState(0).wake, 1);
  assert.ok(openingState(OPENING_WAKE.start - 0.01).wake > 0.99);
  assert.ok(openingState(OPENING_WAKE.standBy).wake < 0.001);
  assert.ok(openingState(OPENING_WAKE.standByReduced, true).wake < 0.001);
  let prev = 1;
  for (let t = 0; t <= OPENING_SECONDS; t += 1 / 30) {
    const w = openingState(t).wake;
    assert.ok(w >= 0 && w <= 1 && w <= prev + 1e-9, `wake monotone at ${t}`);
    prev = w;
  }
  assert.equal(openingView(openingState(1)).wake, 1);
});

test('R11: letterbox bars stay in until they retract into the handoff, the title card fades in and out, HUD held until handoff', () => {
  assert.equal(openingState(OPENING_BARS.retractFrom - 0.01).bars, 1);
  assert.ok(openingState(OPENING_SECONDS).bars < 0.001);
  assert.equal(openingState(0).title, 0);
  assert.ok(openingState(OPENING_TITLE.in + 1).title > 0.99);
  assert.ok(openingState(OPENING_TITLE.out + 0.1).title < 0.01);
  assert.ok(OPENING_TITLE.text.includes('CRYO AIRLOCK') && OPENING_TITLE.text.includes('03:12 AFTER BREACH'));
  assert.equal(openingState(OPENING_BEATS.handoff - 0.01).hudHidden, true);
  assert.equal(openingState(OPENING_BEATS.handoff).hudHidden, false);
});

test('R11: HUD hiding is one body class, removed on every exit path (finish, skip, showcase exit, audit)', () => {
  const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
  const hide = main.slice(main.indexOf('function hideIntro'), main.indexOf('// ---- story language'));
  assert.ok(hide.includes("classList.remove('opening-on')"), 'hideIntro restores the HUD');
  assert.ok(main.slice(main.indexOf('function showIntro')).includes("classList.add('opening-on')"));
  // finish and skip both go through hideIntro; the audit and showcase exit call it before measuring
  assert.ok(/openingClock\.finished\) hideIntro\(\)/.test(main));
  assert.ok(/'intro-skip'\)\.addEventListener\('click', hideIntro\)/.test(main));
  const audit = main.slice(main.indexOf('wAny.__reanimatorUiAudit'));
  assert.ok(audit.indexOf('hideIntro()') > 0 && audit.indexOf('hideIntro()') < audit.indexOf('runUiAudit'));
  const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');
  assert.ok(/body\.opening-on #hud[^{]*#minimap-wrap/.test(css), 'HUD and minimap hidden while the opening plays');
});

test('R11: the wake pose is display-only (scene reads OpeningView, sim hash unchanged)', () => {
  const scene = readFileSync(new URL('../src/render3d/scene3dFull.ts', import.meta.url), 'utf8');
  assert.ok(scene.includes('this.opening.wake'));
  const op = readFileSync(new URL('../src/ui/opening.ts', import.meta.url), 'utf8');
  assert.equal(/Math\.random|game3d\/world3d/.test(op.replace(/\/\/.*$/gm, '')), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASSIC_HEIGHT, TRANSITION_SECONDS, classicFxOpacity, classicSeamEmissive, crtFrame, gateStrobe, transitionPlan } from '../src/render3d/classicLogic.ts';

test('crt transition is 0.4 s, collapses to one scanline at the midpoint and switches there', () => {
  assert.equal(TRANSITION_SECONDS, 0.4);
  assert.equal(crtFrame(0).heightFrac, 1);
  assert.equal(crtFrame(0).switched, false);
  const mid = crtFrame(0.2);
  assert.equal(mid.switched, true);
  assert.equal(mid.heightFrac, 1 / CLASSIC_HEIGHT);
  assert.equal(mid.glow, 1);
  assert.equal(crtFrame(0.4).done, true);
  assert.equal(crtFrame(0.4).heightFrac, 1);
  assert.equal(crtFrame(9).t, 1);
  assert.equal(crtFrame(-1).t, 0);
});

test('crt height snaps to whole scanlines and is monotonic per half', () => {
  let prev = 2;
  for (let i = 0; i <= 20; i++) {
    const f = crtFrame((i / 20) * 0.2);
    assert.ok(Math.abs(Math.round(f.heightFrac * CLASSIC_HEIGHT) - f.heightFrac * CLASSIC_HEIGHT) < 1e-6);
    assert.ok(f.heightFrac <= prev + 1e-9);
    prev = f.heightFrac;
  }
});

test('reduce flashing skips the transition entirely', () => {
  assert.deepEqual(transitionPlan(true), { animate: false, seconds: 0 });
  assert.deepEqual(transitionPlan(false), { animate: true, seconds: 0.4 });
});

test('gateStrobe returns the steady value when reduced', () => {
  assert.equal(gateStrobe(0.9, 0.5, true), 0.5);
  assert.equal(gateStrobe(0.9, 0.5, false), 0.9);
});

test('classic fx opacity uses hard steps', () => {
  assert.equal(classicFxOpacity(0.1), 0);
  assert.equal(classicFxOpacity(0.4), 0.55);
  assert.equal(classicFxOpacity(0.9), 1);
  assert.equal(classicSeamEmissive(0.55, 0.3, true), 0.55);
  assert.equal(classicSeamEmissive(0.55, 0.3, false), 0.3);
});

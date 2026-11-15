// Pure-logic tests for the player presentation layer (heroPose.ts): pose-state selection, recoil decay,
// weapon swap timing, HP colour mapping, muzzle handoff and the controller wiring. No renderer involved.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HeroController,
  RECOIL_PROFILE,
  SWAP_SECONDS,
  chooseMuzzle,
  hpColorHex,
  hpPulse,
  hpSegments,
  kickRecoil,
  legDrop,
  newRecoil,
  newSwap,
  selectHeroPose,
  stepRecoil,
  stepSwap,
  swapLower,
  targetOffsets,
  type HeroSimInput,
  type PoseSelectInput,
} from '../src/render3d/heroPose.ts';

const basePose: PoseSelectInput = {
  dead: false,
  hurtFlashTicks: 0,
  airborne: false,
  dashTicks: 0,
  wallDir: 0,
  wallJumpLock: 0,
  stomping: false,
  stompLandTime: 0,
  landingFactor: 0,
  saveActive: false,
  speedX: 0,
  vy: 0,
};

test('pose state: priorities', () => {
  assert.equal(selectHeroPose(basePose), 'idle');
  assert.equal(selectHeroPose({ ...basePose, speedX: 5 }), 'run');
  assert.equal(selectHeroPose({ ...basePose, airborne: true }), 'airborne');
  assert.equal(selectHeroPose({ ...basePose, airborne: true, wallDir: 1, vy: -3 }), 'wallSlide');
  assert.equal(selectHeroPose({ ...basePose, airborne: true, wallDir: 1, vy: 4 }), 'airborne', 'rising along a wall is not a slide');
  assert.equal(selectHeroPose({ ...basePose, airborne: true, wallDir: 1, vy: -3, wallJumpLock: 0.2 }), 'wallJump');
  assert.equal(selectHeroPose({ ...basePose, dashTicks: 3, speedX: 12 }), 'dash');
  assert.equal(selectHeroPose({ ...basePose, landingFactor: 0.6 }), 'landing');
  assert.equal(selectHeroPose({ ...basePose, saveActive: true }), 'save');
  assert.equal(selectHeroPose({ ...basePose, saveActive: true, speedX: 6 }), 'run', 'moving cancels the save pose');
  assert.equal(selectHeroPose({ ...basePose, stomping: true, airborne: true, hurtFlashTicks: 5 }), 'stomp');
  assert.equal(selectHeroPose({ ...basePose, stompLandTime: 0.2 }), 'stompLand');
  assert.equal(selectHeroPose({ ...basePose, hurtFlashTicks: 4, speedX: 6 }), 'hurt');
  assert.equal(selectHeroPose({ ...basePose, dead: true, stomping: true, hurtFlashTicks: 9 }), 'dead');
});

test('recoil: per-weapon strength, no stacking runaway, monotonic decay to zero', () => {
  const r = newRecoil();
  kickRecoil(r, 1);
  assert.equal(r.value, RECOIL_PROFILE[1].kick);
  kickRecoil(r, 1);
  assert.equal(r.value, RECOIL_PROFILE[1].kick, 'a second pulse shot does not stack');
  assert.ok(RECOIL_PROFILE[4].kick > RECOIL_PROFILE[2].kick && RECOIL_PROFILE[2].kick > RECOIL_PROFILE[1].kick);
  let prev = r.value;
  for (let i = 0; i < 300; i++) {
    stepRecoil(r, 1 / 60);
    assert.ok(r.value <= prev);
    prev = r.value;
  }
  assert.equal(r.value, 0);
  // rail recoils slower than the pulse rifle (heavier weapon)
  const a = newRecoil();
  const b = newRecoil();
  kickRecoil(a, 1, 1 / RECOIL_PROFILE[1].kick);
  kickRecoil(b, 4, 1 / RECOIL_PROFILE[4].kick);
  for (let i = 0; i < 12; i++) {
    stepRecoil(a, 1 / 60);
    stepRecoil(b, 1 / 60);
  }
  assert.ok(b.value > a.value);
});

test('weapon swap: model changes at the midpoint, finishes after SWAP_SECONDS', () => {
  const s = newSwap(1);
  stepSwap(s, 1, 1 / 60);
  assert.equal(swapLower(s), 0, 'no dip without a change');
  stepSwap(s, 3, 1 / 60);
  assert.equal(s.shown, 1, 'old model stays at the start of the swap');
  let swappedAt = -1;
  let t = 0;
  let peak = 0;
  while (s.t < 1 && t < 1) {
    stepSwap(s, 3, 1 / 60);
    t += 1 / 60;
    peak = Math.max(peak, swapLower(s));
    if (swappedAt < 0 && (s.shown as number) === 3) swappedAt = t;
  }
  assert.ok(swappedAt > SWAP_SECONDS * 0.4 && swappedAt < SWAP_SECONDS * 0.7, `swap at ${swappedAt}`);
  assert.ok(t >= SWAP_SECONDS * 0.85 && t <= SWAP_SECONDS * 1.2);
  assert.ok(peak > 0.95);
  assert.equal(swapLower(s), 0);
  assert.equal(s.shown, 3);
});

test('weapon swap: retarget mid-swap ends on the latest weapon', () => {
  const s = newSwap(1);
  stepSwap(s, 2, 0.05);
  stepSwap(s, 4, 0.05);
  for (let i = 0; i < 60; i++) stepSwap(s, 4, 1 / 60);
  assert.equal(s.shown, 4);
  assert.equal(s.t, 1);
});

test('HP colour: green / yellow / red bands, segments and pulse', () => {
  assert.equal(hpColorHex(1), 0x3dff7a);
  assert.equal(hpColorHex(0.7), 0x3dff7a);
  assert.equal(hpColorHex(0.45), 0xffd23a);
  assert.equal(hpColorHex(0.1), 0xff2e24);
  assert.equal(hpColorHex(0), 0xff2e24);
  const mid = hpColorHex(0.6);
  assert.ok(mid !== 0x3dff7a && mid !== 0xffd23a, 'blends between bands');
  assert.equal(hpSegments(1), 4);
  assert.equal(hpSegments(0.5), 2);
  assert.equal(hpSegments(0.01), 1);
  assert.equal(hpSegments(0.9, false), 0);
  assert.equal(hpPulse(1, 3), 1);
  assert.equal(hpPulse(0.5, 3, false), 0);
  let lo = 9;
  let hi = 0;
  for (let i = 0; i < 200; i++) {
    const v = hpPulse(0.1, i / 20);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(hi - lo > 0.6, 'critical HP blinks visibly');
});

test('muzzle handoff: socket used only when it is near the sim spawn point', () => {
  assert.deepEqual(chooseMuzzle({ x: 5.2, y: 3, valid: true }, 5, 3), { x: 5.2, y: 3 });
  assert.deepEqual(chooseMuzzle({ x: 9, y: 3, valid: true }, 5, 3), { x: 5, y: 3 });
  assert.deepEqual(chooseMuzzle({ x: 5.2, y: 3, valid: false }, 5, 3), { x: 5, y: 3 });
});

test('leg drop keeps feet planted: crouch lowers the hips, zero at rest', () => {
  assert.equal(legDrop(0, 0), 0);
  assert.ok(legDrop(0.55, 1.0) > 0.03 && legDrop(0.55, 1.0) < 0.2);
  assert.ok(legDrop(0.85, 1.55) > legDrop(0.55, 1.0));
});

test('target offsets: stomp tucks, landing squashes with landingFactor, hurt leans back', () => {
  const ctx = { moveRel: 1, aimSignX: 1 as const, wallDir: 1, landingFactor: 1, hurtK: 1, stompLandK: 1, speedNorm: 1 };
  assert.ok(targetOffsets('stomp', ctx).knee > 1.2);
  assert.ok(targetOffsets('stompLand', ctx).hipsDrop > targetOffsets('landing', { ...ctx, landingFactor: 0.5 }).hipsDrop);
  assert.ok(targetOffsets('landing', ctx).knee > targetOffsets('landing', { ...ctx, landingFactor: 0.3 }).knee);
  assert.ok(targetOffsets('hurt', ctx).lean < 0);
  assert.equal(targetOffsets('wallSlide', ctx).wallHand, 1);
  const wj = targetOffsets('wallJump', ctx);
  const wjFlip = targetOffsets('wallJump', { ...ctx, aimSignX: -1 });
  assert.equal(Math.sign(wj.twist), -Math.sign(wjFlip.twist), 'twist mirrors with facing');
  assert.ok(targetOffsets('dash', ctx).lean > 0 && targetOffsets('dash', { ...ctx, moveRel: -1 }).lean < 0);
});

function sim(over: Partial<HeroSimInput> = {}): HeroSimInput {
  return {
    hp: 100, maxHp: 100, weapon: 1, muzzleFlashTicks: 0, hurtFlashTicks: 0, railCharge: 0, railChargeMax: 48,
    airborne: false, vx: 0, vy: 0, aimSignX: 1, landingFactor: 0, dashTicks: 0, wallDir: 0, wallJumpLock: 0,
    stomping: false, saveCooldown: 0, tick: 10, ...over,
  };
}

test('controller: shot kicks recoil, switching weapon swaps, rail fraction follows charge', () => {
  const c = new HeroController();
  let f = c.step(1 / 60, sim({ tick: 1 }));
  assert.equal(f.recoil, 0);
  f = c.step(1 / 60, sim({ tick: 2, muzzleFlashTicks: 4 }));
  assert.ok(f.fired && f.recoil > 0.3);
  f = c.step(1 / 60, sim({ tick: 3, muzzleFlashTicks: 3 }));
  assert.ok(!f.fired);
  f = c.step(1 / 60, sim({ tick: 4, weapon: 4, railCharge: 24 }));
  assert.equal(f.shown, 1);
  assert.ok(f.swapping && f.lower > 0);
  assert.equal(f.railFrac, 0.5);
  for (let i = 0; i < 20; i++) f = c.step(1 / 60, sim({ tick: 5 + i, weapon: 4, railCharge: 48 }));
  assert.equal(f.shown, 4);
  assert.equal(f.railFrac, 1);
  assert.ok(!f.swapping);
});

test('controller: stomp touchdown produces a squash that fades; hurt and death states', () => {
  const c = new HeroController();
  c.step(1 / 60, sim({ tick: 1 }));
  let f = c.step(1 / 60, sim({ tick: 2, stomping: true, airborne: true, vy: -20 }));
  assert.equal(f.state, 'stomp');
  f = c.step(1 / 60, sim({ tick: 3, stomping: false, airborne: false }));
  assert.equal(f.state, 'stompLand');
  for (let i = 0; i < 40; i++) f = c.step(1 / 60, sim({ tick: 4 + i }));
  assert.equal(f.state, 'idle');
  assert.ok(Math.abs(f.offsets.knee) < 0.05, 'squash relaxes');
  f = c.step(1 / 60, sim({ tick: 60, hurtFlashTicks: 12 }));
  assert.equal(f.state, 'hurt');
  f = c.step(1 / 60, sim({ tick: 61, hp: 0 }));
  assert.equal(f.state, 'dead');
  assert.equal(f.alive, false);
});

test('controller: resets when the world tick goes backwards (respawn)', () => {
  const c = new HeroController();
  c.step(1 / 60, sim({ tick: 500, muzzleFlashTicks: 6 }));
  const f = c.step(1 / 60, sim({ tick: 1, weapon: 3 }));
  assert.equal(f.shown, 3);
  assert.equal(f.recoil, 0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHROMA_CAP,
  DEATH_POP_CAP,
  HIT_FLASH_PEAK,
  deathPopAmount,
  hitFlashAmount,
  hitFlashEnvelope,
  orbitAngle,
  popupTier,
  projectileStyle,
  stackedPopupY,
  stepChroma,
} from '../src/render3d/vfxStyle3d.ts';
import { PopupPool } from '../src/render3d/popups3d.ts';

test('hit flash is short, front-loaded and capped', () => {
  const seq = [8, 7, 6, 5, 4, 3, 2, 1].map((t) => hitFlashEnvelope(t, false));
  assert.deepEqual(seq.slice(4), [0, 0, 0, 0]);
  assert.ok(seq[0] === 1 && seq[0] > seq[1] && seq[1] > seq[2] && seq[2] > seq[3] && seq[3] > 0);
  assert.equal(hitFlashEnvelope(0, false), 0);
  assert.ok(hitFlashAmount(8, false) <= HIT_FLASH_PEAK);
  assert.ok(hitFlashAmount(8, false) <= 0.35);
});

test('reduce flashing dims the flash and the death pop', () => {
  assert.ok(hitFlashAmount(8, true) < hitFlashAmount(8, false) * 0.5);
  assert.ok(deathPopAmount(1, true) < deathPopAmount(1, false) * 0.5);
});

test('death pop lasts two frames then a short tail', () => {
  assert.equal(deathPopAmount(0, false), 0);
  assert.equal(deathPopAmount(1, false), DEATH_POP_CAP);
  assert.equal(deathPopAmount(2, false), DEATH_POP_CAP);
  assert.ok(deathPopAmount(3, false) < DEATH_POP_CAP && deathPopAmount(3, false) > 0);
  assert.equal(deathPopAmount(4, false), 0);
});

test('chromatic kick is capped and decays within a quarter second', () => {
  assert.ok(stepChroma(1, 0) <= CHROMA_CAP);
  let c = 1;
  let t = 0;
  while (c > 0 && t < 2) {
    c = stepChroma(c, 1 / 60);
    t += 1 / 60;
  }
  assert.ok(t < 0.25, `decay took ${t}s`);
});

test('projectile styles separate hostile and allied colours', () => {
  for (const k of ['enemy_acid', 'boss_plasma'] as const) {
    const s = projectileStyle(k, false);
    assert.ok(s.hostile && s.ringSparks > 0 && s.tail > 0);
    const [r, g, b] = s.glow;
    assert.ok((r > g && r > b) || (g > r && g > b), `${k} should be red or green`);
  }
  for (const k of ['pulse', 'scatter', 'grenade'] as const) {
    const s = projectileStyle(k, true);
    assert.ok(!s.hostile && s.ringSparks === 0);
  }
  const [pr, , pb] = projectileStyle('pulse', true).glow;
  assert.ok(pb > pr, 'pulse is cyan');
  const [sr, , sb] = projectileStyle('scatter', true).glow;
  assert.ok(sr > sb, 'scatter is orange');
  assert.ok(projectileStyle('pulse', false).hostile);
});

test('orbit sparks are evenly spaced and spin', () => {
  const a0 = orbitAngle(0, 3, 0);
  const a1 = orbitAngle(1, 3, 0);
  assert.ok(Math.abs(a1 - a0 - (Math.PI * 2) / 3) < 1e-9);
  assert.ok(orbitAngle(0, 3, 0.1) > a0);
});

test('popup tiers: ordinary hits are small and brief, exposed boss hits are big', () => {
  const small = popupTier(10, false, false);
  const crit = popupTier(60, false, false);
  const weak = popupTier(80, true, true);
  assert.ok(small.size < crit.size && crit.size < weak.size);
  assert.ok(small.life < crit.life && small.life <= 0.5);
});

test('overlapping popups stack upward', () => {
  const y = stackedPopupY(0.2, 5.05, 0.32, 1, [0], [5], [0.32], [0.1]);
  assert.ok(y > 5.05 + 0.15);
  assert.equal(stackedPopupY(3, 5.05, 0.32, 1, [0], [5], [0.32], [0.1]), 5.05);
  assert.equal(stackedPopupY(0, 5.05, 0.32, 1, [0], [5], [0.32], [0.9]), 5.05);
});

test('PopupPool.spawn with stack separates simultaneous numbers', () => {
  const pool = new PopupPool();
  const o = { size: 0.32, life: 0.45, r: 1, g: 1, b: 1, stack: true };
  for (let i = 0; i < 4; i++) pool.spawn('12', 0, 4, o);
  const ys = Array.from(pool.y.slice(0, 4)).sort((a, b) => a - b);
  for (let i = 1; i < 4; i++) assert.ok(ys[i] - ys[i - 1] > 0.15, `gap ${i}`);
  pool.spawn('9', 0, 4, { ...o, stack: false });
  assert.equal(pool.y[4], 4);
});

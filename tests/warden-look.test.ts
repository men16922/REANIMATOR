import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_PHASE_COLORS } from '../src/render3d/fx3d.ts';
import {
  WARDEN_ARMOUR_ALBEDO,
  WARDEN_HALO_RGB,
  WARDEN_SEAM_MAX,
  WARDEN_WEAK_CORE,
  WARDEN_WEAK_RGB,
  wardenLook,
  wardenPhaseColor,
  wardenWeakPulse,
  type WardenLookInput,
} from '../src/render3d/wardenLook3d.ts';

const base: WardenLookInput = {
  phase: 1, active: true, alive: true, exposedTicks: 0, winding: false, windFrac: 0, summon: false, intro: 0, tSec: 1.3, reduce: false,
};

test('phase colours follow BOSS_PHASE_COLORS and clamp', () => {
  assert.deepEqual(wardenPhaseColor(1), BOSS_PHASE_COLORS[0]);
  assert.deepEqual(wardenPhaseColor(2), BOSS_PHASE_COLORS[1]);
  assert.deepEqual(wardenPhaseColor(3), BOSS_PHASE_COLORS[2]);
  assert.deepEqual(wardenPhaseColor(0), BOSS_PHASE_COLORS[0]);
  assert.deepEqual(wardenPhaseColor(9), BOSS_PHASE_COLORS[2]);
  for (let p = 1; p <= 3; p++) assert.deepEqual(wardenLook({ ...base, phase: p }).glow, BOSS_PHASE_COLORS[p - 1]);
});

test('armour is dark and the halo is cool against the orange arena', () => {
  assert.ok(WARDEN_ARMOUR_ALBEDO <= 0.45);
  assert.ok(WARDEN_HALO_RGB[2] > WARDEN_HALO_RGB[0], 'halo must be blue-dominant');
  const ph2 = wardenLook({ ...base, phase: 2 });
  assert.ok(ph2.halo > 0.5);
});

test('weak point glows only while exposed', () => {
  for (let p = 1; p <= 3; p++) {
    for (let t = 0; t < 4; t += 0.37) {
      assert.equal(wardenLook({ ...base, phase: p, tSec: t }).weak, 0);
      assert.equal(wardenLook({ ...base, phase: p, tSec: t, winding: true, windFrac: 0.9 }).weak, 0);
    }
  }
  const open = wardenLook({ ...base, phase: 2, exposedTicks: 60 });
  assert.ok(open.weak > 0.5);
  assert.deepEqual(open.coreColor, WARDEN_WEAK_RGB);
  assert.ok(open.core > open.seam * 1.5, 'exposed core must out-glow the seams');
  assert.ok(open.core <= WARDEN_WEAK_CORE + 1e-9);
  assert.equal(wardenWeakPulse(0, 1, false), 0);
  assert.ok(wardenWeakPulse(2, 1, true) < wardenWeakPulse(30, 1, true), 'fades over the final ticks');
});

test('seams stay capped and dead or reduced motion behave', () => {
  for (let t = 0; t < 6; t += 0.11) {
    const l = wardenLook({ ...base, phase: 3, winding: true, windFrac: 1, tSec: t });
    assert.ok(l.seam <= WARDEN_SEAM_MAX && l.seam >= 0);
  }
  const dead = wardenLook({ ...base, alive: false, exposedTicks: 50 });
  assert.equal(dead.seam + dead.core + dead.halo + dead.weak, 0);
  const a = wardenLook({ ...base, reduce: true, tSec: 0.2 });
  const b = wardenLook({ ...base, reduce: true, tSec: 2.9 });
  assert.equal(a.seam, b.seam);
  const dormant = wardenLook({ ...base, active: false, intro: 0 });
  assert.equal(dormant.halo, 0);
  assert.ok(wardenLook({ ...base, active: false, intro: 1 }).core > dormant.core);
});

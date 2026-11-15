import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAR_LIGHT, CHAR_RIM_MAX, CHAR_RIM_MIN, CHAR_AO_FLOOR, CHAR_ENV_INTENSITY } from '../src/render3d/charLight3d.ts';
import { WARDEN_RIM_STRENGTH } from '../src/render3d/wardenLook3d.ts';
import { HUNTER_RIM } from '../src/render3d/hunterView.ts';

test('character rim is a subtle accent for every kind', () => {
  for (const [k, t] of Object.entries(CHAR_LIGHT)) {
    assert.ok(t.rim >= CHAR_RIM_MIN && t.rim <= CHAR_RIM_MAX, `${k} rim ${t.rim}`);
  }
  assert.ok(WARDEN_RIM_STRENGTH <= CHAR_RIM_MAX);
  assert.ok(HUNTER_RIM.rim >= CHAR_RIM_MIN && HUNTER_RIM.rim <= CHAR_RIM_MAX);
});

test('character exposure lifts characters without clipping the rig', () => {
  for (const t of Object.values(CHAR_LIGHT)) {
    assert.ok(t.exposure > 1 && t.exposure <= 2);
    assert.ok(t.key > t.fill);
  }
  assert.ok(CHAR_AO_FLOOR > 0.5 && CHAR_AO_FLOOR < 1);
  assert.ok(CHAR_ENV_INTENSITY > 0 && CHAR_ENV_INTENSITY <= 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findFlatBoxes, scanFlatBoxes } from '../tools/render/flat-boxes.ts';
import { PLAYER_HURT_FLASH_SEC, HIT_FLASH_PEAK, playerHurtFlashAmount } from '../src/render3d/vfxStyle3d.ts';

test('finder flags untextured basic boxes and ignores textured, small and standard ones', () => {
  const root = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const flat = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x78c8be }));
  flat.scale.set(0.8, 0.5, 0.02);
  const small = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  small.scale.setScalar(0.1);
  const tex = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ map: new THREE.Texture() }));
  const std = new THREE.Mesh(box, new THREE.MeshStandardMaterial());
  root.add(flat, small, tex, std);
  const found = findFlatBoxes(root, 't');
  assert.equal(found.length, 1);
  assert.equal(found[0].color, '#78c8be');
});

test('real scene parts have no flat placeholder boxes (map terminals and tunnel glow are textured)', () => {
  assert.deepEqual(scanFlatBoxes(), []);
});

test('player hurt flash: warm-white cap 0.3, display-time decay, reduce-flashing dims it', () => {
  const a0 = playerHurtFlashAmount(0, false);
  assert.ok(a0 > 0 && a0 <= HIT_FLASH_PEAK);
  assert.ok(playerHurtFlashAmount(0.05, false) < a0);
  assert.equal(playerHurtFlashAmount(PLAYER_HURT_FLASH_SEC, false), 0);
  assert.equal(playerHurtFlashAmount(5, false), 0, 'a paused sim cannot hold the flash');
  assert.equal(playerHurtFlashAmount(-1, false), 0);
  assert.ok(playerHurtFlashAmount(0, true) < a0 * 0.5);
});

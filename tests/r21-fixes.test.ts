// R21 render fixes: boss-intro letterbox class collision and the Slag Foreman parry flash (display only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cinematic = readFileSync(new URL('../src/render3d/cinematic3d.ts', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../src/render3d/scene3dFull.ts', import.meta.url), 'utf8');

test('boss intro letterbox bars do not reuse the HUD .bar class', () => {
  // The global HUD rule `.bar{width:5.5em}` plus `body:not(.classic) .bar{position:relative}` turned the bars into
  // two black squares at the top-left of the screen.
  assert.ok(!/class="bar\b/.test(cinematic), 'letterbox markup must not use class "bar"');
  assert.ok(!/\.boss-intro \.bar\b/.test(cinematic));
  assert.ok(cinematic.includes('class="lb-bar t"') && cinematic.includes('class="lb-bar b"'));
});

test('Slag Foreman emissive is mapped through its albedo texture', () => {
  assert.ok(/m\.emissiveMap = m\.map/.test(scene), 'Foreman materials route emissive through the texture');
  assert.ok(scene.includes('PARRY_FLASH_DARK_HEX'), 'Foreman parry pulse uses the warm dark-mesh tint');
});

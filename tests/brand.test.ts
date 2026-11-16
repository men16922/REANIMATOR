// Brand kit and title-menu pure logic.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BRAND, buildLogoSvg, glyphOffsets, GLYPHS, LOGO_VIEW, wordmarkWidth } from '../src/ui/brand.ts';
import { loadProgress, menuKeyAction, stepIndex, TITLE_MENU, visibleMenu } from '../src/ui/menu.ts';

test('glyphs spell REANIMATOR and fit the logo view box', () => {
  assert.equal(GLYPHS.map((g) => g.ch).join(''), BRAND.name);
  const xs = glyphOffsets();
  assert.ok(xs[0] >= 0 && xs[xs.length - 1] + GLYPHS[GLYPHS.length - 1].w <= LOGO_VIEW.w);
  assert.ok(wordmarkWidth() < LOGO_VIEW.w);
});

test('logo svg is self-contained: no external references or scripts', () => {
  const svg = buildLogoSvg();
  assert.ok(svg.startsWith('<svg'));
  assert.equal((svg.match(/class="lt"/g) ?? []).length, GLYPHS.length * 4);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(svg));
  assert.ok(!/<script|<image|href=/i.test(svg));
});

test('menu: first screen has only PLAY / STAGES / SETTINGS / EXTRAS, CONTINUE appears with a save', () => {
  assert.deepEqual(visibleMenu(false).map((m) => m.label), ['PLAY', 'STAGES', 'SETTINGS', 'EXTRAS']);
  assert.deepEqual(visibleMenu(true).map((m) => m.label), ['PLAY', 'CONTINUE', 'STAGES', 'SETTINGS', 'EXTRAS']);
  assert.equal(TITLE_MENU[0].id, 'play');
});

test('menu navigation wraps and starts at the ends', () => {
  assert.equal(stepIndex(-1, 1, 3), 0);
  assert.equal(stepIndex(-1, -1, 3), 2);
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(0, 1, 0), -1);
});

test('menu keys map to actions', () => {
  assert.equal(menuKeyAction('ArrowDown'), 'next');
  assert.equal(menuKeyAction('ArrowUp'), 'prev');
  assert.equal(menuKeyAction('Enter'), 'activate');
  assert.equal(menuKeyAction('Escape'), 'back');
  assert.equal(menuKeyAction('KeyA'), 'none');
});

test('load progress clamps and counts failures as settled', () => {
  assert.equal(loadProgress(0, 0, 9), 0);
  assert.equal(loadProgress(4, 1, 10), 0.5);
  assert.equal(loadProgress(9, 0, 9), 1);
  assert.equal(loadProgress(12, 0, 9), 1);
  assert.equal(loadProgress(0, 0, 0), 1);
});

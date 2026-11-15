// R4 polish: pure-logic checks (HUD sector labels, glyph coverage, classic palette mapping).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import { classicSectorLabel, sanitizeHudText, SECTOR_CHARS } from '../src/ui/classicHud.ts';
import { hasGlyph, textWidth } from '../src/ui/pixelFont.ts';

test('every sector label has glyphs for all characters and fits the strip', () => {
  const level = buildFacilityMap3D();
  const raws = ['TRANSIT', ...level.rooms.map((r) => `${r.sector.toUpperCase()} \u00b7 ${r.name.toUpperCase()}`), ...level.rooms.map((r) => r.name)];
  for (const raw of raws) {
    const label = classicSectorLabel(raw, SECTOR_CHARS);
    assert.ok(label.length > 0, raw);
    assert.ok(label.length <= SECTOR_CHARS, `${raw} -> ${label}`);
    assert.ok(textWidth(label) <= 88, `${label} width`);
    for (const ch of label) assert.ok(hasGlyph(ch), `${raw} -> '${ch}' missing`);
    assert.ok(!label.includes('?'), raw);
  }
});

test('sector label keeps the room name when the full text is too long', () => {
  assert.equal(classicSectorLabel('MINES \u00b7 ACID MINES', 14), 'ACID MINES');
  assert.equal(classicSectorLabel('AIRLOCK', 14), 'AIRLOCK');
  assert.equal(classicSectorLabel('SECURITY \u00b7 SECURITY DECK', 14), 'SECURITY DECK');
  assert.equal(sanitizeHudText('a\u2013b \u00a7 c'), 'A-B C');
});

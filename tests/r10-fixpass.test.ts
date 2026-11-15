// R10 fix pass: unified year, ui audit reasons, hunter steel material, compact hunter pill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRAND } from '../src/ui/brand.ts';
import { auditReport, type UiAuditScenario } from '../src/ui/uiAudit.ts';
import { HUNTER_STEEL } from '../src/render3d/hunterView.ts';

const scen = (name: string, checked: number, failures = 0): UiAuditScenario => ({
  name,
  expectedTop: name,
  checked,
  topLayer: name,
  failures: Array.from({ length: failures }, () => ({ id: 'x', reason: 'covered' as const, detail: '' })),
});

test('pitch year is 1996 everywhere user-facing', () => {
  assert.ok(BRAND.pitch.startsWith('1996 '));
  const html = readFileSync('index.html', 'utf8');
  assert.ok(!html.includes('1995'), 'index.html has no 1995');
  assert.ok(html.includes('1996 DOS physics, verified frame-exact'));
});

test('ui audit reports a reason when a scenario measured nothing', () => {
  const ok = auditReport([scen('title', 5), scen('settings', 3)]);
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, undefined);
  const empty = auditReport([scen('title', 0), scen('settings', 3)]);
  assert.equal(empty.ok, false);
  assert.match(empty.reason ?? '', /no controls measured in: title/);
  const bad = auditReport([scen('title', 4, 2)]);
  assert.equal(bad.ok, false);
  assert.match(bad.reason ?? '', /failures in: title/);
});

test('hunter steel is a dark cool grey, not the orange flesh albedo', () => {
  const c = HUNTER_STEEL.color;
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  assert.ok(b >= r, 'cool tone');
  assert.ok(Math.max(r, g, b) < 140, 'dark');
  assert.ok(HUNTER_STEEL.metalness > 0.3);
});

test('hunter pill is compact (short label, extra small bar)', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /id="hunter-pill"[^>]*>HUNTER <b/);
  assert.match(readFileSync('src/ui/style.css', 'utf8'), /\.bar-xs \{ width: 2\.8em; \}/);
});

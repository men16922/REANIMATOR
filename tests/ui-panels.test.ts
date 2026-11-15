// Regression tests for the overlay stacking contract (R7 UI track). No browser: index.html and the CSS are
// parsed statically, and the pure panel state machine in src/ui/panels.ts is checked exhaustively.
// Bugs this guards: (1) sub panel button lists stuck at opacity 0 behind a 2 s entrance delay,
// (2) Restoration Lab opening underneath the title logo and menu.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PANEL_IDS, type TitlePanel } from '../src/ui/menu.ts';
import { LAYER_IDS, normalizePanelState, titleCovered, topLayer, visibleLayers, type PanelState, type UiMode } from '../src/ui/panels.ts';

const read = (p: string): string => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');
const html = read('index.html');
const css = read('src/ui/style.css') + '\n' + read('src/ui/demo.css');

// ---- tiny CSS reader: selector -> merged declarations (later rules win, like the cascade for equal specificity) ----
function parseCss(src: string): Array<{ selector: string; decl: Record<string, string> }> {
  // @media blocks (reduced motion, ...) only ever switch things off, so they are not part of the base contract.
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  const rules: Array<{ selector: string; decl: Record<string, string> }> = [];
  const re = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    const decl: Record<string, string> = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    for (const sel of m[1].split(',')) rules.push({ selector: sel.trim().replace(/\s+/g, ' '), decl });
  }
  return rules;
}
const rules = parseCss(css);
const rootVars = Object.assign({}, ...rules.filter((r) => r.selector === ':root').map((r) => r.decl)) as Record<string, string>;

function prop(selector: string, name: string): string | undefined {
  let v: string | undefined;
  for (const r of rules) if (r.selector === selector && r.decl[name] !== undefined) v = r.decl[name];
  return v;
}
function z(selector: string): number {
  let v = prop(selector, 'z-index');
  assert.ok(v !== undefined, `${selector} needs an explicit z-index`);
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m) {
    v = rootVars[m[1]];
    assert.ok(v !== undefined, `${m[1]} is not defined on :root`);
  }
  const n = Number(v);
  assert.ok(Number.isFinite(n), `${selector} z-index "${v}" is not numeric`);
  return n;
}

// ---- index.html: element id -> { tag, classes, hidden, parent id } ----
interface El { tag: string; classes: string[]; hidden: boolean; parent: string | null }
function parseHtml(src: string): Map<string, El> {
  const out = new Map<string, El>();
  const stack: Array<{ tag: string; id: string | null }> = [];
  const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'canvas-void']);
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const [, close, tag, attrs, selfClose] = m;
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? null;
    if (id) {
      const parent = [...stack].reverse().find((s) => s.id)?.id ?? null;
      out.set(id, { tag, classes: (/\bclass="([^"]*)"/.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean), hidden: /\shidden(\s|$|=)/.test(' ' + attrs), parent });
    }
    if (!VOID.has(tag) && !selfClose) stack.push({ tag, id });
  }
  return out;
}
const dom = parseHtml(html);

test('layer scale tokens are ordered: hud < title < overlay < subpanel < intro < caption < loading', () => {
  const order = ['--z-hud', '--z-title', '--z-overlay', '--z-subpanel', '--z-intro', '--z-caption', '--z-loading'].map((k) => Number(rootVars[k]));
  assert.ok(order.every(Number.isFinite), 'all --z tokens defined');
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `token ${i} must exceed ${i - 1}`);
});

test('every full-screen layer has an explicit z-index in the right band', () => {
  assert.ok(z('#title') > z('#hud'));
  assert.equal(z('.overlay'), z('#title') + 1, 'pause and result sit one band above the title');
  assert.ok(z('#lab') > z('#title'), 'Lab opens above the title (bug 2)');
  assert.ok(z('#revived') > z('#title'), 'How it was revived opens above the title');
  assert.ok(z('#lab') >= z('.overlay') && z('#revived') >= z('.overlay'));
  assert.ok(z('#intro') > z('#lab'), 'intro covers menus');
  assert.ok(z('#showcase-caption') > z('#intro') && z('#demo-badge') > z('#intro'));
  assert.ok(z('#loading') > z('#showcase-caption'), 'loading is topmost');
  assert.ok(z('#controls-panel') >= 1, 'pause controls sit above the pause buttons');
});

test('title sub panels stack above the title chrome inside the title context', () => {
  const panel = z('.tpanel');
  for (const chrome of ['.title-inner', '.credits', '.letterbox']) assert.ok(panel > z(chrome), `.tpanel above ${chrome}`);
});

test('#title is a stacking context and its panels are position:absolute children of it', () => {
  assert.equal(prop('.overlay', 'position'), 'absolute');
  assert.equal(prop('.tpanel', 'position'), 'absolute');
  for (const id of Object.values(PANEL_IDS)) {
    const el = dom.get(id);
    assert.ok(el, `${id} exists in index.html`);
    assert.equal(el.parent, 'title', `${id} lives inside #title`);
    assert.ok(el.classes.includes('tpanel'), `${id} uses .tpanel`);
    assert.ok(el.hidden, `${id} starts hidden`);
  }
});

test('Lab and "How it was revived" are stage-level overlays, not inside #title, and start hidden', () => {
  for (const id of ['lab', 'revived', 'pause', 'result', 'intro', 'loading', 'title']) {
    const el = dom.get(id);
    assert.ok(el, `${id} exists`);
    assert.equal(el.parent, 'stage', `${id} is a direct child of #stage`);
  }
  for (const id of ['lab', 'revived', 'pause', 'result', 'intro']) assert.ok(dom.get(id)!.hidden, `${id} starts hidden`);
  for (const id of ['lab', 'revived']) assert.ok(dom.get(id)!.classes.includes('panel'), `${id} uses .panel`);
});

test('sub panel button lists are never held back by an entrance delay (bug 1)', () => {
  // The first-screen menu may fade in late. Anything that opens later must be visible immediately.
  assert.equal(prop('.menu-list', 'animation'), undefined, '.menu-list must not animate by default');
  assert.match(prop('#title-menu', 'animation') ?? '', /emblem-in/);
  for (const r of rules) {
    const a = r.decl['animation'] ?? '';
    const delayed = /\s[1-9]\d*(\.\d+)?s\b.*\bboth\b|\bboth\b.*\s[1-9]\d*(\.\d+)?s\s/.test(a) && /both|backwards/.test(a);
    if (/\.(menu-list|plate|tpanel|mi)\b/.test(r.selector) && !/#title-menu/.test(r.selector)) {
      assert.ok(!delayed, `${r.selector} would hide opened panels behind a delay: ${a}`);
    }
  }
  for (const id of ['extras-panel']) {
    const lists = [...html.matchAll(/<div[^>]*class="[^"]*menu-list[^"]*"/g)];
    assert.ok(lists.length >= 2 && dom.get(id), 'extras list uses .menu-list');
  }
});

test('title chrome hides when a panel covers it', () => {
  const sel = '#title.covered .title-inner';
  assert.equal(prop(sel, 'visibility'), 'hidden');
  assert.ok(dom.get('title-logo')!.parent === 'title' && dom.get('title-menu')!.parent === 'title', 'logo and menu are title chrome');
});

test('lab and revived panels are opaque so the title cannot show through', () => {
  const bg = prop('.panel', 'background') ?? '';
  assert.ok(!/rgba\(/.test(bg), `panel background must be opaque, got ${bg}`);
});

test('smoke test DOM ids still exist', () => {
  for (const id of ['extras-open', 'revived-open', 'revived-close', 'lab-open', 'lab-close', 'lab-scenario', 'lab-mutation', 'extras-close', 'play', 'resume', 'volume', 'volume-p', 'minimap', 'etank-count', 'tutorial-toggle', 'coach-skip']) {
    assert.ok(dom.has(id), `#${id} missing from index.html`);
  }
});

test('every layer id the state machine manages exists in index.html', () => {
  for (const id of LAYER_IDS) assert.ok(dom.has(id), `#${id} missing`);
});

// ---- state machine ----
const MODES: UiMode[] = ['title', 'playing', 'paused', 'result', 'showcase'];
const TITLE_PANELS: Array<TitlePanel | null> = [null, 'settings', 'extras', 'controls', 'credits', 'demo'];
function* allStates(): Generator<PanelState> {
  for (const mode of MODES) for (const titlePanel of TITLE_PANELS) for (const lab of [false, true]) for (const revived of [false, true]) for (const pauseControls of [false, true]) for (const logArchive of [false, true]) for (const logReader of [false, true]) for (const creditsRoll of [false, true]) {
    yield normalizePanelState({ mode, titlePanel, lab, revived, pauseControls, logArchive, logReader, creditsRoll });
  }
}

test('at most one top layer; it is always one of the visible layers', () => {
  for (const s of allStates()) {
    const top = topLayer(s);
    const vis = visibleLayers(s);
    if (top === null) assert.deepEqual(vis, [], JSON.stringify(s));
    else assert.ok(vis.includes(top), `${top} must be visible in ${JSON.stringify(s)}`);
  }
});

test('Lab and revived beat every title panel; title panels beat the bare title', () => {
  const base: PanelState = { mode: 'title', titlePanel: 'extras', lab: false, revived: false, pauseControls: false, logArchive: false, logReader: false, creditsRoll: false };
  assert.equal(topLayer(base), 'extras-panel');
  assert.equal(topLayer({ ...base, lab: true }), 'lab');
  assert.equal(topLayer({ ...base, revived: true }), 'revived');
  assert.equal(topLayer({ ...base, titlePanel: null, lab: true }), 'lab');
  assert.equal(topLayer({ ...base, titlePanel: null }), 'title');
  for (const k of Object.keys(PANEL_IDS) as TitlePanel[]) assert.equal(topLayer({ ...base, titlePanel: k }), PANEL_IDS[k]);
});

test('title logo and menu are covered exactly when something other than the bare title is on top', () => {
  for (const s of allStates()) {
    const expected = s.mode === 'title' && topLayer(s) !== 'title';
    assert.equal(titleCovered(s), expected, JSON.stringify(s));
    if (s.mode === 'title' && (s.lab || s.revived || s.titlePanel)) assert.equal(titleCovered(s), true);
  }
  assert.equal(titleCovered({ mode: 'title', titlePanel: null, lab: false, revived: false, pauseControls: false, logArchive: false, logReader: false, creditsRoll: false }), false);
});

test('impossible combinations are normalized away', () => {
  const n = normalizePanelState({ mode: 'playing', titlePanel: 'extras', lab: true, revived: true, pauseControls: true, logArchive: true, logReader: false, creditsRoll: true });
  assert.deepEqual(n, { mode: 'playing', titlePanel: null, lab: false, revived: false, pauseControls: false, logArchive: false, logReader: false, creditsRoll: false });
  assert.equal(topLayer(n), null);
  assert.equal(topLayer(normalizePanelState({ mode: 'paused', titlePanel: null, lab: true, revived: false, pauseControls: true, logArchive: false, logReader: false, creditsRoll: false })), 'controls-panel');
  assert.equal(topLayer(normalizePanelState({ mode: 'result', titlePanel: 'demo', lab: false, revived: false, pauseControls: true, logArchive: false, logReader: false, creditsRoll: false })), 'result');
  assert.equal(topLayer(normalizePanelState({ mode: 'showcase', titlePanel: 'demo', lab: true, revived: false, pauseControls: false, logArchive: false, logReader: false, creditsRoll: false })), null);
});

// ---- data log layers (R8 lore track) ----
const CLEAR = { titlePanel: null, lab: false, revived: false, pauseControls: false, logArchive: false, logReader: false, creditsRoll: false } as const;

test('log layers: reader beats archive beats pause controls; archive and reader never reach the title or result', () => {
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'paused', logArchive: true })), 'log-archive');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'paused', logArchive: true, logReader: true })), 'log-reader');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'paused', logArchive: true, pauseControls: true })), 'log-archive');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'playing', logReader: true })), 'log-reader');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'title', logArchive: true, logReader: true })), 'title');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'result', logArchive: true, logReader: true })), 'result');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'result', creditsRoll: true })), 'credits-roll');
  assert.equal(topLayer(normalizePanelState({ ...CLEAR, mode: 'paused', creditsRoll: true })), 'pause');
});

test('log panels: ids exist, start hidden, sit on the stage, and use the sub panel layer', () => {
  for (const id of ['log-archive', 'log-reader', 'credits-roll']) {
    const el = dom.get(id);
    assert.ok(el, `#${id} exists`);
    assert.equal(el.parent, 'stage', `${id} is a stage child`);
    assert.ok(el.hidden, `${id} starts hidden`);
  }
  assert.equal(z('#log-archive'), z('#revived'));
  assert.equal(z('.scan-panel'), Number(rootVars['--z-subpanel']));
  assert.ok(z('.scan-panel') > z('.overlay'), 'reader and credits open above pause and result');
  assert.ok(z('#intro') > z('.scan-panel'), 'the intro still covers menus');
  const order = (id: string): number => html.indexOf(`id="${id}"`);
  assert.ok(order('log-reader') > order('log-archive'), 'reader follows the archive in DOM order so it wins the tie');
  for (const id of ['logs-open', 'logs-close', 'credits-roll-open', 'ending', 'lr-body', 'lr-title', 'lr-speaker', 'lr-stamp']) assert.ok(dom.has(id), `#${id}`);
  assert.equal(dom.get('logs-open')!.parent, 'pause', 'LOGS button lives in the pause menu');
  assert.equal(dom.get('log-archive')!.classes.includes('panel'), true, 'archive is opaque like the other panels');
});

test('uiAudit has a logs scenario that opens the archive from pause', () => {
  const src = read('src/ui/uiAudit.ts');
  assert.match(src, /name: 'logs', expectedTop: 'log-archive', clicks: \['logs-open'\], mode: 'paused'/);
});

import { auditShouldSkipControl } from '../src/ui/panels.ts';
import { meltdownPillVisible } from '../src/ui/objective.ts';

test('uiAudit skip rule: hidden/disabled controls skipped, real controls kept', () => {
  const base = { disabled: false, opacity: 1, ariaHiddenAncestor: false, clipped: false };
  assert.equal(auditShouldSkipControl(base), false);
  assert.equal(auditShouldSkipControl({ ...base, disabled: true }), true); // lab-jump
  assert.equal(auditShouldSkipControl({ ...base, clipped: true }), true); // lab-scenario in .sr-only
  assert.equal(auditShouldSkipControl({ ...base, ariaHiddenAncestor: true }), true);
  assert.equal(auditShouldSkipControl({ ...base, opacity: 0 }), true);
  // a half-transparent live control is a real issue and stays audited
  assert.equal(auditShouldSkipControl({ ...base, opacity: 0.3 }), false);
});

test('meltdown pill hides after extraction', () => {
  assert.equal(meltdownPillVisible({ status: 'playing', phase: 'escape', meltdownTicks: 4000 } as never), true);
  assert.equal(meltdownPillVisible({ status: 'won', phase: 'won', meltdownTicks: 4000 } as never), false);
  assert.equal(meltdownPillVisible({ status: 'playing', phase: 'explore', meltdownTicks: -1 } as never), false);
});

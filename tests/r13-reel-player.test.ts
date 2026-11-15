// ReelPlayer state machine against a fake host: cut order, lab only during the hook, end card only at the end,
// real-time length at any frame rate, outside interference, Esc.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ReelPlayer, type ReelHost } from '../src/ui/reelPlayer.ts';
import { REEL_CUTS, reelTotalSeconds, type ReelCut } from '../src/ui/reel.ts';

interface Fake extends ReelHost {
  labIsOpen: boolean;
  endOn: boolean;
  title: string;
  finished: number;
  views: string[];
  fade: number;
}

function fakeHost(): Fake {
  const h: Fake = {
    labIsOpen: false, endOn: false, title: '', finished: 0, views: [], fade: 0,
    reduce: () => false,
    view: () => 'modern',
    setView(v) { h.views.push(v); },
    lab(on) { h.labIsOpen = on; },
    labOpen: () => h.labIsOpen,
    opening() {},
    endCard(on) { h.endOn = on; },
    caption(t) { h.title = t; },
    canvasFade(f) { h.fade = f; },
    observe() {},
    resetFx() {},
    finish() { h.finished++; },
  };
  return h;
}

/** Run a whole reel at a fixed frame length, sampling every `every` seconds of reel time. */
function run(dt: number, tamper?: (h: Fake, t: number) => void): { rows: { t: number; cut: string; lab: boolean; end: boolean; title: string }[]; h: Fake; p: ReelPlayer; ended: number } {
  const h = fakeHost();
  const p = new ReelPlayer(h);
  p.start();
  const rows: { t: number; cut: string; lab: boolean; end: boolean; title: string }[] = [];
  let t = 0;
  let next = 0;
  let ended = -1;
  while (p.active && t < 200) {
    tamper?.(h, t);
    p.frame(dt);
    t += dt;
    if (!p.active) {
      ended = t;
      break;
    }
    if (t >= next) {
      rows.push({ t: Math.round(t * 10) / 10, cut: p.cut.id, lab: h.labIsOpen, end: h.endOn, title: h.title });
      next += 2;
    }
  }
  return { rows, h, p, ended };
}

function checkTimeline(rows: ReturnType<typeof run>['rows']): void {
  const order: string[] = [];
  for (const r of rows) {
    if (order[order.length - 1] !== r.cut) order.push(r.cut);
    const cut = REEL_CUTS.find((c) => c.id === r.cut) as ReelCut;
    assert.equal(r.lab, cut.target === 'lab', `lab at ${r.t}s in ${r.cut}`);
    assert.equal(r.end, cut.target === 'endcard', `endcard at ${r.t}s in ${r.cut}`);
    assert.equal(r.title, cut.caption, `caption at ${r.t}s`);
  }
  assert.deepEqual(order, REEL_CUTS.map((c) => c.id));
}

test('60 fps: every cut in order, lab only in the hook, end card last, done at the designed length', () => {
  const { rows, h, ended } = run(1 / 60);
  checkTimeline(rows);
  assert.equal(h.finished, 1);
  assert.ok(Math.abs(ended - reelTotalSeconds()) < 0.1, `ended ${ended}`);
  assert.equal(h.labIsOpen, false);
  assert.equal(h.endOn, false);
  assert.equal(h.title, '');
});

test('each cut stays up for its whole designed duration', () => {
  const { rows } = run(1 / 60);
  for (const c of REEL_CUTS) {
    const inside = rows.filter((r) => r.t > c.start + 0.1 && r.t < c.start + c.duration - 0.1);
    assert.ok(inside.length >= Math.floor(c.duration / 2) - 1, `${c.id} sampled ${inside.length}`);
    assert.ok(inside.every((r) => r.cut === c.id), c.id);
  }
});

test('slow frame rates (10 fps and 4 fps) still finish in about 90 seconds of reel time', () => {
  for (const dt of [0.1, 0.25]) {
    const { rows, h, ended } = run(dt);
    checkTimeline(rows);
    assert.equal(h.finished, 1);
    assert.ok(Math.abs(ended - reelTotalSeconds()) <= dt + 0.01, `dt ${dt} ended ${ended}`);
  }
});

test('lab hidden or shown from outside is corrected on the next frame', () => {
  let shown = false;
  let hid = false;
  const { rows, h } = run(1 / 60, (hh, t) => {
    if (!hid && t > 3) {
      hid = true;
      hh.labIsOpen = false; // closed by another handler during the hook cut
    }
    if (!shown && t > 30) {
      shown = true;
      hh.labIsOpen = true; // reopened by something else during the combat setup
    }
  });
  assert.ok(hid && shown);
  checkTimeline(rows);
  assert.equal(h.finished, 1);
});

test('stop() mid-reel tears everything down and does not call finish', () => {
  const h = fakeHost();
  const p = new ReelPlayer(h);
  p.start();
  for (let i = 0; i < 60 * 40; i++) p.frame(1 / 60);
  assert.equal(p.cut.id, 'combat');
  p.stop();
  assert.equal(p.active, false);
  assert.equal(h.labIsOpen, false);
  assert.equal(h.endOn, false);
  assert.equal(h.title, '');
  assert.equal(h.finished, 0);
  p.frame(1 / 60);
  assert.equal(h.title, '');
});

test('the scripted world follows the reel clock after a slow frame', () => {
  const h = fakeHost();
  const p = new ReelPlayer(h);
  p.start();
  for (let i = 0; i < 60 * 12.5; i++) p.frame(1 / 60); // into the classic cut
  const t0 = p.world.tick;
  p.frame(0.5);
  assert.ok(p.world.tick - t0 >= 29, `tick advanced ${p.world.tick - t0}`);
});

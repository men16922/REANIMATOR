// Restoration Lab view: binds the static #lab markup in index.html to the pure model in labModel.ts.
// Data and verdicts come from lab.ts (the same scenario, replay and comparator code as `make check`).
// Drawing only: nothing here changes a recorded value or a verdict.
import { labFields, labScenarios, runCase, type LabCase } from './lab.ts';
import { inputAt } from '../../tools/reference/scenario.ts';
import {
  SPRITE_H, SPRITE_W, LAB_SPEEDS, cardTitle, firstMismatch, fieldMismatchCounts, fitView, initialPlayback, matchGrid, playAdvance, playReduce,
  poseOf, runBounds, runFrame, spriteRows, summarize, toScreenX, toScreenY,
  type Bounds, type MatchGrid, type PlayAction, type Playback, type View,
} from './labModel.ts';

const ORIG = '#ffb34d';
const NEW = '#4be8ff';
const BAD = '#ff4757';

type Side = 'orig' | 'new';
const PALETTE: Record<Side, Record<string, string>> = {
  orig: { a: '#e8a24a', s: '#b9742a', h: '#ffd89a', g: '#6b7684', o: '#1a1208', v: '#fff1c8', r: '#9aa3ad' },
  new: { a: '#3fc7dd', s: '#2a8fa6', h: '#b8f4ff', g: '#6b7684', o: '#06161b', v: '#effcff', r: '#9aa3ad' },
};
const STATE_NAME: Record<number, string> = { 2: 'STAND', 4: 'JUMP', 5: 'FALL', 6: 'LAND', 10: 'RUN' };

export interface LabController {
  open(): void;
  close(): void;
  /** Current case for the debug snapshot (null before the first open). */
  current(): LabCase | null;
}

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

export function initLab(): LabController {
  const root = byId('lab');
  const sel = byId<HTMLSelectElement>('lab-scenario');
  const mut = byId<HTMLInputElement>('lab-mutation');
  const slider = byId<HTMLInputElement>('lab-tick');
  const classic = byId<HTMLInputElement>('lab-classic');
  const cvOrig = byId<HTMLCanvasElement>('lab-orig');
  const cvNew = byId<HTMLCanvasElement>('lab-new');
  const cvOver = byId<HTMLCanvasElement>('lab-plot');
  const cvHeat = byId<HTMLCanvasElement>('lab-heat');
  const gOrig = cvOrig.getContext('2d')!;
  const gNew = cvNew.getContext('2d')!;
  const gOver = cvOver.getContext('2d')!;
  const gHeat = cvHeat.getContext('2d')!;
  const fields = labFields();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let lab: LabCase | null = null;
  let grid: MatchGrid = [];
  let pb: Playback = initialPlayback(0);
  let view: View = { scale: 1, ox: 0, oy: 0 };
  let bounds: Bounds = { x0: 0, x1: 1, y0: 0, y1: 1 };
  let visible = false;
  let dirty = true;
  let last = 0;
  let reveal = 1;
  let raf = 0;
  let terrainNew = { floorY: 0, ceilY: 0, wallLeftX: 0 };

  // ---- scenario select + cards ----
  const scenarios = labScenarios();
  for (const s of scenarios) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.id}${s.holdout ? ' (holdout, judged once)' : ''}`;
    sel.append(o);
  }
  const cardsEl = byId('lab-cards');
  const cards = new Map<string, { btn: HTMLButtonElement; badge: HTMLElement }>();
  for (const s of scenarios) {
    const { code, name } = cardTitle(s.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lab-card';
    btn.dataset.id = s.id;
    btn.innerHTML = `<span class="lc-code">${code}${s.holdout ? '<em>HOLDOUT</em>' : ''}</span><span class="lc-name">${name}</span><span class="lc-ticks">${s.endN - s.startN + 1} ticks · n=${s.startN}..${s.endN}</span><span class="lc-badge">…</span>`;
    btn.addEventListener('click', () => { sel.value = s.id; run(); });
    cardsEl.append(btn);
    cards.set(s.id, { btn, badge: btn.querySelector('.lc-badge') as HTMLElement });
  }
  function paintCards(): void {
    for (const s of scenarios) {
      const c = cards.get(s.id)!;
      const status = runCase(s, mut.checked).status;
      c.badge.textContent = status;
      c.badge.className = `lc-badge ${status === 'PASS' ? 'pass' : 'fail'}`;
      c.btn.setAttribute('aria-pressed', String(s.id === sel.value));
    }
  }

  // ---- state changes ----
  function dispatch(a: PlayAction): void {
    pb = playReduce(pb, a);
    dirty = true;
  }
  function startReveal(): void {
    reveal = reduced ? 1 : 0;
    dirty = true;
  }

  function applyResolution(): void {
    // Classic mode renders the panels at 320x200, one world unit per source pixel multiple, no smoothing.
    const w = classic.checked ? 320 : 640, h = classic.checked ? 200 : 400;
    for (const cv of [cvOrig, cvNew]) {
      cv.width = w;
      cv.height = h;
      cv.classList.toggle('pixel', classic.checked);
    }
    if (lab && lab.expected.length) view = fitView(bounds, w, h, classic.checked);
    dirty = true;
  }

  function run(): void {
    const s = scenarios.find((x) => x.id === sel.value) ?? scenarios[0];
    sel.value = s.id;
    lab = runCase(s, mut.checked);
    grid = matchGrid(lab.expected, lab.actual, fields);
    terrainNew = mut.checked ? { ...s.terrain, wallLeftX: s.terrain.wallLeftX + 3 } : s.terrain;
    const max = Math.max(0, lab.expected.length - 1);
    const first = firstMismatch(grid);
    const hero = Math.floor(max * 0.55);
    pb = playReduce(pb, { type: 'load', max, tick: first ? first.tick : hero });
    slider.max = String(max);
    bounds = runBounds([lab.expected, lab.actual], { ...s.terrain, wallLeftX: Math.min(s.terrain.wallLeftX, terrainNew.wallLeftX) }, SPRITE_W, SPRITE_H);
    applyResolution();
    paintCards();
    paintStatus();
    dirty = true;
    root.dataset.verdict = lab.status === 'PASS' ? 'pass' : 'fail';
    root.classList.remove('lab-alarm');
    if (lab.status !== 'PASS') {
      void root.offsetWidth; // restart the CSS alarm animation
      root.classList.add('lab-alarm');
    }
    startReveal();
  }

  function paintStatus(): void {
    if (!lab) return;
    const sum = summarize(grid);
    const fd = lab.firstDifference as { index: number; field: string } | undefined;
    const el = byId('lab-status');
    el.textContent = `${lab.status}${lab.mutation ? ' — demo mutation' : ''}${
      fd ? ` · first difference n=${lab.scenario.startN + fd.index} ${fd.field}` : ` · ${lab.expected.length} ticks × ${fields.length} fields`
    }`;
    el.className = lab.status === 'PASS' ? 'pass' : 'fail';
    byId('lab-heat-sum').textContent = sum.allMatch
      ? `${sum.matched}/${sum.cells} cells match`
      : `${sum.mismatched} of ${sum.cells} cells differ in ${sum.badTicks} ticks`;
    byId('lab-heat-sum').className = sum.allMatch ? 'pass' : 'fail';
    const jump = byId<HTMLButtonElement>('lab-jump');
    jump.disabled = sum.allMatch;
    jump.title = sum.allMatch ? 'Every tick matches, nothing to jump to' : 'Jump to the first mismatching tick';
    const note = byId('lab-note');
    note.textContent =
      lab.mutation && sum.allMatch ? ' · this scenario never touches the wall, so the mutation changes nothing (correct)' : '';
  }

  // ---- drawing ----
  function drawSprite(g: CanvasRenderingContext2D, side: Side, row: Readonly<Record<string, number>>, tick: number, v: View, alpha: number, tint?: string): void {
    const pose = poseOf(row);
    const rows = spriteRows(pose, pose === 'run' ? runFrame(tick) : 0);
    const pal = PALETTE[side];
    const left = row.dir < 0;
    const px = Math.ceil(v.scale);
    const baseX = row.x - SPRITE_W / 2, baseY = row.y - SPRITE_H;
    g.globalAlpha = alpha;
    for (let r = 0; r < SPRITE_H; r++) {
      for (let c = 0; c < SPRITE_W; c++) {
        const ch = rows[r][left ? SPRITE_W - 1 - c : c];
        if (ch === '.') continue;
        g.fillStyle = tint ?? pal[ch] ?? '#fff';
        g.fillRect(toScreenX(v, baseX + c), toScreenY(v, baseY + r), px, px);
      }
    }
    g.globalAlpha = 1;
  }

  function drawWorld(g: CanvasRenderingContext2D, cv: HTMLCanvasElement, side: Side, tick: number): void {
    if (!lab || !lab.expected.length) return;
    const W = cv.width, H = cv.height;
    const t = side === 'orig' ? lab.scenario.terrain : terrainNew;
    const rows = side === 'orig' ? lab.expected : lab.actual;
    const color = side === 'orig' ? ORIG : NEW;
    const c = classic.checked;
    const i = Math.min(tick, rows.length - 1);
    const row = rows[i];
    const v = view;
    g.imageSmoothingEnabled = false;
    // background plate with a faint 16 unit rivet grid
    g.fillStyle = '#090e15';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#16202c';
    const x0 = Math.floor(bounds.x0 / 16) * 16, y0 = Math.floor(bounds.y0 / 16) * 16;
    for (let gx = x0; gx < bounds.x1 + 16; gx += 16) for (let gy = y0; gy < bounds.y1 + 16; gy += 16) g.fillRect(toScreenX(v, gx), toScreenY(v, gy), c ? 1 : 2, c ? 1 : 2);
    // floor slab, hatched
    const fy = toScreenY(v, t.floorY);
    g.fillStyle = '#18222e';
    g.fillRect(0, fy, W, H - fy);
    g.fillStyle = '#2a3846';
    g.fillRect(0, fy, W, Math.max(1, Math.round(v.scale)));
    g.fillStyle = '#101823';
    for (let hx = -H; hx < W; hx += 10) {
      for (let k = 0; k < H - fy; k += 2) g.fillRect(hx + k, fy + k, 2, 1);
    }
    // wall slab left of the collision plane (the plane itself is a point collider; the slab is drawn one half sprite back)
    const wx = toScreenX(v, t.wallLeftX - SPRITE_W / 2);
    g.fillStyle = '#223041';
    g.fillRect(0, 0, wx, fy);
    g.fillStyle = '#2a3846';
    g.fillRect(wx - Math.max(1, Math.round(v.scale)), 0, Math.max(1, Math.round(v.scale)), fy);
    g.fillStyle = '#0f1620';
    for (let ry = 6; ry < fy; ry += 18) g.fillRect(Math.max(0, wx - 7), ry, 3, 3);
    // ceiling, when the scenario declares one in view
    if (t.ceilY > bounds.y0 && t.ceilY < bounds.y1) {
      const cy = toScreenY(v, t.ceilY);
      g.fillStyle = '#18222e';
      g.fillRect(0, 0, W, cy);
      g.fillStyle = '#2a3846';
      g.fillRect(0, cy, W, Math.max(1, Math.round(v.scale)));
    }
    // collision plane, dashed; in the mutated replay the original plane stays as a ghost
    const planeX = toScreenX(v, t.wallLeftX);
    g.strokeStyle = side === 'new' && mut.checked ? BAD : color;
    g.globalAlpha = 0.85;
    g.setLineDash([4, 3]);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(planeX + 0.5, 0);
    g.lineTo(planeX + 0.5, fy);
    g.stroke();
    if (side === 'new' && mut.checked) {
      const ghost = toScreenX(v, lab.scenario.terrain.wallLeftX);
      g.strokeStyle = ORIG;
      g.beginPath();
      g.moveTo(ghost + 0.5, 0);
      g.lineTo(ghost + 0.5, fy);
      g.stroke();
    }
    g.setLineDash([]);
    g.globalAlpha = 1;
    // full path, faint; walked part, bright
    g.lineWidth = c ? 1 : 2;
    const path = (upTo: number): void => {
      g.beginPath();
      for (let k = 0; k <= upTo; k++) {
        const px = toScreenX(v, rows[k].x) + 0.5, py = toScreenY(v, rows[k].y - SPRITE_H / 2) + 0.5;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
    };
    g.strokeStyle = color;
    g.globalAlpha = 0.22;
    path(rows.length - 1);
    g.globalAlpha = 0.95;
    path(i);
    g.globalAlpha = 1;
    // afterimages every 4 ticks (skipped in classic: no alpha in the old palette)
    if (!c) for (let k = Math.max(0, i - 12); k < i; k += 4) drawSprite(g, side, rows[k], k, v, 0.12 + 0.12 * ((k - (i - 12)) / 12));
    // on the replay panel, show where the recorded run is when the two disagree
    const bad = grid[i]?.includes(false) ?? false;
    if (side === 'new' && bad) {
      const e = lab.expected[i];
      drawSprite(g, 'orig', e, i, v, c ? 1 : 0.4, c ? undefined : ORIG);
    }
    drawSprite(g, side, row, i, v, 1);
    if (bad) {
      g.strokeStyle = BAD;
      g.lineWidth = c ? 1 : 2;
      g.strokeRect(toScreenX(v, row.x - SPRITE_W / 2) - 2, toScreenY(v, row.y - SPRITE_H) - 2, Math.ceil(SPRITE_W * v.scale) + 4, Math.ceil(SPRITE_H * v.scale) + 4);
    }
    // HUD: tick, pose, scripted input
    const inp = inputAt(lab.scenario, lab.scenario.startN + i);
    const fs = c ? 8 : 15;
    g.font = `${fs}px ui-monospace, Menlo, monospace`;
    g.textBaseline = 'top';
    g.fillStyle = color;
    g.fillText(`n=${lab.scenario.startN + i}  ${STATE_NAME[row.state] ?? 'S' + row.state}`, 4, 3);
    g.fillStyle = '#9db4c8';
    const arrows = `${inp.xm < 0 ? '◀' : inp.xm > 0 ? '▶' : '·'}${inp.ym < 0 ? '▲' : inp.ym > 0 ? '▼' : '·'}`;
    g.textAlign = 'right';
    g.fillText(`input ${arrows}`, W - 4, 3);
    g.textAlign = 'left';
    if (mut.checked && side === 'new') {
      g.fillStyle = BAD;
      g.fillText('DEMO MUTATION: wall +3 px', 4, 3 + fs + 2);
    }
  }

  /** x(t) and y(t) of both runs overlaid; red ticks along the bottom mark every mismatching tick. */
  function drawOverlay(): void {
    if (!lab || !lab.expected.length) return;
    const g = gOver, W = cvOver.width, H = cvOver.height;
    const n = lab.expected.length;
    g.fillStyle = '#090e15';
    g.fillRect(0, 0, W, H);
    const lanes: Array<{ key: 'x' | 'y'; top: number; h: number }> = [{ key: 'x', top: 4, h: (H - 18) / 2 - 3 }, { key: 'y', top: 4 + (H - 18) / 2 + 3, h: (H - 18) / 2 - 3 }];
    const gx = (k: number): number => 34 + (k / Math.max(1, n - 1)) * (W - 40);
    g.font = '11px ui-monospace, Menlo, monospace';
    g.textBaseline = 'middle';
    for (const lane of lanes) {
      const vals = [...lab.expected, ...lab.actual].map((r) => r[lane.key]);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const sy = (val: number): number => lane.top + lane.h - ((val - lo) / Math.max(1, hi - lo)) * lane.h;
      g.fillStyle = '#101823';
      g.fillRect(34, lane.top, W - 40, lane.h);
      g.fillStyle = '#6f8aa3';
      g.textAlign = 'right';
      g.fillText(`${lane.key}(t)`, 30, lane.top + lane.h / 2);
      const line = (rows: readonly Record<string, number>[], color: string, w: number, dash: number[]): void => {
        g.strokeStyle = color;
        g.lineWidth = w;
        g.setLineDash(dash);
        g.beginPath();
        rows.forEach((r, k) => (k ? g.lineTo(gx(k), sy(r[lane.key])) : g.moveTo(gx(k), sy(r[lane.key]))));
        g.stroke();
        g.setLineDash([]);
      };
      line(lab.expected, ORIG, 3.5, []);
      line(lab.actual, NEW, 1.5, []);
    }
    for (let k = 0; k < n; k++) {
      if (grid[k]?.includes(false)) {
        g.fillStyle = BAD;
        g.fillRect(gx(k) - 1, H - 12, 3, 8);
      }
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(Math.round(gx(pb.tick)) + 0.5, 0);
    g.lineTo(Math.round(gx(pb.tick)) + 0.5, H - 14);
    g.stroke();
    g.textAlign = 'left';
  }

  function heatGeom(): { cw: number; ch: number } {
    const n = Math.max(1, grid.length);
    return { cw: cvHeat.width / n, ch: cvHeat.height / fields.length };
  }
  function drawHeat(): void {
    const g = gHeat;
    const { cw, ch } = heatGeom();
    g.fillStyle = '#0a1018';
    g.fillRect(0, 0, cvHeat.width, cvHeat.height);
    const shown = Math.floor(reveal * grid.length);
    for (let t = 0; t < grid.length; t++) {
      for (let f = 0; f < fields.length; f++) {
        const x = Math.floor(t * cw), y = Math.floor(f * ch);
        const w = Math.max(1, Math.floor((t + 1) * cw) - x - 1), h = Math.max(1, Math.floor((f + 1) * ch) - y - 1);
        if (t >= shown) g.fillStyle = '#18222e';
        else g.fillStyle = grid[t][f] ? (t % 2 ? '#238a4c' : '#27984f') : BAD;
        g.fillRect(x, y, w, h);
      }
    }
    // scan line while the grid is being revealed
    if (reveal < 1) {
      g.fillStyle = '#ffffff';
      g.fillRect(Math.floor(shown * cw), 0, 2, cvHeat.height);
    }
    const first = firstMismatch(grid);
    if (first && reveal >= 1) {
      g.strokeStyle = '#ffe14d';
      g.lineWidth = 2;
      g.strokeRect(Math.floor(first.tick * cw) - 1, Math.floor(first.field * ch) - 1, Math.max(4, cw) + 1, ch + 1);
    }
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    g.strokeRect(Math.floor(pb.tick * cw) + 0.5, 0.5, Math.max(2, Math.floor(cw) - 1), cvHeat.height - 1);
  }

  function paintTable(): void {
    if (!lab || !lab.expected.length) return;
    const i = Math.min(pb.tick, lab.expected.length - 1);
    const e = lab.expected[i], a = lab.actual[i];
    const first = firstMismatch(grid);
    const counts = fieldMismatchCounts(grid);
    const body = fields
      .map((f, k) => {
        const ok = e[f] === a[f];
        const isFirst = first !== null && first.tick === i && first.field === k;
        const cls = [ok ? 'ok' : 'diff', isFirst ? 'first' : ''].join(' ').trim();
        const delta = ok ? '' : ` <small>Δ${a[f] - e[f] > 0 ? '+' : ''}${a[f] - e[f]}</small>`;
        const total = counts[k] ? `<small class="miss">${counts[k]}✗</small>` : '';
        return `<tr class="${cls}"><th>${f} ${total}</th><td>${e[f]}</td><td>${a[f]}${delta}</td><td class="mark">${ok ? '✓' : '✗'}</td></tr>`;
      })
      .join('');
    byId('lab-table').innerHTML = `<tr><th>field</th><th>recorded</th><th>replay</th><th></th></tr>${body}`;
    byId('lab-n').textContent = `n=${lab.scenario.startN + i} · ${i + 1}/${lab.expected.length}`;
    slider.value = String(i);
    const play = byId('lab-play');
    play.textContent = pb.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', pb.playing ? 'Pause' : 'Play');
    play.classList.toggle('attn', !pb.playing && pb.tick === Math.floor(pb.max * 0.55) && !!lab && lab.status === 'PASS');
    byId('lab-speed').textContent = `${LAB_SPEEDS[pb.speedIdx]}×`;
  }

  function paint(): void {
    drawWorld(gOrig, cvOrig, 'orig', pb.tick);
    drawWorld(gNew, cvNew, 'new', pb.tick);
    drawOverlay();
    drawHeat();
    paintTable();
  }

  function frame(now: number): void {
    raf = 0;
    if (root.hidden) visible = false; // closed from outside (Escape handler, panel reset)
    if (!visible) return;
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (pb.playing) {
      const before = pb.tick;
      pb = playAdvance(pb, dt);
      if (pb.tick !== before) dirty = true;
    }
    if (reveal < 1) {
      reveal = Math.min(1, reveal + dt / 700);
      dirty = true;
    }
    if (dirty) {
      dirty = false;
      paint();
    }
    raf = requestAnimationFrame(frame);
  }

  // ---- inputs ----
  sel.addEventListener('change', run);
  mut.addEventListener('change', () => {
    run();
    const first = firstMismatch(grid);
    // Turning the demo mutation on is the money shot: pause on the first disagreement.
    if (first) dispatch({ type: 'seek', tick: first.tick });
  });
  classic.addEventListener('change', applyResolution);
  slider.addEventListener('input', () => dispatch({ type: 'seek', tick: Number(slider.value) }));
  byId('lab-play').addEventListener('click', () => dispatch({ type: 'toggle' }));
  byId('lab-restart').addEventListener('click', () => dispatch({ type: 'restart' }));
  byId('lab-prev').addEventListener('click', () => dispatch({ type: 'step', by: -1 }));
  byId('lab-next').addEventListener('click', () => dispatch({ type: 'step', by: 1 }));
  byId('lab-speed').addEventListener('click', () => dispatch({ type: 'cycleSpeed' }));
  byId('lab-jump').addEventListener('click', () => {
    const first = firstMismatch(grid);
    if (first) dispatch({ type: 'seek', tick: first.tick });
  });
  byId('lab-close').addEventListener('click', () => api.close());
  const seekFromHeat = (ev: PointerEvent): void => {
    const r = cvHeat.getBoundingClientRect();
    const t = Math.floor(((ev.clientX - r.left) / Math.max(1, r.width)) * grid.length);
    dispatch({ type: 'seek', tick: Math.min(grid.length - 1, Math.max(0, t)) });
  };
  cvHeat.addEventListener('pointerdown', (ev) => {
    cvHeat.setPointerCapture(ev.pointerId);
    seekFromHeat(ev);
  });
  cvHeat.addEventListener('pointermove', (ev) => {
    if (cvHeat.hasPointerCapture(ev.pointerId)) seekFromHeat(ev);
  });
  window.addEventListener('keydown', (ev) => {
    if (!visible) return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return;
    if (ev.code === 'Space') dispatch({ type: 'toggle' });
    else if (ev.code === 'ArrowRight') dispatch({ type: 'step', by: 1 });
    else if (ev.code === 'ArrowLeft') dispatch({ type: 'step', by: -1 });
    else return;
    ev.preventDefault();
  });

  // heatmap row labels, one per field
  byId('lab-heat-labels').innerHTML = fields.map((f) => `<span>${f}</span>`).join('');

  const api: LabController = {
    open(): void {
      root.hidden = false;
      visible = true;
      last = 0;
      run();
      if (!raf) raf = requestAnimationFrame(frame);
    },
    close(): void {
      root.hidden = true;
      visible = false;
      dispatch({ type: 'pause' });
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    current: () => lab,
  };
  // Keep the internal loop alive after state changes made while the panel is open (select, mutation, ...).
  // The select/mutation handlers call run() directly, which also repaints on the next frame.
  return api;
}

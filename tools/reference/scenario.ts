// Pure scenario replay shared by the CLI verifier and the in-browser Restoration Lab (no fs, no crypto).
import { step, type Body, type Input, type Terrain } from '../../src/engine/motion.ts';
import type { HRow } from './hlog.ts';
import type { Row } from './compare.ts';

export interface Scenario {
  id: string; covers: string[]; holdout: boolean; expected: string; initialStateId: string;
  startN: number; endN: number; terrain: Terrain;
  inputs: { from: number; to: number; xm: -1 | 0 | 1; ym: -1 | 0 | 1 }[];
  excludedFields: string[]; knownLimits: string[];
}
export interface Fixture {
  originalExeSha256: string; validationKind: string; measuredFields: string[];
  toleranceContract: string; scenarios: Scenario[];
}

export function inputAt(s: Scenario, n: number): Input {
  let xm: -1 | 0 | 1 = 0;
  let ym: -1 | 0 | 1 = 0;
  for (const r of s.inputs) {
    if (n >= r.from && n <= r.to) {
      if (r.xm !== 0) xm = r.xm;
      if (r.ym !== 0) ym = r.ym;
    }
  }
  return { xm, ym };
}

export function toBody(r: HRow): Body {
  return {
    x: r.v.x, y: r.v.y, xvel: r.v.xvel, yvel: r.v.yvel, xacel: r.v.xacel, yacel: r.v.yacel,
    fyvel: r.v.fyvel, fyacel: r.v.fyacel, dir: r.v.dir as 1 | -1, state: r.v.state,
    gravity: r.v.gravity as 0 | 1, landTicks: 0,
  };
}

export const bodyRow = (b: Body): Row => ({
  x: b.x, y: b.y, xvel: b.xvel, yvel: b.yvel, dir: b.dir, state: b.state, xacel: b.xacel,
  yacel: b.yacel, gravity: b.gravity, fyvel: b.fyvel, fyacel: b.fyacel,
});

export type Window = { ok: true; rows: HRow[] } | { ok: false; reason: string };

/** reference rows startN..endN, contiguous */
export function windowOf(rows: HRow[], s: Scenario): Window {
  const byN = new Map(rows.map((r) => [r.n, r]));
  const win: HRow[] = [];
  for (let n = s.startN; n <= s.endN; n++) {
    const r = byN.get(n);
    if (!r) return { ok: false, reason: `reference lacks n=${n}` };
    win.push(r);
  }
  return { ok: true, rows: win };
}

/** first n whose recorded input differs from the declared script, or null */
export function inputMismatch(s: Scenario, win: HRow[]): number | null {
  for (const r of win.slice(0, -1)) {
    const i = inputAt(s, r.n);
    if (i.xm !== r.xv || i.ym !== r.yv) return r.n;
  }
  return null;
}

/** Engine replay: starts from the first reference row only; never reads later rows. */
export function replay(s: Scenario, win: HRow[]): Row[] {
  let b = toBody(win[0]);
  const actual: Row[] = [bodyRow(b)];
  for (const r of win.slice(0, -1)) {
    b = step(b, inputAt(s, r.n), s.terrain);
    actual.push(bodyRow(b));
  }
  return actual;
}

export const expectedRows = (fx: Fixture, win: HRow[]): Row[] =>
  win.map((r) => Object.fromEntries(fx.measuredFields.map((f) => [f, (r.v as Record<string, number>)[f]])) as Row);

// Restoration Lab: original-run state log ("Recorded DOS reference") vs engine replay ("Reimplementation replay").
// Uses the same scenario/replay/comparator code as `make check`.
import fixtureJson from '../../reference/fixtures/scenarios.json';
import devLog from '../../reference/fixtures/expected/dev_v8.hlog.txt?raw';
import m04Log from '../../reference/fixtures/expected/dev_m04_v8.hlog.txt?raw';
import m05Log from '../../reference/holdout/m05_v8.hlog.txt?raw';
import { parseHlog } from '../../tools/reference/hlog.ts';
import { compare, type Row } from '../../tools/reference/compare.ts';
import { windowOf, replay, expectedRows, type Fixture, type Scenario } from '../../tools/reference/scenario.ts';

const fx = fixtureJson as unknown as Fixture;
const logs: Record<string, string> = {
  'reference/fixtures/expected/dev_v8.hlog.txt': devLog,
  'reference/fixtures/expected/dev_m04_v8.hlog.txt': m04Log,
  'reference/holdout/m05_v8.hlog.txt': m05Log,
};

export interface LabCase { scenario: Scenario; expected: Row[]; actual: Row[]; status: string; firstDifference?: unknown; mutation: boolean }

export function runCase(s: Scenario, mutation: boolean): LabCase {
  const rows = parseHlog(logs[s.expected]);
  const w = windowOf(rows, s);
  if (!w.ok) return { scenario: s, expected: [], actual: [], status: 'ERROR', mutation };
  const sc = mutation ? { ...s, terrain: { ...s.terrain, wallLeftX: s.terrain.wallLeftX + 3 } } : s;
  const expected = expectedRows(fx, w.rows);
  const actual = replay(sc, w.rows);
  const c = compare(expected, actual, fx.measuredFields);
  return { scenario: s, expected, actual, status: c.status, firstDifference: c.firstDifference, mutation };
}

export const labScenarios = () => fx.scenarios;
export const labFields = () => fx.measuredFields;

/** draw x/y traces of both runs and a cursor at index i */
export function plot(g: CanvasRenderingContext2D, c: LabCase, i: number) {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = '#0b0f14'; g.fillRect(0, 0, W, H);
  const all = [...c.expected, ...c.actual];
  if (all.length === 0) return;
  const xs = all.map((r) => r.x), ys = all.map((r) => r.y);
  const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
  const sx = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * (W - 20) + 10;
  const sy = (y: number) => ((y - y0) / Math.max(1, y1 - y0)) * (H - 40) + 20;
  const trace = (rows: Row[], color: string, dash: number[]) => {
    g.strokeStyle = color; g.setLineDash(dash); g.lineWidth = 2; g.beginPath();
    rows.forEach((r, k) => (k ? g.lineTo(sx(r.x), sy(r.y)) : g.moveTo(sx(r.x), sy(r.y))));
    g.stroke(); g.setLineDash([]);
  };
  trace(c.expected, '#f0a64a', []);
  trace(c.actual, '#5fd3e8', [5, 4]);
  const e = c.expected[Math.min(i, c.expected.length - 1)], a = c.actual[Math.min(i, c.actual.length - 1)];
  g.fillStyle = '#f0a64a'; g.fillRect(sx(e.x) - 4, sy(e.y) - 4, 8, 8);
  g.strokeStyle = '#5fd3e8'; g.strokeRect(sx(a.x) - 6, sy(a.y) - 6, 12, 12);
  g.font = '12px ui-monospace, monospace';
  g.fillStyle = '#f0a64a'; g.fillText('■ Recorded DOS reference (original ABUSE.EXE run log)', 10, 14);
  g.fillStyle = '#5fd3e8'; g.fillText('□ Reimplementation replay (src/engine/motion.ts)', 10, H - 6);
}

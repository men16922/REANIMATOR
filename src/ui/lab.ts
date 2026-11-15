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

// Reference verifier. `node tools/reference/verify.ts [--holdout]`
// Exit code 0 only when every selected scenario is PASS. Missing fixtures => NOT RUN (non-zero).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseHlog, type HRow, HlogError } from './hlog.ts';
import { compare, type Status } from './compare.ts';
import { inputAt, windowOf, inputMismatch, replay, expectedRows, type Fixture, type Scenario } from './scenario.ts';

export { inputAt };
const root = resolve(import.meta.dirname, '../..');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export interface Result {
  scenarioId: string; status: Status; reason?: string; referenceSha256?: string; inputHash?: string;
  validationKind: string; measuredFields: string[]; excludedFields: string[]; toleranceContract: string;
  initialStateId: string; checkedRows: number; firstDifference?: unknown; knownLimits: string[];
  toolVersions: { node: string }; holdout: boolean;
}

export function runScenario(fx: Fixture, s: Scenario): Result {
  const base = {
    scenarioId: s.id, validationKind: fx.validationKind, measuredFields: fx.measuredFields,
    excludedFields: s.excludedFields, toleranceContract: fx.toleranceContract, initialStateId: s.initialStateId,
    knownLimits: s.knownLimits, toolVersions: { node: process.version }, holdout: s.holdout, checkedRows: 0,
  };
  const path = resolve(root, s.expected);
  if (!existsSync(path)) return { ...base, status: 'NOT RUN', reason: `missing ${s.expected}` };
  const raw = readFileSync(path);
  let rows: HRow[];
  try { rows = parseHlog(raw.toString('latin1')); } catch (e) {
    if (e instanceof HlogError) return { ...base, status: 'ERROR', reason: `corrupt reference: ${e.message}`, referenceSha256: sha(raw) };
    throw e;
  }
  const w = windowOf(rows, s);
  if (!w.ok) return { ...base, status: 'ERROR', reason: w.reason, referenceSha256: sha(raw) };
  // Input consistency: the recorded input columns must equal the declared script (guards against a wrong reference).
  const bad = inputMismatch(s, w.rows);
  if (bad !== null) return { ...base, status: 'ERROR', reason: `declared input differs from recorded input at n=${bad}`, referenceSha256: sha(raw) };
  const inputHash = sha(JSON.stringify(w.rows.slice(0, -1).map((r) => ({ n: r.n, ...inputAt(s, r.n) }))));
  const c = compare(expectedRows(fx, w.rows), replay(s, w.rows), fx.measuredFields, {});
  return { ...base, status: c.status, reason: c.reason, firstDifference: c.firstDifference, checkedRows: c.checkedRows, referenceSha256: sha(raw), inputHash };
}

export function loadFixture(): Fixture {
  return JSON.parse(readFileSync(resolve(root, 'reference/fixtures/scenarios.json'), 'utf8')) as Fixture;
}

if (import.meta.main) {
  const withHoldout = process.argv.includes('--holdout');
  const fx = loadFixture();
  if (fx.originalExeSha256.length !== 64) throw new Error('fixture lacks original hash');
  const selected = fx.scenarios.filter((s) => withHoldout || !s.holdout);
  if (selected.length === 0) { console.log(JSON.stringify({ status: 'NOT RUN', reason: 'no scenarios' })); process.exit(2); }
  const results = selected.map((s) => runScenario(fx, s));
  for (const r of results) console.log(JSON.stringify(r));
  const summary = Object.fromEntries((['PASS', 'FAIL', 'ERROR', 'NOT RUN'] as Status[]).map((k) => [k, results.filter((r) => r.status === k).length]));
  console.log(JSON.stringify({ summary }));
  process.exit(results.every((r) => r.status === 'PASS') ? 0 : 1);
}

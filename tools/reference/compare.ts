// Comparator. The only module that reads expected and actual together.
// Status per docs/reference/VERIFICATION_CONTRACT.md section 7.

export type Status = 'PASS' | 'FAIL' | 'ERROR' | 'NOT RUN';
export type Row = Record<string, number>;

export interface CompareResult {
  status: Status;
  checkedRows: number;
  firstDifference?: { index: number; field: string; expected: number; actual: number };
  reason?: string;
}

/** tolerance is per-field absolute; the G2 contract is exact (0) and must not be widened after a FAIL. */
export function compare(
  expected: readonly Row[] | undefined,
  actual: readonly Row[] | undefined,
  fields: readonly string[],
  tolerance: Readonly<Record<string, number>> = {},
): CompareResult {
  if (!expected) return { status: 'NOT RUN', checkedRows: 0, reason: 'expected reference missing' };
  if (expected.length === 0) return { status: 'NOT RUN', checkedRows: 0, reason: 'empty expected set' };
  if (!actual) return { status: 'ERROR', checkedRows: 0, reason: 'actual missing' };
  if (fields.length === 0) return { status: 'ERROR', checkedRows: 0, reason: 'no measured fields declared' };
  if (actual.length !== expected.length) {
    return {
      status: 'FAIL',
      checkedRows: Math.min(actual.length, expected.length),
      reason: `length mismatch expected=${expected.length} actual=${actual.length}`,
    };
  }
  for (let i = 0; i < expected.length; i++) {
    for (const f of fields) {
      const e = expected[i][f];
      const a = actual[i][f];
      if (typeof e !== 'number' || !Number.isFinite(e)) {
        return { status: 'ERROR', checkedRows: i, reason: `expected row ${i} field ${f} missing or non-numeric` };
      }
      if (typeof a !== 'number' || !Number.isFinite(a)) {
        return { status: 'FAIL', checkedRows: i, firstDifference: { index: i, field: f, expected: e, actual: NaN }, reason: 'actual field missing' };
      }
      if (Math.abs(e - a) > (tolerance[f] ?? 0)) {
        return { status: 'FAIL', checkedRows: i, firstDifference: { index: i, field: f, expected: e, actual: a } };
      }
    }
  }
  return { status: 'PASS', checkedRows: expected.length };
}

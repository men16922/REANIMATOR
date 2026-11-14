// Loader for original-run state logs written by reference/harness/HARNESS.v8.LSP.
// Record: (n tick xv yv level (x y xvel yvel dir state xacel yacel fx fy fxvel fyvel fxacel fyacel gravity))

export const FIELDS = [
  'x', 'y', 'xvel', 'yvel', 'dir', 'state', 'xacel', 'yacel',
  'fx', 'fy', 'fxvel', 'fyvel', 'fxacel', 'fyacel', 'gravity',
] as const;
export type Field = (typeof FIELDS)[number];

export interface HRow {
  n: number;
  tick: number;
  xv: number;
  yv: number;
  level: string;
  v: Record<Field, number>;
}

const REC = /\((-?\d+) (-?\d+) (-?\d+) (-?\d+) (\S*) ?\(([^()]*)\)\)/g;

export class HlogError extends Error {}

export function parseHlog(text: string): HRow[] {
  const rows: HRow[] = [];
  let consumed = 0;
  for (const m of text.matchAll(REC)) {
    consumed += m[0].replace(/\s/g, '').length;
    const nums = m[6].trim().split(/\s+/).map((s) => (s === 'T' ? 1 : s === 'nil' ? 0 : Number(s)));
    if (nums.length !== FIELDS.length || nums.some((x) => !Number.isFinite(x))) {
      throw new HlogError(`record n=${m[1]}: expected ${FIELDS.length} numeric fields, got ${nums.length}`);
    }
    const v = {} as Record<Field, number>;
    FIELDS.forEach((f, i) => (v[f] = nums[i]));
    rows.push({ n: Number(m[1]), tick: Number(m[2]), xv: Number(m[3]), yv: Number(m[4]), level: m[5], v });
  }
  if (rows.length === 0) throw new HlogError('no records');
  if (consumed !== text.replace(/\s/g, '').length) throw new HlogError('trailing or malformed content');
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].n !== rows[i - 1].n + 1) throw new HlogError(`non-contiguous n at ${rows[i].n}`);
  }
  return rows;
}

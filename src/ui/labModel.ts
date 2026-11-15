// Restoration Lab pure model: match grid, mismatch search, playback state machine, pose picker, view fit, sprite data.
// No DOM, no canvas, no fixture access, so node tests can cover it. The browser code is src/ui/labView.ts.
// Nothing here changes how recorded and replayed rows are compared: the verdict still comes from tools/reference/compare.ts.

export type LabRow = Readonly<Record<string, number>>;

// ---------- match grid ----------

/** grid[tick][field] is true when recorded and replayed values are exactly equal (the G2 contract uses zero tolerance). */
export type MatchGrid = boolean[][];

export function matchGrid(expected: readonly LabRow[], actual: readonly LabRow[], fields: readonly string[]): MatchGrid {
  const n = Math.max(expected.length, actual.length);
  const grid: MatchGrid = [];
  for (let i = 0; i < n; i++) {
    const e = expected[i];
    const a = actual[i];
    grid.push(fields.map((f) => e !== undefined && a !== undefined && Number.isFinite(e[f]) && e[f] === a[f]));
  }
  return grid;
}

export interface Mismatch { tick: number; field: number }

/** First mismatching cell in tick-major order (earliest tick, then field order). Same order as the comparator. */
export function firstMismatch(grid: MatchGrid): Mismatch | null {
  for (let t = 0; t < grid.length; t++) {
    const f = grid[t].indexOf(false);
    if (f >= 0) return { tick: t, field: f };
  }
  return null;
}

/** First mismatching tick strictly after `from`, wrapping to the first one, or null when everything matches. */
export function nextMismatchTick(grid: MatchGrid, from: number): number | null {
  for (let t = from + 1; t < grid.length; t++) if (grid[t].includes(false)) return t;
  for (let t = 0; t <= Math.min(from, grid.length - 1); t++) if (grid[t].includes(false)) return t;
  return null;
}

export interface GridSummary { ticks: number; fields: number; cells: number; matched: number; mismatched: number; badTicks: number; allMatch: boolean }

export function summarize(grid: MatchGrid): GridSummary {
  let matched = 0;
  let mismatched = 0;
  let badTicks = 0;
  const fields = grid.length ? grid[0].length : 0;
  for (const row of grid) {
    let bad = false;
    for (const ok of row) {
      if (ok) matched++;
      else { mismatched++; bad = true; }
    }
    if (bad) badTicks++;
  }
  return { ticks: grid.length, fields, cells: matched + mismatched, matched, mismatched, badTicks, allMatch: mismatched === 0 && grid.length > 0 };
}

/** Per-field mismatch count, for the table footer and heatmap row tint. */
export function fieldMismatchCounts(grid: MatchGrid): number[] {
  const out = grid.length ? grid[0].map(() => 0) : [];
  for (const row of grid) row.forEach((ok, f) => { if (!ok) out[f]++; });
  return out;
}

// ---------- playback state machine ----------

/** The recorded run is sampled at the 15 Hz design tick (the original tick was not measured). */
export const LAB_TICK_HZ = 15;
export const LAB_SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4];

export interface Playback { tick: number; max: number; playing: boolean; speedIdx: number; acc: number }

export type PlayAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'step'; by: 1 | -1 }
  | { type: 'seek'; tick: number }
  | { type: 'restart' }
  | { type: 'speed'; idx: number }
  | { type: 'cycleSpeed' }
  | { type: 'load'; max: number; tick?: number };

export const initialPlayback = (max = 0): Playback => ({ tick: 0, max: Math.max(0, max), playing: false, speedIdx: 2, acc: 0 });

const clampTick = (t: number, max: number): number => Math.min(max, Math.max(0, Math.round(t)));

export function playReduce(s: Playback, a: PlayAction): Playback {
  switch (a.type) {
    case 'play':
      // Pressing play on the last tick starts over, like a media player.
      return { ...s, playing: true, tick: s.tick >= s.max ? 0 : s.tick, acc: 0 };
    case 'pause':
      return { ...s, playing: false, acc: 0 };
    case 'toggle':
      return playReduce(s, { type: s.playing ? 'pause' : 'play' });
    case 'step':
      return { ...s, playing: false, acc: 0, tick: clampTick(s.tick + a.by, s.max) };
    case 'seek':
      return { ...s, acc: 0, tick: clampTick(a.tick, s.max) };
    case 'restart':
      return { ...s, tick: 0, acc: 0 };
    case 'speed':
      return { ...s, speedIdx: Math.min(LAB_SPEEDS.length - 1, Math.max(0, a.idx)) };
    case 'cycleSpeed':
      return { ...s, speedIdx: (s.speedIdx + 1) % LAB_SPEEDS.length };
    case 'load':
      return { ...s, max: Math.max(0, a.max), tick: clampTick(a.tick ?? 0, Math.max(0, a.max)), playing: false, acc: 0 };
  }
}

/** Advance by real elapsed milliseconds. Whole ticks are consumed, the fraction carries over. Stops on the last tick. */
export function playAdvance(s: Playback, dtMs: number): Playback {
  if (!s.playing || !(dtMs > 0)) return s;
  const acc = s.acc + (dtMs / 1000) * LAB_TICK_HZ * LAB_SPEEDS[s.speedIdx];
  const whole = Math.floor(acc);
  const tick = Math.min(s.max, s.tick + whole);
  if (tick >= s.max) return { ...s, tick: s.max, playing: false, acc: 0 };
  return { ...s, tick, acc: acc - whole };
}

// ---------- pose and view ----------

export type Pose = 'idle' | 'run' | 'rise' | 'fall' | 'land';

/** Pose from recorded state values observed in the logs: 2 stand, 10 run, 4 jump rise, 5 fall, 6 landing. Velocity breaks ties. */
export function poseOf(row: LabRow): Pose {
  switch (row.state) {
    case 4: return 'rise';
    case 5: return 'fall';
    case 6: return 'land';
    case 10: return 'run';
    default:
      if (row.gravity === 1) return row.yvel < 0 ? 'rise' : 'fall';
      return row.xvel !== 0 ? 'run' : 'idle';
  }
}

export interface Bounds { x0: number; x1: number; y0: number; y1: number }
export interface View { scale: number; ox: number; oy: number }

/** Bounds of every row of every given run plus the collision geometry that falls inside a sane range, padded by the sprite size. */
export function runBounds(runs: readonly (readonly LabRow[])[], terrain: { floorY: number; ceilY: number; wallLeftX: number }, spriteW: number, spriteH: number): Bounds {
  let x0 = terrain.wallLeftX, x1 = terrain.wallLeftX, y0 = terrain.floorY, y1 = terrain.floorY;
  for (const rows of runs) for (const r of rows) {
    if (r.x < x0) x0 = r.x;
    if (r.x > x1) x1 = r.x;
    if (r.y < y0) y0 = r.y;
    if (r.y > y1) y1 = r.y;
  }
  // The sprite stands on y and is centered on x.
  x0 -= spriteW / 2 + 4;
  x1 += spriteW / 2 + 4;
  y0 -= spriteH + 4;
  y1 += 8;
  // A ceiling only matters when it is close enough to frame (S1 declares -1000 for "none").
  if (terrain.ceilY > y0 - 40 && terrain.ceilY < y1) y0 = Math.min(y0, terrain.ceilY - 3);
  return { x0, x1, y0, y1 };
}

/** Largest scale that fits `b` into w x h. Integer scale when `integer` (pixel-perfect classic mode). Content is centered. */
export function fitView(b: Bounds, w: number, h: number, integer: boolean): View {
  const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
  let scale = Math.min(w / bw, h / bh);
  if (integer) scale = Math.max(1, Math.floor(scale));
  return { scale, ox: Math.round((w - bw * scale) / 2 - b.x0 * scale), oy: Math.round((h - bh * scale) / 2 - b.y0 * scale) };
}

export const toScreenX = (v: View, x: number): number => Math.round(x * v.scale + v.ox);
export const toScreenY = (v: View, y: number): number => Math.round(y * v.scale + v.oy);

// ---------- scenario cards ----------

const WORDS: Record<string, string> = { spawn: 'Spawn', fall: 'Fall', run: 'Run', wall: 'Wall', jump: 'Jump', air: 'Air', in: 'in', place: 'place', holdout: 'Holdout' };

/** "S1-spawn-fall-run-wall" -> { code: "S1", name: "Spawn · Fall · Run · Wall" }; "M05-holdout-jump-in-place" -> code "M05". */
export function cardTitle(id: string): { code: string; name: string } {
  const [code, ...rest] = id.split('-');
  const words = rest.filter((w) => w !== 'holdout');
  // "in place" reads as one phrase
  const merged: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'in' && words[i + 1] === 'place') { merged.push('In place'); i++; } else merged.push(WORDS[words[i]] ?? words[i]);
  }
  return { code, name: merged.join(' · ') };
}

// ---------- sprite (original pixel art; no original art is used) ----------

export const SPRITE_W = 12;
export const SPRITE_H = 22;

/** Keys: . clear, o outline, a armor (tinted per panel), s armor shade, v visor, g steel, r rifle, h highlight. */
const HEAD_TORSO = [
  '...oooooo...',
  '..ohhaaaao..',
  '..oavvvvao..',
  '..oavvvvao..',
  '...oaaaao...',
  '..oogggoo...',
  '.oaaaaaaao..',
  'oaasaaaasaoo',
  'oaasaaaasrrr',
  'oagaaaaagorr',
  '.ogaaaaago..',
  '.oaaggggao..',
];
const HEAD_TORSO_RAISED = [
  '...oooooo...',
  '..ohhaaaao..',
  '..oavvvvao..',
  '..oavvvvao..',
  '...oaaaao...',
  '..oogggoo...',
  '.oaaaaaaao..',
  'oaasaaaasaoo',
  'oaasaaaasrrr',
  'oagaaaaagorr',
  '.ogaaaaago..',
  '.oaaggggao..',
];

const LEGS: Record<Pose, string[][]> = {
  idle: [['.oaao.oaao..', '.oaao.oaao..', '.oaao.oaao..', '.oaao.oaao..', '.ogoo.oogo..', 'oggoo.oogg..', 'oooo...oooo.']],
  run: [
    ['..oaaoaao...', '.oaao..oaao.', 'oaao....oao.', 'oao.....oaao', 'ogo......oao', 'ogoo.....ogo', 'ooo.....oooo'],
    ['.oaaooaao...', '..oaoooao...', '..oaoo.oao..', '..ogo..ogo..', '..oggo.ogo..', '..oooo.ooo..', '............'],
  ],
  rise: [['.oaao.oaao..', '.oaaooaao...', '..oaaaao....', '..ogooogo...', '..oooooooo..']],
  fall: [['oaao...oaao.', 'oaao...oaao.', 'oao.....oao.', 'ogo.....ogo.', 'ogo.....ogo.', 'ooo.....ooo.']],
  land: [['.oaaaaaaao..', 'oaaoooooaao.', 'oggo...oggo.', 'oooo...oooo.']],
};

/** Sprite rows for a pose, SPRITE_H rows of SPRITE_W chars, facing right, feet on the last row. `frame` picks the run stride. */
export function spriteRows(pose: Pose, frame: 0 | 1 = 0): string[] {
  const frames = LEGS[pose];
  const legs = frames[Math.min(frame, frames.length - 1)];
  const body = (pose === 'rise' ? HEAD_TORSO_RAISED : HEAD_TORSO).concat(legs);
  const blank = '.'.repeat(SPRITE_W);
  return [...Array.from({ length: Math.max(0, SPRITE_H - body.length) }, () => blank), ...body].slice(-SPRITE_H);
}

/** The run animation alternates two leg poses while moving; every other pose is static. Frame follows the tick, not wall time. */
export function runFrame(tick: number): 0 | 1 {
  return (Math.floor(tick / 2) % 2) as 0 | 1;
}

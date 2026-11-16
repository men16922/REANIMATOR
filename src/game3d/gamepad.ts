// Gamepad (standard mapping) to input-intent mapping. Pure: the DOM layer polls navigator.getGamepads() and passes a
// plain snapshot, so this file never touches the simulation, the clock or randomness.
//
// Standard mapping: A jump, B dash, X fire, Y interact, LB/RB weapon prev/next, LT counter, RT fire, Start pause,
// left stick or dpad move (down = drop through grate), right stick (else left stick) aims.

export const PAD_DEADZONE = 0.25;
export const PAD_TRIGGER_THRESHOLD = 0.4;

export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value?: number }[];
}

export interface PadIntent {
  moveX: number;
  jump: boolean;
  fire: boolean;
  dropDown: boolean;
  /** Held this poll; the caller turns the rising edge into one action. */
  dash: boolean;
  interact: boolean;
  counter: boolean;
  weaponPrev: boolean;
  weaponNext: boolean;
  start: boolean;
  /** Unit-ish aim direction (y up), or null when no stick is outside the deadzone. */
  aim: { x: number; y: number } | null;
}

export const emptyPadIntent = (): PadIntent => ({
  moveX: 0, jump: false, fire: false, dropDown: false, dash: false, interact: false, counter: false,
  weaponPrev: false, weaponNext: false, start: false, aim: null,
});

/** Radial deadzone with rescale, so the output ramps from 0 at the edge of the deadzone to 1 at full tilt. */
export function applyDeadzone(x: number, y: number, dz = PAD_DEADZONE): { x: number; y: number } {
  const fx = Number.isFinite(x) ? x : 0;
  const fy = Number.isFinite(y) ? y : 0;
  const m = Math.hypot(fx, fy);
  if (m <= dz) return { x: 0, y: 0 };
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  return { x: fx * s, y: fy * s };
}

const btn = (p: PadSnapshot, i: number): boolean => !!p.buttons[i]?.pressed;
const trig = (p: PadSnapshot, i: number): boolean => btn(p, i) || (p.buttons[i]?.value ?? 0) > PAD_TRIGGER_THRESHOLD;

export function mapGamepad(p: PadSnapshot | null | undefined): PadIntent {
  if (!p) return emptyPadIntent();
  const l = applyDeadzone(p.axes[0] ?? 0, p.axes[1] ?? 0);
  const r = applyDeadzone(p.axes[2] ?? 0, p.axes[3] ?? 0);
  const dpadX = (btn(p, 15) ? 1 : 0) - (btn(p, 14) ? 1 : 0);
  const moveX = dpadX !== 0 ? dpadX : Math.abs(l.x) > 0 ? Math.sign(l.x) * Math.min(1, Math.abs(l.x)) : 0;
  const dropDown = btn(p, 13) || l.y > 0.6;
  let aim: { x: number; y: number } | null = null;
  if (r.x !== 0 || r.y !== 0) aim = { x: r.x, y: -r.y };
  else if (l.x !== 0 || l.y !== 0) aim = { x: l.x, y: -l.y };
  return {
    moveX,
    jump: btn(p, 0) || btn(p, 12),
    fire: btn(p, 2) || trig(p, 7),
    dropDown,
    dash: btn(p, 1),
    interact: btn(p, 3),
    counter: trig(p, 6),
    weaponPrev: btn(p, 4),
    weaponNext: btn(p, 5),
    start: btn(p, 9),
    aim,
  };
}

/** Rising edge helper: true only on the poll where `now` turns on. */
export const risingEdge = (prev: boolean, now: boolean): boolean => now && !prev;

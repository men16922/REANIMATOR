// Pure re-implementation of the observed Abuse `cop_mover -> mover` motion rules (G2).
// Evidence: docs/reconstruction/BEHAVIOR_MAP.md (binary 0x3a1d8, 0x38704, 0x14760; observed hlog v8).
// No DOM, clock, RNG, or fixture access. The engine never reads expected values.

export interface Body {
  x: number;
  y: number;
  xvel: number;
  yvel: number;
  xacel: number;
  yacel: number;
  /** fractional velocity accumulator (observed as fyvel), 0..255 */
  fyvel: number;
  /** fractional acceleration accumulator (observed as fyacel), 0..255 */
  fyacel: number;
  dir: 1 | -1;
  /** 2 idle, 4 jump rising, 5 falling, 6 landing, 10 running */
  state: number;
  gravity: 0 | 1;
  /** ticks spent in landing state 6 (engine-internal) */
  landTicks: number;
}

export interface Input {
  /** -1 left, 0 none, 1 right */
  xm: -1 | 0 | 1;
  /** -1 = up/jump */
  ym: -1 | 0 | 1;
}

/** Geometry a reference scenario declares (observed values, not original level data). */
export interface Terrain {
  floorY: number;
  ceilY: number;
  wallLeftX: number;
}

/**
 * Collision geometry used by try_move. The restored motion rules call only these methods.
 * `planeCollider` reproduces the reference-scenario geometry; tile colliders are new-design (src/engine/collider.ts).
 */
export interface Collider {
  /** clipped x after moving horizontally from x toward wantX at feet height y */
  clipX(x: number, y: number, wantX: number): number;
  /** clipped y after moving vertically from y toward wantY at x; `floor` when stopped by ground */
  clipY(x: number, y: number, wantY: number): { y: number; floor: boolean };
  /** true when there is ground directly under the feet (used only by new-design ledge falling) */
  grounded(x: number, y: number): boolean;
}

export function planeCollider(t: Terrain): Collider {
  return {
    clipX: (_x, _y, wantX) => Math.max(wantX, t.wallLeftX),
    clipY: (_x, _y, wantY) => {
      let y = wantY;
      if (y < t.ceilY) y = t.ceilY;
      if (y >= t.floorY) return { y: t.floorY, floor: true };
      return { y, floor: false };
    },
    grounded: (_x, y) => y >= t.floorY,
  };
}

/** Abilities of the player character as listed in LISP/PEOPLE.LSP and read via 0x3d96f. */
export const ABILITY = {
  start_accel: 8,
  stop_accel: 9,
  jump_yvel: -15,
  run_top_speed: 9,
  walk_top_speed: 3,
  jump_top_speed: 10,
  jump_xvel: 9,
} as const;

const GRAVITY_FRAC = 200;
const LAND_TICKS = 3;

export function step(prev: Readonly<Body>, input: Input, terrain: Terrain | Collider): Body {
  const col: Collider = 'clipX' in terrain ? terrain : planeCollider(terrain);
  const b: Body = { ...prev };

  // ---- new-design: walking off a ledge starts a fall (original ground probe 0x38704 not modelled) ----
  if (b.gravity === 0 && !col.grounded(b.x, b.y)) {
    b.gravity = 1;
    if (b.state === 2 || b.state === 10 || b.state === 6) b.state = 5;
  }

  // ---- 0x3a1d8: input handling -------------------------------------------------
  if (b.state === 2 || b.state === 6 || b.state === 10) {
    if (input.xm !== 0) {
      b.dir = input.xm;
      if (b.state === 2 || b.state === 6) {
        // 0x3a265 / 0x3a27e: leaving idle
        if (input.xm > 0) b.xvel = ABILITY.run_top_speed;
        b.state = 10;
      }
      // 0x3a9a2: xacel = +/- start_accel
      b.xacel = input.xm * ABILITY.start_accel;
      // 0x3a9cf..0x3aa4b: clamp against the speed limit of the current state
      const limit = ABILITY.run_top_speed;
      if (Math.abs(b.xvel + b.xacel) > limit) {
        const signed = b.xacel < 0 ? -limit : limit;
        b.xacel = signed - b.xvel;
      }
    } else if (b.gravity === 0) {
      // 0x3a3e0: no horizontal input on the ground -> decelerate by stop_accel (applies to every grounded state).
      // Observed only for |xvel| == stop_accel; larger speeds are inferred from the same branch.
      if (Math.abs(b.xvel) <= ABILITY.stop_accel) {
        b.xvel = 0;
        b.xacel = 0;
        if (b.state === 10) b.state = 2;
      } else {
        b.xacel = b.xvel > 0 ? -ABILITY.stop_accel : ABILITY.stop_accel;
      }
    }
    if (input.ym < 0 && (b.state === 2 || b.state === 10) && b.gravity === 0) {
      // jump start (observed from idle)
      b.yvel = ABILITY.jump_yvel;
      b.state = 4;
      b.gravity = 1;
      b.landTicks = 0;
    }
  }

  // ---- landing timer (state 6 lasts LAND_TICKS ticks) -------------------------
  if (prev.state === 6 && b.state === 6) {
    b.landTicks = prev.landTicks + 1;
    if (b.landTicks >= LAND_TICKS) b.state = 2;
  }

  // ---- 0x14760 cop_mover: falling state change and terminal-velocity rule -------
  // observed: state 4 becomes 5 at tick start once yvel > 0 (hlog m04 n58->59, S2 n176->177)
  if (b.state === 4 && b.yvel > 0) b.state = 5;
  // 0x14760: `if (10 < yvel) { yacel = 0; yvel -= 1; }` (decompile lines near 0x1478x)
  if (b.gravity === 1 && b.yvel > 10) {
    b.yacel = 0;
    b.yvel -= 1;
  }
  // 0x3a376: in state 5 held xm sets xacel = +/- start_accel (air control; limit jump_top_speed is unverified in free flight)
  if (b.state === 5 && input.xm !== 0) {
    b.dir = input.xm;
    b.xacel = input.xm * ABILITY.start_accel;
    if (Math.abs(b.xvel + b.xacel) > ABILITY.jump_top_speed) {
      b.xacel = (b.xacel < 0 ? -ABILITY.jump_top_speed : ABILITY.jump_top_speed) - b.xvel;
    }
  }

  // ---- 0x38704: integrate -----------------------------------------------------
  b.xvel += b.xacel;
  if (b.gravity === 1) {
    const t = b.yacel >= 0 ? b.fyacel + GRAVITY_FRAC : ((-b.fyacel) & 255) - GRAVITY_FRAC;
    b.yacel += t >> 8;
    b.fyacel = t & 255;
    const b5 = b.yacel >= 0 ? b.fyacel : -b.fyacel & 255;
    const b14 = b.yvel >= 0 ? b.fyvel : -b.fyvel & 255;
    const sum = b14 + b5;
    b.yvel = b.yvel + (sum >> 8) + b.yacel;
    b.fyvel = sum & 255;
  }

  // ---- try_move (0x37e82 / 0x558e5) against the declared terrain --------------
  const wantX = b.x + b.xvel;
  const nx = col.clipX(b.x, b.y, wantX);
  const movedX = nx - b.x;
  const blockedX = nx !== wantX;
  b.x = nx;
  b.xvel = movedX;
  if (blockedX) {
    b.xvel = 0;
    // observed: grounded block clears xacel and returns to idle; airborne block keeps xacel (hlog m04 n59..61)
    if (prev.gravity === 0) {
      b.xacel = 0;
      if (b.state !== 4) b.state = 2; // jump start keeps state 4 (hlog m04 n52->53)
    }
  }

  if (b.gravity === 1) {
    const r = col.clipY(b.x, b.y, b.y + b.yvel);
    const ny = r.y;
    const landed = r.floor;
    b.yvel = ny - b.y;
    b.y = ny;
    if (landed) {
      b.yvel = 0;
      b.yacel = 0;
      b.fyvel = 0;
      b.fyacel = 0;
      b.gravity = 0;
      b.state = 6;
      b.landTicks = 0;
    }
  }
  return b;
}

export function spawnBody(x: number, y: number): Body {
  return {
    x, y, xvel: 0, yvel: 0, xacel: 0, yacel: 0, fyvel: 0, fyacel: 0,
    dir: 1, state: 2, gravity: 1, landTicks: 0,
  };
}

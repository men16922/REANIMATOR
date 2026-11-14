// Deterministic XY platforming steering shared by tools/game/reach3d.ts and bot3d.ts.
// Pure function of the body, a target point and the previous jump-held flag. No world state is touched.

import type { Body3D } from '../engine/motion3d.ts';

export interface NavTarget {
  x: number;
  y: number;
  /** Jump at the start even when the target is not above (gap crossing) */
  leap?: boolean;
  /** Horizontal tolerance for "arrived" and for holding still */
  tolX?: number;
  tolY?: number;
}

export interface NavOptions {
  maxJumps: number;
}

export interface NavOutput {
  moveX: number;
  jump: boolean;
  dropDown: boolean;
}

export const NAV_DEFAULT_TOL_X = 0.5;
export const NAV_DEFAULT_TOL_Y = 0.6;

export function navReached(b: Readonly<Body3D>, t: NavTarget): boolean {
  return Math.abs(t.x - b.x) <= (t.tolX ?? NAV_DEFAULT_TOL_X) && Math.abs(t.y - b.y) <= (t.tolY ?? NAV_DEFAULT_TOL_Y);
}

export function navSteer(b: Readonly<Body3D>, t: NavTarget, prevJump: boolean, opts: NavOptions): NavOutput {
  const tolX = t.tolX ?? NAV_DEFAULT_TOL_X;
  const dx = t.x - b.x;
  const dy = t.y - b.y;
  const moveX = Math.abs(dx) > tolX ? Math.sign(dx) : 0;
  const wantUp = dy > 0.5;
  const wantDown = dy < -0.5;

  let jump = false;
  if (b.grounded) {
    // A jump needs a fresh press, so release for one tick after landing
    if ((wantUp || (t.leap && !wantDown && Math.abs(dx) > tolX)) && !prevJump) jump = true;
  } else if (b.jumpsUsed >= 2 || opts.maxJumps < 2) {
    jump = b.vy > 0 && prevJump; // hold for full height
  } else if (b.vy > 1.5) {
    jump = prevJump; // first jump still rising
  } else if (wantUp) {
    jump = !prevJump; // release, then press again for the Thruster jump
  }

  const dropDown = wantDown && b.grounded && Math.abs(dx) <= Math.max(tolX, 1.5);
  return { moveX, jump, dropDown };
}

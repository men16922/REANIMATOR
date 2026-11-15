// Pure 60 Hz 3D capsule kinematics adapted from Abuse's observed cop_mover/mover rules (Metroidvania 3D side-view extension).
// Preserves Abuse's instant high-traction start/stop feel, asymmetric jump curve, coyote time, jump buffering,
// Thruster double-jump, one-way platforms with drop-through, optional Z-lane lock, and Shift Jet-Dash.

import type { BoxKind3D, Collider3D, MapSolid3D, Pillar3D, Ramp3D } from '../game3d/types3d.ts';

export type BoxSolid3D = MapSolid3D;
export type { BoxKind3D, Collider3D, Pillar3D, Ramp3D };

export interface Body3D {
  x: number;
  y: number; // feet world elevation (Y-up)
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number; // body facing yaw in XZ plane (0 = +Z)
  grounded: boolean;
  /** 0 idle, 1 running, 2 jump rising, 3 falling, 4 landing, 5 dashing */
  state: number;
  landTicks: number;
  dashTicks: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirZ: number;
  coyoteTicks: number;
  jumpBufferTicks: number;
  jumpsUsed: number;
  prevJumpHeld: boolean;
  dropThroughTicks: number;
  /** -1 wall on the west, +1 wall on the east, 0 none (airborne contact probe) */
  wallDir: number;
  /** Ticks left in which input toward the wall is ignored after a wall jump */
  wallJumpLock: number;
  /** True while a down-dash stomp dive is in progress */
  stomping: boolean;
  /** Transient one-tick flags read by the world to raise events and effects */
  wallJumped: boolean;
  dashCanceled: boolean;
  stompStarted: boolean;
  stompLanded: boolean;
}

export interface MoveInput3D {
  /** Normalized or raw move axes in XZ plane (-1..1) */
  moveX: number;
  moveZ: number;
  jump: boolean;
  dash: boolean;
  /** Fallback dash heading if player dashes while stationary */
  aimDirX: number;
  aimDirZ: number;
  dropDown?: boolean;
  maxJumps?: number;
  lockZ?: boolean;
}

/** Kinematic constants scaled from Abuse's LISP ABILITY ratio and tuned for Metroidvania side-view play. */
export const ABILITY_3D = {
  dt: 1 / 60,
  radius: 0.42,
  height: 1.82,
  runTopSpeed: 9.4,
  startAccelPerSec: 86,
  stopDecelPerSec: 104,
  airAccelPerSec: 58,
  jumpVel: 10.6,
  doubleJumpVel: 9.8,
  gravity: 24.5,
  terminalFallVel: -19.5,
  stepUpHeight: 0.38,
  dashSpeed: 21.5,
  dashTicks: 11,
  dashCooldownTicks: 58,
  landTicks: 5,
  /** Wall slide: max fall speed while pressing into a wall (all players) */
  wallSlideSpeed: -3.2,
  /** Wall jump (needs Thruster Boots): up and away from the wall */
  wallJumpVy: 10.0,
  wallJumpVx: 8.6,
  wallJumpLockTicks: 8,
  /** Dash cancel: jumping out of a dash keeps this fraction of dash speed */
  dashCancelKeep: 0.62,
  /** Down-dash stomp dive */
  stompSpeed: -27,
  stompCooldownTicks: 40,
} as const;

export function spawnBody3D(x: number, y: number, z: number): Body3D {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: Math.PI / 2,
    grounded: true,
    state: 0,
    landTicks: 0,
    dashTicks: 0,
    dashCooldown: 0,
    dashDirX: 1,
    dashDirZ: 0,
    coyoteTicks: 0,
    jumpBufferTicks: 0,
    jumpsUsed: 0,
    prevJumpHeld: false,
    dropThroughTicks: 0,
    wallDir: 0,
    wallJumpLock: 0,
    stomping: false,
    wallJumped: false,
    dashCanceled: false,
    stompStarted: false,
    stompLanded: false,
  };
}

/** Returns exact surface elevation under (x, z) reachable from current feet Y, or -Infinity if none. */
export function floorHeightAt3D(
  x: number,
  z: number,
  currentY: number,
  radius: number,
  col: Collider3D,
  skipPlatforms = false,
): number {
  let best = -Infinity;
  const maxStep = currentY + ABILITY_3D.stepUpHeight;

  for (const s of col.solids) {
    if (col.isSolidActive && !col.isSolidActive(s)) continue;
    // One-way platforms only support feet when approaching from above/at top face
    if (s.kind === 'platform' && (skipPlatforms || currentY < s.maxY - 0.14)) continue;
    if (
      x + radius > s.minX &&
      x - radius < s.maxX &&
      z + radius > s.minZ &&
      z - radius < s.maxZ &&
      s.maxY <= maxStep &&
      s.maxY > best
    ) {
      best = s.maxY;
    }
  }

  for (const r of col.ramps) {
    if (x + radius * 0.4 > r.minX && x - radius * 0.4 < r.maxX && z + radius * 0.4 > r.minZ && z - radius * 0.4 < r.maxZ) {
      const t =
        r.axis === 'x'
          ? Math.max(0, Math.min(1, (x - r.minX) / Math.max(0.01, r.maxX - r.minX)))
          : Math.max(0, Math.min(1, (z - r.minZ) / Math.max(0.01, r.maxZ - r.minZ)));
      const yRamp = r.yMinEdge + (r.yMaxEdge - r.yMinEdge) * t;
      if (yRamp <= currentY + ABILITY_3D.stepUpHeight + 0.25 && yRamp > best) {
        best = yRamp;
      }
    }
  }

  for (const p of col.pillars) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < (p.radius + radius * 0.5) ** 2 && p.maxY <= maxStep && p.maxY > best) {
      best = p.maxY;
    }
  }

  return best;
}

/** Resolve horizontal capsule pushout against active non-platform solids and pillars at vertical span [y + stepUp, y + height]. */
export function resolveHorizontal3D(
  x: number,
  y: number,
  z: number,
  radius: number,
  height: number,
  col: Collider3D,
): { x: number; z: number; hitWall: boolean } {
  let rx = x;
  let rz = z;
  let hitWall = false;
  const footClear = y + ABILITY_3D.stepUpHeight;
  const headTop = y + height - 0.1;

  for (let pass = 0; pass < 2; pass++) {
    for (const s of col.solids) {
      if (col.isSolidActive && !col.isSolidActive(s)) continue;
      if (s.kind === 'platform') continue;
      if (s.maxY <= footClear || s.minY >= headTop) continue;
      const cx = Math.max(s.minX, Math.min(rx, s.maxX));
      const cz = Math.max(s.minZ, Math.min(rz, s.maxZ));
      const dx = rx - cx;
      const dz = rz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        hitWall = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          rx += (dx / d) * push;
          rz += (dz / d) * push;
        } else {
          // Inside AABB: push along shallowest face
          const penL = rx - s.minX;
          const penR = s.maxX - rx;
          const penB = rz - s.minZ;
          const penF = s.maxZ - rz;
          const minPen = Math.min(penL, penR, penB, penF);
          if (minPen === penL) rx = s.minX - radius;
          else if (minPen === penR) rx = s.maxX + radius;
          else if (minPen === penB) rz = s.minZ - radius;
          else rz = s.maxZ + radius;
        }
      }
    }

    for (const p of col.pillars) {
      if (p.maxY <= footClear || p.minY >= headTop) continue;
      const dx = rx - p.x;
      const dz = rz - p.z;
      const minD = p.radius + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD * minD) {
        hitWall = true;
        const d = Math.sqrt(Math.max(1e-8, d2));
        const push = minD - d;
        rx += (dx / d) * push;
        rz += (dz / d) * push;
      }
    }
  }

  return { x: rx, z: rz, hitWall };
}

export function stepBody3D(prev: Readonly<Body3D>, input: MoveInput3D, col: Collider3D): Body3D {
  const b: Body3D = { ...prev };
  const dt = ABILITY_3D.dt;
  const lockZ = input.lockZ ?? true;
  const maxJumps = input.maxJumps ?? 1;

  if (lockZ) {
    b.z = 0;
    b.vz = 0;
  }

  if (b.dashCooldown > 0) b.dashCooldown--;
  if (b.dropThroughTicks > 0) b.dropThroughTicks--;
  if (b.wallJumpLock > 0) b.wallJumpLock--;
  b.wallJumped = false;
  b.dashCanceled = false;
  b.stompStarted = false;
  b.stompLanded = false;

  const jumpPressed = input.jump && !prev.prevJumpHeld;
  b.prevJumpHeld = input.jump;
  if (b.jumpBufferTicks > 0) b.jumpBufferTicks--;
  if (jumpPressed) b.jumpBufferTicks = 6;

  if (b.grounded) {
    b.coyoteTicks = 6;
    b.jumpsUsed = 0;
  } else if (b.coyoteTicks > 0) {
    b.coyoteTicks--;
  }

  // One-way platform drop-through when grounded directly on a platform
  let droppedThroughThisTick = false;
  if (b.grounded && input.dropDown) {
    const solidFloor = floorHeightAt3D(b.x, b.z, b.y, ABILITY_3D.radius, col, true);
    const anyFloor = floorHeightAt3D(b.x, b.z, b.y, ABILITY_3D.radius, col, false);
    if (solidFloor < anyFloor - 0.05) {
      b.dropThroughTicks = 12;
      b.grounded = false;
      b.vy = -2.2;
      b.coyoteTicks = 0;
      b.jumpBufferTicks = 0;
      droppedThroughThisTick = true;
    }
  }

  // Normalize movement vector
  const rawMoveX = input.moveX;
  const rawMoveZ = lockZ ? 0 : input.moveZ;
  const moveMag = Math.hypot(rawMoveX, rawMoveZ);
  const mx = moveMag > 1e-4 ? rawMoveX / Math.max(1, moveMag) : 0;
  const mz = moveMag > 1e-4 ? rawMoveZ / Math.max(1, moveMag) : 0;

  let launchedThisTick = false;

  // Dash cancel: a fresh jump press ends the dash and keeps momentum (needs a jump to spend)
  if (b.dashTicks > 0 && jumpPressed && !b.stomping) {
    const canJump = b.grounded || b.coyoteTicks > 0 || (maxJumps > 1 && b.jumpsUsed < maxJumps);
    if (canJump) {
      b.dashTicks = 0;
      b.vx = b.dashDirX * ABILITY_3D.dashSpeed * ABILITY_3D.dashCancelKeep;
      b.dashCanceled = true;
    }
  }

  // Down-dash stomp: airborne dash while holding down dives straight to the floor
  const wantStomp =
    input.dash && !!input.dropDown && !b.grounded && b.dashTicks === 0 && b.dashCooldown === 0 && !b.stomping && b.y > -24;
  if (wantStomp) {
    b.stomping = true;
    b.stompStarted = true;
    b.dashCooldown = ABILITY_3D.stompCooldownTicks;
    b.vx *= 0.15;
    b.vy = ABILITY_3D.stompSpeed;
    b.dropThroughTicks = Math.max(b.dropThroughTicks, 0);
  }

  // Trigger tactical Jet-Dash
  if (!wantStomp && !b.stomping && input.dash && b.dashTicks === 0 && b.dashCooldown === 0) {
    let dx = mx;
    let dz = mz;
    if (moveMag < 0.05) {
      const aimZ = lockZ ? 0 : input.aimDirZ;
      const am = Math.hypot(input.aimDirX, aimZ);
      if (am > 1e-4) {
        dx = input.aimDirX / am;
        dz = aimZ / am;
      } else if (lockZ) {
        dx = Math.sin(b.yaw) >= 0 ? 1 : -1;
        dz = 0;
      } else {
        dx = Math.sin(b.yaw);
        dz = Math.cos(b.yaw);
      }
    } else {
      const dm = Math.hypot(dx, dz);
      dx /= dm;
      dz /= dm;
    }
    b.dashTicks = ABILITY_3D.dashTicks;
    b.dashCooldown = ABILITY_3D.dashCooldownTicks;
    b.dashDirX = dx;
    b.dashDirZ = dz;
    b.vx = dx * ABILITY_3D.dashSpeed;
    b.vz = lockZ ? 0 : dz * ABILITY_3D.dashSpeed;
    b.state = 5;
  }

  if (b.stomping) {
    b.vx = 0;
    b.vy = ABILITY_3D.stompSpeed;
    b.state = 3;
  } else if (b.dashTicks > 0) {
    b.dashTicks--;
    b.vx = b.dashDirX * ABILITY_3D.dashSpeed;
    b.vz = lockZ ? 0 : b.dashDirZ * ABILITY_3D.dashSpeed;
    b.vy = Math.max(0, b.vy * 0.2);
    b.state = 5;
  } else {
    // Horizontal acceleration / high-traction Abuse stop
    if (moveMag > 0.05 && b.wallJumpLock === 0) {
      const targetVx = mx * ABILITY_3D.runTopSpeed;
      const targetVz = mz * ABILITY_3D.runTopSpeed;
      const accel = (b.grounded ? ABILITY_3D.startAccelPerSec : ABILITY_3D.airAccelPerSec) * dt;
      const dvx = targetVx - b.vx;
      const dvz = targetVz - b.vz;
      const dv = Math.hypot(dvx, dvz);
      if (dv <= accel) {
        b.vx = targetVx;
        b.vz = targetVz;
      } else {
        b.vx += (dvx / dv) * accel;
        b.vz += (dvz / dv) * accel;
      }
      b.yaw = Math.atan2(mx, mz);
    } else if (b.grounded) {
      const decel = ABILITY_3D.stopDecelPerSec * dt;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp <= decel) {
        b.vx = 0;
        b.vz = 0;
      } else {
        const s = (sp - decel) / sp;
        b.vx *= s;
        b.vz *= s;
      }
    }

    // Jump launch: ground/coyote/buffered first jump, or Thruster double-jump
    if (!droppedThroughThisTick) {
      if (b.jumpBufferTicks > 0 && (b.grounded || b.coyoteTicks > 0)) {
        b.vy = ABILITY_3D.jumpVel;
        b.grounded = false;
        b.coyoteTicks = 0;
        b.jumpBufferTicks = 0;
        b.jumpsUsed = 1;
        b.state = 2;
        b.landTicks = 0;
        launchedThisTick = true;
      } else if (jumpPressed && !b.grounded && maxJumps > 1 && b.jumpsUsed < maxJumps && b.wallDir === 0) {
        b.vy = ABILITY_3D.doubleJumpVel;
        b.jumpsUsed = Math.max(2, b.jumpsUsed + 1);
        b.jumpBufferTicks = 0;
        b.state = 2;
        b.landTicks = 0;
        launchedThisTick = true;
      }
      // Wall jump (Thruster Boots only, so it never opens a Boots gate for an unequipped player)
      if (!launchedThisTick && jumpPressed && !b.grounded && maxJumps > 1 && b.wallDir !== 0 && prev.wallDir !== 0) {
        b.vy = ABILITY_3D.wallJumpVy;
        b.vx = -b.wallDir * ABILITY_3D.wallJumpVx;
        b.wallJumpLock = ABILITY_3D.wallJumpLockTicks;
        b.jumpsUsed = 1;
        b.jumpBufferTicks = 0;
        b.state = 2;
        b.landTicks = 0;
        b.wallJumped = true;
        launchedThisTick = true;
      }
    }
  }

  // Asymmetric Abuse jump curve gravity & terminal fall clamp
  if (!b.grounded && b.dashTicks === 0 && !launchedThisTick && !b.stomping) {
    let g = 23.0;
    if (Math.abs(b.vy) < 1.65) {
      g = 12.0;
    } else if (b.vy >= 1.65 && !input.jump && b.vy > 4.2) {
      g = 40.0;
    } else if (b.vy <= -1.65) {
      g = 34.0;
    }
    b.vy = Math.max(ABILITY_3D.terminalFallVel, b.vy - g * dt);
    // Wall slide: pressing into a wall while falling caps the fall speed
    if (b.wallDir !== 0 && b.vy < ABILITY_3D.wallSlideSpeed && Math.sign(mx) === b.wallDir) {
      b.vy = ABILITY_3D.wallSlideSpeed;
    }
  }

  // Horizontal integration + smooth wall/pillar slide
  const wantX = b.x + b.vx * dt;
  const wantZ = lockZ ? 0 : b.z + b.vz * dt;
  const res = resolveHorizontal3D(wantX, b.y, wantZ, ABILITY_3D.radius, ABILITY_3D.height, col);
  const actualVx = (res.x - b.x) / dt;
  const actualVz = (res.z - b.z) / dt;
  b.x = res.x;
  b.z = lockZ ? 0 : res.z;
  if (res.hitWall) {
    // Project velocity onto slid movement rather than fighting solid walls
    b.vx = Math.abs(actualVx) < 0.05 ? 0 : actualVx;
    b.vz = lockZ || Math.abs(actualVz) < 0.05 ? 0 : actualVz;
  }
  if (lockZ) {
    b.z = 0;
    b.vz = 0;
  }

  // Vertical integration + ramp/catwalk/platform floor snapping
  const groundY = floorHeightAt3D(b.x, b.z, b.y, ABILITY_3D.radius, col, b.dropThroughTicks > 0);
  const wantY = b.y + b.vy * dt;
  let justLanded = false;

  if (b.grounded) {
    if (groundY > -Infinity && groundY >= b.y - 0.32 && groundY <= b.y + ABILITY_3D.stepUpHeight + 0.1) {
      // Smoothly walk down ramps & ledges within step-down snap
      b.y = groundY;
      b.vy = 0;
    } else {
      b.grounded = false;
      b.y = wantY;
    }
  } else {
    if (b.vy <= 0 && groundY > -Infinity && wantY <= groundY && prev.y >= groundY - ABILITY_3D.stepUpHeight) {
      b.y = groundY;
      b.vy = 0;
      b.grounded = true;
      justLanded = true;
      if (b.stomping) {
        b.stomping = false;
        b.stompLanded = true;
      }
    } else {
      b.y = wantY;
      // Check ceiling clip (skip one-way platforms so rising passes freely through them)
      for (const s of col.solids) {
        if (col.isSolidActive && !col.isSolidActive(s)) continue;
        if (s.kind === 'platform') continue;
        if (
          b.x + ABILITY_3D.radius > s.minX &&
          b.x - ABILITY_3D.radius < s.maxX &&
          b.z + ABILITY_3D.radius > s.minZ &&
          b.z - ABILITY_3D.radius < s.maxZ &&
          b.y + ABILITY_3D.height > s.minY &&
          prev.y + ABILITY_3D.height <= s.minY + 0.15 &&
          b.vy > 0
        ) {
          b.y = s.minY - ABILITY_3D.height;
          b.vy = 0;
        }
      }
    }
  }

  // Wall contact probe (airborne only): used by wall slide / wall jump next tick
  b.wallDir = 0;
  if (!b.grounded && !b.stomping) {
    const pref = mx !== 0 ? Math.sign(mx) : 0;
    const order = pref === -1 ? [-1, 1] : [1, -1];
    for (const dir of order) {
      if (resolveHorizontal3D(b.x + dir * 0.08, b.y, b.z, ABILITY_3D.radius, ABILITY_3D.height, col).hitWall) {
        b.wallDir = dir;
        break;
      }
    }
  }

  // Fallback safety floor clamp below deepest map sector
  if (b.y < -25) {
    b.stomping = false;
    if (!b.grounded) justLanded = true;
    b.y = 0;
    b.vy = 0;
    b.grounded = true;
  }

  // State machine update
  if (b.dashTicks > 0) {
    b.state = 5;
    b.landTicks = 0;
  } else if (!b.grounded) {
    b.state = b.vy > 0 ? 2 : 3;
    b.landTicks = 0;
  } else if (justLanded) {
    b.state = 4;
    b.landTicks = 1;
  } else if (prev.state === 4 && prev.landTicks < ABILITY_3D.landTicks) {
    b.state = 4;
    b.landTicks = prev.landTicks + 1;
  } else {
    b.landTicks = 0;
    const speed = Math.hypot(b.vx, b.vz);
    b.state = speed > 0.6 ? 1 : 0;
  }

  return b;
}

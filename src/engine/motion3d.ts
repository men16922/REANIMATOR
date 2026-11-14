// Pure 60 Hz 3D capsule kinematics adapted from Abuse's observed cop_mover/mover rules (new-design 3D extension).
// Preserves Abuse's instant high-traction start/stop feel, crisp jump arc, gravity, and terminal fall clamp
// while adding 8-way (X, Z) movement, multi-elevation catwalk ramps, smooth wall/pillar sliding, and Shift Jet-Dash.

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
}

export interface BoxSolid3D {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind?: 'wall' | 'crate' | 'catwalk' | 'console' | 'door';
  doorId?: string;
}

export interface Pillar3D {
  id: string;
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

export interface Ramp3D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  /** Elevation at min axis edge */
  yMinEdge: number;
  /** Elevation at max axis edge */
  yMaxEdge: number;
  thickness: number;
}

export interface Collider3D {
  solids: readonly BoxSolid3D[];
  pillars: readonly Pillar3D[];
  ramps: readonly Ramp3D[];
  isSolidActive?: (s: BoxSolid3D) => boolean;
}

/** Kinematic constants scaled from Abuse's LISP ABILITY ratio (accel/stop ~ 8/9 of top speed per beat). */
export const ABILITY_3D = {
  dt: 1 / 60,
  radius: 0.42,
  height: 1.82,
  runTopSpeed: 9.2,
  startAccelPerSec: 84,
  stopDecelPerSec: 96,
  airAccelPerSec: 52,
  jumpVel: 9.5,
  gravity: 26.5,
  terminalFallVel: -18.5,
  stepUpHeight: 0.38,
  dashSpeed: 21.0,
  dashTicks: 11,
  dashCooldownTicks: 66,
  landTicks: 4,
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
  };
}

/** Returns exact surface elevation under (x, z) reachable from current feet Y, or -Infinity if none. */
export function floorHeightAt3D(
  x: number,
  z: number,
  currentY: number,
  radius: number,
  col: Collider3D,
): number {
  let best = -Infinity;
  const maxStep = currentY + ABILITY_3D.stepUpHeight;

  for (const s of col.solids) {
    if (col.isSolidActive && !col.isSolidActive(s)) continue;
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

/** Resolve horizontal capsule pushout against active solids and pillars at vertical span [y + 0.35, y + height]. */
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

  if (b.dashCooldown > 0) b.dashCooldown--;

  // Normalize movement vector
  const moveMag = Math.hypot(input.moveX, input.moveZ);
  const mx = moveMag > 1e-4 ? input.moveX / Math.max(1, moveMag) : 0;
  const mz = moveMag > 1e-4 ? input.moveZ / Math.max(1, moveMag) : 0;

  // Trigger tactical Jet-Dash
  if (input.dash && b.dashTicks === 0 && b.dashCooldown === 0) {
    let dx = mx;
    let dz = mz;
    if (moveMag < 0.05) {
      const am = Math.hypot(input.aimDirX, input.aimDirZ);
      dx = am > 1e-4 ? input.aimDirX / am : Math.sin(b.yaw);
      dz = am > 1e-4 ? input.aimDirZ / am : Math.cos(b.yaw);
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
    b.vz = dz * ABILITY_3D.dashSpeed;
    b.state = 5;
  }

  if (b.dashTicks > 0) {
    b.dashTicks--;
    b.vx = b.dashDirX * ABILITY_3D.dashSpeed;
    b.vz = b.dashDirZ * ABILITY_3D.dashSpeed;
    b.vy = Math.max(0, b.vy * 0.2);
    b.state = 5;
  } else {
    // Horizontal acceleration / high-traction Abuse stop
    if (moveMag > 0.05) {
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

    // Jump impulse (Abuse crisp ground launch)
    if (input.jump && b.grounded) {
      b.vy = ABILITY_3D.jumpVel;
      b.grounded = false;
      b.state = 2;
      b.landTicks = 0;
    }
  }

  // Gravity & terminal fall clamp
  if (!b.grounded && b.dashTicks === 0) {
    b.vy = Math.max(ABILITY_3D.terminalFallVel, b.vy - ABILITY_3D.gravity * dt);
  }

  // Horizontal integration + smooth wall/pillar slide
  const wantX = b.x + b.vx * dt;
  const wantZ = b.z + b.vz * dt;
  const res = resolveHorizontal3D(wantX, b.y, wantZ, ABILITY_3D.radius, ABILITY_3D.height, col);
  const actualVx = (res.x - b.x) / dt;
  const actualVz = (res.z - b.z) / dt;
  b.x = res.x;
  b.z = res.z;
  if (res.hitWall) {
    // Project velocity onto slid movement rather than fighting solid walls
    b.vx = Math.abs(actualVx) < 0.05 ? 0 : actualVx;
    b.vz = Math.abs(actualVz) < 0.05 ? 0 : actualVz;
  }

  // Vertical integration + ramp/catwalk floor snapping
  const groundY = floorHeightAt3D(b.x, b.z, b.y, ABILITY_3D.radius, col);
  const wantY = b.y + b.vy * dt;

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
      b.state = 4;
      b.landTicks = 0;
    } else {
      b.y = wantY;
      // Check ceiling clip
      for (const s of col.solids) {
        if (col.isSolidActive && !col.isSolidActive(s)) continue;
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

  // Fallback safety floor clamp
  if (b.y < -10) {
    b.y = 0;
    b.vy = 0;
    b.grounded = true;
  }

  // State machine update
  if (b.dashTicks > 0) {
    b.state = 5;
  } else if (!b.grounded) {
    b.state = b.vy > 0 ? 2 : 3;
  } else if (prev.state === 4 && b.landTicks < ABILITY_3D.landTicks) {
    b.landTicks++;
    b.state = 4;
  } else {
    const speed = Math.hypot(b.vx, b.vz);
    b.state = speed > 0.6 ? 1 : 0;
  }

  return b;
}

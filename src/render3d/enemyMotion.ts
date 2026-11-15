// Render-only enemy motion helpers. Pure functions (no THREE, no DOM) so node tests can exercise them.
// Nothing here is read by the simulation.

export interface EnemyRenderTelemetry {
  yaw: number;
  clip: string;
  timeScale: number;
  x: number;
  y: number;
  z: number;
}

export const ENEMY_YAW_MAX_RATE = 12; // rad/s hard cap: 0.2 rad at 60 fps
export const ENEMY_DT_CLAMP = 1 / 30; // a long frame never turns more than 0.4 rad

export function wrapAngle(d: number): number {
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Exponential turn with a hard angular speed cap, so a facing flip (pi) never pops in one frame. */
export function stepEnemyYaw(current: number, target: number, dt: number, rate = 7, maxRate = ENEMY_YAW_MAX_RATE): number {
  const h = Math.min(Math.max(dt, 0), ENEMY_DT_CLAMP);
  const d = wrapAngle(target - current);
  let step = d * Math.min(1, h * rate);
  const cap = maxRate * h;
  if (step > cap) step = cap;
  else if (step < -cap) step = -cap;
  return wrapAngle(current + step);
}

export interface ProcPoseInput {
  kind: 'crawler' | 'spitter';
  alive: boolean;
  /** Horizontal speed in m/s */
  speed: number;
  /** Vertical speed in m/s (+up) */
  vy: number;
  winding: boolean;
  windFrac: number;
  striking: boolean;
  /** 0..1 decaying kick after a spit */
  shot: number;
  /** 0..1 decaying squash after landing */
  land: number;
  /** 0..1 smoothed stagger (knockback) weight */
  stagger: number;
  /** 0..1 decaying hit recoil */
  recoil: number;
  /** Sideways lean from turning */
  lean: number;
  deathTicks: number;
  tSec: number;
  /** Integrated gait phase (rad), advanced by gaitStep so cycles never pop with speed changes */
  gait: number;
  phase: number;
  alerting: boolean;
}

export interface ProcPose {
  clip: string;
  timeScale: number;
  lift: number;
  pitch: number;
  roll: number;
  sx: number;
  sy: number;
  sz: number;
  visible: boolean;
}

export const CRAWLER_REF_SPEED = 5;

/** Gait rate in rad/s: legs cycle with ground speed, never faster than the 6.5 Hz cap. */
export function gaitStep(kind: 'crawler' | 'spitter', speed: number): number {
  if (kind === 'spitter') return 2.2;
  return Math.min(2 * Math.PI * 6.5, 6 + (speed / CRAWLER_REF_SPEED) * 28);
}

const DEATH_FALL_TICKS = 24;
const DEATH_SINK_START = 150;
const DEATH_HIDE_TICKS = 240;

export function proceduralEnemyPose(p: ProcPoseInput): ProcPose {
  let clip = 'idle';
  let timeScale = 1;
  let lift = 0;
  let pitch = 0;
  let roll = p.lean;
  let sx = 1;
  let sy = 1;
  let sz = 1;
  let visible = true;

  if (!p.alive) {
    const t = Math.min(1, p.deathTicks / DEATH_FALL_TICKS);
    const ease = 1 - Math.pow(1 - t, 3);
    roll = Math.PI * 0.48 * ease;
    pitch = -0.12 * ease;
    // Bounce once on the way down, then flatten and shrink away instead of popping out
    lift = p.kind === 'spitter' ? 0.3 * (1 - ease) : Math.abs(Math.sin(t * Math.PI)) * 0.06;
    sy = 1 - 0.1 * ease;
    if (p.deathTicks > DEATH_SINK_START) {
      const s = Math.max(0, 1 - (p.deathTicks - DEATH_SINK_START) / (DEATH_HIDE_TICKS - DEATH_SINK_START));
      sx = sy = sz = s;
      lift -= (1 - s) * 0.2;
    }
    visible = p.deathTicks < DEATH_HIDE_TICKS;
    return { clip: 'death', timeScale: t < 1 ? 1 : 0, lift, pitch, roll, sx, sy, sz, visible };
  }

  if (p.kind === 'crawler') {
    const run = Math.min(1, p.speed / 6);
    const airborne = Math.abs(p.vy) > 1.2;
    if (p.winding) {
      clip = 'crouch';
      timeScale = 0;
      sy = 1 - 0.3 * p.windFrac;
      sx = sz = 1 + 0.14 * p.windFrac;
      pitch = 0.28 * p.windFrac;
      // Shudder grows as the pounce nears
      roll += Math.sin(p.tSec * 55) * 0.03 * p.windFrac;
    } else if (p.striking || airborne) {
      clip = 'leap';
      // Nose up while rising, down while falling; stretch along the body
      pitch = -Math.max(-0.5, Math.min(0.5, p.vy * 0.05)) + 0.1;
      sz = 1.22;
      sy = 0.9;
      sx = 0.94;
    } else if (p.land > 0) {
      clip = 'land';
      sy = 1 - 0.22 * p.land;
      sx = sz = 1 + 0.12 * p.land;
      pitch = 0.12 * p.land;
    } else if (p.speed > 0.4) {
      clip = 'crawl';
      timeScale = Math.max(0.4, Math.min(1.8, p.speed / CRAWLER_REF_SPEED));
      const s = Math.sin(p.gait);
      lift = Math.abs(s) * 0.05 * run;
      pitch = 0.14 * run + Math.sin(p.gait * 2) * 0.03 * run;
      roll += s * 0.05 * run;
    } else {
      clip = p.alerting ? 'alert' : 'idle';
      // Breathing; alert crouches low and stays tense
      const b = Math.sin(p.tSec * 3 + p.phase);
      sy = 1 + b * 0.012 - (p.alerting ? 0.08 : 0);
      sx = sz = 1 - b * 0.006 + (p.alerting ? 0.04 : 0);
      pitch = p.alerting ? 0.1 : 0;
    }
  } else {
    clip = 'hover';
    lift = 0.05 + Math.sin(p.tSec * 2.2 + p.phase) * 0.12;
    roll += Math.sin(p.tSec * 1.7 + p.phase) * 0.05;
    if (p.winding) {
      clip = 'inflate';
      timeScale = 0;
      const k = 1 + 0.22 * p.windFrac;
      sx = sz = k;
      sy = 1 + 0.12 * p.windFrac;
      pitch = -0.15 * p.windFrac;
      lift += 0.1 * p.windFrac;
    } else if (p.shot > 0.01) {
      clip = 'spit';
      sz = 1 - 0.15 * p.shot;
      sx = 1 + 0.06 * p.shot;
      pitch = 0.2 * p.shot;
    } else if (p.alerting) {
      clip = 'alert';
      sy = 1.05;
      pitch = -0.06;
    }
  }

  if (p.stagger > 0.01 || p.recoil > 0.01) {
    clip = 'stagger';
    timeScale = 0;
    // Knockback: body tips back against the facing, squashes slightly
    pitch -= p.stagger * 0.28 + p.recoil * 0.2;
    sy *= 1 - 0.05 * p.recoil;
  }

  return { clip, timeScale, lift, pitch, roll, sx, sy, sz, visible };
}

export interface EnemyTraceFrame {
  t: number;
  yaw: number;
  clip: string;
  timeScale: number;
  x: number;
}

export interface EnemyTraceReport {
  frames: number;
  maxYawStep: number;
  yawJumps: number;
  skateFrames: number;
  maxSkateRatio: number;
}

export interface EnemyTraceOptions {
  yawLimit?: number;
  /** Clips that carry a locomotion cycle, with the ground speed (m/s) at which timeScale is 1 */
  locomotion?: Record<string, number>;
  /** Allowed relative mismatch between |dx|/dt and refSpeed*timeScale */
  skateTolerance?: number;
  /** Ignore speeds below this (m/s) when judging skate */
  minSpeed?: number;
}

/**
 * Checks consecutive telemetry frames of one enemy: yaw jumps (>= yawLimit rad per frame) and foot skating
 * (locomotion clip whose timeScale does not match the actual ground speed, or a moving body with a non-locomotion clip).
 */
export function analyzeEnemyTrace(frames: EnemyTraceFrame[], opts: EnemyTraceOptions = {}): EnemyTraceReport {
  const yawLimit = opts.yawLimit ?? 0.5;
  const loco = opts.locomotion ?? { walk: 2.2, run: 5.5, crawl: CRAWLER_REF_SPEED };
  const tol = opts.skateTolerance ?? 0.4;
  const minSpeed = opts.minSpeed ?? 0.8;
  let maxYawStep = 0;
  let yawJumps = 0;
  let skateFrames = 0;
  let maxSkateRatio = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const dyaw = Math.abs(wrapAngle(b.yaw - a.yaw));
    if (dyaw > maxYawStep) maxYawStep = dyaw;
    if (dyaw >= yawLimit) yawJumps++;
    const speed = Math.abs(b.x - a.x) / dt;
    if (speed < minSpeed) continue;
    const ref = loco[b.clip];
    // Moving fast under a non-locomotion clip counts as full skate (excluding knockback/death which are not walking)
    const expected = ref ? ref * b.timeScale : 0;
    if (!ref && (b.clip === 'attack' || b.clip === 'leap' || b.clip === 'stagger' || b.clip === 'death')) continue;
    const ratio = expected > 0 ? Math.abs(speed - expected) / speed : 1;
    if (ratio > maxSkateRatio) maxSkateRatio = ratio;
    if (ratio > tol) skateFrames++;
  }
  return { frames: frames.length, maxYawStep, yawJumps, skateFrames, maxSkateRatio };
}

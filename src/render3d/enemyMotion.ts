// Render-only enemy motion helpers. Pure functions (no THREE, no DOM) so node tests can exercise them.
// Nothing here is read by the simulation.

export interface EnemyRenderTelemetry {
  yaw: number;
  clip: string;
  timeScale: number;
  x: number;
  y: number;
  z: number;
  /** Rig pose state (idle/move/aim/windup/strike/leap/land/recoil/stagger/roar/dead) */
  poseState?: string;
  /** Crossfade weights of the rigged foes (idle/walk/run/attack/death), sums to 1 */
  blend?: Record<string, number>;
  /** Foot travel implied by the gait phase (m/s); compare with the ground speed to see skating */
  footSpeed?: number;
  /** Head yaw relative to the body (rad): the head leads turns */
  headRel?: number;
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
  /** Surface the foe is on (default floor). Wall and ceiling crawling uses a travelling body wave. */
  surface?: 'floor' | 'wall' | 'ceiling';
  /** Ceiling dropper: true from the moment it lets go until it lands */
  dropping?: boolean;
  /** Heavy foes (dropper) squash harder on landing */
  heavy?: boolean;
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
  /** Extra heading wiggle (rad) added to the body yaw: the single-mesh foes scuttle by swinging side to side */
  yaw: number;
  /** Backward display offset (m, along the facing) from a spit kick */
  kick: number;
}

export const CRAWLER_REF_SPEED = 5;

/** Metres of ground covered per crawler stride (one full sin cycle of the gait phase). Longer at speed, like a real gait. */
export function crawlerStride(speed: number): number {
  return 0.7 + 0.18 * Math.max(0, speed);
}

/**
 * Gait rate in rad/s, stride-locked: rate = 2*pi*speed/stride, so the displayed foot travel equals the ground speed.
 * (R13: the old curve 6 + 28*speed/5 rad/s hit its 6.5 Hz cap at 6 m/s, so bob and roll buzzed at about 13 Hz.)
 */
export function gaitStep(kind: 'crawler' | 'spitter', speed: number): number {
  if (kind === 'spitter') return 2.2;
  const v = Math.max(0.3, speed);
  return Math.min(2 * Math.PI * 6.5, (2 * Math.PI * v) / crawlerStride(v));
}

/** Foot travel (m/s) implied by gaitStep for a crawler: equals the ground speed whenever the cap is not hit. */
export function crawlerFootSpeed(speed: number): number {
  const v = Math.max(0.3, speed);
  return (gaitStep('crawler', v) / (2 * Math.PI)) * crawlerStride(v);
}

/** Display speed filter: follows the sim speed with ~0.1 s lag so the gait never snaps (rate 12/s up, 9/s down). */
export function smoothDisplaySpeed(prev: number, target: number, dt: number): number {
  const h = Math.min(Math.max(dt, 0), ENEMY_DT_CLAMP);
  const rate = target > prev ? 12 : 9;
  const v = prev + (target - prev) * (1 - Math.exp(-rate * h));
  return Math.abs(v) < 1e-3 ? 0 : v;
}

/** Schmitt trigger for the walking state: turns on above `on`, off below `off`, holds in between. */
export function latchHysteresis(prev: boolean, value: number, on: number, off: number): boolean {
  return prev ? value > off : value > on;
}

/** Forward body lean (rad) for rigged biped foes at a ground speed: none at rest, leaning into the run. */
export function runLean(kind: 'stalker' | 'warden', speed: number, moveW = 1): number {
  const full = kind === 'stalker' ? 0.17 : 0.06;
  const k = Math.min(1, Math.max(0, speed / 5.5));
  return full * k * k * (3 - 2 * k) * Math.min(1, Math.max(0, moveW));
}

// ---- R12 pure motion helpers (display only) ----

/** Hit reaction: amp is the flinch weight (1 on a hit, decays to 0), kb the knockback offset in metres (signed x). */
export interface Flinch {
  amp: number;
  kb: number;
}

export const FLINCH_AMP_RATE = 9; // 1/s
export const FLINCH_KB_RATE = 12; // 1/s
export const FLINCH_KB_MAX = 0.3; // m

/** Advance a flinch. `hit` is the rising edge of a damage event; `facing` is the foe facing, knockback pushes against it. */
export function flinchStep(f: Flinch, dt: number, hit: boolean, facing: number, strength = 1): Flinch {
  const h = Math.min(Math.max(dt, 0), ENEMY_DT_CLAMP);
  let amp = f.amp;
  let kb = f.kb;
  if (hit) {
    amp = 1;
    kb = Math.max(-FLINCH_KB_MAX, Math.min(FLINCH_KB_MAX, kb - Math.sign(facing || 1) * 0.14 * strength));
  }
  amp *= Math.exp(-FLINCH_AMP_RATE * h);
  kb *= Math.exp(-FLINCH_KB_RATE * h);
  if (amp < 1e-3) amp = 0;
  if (Math.abs(kb) < 1e-3) kb = 0;
  return { amp, kb };
}

/** Body deformation for a flinch weight: recoils back, squashes, then returns to identity. */
export function flinchPose(amp: number): { pitch: number; sy: number; sxz: number } {
  const a = Math.min(1, Math.max(0, amp));
  return { pitch: -0.2 * a, sy: 1 - 0.06 * a, sxz: 1 + 0.03 * a };
}

/** Turn-around: 0 when facing the target heading, 1 when it is directly behind. */
export function turnAmount(yawErr: number): number {
  const t = Math.min(1, Math.abs(wrapAngle(yawErr)) / Math.PI);
  return t * t * (3 - 2 * t);
}

/** Vertical squash while turning around: the body gathers itself mid-turn and recovers as the heading settles. */
export function turnSquash(yawErr: number): number {
  return 1 - 0.07 * turnAmount(yawErr);
}

/** Wall and ceiling crawl: a wave travelling along the body, scaled by speed. */
export function surfaceWave(gait: number, speed: number): { roll: number; yaw: number; sz: number; sy: number; lift: number; pitch: number } {
  const k = Math.max(0.5, Math.min(1, speed / 4));
  const g = Math.sin(gait);
  const g2 = Math.sin(gait * 2 + 0.9);
  return { roll: g * 0.1 * k, yaw: g * 0.3 * k, sz: 1 + g2 * 0.1 * k, sy: 1 - Math.abs(g2) * 0.04 * k, lift: Math.abs(g) * 0.05 * k, pitch: g2 * 0.07 * k };
}

/** Dropper coiling to its ceiling before it lets go: draws in, stretches, trembles harder as the drop nears. */
export function dropAnticipation(windFrac: number, tSec: number): { sx: number; sy: number; sz: number; pitch: number; shake: number } {
  const f = Math.min(1, Math.max(0, windFrac));
  return {
    sx: 1 - 0.12 * f,
    sy: 1 + 0.16 * f,
    sz: 1 - 0.1 * f,
    pitch: -0.12 * f,
    shake: Math.sin(tSec * 48) * 0.05 * f * f,
  };
}

/** Landing squash for a 0..1 decaying `land` weight. Returns exactly 1 at land = 0. */
export function landSquash(land: number, heavy: boolean): { sy: number; sxz: number } {
  const l = Math.min(1, Math.max(0, land));
  const k = heavy ? 1.7 : 1;
  return { sy: 1 - 0.22 * k * l, sxz: 1 + 0.12 * k * l };
}

/** Spit recoil: the body is kicked backward (m) in proportion to the decaying shot weight. */
export function spitKick(shot: number): number {
  const s = Math.min(1, Math.max(0, shot));
  return 0.2 * s * s;
}

/**
 * Death collapse for heavy rigs (Reclaimer): a short buckle, a heavy thud, then settle. deathTicks counts sim ticks.
 * sink is metres below the standing root, squashY multiplies the root height.
 */
export function collapsePose(deathTicks: number): { sink: number; squashY: number } {
  const t = Math.max(0, deathTicks);
  const fall = Math.min(1, t / 30);
  const ease = 1 - Math.pow(1 - fall, 3);
  const thud = t >= 30 ? Math.exp(-(t - 30) / 8) * Math.sin((t - 30) * 0.9) * 0.03 : 0;
  return { sink: 0.06 * ease + thud, squashY: 1 - 0.04 * ease };
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
  let yaw = 0;
  let kick = 0;
  const onSurface = p.surface !== undefined && p.surface !== 'floor';

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
    return { clip: 'death', timeScale: t < 1 ? 1 : 0, lift, pitch, roll, sx, sy, sz, visible, yaw: 0, kick: 0 };
  }

  if (p.kind === 'crawler') {
    const run = Math.min(1, p.speed / 4);
    const airborne = Math.abs(p.vy) > 1.2;
    if (p.winding && onSurface) {
      const a = dropAnticipation(p.windFrac, p.tSec);
      clip = 'crouch';
      timeScale = 0;
      sx = a.sx;
      sy = a.sy;
      sz = a.sz;
      pitch = a.pitch;
      roll += a.shake;
    } else if (p.winding) {
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
      const q = landSquash(p.land, p.heavy === true);
      sx = sz = q.sxz;
      sy = q.sy;
      pitch = 0.12 * p.land;
    } else if (p.speed > 0.4 && onSurface) {
      clip = 'crawl';
      timeScale = Math.max(0.4, Math.min(1.8, p.speed / CRAWLER_REF_SPEED));
      const w = surfaceWave(p.gait, p.speed);
      roll += w.roll;
      yaw = w.yaw;
      sz = w.sz;
      sy = w.sy;
      lift = w.lift;
      pitch = w.pitch;
    } else if (p.speed > 0.4) {
      clip = 'crawl';
      timeScale = Math.max(0.4, Math.min(1.8, p.speed / CRAWLER_REF_SPEED));
      // Single mesh, no bones: the scuttle is a stride-locked body motion. Bob (twice per stride), diagonal roll and
      // yaw swing (once per stride), nose dip and a stretch/squash surge, all scaled by ground speed.
      const g = Math.sin(p.gait);
      const g2 = Math.sin(p.gait * 2);
      const k = 0.3 + 0.7 * run;
      lift = Math.abs(g) * 0.13 * k;
      pitch = 0.14 * k + g2 * 0.09 * k;
      roll += g * 0.13 * k;
      yaw = g * 0.2 * k;
      sz = 1 + g2 * 0.07 * k;
      sy = 1 - Math.abs(g) * 0.05 * k;
    } else {
      clip = p.alerting ? 'alert' : 'idle';
      // Breathing; alert crouches low and stays tense
      const b = Math.sin(p.tSec * 3 + p.phase);
      sy = 1 + b * 0.02 - (p.alerting ? 0.08 : 0);
      sx = sz = 1 - b * 0.01 + (p.alerting ? 0.04 : 0);
      pitch = (p.alerting ? 0.1 : 0) + Math.sin(p.tSec * 1.3 + p.phase) * 0.04;
      yaw = Math.sin(p.tSec * 0.9 + p.phase * 2) * 0.08;
      if (p.alerting) roll += Math.sin(p.tSec * 22) * 0.02;
    }
  } else {
    clip = 'hover';
    lift = 0.05 + Math.sin(p.tSec * 2.2 + p.phase) * 0.12;
    pitch = Math.sin(p.tSec * 1.6 + p.phase) * 0.07;
    yaw = Math.sin(p.tSec * 1.1 + p.phase) * 0.12;
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
      kick = spitKick(p.shot);
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

  return { clip, timeScale, lift, pitch, roll, sx, sy, sz, visible, yaw, kick };
}

export interface EnemyTraceFrame {
  t: number;
  yaw: number;
  clip: string;
  timeScale: number;
  x: number;
  /** Rig frames: foot travel implied by the gait phase (m/s). When present it replaces the clip/timeScale skate test. */
  footSpeed?: number;
  /** Rig frames: bone channel vector (rad, hipsDrop in m) for pose-jump checks */
  pose?: number[];
  poseState?: string;
}

export interface EnemyTraceReport {
  frames: number;
  maxYawStep: number;
  /** Largest angular speed of the displayed yaw, rad/s */
  maxYawRate: number;
  yawJumps: number;
  skateFrames: number;
  maxSkateRatio: number;
  /** Frames where the foe moved above minSpeed and was judged for skating */
  movingFrames: number;
  /** skateFrames / movingFrames */
  skateFraction: number;
  /** Largest per-frame change of any bone channel */
  maxPoseStep: number;
  /** Frames whose pose step exceeds poseLimit */
  poseJumps: number;
  /** Pose steps on frames where poseState changed */
  transitions: number;
  maxTransitionJump: number;
}

export interface EnemyTraceOptions {
  yawLimit?: number;
  /** Clips that carry a locomotion cycle, with the ground speed (m/s) at which timeScale is 1 */
  locomotion?: Record<string, number>;
  /** Allowed relative mismatch between |dx|/dt and refSpeed*timeScale */
  skateTolerance?: number;
  /** Ignore speeds below this (m/s) when judging skate */
  minSpeed?: number;
  /** Per-frame bone channel step (rad) counted as a pose jump */
  poseLimit?: number;
}

const NON_WALK_POSE_STATES = new Set(['strike', 'leap', 'stagger', 'recoil', 'dead', 'roar', 'land']);

/**
 * Checks consecutive telemetry frames of one enemy: yaw jumps (>= yawLimit rad per frame), foot skating, and pose
 * jumps (bone channels that change faster than poseLimit per frame, notably across pose-state transitions).
 * Skating: with footSpeed the ground speed |dx|/dt must match it; without, a locomotion clip whose timeScale does not
 * match the ground speed, or a moving body under a non-locomotion clip, counts.
 */
export function analyzeEnemyTrace(frames: EnemyTraceFrame[], opts: EnemyTraceOptions = {}): EnemyTraceReport {
  const yawLimit = opts.yawLimit ?? 0.5;
  const loco = opts.locomotion ?? { walk: 2.2, run: 5.5, crawl: CRAWLER_REF_SPEED };
  const tol = opts.skateTolerance ?? 0.4;
  const minSpeed = opts.minSpeed ?? 0.8;
  const poseLimit = opts.poseLimit ?? 0.25;
  let maxYawStep = 0;
  let maxYawRate = 0;
  let yawJumps = 0;
  let skateFrames = 0;
  let maxSkateRatio = 0;
  let movingFrames = 0;
  let maxPoseStep = 0;
  let poseJumps = 0;
  let transitions = 0;
  let maxTransitionJump = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const dyaw = Math.abs(wrapAngle(b.yaw - a.yaw));
    if (dyaw > maxYawStep) maxYawStep = dyaw;
    if (dyaw / dt > maxYawRate) maxYawRate = dyaw / dt;
    if (dyaw >= yawLimit) yawJumps++;
    if (a.pose && b.pose) {
      let step = 0;
      for (let k = 0; k < a.pose.length; k++) step = Math.max(step, Math.abs(b.pose[k] - a.pose[k]));
      if (step > maxPoseStep) maxPoseStep = step;
      if (step > poseLimit) poseJumps++;
      if (a.poseState !== b.poseState) {
        transitions++;
        if (step > maxTransitionJump) maxTransitionJump = step;
      }
    }
    const speed = Math.abs(b.x - a.x) / dt;
    if (speed < minSpeed || speed > 30) continue;
    let ratio: number;
    if (b.footSpeed !== undefined) {
      if (b.poseState && NON_WALK_POSE_STATES.has(b.poseState)) continue;
      ratio = Math.abs(speed - b.footSpeed) / speed;
    } else {
      const ref = loco[b.clip];
      // Moving fast under a non-locomotion clip counts as full skate (excluding knockback/death which are not walking)
      const expected = ref ? ref * b.timeScale : 0;
      if (!ref && (b.clip === 'attack' || b.clip === 'leap' || b.clip === 'stagger' || b.clip === 'death')) continue;
      ratio = expected > 0 ? Math.abs(speed - expected) / speed : 1;
    }
    movingFrames++;
    if (ratio > maxSkateRatio) maxSkateRatio = ratio;
    if (ratio > tol) skateFrames++;
  }
  return {
    frames: frames.length,
    maxYawStep,
    maxYawRate,
    yawJumps,
    skateFrames,
    maxSkateRatio,
    movingFrames,
    skateFraction: movingFrames > 0 ? skateFrames / movingFrames : 0,
    maxPoseStep,
    poseJumps,
    transitions,
    maxTransitionJump,
  };
}

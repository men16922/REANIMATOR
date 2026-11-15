// Render-only enemy rig driver for the rigged foes (Bio-Stalker, Core Warden). Pure math (no THREE, no DOM) so node
// tests can drive it with the deterministic bot run. Nothing here is read by the simulation.
//
// The driver turns simulation state into: (1) smoothed clip blend weights (idle/walk/run/attack/death), (2) a
// stride-locked locomotion phase so feet never skate, (3) additive bone channels (crouch, tuck, recoil spring, aim,
// boss patterns, delayed death sag) that riggedModels.applyEnemyRigChannels3D lays on top of the clip every frame.
//
// Axis convention (verified against the GLB rest poses): the model faces +Z, its left is +X, bone rotations below are
// about the rig X/Y/Z axes: +X = forward lean, +Y = turn toward +X, +Z = left arm outward.

import { stepEnemyYaw, wrapAngle } from './enemyMotion.ts';

export type RigKind = 'stalker' | 'warden';

/** Additive bone channels, radians except hipsDrop (metres). All are offsets from the clip pose. */
export interface RigChannels {
  hipsDrop: number;
  thighL: number; // forward = positive (applied as -X rotation)
  thighR: number;
  kneeL: number; // fold = positive
  kneeR: number;
  spine: number; // total forward lean (+ forward), spread over spine/spine1/spine2
  spineTwist: number; // total yaw about rig Y
  spineRoll: number; // tremor / sway about rig Z
  headPitch: number; // + = nod down
  headYaw: number; // + = toward +X (relative to the body)
  armUpL: number; // raise forward/up = positive (applied as -X rotation)
  armUpR: number;
  armOutL: number; // spread outward = positive
  armOutR: number;
  foreL: number; // elbow fold = positive
  foreR: number;
}

export const RIG_CHANNEL_KEYS: (keyof RigChannels)[] = [
  'hipsDrop', 'thighL', 'thighR', 'kneeL', 'kneeR', 'spine', 'spineTwist', 'spineRoll',
  'headPitch', 'headYaw', 'armUpL', 'armUpR', 'armOutL', 'armOutR', 'foreL', 'foreR',
];

export function zeroChannels(): RigChannels {
  return {
    hipsDrop: 0, thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, spine: 0, spineTwist: 0, spineRoll: 0,
    headPitch: 0, headYaw: 0, armUpL: 0, armUpR: 0, armOutL: 0, armOutR: 0, foreL: 0, foreR: 0,
  };
}

export function channelsToArray(c: RigChannels): number[] {
  return RIG_CHANNEL_KEYS.map((k) => c[k]);
}

export interface ClipWeights {
  idle: number;
  walk: number;
  run: number;
  attack: number;
  death: number;
}

export type PoseState =
  | 'idle' | 'move' | 'aim' | 'windup' | 'strike' | 'leap' | 'land' | 'recoil' | 'stagger' | 'roar' | 'dead';

/** Minimal enemy view the driver reads (a structural subset of EnemyState3D). */
export interface RigEnemyLike {
  kind: string;
  alive: boolean;
  active: boolean;
  state: string;
  x: number;
  y: number;
  yaw: number;
  facing: number;
  vx: number;
  vy: number;
  phase: number;
  bossPattern: string;
  exposedTicks: number;
  windupTicks: number;
  attackAnimTicks: number;
  staggerTicks: number;
  hitFlashTicks: number;
  deathTicks: number;
  lungeTicks: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Small helpers

export const RIG_DT_CLAMP = 1 / 30;
/** Max bone channel speed, rad/s (0.2 rad per 60 fps frame) */
export const RIG_SLEW = 12;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function smooth01(t: number): number {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function expK(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Damped spring (semi-implicit Euler, sub-stepped): x chases target; freq in Hz, zeta 1 = critical. */
export interface Spring {
  x: number;
  v: number;
}
export function stepSpring(s: Spring, target: number, dt: number, freqHz: number, zeta: number): void {
  const h = clamp(dt, 0, RIG_DT_CLAMP);
  const w = 2 * Math.PI * freqHz;
  const n = Math.max(1, Math.ceil(h / (1 / 240)));
  const sub = h / n;
  for (let i = 0; i < n; i++) {
    const acc = w * w * (target - s.x) - 2 * zeta * w * s.v;
    s.v += acc * sub;
    s.x += s.v * sub;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Locomotion: stride-locked gait phase

export interface GaitSpec {
  walkRef: number; // ground speed (m/s) at which the walk clip plays at 1x
  runRef: number;
  walkDur: number; // clip durations (s)
  runDur: number;
  blendLo: number; // walk -> run weight ramp (m/s)
  blendHi: number;
}

export const GAIT: Record<RigKind, GaitSpec> = {
  // R13: narrower walk -> run band, so a chase at 3-4 m/s is a real run instead of a 1.6x speed-walk mixed in
  stalker: { walkRef: 2.2, runRef: 5.5, walkDur: 1.033, runDur: 0.467, blendLo: 2.0, blendHi: 3.6 },
  warden: { walkRef: 2.6, runRef: 6.0, walkDur: 1.033, runDur: 0.633, blendLo: 3.0, blendHi: 5.0 },
};

/** Run-clip weight within the locomotion pair for a given ground speed. */
export function runBlend(kind: RigKind, speed: number): number {
  const g = GAIT[kind];
  return smooth01((speed - g.blendLo) / (g.blendHi - g.blendLo));
}

/** Longest stride stretch above the run reference speed (cadence then rises at most sqrt-slowly). */
export const SPRINT_STRIDE_MAX = 1.25;

/**
 * Stride stretch above the run reference: sprinting animals lengthen their stride instead of spinning their legs.
 * Without it a 9.6 m/s aggro chase played the run clip at 1.75x. The stretch is capped so foot slip stays small.
 */
export function sprintStretch(kind: RigKind, speed: number): number {
  const ref = GAIT[kind].runRef;
  return speed <= ref ? 1 : Math.min(SPRINT_STRIDE_MAX, Math.sqrt(speed / ref));
}

/** Metres travelled per gait cycle for the walk/run mix at this speed. */
export function strideLength(kind: RigKind, speed: number): number {
  const g = GAIT[kind];
  return lerp(g.walkRef * g.walkDur, g.runRef * g.runDur, runBlend(kind, speed)) * sprintStretch(kind, speed);
}

/** Gait cycles per second so that foot travel equals ground travel (no sliding). */
export function gaitCycleRate(kind: RigKind, speed: number): number {
  return speed / strideLength(kind, speed);
}

/** Forward spine lean (rad) for a running stalker: 0 at walk speed, up to 0.22 at a full chase. */
export function runLean(speed: number): number {
  return clamp((speed - 2.5) / 7, 0, 1) * 0.22;
}

/** Hip dip (m) twice per gait cycle, growing with speed. Zero at rest. */
export function runBob(phase: number, speed: number): number {
  const amp = clamp((speed - 2) / 6, 0, 1) * 0.045;
  return amp * 0.5 * (1 - Math.cos(phase * Math.PI * 4));
}

/** Ceiling on the ground speed fed to the gait (m/s). Faster readings are collision or knockback snaps. */
export const GROUND_SPEED_MAX = 14;
/** Gait speed may rise at most this fast (m/s^2); the sim's chase acceleration is about 45. */
export const GROUND_ACCEL_MAX = 120;
/** ...and fall at most this fast (a hard stop decelerates at about 170). */
export const GROUND_DECEL_MAX = 240;

/**
 * Ground speed measured from displayed positions, lightly filtered. Teleports (|dx| > 4 m) are ignored.
 * R13: single-frame snaps (enemy separation pushes, step-ups, knockback) used to read as 30-47 m/s and spun the
 * legs a quarter cycle in one frame. The reading is now capped and slew-limited, so only real locomotion drives it.
 */
export function stepGroundSpeed(prev: number, dx: number, dt: number): number {
  const h = clamp(dt, 1e-4, 0.25);
  if (Math.abs(dx) > 4) return prev;
  const inst = Math.min(GROUND_SPEED_MAX, Math.abs(dx) / h);
  const target = clamp(inst, prev - GROUND_DECEL_MAX * h, prev + GROUND_ACCEL_MAX * h);
  return Math.max(0, prev + (target - prev) * expK(140, h));
}

// ---------------------------------------------------------------------------------------------------------------
// Driver

export interface RigPlayer {
  x: number;
  y: number;
}

export interface EnemyRigFrame {
  bodyYaw: number;
  /** Head yaw relative to the body, radians (the head turns before the body does) */
  headRel: number;
  weights: ClipWeights;
  /** Normalised gait phase 0..1 shared by walk and run clips */
  gaitPhase: number;
  cycleRate: number;
  /** Foot travel implied by gait phase rate x stride, m/s (0 when not in locomotion) */
  footSpeed: number;
  /** Dominant clip name and the equivalent clip timeScale (telemetry) */
  clip: string;
  timeScale: number;
  /** True on the frame a strike begins: caller restarts the attack clip */
  attackRestart: boolean;
  poseState: PoseState;
  ch: RigChannels;
  /** Squash scale applied to the whole rig root (landing / roar swell) */
  rootScaleY: number;
  /** Extra root pitch (rad) for the landing/leap body angle */
  rootPitch: number;
}

const ENEMY_WARDEN_ROAR_S = 1.1;
const AIM_RANGE = 16;

export class EnemyRigDriver {
  readonly kind: RigKind;
  private bodyYaw: number;
  private headYaw: number;
  private weights: ClipWeights = { idle: 1, walk: 0, run: 0, attack: 0, death: 0 };
  private gaitPhase = 0;
  private groundSpeed = 0;
  private prevX: number;
  private prevVy = 0;
  private prevHit = 0;
  private prevStrike = false;
  private prevPhase: number;
  private roarT = 99;
  private landK = 0;
  private tuckK = 0;
  private windK = 0;
  private moveW = 0;
  private wasMoving = false;
  private aimW = 0;
  private aimPitch = 0;
  private hitFront = 1;
  private deathT = 0;
  private readonly recoil: Spring = { x: 0, v: 0 };
  private readonly sway: Spring = { x: 0, v: 0 };
  private cur: RigChannels = zeroChannels();
  private patW: Record<string, number> = { slam: 0, volley: 0, barrage: 0, charge: 0, summon: 0, kneel: 0 };
  private slamStrike = 0;

  constructor(kind: RigKind, e: RigEnemyLike) {
    this.kind = kind;
    this.bodyYaw = e.yaw;
    this.headYaw = e.yaw;
    this.prevX = e.x;
    this.prevPhase = e.phase;
  }

  get channels(): RigChannels {
    return this.cur;
  }

  step(e: RigEnemyLike, player: RigPlayer, dtRaw: number, tSec: number, x: number): EnemyRigFrame {
    const dt = clamp(dtRaw, 1e-4, RIG_DT_CLAMP);
    const kind = this.kind;
    const warden = kind === 'warden';

    // --- ground speed from displayed motion (also keeps the stride lock honest under interpolation)
    this.groundSpeed = stepGroundSpeed(this.groundSpeed, x - this.prevX, dtRaw);
    this.prevX = x;
    const speed = this.groundSpeed;

    // --- yaw: the head leads, the body follows (12 rad/s hard cap on both)
    const bodyRate = warden ? 4.5 : speed > 3 ? 8 : 5.5; // R13: a sprinting body turns to face its run direction faster
    this.headYaw = stepEnemyYaw(this.headYaw, e.yaw, dt, 14);
    this.bodyYaw = stepEnemyYaw(this.bodyYaw, e.yaw, dt, bodyRate);
    const headRel = clamp(wrapAngle(this.headYaw - this.bodyYaw), -0.95, 0.95);

    // --- state flags
    const alive = e.alive;
    const winding = alive && (e.windupTicks > 0 || e.state === 'windup');
    const striking = alive && !winding && (e.state === 'attack' || e.attackAnimTicks > 0);
    const staggered = alive && (e.state === 'stagger' || e.staggerTicks > 0);
    const exposed = alive && warden && e.exposedTicks > 0;
    const airborne = alive && (Math.abs(e.vy) > 2.2 || (e.lungeTicks > 0 && !warden));
    const windTotal = warden ? (e.phase >= 2 ? 28 : 36) : 18;
    const windFrac = winding ? clamp(1 - e.windupTicks / windTotal, 0, 1) : 0;
    const pattern = e.bossPattern;

    // --- hit recoil: kick a spring against the hit side, lean away from the player
    const dxp = player.x - x;
    if (e.hitFlashTicks > this.prevHit && alive) {
      const front = Math.sign(dxp * (e.facing || 1)) || 1;
      this.hitFront = front;
      this.recoil.v += -front * (warden ? 3.2 : 8.5);
    }
    this.prevHit = e.hitFlashTicks;
    stepSpring(this.recoil, 0, dt, warden ? 2.4 : 3.2, 0.32);

    // --- landing detection (falling then stopped) and leap tuck
    if (Math.abs(this.prevVy) > 3 && Math.abs(e.vy) < 0.4 && alive) this.landK = 1;
    this.prevVy = e.vy;
    this.landK = Math.max(0, this.landK - dt * (warden ? 2.6 : 4.2));
    this.tuckK += ((airborne || (striking && !warden) ? 1 : 0) - this.tuckK) * expK(16, dt);

    // --- boss phase roar
    if (warden && e.phase > this.prevPhase && alive) this.roarT = 0;
    this.prevPhase = e.phase;
    this.roarT += dt;
    const roarOn = warden && alive && this.roarT < ENEMY_WARDEN_ROAR_S;
    const roarEnv = roarOn ? Math.sin(Math.PI * clamp(this.roarT / ENEMY_WARDEN_ROAR_S, 0, 1)) : 0;

    // --- aim at the player (limited), only while the foe is engaged
    const engaged = alive && e.active !== false && e.state !== 'dormant' && e.state !== 'patrol' && Math.abs(dxp) < AIM_RANGE;
    this.aimW += ((engaged ? 1 : 0) - this.aimW) * expK(8, dt);
    const elev = Math.atan2(player.y + 1.0 - (e.y + (warden ? 2.4 : 1.6)), Math.max(Math.abs(dxp), 1.5));
    this.aimPitch += (clamp(elev, -0.45, 0.45) - this.aimPitch) * expK(7, dt);

    // --- clip weights (smoothed crossfades, 0.12..0.25 s)
    // Windup keeps walking while the sim's slide decays so the feet never skate across the floor
    // R13: hysteresis (start above 0.5, stop below 0.25) so a speed hovering near the threshold never flickers idle/run
    this.wasMoving = speed > (this.wasMoving ? 0.25 : 0.5);
    const moving = alive && !staggered && !striking && this.wasMoving;
    this.moveW += ((moving ? 1 : 0) - this.moveW) * expK(moving ? 40 : 18, dt);
    const rb = runBlend(kind, speed);
    const t: ClipWeights = { idle: 0, walk: 0, run: 0, attack: 0, death: 0 };
    if (!alive) t.death = 1;
    else if (striking) t.attack = 1;
    else {
      t.walk = this.moveW * (1 - rb);
      t.run = this.moveW * rb;
      t.idle = 1 - this.moveW;
    }
    const inRate = !alive ? 20 : striking ? 24 : 12;
    const outRate = striking || !alive ? 12 : 10;
    const w = this.weights;
    for (const k of ['idle', 'walk', 'run', 'attack', 'death'] as const) {
      w[k] += (t[k] - w[k]) * expK(t[k] > w[k] ? inRate : outRate, dt);
    }
    const sum = w.idle + w.walk + w.run + w.attack + w.death;
    if (sum > 1e-5) for (const k of ['idle', 'walk', 'run', 'attack', 'death'] as const) w[k] /= sum;
    const attackRestart = striking && !this.prevStrike;
    this.prevStrike = striking;

    // --- gait phase: cycles/s from ground speed so foot travel = ground travel
    const locoW = w.walk + w.run;
    let cycleRate = 0;
    if (alive && locoW > 0.02) {
      cycleRate = gaitCycleRate(kind, Math.max(speed, 0.3));
      this.gaitPhase = (this.gaitPhase + cycleRate * clamp(dtRaw, 1e-4, 0.25)) % 1;
    }
    const footSpeed = locoW > 0.15 ? cycleRate * strideLength(kind, Math.max(speed, 0.3)) : 0;

    // --- target channels
    const tgt = zeroChannels();
    this.windK += ((winding ? windFrac : 0) - this.windK) * expK(14, dt);
    const crouch = this.windK;

    let poseState: PoseState = 'idle';
    if (!alive) poseState = 'dead';
    else if (roarOn) poseState = 'roar';
    else if (exposed || staggered) poseState = 'stagger';
    else if (striking) poseState = airborne && !warden ? 'leap' : 'strike';
    else if (winding) poseState = 'windup';
    else if (this.landK > 0.15) poseState = 'land';
    else if (airborne) poseState = 'leap';
    else if (Math.abs(this.recoil.x) > 0.06) poseState = 'recoil';
    else if (this.moveW > 0.5) poseState = 'move';
    else if (this.aimW > 0.5) poseState = 'aim';

    // aim: head and upper spine track the player within limits, scaled by engagement
    const aim = this.aimW * (alive ? 1 : 0);
    tgt.headPitch += -this.aimPitch * 0.7 * aim;
    tgt.spine += -this.aimPitch * 0.25 * aim;
    tgt.headYaw += headRel * 0.9;
    tgt.spineTwist += headRel * 0.35;
    // tense idle: alert foes crouch a little, breathing sway
    const breath = Math.sin(tSec * 1.9 + e.x) * 0.012;
    tgt.spine += breath + (e.state === 'alert' ? 0.07 * aim : 0);

    // recoil spring (front hit tips the spine back, rear hit tips it forward) plus a little twist
    tgt.spine += this.recoil.x;
    tgt.headPitch += -this.recoil.x * 0.6;
    tgt.spineTwist += this.recoil.x * 0.25 * this.hitFront;
    tgt.armUpL += this.recoil.x * 0.8;
    tgt.armUpR += this.recoil.x * 0.8;

    // R13 run posture: lean into the sprint and bob the hips twice per cycle (one dip per footfall)
    if (!warden && alive && !striking && !winding && this.moveW > 0.05) {
      const lean = runLean(speed) * this.moveW;
      tgt.spine += lean;
      tgt.headPitch += -lean * 0.8;
      tgt.hipsDrop += runBob(this.gaitPhase, speed) * this.moveW;
      tgt.armUpL += lean * 0.5;
      tgt.armUpR += lean * 0.5;
    }

    // lateral acceleration sway (secondary spring on the upper body)
    stepSpring(this.sway, clamp((this.moveW > 0.3 ? 0.04 : 0) * Math.sin(this.gaitPhase * Math.PI * 4), -0.05, 0.05), dt, 3, 0.4);
    tgt.spineRoll += this.sway.x;

    if (!warden) {
      // ----- Stalker
      if (crouch > 0.001 || winding) {
        const k = smooth01(crouch);
        tgt.hipsDrop += 0.3 * k;
        tgt.thighL += 0.6 * k;
        tgt.thighR += 0.55 * k;
        tgt.kneeL += 1.05 * k;
        tgt.kneeR += 1.0 * k;
        tgt.spine += 0.34 * k;
        tgt.headPitch += -0.22 * k;
        tgt.armUpL += -0.25 * k;
        tgt.armUpR += -0.25 * k;
        // shudder grows as the pounce nears
        tgt.spineRoll += Math.sin(tSec * 52) * 0.035 * k * k;
        tgt.thighL += Math.sin(tSec * 47) * 0.02 * k * k;
      }
      if (this.tuckK > 0.01) {
        const k = this.tuckK;
        tgt.thighL += 0.75 * k;
        tgt.thighR += 0.95 * k;
        tgt.kneeL += 1.25 * k;
        tgt.kneeR += 1.45 * k;
        tgt.spine += (striking ? 0.18 : -0.06) * k;
        tgt.armUpL += 1.05 * k; // claws forward
        tgt.armUpR += 1.05 * k;
        tgt.foreL += 0.5 * k;
        tgt.foreR += 0.5 * k;
        tgt.hipsDrop += 0.05 * k;
      }
      if (this.landK > 0.001) {
        const k = smooth01(this.landK);
        tgt.hipsDrop += 0.26 * k;
        tgt.thighL += 0.5 * k;
        tgt.thighR += 0.5 * k;
        tgt.kneeL += 0.95 * k;
        tgt.kneeR += 0.95 * k;
        tgt.spine += 0.26 * k;
      }
    } else {
      this.wardenTargets(tgt, e, { winding, windFrac, striking, exposed, staggered, roarEnv, pattern, moving: this.moveW, rb, tSec, dt });
    }

    // --- death: delayed per-bone sag layered over the death clip (ragdoll feel)
    if (!alive) {
      this.deathT = e.deathTicks / 60;
      const sag = (delay: number, dur: number): number => {
        const u = (this.deathT - delay) / dur;
        const ease = smooth01(u);
        const after = Math.max(0, this.deathT - delay - dur);
        return ease + Math.exp(-5 * after) * Math.sin(15 * after) * 0.22 * (u >= 1 ? 1 : 0);
      };
      const hips = sag(0.05, 0.45);
      const spine = sag(0.2, 0.55);
      const head = sag(0.4, 0.6);
      const armL = sag(0.3, 0.5);
      const armR = sag(0.38, 0.55);
      tgt.hipsDrop += 0.06 * hips;
      tgt.spine += 0.35 * spine;
      tgt.spineTwist += 0.2 * spine * (this.hitFront >= 0 ? 1 : -1);
      tgt.headPitch += 0.55 * head;
      tgt.headYaw += 0.3 * head;
      tgt.armUpL += -0.35 * armL;
      tgt.armUpR += -0.2 * armR;
      tgt.armOutL += 0.55 * armL;
      tgt.armOutR += 0.4 * armR;
      tgt.foreL += 0.7 * armL;
      tgt.foreR += 0.5 * armR;
      tgt.kneeL += 0.5 * hips;
      tgt.kneeR += 0.7 * hips;
      tgt.thighR += 0.25 * hips;
    }

    // --- smooth every channel toward its target so state changes never pop (death is already eased above)
    const cur = this.cur;
    for (const key of RIG_CHANNEL_KEYS) {
      const rate = !alive ? 16 : striking && key !== 'hipsDrop' ? 20 : key === 'headYaw' || key === 'spineTwist' ? 18 : 13;
      // Exponential approach with a slew cap, so a big pose change (arms overhead -> down) can never pop in a frame
      cur[key] += clamp((tgt[key] - cur[key]) * expK(rate, dt), -RIG_SLEW * dt, RIG_SLEW * dt);
    }

    // root-level squash on landing/roar swell
    const rootScaleY = alive ? 1 - 0.07 * smooth01(this.landK) + 0.03 * roarEnv : 1;
    const rootPitch = alive ? -0.05 * this.tuckK * (striking ? -1 : 1) : 0;

    // --- telemetry equivalents
    let clip = 'idle';
    let best = w.idle;
    for (const k of ['walk', 'run', 'attack', 'death'] as const) {
      if (w[k] > best) {
        best = w[k];
        clip = k;
      }
    }
    const g = GAIT[kind];
    const timeScale = clip === 'walk' ? cycleRate * g.walkDur : clip === 'run' ? cycleRate * g.runDur : 1;

    return {
      bodyYaw: this.bodyYaw,
      headRel,
      weights: { ...w },
      gaitPhase: this.gaitPhase,
      cycleRate,
      footSpeed,
      clip,
      timeScale,
      attackRestart,
      poseState,
      ch: { ...cur },
      rootScaleY,
      rootPitch,
    };
  }

  private wardenTargets(
    tgt: RigChannels,
    e: RigEnemyLike,
    c: {
      winding: boolean;
      windFrac: number;
      striking: boolean;
      exposed: boolean;
      staggered: boolean;
      roarEnv: number;
      pattern: string;
      moving: number;
      rb: number;
      tSec: number;
      dt: number;
    },
  ): void {
    const P = this.patW;
    const dt = c.dt;
    const pat = c.pattern;
    // Pattern weights ease in/out so back-to-back patterns blend instead of switching
    const want = (name: string, on: boolean, rate = 10): void => {
      P[name] += ((on ? 1 : 0) - P[name]) * expK(rate, dt);
    };
    const live = e.alive && !c.roarEnv;
    want('slam', live && pat === 'slam' && c.winding, 9);
    want('volley', live && pat === 'volley', 10);
    want('barrage', live && pat === 'barrage', 10);
    want('charge', live && pat === 'charge', 8);
    want('summon', live && pat === 'summon', 9);
    want('kneel', e.alive && (c.exposed || c.staggered), 7);
    // slam strike: arms come down fast after the wind-up
    const strikingSlam = live && pat === 'slam' && c.striking;
    this.slamStrike += ((strikingSlam ? 1 : 0) - this.slamStrike) * expK(strikingSlam ? 26 : 6, dt);

    const aimUp = 1.45 + this.aimPitch * 0.8;
    const wf = smooth01(c.windFrac);
    // slam: both arms overhead (windup), then hammered down
    const slam = P.slam * wf;
    tgt.armUpL += 2.7 * slam;
    tgt.armUpR += 2.7 * slam;
    tgt.foreL += 0.5 * slam;
    tgt.foreR += 0.5 * slam;
    tgt.spine += -0.28 * slam + 0.42 * this.slamStrike;
    tgt.headPitch += -0.25 * slam + 0.2 * this.slamStrike;
    tgt.hipsDrop += 0.05 * slam + 0.22 * this.slamStrike;
    tgt.kneeL += 0.3 * this.slamStrike;
    tgt.kneeR += 0.3 * this.slamStrike;
    tgt.thighL += 0.18 * this.slamStrike;
    tgt.thighR += 0.18 * this.slamStrike;
    tgt.armUpL += -0.4 * this.slamStrike;
    tgt.armUpR += -0.4 * this.slamStrike;
    // charge: lean into it, stomping feet while winding, arms swept back
    const ch = P.charge;
    if (ch > 0.01) {
      const stomp = Math.abs(Math.sin(c.tSec * 13)) * (c.winding ? 1 : 0);
      tgt.spine += 0.38 * ch * (c.winding ? 0.6 + 0.4 * wf : 1);
      tgt.hipsDrop += 0.16 * ch * (c.winding ? wf : 0.5);
      tgt.kneeL += (0.5 * ch) * (c.winding ? wf : 0.5);
      tgt.kneeR += (0.5 * ch) * (c.winding ? wf : 0.5);
      tgt.thighL += 0.6 * stomp * ch;
      tgt.kneeL += 0.6 * stomp * ch;
      tgt.armUpL += -0.6 * ch;
      tgt.armUpR += -0.6 * ch;
      tgt.foreL += 0.7 * ch;
      tgt.foreR += 0.7 * ch;
      tgt.headPitch += -0.2 * ch;
    }
    // volley / barrage: both arms level and aimed at the player, recoil kick per shot burst
    const aimArms = Math.max(P.volley, P.barrage);
    if (aimArms > 0.01) {
      const kick = P.barrage > 0.5 ? Math.max(0, Math.sin(c.tSec * 22)) * 0.07 : 0;
      tgt.armUpL += (aimUp - kick) * aimArms;
      tgt.armUpR += (aimUp - kick) * aimArms;
      tgt.armOutL += -0.12 * aimArms;
      tgt.armOutR += -0.12 * aimArms;
      tgt.spine += 0.06 * aimArms;
      tgt.headPitch += -0.1 * aimArms;
    }
    // summon: arms thrown wide, head back
    const s = P.summon * (c.winding ? 0.35 + 0.65 * wf : 1);
    tgt.armUpL += 0.75 * s;
    tgt.armUpR += 0.75 * s;
    tgt.armOutL += 1.05 * s;
    tgt.armOutR += 1.05 * s;
    tgt.spine += -0.12 * s;
    tgt.headPitch += -0.35 * s;
    tgt.spineRoll += Math.sin(c.tSec * 31) * 0.02 * s;
    // stagger / weak point exposed: kneel, chest open, head hanging
    const kn = P.kneel;
    if (kn > 0.01) {
      tgt.hipsDrop += 0.78 * kn;
      tgt.thighL += 1.15 * kn;
      tgt.kneeL += 1.9 * kn;
      tgt.thighR += 0.55 * kn;
      tgt.kneeR += 2.1 * kn;
      tgt.spine += -0.2 * kn;
      tgt.headPitch += 0.38 * kn;
      tgt.armUpL += -0.2 * kn;
      tgt.armUpR += -0.2 * kn;
      tgt.armOutL += 0.25 * kn;
      tgt.armOutR += 0.25 * kn;
    }
    // phase transition roar: chest out, head up, arms wide, shaking
    const r = c.roarEnv;
    if (r > 0.001) {
      tgt.spine += -0.42 * r;
      tgt.headPitch += -0.55 * r;
      tgt.armUpL += 0.5 * r;
      tgt.armUpR += 0.5 * r;
      tgt.armOutL += 0.95 * r;
      tgt.armOutR += 0.95 * r;
      tgt.foreL += 0.35 * r;
      tgt.foreR += 0.35 * r;
      tgt.hipsDrop += 0.1 * r;
      tgt.kneeL += 0.25 * r;
      tgt.kneeR += 0.25 * r;
      tgt.spineRoll += Math.sin(c.tSec * 43) * 0.03 * r;
    }
  }
}

/** Largest per-component difference between two channel arrays (radians; metres for hipsDrop). */
export function poseStepMax(a: number[], b: number[]): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Secondary motion for the single-mesh foes (crawler, dropper, climber, spitter). The GLBs are one mesh with no
// bones, so the body cannot be split into hip and head groups. Instead the body scale runs on underdamped springs
// (squash and stretch with overshoot) and an inner "inertia" rotation lags the outer body, which reads as a
// delayed second segment.

export interface ProcSecondaryInput {
  alive: boolean;
  sx: number;
  sy: number;
  sz: number;
  pitch: number;
  roll: number;
  /** Ground-plane velocity in m/s (signed x) for sway from acceleration */
  vx: number;
  dropping: boolean;
  /** 0..1 decaying spit kick (rising edge = shot fired) */
  shot: number;
  surfaceTarget: number;
  spitter: boolean;
}

export interface ProcSecondaryOut {
  sx: number;
  sy: number;
  sz: number;
  /** Inner mesh rotation about X/Z on top of the body pose (lagging overshoot) */
  innerPitch: number;
  innerRoll: number;
  surf: number;
}

export class ProcSecondary {
  private readonly s = [{ x: 1, v: 0 }, { x: 1, v: 0 }, { x: 1, v: 0 }] as Spring[];
  private readonly lp: Spring = { x: 0, v: 0 };
  private readonly lr: Spring = { x: 0, v: 0 };
  private prevPitch = 0;
  private prevRoll = 0;
  private prevVx = 0;
  private prevDropping = false;
  private prevShot = 0;
  private surf: number;

  constructor(surf = 0) {
    this.surf = surf;
  }

  step(i: ProcSecondaryInput, dtRaw: number): ProcSecondaryOut {
    const dt = clamp(dtRaw, 1e-4, RIG_DT_CLAMP);
    // Surface transitions: rotate toward the sim angle with a capped rate so a floor->wall flip never pops
    const d = wrapAngle(i.surfaceTarget - this.surf);
    const stepA = clamp(d * expK(14, dt), -8 * dt, 8 * dt);
    this.surf = wrapAngle(this.surf + stepA);

    if (!i.alive) {
      this.s[0].x = i.sx;
      this.s[1].x = i.sy;
      this.s[2].x = i.sz;
      this.s.forEach((q) => (q.v = 0));
      this.lp.x = this.lr.x = this.lp.v = this.lr.v = 0;
      this.prevPitch = i.pitch;
      this.prevRoll = i.roll;
      return { sx: i.sx, sy: i.sy, sz: i.sz, innerPitch: 0, innerRoll: 0, surf: this.surf };
    }
    // Impulses: spit recoil squeezes the body then it rebounds; letting go of a ceiling tumbles it
    if (i.shot > 0.95 && this.prevShot <= 0.95) {
      this.s[2].v -= i.spitter ? 3.2 : 1.5;
      this.s[0].v += i.spitter ? 1.6 : 0.8;
      this.s[1].v += i.spitter ? 1.2 : 0.6;
    }
    this.prevShot = i.shot;
    if (i.dropping && !this.prevDropping) {
      this.lr.v += 3.5;
      this.lp.v += 2.0;
    }
    this.prevDropping = i.dropping;
    // Inertial drive: body rotation and horizontal acceleration push the inner segment the other way
    this.lp.v += -((i.pitch - this.prevPitch) / dt) * 0.045;
    this.lr.v += -((i.roll - this.prevRoll) / dt) * 0.045 - ((i.vx - this.prevVx) / dt) * 0.004 * (i.spitter ? 1.6 : 1);
    this.prevPitch = i.pitch;
    this.prevRoll = i.roll;
    this.prevVx = i.vx;
    const freq = i.spitter ? 2.6 : 5.5;
    stepSpring(this.lp, 0, dt, freq, 0.28);
    stepSpring(this.lr, 0, dt, freq, 0.28);
    stepSpring(this.s[0], i.sx, dt, 7.5, 0.42);
    stepSpring(this.s[1], i.sy, dt, 7.5, 0.42);
    stepSpring(this.s[2], i.sz, dt, 7.5, 0.42);
    const lim = (v: number): number => clamp(v, 0.55, 1.5);
    return {
      sx: lim(this.s[0].x),
      sy: lim(this.s[1].x),
      sz: lim(this.s[2].x),
      innerPitch: clamp(this.lp.x, -0.35, 0.35),
      innerRoll: clamp(this.lr.x, -0.35, 0.35),
      surf: this.surf,
    };
  }
}

// Pure (renderer-free) logic for the player's presentation layer: pose-state selection, procedural pose offsets,
// weapon recoil decay, weapon swap timing and the diegetic HP colour. Everything here is render-only and reads the
// simulation without writing to it (R3.3 keeps the headlamp out of gameplay). Unit-tested in tests/hero.test.ts.

export type HeroWeapon = 1 | 2 | 3 | 4 | 5 | 6;

export type HeroPoseState =
  | 'idle'
  | 'run'
  | 'airborne'
  | 'landing'
  | 'dash'
  | 'wallSlide'
  | 'wallJump'
  | 'stomp'
  | 'stompLand'
  | 'hurt'
  | 'save'
  | 'dead';

/** Per-frame simulation values the controller reads. All come from WorldState3D (read-only). */
export interface HeroSimInput {
  hp: number;
  maxHp: number;
  weapon: HeroWeapon;
  muzzleFlashTicks: number;
  hurtFlashTicks: number;
  railCharge: number;
  railChargeMax: number;
  /** Debounced airborne flag (renderer side) */
  airborne: boolean;
  vx: number;
  vy: number;
  aimSignX: 1 | -1;
  landingFactor: number;
  dashTicks: number;
  wallDir: number;
  wallJumpLock: number;
  stomping: boolean;
  saveCooldown: number;
  /** World tick, used to reset the controller on respawn / new world */
  tick: number;
}

export interface PoseSelectInput {
  dead: boolean;
  hurtFlashTicks: number;
  airborne: boolean;
  dashTicks: number;
  wallDir: number;
  wallJumpLock: number;
  stomping: boolean;
  stompLandTime: number;
  landingFactor: number;
  saveActive: boolean;
  speedX: number;
  vy: number;
}

/** Priority order: dead > stomp > stomp landing > hurt > wall jump > wall slide > dash > air > landing > save > run > idle. */
export function selectHeroPose(i: PoseSelectInput): HeroPoseState {
  if (i.dead) return 'dead';
  if (i.stomping) return 'stomp';
  if (i.stompLandTime > 0) return 'stompLand';
  if (i.hurtFlashTicks > 0) return 'hurt';
  if (i.airborne && i.wallJumpLock > 0) return 'wallJump';
  if (i.airborne && i.wallDir !== 0 && i.vy < 0) return 'wallSlide';
  if (i.dashTicks > 0) return 'dash';
  if (i.airborne) return 'airborne';
  if (i.landingFactor > 0.05) return 'landing';
  if (i.saveActive && Math.abs(i.speedX) < 0.6) return 'save';
  if (Math.abs(i.speedX) > 1.2) return 'run';
  return 'idle';
}

// ---------------------------------------------------------------------------------------------------------
// Procedural pose offsets (additive bone rotations, radians; hipsDrop in metres)
// ---------------------------------------------------------------------------------------------------------

export interface HeroOffsets {
  /** Hips lowered by this many metres (derived from thigh/knee so planted feet stay planted) */
  hipsDrop: number;
  /** Thigh flexion, positive = knee forward/up */
  thigh: number;
  /** Knee flexion, positive = shin folds back */
  knee: number;
  /** Chest lean, positive = forward (relative to facing) */
  lean: number;
  /** Chest twist about the vertical axis (rig-local, radians) */
  twist: number;
  /** Head pitch, positive = look down */
  headPitch: number;
  /** 0..1 how much the support hand leaves the rifle for the wall */
  wallHand: number;
  /** 0..1 rifle lowered toward low-ready (swap dip, save pose) */
  lower: number;
}

export function zeroOffsets(): HeroOffsets {
  return { hipsDrop: 0, thigh: 0, knee: 0, lean: 0, twist: 0, headPitch: 0, wallHand: 0, lower: 0 };
}

export const THIGH_LEN = 0.37;
export const SHIN_LEN = 0.38;

/** Vertical lowering of the hips when the thigh flexes forward by `thigh` and the knee folds back by `knee`. */
export function legDrop(thigh: number, knee: number): number {
  return THIGH_LEN * (1 - Math.cos(thigh)) + SHIN_LEN * (1 - Math.cos(knee - thigh));
}

export interface PoseTargetContext {
  /** Direction of travel relative to facing: +1 forward, -1 backpedal */
  moveRel: number;
  aimSignX: 1 | -1;
  wallDir: number;
  landingFactor: number;
  hurtK: number;
  stompLandK: number;
  speedNorm: number;
}

/** Target offsets for a state; the controller smooths toward them. */
export function targetOffsets(state: HeroPoseState, c: PoseTargetContext): HeroOffsets {
  const o = zeroOffsets();
  switch (state) {
    case 'run':
      o.lean = 0.07 * c.moveRel * Math.min(1, c.speedNorm);
      break;
    case 'landing': {
      const L = Math.max(0, Math.min(1, c.landingFactor));
      o.thigh = 0.55 * L;
      o.knee = 1.0 * L;
      o.lean = 0.2 * L;
      o.headPitch = 0.08 * L;
      break;
    }
    case 'stomp':
      // Tight crouched dive: knees tucked to the chest, chest folded over, chin down
      o.thigh = 0.95;
      o.knee = 1.7;
      o.lean = 0.5;
      o.headPitch = 0.22;
      break;
    case 'stompLand': {
      const k = Math.max(0, Math.min(1, c.stompLandK));
      o.thigh = 0.85 * k;
      o.knee = 1.55 * k;
      o.lean = 0.5 * k;
      o.headPitch = 0.18 * k;
      break;
    }
    case 'dash':
      o.lean = 0.38 * c.moveRel;
      o.headPitch = 0.14 * c.moveRel;
      o.thigh = 0.2;
      o.knee = 0.3;
      break;
    case 'wallSlide': {
      // Facing the wall: lean in with the support hand on it; wall behind: press the back against it
      const facingWall = c.wallDir === c.aimSignX;
      o.lean = facingWall ? 0.14 : -0.12;
      o.thigh = 0.28;
      o.knee = 0.45;
      o.wallHand = 1;
      break;
    }
    case 'wallJump':
      // Chest wrenched toward the camera as the body pushes off, legs kicking up
      o.twist = -c.aimSignX * 0.55;
      o.lean = c.wallDir === c.aimSignX ? -0.2 : 0.25;
      o.thigh = 0.55;
      o.knee = 1.0;
      break;
    case 'hurt': {
      const k = Math.max(0, Math.min(1, c.hurtK));
      o.lean = -0.38 * k;
      o.headPitch = -0.3 * k;
      o.knee = 0.25 * k;
      o.thigh = 0.1 * k;
      break;
    }
    case 'save':
      // Short stand-still: rifle to low ready, head dipped while the station hums
      o.lower = 0.65;
      o.headPitch = 0.22;
      o.lean = 0.06;
      break;
    default:
      break;
  }
  o.hipsDrop = legDrop(o.thigh, o.knee);
  if (state === 'stomp' || state === 'wallSlide' || state === 'wallJump' || state === 'dash') o.hipsDrop = 0;
  return o;
}

const RATE_FAST: Partial<Record<HeroPoseState, number>> = { hurt: 34, landing: 40, stompLand: 38, stomp: 22 };

/** Exponential smoothing of every offset field toward its target. Frame-rate independent. */
export function smoothOffsets(cur: HeroOffsets, tgt: HeroOffsets, dt: number, rate: number): void {
  const k = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  cur.hipsDrop += (tgt.hipsDrop - cur.hipsDrop) * k;
  cur.thigh += (tgt.thigh - cur.thigh) * k;
  cur.knee += (tgt.knee - cur.knee) * k;
  cur.lean += (tgt.lean - cur.lean) * k;
  cur.twist += (tgt.twist - cur.twist) * k;
  cur.headPitch += (tgt.headPitch - cur.headPitch) * k;
  cur.wallHand += (tgt.wallHand - cur.wallHand) * k;
  cur.lower += (tgt.lower - cur.lower) * k;
}

// ---------------------------------------------------------------------------------------------------------
// Weapons: recoil, swap
// ---------------------------------------------------------------------------------------------------------

export interface RecoilProfile {
  /** Initial kick, 0..1 */
  kick: number;
  /** Exponential decay rate per second */
  decay: number;
  /** Muzzle climb in radians at kick 1 */
  climb: number;
  /** Rifle pull-back toward the shoulder in metres at kick 1 */
  back: number;
  /** Chest rock-back in radians at kick 1 */
  rock: number;
  /** Length of the support-hand grip offset (m) */
  foregrip: number;
}

export const RECOIL_PROFILE: Record<HeroWeapon, RecoilProfile> = {
  1: { kick: 0.45, decay: 20, climb: 0.05, back: 0.045, rock: 0.04, foregrip: 0.24 },
  2: { kick: 1.0, decay: 9, climb: 0.2, back: 0.14, rock: 0.14, foregrip: 0.27 },
  3: { kick: 0.85, decay: 10, climb: 0.15, back: 0.11, rock: 0.11, foregrip: 0.22 },
  4: { kick: 1.25, decay: 6.5, climb: 0.24, back: 0.2, rock: 0.2, foregrip: 0.3 },
  // Flamer: constant light shudder. Rocket: the heaviest kick, slow to settle.
  5: { kick: 0.14, decay: 24, climb: 0.02, back: 0.025, rock: 0.025, foregrip: 0.2 },
  6: { kick: 1.4, decay: 5, climb: 0.28, back: 0.24, rock: 0.24, foregrip: 0.3 },
};

export interface RecoilState {
  value: number;
  weapon: HeroWeapon;
}

export function newRecoil(): RecoilState {
  return { value: 0, weapon: 1 };
}

/** A shot: the kick takes the larger of the running value and the weapon's kick (no stacking runaway). */
export function kickRecoil(r: RecoilState, weapon: HeroWeapon, scale = 1): void {
  r.weapon = weapon;
  r.value = Math.max(r.value, RECOIL_PROFILE[weapon].kick * scale);
}

export function stepRecoil(r: RecoilState, dt: number): void {
  if (r.value <= 0) return;
  r.value *= Math.exp(-RECOIL_PROFILE[r.weapon].decay * Math.max(0, dt));
  if (r.value < 0.002) r.value = 0;
}

export const SWAP_SECONDS = 0.24;

export interface SwapState {
  /** Weapon model currently shown */
  shown: HeroWeapon;
  target: HeroWeapon;
  /** 0..1 progress of the swap motion; 1 = idle */
  t: number;
}

export function newSwap(w: HeroWeapon): SwapState {
  return { shown: w, target: w, t: 1 };
}

/** Advances the swap: the old model drops during the first half, the new one is shown at t = 0.5 and rises. */
export function stepSwap(s: SwapState, wanted: HeroWeapon, dt: number): void {
  if (wanted !== s.target) {
    s.target = wanted;
    // Retargeting before the midpoint keeps the current dip; from the midpoint on (or at rest) a fresh drop starts
    if (s.t >= 0.5) s.t = 0;
  }
  if (s.t < 1) {
    s.t = Math.min(1, s.t + dt / SWAP_SECONDS);
    if (s.t >= 0.5 && s.shown !== s.target) s.shown = s.target;
  } else if (s.shown !== s.target) {
    s.shown = s.target;
  }
}

/** 0..1 amount the rifle is lowered during a swap (0 at rest, 1 at the midpoint). */
export function swapLower(s: SwapState): number {
  return s.t >= 1 ? 0 : Math.sin(Math.PI * Math.max(0, Math.min(1, s.t)));
}

// ---------------------------------------------------------------------------------------------------------
// Diegetic HP colour (back pack lights)
// ---------------------------------------------------------------------------------------------------------

const HP_GREEN = [0x3d, 0xff, 0x7a] as const;
const HP_YELLOW = [0xff, 0xd2, 0x3a] as const;
const HP_RED = [0xff, 0x2e, 0x24] as const;

function mix(a: readonly number[], b: readonly number[], t: number): number {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Green above 60 %, yellow around 40 %, red under 25 %, with short blends between bands. */
export function hpColorHex(frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  if (f >= 0.65) return mix(HP_GREEN, HP_GREEN, 0);
  if (f >= 0.55) return mix(HP_YELLOW, HP_GREEN, (f - 0.55) / 0.1);
  if (f >= 0.35) return mix(HP_YELLOW, HP_YELLOW, 0);
  if (f >= 0.25) return mix(HP_RED, HP_YELLOW, (f - 0.25) / 0.1);
  return mix(HP_RED, HP_RED, 0);
}

/** Lit segments out of 4 (0 only when dead). */
export function hpSegments(frac: number, alive = true): number {
  if (!alive || frac <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil(Math.min(1, frac) * 4)));
}

/** Pack-light brightness 0..1.2: steady, breathing at mid HP, urgent blink when critical, dead = 0. */
export function hpPulse(frac: number, tSec: number, alive = true): number {
  if (!alive || frac <= 0) return 0;
  if (frac >= 0.55) return 1;
  if (frac >= 0.25) return 0.85 + 0.15 * Math.sin(tSec * 3.2);
  const rate = 7 + (0.25 - frac) * 40;
  return 0.35 + 0.85 * (0.5 + 0.5 * Math.sin(tSec * rate));
}

// ---------------------------------------------------------------------------------------------------------
// Muzzle socket handoff to the FX director
// ---------------------------------------------------------------------------------------------------------

/** Uses the rendered muzzle socket when it is plausibly the same shot (within `maxDist` of the sim spawn point). */
export function chooseMuzzle(
  socket: { x: number; y: number; valid: boolean },
  spawnX: number,
  spawnY: number,
  maxDist = 1.8,
): { x: number; y: number } {
  if (socket.valid && Math.hypot(socket.x - spawnX, socket.y - spawnY) <= maxDist) return { x: socket.x, y: socket.y };
  return { x: spawnX, y: spawnY };
}

// ---------------------------------------------------------------------------------------------------------
// Controller: ties the pieces together once per rendered frame
// ---------------------------------------------------------------------------------------------------------

export interface HeroFrame {
  state: HeroPoseState;
  shown: HeroWeapon;
  recoil: number;
  recoilProfile: RecoilProfile;
  /** 0..1 rail charge fraction (0 unless the rail is selected and charging) */
  railFrac: number;
  /** Combined low-ready amount (swap dip, save pose) */
  lower: number;
  offsets: HeroOffsets;
  hpFrac: number;
  alive: boolean;
  fired: boolean;
  swapping: boolean;
}

const STOMP_LAND_SECONDS = 0.3;
const WALL_JUMP_POSE_SECONDS = 0.32;

export class HeroController {
  readonly recoil: RecoilState = newRecoil();
  readonly offsets: HeroOffsets = zeroOffsets();
  swap: SwapState = newSwap(1);
  state: HeroPoseState = 'idle';
  private prevFlash = 0;
  private prevStomping = false;
  private stompLandT = 0;
  private wallJumpT = 0;
  private lastWall = 1;
  private fresh = true;
  private lastTick = -1;

  reset(weapon: HeroWeapon): void {
    this.recoil.value = 0;
    Object.assign(this.offsets, zeroOffsets());
    this.swap = newSwap(weapon);
    this.state = 'idle';
    this.prevFlash = 0;
    this.prevStomping = false;
    this.stompLandT = 0;
    this.wallJumpT = 0;
    this.fresh = false;
  }

  step(dt: number, i: HeroSimInput): HeroFrame {
    if (this.fresh || i.tick < this.lastTick) this.reset(i.weapon);
    this.lastTick = i.tick;
    const alive = i.hp > 0;

    // Shots: rising edge of the muzzle flash timer
    const fired = i.muzzleFlashTicks > this.prevFlash || (i.muzzleFlashTicks > 0 && this.prevFlash === 0);
    this.prevFlash = i.muzzleFlashTicks;
    if (fired && alive) kickRecoil(this.recoil, i.weapon);
    stepRecoil(this.recoil, dt);

    // Stomp touchdown: the dive ended while grounded
    if (this.prevStomping && !i.stomping && !i.airborne) this.stompLandT = STOMP_LAND_SECONDS;
    this.prevStomping = i.stomping;
    this.stompLandT = Math.max(0, this.stompLandT - dt);

    // The sim's wall-jump input lock is only 8 ticks; hold the twist pose a little longer so it reads
    if (i.wallDir !== 0) this.lastWall = i.wallDir;
    if (i.wallJumpLock > 0) this.wallJumpT = WALL_JUMP_POSE_SECONDS;
    else this.wallJumpT = Math.max(0, this.wallJumpT - dt);

    stepSwap(this.swap, i.weapon, dt);

    const saveActive = i.saveCooldown > 52;
    const state = selectHeroPose({
      dead: !alive,
      hurtFlashTicks: i.hurtFlashTicks,
      airborne: i.airborne,
      dashTicks: i.dashTicks,
      wallDir: i.wallDir,
      wallJumpLock: this.wallJumpT,
      stomping: i.stomping,
      stompLandTime: this.stompLandT,
      landingFactor: i.landingFactor,
      saveActive,
      speedX: i.vx,
      vy: i.vy,
    });
    this.state = state;

    const moveRel = Math.abs(i.vx) < 0.1 ? 1 : Math.sign(i.vx) === i.aimSignX ? 1 : -1;
    const tgt = targetOffsets(state, {
      moveRel,
      aimSignX: i.aimSignX,
      wallDir: i.wallDir || this.lastWall,
      landingFactor: i.landingFactor,
      hurtK: Math.min(1, i.hurtFlashTicks / 12),
      stompLandK: this.stompLandT / STOMP_LAND_SECONDS,
      speedNorm: Math.abs(i.vx) / 9,
    });
    smoothOffsets(this.offsets, tgt, dt, RATE_FAST[state] ?? 14);

    const lower = Math.max(this.offsets.lower, swapLower(this.swap));
    const railFrac =
      i.weapon === 4 && i.railChargeMax > 0 ? Math.max(0, Math.min(1, i.railCharge / i.railChargeMax)) : 0;
    return {
      state,
      shown: this.swap.shown,
      recoil: this.recoil.value,
      recoilProfile: RECOIL_PROFILE[this.recoil.weapon],
      railFrac,
      lower,
      offsets: this.offsets,
      hpFrac: i.maxHp > 0 ? Math.max(0, Math.min(1, i.hp / i.maxHp)) : 0,
      alive,
      fired,
      swapping: this.swap.t < 1,
    };
  }
}

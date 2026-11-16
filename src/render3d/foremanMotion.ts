/**
 * Slag Foreman procedural pose (display only). The Foreman is a static Meshy mesh (public/assets/models/foreman.glb),
 * so its weight comes from whole-body transforms instead of bones: a heavy plod, a rear-back telegraph before the
 * lunge, a forward slam on the strike, stagger rock and a face-down collapse. Pure and deterministic; the sim never
 * reads it. Pitch is about the feet, positive leans toward the facing direction.
 */
export interface ForemanPoseInput {
  alive: boolean;
  /** Ground speed in m/s the sim achieved */
  speed: number;
  winding: boolean;
  /** 0..1 progress through the telegraph */
  windFrac: number;
  striking: boolean;
  /** 0..1 smoothed stagger amount */
  stagger: number;
  /** 0..1 hit recoil */
  recoil: number;
  deathTicks: number;
  tSec: number;
  /** Accumulated gait phase (radians), see foremanGaitStep */
  gait: number;
  reduceMotion?: boolean;
}

export interface ForemanPose {
  lift: number;
  pitch: number;
  roll: number;
  sx: number;
  sy: number;
  sz: number;
  visible: boolean;
  /** 0..1 furnace heat for the emissive pulse */
  heat: number;
}

export const FOREMAN_DEATH_FALL_TICKS = 36;
export const FOREMAN_DEATH_VANISH_TICKS = 240;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;

/** Gait phase advance per second: slow, heavy steps that scale with ground speed. */
export function foremanGaitStep(speed: number): number {
  return speed > 0.05 ? 2.2 + speed * 0.9 : 0;
}

export function foremanPose(p: ForemanPoseInput): ForemanPose {
  const calm = p.reduceMotion ? 0.4 : 1;
  if (!p.alive) {
    const fall = easeIn(clamp01(p.deathTicks / FOREMAN_DEATH_FALL_TICKS));
    // A short bounce when the body lands, then it lies still and sinks (the scene handles the sink and shrink)
    const land = p.deathTicks > FOREMAN_DEATH_FALL_TICKS ? Math.max(0, 1 - (p.deathTicks - FOREMAN_DEATH_FALL_TICKS) / 10) : 0;
    return {
      lift: -0.12 * fall + 0.05 * land * Math.sin(land * 9),
      pitch: 1.42 * fall - 0.04 * land,
      roll: 0.05 * fall,
      sx: 1,
      sy: 1,
      sz: 1,
      visible: p.deathTicks < FOREMAN_DEATH_VANISH_TICKS,
      heat: Math.max(0, 1 - p.deathTicks / 60) * 0.6,
    };
  }
  const moving = clamp01(p.speed / 2.2);
  const breathe = Math.sin(p.tSec * 1.7);
  const step = Math.sin(p.gait);
  let lift = Math.abs(step) * 0.08 * moving * calm;
  let pitch = 0.1 + 0.06 * moving + 0.012 * breathe * calm; // hunched
  let roll = step * 0.055 * moving * calm + 0.012 * Math.sin(p.tSec * 0.9) * calm;
  let sy = 1 + 0.012 * breathe * calm;
  let sxz = 1 - 0.006 * breathe * calm;
  let heat = 0.25 + 0.1 * breathe;

  if (p.winding) {
    const w = easeOut(clamp01(p.windFrac));
    // Rear back and coil, with a tremble that builds toward the release
    pitch = -0.3 * w + 0.1 * (1 - w);
    sy = 1 - 0.09 * w;
    sxz = 1 + 0.06 * w;
    lift = -0.03 * w;
    roll += Math.sin(p.tSec * 55) * 0.012 * w * w * calm;
    heat = 0.4 + 0.6 * w;
  } else if (p.striking) {
    pitch = 0.42;
    sy = 1.035;
    sxz = 0.985;
    heat = 1;
  }
  if (p.stagger > 0) {
    pitch -= 0.2 * p.stagger;
    roll += 0.05 * p.stagger * Math.sin(p.tSec * 18) * calm;
  }
  pitch -= 0.04 * p.recoil;
  const pulse = 1 + 0.03 * p.recoil;
  return { lift, pitch, roll, sx: sxz * pulse, sy: sy * pulse, sz: sxz * pulse, visible: true, heat: clamp01(heat) };
}

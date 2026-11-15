// Core Vault boss framing: blends the camera focus from the player toward the player+boss midpoint and pulls the camera back
// far enough to keep both on screen. Pure math (no renderer access) so it is testable; scene3dFull feeds it and applies the result.
// The same dist drives the Classic orthographic zoom (zoom = 15.5 / camera z), so both views follow one rule.

export const BOSS_CAM_BASE_DIST = 15.5;
export const BOSS_CAM_MAX_DIST = 27;
const MARGIN_X = 3.4;
const MARGIN_Y = 2.8;
/** The player must stay at least this far inside the frame edge when the pair cannot fit even at max distance. */
const KEEP_PLAYER_X = 2.6;

export interface BossCamInput {
  /** Player focus point (already smoothed by the camera rig). */
  px: number;
  py: number;
  /** Boss center. */
  bx: number;
  by: number;
  /** Blend weight 0..1 (0 = pure follow camera). */
  k: number;
  /** Vertical field of view in degrees and viewport aspect. */
  fovDeg: number;
  aspect: number;
  baseDist?: number;
  maxDist?: number;
}

export interface BossCamOut {
  fx: number;
  fy: number;
  dist: number;
}

/** True when the boss should share the frame: alive, near enough, and no intro or attract camera in charge. */
export function bossFramingWanted(alive: boolean, dx: number, dy: number, introOrAttract: boolean): boolean {
  return alive && !introOrAttract && Math.abs(dx) < 34 && Math.abs(dy) < 16;
}

export function bossCameraBlend(i: BossCamInput): BossCamOut {
  const base = i.baseDist ?? BOSS_CAM_BASE_DIST;
  const max = i.maxDist ?? BOSS_CAM_MAX_DIST;
  const k = Math.max(0, Math.min(1, i.k));
  if (k <= 0) return { fx: i.px, fy: i.py, dist: base };
  const tan = Math.tan((i.fovDeg * Math.PI) / 360);
  const aspect = Math.max(1, i.aspect);
  const dx = Math.abs(i.bx - i.px);
  const dy = Math.abs(i.by - i.py);
  const needW = dx / 2 + MARGIN_X;
  const needH = dy / 2 + MARGIN_Y;
  const wanted = Math.max(base, needW / (tan * aspect), needH / tan);
  const dist = Math.min(max, wanted);
  // Midpoint, kept so the player never leaves the frame when the pair is wider than the maximum view.
  const halfWAtDist = dist * tan * aspect;
  const reach = Math.max(0, halfWAtDist - KEEP_PLAYER_X);
  const mx = Math.max(i.px - reach, Math.min(i.px + reach, (i.px + i.bx) / 2));
  const my = (i.py + i.by) / 2;
  return {
    fx: i.px + (mx - i.px) * k,
    fy: i.py + (my - i.py) * k,
    dist: base + (dist - base) * k,
  };
}

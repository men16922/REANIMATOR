// Side-view camera framing: pure, deterministic functions (no renderer access) so they are unit-testable.
// scene3dFull feeds them and applies the result. Classic View reuses the same focus and distance (zoom = 15.5 / dist).

import type { SectorId3D } from '../game3d/types3d';

/** Default camera distance (m). Was 15.5; closer so the operative and enemies read at action-game size. */
export const CAM_BASE_DIST = 13.5;
/** Where the player sits on screen, measured from the bottom (0..1). 0.40 to 0.45 keeps the floor in view. */
export const CAM_PLAYER_SCREEN_Y = 0.42;
/** Dead zone (m) used while airborne: the camera ignores small vertical swings so jumps do not bob the frame. */
export const CAM_AIR_DEADZONE_Y = 1.7;
export const CAM_ZOOM_MIN = 0.92;
export const CAM_ZOOM_MAX = 1.28;

export interface FrameRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Half extents of the visible area on the z = 0 lane for a perspective camera at `dist`. */
export function frameHalfExtents(dist: number, fovDeg: number, aspect: number): { halfW: number; halfH: number } {
  const halfH = dist * Math.tan((fovDeg * Math.PI) / 360);
  return { halfW: halfH * Math.max(0.2, aspect), halfH };
}

/** Vertical offset from the player's anchor to the camera focus so the player lands at `screenY` from the bottom. */
export function verticalFocusOffset(halfH: number, screenY = CAM_PLAYER_SCREEN_Y): number {
  return (0.5 - screenY) * 2 * halfH;
}

/** Fraction of the frame (from the bottom) at which world height `y` appears when the focus is `fy`. */
export function screenYFraction(y: number, fy: number, halfH: number): number {
  return 0.5 + (y - fy) / (2 * halfH);
}

function clampAxis(f: number, half: number, lo: number, hi: number): { v: number; clamped: boolean } {
  if (hi - lo <= 2 * half) return { v: (lo + hi) / 2, clamped: true };
  if (f < lo + half) return { v: lo + half, clamped: true };
  if (f > hi - half) return { v: hi - half, clamped: true };
  return { v: f, clamped: false };
}

export interface ClampedFocus {
  x: number;
  y: number;
  clampedX: boolean;
  clampedY: boolean;
}

/** Keeps the frustum edges inside `rect`. An axis narrower than the frustum is centered on the rect. */
export function clampFocusToRect(fx: number, fy: number, halfW: number, halfH: number, rect: FrameRect): ClampedFocus {
  const cx = clampAxis(fx, halfW, rect.minX, rect.maxX);
  const cy = clampAxis(fy, halfH, rect.minY, rect.maxY);
  return { x: cx.v, y: cy.v, clampedX: cx.clamped, clampedY: cy.clamped };
}

/**
 * Extends `rect` so a player standing outside it (hidden pockets such as the Vault Nook lie outside every room
 * rectangle) stays in frame. Unchanged when the player is inside. The margin leaves the player 3/4 of the way
 * across the frame at the extended edge.
 */
export function rectIncludingPlayer(rect: FrameRect, px: number, py: number, halfW: number, halfH: number): FrameRect {
  if (px >= rect.minX && px <= rect.maxX && py >= rect.minY && py <= rect.maxY) return rect;
  const mx = halfW * 0.5;
  const my = halfH * 0.5;
  return {
    minX: Math.min(rect.minX, px - mx),
    maxX: Math.max(rect.maxX, px + mx),
    minY: Math.min(rect.minY, py - my),
    maxY: Math.max(rect.maxY, py + my),
  };
}

/** Share of the frustum area (0..1) that lies outside `rect`. */
export function outsideFraction(fx: number, fy: number, halfW: number, halfH: number, rect: FrameRect): number {
  const w = Math.max(0, Math.min(fx + halfW, rect.maxX) - Math.max(fx - halfW, rect.minX));
  const h = Math.max(0, Math.min(fy + halfH, rect.maxY) - Math.max(fy - halfH, rect.minY));
  return 1 - (w * h) / (4 * halfW * halfH);
}

/** R14 door transition: the clamp eases at 5/s and no rect edge moves faster than 16 m/s, so a room change pans instead of whipping. */
export const ROOM_EASE_RATE = 5;
export const ROOM_EASE_MAX_SPEED = 16;

/** Smooths the clamp rectangle across room changes (about 0.4 s to settle at the default rate) and snaps on teleports. */
export class FrameRectSmoother {
  rect: FrameRect = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  private ready = false;

  /**
   * `rate` of 8/s reaches 96% of a boundary change in 0.4 s. `maxSpeed` (m/s) caps how fast any edge moves, which
   * bounds the pan speed of a clamped camera. A player more than 3 m outside the current rect (teleport, respawn) snaps.
   */
  update(dt: number, target: FrameRect, px: number, py: number, rate = 8, maxSpeed = Infinity): FrameRect {
    const r = this.rect;
    const away = Math.max(r.minX - px, px - r.maxX, r.minY - py, py - r.maxY);
    if (!this.ready || away > 3 || !Number.isFinite(rate)) {
      this.rect = { ...target };
      this.ready = true;
      return this.rect;
    }
    const k = 1 - Math.exp(-Math.max(0, dt) * rate);
    const cap = Math.max(0, dt) * maxSpeed;
    const step = (from: number, to: number): number => from + Math.max(-cap, Math.min(cap, (to - from) * k));
    r.minX = step(r.minX, target.minX);
    r.maxX = step(r.maxX, target.maxX);
    r.minY = step(r.minY, target.minY);
    r.maxY = step(r.maxY, target.maxY);
    return r;
  }

  reset(): void {
    this.ready = false;
  }
}

export interface SectorCamHint {
  /** Distance multiplier. Above 1 shows more (vertical spaces). */
  distMul: number;
  /** Player screen height from the bottom. */
  screenY: number;
}

/** Shaft is a vertical hub: pull back and sit the player lower so climbs read ahead. Core defers to bossCamera. */
export function sectorCameraHint(sector: SectorId3D | string): SectorCamHint {
  switch (sector) {
    case 'shaft':
      return { distMul: 1.14, screenY: 0.4 };
    case 'mines':
      return { distMul: 1.04, screenY: 0.42 };
    case 'core':
      return { distMul: 1.0, screenY: 0.42 };
    default:
      return { distMul: 1.0, screenY: CAM_PLAYER_SCREEN_Y };
  }
}

export interface ThreatSample {
  /** Hostile distances (m) from the player, any order. Only living enemies. */
  distances: readonly number[];
}

/** Target zoom multiplier for the camera distance: wider with many nearby hostiles, tighter when alone or in a duel. */
export function dynamicZoomTarget(threat: ThreatSample): number {
  let near = 0;
  let nearest = Infinity;
  for (const d of threat.distances) {
    if (d < 16) near++;
    if (d < nearest) nearest = d;
  }
  let z = 1 + 0.06 * Math.min(near, 4);
  if (near <= 1 && nearest < 6) z -= 0.05;
  if (near === 0) z -= 0.03;
  return Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, z));
}

/** Frame-rate independent smoothing (slower zoom-out than zoom-in avoids pumping). */
export function stepZoom(cur: number, target: number, dt: number): number {
  const rate = target > cur ? 1.6 : 0.9;
  return cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) * rate));
}

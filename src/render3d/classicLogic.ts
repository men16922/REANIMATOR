// Classic View (1996 look) pure logic: designed 256-colour palette, Bayer 4x4 dither, nearest-colour quantiser,
// integer-scale layout, transition curve and persisted preferences. No three.js or DOM here, so node tests cover it.
// The palette is an original design (16 hue ramps x 16 shades). No Abuse palette file or sprite data is read or copied.

export type ViewMode = 'modern' | 'classic';

/** Classic internal resolution height. Width follows the display aspect (16:10 gives 320x200). */
export const CLASSIC_HEIGHT = 200;
/** Estimated: Abuse fits roughly five character heights in a 200 px tall view, ~9.2 world units of 1.8 m characters. */
export const CLASSIC_VIEW_HEIGHT_UNITS = 9.2;
export const PALETTE_SIZE = 256;
export const TRANSITION_SECONDS = 0.4;

/**
 * Classic: additive glow sprites and lamp shafts are scaled down by this factor. ACES plus the 1/2.2 gamma lifts a faint
 * additive layer over a near-black room to ~0.4 sRGB, and the palette pass then snaps it to a flat grey dither patch
 * (the large grey bowls and cones under ceiling lamps). Lamp shafts keep a faint banded trace; the soft glow sprites
 * are hidden (scale 0) because at any visible strength they only produce grey dither haze.
 */
export const CLASSIC_ADDITIVE_SCALE = 0.15;
export const CLASSIC_GLOW_SPRITE_SCALE = 0;

/** Bayer 4x4 ordered-dither matrix (values 0..15). */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Dither offset in [-0.5, 0.5) for pixel (x, y). */
export function bayerThreshold(x: number, y: number): number {
  const ix = ((Math.floor(x) % 4) + 4) % 4;
  const iy = ((Math.floor(y) % 4) + 4) % 4;
  return (BAYER4[iy * 4 + ix] + 0.5) / 16 - 0.5;
}

type Rgb = readonly [number, number, number];

/** Hue ramps as [dark, mid, light] anchors (sRGB 0..255): rust, olive, sickly green and steel dominate, like a 90s DOS shooter. */
const RAMPS: ReadonlyArray<readonly [Rgb, Rgb, Rgb]> = [
  [[6, 8, 10], [90, 96, 104], [216, 220, 224]], // 0 steel gray
  [[16, 8, 4], [122, 60, 28], [224, 160, 112]], // 1 rust brown
  [[12, 8, 4], [90, 64, 40], [200, 168, 120]], // 2 earth
  [[24, 8, 0], [192, 90, 16], [255, 192, 96]], // 3 orange
  [[28, 20, 0], [192, 154, 24], [255, 240, 160]], // 4 amber
  [[8, 12, 4], [74, 106, 32], [192, 224, 112]], // 5 olive green
  [[0, 16, 8], [32, 160, 80], [160, 255, 176]], // 6 toxic green
  [[0, 12, 12], [24, 120, 120], [144, 240, 224]], // 7 teal
  [[4, 8, 14], [44, 88, 144], [160, 208, 255]], // 8 steel blue
  [[6, 4, 26], [58, 58, 152], [176, 176, 255]], // 9 indigo
  [[16, 8, 24], [112, 48, 138], [224, 160, 255]], // 10 purple
  [[24, 4, 16], [160, 32, 104], [255, 160, 208]], // 11 magenta
  [[24, 0, 0], [160, 24, 16], [255, 112, 96]], // 12 blood red
  [[24, 12, 8], [160, 104, 72], [255, 216, 184]], // 13 flesh
  [[20, 14, 8], [138, 122, 88], [240, 228, 192]], // 14 sand
  [[0, 8, 16], [64, 160, 192], [240, 255, 255]], // 15 cyan glow
];
export const RAMP_COUNT = RAMPS.length;
export const RAMP_STEPS = PALETTE_SIZE / RAMP_COUNT;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 256 x RGB bytes, ramp-major (index = ramp * 16 + shade). Deterministic. */
export function buildPalette(): Uint8Array {
  const out = new Uint8Array(PALETTE_SIZE * 3);
  const half = RAMP_STEPS / 2;
  for (let r = 0; r < RAMP_COUNT; r++) {
    const [dark, mid, light] = RAMPS[r];
    for (let s = 0; s < RAMP_STEPS; s++) {
      const lo = s <= half;
      const t = lo ? s / half : (s - half) / (RAMP_STEPS - 1 - half);
      const a = lo ? dark : mid;
      const b = lo ? mid : light;
      for (let c = 0; c < 3; c++) out[(r * RAMP_STEPS + s) * 3 + c] = Math.round(lerp(a[c], b[c], t));
    }
  }
  return out;
}

/** Index of the palette entry nearest to (r, g, b) in 0..1 sRGB (luma-weighted squared distance). First wins ties. */
export function nearestPaletteIndex(palette: Uint8Array, r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  const n = palette.length / 3;
  for (let i = 0; i < n; i++) {
    const dr = palette[i * 3] / 255 - r;
    const dg = palette[i * 3 + 1] / 255 - g;
    const db = palette[i * 3 + 2] / 255 - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Dither spread in sRGB units. Matches the shader (uSpread). One ramp step is roughly 0.06 apart. */
export const DITHER_SPREAD = 0.07;

/** Ordered-dither then quantise one pixel, mirroring the classic palette shader. Input and output are 0..1 sRGB. */
export function ditherQuantize(palette: Uint8Array, x: number, y: number, r: number, g: number, b: number, spread = DITHER_SPREAD): { index: number; rgb: [number, number, number] } {
  const o = bayerThreshold(x, y) * spread;
  const cl = (v: number): number => Math.min(1, Math.max(0, v + o));
  const index = nearestPaletteIndex(palette, cl(r), cl(g), cl(b));
  return { index, rgb: [palette[index * 3] / 255, palette[index * 3 + 1] / 255, palette[index * 3 + 2] / 255] };
}

export interface ClassicLayout {
  /** Internal render size in pixels (height is always 200). */
  w: number;
  h: number;
  /** Integer upscale factor. */
  scale: number;
  /** Scaled picture size and its offset inside the drawing buffer (black bars when not an exact multiple). */
  viewW: number;
  viewH: number;
  offX: number;
  offY: number;
}

/** Pixel-perfect layout: internal height 200, width follows aspect, integer scale, centred. */
export function computeClassicLayout(bufW: number, bufH: number): ClassicLayout {
  const bw = Math.max(1, Math.floor(bufW));
  const bh = Math.max(1, Math.floor(bufH));
  const scale = Math.max(1, Math.floor(bh / CLASSIC_HEIGHT));
  const w = Math.max(1, Math.min(Math.round((CLASSIC_HEIGHT * bw) / bh), Math.floor(bw / scale)));
  const h = CLASSIC_HEIGHT;
  const viewW = w * scale;
  const viewH = h * scale;
  return { w, h, scale, viewW, viewH, offX: Math.floor((bw - viewW) / 2), offY: Math.floor((bh - viewH) / 2) };
}

/** Maps canvas NDC (-1..1, y up) into the letterboxed classic picture so aiming stays exact when bars exist. */
export function remapNdcToClassic(ndcX: number, ndcY: number, layout: ClassicLayout, bufW: number, bufH: number): { x: number; y: number } {
  const px = ((ndcX + 1) / 2) * bufW;
  const py = ((1 - ndcY) / 2) * bufH;
  return { x: ((px - layout.offX) / layout.viewW) * 2 - 1, y: -(((py - layout.offY) / layout.viewH) * 2 - 1) };
}

/** Orthographic half extents in world units for the classic side view. zoom > 1 pushes in (intro). */
export function classicOrthoHalf(aspect: number, zoom = 1): { halfW: number; halfH: number } {
  const halfH = (CLASSIC_VIEW_HEIGHT_UNITS / 2) / Math.max(0.2, zoom);
  return { halfW: halfH * aspect, halfH };
}

export interface TransitionFrame {
  /** True once the displayed mode should already be the target mode. */
  switched: boolean;
  /** Mosaic block size in internal pixels, >= 1. */
  block: number;
  /** Progress 0..1. */
  t: number;
  done: boolean;
}

/** Mosaic grows into the mode switch at t = 0.5, then shrinks away: 0.4 s total. */
export function transitionFrame(elapsedSec: number, duration = TRANSITION_SECONDS): TransitionFrame {
  const t = Math.min(1, Math.max(0, elapsedSec / duration));
  const peak = Math.sin(Math.PI * t);
  return { switched: t >= 0.5, block: 1 + Math.round(peak * peak * 30), t, done: t >= 1 };
}

// ---- persisted preferences ----
export const VIEW_STORE = { mode: 'reanimator.viewMode.v1', crt: 'reanimator.crt.v1' } as const;

export function parseViewMode(raw: string | null | undefined): ViewMode {
  return raw === 'classic' ? 'classic' : 'modern';
}
export function toggleViewMode(m: ViewMode): ViewMode {
  return m === 'classic' ? 'modern' : 'classic';
}
export function parseCrt(raw: string | null | undefined): boolean {
  return raw === '1';
}
export function viewLabel(m: ViewMode): string {
  return m === 'classic' ? 'Classic 1996' : 'Modern';
}
export function transitionLabel(target: ViewMode): string {
  return target === 'classic' ? '1996' : '2026';
}

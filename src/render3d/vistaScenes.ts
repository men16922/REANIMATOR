// Sector vistas: what lies beyond the back-wall windows (z -6 .. -24). Pure and deterministic (seeded per room),
// no DOM, no WebGL. Output is plain typed-array geometry that vista3d.ts turns into two merged shader meshes per sector
// (opaque silhouettes + additive glow), plus the window frames and glass. Render-only: nothing here touches the sim.
import type { Level3D, RoomDef3D, SectorId3D } from '../game3d/types3d.ts';
import { mulberry32 } from './textures3d.ts';
import { ANIM, Geo, rgb, type GeoData, type V3 } from './vistaGeo.ts';

export type VistaWindowStyle = 'observation' | 'grille' | 'broken';

export interface VistaWindow {
  id: string;
  style: VistaWindowStyle;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Back wall plane the windows are cut into (mirrors BACK_WALL_Z in decor3d.ts). */
export const VISTA_WALL_Z = -3.15;
/** Draw calls one sector vista may add: frames, glass, silhouettes, glow (+ headroom). */
export const VISTA_MAX_DRAWCALLS_PER_SECTOR = 8;
export const VISTA_MAX_VERTS_PER_SECTOR = 60000;
/** Margins past the room rect where the vista is clipped, so neighbours do not leak through windows. */
export const VISTA_CLIP_MARGIN_X = 6;
export const VISTA_CLIP_MARGIN_Y = 1.5;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Cell size of the displaced rock wall in mines (shared with decor3d so the broken holes follow the grid). */
export function minesWallGrid(room: RoomDef3D): { segX: number; segY: number; cellX: number; cellY: number } {
  const w = room.maxX - room.minX;
  const h = room.maxY - room.minY;
  const segX = Math.max(2, Math.round(w / 1.2));
  const segY = Math.max(2, Math.round(h / 1.2));
  return { segX, segY, cellX: w / segX, cellY: h / segY };
}

/** Window openings of one room. Rects are in world space and sit fully inside the room rect. */
export function vistaWindows(room: RoomDef3D): VistaWindow[] {
  const cx = (room.minX + room.maxX) / 2;
  const win = (i: number, style: VistaWindowStyle, minX: number, maxX: number, minY: number, maxY: number): VistaWindow => ({
    id: `${room.id}:w${i}`,
    style,
    minX,
    maxX,
    minY,
    maxY,
  });
  switch (room.sector) {
    case 'airlock':
      return [
        win(0, 'observation', room.minX + 5, room.minX + 18, room.minY + 3.2, room.minY + 10.4),
        win(1, 'observation', room.minX + 22.5, room.minX + 28.5, room.minY + 3.2, room.minY + 9),
      ];
    case 'shaft':
      return [win(0, 'observation', cx - 4.2, cx + 4.2, room.minY + 3.5, room.maxY - 3.5)];
    case 'mines': {
      const g = minesWallGrid(room);
      const sx = (x: number, up: boolean): number => room.minX + (up ? Math.ceil((x - room.minX) / g.cellX) : Math.floor((x - room.minX) / g.cellX)) * g.cellX;
      const sy = (y: number, up: boolean): number => room.minY + (up ? Math.ceil((y - room.minY) / g.cellY) : Math.floor((y - room.minY) / g.cellY)) * g.cellY;
      const hole = (i: number, a: number, b: number): VistaWindow => win(i, 'broken', sx(a, false), sx(b, true), sy(room.minY + 1.6, false), sy(room.maxY - 1.2, true));
      return [hole(0, room.minX + 5, room.minX + 13), hole(1, room.minX + 18, room.minX + 27)];
    }
    case 'biolabs':
      return [win(0, 'observation', room.minX + 5, room.minX + 23, room.minY + 3.7, room.maxY - 1.6)];
    case 'security':
      return [win(0, 'grille', room.minX + 2.5, room.maxX - 2.5, room.minY + 1.2, room.maxY - 0.7)];
    case 'core':
      return [win(0, 'observation', cx - 8, cx + 8, room.minY + 3.2, room.maxY - 1.9)];
  }
}

const FRAME_COLOR: Record<SectorId3D, number> = {
  airlock: 0x54687c,
  shaft: 0x6a5c4c,
  mines: 0x6a4a2a,
  biolabs: 0x6a8a82,
  security: 0x7a3236,
  core: 0x8a4224,
};

const GLASS_TINT: Record<SectorId3D, number> = {
  airlock: 0x4ab8d8,
  shaft: 0xc8a050,
  mines: 0x80a060,
  biolabs: 0x58e0b0,
  security: 0x70a8e0,
  core: 0xff7a40,
};

/** Haze color the far silhouettes fade into. */
export const VISTA_HAZE: Record<SectorId3D, number> = {
  airlock: 0x0c2230,
  shaft: 0x2a1c10,
  mines: 0x24180c,
  biolabs: 0x0c2a22,
  security: 0x141c34,
  core: 0x3a1208,
};

export interface VistaData {
  roomId: string;
  sector: SectorId3D;
  windows: VistaWindow[];
  sil: GeoData;
  glow: GeoData;
  frames: GeoData;
  /** Null for sectors whose openings have no glass (broken rock holes). */
  glass: GeoData | null;
  /** World clip box: minX, maxX, minY, maxY. */
  clip: [number, number, number, number];
}

interface Layers {
  sil: Geo;
  glow: Geo;
}

type Rnd = () => number;

const BLACK: V3 = [0, 0, 0];

// ----------------------------------------------------------------------------
// Frames and glass
// ----------------------------------------------------------------------------

function buildFrames(room: RoomDef3D, wins: VistaWindow[], rnd: Rnd): { frames: Geo; glass: Geo | null } {
  const F = new Geo();
  let G: Geo | null = null;
  const base = FRAME_COLOR[room.sector];
  const mid = rgb(base, 0.8);
  const lite = rgb(base, 1.25);
  const dark = rgb(base, 0.45);
  const rivet = rgb(base, 1.7);
  for (const w of wins) {
    const W = w.maxX - w.minX;
    const H = w.maxY - w.minY;
    const cx = (w.minX + w.maxX) / 2;
    const cy = (w.minY + w.maxY) / 2;
    if (w.style === 'broken') {
      // Timber props inside the opening and ragged rock lips around it.
      const wood = rgb(0x6a4a2a, 0.9);
      const woodDark = rgb(0x3e2a16);
      F.box(w.minX + 0.35, cy, -2.7, 0.34, H + 0.2, 0.34, woodDark, wood);
      F.box(w.maxX - 0.35, cy, -2.7, 0.34, H + 0.2, 0.34, woodDark, wood);
      F.box(cx, w.maxY - 0.45, -2.7, W + 0.6, 0.34, 0.36, woodDark, wood);
      F.box(w.minX + 1.0, w.maxY - 1.1, -2.72, 1.9, 0.18, 0.2, woodDark, wood, undefined, -0.78);
      F.box(w.maxX - 1.0, w.maxY - 1.1, -2.72, 1.9, 0.18, 0.2, woodDark, wood, undefined, 0.78);
      const rock = (c: number): V3 => rgb(c, 0.8 + rnd() * 0.5);
      const lip = (x: number, y: number, s: number): void => {
        F.box(x, y, -2.95 + rnd() * 0.15, s * (0.8 + rnd() * 0.6), s * (0.7 + rnd() * 0.7), 0.5 + rnd() * 0.3, rock(0x2a2118), rock(0x54442f), undefined, (rnd() - 0.5) * 0.7);
      };
      for (let x = w.minX; x <= w.maxX; x += 0.75) {
        lip(x, w.minY - 0.05 + rnd() * 0.15, 0.6 + rnd() * 0.5);
        lip(x, w.maxY + 0.05 - rnd() * 0.15, 0.6 + rnd() * 0.5);
      }
      for (let y = w.minY + 0.7; y < w.maxY - 0.5; y += 0.75) {
        lip(w.minX - 0.05 + rnd() * 0.15, y, 0.6 + rnd() * 0.5);
        lip(w.maxX + 0.05 - rnd() * 0.15, y, 0.6 + rnd() * 0.5);
      }
      continue;
    }
    const t = w.style === 'grille' ? 0.3 : 0.42;
    const zc = -3.0;
    const depth = 0.5;
    // Outer frame bars.
    F.box(cx, w.maxY + t / 2, zc, W + 2 * t, t, depth, mid, lite);
    F.box(cx, w.minY - t / 2, zc, W + 2 * t, t, depth, dark, mid);
    F.box(w.minX - t / 2, cy, zc, t, H, depth, mid, lite);
    F.box(w.maxX + t / 2, cy, zc, t, H, depth, mid, lite);
    // Inner bevel: a thin bright lip catches the room light.
    F.box(cx, w.maxY - 0.04, zc + 0.12, W, 0.08, 0.2, lite, lite);
    F.box(cx, w.minY + 0.06, zc + 0.12, W, 0.12, 0.28, mid, mid);
    // Mullions.
    if (w.style === 'observation') {
      const n = Math.max(1, Math.round(W / 3.6));
      for (let i = 1; i < n; i++) F.box(w.minX + (W * i) / n, cy, zc - 0.05, 0.16, H, 0.3, dark, mid);
      if (H > 6) F.box(cx, w.minY + H * 0.62, zc - 0.05, W, 0.14, 0.28, dark, mid);
    } else {
      for (let x = w.minX + 0.9; x < w.maxX - 0.4; x += 0.9) F.box(x, cy, zc + 0.05, 0.06, H, 0.12, dark, mid);
      F.box(cx, w.minY + H * 0.5, zc + 0.05, W, 0.07, 0.14, dark, mid);
    }
    // Rivets along the front of the frame, corner plates.
    const rz = zc + depth / 2 + 0.02;
    const step = 0.55;
    for (let x = w.minX - t / 2; x <= w.maxX + t / 2 + 0.01; x += step) {
      F.box(x, w.maxY + t / 2, rz, 0.1, 0.1, 0.07, rivet);
      F.box(x, w.minY - t / 2, rz, 0.1, 0.1, 0.07, rivet);
    }
    for (let y = w.minY + step / 2; y < w.maxY; y += step) {
      F.box(w.minX - t / 2, y, rz, 0.1, 0.1, 0.07, rivet);
      F.box(w.maxX + t / 2, y, rz, 0.1, 0.1, 0.07, rivet);
    }
    for (const [px, py] of [[w.minX - t / 2, w.maxY + t / 2], [w.maxX + t / 2, w.maxY + t / 2], [w.minX - t / 2, w.minY - t / 2], [w.maxX + t / 2, w.minY - t / 2]] as const) {
      F.box(px, py, rz - 0.03, t * 1.5, t * 1.5, 0.1, mid, lite);
    }
    // Glass pane.
    if (!G) G = new Geo();
    const tint = rgb(GLASS_TINT[room.sector]);
    G.quadXY(w.minX, w.minY, w.maxX, w.maxY, VISTA_WALL_Z + 0.05, tint, tint, tint, tint);
  }
  return { frames: F, glass: G };
}

// ----------------------------------------------------------------------------
// Sector vistas
// ----------------------------------------------------------------------------

const pulse = (ph: number, sp: number) => ({ m: ANIM.PULSE, ph, sp });
const flick = (ph: number, sp: number) => ({ m: ANIM.FLICKER, ph, sp });

function airlock(room: RoomDef3D, L: Layers, rnd: Rnd): void {
  const { sil, glow } = L;
  const x0 = room.minX - 8;
  const x1 = room.maxX + 8;
  const mid = (x0 + x1) / 2;
  const span = x1 - x0;
  sil.gradXY(x0, room.minY - 5, x1, room.maxY + 5, -24, rgb(0x04080e), rgb(0x0e1c2a));
  const tierH = 3.7;
  for (let r = 0; r < 4; r++) {
    const z = -6.5 - r * 3.7;
    for (let t = 0; t < 5; t++) {
      const y = room.minY - 1.2 + t * tierH;
      sil.box(mid, y, z, span, 0.28, 1.7, rgb(0x16202c), rgb(0x2c3c50));
      for (let x = x0 + rnd() * 1.2; x < x1; x += 2.9) {
        if (rnd() < 0.05) continue;
        const px = x + (rnd() - 0.5) * 0.3;
        sil.box(px, y + 0.14 + 1.25, z, 1.35, 2.5, 1.1, rgb(0x101a26), rgb(0x2c4258));
        const lit = 0.4 + 0.6 * rnd();
        const an = rnd() < 0.12 ? flick(rnd() * 50, 5 + rnd() * 5) : pulse(rnd() * 6.28, 0.4 + rnd() * 0.6);
        const lo = rgb(0x1a8ab0, lit);
        const hi = rgb(0x40d8f0, lit);
        glow.quadXY(px - 0.38, y + 0.69, px + 0.38, y + 2.19, z + 0.56, lo, lo, hi, hi, an);
      }
      for (let x = x0 + 2 + rnd() * 3; x < x1; x += 5.8) {
        const c = rgb(0x70e8ff, 0.8);
        glow.quadXY(x - 0.45, y + 0.3, x + 0.45, y + 0.36, z + 0.9, c, c, c, c, flick(rnd() * 40, 3 + rnd() * 6));
      }
    }
    for (let x = x0 + 3 + r * 1.7; x < x1; x += 11) sil.box(x, room.minY + 7, z - 0.7, 0.55, 26, 0.55, rgb(0x0c141e), rgb(0x1c2c3c));
  }
  // Mist banks and slanted light shafts from the hall ceiling.
  for (let k = 0; k < 3; k++) {
    glow.gradXY(x0, room.minY - 2, x1, room.minY + 3.5 + k, -8 - k * 4.5, rgb(0x1a5a74, 0.34 - k * 0.07), BLACK);
  }
  for (let i = 0; i < 4; i++) {
    const x = room.minX + 2 + i * 9 + rnd() * 3;
    const c = rgb(0x4ac8e8, 0.22);
    glow.quadXY(x - 0.4, room.minY, x + 0.4, room.maxY + 3, -13 - i, BLACK, BLACK, c, c, pulse(rnd() * 6, 0.3));
  }
}

function shaft(room: RoomDef3D, L: Layers, rnd: Rnd): void {
  const { sil, glow } = L;
  const cx = (room.minX + room.maxX) / 2;
  const x0 = room.minX - 8;
  const x1 = room.maxX + 8;
  const yb = -80;
  const yt = room.maxY + 14;
  sil.gradXY(x0, yb, x1, yt, -26, rgb(0x050302), rgb(0x1a1008));
  // The glow at the bottom of the well, a long way down.
  glow.gradXY(x0, yb, x1, yb + 55, -23, rgb(0xd8781c, 0.7), BLACK, pulse(0.3, 0.5));
  glow.gradXY(cx - 9, yb + 4, cx + 9, yb + 30, -22, rgb(0xffb050, 0.55), BLACK, pulse(2.1, 0.8));
  // Lift rails with cross ties.
  const rails: [number, number][] = [[cx - 5.2, -6], [cx - 4.5, -6], [cx + 4.5, -6], [cx + 5.2, -6], [cx - 2.4, -11], [cx - 1.8, -11], [cx + 1.8, -11], [cx + 2.4, -11]];
  for (const [rx, rz] of rails) sil.box(rx, (yb + yt) / 2, rz, 0.24, yt - yb, 0.24, rgb(0x2a2420), rgb(0x4a4036));
  for (let y = yb; y < yt; y += 3.2) {
    sil.box(cx, y, -6, 10.8, 0.12, 0.12, rgb(0x241e1a), rgb(0x3a322a));
    sil.box(cx, y + 1.6, -6, 10.8, 0.1, 0.1, rgb(0x241e1a), rgb(0x3a322a), undefined, 0.02);
    sil.box(cx, y, -11, 4.8, 0.1, 0.1, rgb(0x1c1814), rgb(0x302a22));
  }
  // Other floors: slabs on both far walls with lit windows.
  for (let y = yt - 4; y > yb; y -= 7.5) {
    const jitter = (rnd() - 0.5) * 1.5;
    sil.box((x0 + cx - 8.5) / 2, y + jitter, -17, cx - 8.5 - x0, 1.2, 3.2, rgb(0x120c08), rgb(0x2a2018));
    sil.box((x1 + cx + 8.5) / 2, y + jitter, -17, x1 - cx - 8.5, 1.2, 3.2, rgb(0x120c08), rgb(0x2a2018));
    for (const side of [-1, 1]) {
      for (let k = 0; k < 11; k++) {
        const wx = side < 0 ? x0 + 1 + rnd() * (cx - 9.5 - x0) : cx + 9.5 + rnd() * (x1 - cx - 10.5);
        if (rnd() < 0.35) continue;
        const warm = rnd() < 0.7;
        const c = rgb(warm ? 0xffb860 : 0xc8e8ff, 0.5 + 0.5 * rnd());
        const wy = y + 0.9 + jitter;
        glow.quadXY(wx - 0.3, wy, wx + 0.3, wy + 0.4, -15.3, c, c, c, c, rnd() < 0.15 ? flick(rnd() * 30, 4 + rnd() * 5) : pulse(rnd() * 6, 0.3 + rnd() * 0.5));
      }
    }
    const strip = rgb(0xff9a3a, 0.7);
    glow.quadXY(cx - 3 - rnd() * 4, y - 3.1 + jitter, cx + 3 + rnd() * 4, y - 3.02 + jitter, -22.5, strip, strip, strip, strip, flick(y, 2 + rnd() * 3));
  }
  // The lift car, endlessly descending.
  const rs = -70;
  const carAnim = { m: ANIM.WRAP, ph: 1, sp: 2.2, am: 100, piv: [cx, 8, rs] as V3 };
  sil.box(cx, 8, -8.5, 3.6, 4.2, 2.6, rgb(0x14100c), rgb(0x3a3026), carAnim);
  glow.quadXY(cx - 1.4, 9.6, cx + 1.4, 9.9, -7.15, rgb(0xffd890), rgb(0xffd890), rgb(0xffd890), rgb(0xffd890), { ...carAnim, piv: [cx, 9.75, rs] });
  glow.quadXY(cx - 0.4, 6.3, cx + 0.4, 6.8, -7.15, rgb(0xff4a20), rgb(0xff4a20), rgb(0xff4a20), rgb(0xff4a20), { ...carAnim, piv: [cx, 6.55, rs] });
  // Falling sparks.
  for (let i = 0; i < 80; i++) {
    const x = cx + (rnd() - 0.5) * 24;
    const z = -4.5 - rnd() * 9;
    const y = -14 + rnd() * 36;
    const c = rgb(rnd() < 0.5 ? 0xffc060 : 0xff7a28, 0.8 + rnd() * 0.5);
    glow.quadXY(x - 0.04, y, x + 0.04, y + 0.42, z, c, c, c, c, { m: ANIM.WRAP, ph: 0, sp: 5 + rnd() * 9, am: 36, piv: [x, y + 0.21, -14] });
  }
}

function mines(room: RoomDef3D, L: Layers, rnd: Rnd): void {
  const { sil, glow } = L;
  const x0 = room.minX - 8;
  const x1 = room.maxX + 8;
  sil.gradXY(x0, -24, x1, 10, -27, rgb(0x070503), rgb(0x1e140a));
  // Lava and acid rivers: stacked glow bands that read as a river receding into the cave.
  for (let k = 0; k < 6; k++) {
    const z = -7 - k * 3.4;
    const acid = k % 2 === 0;
    const col = acid ? rgb(0x7ee03a, 0.5 - k * 0.04) : rgb(0xff5a1c, 0.55 - k * 0.04);
    const top = -13.2 + k * 0.5;
    glow.gradXY(x0, top - 1.6, x1, top, z, BLACK, col, { m: ANIM.CHASE_X, ph: k * 1.7, sp: 1.1 + k * 0.15 });
    glow.gradXY(x0, top, x1, top + 0.35, z, col, BLACK, pulse(k, 0.6));
  }
  glow.gradXY(x0, -15, x1, -8, -20, rgb(0xff6a20, 0.32), BLACK, pulse(1.3, 0.35));
  // Hanging stalactites and standing stalagmites at many depths.
  for (let x = x0; x < x1; x += 1.3) {
    const z = -6 - rnd() * 16;
    const len = 2 + rnd() * 5;
    const top = room.maxY + 3.4;
    const c0 = rgb(0x1a130c, 0.8 + rnd() * 0.5);
    sil.tube([x, top, z], [x + (rnd() - 0.5) * 0.4, top - len, z], 0.4 + rnd() * 0.55, 0.02, 6, c0, rgb(0x3a2c1c));
    if (rnd() < 0.55) {
      const h = 0.8 + rnd() * 2.6;
      sil.tube([x + rnd(), -14.2, z - 2], [x + rnd(), -14.2 + h, z - 2], 0.45 + rnd() * 0.4, 0.03, 6, rgb(0x120d08), rgb(0x2c2016));
    }
  }
  // Crystal glints.
  for (let i = 0; i < 26; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const z = -8 - rnd() * 12;
    const h = 0.5 + rnd() * 1.1;
    sil.tube([x, -13.8, z], [x + 0.1, -13.8 + h, z], 0.14, 0.01, 5, rgb(0x103c34), rgb(0x2fa890, 0.9));
    glow.tube([x, -13.8, z + 0.05], [x + 0.1, -13.8 + h, z + 0.05], 0.12, 0.01, 5, rgb(0x1a7a68, 0.5), rgb(0x60ffd0, 0.8), pulse(rnd() * 6, 0.5 + rnd()));
  }
  // Timber frames receding down a tunnel.
  for (let x = x0 + 3; x < x1; x += 9) {
    const z = -9.5;
    sil.box(x, -10, z, 0.4, 8, 0.4, rgb(0x1c1208), rgb(0x4a3418));
    sil.box(x + 5, -10, z, 0.4, 8, 0.4, rgb(0x1c1208), rgb(0x4a3418));
    sil.box(x + 2.5, -6.1, z, 6, 0.4, 0.4, rgb(0x1c1208), rgb(0x4a3418));
  }
  // The excavator: tracked chassis, cab, boom, a screw drill and the bucket wheel behind it.
  const mz = -13;
  const dx = room.minX + 11;
  sil.box(dx, -12.4, mz, 10.5, 1.8, 3.6, rgb(0x0e0a06), rgb(0x2a2018));
  for (let i = 0; i < 6; i++) sil.box(dx - 4.2 + i * 1.7, -13.1, mz + 1.9, 1.5, 1.5, 0.3, rgb(0x080604), rgb(0x1c150e));
  sil.box(dx - 3, -10.0, mz, 3.6, 2.6, 2.8, rgb(0x120d08), rgb(0x34281c));
  sil.box(dx + 1.2, -10.6, mz, 4.6, 1.8, 2.4, rgb(0x100b07), rgb(0x2c2218));
  sil.tube([dx + 3.4, -10.4, mz], [dx + 9, -10.8, mz], 0.55, 0.45, 8, rgb(0x1a130c), rgb(0x3a2c1c));
  const drillX = dx + 9;
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const f0 = i / segs;
    const f1 = (i + 1) / segs;
    sil.tube([drillX + f0 * 6.5, -10.8, mz], [drillX + f1 * 6.5, -10.8, mz], 2.1 * (1 - f0) + 0.02, 2.1 * (1 - f1) + 0.02, 10, rgb(i % 2 ? 0x2a2218 : 0x3c3020, 0.8), rgb(i % 2 ? 0x5a4a34 : 0x706048, 0.8), { m: ANIM.CHASE_X, ph: 0, sp: 3.2 });
  }
  for (let i = 0; i < 9; i++) {
    const c = rgb(rnd() < 0.5 ? 0xffb050 : 0xff6a20, 0.6 + rnd() * 0.5);
    const sx = drillX + 6.3 + rnd() * 0.9;
    const sy = -10.8 + (rnd() - 0.5) * 0.9;
    glow.quadXY(sx - 0.1, sy - 0.1, sx + 0.1, sy + 0.1, mz + 0.4, c, c, c, c, flick(rnd() * 30, 9 + rnd() * 8));
  }
  glow.quadXY(dx - 4.1, -9.6, dx - 2.2, -8.6, mz + 1.45, rgb(0xffc060, 0.8), rgb(0xffc060, 0.8), rgb(0xffe8a0, 0.9), rgb(0xffe8a0, 0.9), flick(7, 0.5));
  for (let i = 0; i < 5; i++) {
    const lx = dx - 3.5 + i * 2.1;
    glow.quadXY(lx - 0.12, -11.9, lx + 0.12, -11.7, mz + 1.85, rgb(0xff8a2a), rgb(0xff8a2a), rgb(0xff8a2a), rgb(0xff8a2a), pulse(i, 1.1));
  }
  const wheelC: V3 = [room.minX + 3, -6.2, -18];
  const spin = { m: ANIM.SPIN, ph: 0, sp: 0.22, piv: wheelC };
  sil.disc(wheelC[0], wheelC[1], wheelC[2] - 0.2, 1.0, 12, rgb(0x2a2018), rgb(0x2a2018), spin);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    sil.box(wheelC[0], wheelC[1], wheelC[2], 9.4, 0.4, 0.5, rgb(0x120d08), rgb(0x3a2c1c), spin, a);
    for (const s of [-1, 1]) {
      const bx = wheelC[0] + Math.cos(a) * 4.7 * s;
      const by = wheelC[1] + Math.sin(a) * 4.7 * s;
      sil.box(bx, by, wheelC[2], 1.3, 1.0, 0.7, rgb(0x1a130c), rgb(0x4a3a24), spin, a);
      glow.quadXY(bx - 0.12, by - 0.12, bx + 0.12, by + 0.12, wheelC[2] + 0.4, rgb(0xff6a20, 0.7), rgb(0xff6a20, 0.7), rgb(0xff6a20, 0.7), rgb(0xff6a20, 0.7), { ...spin, piv: wheelC });
    }
  }
  // Rising embers.
  for (let i = 0; i < 36; i++) {
    const x = x0 + rnd() * (x1 - x0);
    const y = -14 + rnd() * 10;
    const z = -6 - rnd() * 14;
    const c = rgb(rnd() < 0.5 ? 0xff8a30 : 0xa8ff60, 0.7);
    glow.quadXY(x - 0.05, y, x + 0.05, y + 0.1, z, c, c, c, c, { m: ANIM.WRAP, ph: 0, sp: -(0.5 + rnd() * 0.8), am: 12, piv: [x, y + 0.05, -14] });
  }
}

function biolabs(room: RoomDef3D, L: Layers, rnd: Rnd): void {
  const { sil, glow } = L;
  const cx = (room.minX + room.maxX) / 2;
  const x0 = room.minX - 8;
  const x1 = room.maxX + 8;
  sil.gradXY(x0, -14, x1, 18, -24, rgb(0x030a08), rgb(0x0c2420));
  // Culture fluid glow and caustic light shafts.
  glow.gradXY(x0, -10, x1, 3, -19, rgb(0x1fae7a, 0.34), rgb(0x1fae7a, 0.2), pulse(0.4, 0.4));
  glow.gradXY(x0, 3, x1, 16, -19, rgb(0x1fae7a, 0.2), rgb(0x0a5a40, 0.1));
  for (let i = 0; i < 6; i++) {
    const x = cx - 15 + i * 6 + rnd() * 2;
    const c = rgb(0x58e0b0, 0.2);
    glow.quadXY(x - 1.1, -10, x + 1.1, 16, -9 - rnd() * 3, BLACK, BLACK, c, c, { m: ANIM.CHASE_X, ph: i * 2, sp: 0.7 });
  }
  // Tank structure: ribs and rims.
  for (const dx of [-9.8, -6, 6, 9.8]) sil.box(cx + dx, 3, -6.2, 0.55, 30, 0.55, rgb(0x0a1614), rgb(0x24423c));
  for (const y of [-6.5, 11.5]) {
    sil.box(cx, y, -6.2, x1 - x0, 1.1, 0.8, rgb(0x0a1614), rgb(0x2c4a44));
    const c = rgb(0x58e0b0, 0.55);
    glow.quadXY(x0, y + 0.55, x1, y + 0.62, -5.75, c, c, c, c, pulse(y, 0.6));
  }
  // The specimen.
  const cz = -11;
  const bodyC: V3 = [cx + 0.5, 1.6, cz];
  const breathe = { m: ANIM.BREATHE, ph: 0, sp: 0.95, am: 0.055, piv: bodyC };
  sil.blob(bodyC[0], bodyC[1], cz, 4.4, 3.2, 3, 8, 14, rgb(0x040a08), rgb(0x1c4c40), breathe);
  glow.blob(bodyC[0], bodyC[1], cz + 0.1, 4.5, 3.3, 3.1, 7, 12, rgb(0x0a3a2a, 0.35), rgb(0x2fb88a, 0.22), breathe);
  const headC: V3 = [cx + 0.9, 5.7, cz - 0.6];
  const hb = { m: ANIM.BREATHE, ph: 1.1, sp: 0.95, am: 0.07, piv: headC };
  sil.blob(headC[0], headC[1], headC[2], 2.2, 1.8, 1.7, 7, 12, rgb(0x061210), rgb(0x24584a), hb);
  glow.blob(headC[0], headC[1], headC[2] + 0.05, 2.3, 1.9, 1.8, 6, 10, rgb(0x0a3a2a, 0.3), rgb(0x40d8a0, 0.25), hb);
  for (let i = 0; i < 3; i++) {
    const ex = headC[0] - 0.9 + i * 0.9;
    const ey = headC[1] + 0.1 + (i === 1 ? 0.35 : 0);
    const e = rgb(0xc8ffe0, 0.95);
    glow.quad([ex - 0.32, ey, headC[2] + 1.75], [ex, ey - 0.15, headC[2] + 1.75], [ex + 0.32, ey, headC[2] + 1.75], [ex, ey + 0.2, headC[2] + 1.75], e, e, e, e, { m: ANIM.FLICKER, ph: i * 3.7, sp: 0.35, piv: headC }, headC);
  }
  // Tentacles and arms.
  const tentacle = (root: V3, dirX: number, dirY: number, segs: number, r0: number, ph: number): void => {
    let p: V3 = root;
    for (let s = 0; s < segs; s++) {
      const f = s / segs;
      const next: V3 = [p[0] + dirX * (1.1 + f * 0.3) + Math.sin(s * 0.9 + ph) * 0.45, p[1] + dirY * 1.5, p[2] + (rnd() - 0.5) * 0.4];
      const ra = r0 * (1 - f);
      const rb = r0 * (1 - (s + 1) / segs);
      sil.tube(p, next, Math.max(0.05, ra), Math.max(0.04, rb), 7, rgb(0x08181a), rgb(0x1e5a4e), { m: ANIM.SWAY, ph: ph + s * 0.4, sp: 0.8, am: 0.35 + f * 0.5 });
      p = next;
    }
  };
  for (let i = 0; i < 8; i++) tentacle([bodyC[0] + (i - 3.5) * 1.0, -0.8, cz + (rnd() - 0.5) * 2], (i - 3.5) * 0.12, -1, 6, 0.55, i * 0.8);
  tentacle([bodyC[0] - 4, 2.4, cz + 0.3], -0.9, 0.7, 5, 0.5, 5.1);
  tentacle([bodyC[0] + 4.4, 2.4, cz + 0.3], 0.9, 0.7, 5, 0.5, 2.3);
  // Lesser specimens in neighbouring tanks.
  for (const [dx, sc] of [[-13.5, 0.6], [14, 0.7]] as const) {
    const c: V3 = [cx + dx, 0.5, -18];
    const b = { m: ANIM.BREATHE, ph: dx, sp: 0.7, am: 0.06, piv: c };
    sil.blob(c[0], c[1], c[2], 4 * sc, 3 * sc, 2.6 * sc, 7, 12, rgb(0x040a08), rgb(0x1a4438), b);
    glow.blob(c[0], c[1], c[2] + 0.1, 4.1 * sc, 3.1 * sc, 2.7 * sc, 6, 10, rgb(0x0a3a2a, 0.3), rgb(0x2fb88a, 0.2), b);
  }
  // Bubbles.
  for (let i = 0; i < 70; i++) {
    const x = cx - 16 + rnd() * 32;
    const z = -5 - rnd() * 11;
    const y = -8 + rnd() * 22;
    const s = 0.05 + rnd() * 0.07;
    const c = rgb(0xa0ffd8, 0.45 + rnd() * 0.4);
    glow.quadXY(x - s, y - s, x + s, y + s, z, c, c, c, c, { m: ANIM.WRAP, ph: 0, sp: -(0.5 + rnd() * 0.9), am: 24, piv: [x, y, -8] });
  }
}

function security(room: RoomDef3D, L: Layers, rnd: Rnd): void {
  const { sil, glow } = L;
  const cx = (room.minX + room.maxX) / 2;
  const x0 = room.minX - 8;
  const x1 = room.maxX + 8;
  sil.gradXY(x0, -10, x1, 44, -34, rgb(0x1a2244), rgb(0x04060e));
  glow.gradXY(x0, 4, x1, 12, -33, rgb(0x4a5aa8, 0.28), BLACK, pulse(0, 0.2));
  // Facility skyline in three depth layers with lit windows.
  const layers: { z: number; top: [number, number]; col: number }[] = [
    { z: -26, top: [8, 17], col: 0x0e1426 },
    { z: -19, top: [6, 14], col: 0x0a0f1e },
    { z: -13, top: [3, 11], col: 0x070a14 },
  ];
  for (const ly of layers) {
    for (let x = x0; x < x1; ) {
      const w = 2.2 + rnd() * 3.6;
      const top = ly.top[0] + rnd() * (ly.top[1] - ly.top[0]);
      const base = -8;
      sil.box(x + w / 2, (top + base) / 2, ly.z, w, top - base, 3, rgb(ly.col, 0.7), rgb(ly.col, 1.5));
      for (let wy = top - 0.8; wy > top - 7 && wy > 0; wy -= 0.9) {
        for (let wx = x + 0.35; wx < x + w - 0.3; wx += 0.7) {
          if (rnd() < 0.62) continue;
          const c = rgb(rnd() < 0.55 ? 0xffc870 : rnd() < 0.5 ? 0x70d8ff : 0xe8f0ff, 0.5 + rnd() * 0.5);
          glow.quadXY(wx, wy, wx + 0.32, wy + 0.22, ly.z + 1.55, c, c, c, c, rnd() < 0.08 ? flick(rnd() * 40, 3 + rnd() * 5) : undefined);
        }
      }
      x += w + rnd() * 0.5;
    }
  }
  // Holographic displays: scanning panels with chart bars.
  for (let i = 0; i < 10; i++) {
    const x = cx - 24 + i * 5.3 + (rnd() - 0.5) * 1.4;
    const y = 8.5 + rnd() * 6;
    const z = -7 - rnd() * 6;
    const alert = i === 6;
    const hue = alert ? 0xff4a3a : rnd() < 0.5 ? 0x40d8ff : 0xffb840;
    const pw = 3.6 + rnd() * 1.4;
    const ph = 2.2 + rnd() * 0.8;
    const lo = rgb(hue, 0.06);
    const hi = rgb(hue, 0.3);
    glow.quadXY(x - pw / 2, y - ph / 2, x + pw / 2, y + ph / 2, z, lo, lo, hi, hi, { m: ANIM.CHASE_Y, ph: i, sp: 1.4 + rnd() });
    const edge = rgb(hue, 0.85);
    glow.quadXY(x - pw / 2, y + ph / 2 - 0.05, x + pw / 2, y + ph / 2, z + 0.02, edge, edge, edge, edge, pulse(i, 0.9));
    glow.quadXY(x - pw / 2, y - ph / 2, x + pw / 2, y - ph / 2 + 0.05, z + 0.02, edge, edge, edge, edge);
    glow.quadXY(x - pw / 2, y - ph / 2, x - pw / 2 + 0.05, y + ph / 2, z + 0.02, edge, edge, edge, edge);
    glow.quadXY(x + pw / 2 - 0.05, y - ph / 2, x + pw / 2, y + ph / 2, z + 0.02, edge, edge, edge, edge);
    const bars = 6;
    for (let b = 0; b < bars; b++) {
      const bx = x - pw / 2 + 0.3 + (b * (pw - 0.6)) / bars;
      const bh = 0.25 + rnd() * (ph - 0.9);
      const bc = rgb(hue, 0.6);
      glow.quadXY(bx, y - ph / 2 + 0.2, bx + (pw - 0.6) / bars - 0.12, y - ph / 2 + 0.2 + bh, z + 0.02, bc, bc, bc, bc, pulse(rnd() * 6, 0.5 + rnd()));
    }
  }
  // Watchtowers with sweeping searchlights.
  const towers = [cx - 15, cx + 3, cx + 18];
  towers.forEach((tx, i) => {
    const z = -15 - i * 0.8;
    const topY = 12 + i * 1.5;
    sil.box(tx, (topY - 8) / 2, z, 1.4, topY + 8, 1.4, rgb(0x080c18), rgb(0x1c2640));
    sil.box(tx, topY + 0.5, z, 2.4, 1.0, 2.0, rgb(0x0a0e1c), rgb(0x28324c));
    const lamp = rgb(0xdff4ff, 0.9);
    glow.disc(tx, topY + 0.5, z + 1.05, 0.5, 10, lamp, rgb(0x70a0d0, 0.2), pulse(i, 1.2));
    const red = rgb(0xff3030, 0.9);
    glow.quadXY(tx - 0.1, topY + 1.1, tx + 0.1, topY + 1.3, z + 1.05, red, red, red, red, flick(i * 9, 0.9));
    const sweep = { m: ANIM.SWEEP, ph: i * 2.1, sp: 0.5 + i * 0.12, am: 0.62, piv: [tx, topY + 0.5, z + 1.05] as V3 };
    glow.beam(tx, topY + 0.5, z + 1.05, 1.15 + i * 0.32, 46, 3.2, rgb(0xbfe4ff, 0.42), sweep);
  });
}

function core(room: RoomDef3D, L: Layers, rnd: Rnd): void {
  const { sil, glow } = L;
  const cx = (room.minX + room.maxX) / 2;
  const x0 = room.minX - 8;
  const x1 = room.maxX + 8;
  sil.gradXY(x0, -20, x1, 34, -30, rgb(0x120604), rgb(0x2a0e08));
  glow.gradXY(x0, -16, x1, -2, -14, rgb(0xff4a14, 0.5), BLACK, pulse(0, 0.9));
  const cz = -12;
  // Plasma column: a hot core inside a wider, slower mantle, with a horizontal halo.
  glow.tube([cx, -16, cz], [cx, 30, cz], 2.2, 2.2, 16, rgb(0xff4a10, 0.5), rgb(0xff6a20, 0.6), pulse(0, 2.1));
  glow.tube([cx, -16, cz + 0.05], [cx, 30, cz + 0.05], 1.0, 1.0, 12, rgb(0xffb060, 0.8), rgb(0xfff0c0, 0.9), pulse(1.7, 3.7));
  const halo = rgb(0xff5a18, 0.28);
  glow.quadXY(cx - 8, -16, cx, 30, cz + 0.6, BLACK, halo, halo, BLACK, pulse(0.5, 1.4));
  glow.quadXY(cx, -16, cx + 8, 30, cz + 0.6, halo, BLACK, BLACK, halo, pulse(0.5, 1.4));
  for (const dx of [-3.4, 3.4]) sil.box(cx + dx, 6, cz + 0.4, 0.8, 52, 0.9, rgb(0x0e0604), rgb(0x2a1610));
  for (let y = -12; y < 28; y += 4.6) sil.box(cx, y, cz + 0.5, 8.2, 0.5, 1.2, rgb(0x0e0604), rgb(0x34201a));
  // Rotating dashed rings round the column.
  const rings: [number, number, number][] = [[-2, 5.2, 0.7], [2.5, 6.4, -0.55], [7, 5.6, 0.85], [11.5, 6.8, -0.6]];
  rings.forEach(([ry, R, sp], ri) => {
    const spin = { m: ANIM.SPIN_Y, ph: ri * 0.7, sp, piv: [cx, ry, cz] as V3 };
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = cx + Math.cos(a) * R;
      const pz = cz + Math.sin(a) * R;
      sil.box(px, ry, pz, 1.7, 0.5, 0.6, rgb(0x120806), rgb(0x3a2218), spin, 0, -(a + Math.PI / 2));
      if (i % 2 === 0) glow.box(px, ry, pz, 1.5, 0.14, 0.62, rgb(0xff7a30, 0.9), rgb(0xffd090, 1), spin, 0, -(a + Math.PI / 2));
    }
  });
  // The great gear behind everything.
  const gc: V3 = [cx, 4, -21];
  const gspin = { m: ANIM.SPIN, ph: 0, sp: 0.1, piv: gc };
  for (let i = 0; i < 6; i++) sil.box(gc[0], gc[1], gc[2], 22, 0.9, 1.2, rgb(0x1c0e08), rgb(0x3a1e14), gspin, (i / 6) * Math.PI);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const tx = gc[0] + Math.cos(a) * 11;
    const ty = gc[1] + Math.sin(a) * 11;
    sil.box(tx, ty, gc[2], 1.8, 1.1, 1.2, rgb(0x1c0e08), rgb(0x40221a), gspin, a);
    if (i % 2 === 0) {
      const c = rgb(0xff5a20, 0.8);
      glow.quadXY(tx - 0.2, ty - 0.2, tx + 0.2, ty + 0.2, gc[2] + 0.65, c, c, c, c, { ...gspin, piv: gc });
    }
  }
  // Red conduits with energy running through them.
  for (let i = 0; i < 7; i++) {
    const left = i % 2 === 0;
    const y = -8 + rnd() * 24;
    const z = -6.5 - rnd() * 4;
    const xa = left ? x0 : cx + 9;
    const xb = left ? cx - 9 : x1;
    sil.tube([xa, y, z], [xb, y + (rnd() - 0.5) * 2, z], 0.5 + rnd() * 0.4, 0.5 + rnd() * 0.4, 8, rgb(0x240c08), rgb(0x5a2218));
    glow.quadXY(xa, y - 0.06, xb, y + 0.06, z + 0.62, rgb(0xff2a10, 0.7), rgb(0xff2a10, 0.7), rgb(0xff2a10, 0.7), rgb(0xff2a10, 0.7), { m: ANIM.CHASE_X, ph: i * 1.3, sp: 4 + rnd() * 3 });
  }
  // Cooling towers at the edges, steaming.
  for (const tx of [cx - 21, cx + 21]) {
    sil.tube([tx, -16, -17], [tx, 18, -17], 4.4, 3.2, 14, rgb(0x120806), rgb(0x34201a));
    glow.gradXY(tx - 3.6, 17, tx + 3.6, 26, -16.5, rgb(0xff6a20, 0.4), BLACK, pulse(tx, 0.8));
  }
  // Embers rising off the core.
  for (let i = 0; i < 60; i++) {
    const x = cx + (rnd() - 0.5) * 26;
    const z = -5 - rnd() * 12;
    const y = -12 + rnd() * 20;
    const c = rgb(rnd() < 0.5 ? 0xff7a28 : 0xffc060, 0.8);
    glow.quadXY(x - 0.05, y, x + 0.05, y + 0.18, z, c, c, c, c, { m: ANIM.WRAP, ph: 0, sp: -(1 + rnd() * 2), am: 34, piv: [x, y + 0.09, -14] });
  }
}

const BUILDERS: Record<SectorId3D, (room: RoomDef3D, L: Layers, rnd: Rnd) => void> = {
  airlock,
  shaft,
  mines,
  biolabs,
  security,
  core,
};

/** Pure, deterministic vista for one room. */
export function layoutVista(room: RoomDef3D): VistaData {
  const rnd = mulberry32(hashString(room.id + ':vista'));
  const windows = vistaWindows(room);
  const L: Layers = { sil: new Geo(), glow: new Geo() };
  BUILDERS[room.sector](room, L, rnd);
  const { frames, glass } = buildFrames(room, windows, mulberry32(hashString(room.id + ':frame')));
  return {
    roomId: room.id,
    sector: room.sector,
    windows,
    sil: L.sil.data(),
    glow: L.glow.data(),
    frames: frames.data(),
    glass: glass ? glass.data() : null,
    clip: [room.minX - VISTA_CLIP_MARGIN_X, room.maxX + VISTA_CLIP_MARGIN_X, room.minY - VISTA_CLIP_MARGIN_Y, room.maxY + VISTA_CLIP_MARGIN_Y],
  };
}

export function layoutAllVistas(level: Level3D): VistaData[] {
  return level.rooms.map(layoutVista);
}

// Ambient life behind the back wall and in the dead space between wall and gameplay plane. Pure and deterministic
// (seeded per room), no DOM, no WebGL, no sim state. Output is plain typed arrays that ambient3d.ts turns into three
// draw calls per sector: far silhouettes, additive event glow, one pooled Points mesh. Display only.
import type { Level3D, RoomDef3D, SectorId3D } from '../game3d/types3d.ts';
import { mulberry32 } from './textures3d.ts';
import { Geo, rgb, type GeoData, type V3 } from './vistaGeo.ts';
import { VISTA_CLIP_MARGIN_X, VISTA_CLIP_MARGIN_Y, vistaWindows, type VistaWindow } from './vistaScenes.ts';

/** Vertex-shader modes for the far and event meshes. Keep in sync with VERT in ambient3d.ts. */
export const AMB = {
  STATIC: 0,
  /** x += fract(t * sp + ph) * am - am / 2: crosses a span of am m once every 1 / sp seconds. */
  TRAVEL: 1,
  /** Swings around the pivot by +-am rad. */
  SWEEP: 2,
  /** Spins around the pivot (XY plane). */
  SPIN: 3,
  /** Hard on/off blink (steady glow when Reduce is on). */
  BLINK: 4,
  /** Slow brightness breathing. */
  PULSE: 5,
  /** Rare lightning flashes (never drawn when Reduce is on). */
  LIGHTNING: 6,
  BOBX: 7,
  BOBY: 8,
  /** Stuttering light strip (steady when Reduce is on). */
  FLICKER: 9,
  /** Spins around the vertical axis through the pivot. */
  SPIN_Y: 10,
  /** Scales around the pivot. */
  BREATHE: 11,
} as const;

/** Point motion kinds. Keep in sync with the point VERT in ambient3d.ts. */
export const PT = { DUST: 0, DRIP: 1, STEAM: 2, BUBBLE: 3, RAIN: 4, SPARK: 5 } as const;

export interface PointData {
  /** Box center (x, y, z). */
  pos: Float32Array;
  /** kind, phase, speed, size (m). */
  kind: Float32Array;
  /** Wrap box width, height, velocity x, velocity y (m, m/s). */
  box: Float32Array;
  col: Float32Array;
  count: number;
}

export interface AmbientData {
  roomId: string;
  sector: SectorId3D;
  far: GeoData;
  ev: GeoData;
  pts: PointData;
  /** Names of the moving far/event layers placed in this room (for tests and telemetry). */
  events: string[];
  /** World clip box: minX, maxX, minY, maxY. */
  clip: [number, number, number, number];
}

export const AMBIENT_MAX_VERTS_PER_SECTOR = 24000;
export const AMBIENT_MAX_POINTS_PER_SECTOR = 700;
export const AMBIENT_DRAWCALLS_PER_SECTOR = 3;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Rnd = () => number;

class Pts {
  pos: number[] = [];
  kind: number[] = [];
  box: number[] = [];
  col: number[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
  /** n points that wander through a box (cx, cy, cz, w, h) with velocity (vx, vy). */
  fill(rnd: Rnd, n: number, k: number, cx: number, cy: number, cz: number, w: number, h: number, vx: number, vy: number, size: number, c: V3, zJit = 0): void {
    for (let i = 0; i < n; i++) {
      this.pos.push(cx, cy, cz + (rnd() - 0.5) * zJit);
      this.kind.push(k, rnd(), 0.6 + rnd() * 1.2, size * (0.7 + rnd() * 0.6));
      this.box.push(w, h, vx * (0.8 + rnd() * 0.4), vy * (0.8 + rnd() * 0.4));
      this.col.push(c[0], c[1], c[2]);
    }
  }
  data(): PointData {
    return {
      pos: new Float32Array(this.pos),
      kind: new Float32Array(this.kind),
      box: new Float32Array(this.box),
      col: new Float32Array(this.col),
      count: this.count,
    };
  }
}

interface Ctx {
  room: RoomDef3D;
  win: VistaWindow[];
  far: Geo;
  ev: Geo;
  pts: Pts;
  rnd: Rnd;
  events: string[];
}

const BLACK: V3 = [0, 0, 0];

/** Far silhouette plus matching lit window row crossing behind a window. Returns the span. */
function crossing(c: Ctx, name: string, w: VistaWindow, y: number, z: number, len: number, hgt: number, period: number, body: V3, lit: V3, windows: number): void {
  const cx = (w.minX + w.maxX) / 2;
  const span = w.maxX - w.minX + len + 6;
  const ph = c.rnd();
  const sp = 1 / period;
  const an = { m: AMB.TRAVEL, ph, sp, am: span };
  c.far.box(cx, y, z, len, hgt, 1.2, body, body, an);
  c.far.box(cx, y + hgt * 0.62, z + 0.7, len * 0.9, hgt * 0.1, 0.1, lit, lit, an);
  for (let i = 0; i < windows; i++) {
    const wx = cx - len * 0.4 + (len * 0.8 * (i + 0.5)) / windows;
    c.ev.box(wx, y + hgt * 0.1, z + 0.75, (len * 0.5) / windows, hgt * 0.2, 0.05, lit, lit, an);
  }
  c.events.push(name);
}

function beacon(c: Ctx, name: string, x: number, y: number, z: number, color: V3, speed: number, len: number): void {
  const ph = c.rnd() * 6.28;
  const piv: V3 = [x, y, z];
  c.ev.disc(x, y, z, 0.35, 8, color, color, { m: AMB.PULSE, ph, sp: 2.2 });
  for (const s of [0, Math.PI]) c.ev.beam(x, y, z + 0.01, s, len, 0.9, color, { m: AMB.SPIN, ph: ph + s, sp: speed, piv });
  c.events.push(name);
}

function dustBox(c: Ctx, n: number, tint: V3, size = 0.07): void {
  const r = c.room;
  c.pts.fill(c.rnd, n, PT.DUST, (r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2, -1.4, r.maxX - r.minX, r.maxY - r.minY, 0.12, 0.05, size, tint, 3.0);
}

function steamVent(c: Ctx, x: number, y: number, h: number, tint: V3, n = 22): void {
  c.pts.fill(c.rnd, n, PT.STEAM, x, y + h / 2, -2.4, 0.7, h, 0.1, 0.8, 0.5, tint, 0.8);
}

function dripLine(c: Ctx, x: number, top: number, h: number, tint: V3): void {
  c.pts.fill(c.rnd, 4, PT.DRIP, x, top - h / 2, -2.2, 0.15, h, 0, -6.5, 0.07, tint, 0.4);
}

function airlock(c: Ctx): void {
  const r = c.room;
  const cold = rgb(0xa8e4ff, 0.9);
  for (const w of c.win) {
    // Frost drifting past the observation glass (far side).
    c.pts.fill(c.rnd, 70, PT.RAIN, (w.minX + w.maxX) / 2, (w.minY + w.maxY) / 2, -9, w.maxX - w.minX + 4, w.maxY - w.minY + 2, 0.5, -0.45, 0.1, cold, 5);
  }
  // Distant alarm beacons turning on far gantries.
  const w0 = c.win[0];
  beacon(c, 'airlock-beacon', w0.minX + (w0.maxX - w0.minX) * 0.25, w0.minY + 2.2, -13, rgb(0xff7a30, 0.9), 1.4, 5);
  beacon(c, 'airlock-beacon', w0.minX + (w0.maxX - w0.minX) * 0.8, w0.minY + 4.6, -17, rgb(0xff4a30, 0.8), -1.1, 5);
  // Cryo pod status lights along the back wall.
  const y = r.minY + 2.7;
  for (let i = 0; i < 9; i++) {
    const x = r.minX + 2.5 + i * 2.5 + c.rnd() * 0.6;
    const col = c.rnd() < 0.6 ? rgb(0x40ffb0, 0.9) : rgb(0xffb040, 0.9);
    c.ev.box(x, y + (i % 2) * 0.35, -3.02, 0.14, 0.14, 0.04, col, col, { m: AMB.BLINK, ph: c.rnd(), sp: 0.5 + c.rnd() * 0.9 });
  }
  c.events.push('airlock-pod-lights');
  dustBox(c, 70, rgb(0xb0e0ff, 0.5));
  steamVent(c, r.minX + 6 + c.rnd() * 4, r.minY + 0.3, 3.2, rgb(0xc8f0ff, 0.35));
  steamVent(c, r.maxX - 5 - c.rnd() * 4, r.minY + 0.3, 3.2, rgb(0xc8f0ff, 0.35));
}

function shaft(c: Ctx): void {
  const r = c.room;
  const w = c.win[0];
  // Maglev car on a far track plus a slower cargo pod.
  crossing(c, 'shaft-maglev', w, w.minY + 2.1, -11, 9, 1.5, 17, rgb(0x2a2a30), rgb(0xffd890, 0.9), 6);
  crossing(c, 'shaft-cargo-pod', w, w.minY + 5.4, -15, 4, 1.8, 26, rgb(0x24201a), rgb(0xffa040, 0.8), 2);
  const cx = (r.minX + r.maxX) / 2;
  // Amber warning sweeps on the shaft wall.
  for (let i = 0; i < 3; i++) {
    const y = r.minY + 6 + i * 8 + c.rnd() * 2;
    const x = i % 2 ? r.minX + 2.5 : r.maxX - 2.5;
    c.ev.disc(x, y, -3.0, 0.3, 8, rgb(0xffa020, 0.9), rgb(0xff8000, 0.5), { m: AMB.PULSE, ph: i, sp: 3 });
    c.ev.beam(x, y, -2.99, i % 2 ? 0.3 : Math.PI - 0.3, 5, 1.1, rgb(0xff9020, 0.55), { m: AMB.SWEEP, ph: i * 1.7, sp: 1.3, am: 0.9, piv: [x, y, -2.99] });
  }
  c.events.push('shaft-warning-sweep');
  dustBox(c, 90, rgb(0xffd8a0, 0.45), 0.08);
  steamVent(c, cx - 3, r.minY + 1, 4, rgb(0xffe0b8, 0.3));
  dripLine(c, cx + 2.5, r.maxY - 2, 6, rgb(0xa0c0d0, 0.5));
  dripLine(c, cx - 5.5, r.maxY - 6, 6, rgb(0xa0c0d0, 0.5));
}

function mines(c: Ctx): void {
  const r = c.room;
  const rail = rgb(0x3a2a1a);
  for (let i = 0; i < c.win.length; i++) {
    const w = c.win[i];
    const y = w.minY + 1.4;
    // Far rail with an ore cart train rolling along it.
    c.far.box((w.minX + w.maxX) / 2, y - 0.35, -10.5, w.maxX - w.minX + 8, 0.12, 0.5, rail);
    const cx = (w.minX + w.maxX) / 2;
    const span = w.maxX - w.minX + 10;
    const sp = 1 / (13 + i * 5);
    const ph = c.rnd();
    const an = { m: AMB.TRAVEL, ph, sp, am: span };
    for (let k = 0; k < 3; k++) {
      c.far.box(cx + k * 2.1 - 2.1, y, -10.5, 1.7, 0.9, 1, rgb(0x3a2c20), rgb(0x1e1812), an);
      c.far.box(cx + k * 2.1 - 2.1, y + 0.55, -10.5, 1.3, 0.35, 0.8, rgb(0x6a5030), rgb(0x6a5030), an);
    }
    c.ev.box(cx + 2.4, y + 0.2, -10.4, 0.2, 0.2, 0.1, rgb(0xffc060, 0.9), rgb(0xffc060, 0.9), an);
    c.events.push('mines-ore-cart');
    // Swinging lamps on the hole ceiling.
    const top = w.maxY - 0.2;
    const lx = w.minX + (w.maxX - w.minX) * (0.3 + 0.4 * c.rnd());
    c.far.tube([lx, top, -8], [lx, top - 1.5, -8], 0.03, 0.03, 4, rgb(0x2a2018));
    c.ev.disc(lx, top - 1.6, -7.9, 0.45, 10, rgb(0xffc060, 0.9), rgb(0xff8020, 0.4), { m: AMB.SWEEP, ph: c.rnd() * 6, sp: 1.15, am: 0.22, piv: [lx, top, -7.9] });
    c.events.push('mines-swing-lamp');
    // Drill spark bursts at a far face.
    c.pts.fill(c.rnd, 36, PT.SPARK, w.minX + (w.maxX - w.minX) * (0.2 + 0.6 * c.rnd()), w.minY + 2.5, -12, 0.4, 0.4, 3.2, 2.4, 0.07, rgb(0xffc060, 1), 0.6);
    c.events.push('mines-drill-sparks');
  }
  dustBox(c, 80, rgb(0xd8b080, 0.4), 0.08);
  for (let i = 0; i < 5; i++) dripLine(c, r.minX + 3 + c.rnd() * (r.maxX - r.minX - 6), r.maxY - 0.8, r.maxY - r.minY - 1.6, rgb(0x90b8c8, 0.55));
}

function biolabs(c: Ctx): void {
  const r = c.room;
  const w = c.win[0];
  const tanks = 4;
  const tw = (w.maxX - w.minX) / tanks;
  for (let i = 0; i < tanks; i++) {
    const x0 = w.minX + i * tw + 0.5;
    const x1 = w.minX + (i + 1) * tw - 0.5;
    const y0 = w.minY + 0.6;
    const y1 = w.maxY - 0.8;
    const g = rgb(i % 2 ? 0x30ffc0 : 0x40e0ff, 0.5);
    // Tank glow breathes, a far shadow drifts inside (bobbing in x only), bubbles rise through it.
    c.ev.gradXY(x0, y0, x1, y1, -11, rgb(0x103830, 0.8), g, { m: AMB.PULSE, ph: i * 1.3, sp: 0.8 });
    const sx = (x0 + x1) / 2;
    c.far.blob(sx, y0 + (y1 - y0) * 0.45, -9.5, 0.55, 1.1, 0.5, 5, 8, rgb(0x04100e), rgb(0x061816), { m: AMB.BOBX, ph: c.rnd() * 6, sp: 0.35 + c.rnd() * 0.2, am: (x1 - x0) * 0.28 });
    c.pts.fill(c.rnd, 30, PT.BUBBLE, sx, (y0 + y1) / 2, -9.8, x1 - x0 - 0.8, y1 - y0, 0, 0.9, 0.12, rgb(0xa8fff0, 0.8), 0.6);
  }
  c.events.push('biolabs-tank-shadow', 'biolabs-bubbles');
  // Flickering lab light strips under the ceiling.
  for (let i = 0; i < 5; i++) {
    const x = r.minX + 3 + i * ((r.maxX - r.minX - 6) / 4);
    c.ev.box(x, r.maxY - 0.5, -3.0, 2.2, 0.12, 0.05, rgb(0xd0fff0, 0.9), rgb(0xd0fff0, 0.9), { m: AMB.FLICKER, ph: c.rnd() * 20, sp: 1.5 + c.rnd() * 2 });
  }
  c.events.push('biolabs-light-strip');
  dustBox(c, 70, rgb(0x90ffd8, 0.4));
  steamVent(c, r.minX + 4, r.minY + 0.3, 3, rgb(0xb8ffe8, 0.3));
  dripLine(c, r.maxX - 6, r.maxY - 1, 8, rgb(0x70ffc8, 0.5));
}

function security(c: Ctx): void {
  const r = c.room;
  const w = c.win[0];
  // Patrol drone silhouettes with red eyes crossing beyond the grille.
  for (let i = 0; i < 2; i++) {
    const y = w.minY + 1.6 + i * 1.8;
    const z = -12 - i * 4;
    const span = w.maxX - w.minX + 12;
    const an = { m: AMB.TRAVEL, ph: c.rnd(), sp: 1 / (15 + i * 7) * (i ? -1 : 1), am: span };
    const cx = (w.minX + w.maxX) / 2;
    c.far.box(cx, y, z, 2.0, 0.5, 1.2, rgb(0x0c0e18), rgb(0x161a2a), an);
    c.far.box(cx, y + 0.35, z, 0.7, 0.3, 0.8, rgb(0x0c0e18), rgb(0x0c0e18), an);
    c.ev.box(cx + 0.8, y, z + 0.7, 0.18, 0.12, 0.05, rgb(0xff2a20, 1), rgb(0xff2a20, 1), an);
    c.ev.beam(cx, y - 0.2, z + 0.6, -Math.PI / 2, 5, 0.7, rgb(0xff4030, 0.25), an);
    c.events.push('security-patrol-drone');
  }
  // Storm: lightning sheet far behind the grille (never drawn under Reduce).
  c.ev.gradXY(w.minX - 4, w.minY - 1, w.maxX + 4, w.maxY + 2, -23, rgb(0x384c80, 0.25), rgb(0xb8d0ff, 0.85), { m: AMB.LIGHTNING, ph: c.rnd() * 9, sp: 0.2 });
  c.events.push('security-lightning');
  // Rotating searchlights on far towers.
  for (let i = 0; i < 2; i++) {
    const x = w.minX + (w.maxX - w.minX) * (0.25 + 0.5 * i);
    c.far.box(x, w.minY - 0.5, -15, 0.5, 2.4, 0.5, rgb(0x0c0e18));
    c.ev.beam(x, w.minY + 0.8, -14.9, Math.PI / 2, 9, 1.2, rgb(0xd8e8ff, 0.4), { m: AMB.SWEEP, ph: i * 2.4, sp: 0.7 + i * 0.25, am: 0.8, piv: [x, w.minY + 0.8, -14.9] });
  }
  c.events.push('security-searchlight');
  // Rain past the grille.
  c.pts.fill(c.rnd, 160, PT.RAIN, (w.minX + w.maxX) / 2, (w.minY + w.maxY) / 2, -8, w.maxX - w.minX + 6, w.maxY - w.minY + 3, -0.9, -11, 0.06, rgb(0x90b0e0, 0.7), 6);
  dustBox(c, 36, rgb(0xa8b8e0, 0.35));
  steamVent(c, r.minX + 6, r.minY + 0.3, 3, rgb(0xb0c0e8, 0.3), 14);
}

function core(c: Ctx): void {
  const r = c.room;
  const w = c.win[0];
  const cx = (w.minX + w.maxX) / 2;
  const cy = (w.minY + w.maxY) / 2;
  const z = -14;
  // Reactor: three tilted rings turning about the vertical axis, a pulsing heart behind them.
  c.ev.disc(cx, cy, z - 2, 3.6, 20, rgb(0xff9040, 0.9), rgb(0x801a08, 0.2), { m: AMB.PULSE, ph: 0, sp: 1.6 });
  for (let k = 0; k < 3; k++) {
    const R = 2.6 + k * 1.5;
    const sides = 24;
    const piv: V3 = [cx, cy, z];
    const an = { m: AMB.SPIN_Y, ph: k * 1.1, sp: 0.55 - k * 0.12, piv };
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      c.far.tube([cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, z], [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R, z], 0.16, 0.16, 4, rgb(0x2a1410), rgb(0x2a1410), an);
      if (i % 4 === 0) c.ev.box(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R, z + 0.2, 0.3, 0.3, 0.1, rgb(0xffa050, 0.9), rgb(0xffa050, 0.9), { ...an, m: AMB.SPIN_Y });
    }
  }
  c.events.push('core-reactor-rings');
  // Heat shimmer bands drifting up behind the glass.
  for (let i = 0; i < 4; i++) {
    const y = w.minY + 1 + i * ((w.maxY - w.minY - 2) / 3);
    c.ev.gradXY(w.minX, y - 0.25, w.maxX, y + 0.25, -9, BLACK, rgb(0xff6a2a, 0.35), { m: AMB.BOBY, ph: i * 1.9, sp: 0.5, am: 0.5 });
  }
  c.events.push('core-heat-shimmer');
  // Coolant venting along the floor.
  steamVent(c, r.minX + 5, r.minY + 0.3, 5, rgb(0xa0e0ff, 0.5), 30);
  steamVent(c, r.maxX - 5, r.minY + 0.3, 5, rgb(0xa0e0ff, 0.5), 30);
  c.events.push('core-coolant-vent');
  dustBox(c, 90, rgb(0xffb070, 0.5), 0.08);
}

const BUILDERS: Record<SectorId3D, (c: Ctx) => void> = { airlock, shaft, mines, biolabs, security, core };

/** Pure, deterministic ambient layout for one room. */
export function layoutAmbient(room: RoomDef3D): AmbientData {
  const c: Ctx = {
    room,
    win: vistaWindows(room),
    far: new Geo(),
    ev: new Geo(),
    pts: new Pts(),
    rnd: mulberry32(hashString(room.id + ':ambient')),
    events: [],
  };
  if (c.win.length === 0) c.win.push({ id: room.id + ':w0', style: 'observation', minX: room.minX + 2, maxX: room.maxX - 2, minY: room.minY + 2, maxY: room.maxY - 2 });
  BUILDERS[room.sector](c);
  return {
    roomId: room.id,
    sector: room.sector,
    far: c.far.data(),
    ev: c.ev.data(),
    pts: c.pts.data(),
    events: c.events,
    clip: [room.minX - VISTA_CLIP_MARGIN_X, room.maxX + VISTA_CLIP_MARGIN_X, room.minY - VISTA_CLIP_MARGIN_Y, room.maxY + VISTA_CLIP_MARGIN_Y],
  };
}

export function layoutAllAmbient(level: Level3D): AmbientData[] {
  return level.rooms.map(layoutAmbient);
}

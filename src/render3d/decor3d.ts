// Per-sector terrain set dressing: back walls, structure, props and atmosphere.
// Render-only. No collision, no PointLights. Repeated props are instanced to keep draw calls low.
// Layout generation is pure data (seeded, deterministic) so it can be tested without a DOM.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapSolid3D } from '../game3d/map3d.ts';
import type { Level3D, RoomDef3D, SectorId3D } from '../game3d/types3d.ts';
import { mulberry32, type FacilityTextures3D } from './textures3d.ts';
import { flickerLevel, isLampProp, lampMode, lampSeed, reactorPulse, type LampMode } from './mood3d.ts';

export { mulberry32 };

export type DecorKind = 'box' | 'cyl' | 'cone' | 'glow' | 'glowCyl' | 'pulse' | 'halo' | 'monitor' | 'fg';

export interface DecorProp {
  kind: DecorKind;
  /** Center position. */
  x: number;
  y: number;
  z: number;
  /** Box size; for cyl/cone sx is the diameter and sy the length. */
  sx: number;
  sy: number;
  sz: number;
  color: number;
  /** 'x' lays a cylinder along the x axis, 'flip' points a cone downward. */
  rot?: 'x' | 'flip';
  /** Z-axis rotation in radians for boxes (diagonal braces). */
  rz?: number;
}

export interface DecorCable {
  x0: number;
  x1: number;
  y: number;
  z: number;
  sag: number;
}

export interface DecorLayout {
  roomId: string;
  sector: SectorId3D;
  props: DecorProp[];
  cables: DecorCable[];
}

/** Props must sit behind (z <= LANE_BACK_Z) or in front of (z >= LANE_FRONT_Z) the z=0 lane. */
export const LANE_BACK_Z = -1.0;
export const LANE_FRONT_Z = 1.2;
export const BACK_WALL_Z = -3.15;
export const MAX_PROPS_PER_ROOM = 260;

const ACCENT: Record<SectorId3D, number> = {
  airlock: 0x2bb8c8,
  shaft: 0xc98a2a,
  mines: 0xb88428,
  biolabs: 0x3cc890,
  security: 0xc03838,
  core: 0xd05a22,
};

/** Back-panel colors per sector: [panel A, panel B, frame]. */
const PANEL_COLORS: Record<SectorId3D, [number, number, number]> = {
  airlock: [0x34465a, 0x2a3a4c, 0x46586a],
  shaft: [0x4a4038, 0x3a322c, 0x5e5246],
  mines: [0x3a3128, 0x2e271f, 0x6a4a2a],
  biolabs: [0x3c5a54, 0x2e4844, 0x5a7a72],
  security: [0x2c3442, 0x232a36, 0x6a2a2e],
  core: [0x4a2a24, 0x382018, 0x7a3a22],
};

export const SECTOR_FOG: Record<SectorId3D, number> = {
  airlock: 0.011,
  shaft: 0.013,
  mines: 0.016,
  biolabs: 0.015,
  security: 0.012,
  core: 0.014,
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Axis-aligned bounds of a prop after rotation. */
export function propBounds(p: DecorProp): { minX: number; maxX: number; minY: number; maxY: number } {
  let hx = p.sx / 2;
  let hy = p.sy / 2;
  if (p.kind === 'cyl' || p.kind === 'glowCyl') {
    if (p.rot === 'x') {
      hx = p.sy / 2;
      hy = p.sx / 2;
    }
  }
  if (p.rz) {
    const c = Math.abs(Math.cos(p.rz));
    const sn = Math.abs(Math.sin(p.rz));
    const nx = hx * c + hy * sn;
    const ny = hx * sn + hy * c;
    hx = nx;
    hy = ny;
  }
  return { minX: p.x - hx, maxX: p.x + hx, minY: p.y - hy, maxY: p.y + hy };
}

class LayoutBuilder {
  readonly props: DecorProp[] = [];
  readonly cables: DecorCable[] = [];
  private readonly room: RoomDef3D;
  constructor(room: RoomDef3D) {
    this.room = room;
  }

  /** Adds a prop whose base sits at yBase. Props that would leave the room rect are dropped. */
  add(kind: DecorKind, x: number, yBase: number, z: number, sx: number, sy: number, sz: number, color: number, rot?: 'x' | 'flip', rz?: number): void {
    if (this.props.length >= MAX_PROPS_PER_ROOM) return;
    const p: DecorProp = { kind, x, y: yBase + sy / 2, z, sx, sy, sz, color, rot, rz };
    const b = propBounds(p);
    const r = this.room;
    if (b.minX < r.minX + 0.05 || b.maxX > r.maxX - 0.05 || b.minY < r.minY - 0.001 || b.maxY > r.maxY + 0.001) return;
    this.props.push(p);
  }
}

/** Pure, deterministic layout of one room's set dressing. */
export function layoutRoomDecor(room: RoomDef3D): DecorLayout {
  const L = new LayoutBuilder(room);
  const rnd = mulberry32(hashString(room.id));
  const w = room.maxX - room.minX;
  const h = room.maxY - room.minY;
  const cx = (room.minX + room.maxX) / 2;
  const accent = ACCENT[room.sector];
  const steel = 0x3a4452;
  const darkSteel = 0x232a34;

  // Structure: ribs, wainscot, ceiling truss, floor trim, fixtures, pipes.
  for (let x = room.minX + 2; x < room.maxX - 1; x += 4) {
    L.add('box', x, room.minY, -2.95, 0.35, h, 0.3, steel);
  }
  L.add('box', cx, room.minY, -2.9, w - 0.2, 1.2, 0.25, darkSteel);
  L.add('box', cx, room.maxY - 0.4, -2.6, w - 0.2, 0.4, 0.5, darkSteel);
  L.add('glow', cx, room.minY + 1.2, -2.78, w - 0.4, 0.06, 0.05, accent);
  const fixtureStep = room.sector === 'mines' ? 8 : 6;
  for (let x = room.minX + 3; x < room.maxX - 1; x += fixtureStep) {
    L.add('glow', x, room.maxY - 0.62, -2.4, 1.2, 0.1, 0.3, 0xb8d0d8);
    L.add('halo', x, room.maxY - 2.2, -2.3, 3.2, 3.2, 0.01, 0x486a78);
  }
  const pipeY = room.maxY - 1.3;
  L.add('cyl', cx, pipeY - 0.15, -2.7, 0.3, w - 0.6, 0.3, 0x56626f, 'x');
  for (let x = room.minX + 4; x < room.maxX - 2; x += 8) {
    L.add('cyl', x, pipeY - 0.25, -2.7, 0.44, 0.22, 0.44, 0x2c343e, 'x');
    L.add('cyl', x + 1.6, pipeY - 1.4, -2.72, 0.2, 1.4, 0.2, 0x56626f);
  }
  const cableCount = Math.min(4, Math.max(2, Math.floor(w / 8)));
  for (let i = 0; i < cableCount; i++) {
    const x0 = room.minX + 1 + rnd() * (w * 0.4);
    const x1 = Math.min(room.maxX - 1, x0 + 5 + rnd() * 7);
    L.cables.push({ x0, x1, y: room.maxY - 0.9 - rnd() * 0.5, z: -2.55 - rnd() * 0.3, sag: 0.5 + rnd() * 0.6 });
  }

  // Depth layers. Back: recessed wall panels. Mid: braced gantry frames. Front: dark ceiling silhouettes (never in the lane).
  const panelCol = PANEL_COLORS[room.sector];
  const panelH = Math.min(h * 0.45, 4.2);
  let pi = 0;
  for (let x = room.minX + 2; x < room.maxX - 3.5; x += 3.7) {
    const alt = pi++ % 2 === 0;
    L.add('box', x + 1.6, room.minY + 1.4 + (alt ? 0 : 0.5), -3.04, 3.2, panelH, 0.1, alt ? panelCol[0] : panelCol[1]);
    L.add('box', x + 1.6, room.minY + 1.4 + (alt ? 0 : 0.5) + panelH, -3.0, 3.3, 0.08, 0.18, panelCol[2]);
  }
  if (room.sector !== 'mines') {
    const gh = Math.min(h - 3, 6);
    for (let x = room.minX + 5; x < room.maxX - 5; x += 11) {
      const braceCol = panelCol[2];
      L.add('box', x, room.minY, -1.8, 0.22, gh, 0.22, braceCol);
      L.add('box', x + 3, room.minY, -1.8, 0.22, gh, 0.22, braceCol);
      L.add('box', x + 1.5, room.minY + gh - 0.11, -1.8, 3.3, 0.22, 0.22, braceCol);
      const len = Math.hypot(2.9, gh - 0.5);
      const ang = Math.atan2(gh - 0.5, 2.9);
      L.add('box', x + 1.5, room.minY + gh / 2 - 0.05, -1.85, len, 0.1, 0.1, braceCol, undefined, ang);
      L.add('box', x + 1.5, room.minY + gh / 2 - 0.05, -1.85, len, 0.1, 0.1, braceCol, undefined, -ang);
    }
  } else {
    for (let x = room.minX + 4; x < room.maxX - 3; x += 6.5) {
      L.add('cone', x + rnd() * 1.5, room.minY, -1.9, 1.0 + rnd() * 0.8, 1.2 + rnd() * 1.6, 1.0, 0x3a342d);
    }
  }
  for (let x = room.minX + 3; x < room.maxX - 2.5; x += 9) {
    L.add('fg', x, room.maxY - 0.5, 2.5, 0.4, 0.5, 0.4, 0x090b0e);
    L.add('fg', x + 4.5, room.maxY - 0.7, 2.5, 0.12, 0.7, 0.12, 0x090b0e);
  }
  L.add('fg', cx, room.maxY - 0.36, 2.5, w - 0.6, 0.2, 0.3, 0x0a0c10);

  switch (room.sector) {
    case 'airlock': {
      for (let x = room.minX + 3.5; x < room.maxX - 2.5; x += 3.6) {
        L.add('box', x, room.minY, -2.3, 1.5, 0.35, 1.0, darkSteel);
        L.add('box', x, room.minY + 0.35, -2.3, 1.2, 2.3, 0.9, 0x2f3b48);
        L.add('glowCyl', x, room.minY + 0.5, -1.9, 0.8, 2.0, 0.8, 0x2a9ab0);
        L.add('glow', x, room.minY + 2.8, -1.85, 0.5, 0.06, 0.1, 0x7ae8ff);
      }
      for (let x = room.minX + 2; x < room.maxX - 2; x += 7) {
        L.add('box', x, room.minY, -1.5, 0.9, 1.1, 0.5, 0x2a3440);
        L.add('glow', x, room.minY + 0.8, -1.22, 0.6, 0.25, 0.05, 0x33d0e8);
      }
      L.add('halo', room.minX + 8, room.minY + 5.5, -2.0, 2.4, 8, 0.01, 0x4a7a90);
      L.add('halo', room.minX + 16, room.minY + 5.5, -2.0, 2.4, 8, 0.01, 0x4a7a90);
      break;
    }
    case 'shaft': {
      const railX = [room.minX + 1.4, room.minX + 2.0, room.maxX - 2.0, room.maxX - 1.4];
      for (const rx of railX) L.add('cyl', rx, room.minY, -2.4, 0.16, h, 0.16, 0x5a6672);
      for (let y = room.minY + 3; y < room.maxY - 2; y += 4.5) {
        L.add('box', room.minX + 1.7, y, -2.1, 1.1, 0.14, 0.5, darkSteel);
        L.add('box', room.maxX - 1.7, y, -2.1, 1.1, 0.14, 0.5, darkSteel);
        L.add('glow', cx - 3 + rnd() * 6, y + 1.2, -2.5, 0.7, 0.7, 0.15, 0xb88a30);
        L.add('halo', cx - 3 + rnd() * 6, y + 1.2, -2.3, 2.6, 2.6, 0.01, 0x7a5a20);
      }
      L.add('box', room.minX + 1.7, room.minY + h * 0.35, -2.0, 0.9, 2.2, 0.8, 0x3a3f46);
      for (let i = 0; i < 8; i++) {
        const x = room.minX + 3 + rnd() * (w - 6);
        const len = 2 + rnd() * 3;
        L.add('cyl', x, room.maxY - 0.8 - len, -2.55, 0.06, len, 0.06, 0x4a4f56);
      }
      L.add('halo', cx, room.minY + h * 0.5, -2.0, 3.0, 20, 0.01, 0x3a5468);
      break;
    }
    case 'mines': {
      for (let x = room.minX + 2.5; x < room.maxX - 1; x += 3.2) {
        const len = 0.8 + rnd() * 1.6;
        L.add('cone', x + rnd(), room.maxY - len, -2.5 + rnd() * 0.6, 0.55 + rnd() * 0.4, len, 0.55, 0x4a4036, 'flip');
      }
      for (let x = room.minX + 5; x < room.maxX - 4; x += 8) {
        L.add('box', x, room.minY, -2.0, 0.28, h - 0.3, 0.28, 0x6a4a2a);
        L.add('box', x + 4, room.maxY - 0.7, -2.0, 8.4, 0.26, 0.28, 0x6a4a2a);
        L.add('box', x + 4, room.minY, -2.3, 1.7, 0.7, 0.9, 0x5a4a3a);
        L.add('cyl', x + 3.5, room.minY - 0.0, -2.0, 0.4, 0.1, 0.4, 0x2a2622, 'x');
      }
      for (let i = 0; i < 7; i++) {
        const x = room.minX + 2 + rnd() * (w - 4);
        L.add('cone', x, room.minY, -2.7, 0.3 + rnd() * 0.2, 0.6 + rnd() * 0.9, 0.3, 0x2fa890);
      }
      break;
    }
    case 'biolabs': {
      for (let x = room.minX + 3; x < room.maxX - 2; x += 5) {
        L.add('cyl', x, room.minY, -2.3, 1.5, 0.3, 1.5, 0x2a3138);
        L.add('glowCyl', x, room.minY + 0.3, -2.3, 1.3, 2.8, 1.3, 0x2fb078);
        L.add('cyl', x, room.minY + 3.1, -2.3, 1.5, 0.3, 1.5, 0x2a3138);
        L.add('halo', x, room.minY + 1.7, -2.0, 2.6, 3.6, 0.01, 0x1f6a4a);
      }
      for (let x = room.minX + 5.5; x < room.maxX - 3; x += 10) {
        L.add('box', x, room.minY, -1.6, 2.4, 0.9, 0.7, 0x3a4a48);
        L.add('glow', x + 0.4, room.minY + 0.95, -1.5, 0.5, 0.05, 0.3, 0x58e0a8);
      }
      for (let x = room.minX + 4; x < room.maxX - 3; x += 7) {
        L.add('box', x, room.maxY - 2.6, -2.2, 1.6, 0.1, 0.6, 0x4a5a58);
        for (let k = 0; k < 3; k++) L.add('cyl', x - 0.5 + k * 0.5, room.maxY - 3.0, -2.2, 0.2, 0.4, 0.2, 0x58c8a0);
      }
      L.add('halo', room.minX + 6, room.maxY - 1.8, -2.2, 3.0, 2.6, 0.01, 0x7a9a90);
      break;
    }
    case 'security': {
      for (let x = room.minX + 3; x < room.maxX - 6; x += 9) {
        L.add('monitor', x + 1.5, room.minY + 1.4, -3.0, 3.0, 2.0, 0.05, 0xb0c8d8);
      }
      for (let x = room.minX + 2.5; x < room.maxX - 2; x += 5) {
        L.add('box', x, room.minY, -2.4, 0.9, 2.2, 0.8, 0x232a34);
        L.add('glow', x, room.minY + 0.5, -1.98, 0.5, 0.05, 0.04, 0x40e070);
        L.add('glow', x, room.minY + 1.2, -1.98, 0.5, 0.05, 0.04, 0x4090e0);
      }
      L.add('box', cx, room.minY + 1.0, -1.4, w - 3, 0.08, 0.1, 0x56626f);
      for (let x = room.minX + 2; x < room.maxX - 1; x += 3) L.add('box', x, room.minY, -1.4, 0.08, 1.0, 0.08, 0x56626f);
      for (let i = 0; i < 4; i++) {
        const y = room.minY + 1.4 + i * 0.7;
        L.add('glow', cx, y, -2.0, w * 0.5, 0.025, 0.03, 0x802828);
      }
      break;
    }
    case 'core': {
      for (let x = room.minX + 4; x < room.maxX - 2; x += 7) {
        L.add('cyl', x, room.minY, -2.5, 1.1, h, 1.1, 0x333c46);
        for (let y = room.minY + 1.5; y < room.maxY - 1; y += 2.6) L.add('pulse', x, y, -2.5, 1.4, 0.14, 1.4, 0xc05020);
      }
      for (let x = room.minX + 8; x < room.maxX - 6; x += 14) {
        L.add('cyl', x, room.minY, -2.95, 4.0, h * 0.8, 4.0, 0x242a32);
        L.add('cyl', x, room.minY + h * 0.8, -2.95, 4.4, 0.3, 4.4, 0x3a424c);
      }
      for (let x = room.minX + 3; x < room.maxX - 2; x += 6) L.add('glow', x, room.maxY - 1.0, -2.2, 2.0, 0.14, 0.2, 0xc86a20);
      for (let i = 0; i < 6; i++) {
        L.add('box', room.minX + 3 + rnd() * (w - 6), room.minY, -1.8 - rnd(), 1.4 + rnd() * 2, 0.02, 1.0, 0x0e0c0c);
      }
      L.add('halo', cx, room.minY + 2, -2.0, 7, 4, 0.01, 0x7a3418);
      break;
    }
  }
  return { roomId: room.id, sector: room.sector, props: L.props, cables: L.cables };
}

export function layoutAllDecor(level: Level3D): DecorLayout[] {
  return level.rooms.map(layoutRoomDecor);
}

// ----------------------------------------------------------------------------
// Rendering (needs DOM canvas for a few procedural textures).
// ----------------------------------------------------------------------------

export interface Decor3D {
  update(tSec: number, playerX: number, playerY: number, reduce?: boolean): void;
  /** Hides per-room meshes (back walls, dust, bubbles) whose rect lies outside the view window. */
  setView(minX: number, maxX: number, minY: number, maxY: number): void;
  dispose(): void;
}

function roomTexture(tex: FacilityTextures3D, sector: SectorId3D): { map: THREE.CanvasTexture; bump?: THREE.CanvasTexture; color: number } {
  switch (sector) {
    case 'airlock': return { map: tex.concreteMap, color: 0x8a9aaa };
    case 'shaft': return { map: tex.rustMetalMap, color: 0x9a9088 };
    case 'mines': return { map: tex.rockMap, bump: tex.rockBump, color: 0x9a9088 };
    case 'biolabs': return { map: tex.cleanTileMap, color: 0x8ea8a0 };
    case 'security': return { map: tex.panelMap, color: 0x8a96a8 };
    case 'core': return { map: tex.concreteMap, color: 0x9a8a84 };
  }
}

function makeHaloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function seededPoints(count: number, room: RoomDef3D, seed: number, color: number, size: number, zMin: number, zMax: number): THREE.Points {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = room.minX + 0.5 + rnd() * (room.maxX - room.minX - 1);
    pos[i * 3 + 1] = room.minY + 0.3 + rnd() * (room.maxY - room.minY - 0.6);
    pos[i * 3 + 2] = zMin + rnd() * (zMax - zMin);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export function buildDecor3D(scene: THREE.Scene, level: Level3D, tex: FacilityTextures3D): Decor3D {
  const group = new THREE.Group();
  group.name = 'decor3d';
  scene.add(group);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };
  const layouts = layoutAllDecor(level);
  const roomObjs: { room: RoomDef3D; objs: THREE.Object3D[] }[] = [];

  // 1. Back walls with a lower AO gradient and a multiply macro-variation overlay.
  for (const room of level.rooms) {
    const w = room.maxX - room.minX;
    const h = room.maxY - room.minY;
    const rt = roomTexture(tex, room.sector);
    const segX = room.sector === 'mines' ? Math.max(2, Math.round(w / 1.2)) : 1;
    const segY = room.sector === 'mines' ? Math.max(2, Math.round(h / 1.2)) : 6;
    const geo = track(new THREE.PlaneGeometry(w, h, segX, segY));
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const rnd = mulberry32(hashString(room.id + 'wall'));
    for (let i = 0; i < pos.count; i++) {
      const v = (pos.getY(i) + h / 2) / h;
      const ao = 0.4 + 0.6 * Math.min(1, v * 2.2);
      colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = ao;
      if (room.sector === 'mines' && i % (segX + 1) !== 0 && i % (segX + 1) !== segX) {
        pos.setZ(i, rnd() * 0.45);
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (room.sector === 'mines') geo.computeVertexNormals();
    const map = track(rt.map.clone());
    map.repeat.set(Math.max(1, w / 4), Math.max(1, h / 4));
    map.needsUpdate = true;
    const mat = track(new THREE.MeshStandardMaterial({ map, color: rt.color, vertexColors: true, roughness: 0.8, metalness: 0.25 }));
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set((room.minX + room.maxX) / 2, (room.minY + room.maxY) / 2, BACK_WALL_Z);
    wall.receiveShadow = true;
    wall.name = `decor-backwall:${room.sector}`;
    group.add(wall);

    const macro = track(tex.macroMap.clone());
    macro.repeat.set(Math.max(1, w / 18), Math.max(1, h / 12));
    macro.needsUpdate = true;
    const overlay = new THREE.Mesh(
      track(new THREE.PlaneGeometry(w, h)),
      track(new THREE.MeshBasicMaterial({ map: macro, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, opacity: 0.7, premultipliedAlpha: true })),
    );
    overlay.position.set(wall.position.x, wall.position.y, BACK_WALL_Z + 0.02);
    overlay.name = `decor-backwall-overlay:${room.sector}`;
    group.add(overlay);
    roomObjs.push({ room, objs: [wall, overlay] });
  }

  // 2. Instanced props.
  const all = layouts.flatMap((l) => l.props);
  const pick = (kinds: DecorKind[]) => all.filter((p) => kinds.includes(p.kind));
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const makeInstanced = (
    props: DecorProp[],
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    shadow: boolean,
    scaleFor: (p: DecorProp) => [number, number, number],
  ): THREE.InstancedMesh | null => {
    if (props.length === 0) return null;
    const im = new THREE.InstancedMesh(track(geo), track(mat), props.length);
    im.name = `decor:${[...new Set(props.map((q) => q.kind))].join('+')}`;
    im.userData.propKinds = [...new Set(props.map((q) => q.kind))];
    props.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rot === 'flip' ? Math.PI : 0, 0, p.rot === 'x' ? Math.PI / 2 : (p.rz ?? 0));
      const s = scaleFor(p);
      dummy.scale.set(s[0], s[1], s[2]);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, col.setHex(p.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = true;
    group.add(im);
    return im;
  };
  const boxScale = (p: DecorProp): [number, number, number] => [p.sx, p.sy, p.sz];
  const cylScale = (p: DecorProp): [number, number, number] => [p.sx, p.sy, p.sx];
  const litMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.5 });
  const glowMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff });

  makeInstanced(pick(['box']), new THREE.BoxGeometry(1, 1, 1), litMat(), false, boxScale);
  // Foreground silhouettes: dark, slightly translucent, only near the ceiling so the character lane stays clear.
  makeInstanced(
    pick(['fg']),
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.1, transparent: true, opacity: 0.88, depthWrite: false }),
    false,
    boxScale,
  );
  makeInstanced(pick(['cyl']).filter((p) => p.sx >= 1.0), new THREE.CylinderGeometry(0.5, 0.5, 1, 14), litMat(), true, cylScale);
  makeInstanced(pick(['cyl']).filter((p) => p.sx < 1.0), new THREE.CylinderGeometry(0.5, 0.5, 1, 10), litMat(), false, cylScale);
  makeInstanced(pick(['cone']), new THREE.ConeGeometry(0.5, 1, 7), litMat(), false, cylScale);
  // Glow fixtures: beveled bezel, vented dark housing, slatted emissive lamp face and a soft additive sprite (no lights).
  const glowProps = pick(['glow']);
  const bezel = makeInstanced(
    glowProps,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.7 }),
    false,
    (p) => [p.sx + 0.3, p.sy + 0.3, 0.05],
  );
  if (bezel) {
    bezel.name = 'decor:glow-bezel';
    for (let i = 0; i < glowProps.length; i++) {
      bezel.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.z = glowProps[i].z - glowProps[i].sz * 0.5 + 0.02;
      dummy.updateMatrix();
      bezel.setMatrixAt(i, dummy.matrix);
      bezel.setColorAt(i, col.setHex(0x5c6878));
    }
    bezel.instanceMatrix.needsUpdate = true;
    if (bezel.instanceColor) bezel.instanceColor.needsUpdate = true;
  }
  const housing = makeInstanced(
    glowProps,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ map: tex.grilleMap, color: 0xffffff, roughness: 0.55, metalness: 0.6 }),
    false,
    (p) => [p.sx + 0.16, p.sy + 0.16, p.sz + 0.1],
  );
  if (housing) {
    housing.name = 'decor:glow-housing';
    for (let i = 0; i < glowProps.length; i++) housing.setColorAt(i, col.setHex(0xb4c0cc));
    if (housing.instanceColor) housing.instanceColor.needsUpdate = true;
  }
  const core = makeInstanced(
    glowProps,
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ map: tex.lampMap, color: 0xffffff }),
    false,
    (p) => [p.sx, p.sy, p.sz * 0.6 + 0.02],
  );
  if (core) {
    core.name = 'decor:glow';
    for (let i = 0; i < glowProps.length; i++) {
      core.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.z += glowProps[i].sz * 0.2 + 0.08;
      dummy.updateMatrix();
      core.setMatrixAt(i, dummy.matrix);
      core.setColorAt(i, col.setHex(glowProps[i].color).multiplyScalar(0.9));
    }
    core.instanceMatrix.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
  }
  // Broken lamps: the emissive face flickers on a deterministic pattern (the light shafts use the same seed).
  const sectorOfProp = new Map<DecorProp, SectorId3D>();
  for (const l of layouts) for (const p of l.props) sectorOfProp.set(p, l.sector);
  const flickerLamps: { i: number; mode: LampMode; seed: number; r: number; g: number; b: number }[] = [];
  glowProps.forEach((p, i) => {
    if (!isLampProp(p)) return;
    const seed = lampSeed(p.x, p.y);
    const mode = lampMode(sectorOfProp.get(p) ?? 'airlock', seed);
    if (mode === 'steady') return;
    col.setHex(p.color).multiplyScalar(0.9);
    flickerLamps.push({ i, mode, seed, r: col.r, g: col.g, b: col.b });
  });
  const spriteTex = track(makeHaloTexture());
  const spriteProps = glowProps.filter((p) => Math.max(p.sx, p.sy) <= 3.5);
  const sprites = makeInstanced(
    spriteProps,
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: spriteTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.22 }),
    false,
    (p) => [Math.max(p.sx, p.sy) * 2.4 + 0.4, Math.max(p.sx, p.sy) * 2.4 + 0.4, 1],
  );
  if (sprites) {
    sprites.name = 'decor:glow-sprite';
    sprites.receiveShadow = false;
    for (let i = 0; i < spriteProps.length; i++) {
      sprites.getMatrixAt(i, dummy.matrix);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.position.z = spriteProps[i].z + 0.25;
      dummy.updateMatrix();
      sprites.setMatrixAt(i, dummy.matrix);
    }
    sprites.instanceMatrix.needsUpdate = true;
  }
  const tankGlow = makeInstanced(pick(['glowCyl']), new THREE.CylinderGeometry(0.5, 0.5, 1, 14), glowMat(), false, cylScale);
  if (tankGlow) {
    const tm = tankGlow.material as THREE.MeshBasicMaterial;
    tm.transparent = true;
    tm.opacity = 0.6;
  }
  const pulseMat = glowMat();
  makeInstanced(pick(['pulse']), new THREE.CylinderGeometry(0.5, 0.5, 1, 16), pulseMat, false, cylScale);

  const haloTex = track(makeHaloTexture());
  const haloMat = new THREE.MeshBasicMaterial({
    map: haloTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  });
  makeInstanced(pick(['halo']), new THREE.PlaneGeometry(1, 1), haloMat, false, boxScale);

  // Monitor wall: one shared canvas texture updated at 4 Hz.
  const monCanvas = document.createElement('canvas');
  monCanvas.width = 128;
  monCanvas.height = 64;
  const monCtx = monCanvas.getContext('2d')!;
  const monTex = track(new THREE.CanvasTexture(monCanvas));
  monTex.colorSpace = THREE.SRGBColorSpace;
  let monFrame = -1;
  const drawMonitor = (frame: number): void => {
    const r = mulberry32(frame * 7919 + 13);
    monCtx.fillStyle = '#06100f';
    monCtx.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 12; i++) {
      monCtx.fillStyle = r() < 0.15 ? '#a83030' : '#2a9a6a';
      monCtx.fillRect(6 + i * 10, 60 - r() * 44, 7, 60);
    }
    monCtx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 64; y += 3) monCtx.fillRect(0, y, 128, 1);
    monTex.needsUpdate = true;
  };
  drawMonitor(0);
  const monitors = pick(['monitor']);
  if (monitors.length > 0) {
    const im = new THREE.InstancedMesh(
      track(new THREE.PlaneGeometry(1, 1)),
      track(new THREE.MeshBasicMaterial({ map: monTex, color: 0xb0b0b0 })),
      monitors.length,
    );
    monitors.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z + 0.1);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(p.sx, p.sy, 1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    group.add(im);
  }

  // 3. Cable bundles with sag (merged into one mesh).
  const cableGeos: THREE.BufferGeometry[] = [];
  for (const l of layouts) {
    for (const c of l.cables) {
      const mid = (c.x0 + c.x1) / 2;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(c.x0, c.y, c.z),
        new THREE.Vector3((c.x0 + mid) / 2, c.y - c.sag * 0.75, c.z),
        new THREE.Vector3(mid, c.y - c.sag, c.z),
        new THREE.Vector3((mid + c.x1) / 2, c.y - c.sag * 0.75, c.z),
        new THREE.Vector3(c.x1, c.y, c.z),
      ]);
      cableGeos.push(new THREE.TubeGeometry(curve, 12, 0.05, 5, false));
    }
  }
  if (cableGeos.length > 0) {
    const merged = mergeGeometries(cableGeos);
    cableGeos.forEach((g) => g.dispose());
    if (merged) {
      const cableMesh = new THREE.Mesh(track(merged), track(new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.7, metalness: 0.2 })));
      cableMesh.name = 'decor-cables';
      group.add(cableMesh);
    }
  }

  // 4. Acid pool rims and bubbles.
  const rimMat = track(new THREE.MeshStandardMaterial({ color: 0x6a5a22, roughness: 0.6, metalness: 0.5 }));
  const rimGeo = track(new THREE.BoxGeometry(1, 0.1, 0.12));
  const rim = new THREE.InstancedMesh(rimGeo, rimMat, Math.max(1, level.acidPools.length * 2));
  rim.count = level.acidPools.length * 2;
  level.acidPools.forEach((pool, i) => {
    for (let k = 0; k < 2; k++) {
      dummy.position.set((pool.minX + pool.maxX) / 2, pool.surfaceY + 0.05, k === 0 ? pool.maxZ - 0.06 : pool.minZ + 0.06);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(pool.maxX - pool.minX, 1, 1);
      dummy.updateMatrix();
      rim.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  });
  group.add(rim);
  const bubbles = level.acidPools.map((pool) => {
    const n = 14;
    const rnd = mulberry32(hashString(pool.id));
    const arr = new Float32Array(n * 3);
    const base: number[] = [];
    for (let i = 0; i < n; i++) {
      arr[i * 3] = pool.minX + rnd() * (pool.maxX - pool.minX);
      arr[i * 3 + 1] = pool.surfaceY;
      arr[i * 3 + 2] = pool.minZ + rnd() * (pool.maxZ - pool.minZ);
      base.push(rnd());
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(g, track(new THREE.PointsMaterial({ color: 0xa8e870, size: 0.12, transparent: true, opacity: 0.6, depthWrite: false })));
    pts.frustumCulled = false;
    group.add(pts);
    return { pts, arr, base, surfaceY: pool.surfaceY, pool };
  });

  // 5. Atmosphere points per sector (<= 400), only the active room is animated.
  const atmo = level.rooms.map((room) => {
    const dust = room.sector === 'biolabs' || room.sector === 'mines' ? 0x78d8a0 : 0xa8c0d0;
    const pts = seededPoints(Math.min(400, Math.round((room.maxX - room.minX) * (room.maxY - room.minY) * 0.5) + 60), room, hashString(room.id + 'dust'), dust, 0.07, -2.6, 2.4);
    track(pts.geometry);
    track(pts.material as THREE.Material);
    group.add(pts);
    roomObjs.find((r) => r.room === room)?.objs.push(pts);
    return { room, pts };
  });

  let lastT = 0;
  return {
    update(tSec: number, playerX: number, playerY: number, reduce = false): void {
      const dt = Math.min(0.1, Math.max(0, tSec - lastT));
      lastT = tSec;
      const k = dt * 60;
      const frame = Math.floor(tSec * 4);
      if (frame !== monFrame) {
        monFrame = frame;
        drawMonitor(frame);
      }
      pulseMat.color.setScalar(0.2 + 0.75 * reactorPulse(tSec, reduce)).multiply(col.setHex(0xff7a40));
      if (core && flickerLamps.length > 0) {
        for (const fl of flickerLamps) {
          const lv = flickerLevel(fl.mode, fl.seed, tSec, reduce);
          core.setColorAt(fl.i, col.setRGB(fl.r * lv, fl.g * lv, fl.b * lv));
        }
        if (core.instanceColor) core.instanceColor.needsUpdate = true;
      }
      haloMat.opacity = 0.42 + 0.08 * Math.sin(tSec * 0.7);
      for (const b of bubbles) {
        for (let i = 0; i < b.base.length; i++) {
          const ph = (tSec * 0.5 + b.base[i]) % 1;
          b.arr[i * 3 + 1] = b.surfaceY + ph * 0.7;
        }
        (b.pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
      for (const a of atmo) {
        const active = playerX >= a.room.minX && playerX <= a.room.maxX && playerY >= a.room.minY - 1 && playerY <= a.room.maxY + 1;
        if (!active) continue;
        const attr = a.pts.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < attr.count; i++) {
          arr[i * 3 + 1] += 0.0025 * (1 + (i % 3)) * k;
          arr[i * 3] += Math.sin(tSec * 0.6 + i) * 0.0015 * k;
          if (arr[i * 3 + 1] > a.room.maxY - 0.3) arr[i * 3 + 1] = a.room.minY + 0.3;
        }
        attr.needsUpdate = true;
      }
    },
    setView(minX: number, maxX: number, minY: number, maxY: number): void {
      for (const r of roomObjs) {
        const vis = r.room.maxX >= minX && r.room.minX <= maxX && r.room.maxY >= minY && r.room.minY <= maxY;
        for (const o of r.objs) o.visible = vis;
      }
      for (const b of bubbles) {
        const p = b.pool;
        b.pts.visible = p.maxX >= minX && p.minX <= maxX && p.surfaceY + 1 >= minY && p.surfaceY - 1 <= maxY;
      }
    },
    dispose(): void {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}

/** Instances written per door: 2 emitter bars + 2 jambs x 3 status lamps. */
export const DOOR_LAMPS_PER_DOOR = 8;

export interface DoorDressing {
  lamps: THREE.InstancedMesh;
  signs: THREE.InstancedMesh;
  hazard: THREE.Mesh | null;
  lampIdx: Map<string, { idx: number[]; color: number; open: boolean }>;
}

/** Door lock lamps, emitter bars, sign plates and hazard stripes as shared (instanced / merged) meshes. */
export function buildDoorDressingMeshes(
  solids: readonly MapSolid3D[],
  tex: Pick<FacilityTextures3D, 'hazardMap' | 'signMap'>,
  doorColors: Record<string, number>,
): DoorDressing | null {
  const doors = solids.filter((d) => d.kind === 'door' && d.doorId);
  if (doors.length === 0) return null;
  const hazardTex = tex.hazardMap.clone();
  hazardTex.repeat.set(1, 1);
  hazardTex.needsUpdate = true;
  const lampIdx = new Map<string, { idx: number[]; color: number; open: boolean }>();
  const hazGeos: THREE.BufferGeometry[] = [];
  const addStripe = (x: number, y: number, z: number, w: number, h: number): void => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(0.5, w / 0.8), uv.getY(i) * Math.max(0.5, h / 0.8));
    g.translate(x, y, z);
    hazGeos.push(g);
  };
  const lampGeo = new THREE.BoxGeometry(1, 1, 1);
  const lampCount = doors.length * DOOR_LAMPS_PER_DOOR;
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), lampCount);
  lamps.name = 'door:lamps';
  const signs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex.signMap, color: 0xffffff }),
    doors.length,
  );
  signs.name = 'door:signs';
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  let li = 0;
  doors.forEach((s, di) => {
    const sx = s.maxX - s.minX;
    const sy = Math.max(0.08, (s.visualMaxY ?? s.maxY) - s.minY);
    const cx = (s.minX + s.maxX) / 2;
    const top = s.minY + sy;
    const zf = s.maxZ + 0.2;
    const lock = doorColors[s.doorLock ?? 'escape'] ?? 0xff4526;
    const idx: number[] = [];
    const put = (x: number, y: number, z: number, w: number, h: number, dd: number): void => {
      d.position.set(x, y, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(w, h, dd);
      d.updateMatrix();
      lamps.setMatrixAt(li, d.matrix);
      lamps.setColorAt(li, c.setHex(lock));
      idx.push(li);
      li++;
    };
    // Emitter bars at the top and bottom of the shield, three status lamps on each jamb.
    put(cx, top - 0.06, zf - 0.1, sx + 0.1, 0.1, 0.06);
    put(cx, s.minY + 0.06, zf - 0.1, sx + 0.1, 0.1, 0.06);
    for (let k = 0; k < 2; k++) {
      const jx = k === 0 ? s.minX - 0.2 : s.maxX + 0.2;
      for (let m = 0; m < 3; m++) put(jx, top - 0.5 - m * 0.34, zf, 0.14, 0.14, 0.05);
    }
    // Sign plate above the lintel.
    d.position.set(cx, top + 0.95, zf - 0.05);
    d.rotation.set(0, 0, 0);
    d.scale.set(Math.max(1.8, sx + 1.0), 0.5, 1);
    d.updateMatrix();
    signs.setMatrixAt(di, d.matrix);
    signs.setColorAt(di, c.setHex(lock).multiplyScalar(0.9));
    // Hazard stripes on the jambs and a header band.
    const hw = 0.26;
    addStripe(s.minX - 0.2, s.minY + sy / 2, zf - 0.04, hw, sy);
    addStripe(s.maxX + 0.2, s.minY + sy / 2, zf - 0.04, hw, sy);
    addStripe(cx, top + 0.25, zf - 0.04, sx + 0.8, 0.22);
    lampIdx.set(s.doorId as string, { idx, color: lock, open: false });
  });
  lamps.count = li;
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  signs.instanceMatrix.needsUpdate = true;
  if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
  const merged = mergeGeometries(hazGeos);
  hazGeos.forEach((g) => g.dispose());
  let hazard: THREE.Mesh | null = null;
  if (merged) {
    hazard = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ map: hazardTex, color: 0xd0d0d0, roughness: 0.6, metalness: 0.3 }));
    hazard.name = 'door:hazard';
  }
  return { lamps, signs, hazard, lampIdx };
}

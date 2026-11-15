// Metroid-style sector grid minimap (NEW-DESIGN). Pure canvas 2D, reads only the view state.
import type { DoorLockKind3D, Level3D, RoomDef3D } from '../game3d/types3d.ts';

export interface MinimapViewState {
  rooms: readonly RoomDef3D[];
  visitedRooms: ReadonlySet<string>;
  currentRoomId: string;
  playerX: number;
  playerY: number;
  openDoors: ReadonlySet<string>;
  doors: readonly { id: string; x: number; y: number; lock: DoorLockKind3D }[];
  saveStations: readonly { x: number; y: number }[];
  coreDestroyed: boolean;
  bossAlive: boolean;
  exitPos: { x: number; y: number };
  expanded: boolean;
  /** Rooms whose map terminal was used: shown in full even when never visited (distinct colour) */
  revealedRooms?: ReadonlySet<string>;
  /** '?' markers for items and secrets not yet found, only inside revealed or visited rooms */
  markers?: readonly MinimapMarker[];
  showMarkers?: boolean;
  /** Map terminals (shown as 'M' once their room is visible) */
  mapStations?: readonly { x: number; y: number }[];
}

export interface MinimapMarker {
  x: number;
  y: number;
  kind: 'item' | 'secret';
}

const BASE_W = 224;
const BASE_H = 132;

const DOOR_COLORS: Record<DoorLockKind3D, string> = {
  blue: '#38b6ff',
  green: '#3dff88',
  yellow: '#ffc83d',
  red: '#ff4769',
  console: '#38b6ff',
  escape: '#b77dff',
};
const DOOR_OPEN = '#2b4a5e';

interface Rect { x: number; y: number; w: number; h: number }

function roomContains(r: RoomDef3D, x: number, y: number, eps = 0.01): boolean {
  return x >= r.minX - eps && x <= r.maxX + eps && y >= r.minY - eps && y <= r.maxY + eps;
}

export function renderMinimap(canvas: HTMLCanvasElement, state: MinimapViewState): void {
  const scale = state.expanded ? 2 : 1;
  const W = BASE_W * scale;
  const H = BASE_H * scale;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setLineDash([]);
  g.clearRect(0, 0, W, H);

  // visor background
  g.fillStyle = 'rgba(4, 12, 20, 0.78)';
  g.fillRect(0, 0, W, H);

  // visible rooms: visited plus neighbors of visited
  const byId = new Map<string, RoomDef3D>();
  for (const r of state.rooms) byId.set(r.id, r);
  const visible = new Set<string>();
  const revealed = state.revealedRooms ?? new Set<string>();
  for (const id of revealed) if (byId.has(id)) visible.add(id);
  for (const id of state.visitedRooms) {
    const r = byId.get(id);
    if (!r) continue;
    visible.add(id);
    for (const n of r.neighbors) if (byId.has(n)) visible.add(n);
  }
  visible.add(state.currentRoomId);
  const shown = state.rooms.filter((r) => visible.has(r.id));
  if (shown.length === 0) return;

  // grid bounds
  let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
  for (const r of shown) {
    gx0 = Math.min(gx0, r.gridX);
    gy0 = Math.min(gy0, r.gridY);
    gx1 = Math.max(gx1, r.gridX + r.gridW);
    gy1 = Math.max(gy1, r.gridY + r.gridH);
  }
  const pad = 8 * scale;
  const cell = Math.max(1, Math.min((W - pad * 2) / (gx1 - gx0), (H - pad * 2) / (gy1 - gy0)));
  const ox = (W - (gx1 - gx0) * cell) / 2;
  const oy = (H - (gy1 - gy0) * cell) / 2;

  // faint sector grid lines
  g.strokeStyle = 'rgba(82, 229, 255, 0.07)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = gx0; x <= gx1; x++) {
    const px = Math.round(ox + (x - gx0) * cell) + 0.5;
    g.moveTo(px, 0);
    g.lineTo(px, H);
  }
  for (let y = gy0; y <= gy1; y++) {
    const py = Math.round(oy + (y - gy0) * cell) + 0.5;
    g.moveTo(0, py);
    g.lineTo(W, py);
  }
  g.stroke();

  const rectOf = (r: RoomDef3D): Rect => ({
    x: Math.round(ox + (r.gridX - gx0) * cell) + 1,
    y: Math.round(oy + (r.gridY - gy0) * cell) + 1,
    w: Math.max(2, Math.round(r.gridW * cell) - 2),
    h: Math.max(2, Math.round(r.gridH * cell) - 2),
  });
  const rects = new Map<string, Rect>();
  for (const r of shown) rects.set(r.id, rectOf(r));
  const pos = (r: RoomDef3D, wx: number, wy: number): { x: number; y: number } => {
    const rc = rects.get(r.id)!;
    const fx = Math.min(1, Math.max(0, (wx - r.minX) / Math.max(0.001, r.maxX - r.minX)));
    const fy = Math.min(1, Math.max(0, (wy - r.minY) / Math.max(0.001, r.maxY - r.minY)));
    return { x: rc.x + fx * rc.w, y: rc.y + (1 - fy) * rc.h };
  };

  // unvisited neighbors first (dim dashed), then discovered rooms
  g.lineWidth = 1;
  for (const r of shown) {
    if (state.visitedRooms.has(r.id) || r.id === state.currentRoomId) continue;
    const rc = rects.get(r.id)!;
    if (revealed.has(r.id)) {
      // Mapped but never visited: solid teal-grey fill instead of the dashed unknown outline
      g.fillStyle = '#1d3b3f';
      g.fillRect(rc.x, rc.y, rc.w, rc.h);
      g.strokeStyle = 'rgba(120, 200, 190, 0.75)';
      g.setLineDash([]);
      g.strokeRect(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1);
      continue;
    }
    g.setLineDash([3 * scale, 3 * scale]);
    g.strokeStyle = 'rgba(90, 140, 175, 0.45)';
    g.strokeRect(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1);
  }
  g.setLineDash([]);
  for (const r of shown) {
    if (!state.visitedRooms.has(r.id) && r.id !== state.currentRoomId) continue;
    const rc = rects.get(r.id)!;
    const cur = r.id === state.currentRoomId;
    if (cur) {
      g.save();
      g.shadowColor = '#52e5ff';
      g.shadowBlur = 8 * scale;
      g.fillStyle = '#1e5d8c';
      g.fillRect(rc.x, rc.y, rc.w, rc.h);
      g.restore();
      g.strokeStyle = '#52e5ff';
      g.lineWidth = 1.5 * scale;
    } else {
      g.fillStyle = '#14385c';
      g.fillRect(rc.x, rc.y, rc.w, rc.h);
      g.strokeStyle = 'rgba(110, 170, 215, 0.7)';
      g.lineWidth = 1;
    }
    g.strokeRect(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1);
  }

  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  const roomFor = (x: number, y: number): RoomDef3D | undefined => {
    let found: RoomDef3D | undefined;
    for (const r of shown) {
      if (!roomContains(r, x, y)) continue;
      if (!found || state.visitedRooms.has(r.id)) found = r;
      if (r.id === state.currentRoomId) return r;
    }
    return found;
  };

  // doors
  const dh = Math.max(5, 7 * scale);
  for (const d of state.doors) {
    const r = roomFor(d.x, d.y);
    if (!r) continue;
    const p = pos(r, d.x, d.y);
    const open = state.openDoors.has(d.id);
    g.fillStyle = open ? DOOR_OPEN : DOOR_COLORS[d.lock];
    if (!open && d.lock === 'escape') g.globalAlpha = 0.6 + 0.4 * pulse;
    g.fillRect(Math.round(p.x - scale), Math.round(p.y - dh / 2), 2 * scale, dh);
    g.globalAlpha = 1;
  }

  // save stations
  g.font = `bold ${7 * scale + 2}px ui-monospace, Menlo, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const s of state.saveStations) {
    const r = roomFor(s.x, s.y);
    if (!r || !(state.visitedRooms.has(r.id) || revealed.has(r.id))) continue;
    const p = pos(r, s.x, s.y);
    g.fillStyle = '#3dff88';
    g.fillText('S', Math.round(p.x), Math.round(p.y));
  }
  // map terminals
  for (const m of state.mapStations ?? []) {
    const r = roomFor(m.x, m.y);
    if (!r || !(state.visitedRooms.has(r.id) || revealed.has(r.id))) continue;
    const p = pos(r, m.x, m.y);
    g.fillStyle = revealed.has(r.id) ? '#78c8be' : '#52e5ff';
    g.fillText('M', Math.round(p.x), Math.round(p.y));
  }
  // '?' markers: uncollected items (amber) and unopened secrets (magenta), only where the map knows the room
  if (state.showMarkers !== false) {
    for (const mk of state.markers ?? []) {
      const r = roomFor(mk.x, mk.y);
      if (!r || !(state.visitedRooms.has(r.id) || revealed.has(r.id))) continue;
      const p = pos(r, mk.x, mk.y);
      g.fillStyle = mk.kind === 'secret' ? '#ff7ad9' : '#ffc83d';
      g.fillText('?', Math.round(p.x), Math.round(p.y));
    }
  }

  // boss icon
  if (state.bossAlive) {
    const br = shown.find((r) => r.hasBoss);
    if (br) {
      const rc = rects.get(br.id)!;
      const cx = rc.x + rc.w / 2;
      const cy = rc.y + rc.h / 2;
      const s = 4 * scale;
      g.save();
      g.shadowColor = '#ff5a2a';
      g.shadowBlur = 6 * scale;
      g.fillStyle = '#ff5a2a';
      g.beginPath();
      g.moveTo(cx, cy - s);
      g.lineTo(cx + s, cy);
      g.lineTo(cx, cy + s);
      g.lineTo(cx - s, cy);
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = '#1a0a05';
      g.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }

  // exit beacon
  const er = shown.find((r) => r.hasExit) ?? roomFor(state.exitPos.x, state.exitPos.y);
  if (er) {
    const p = pos(er, state.exitPos.x, state.exitPos.y);
    const a = state.coreDestroyed ? 0.65 + 0.35 * pulse : 0.45;
    g.save();
    g.globalAlpha = a;
    g.shadowColor = '#b77dff';
    g.shadowBlur = (state.coreDestroyed ? 10 : 4) * scale;
    g.fillStyle = '#d9b8ff';
    g.font = `bold ${6 * scale + 2}px ui-monospace, Menlo, monospace`;
    g.fillText('EX', Math.round(p.x), Math.round(p.y));
    g.restore();
  }

  // player dot
  const cr = byId.get(state.currentRoomId);
  if (cr && rects.has(cr.id)) {
    const p = pos(cr, state.playerX, state.playerY);
    const rad = (2 + pulse) * scale;
    g.save();
    g.shadowColor = '#52e5ff';
    g.shadowBlur = 8 * scale;
    g.fillStyle = `rgba(82, 229, 255, ${0.35 + 0.35 * pulse})`;
    g.beginPath();
    g.arc(p.x, p.y, rad + 2 * scale, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(p.x, p.y, rad, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  if (state.expanded) {
    const cur = byId.get(state.currentRoomId);
    if (cur) {
      g.font = `bold ${10}px ui-monospace, Menlo, monospace`;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = '#9fe9ff';
      g.fillText(cur.name.toUpperCase(), 6, 5);
    }
  }
}

/** Minimal world view the marker builder needs (a WorldState3D satisfies it). */
export interface MarkerSource {
  level: Level3D;
  collectedUpgrades: ReadonlySet<string>;
  collectibles: readonly { x: number; y: number; taken: boolean }[];
  secretsFound: readonly string[];
  pickups: readonly { kind: string; x: number; y: number; taken: boolean }[];
}

/** '?' markers: every upgrade, data log and weapon not yet taken (amber) and every secret not yet found (magenta). Pure. */
export function collectMinimapMarkers(w: MarkerSource): MinimapMarker[] {
  const out: MinimapMarker[] = [];
  for (const u of w.level.upgrades) if (!w.collectedUpgrades.has(u.id)) out.push({ x: u.x, y: u.y + 0.9, kind: 'item' });
  for (const c of w.collectibles) if (!c.taken) out.push({ x: c.x, y: c.y + 0.9, kind: 'item' });
  for (const pk of w.pickups) if (pk.kind === 'weapon' && !pk.taken) out.push({ x: pk.x, y: pk.y + 0.9, kind: 'item' });
  for (const sr of w.level.secrets) {
    if (w.secretsFound.includes(sr.id)) continue;
    const s = w.level.solids.find((x) => x.doorId === sr.doorId || x.breakId === sr.doorId);
    if (s) out.push({ x: (s.minX + s.maxX) / 2, y: (s.minY + s.maxY) / 2, kind: 'secret' });
  }
  return out;
}

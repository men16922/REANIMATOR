// Side-view 2D canvas fallback renderer for environments lacking WebGL2 (XY projection of the z = 0 lane).
import type { WorldState3D } from '../game3d/world3d.ts';

const SCALE = 34;
const LOCK_COLORS: Record<string, string> = {
  blue: '#3a8cff',
  green: '#3aff6a',
  yellow: '#ffc933',
  red: '#ff2a3c',
  console: '#2bf0ff',
  escape: '#ff4a2a',
};

function camera(canvas: HTMLCanvasElement, w: WorldState3D): { cx: number; cy: number } {
  return { cx: w.player.body.x * SCALE - canvas.width * 0.5, cy: -(w.player.body.y + 1.4) * SCALE - canvas.height * 0.5 };
}

/** Maps normalized canvas coordinates (0..1) to the world aim point (used when WebGL2 is unavailable). */
export function fallbackScreenToWorld(canvas: HTMLCanvasElement, w: WorldState3D, normX: number, normY: number): { x: number; y: number } {
  const { cx, cy } = camera(canvas, w);
  return { x: (normX * canvas.width + cx) / SCALE, y: -(normY * canvas.height + cy) / SCALE };
}

export function renderFallback2D3D(canvas: HTMLCanvasElement, w: WorldState3D): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const vw = canvas.width;
  const vh = canvas.height;
  const { cx, cy } = camera(canvas, w);
  const X = (x: number) => x * SCALE;
  const Y = (y: number) => -y * SCALE;

  ctx.fillStyle = '#0b1016';
  ctx.fillRect(0, 0, vw, vh);
  ctx.save();
  ctx.translate(-cx, -cy);

  for (const s of w.level.solids) {
    if (s.doorId && w.openDoors.has(s.doorId)) continue;
    if ((s.collapseId && w.openDoors.has(s.collapseId)) || (s.bridgeId && !w.openDoors.has(s.bridgeId))) continue;
    if (s.kind === 'door' && s.doorLock) ctx.fillStyle = LOCK_COLORS[s.doorLock];
    else if (s.kind === 'platform') ctx.fillStyle = '#4f6a82';
    else if (s.kind === 'catwalk') ctx.fillStyle = '#2a3542';
    else if (s.kind === 'console') ctx.fillStyle = '#1cb8d6';
    else ctx.fillStyle = '#313d4a';
    ctx.fillRect(X(s.minX), Y(s.maxY), (s.maxX - s.minX) * SCALE, (s.maxY - s.minY) * SCALE);
  }
  for (const a of w.level.acidPools) {
    ctx.fillStyle = '#53ea38';
    ctx.fillRect(X(a.minX), Y(a.surfaceY), (a.maxX - a.minX) * SCALE, 0.28 * SCALE);
  }
  for (const st of w.level.saveStations) {
    ctx.fillStyle = '#2bf0ff';
    ctx.fillRect(X(st.x) - 18, Y(st.y) - 6, 36, 6);
  }
  for (const up of w.level.upgrades) {
    if (w.collectedUpgrades.has(up.id)) continue;
    ctx.fillStyle = up.kind === 'thruster_boots' ? '#ffb02e' : '#3dff88';
    ctx.fillRect(X(up.x) - 8, Y(up.y) - 28, 16, 20);
  }
  for (const pk of w.pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = pk.kind === 'med' ? '#3dff88' : pk.kind === 'ammo' ? '#f5b942' : '#d946ef';
    ctx.fillRect(X(pk.x) - 6, Y(pk.y) - 22, 12, 12);
  }
  for (const b of w.barrels) {
    if (!b.alive) continue;
    ctx.fillStyle = '#eab308';
    ctx.fillRect(X(b.x) - 0.45 * SCALE, Y(b.y + 1.2), 0.9 * SCALE, 1.2 * SCALE);
  }
  if (!w.coreDestroyed) {
    ctx.fillStyle = '#2bf0ff';
    ctx.beginPath();
    ctx.arc(X(w.level.corePos.x), Y(1.4), w.level.corePos.radius * SCALE, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of w.enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = e.kind === 'warden' ? '#ef4444' : e.kind === 'stalker' ? '#f97316' : '#a855f7';
    ctx.fillRect(X(e.x - e.radius), Y(e.y + e.height), e.radius * 2 * SCALE, e.height * SCALE);
  }
  for (const sw of w.shockwaves) {
    ctx.fillStyle = '#ff6d2e';
    ctx.fillRect(X(sw.x + sw.radius) - 4, Y(sw.y + 0.75), 8, 0.75 * SCALE);
    ctx.fillRect(X(sw.x - sw.radius) - 4, Y(sw.y + 0.75), 8, 0.75 * SCALE);
  }
  for (const bm of w.beams) {
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(X(bm.x1), Y(bm.y1));
    ctx.lineTo(X(bm.x2), Y(bm.y2));
    ctx.stroke();
  }
  for (const pr of w.projectiles) {
    ctx.fillStyle = pr.fromPlayer ? '#2bf0ff' : '#ff6833';
    ctx.beginPath();
    ctx.arc(X(pr.x), Y(pr.y), pr.radius * SCALE + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  const p = w.player;
  const b = p.body;
  ctx.strokeStyle = 'rgba(43, 240, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(b.x), Y(b.y + 1.12));
  ctx.lineTo(X(p.aimX), Y(p.aimY));
  ctx.stroke();
  ctx.fillStyle = '#2bf0ff';
  ctx.fillRect(X(b.x - 0.42), Y(b.y + 1.82), 0.84 * SCALE, 1.82 * SCALE);
  ctx.restore();
}

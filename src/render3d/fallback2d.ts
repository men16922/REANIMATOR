// Minimal top-down 2D canvas fallback renderer for environments lacking WebGL2.
import type { WorldState3D } from '../game3d/world3d.ts';

export function renderFallback2D3D(canvas: HTMLCanvasElement, w: WorldState3D): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const vw = canvas.width;
  const vh = canvas.height;
  const scale = 28;
  const camX = w.player.body.x * scale - vw * 0.45;
  const camZ = w.player.body.z * scale - vh * 0.5;

  ctx.fillStyle = '#0b1016';
  ctx.fillRect(0, 0, vw, vh);

  ctx.save();
  ctx.translate(-camX, -camZ);

  for (const s of w.level.solids) {
    if (s.doorId && w.openDoors.has(s.doorId)) continue;
    ctx.fillStyle = s.kind === 'door' ? '#a6412a' : s.kind === 'catwalk' ? '#1c2633' : '#313d4a';
    ctx.fillRect(s.minX * scale, s.minZ * scale, (s.maxX - s.minX) * scale, (s.maxZ - s.minZ) * scale);
  }
  for (const a of w.level.acidPools) {
    ctx.fillStyle = '#53ea38';
    ctx.fillRect(a.minX * scale, a.minZ * scale, (a.maxX - a.minX) * scale, (a.maxZ - a.minZ) * scale);
  }
  for (const p of w.level.pillars) {
    ctx.fillStyle = '#4b5563';
    ctx.beginPath();
    ctx.arc(p.x * scale, p.z * scale, p.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const b of w.barrels) {
    if (!b.alive) continue;
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(b.x * scale, b.z * scale, 0.45 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of w.enemies) {
    if (!e.alive) continue;
    ctx.fillStyle = e.kind === 'warden' ? '#ef4444' : e.kind === 'stalker' ? '#f97316' : '#a855f7';
    ctx.beginPath();
    ctx.arc(e.x * scale, e.z * scale, e.radius * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const sw of w.shockwaves) {
    ctx.strokeStyle = '#ff6d2e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sw.x * scale, sw.z * scale, sw.radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const pr of w.projectiles) {
    ctx.fillStyle = pr.fromPlayer ? '#2bf0ff' : '#ff6833';
    ctx.beginPath();
    ctx.arc(pr.x * scale, pr.z * scale, pr.radius * scale + 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player + aim line
  ctx.strokeStyle = 'rgba(43, 240, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w.player.body.x * scale, w.player.body.z * scale);
  ctx.lineTo(w.player.aimX * scale, w.player.aimZ * scale);
  ctx.stroke();

  ctx.fillStyle = '#2bf0ff';
  ctx.beginPath();
  ctx.arc(w.player.body.x * scale, w.player.body.z * scale, 0.45 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

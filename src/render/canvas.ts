// Canvas 2D fallback renderer (320x200 logical pixels). Draws only; never mutates the world.
import { TILE } from '../engine/collider.ts';
import { MAP, CORE, EXIT, HAZARDS, RULES, type World } from '../game/world.ts';
import { lightRadius } from '../game/light.ts';

export const VIEW_W = 320;
export const VIEW_H = 200;

export interface Camera { x: number; y: number }

export function cameraFor(px: number, py: number): Camera {
  const mapW = MAP.w * TILE, mapH = MAP.h * TILE;
  const x = Math.round(Math.min(Math.max(px - VIEW_W / 2, 0), mapW - VIEW_W));
  const y = Math.round(Math.min(Math.max(py - VIEW_H * 0.6, 0), mapH - VIEW_H));
  return { x, y };
}

let tileLayer: HTMLCanvasElement | null = null;
function tiles(): HTMLCanvasElement {
  if (tileLayer) return tileLayer;
  const c = document.createElement('canvas');
  c.width = MAP.w * TILE; c.height = MAP.h * TILE;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10141a'; g.fillRect(0, 0, c.width, c.height);
  for (let ty = 0; ty < MAP.h; ty++) for (let tx = 0; tx < MAP.w; tx++) {
    const x = tx * TILE, y = ty * TILE;
    if (MAP.solid(tx, ty)) {
      g.fillStyle = '#3a4250'; g.fillRect(x, y, TILE, TILE);
      g.fillStyle = '#4c5666'; g.fillRect(x, y, TILE, 2);
      g.fillStyle = '#262c36'; g.fillRect(x, y + TILE - 2, TILE, 2);
      if ((tx + ty) % 3 === 0) { g.fillStyle = '#2f3641'; g.fillRect(x + 6, y + 6, 4, 4); }
    } else if ((tx * 7 + ty * 3) % 11 === 0) {
      g.fillStyle = '#151a22'; g.fillRect(x + 2, y + 3, 12, 1);
    }
  }
  tileLayer = c;
  return c;
}

const dark = document.createElement('canvas');
dark.width = VIEW_W; dark.height = VIEW_H;

export interface View { px: number; py: number; aimX: number; aimY: number; flash: number }

export function draw(g: CanvasRenderingContext2D, w: World, v: View, reducedFlash: boolean): Camera {
  const cam = cameraFor(v.px, v.py);
  g.imageSmoothingEnabled = false;
  g.drawImage(tiles(), -cam.x, -cam.y);
  const sx = (x: number) => Math.round(x - cam.x);
  const sy = (y: number) => Math.round(y - cam.y);

  // floor bio-sludge hazards & med stations
  for (const h of HAZARDS) {
    g.fillStyle = '#20d864';
    g.fillRect(sx(h.tx * TILE), sy((h.ty + 1) * TILE) - 3, TILE, 3);
  }
  for (const m of w.meds) {
    if (m.used) continue;
    g.fillStyle = '#38ffa0';
    g.fillRect(sx(m.x) - 3, sy(m.y) - 10, 6, 8);
  }

  // exit and core
  g.fillStyle = w.hasCore ? '#3fd07a' : '#2b5a3d';
  g.fillRect(sx(EXIT.x) - 7, sy(EXIT.y) - 24, 14, 24);
  if (!w.hasCore) {
    const pulse = 0.6 + 0.4 * Math.sin(w.tick / 3);
    g.fillStyle = `rgba(60,210,255,${pulse})`;
    g.fillRect(sx(CORE.x) - 4, sy(CORE.y) - 12, 8, 8);
  }

  // crawlers
  for (const k of w.crawlers) {
    if (k.dormant) continue;
    if (k.hp <= 0) { g.fillStyle = '#3a1e1e'; g.fillRect(sx(k.x) - 7, sy(k.y) - 2, 14, 2); continue; }
    g.fillStyle = k.hurt > 0 && !reducedFlash ? '#ffffff' : k.stagger > 0 ? '#3ee6ff' : '#a33a2c';
    g.fillRect(sx(k.x) - 7, sy(k.y) - 9, 14, 9);
    g.fillStyle = '#d9d36a';
    g.fillRect(sx(k.x) + (k.dir > 0 ? 4 : -6), sy(k.y) - 8, 2, 2);
  }

  // spitters
  for (const s of w.spitters) {
    if (s.dormant || s.hp <= 0) continue;
    g.fillStyle = s.hurt > 0 && !reducedFlash ? '#ffffff' : s.charge > 0 ? '#74ff70' : '#2f8a4c';
    g.fillRect(sx(s.x) - 6, sy(s.y) - 12, 12, 12);
    g.fillStyle = '#b4ff8c';
    g.fillRect(sx(s.x) + (s.dir > 0 ? 2 : -4), sy(s.y) - 9, 2, 2);
  }

  // Core Warden
  if (w.warden && w.warden.hp > 0) {
    const wd = w.warden;
    g.fillStyle = wd.hurt > 0 && !reducedFlash ? '#ffffff' : wd.charge > 0 ? '#ffaa3b' : '#b84b1e';
    g.fillRect(sx(wd.x) - 11, sy(wd.y) - 34, 22, 34);
    g.fillStyle = '#ffe27a';
    g.fillRect(sx(wd.x) - 3, sy(wd.y) - 22, 6, 6);
    if (wd.charge > 0) {
      g.strokeStyle = '#ff9838';
      g.strokeRect(sx(wd.x) - 13, sy(wd.y) - 36, 26 * (wd.charge / RULES.wardenChargeTicks), 2);
    }
  }

  // player (feet at px,py)
  const blink = w.invuln > 0 && Math.floor(w.invuln / 2) % 2 === 0 && !reducedFlash;
  if (!blink) {
    g.fillStyle = '#9fb3c8'; g.fillRect(sx(v.px) - 5, sy(v.py) - 26, 10, 18);
    g.fillStyle = '#6c7f94'; g.fillRect(sx(v.px) - 5, sy(v.py) - 8, 4, 8); g.fillRect(sx(v.px) + 1, sy(v.py) - 8, 4, 8);
    g.fillStyle = '#e8f1fa'; g.fillRect(sx(v.px) + (w.player.dir > 0 ? 1 : -4), sy(v.py) - 24, 3, 3);
    // gun toward aim
    const ox = v.px, oy = v.py - 18;
    const a = Math.atan2(v.aimY - oy, v.aimX - ox);
    g.strokeStyle = '#cfd8e3'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(sx(ox), sy(oy)); g.lineTo(sx(ox + Math.cos(a) * 10), sy(oy + Math.sin(a) * 10)); g.stroke();
  }

  // bullets & enemy orbs
  for (const b of w.bullets) {
    g.fillStyle = b.piercing ? '#5ef2ff' : '#ffe9a0';
    g.fillRect(sx(b.x) - (b.piercing ? 4 : 1), sy(b.y) - 1, b.piercing ? 8 : 3, 2);
  }
  g.fillStyle = '#6dff57';
  for (const eb of w.enemyBullets) g.fillRect(sx(eb.x) - 2, sy(eb.y) - 2, 4, 4);

  // darkness: the light rule changes only this layer
  const d = dark.getContext('2d')!;
  d.globalCompositeOperation = 'source-over';
  d.fillStyle = 'rgba(0,0,0,0.94)';
  d.clearRect(0, 0, VIEW_W, VIEW_H);
  d.fillRect(0, 0, VIEW_W, VIEW_H);
  d.globalCompositeOperation = 'destination-out';
  const r = lightRadius(w.light);
  const cx = sx(v.px), cy = sy(v.py) - 16;
  const grad = d.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  d.fillStyle = grad;
  d.beginPath(); d.arc(cx, cy, r, 0, Math.PI * 2); d.fill();
  if (w.light.on) {
    const a = Math.atan2(v.aimY - (v.py - 16), v.aimX - v.px);
    d.beginPath(); d.moveTo(cx, cy); d.arc(cx, cy, r * 1.6, a - 0.35, a + 0.35); d.closePath();
    d.fillStyle = 'rgba(0,0,0,0.85)'; d.fill();
  }
  if (!w.hasCore) { // the core glows faintly through darkness so the goal is findable
    const g2 = d.createRadialGradient(sx(CORE.x), sy(CORE.y) - 8, 0, sx(CORE.x), sy(CORE.y) - 8, 18);
    g2.addColorStop(0, 'rgba(0,0,0,0.8)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g2; d.beginPath(); d.arc(sx(CORE.x), sy(CORE.y) - 8, 18, 0, Math.PI * 2); d.fill();
  }
  g.drawImage(dark, 0, 0);

  // damage flash (disabled with reduced flashing)
  if (v.flash > 0 && !reducedFlash) { g.fillStyle = `rgba(160,20,20,${0.25 * v.flash})`; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  return cam;
}

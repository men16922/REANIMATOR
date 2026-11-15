// Classic View status bar: a 320x24 pixel strip along the bottom edge (health, six weapon slots, ammo, kills, sector).
// Layout, colours and icons are an original design that uses the new Classic palette (see render3d/classicLogic.ts).

import { buildPalette, RAMP_STEPS } from '../render3d/classicLogic.ts';
import { drawPixelText, hasGlyph, textWidth } from './pixelFont.ts';

export const HUD_W = 320;
export const HUD_H = 24;
/** Six weapon slots between the health block and the kills block (x 74..230). */
export const WEAPON_SLOTS = 6;
export const SLOT_X0 = 74;
export const SLOT_W = 25;
export const SLOT_PITCH = 26;
/** Characters that fit between x=232 and the right edge (6 px advance). */
export const SECTOR_CHARS = 14;

export interface ClassicHudState {
  hp: number;
  maxHp: number;
  energyTanks: number;
  weapon: 1 | 2 | 3 | 4 | 5 | 6;
  unlocked: readonly [boolean, boolean, boolean, boolean, boolean, boolean];
  /** Ammo per slot; a negative value means unlimited. */
  ammo: readonly [number, number, number, number, number, number];
  kills: number;
  sector: string;
}

const PAL = buildPalette();
/** Palette colour as a CSS hex string: ramp (0..15) and shade (0..15). */
export function paletteHex(ramp: number, shade: number): string {
  const i = (ramp * RAMP_STEPS + shade) * 3;
  const h = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${h(PAL[i])}${h(PAL[i + 1])}${h(PAL[i + 2])}`;
}

/** Number of lit segments in a bar of `segments` cells. A living player always shows at least one. */
export function hpSegments(hp: number, maxHp: number, segments: number): number {
  if (maxHp <= 0 || hp <= 0) return 0;
  return Math.max(1, Math.min(segments, Math.ceil((hp / maxHp) * segments)));
}

export function ammoText(slot: number, ammo: number, unlocked: boolean): string {
  if (!unlocked) return '--';
  if (slot === 1 || ammo < 0) return 'INF';
  return String(Math.max(0, Math.min(999, Math.floor(ammo))));
}

/** Upper-case, truncated to the strip width. */
export function fitText(text: string, maxChars: number): string {
  return text.toUpperCase().slice(0, Math.max(0, maxChars));
}

/** Maps characters outside the font to a space (or a hyphen for dashes), collapses runs of spaces. */
export function sanitizeHudText(text: string): string {
  let out = '';
  for (const ch of text.toUpperCase()) {
    if (ch === '\u2013' || ch === '\u2014' || ch === '\u2011') out += '-';
    else out += hasGlyph(ch) ? ch : ' ';
  }
  return out.replace(/ +/g, ' ').trim();
}

/** Sector label that always fits `maxChars`: full text, else the part after the separator, else truncated with a dot. */
export function classicSectorLabel(raw: string, maxChars: number): string {
  const full = sanitizeHudText(raw);
  if (full.length <= maxChars) return full;
  const cut = raw.split(/[\u00b7|:]/);
  const tail = sanitizeHudText(cut[cut.length - 1]);
  if (tail.length > 0 && tail.length <= maxChars) return tail;
  const base = tail.length > 0 ? tail : full;
  return maxChars > 1 ? `${base.slice(0, maxChars - 1).trimEnd()}.` : base.slice(0, maxChars);
}

export function hudKey(s: ClassicHudState): string {
  return [s.hp, s.maxHp, s.energyTanks, s.weapon, s.unlocked.join(''), s.ammo.join(','), s.kills, s.sector].join('|');
}

const ICONS: Record<number, string[]> = {
  1: ['.......', '..###..', '.#####.', '.##.##.', '.#####.', '..###..', '.......'],
  2: ['.#.#.#.', '.......', '.#.#.#.', '.......', '.#.#.#.', '.......', '.......'],
  3: ['...##..', '...#...', '.#####.', '#######', '#######', '#######', '.#####.'],
  4: ['.......', '.#.....', '#######', '#######', '.#.....', '.......', '.......'],
  // Flamer: a teardrop flame. Rocket: a missile pointing right.
  5: ['...#...', '..##...', '..###..', '.#####.', '.##.##.', '.#####.', '..###..'],
  6: ['.......', '.#.....', '.####..', '#######', '.####..', '.#.....', '.......'],
};

function drawIcon(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') ctx.fillRect(x + c, y + r, 1, 1);
}

/** Draws the whole strip into a 320x24 context. */
export function drawClassicHud(ctx: CanvasRenderingContext2D, s: ClassicHudState): void {
  const bg = paletteHex(1, 1);
  const edgeDark = paletteHex(1, 4);
  const edgeLight = paletteHex(3, 9);
  const label = paletteHex(4, 11);
  const text = paletteHex(14, 14);
  const dim = paletteHex(2, 5);

  ctx.clearRect(0, 0, HUD_W, HUD_H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, HUD_W, HUD_H);
  ctx.fillStyle = edgeDark;
  ctx.fillRect(0, 0, HUD_W, 1);
  ctx.fillStyle = edgeLight;
  ctx.fillRect(0, 1, HUD_W, 1);

  // Health
  drawPixelText(ctx, 'HP', 4, 5, label);
  drawPixelText(ctx, String(Math.max(0, Math.ceil(s.hp))), 18, 5, text);
  const segs = 12;
  const lit = hpSegments(s.hp, s.maxHp, segs);
  const ratio = s.maxHp > 0 ? s.hp / s.maxHp : 0;
  const barColor = ratio > 0.5 ? paletteHex(6, 10) : ratio > 0.25 ? paletteHex(4, 10) : paletteHex(12, 10);
  for (let i = 0; i < segs; i++) {
    ctx.fillStyle = i < lit ? barColor : paletteHex(1, 3);
    ctx.fillRect(4 + i * 5, 15, 4, 5);
  }
  for (let t = 0; t < s.energyTanks; t++) {
    ctx.fillStyle = paletteHex(15, 11);
    ctx.fillRect(48 + t * 5, 6, 4, 5);
  }

  // Weapon slots
  for (let i = 0; i < WEAPON_SLOTS; i++) {
    const slot = i + 1;
    const x = SLOT_X0 + i * SLOT_PITCH;
    const on = s.weapon === slot;
    const open = s.unlocked[i];
    ctx.fillStyle = on ? edgeLight : edgeDark;
    ctx.fillRect(x, 4, SLOT_W, 18);
    ctx.fillStyle = on ? paletteHex(1, 3) : paletteHex(1, 0);
    ctx.fillRect(x + 1, 5, SLOT_W - 2, 16);
    drawPixelText(ctx, String(slot), x + 3, 6, open ? label : dim);
    drawIcon(ctx, ICONS[slot], x + 12, 6, open ? (on ? paletteHex(4, 13) : text) : dim);
    const a = ammoText(slot, s.ammo[i], open);
    drawPixelText(ctx, a, x + SLOT_W - 1 - textWidth(a), 14, open ? text : dim);
  }

  // Kills and sector
  drawPixelText(ctx, 'KILLS', 232, 5, label);
  drawPixelText(ctx, String(s.kills), 232 + textWidth('KILLS ') + 1, 5, text);
  drawPixelText(ctx, classicSectorLabel(s.sector, SECTOR_CHARS), 232, 15, paletteHex(5, 11));
}

/** Owns the strip canvas, placed right after the DOM HUD and repaints only when the state changes. */
export class ClassicHud {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private lastKey = '';

  constructor(after: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'classic-hud';
    this.canvas.width = HUD_W;
    this.canvas.height = HUD_H;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    after.after(this.canvas);
  }

  update(s: ClassicHudState): void {
    const k = hudKey(s);
    if (k === this.lastKey || !this.ctx) return;
    this.lastKey = k;
    drawClassicHud(this.ctx, s);
  }
}

/**
 * Classic View status line for the abilities the pixel strip does not draw (dash, light, scan, boots).
 * Pure: percentages are clamped, text is ASCII uppercase so it fits the pixel look.
 */
export function classicStatusText(a: { dashPct: number; lightOn: boolean; batteryPct: number; scan: string; boots: boolean; modules?: readonly string[] }): string {
  const dash = a.dashPct >= 99.5 ? 'RDY' : `${Math.round(Math.max(0, a.dashPct))}%`;
  const light = `${a.lightOn ? 'ON' : 'OFF'} ${Math.round(Math.max(0, Math.min(100, a.batteryPct)))}%`;
  return `DASH ${dash}  LIGHT ${light}  SCAN ${a.scan}${a.boots ? '  BOOTS' : ''}${a.modules && a.modules.length ? `  ${a.modules.join(' ')}` : ''}`;
}

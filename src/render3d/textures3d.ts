// Procedural canvas PBR textures for REANIMATOR's Full 3D industrial facility.
// Generates deck plates, ribbed bulkheads, perforated catwalk grates, hazard stripes, and glowing acid.
import * as THREE from 'three';
import { enrichTerrainCanvas, normalMapFromCanvas, type TerrainKind } from './terrainMaps.ts';

export interface FacilityTextures3D {
  deckMap: THREE.CanvasTexture;
  deckBump: THREE.CanvasTexture;
  wallMap: THREE.CanvasTexture;
  grateMap: THREE.CanvasTexture;
  hazardMap: THREE.CanvasTexture;
  acidMap: THREE.CanvasTexture;
  rockMap: THREE.CanvasTexture;
  rockBump: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  cleanTileMap: THREE.CanvasTexture;
  panelMap: THREE.CanvasTexture;
  rustMetalMap: THREE.CanvasTexture;
  macroMap: THREE.CanvasTexture;
  crateMap: THREE.CanvasTexture;
  /** R14 height-derived normal maps (null-safe: absent when the canvas has no pixel access). */
  rockNormal: THREE.CanvasTexture | null;
  concreteNormal: THREE.CanvasTexture | null;
  cleanTileNormal: THREE.CanvasTexture | null;
  panelNormal: THREE.CanvasTexture | null;
  rustMetalNormal: THREE.CanvasTexture | null;
  wallNormal: THREE.CanvasTexture | null;
  deckNormal: THREE.CanvasTexture | null;
  /** Dark vented housing for light fixtures. */
  grilleMap: THREE.CanvasTexture;
  /** Bright slatted lamp face (tinted per instance). */
  lampMap: THREE.CanvasTexture;
  /** Hex energy lattice for door shields (tinted by emissive). */
  shieldMap: THREE.CanvasTexture;
  /** Door sign plate: chevrons on a dark plate (tinted per instance). */
  signMap: THREE.CanvasTexture;
}

/** Deterministic PRNG (no Math.random) shared by textures and decor layout. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, light: string, dark: string): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rnd() < 0.5 ? light : dark;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3);
  }
}

function blotches(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, count: number, rgb: string, maxA: number): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 12 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${(rnd() * maxA).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

let cached: FacilityTextures3D | null = null;

function makeCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  return c;
}

function asTiledTexture(canvas: HTMLCanvasElement, rx: number, ry: number, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return tex;
}

/** Material breakup: soft grime, drip streaks, edge scratches and a stencilled service mark. Deterministic per seed. */
function weather(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, mark: string | null): void {
  const rnd = mulberry32(seed);
  blotches(ctx, w, h, seed + 1, 14, '4,6,9', 0.55);
  blotches(ctx, w, h, seed + 2, 6, '110,84,52', 0.14);
  // vertical drip streaks (grime runs down panel seams)
  for (let i = 0; i < 7; i++) {
    const x = rnd() * w;
    const y0 = rnd() * h * 0.6;
    const len = 20 + rnd() * h * 0.4;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(0,0,0,0.0)');
    g.addColorStop(0.2, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, 1 + rnd() * 2.5, len);
  }
  // edge wear: bright scratches near the tile border
  ctx.strokeStyle = 'rgba(170,190,205,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const x = rnd() * w;
    const y = rnd() < 0.5 ? 2 + rnd() * 4 : h - 2 - rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + rnd() * 18, y + (rnd() - 0.5) * 3);
    ctx.stroke();
  }
  if (mark) {
    ctx.save();
    ctx.fillStyle = 'rgba(226,170,70,0.34)';
    ctx.font = `bold ${Math.round(w / 14)}px monospace`;
    ctx.fillText(mark, w * 0.08, h * 0.2);
    ctx.fillRect(w * 0.08, h * 0.23, w * 0.22, 2);
    ctx.restore();
  }
}

export function getFacilityTextures3D(): FacilityTextures3D {
  if (cached) return cached;

  const deckCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1b222c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#0e1319';
    ctx.lineWidth = 4;
    for (let x = 0; x <= w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Subtle corner rivets & diamond plate flecks
    ctx.fillStyle = '#283340';
    for (let x = 0; x < w; x += 64) {
      for (let y = 0; y < h; y += 64) {
        ctx.fillRect(x + 6, y + 6, 4, 4);
        ctx.fillRect(x + 54, y + 6, 4, 4);
        ctx.fillRect(x + 6, y + 54, 4, 4);
        ctx.fillRect(x + 54, y + 54, 4, 4);
      }
    }
    ctx.fillStyle = 'rgba(43, 240, 255, 0.045)';
    ctx.fillRect(0, 126, w, 4);
    weather(ctx, w, h, 0x0dec, 'DK-07');
  });

  const bumpCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 4;
    for (let x = 0; x <= w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#c8c8c8';
    for (let x = 8; x < w; x += 16) {
      for (let y = 8; y < h; y += 16) {
        ctx.fillRect(x, y, 2, 5);
      }
    }
  });

  const wallCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#202731';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      ctx.fillStyle = x % 64 === 0 ? '#181e26' : '#252e3a';
      ctx.fillRect(x, 0, 28, h);
    }
    ctx.fillStyle = '#11161d';
    ctx.fillRect(0, 118, w, 12);
    ctx.fillStyle = '#2bf0ff';
    ctx.fillRect(10, 122, 44, 3);
    ctx.fillRect(138, 122, 44, 3);
    weather(ctx, w, h, 0x7a11, 'SEC-B');
  });

  const grateCanvas = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#25313e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0e141b';
    for (let y = 6; y < h; y += 16) {
      for (let x = 6; x < w; x += 16) {
        ctx.fillRect(x, y, 10, 10);
      }
    }
    ctx.fillStyle = '#435568';
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, h - 3, w, 3);
  });

  const hazardCanvas = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#181c20';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e5a922';
    for (let i = -h; i < w + h; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i - 16 + h, h);
      ctx.lineTo(i - 32 + h, h);
      ctx.closePath();
      ctx.fill();
    }
  });

  const acidCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 150);
    grad.addColorStop(0, '#a6ff45');
    grad.addColorStop(0.55, '#4ee034');
    grad.addColorStop(1, '#1a7a28');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(235, 255, 160, 0.35)';
    for (let i = 0; i < 18; i++) {
      const bx = ((i * 53) % 210) + 20;
      const by = ((i * 89) % 210) + 20;
      const r = 4 + (i % 7) * 2;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const rockCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a342d';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 11, 40, '20,16,12', 0.5);
    blotches(ctx, w, h, 12, 30, '90,78,62', 0.25);
    speckle(ctx, w, h, 13, 900, '#5a5043', '#241f19');
    ctx.strokeStyle = 'rgba(15,12,9,0.7)';
    ctx.lineWidth = 2;
    const rnd = mulberry32(14);
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      let x = rnd() * w;
      let y = rnd() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 50;
        y += (rnd() - 0.2) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  const rockBumpCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 21, 50, '255,255,255', 0.5);
    blotches(ctx, w, h, 22, 50, '0,0,0', 0.5);
    speckle(ctx, w, h, 23, 700, '#c0c0c0', '#303030');
  });
  const concreteCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2b323b';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 31, 30, '10,14,18', 0.35);
    blotches(ctx, w, h, 32, 24, '90,105,120', 0.18);
    speckle(ctx, w, h, 33, 600, '#3a4552', '#1c2229');
    ctx.strokeStyle = '#161b21';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.fillStyle = '#3d4856';
    for (const [x, y] of [[10, 10], [w - 14, 10], [10, h - 14], [w - 14, h - 14]]) ctx.fillRect(x, y, 4, 4);
  });
  const tileCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7f9a94';
    ctx.fillRect(0, 0, w, h);
    const rnd = mulberry32(41);
    for (let x = 0; x < w; x += 64) {
      for (let y = 0; y < h; y += 64) {
        const v = 120 + Math.floor(rnd() * 28);
        ctx.fillStyle = `rgb(${v - 14},${v + 14},${v})`;
        ctx.fillRect(x + 2, y + 2, 60, 60);
      }
    }
    ctx.strokeStyle = '#33433f';
    ctx.lineWidth = 3;
    for (let i = 0; i <= w; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    blotches(ctx, w, h, 42, 14, '30,60,40', 0.25);
  });
  const panelCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#242a35';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#12161d';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, w / 2 - 3, h - 4);
    ctx.strokeRect(w / 2 + 1, 2, w / 2 - 3, h - 4);
    ctx.fillStyle = '#3b4656';
    for (const x of [10, w / 2 - 12, w / 2 + 10, w - 12]) {
      for (let y = 12; y < h; y += 40) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = '#0d1116';
    for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 + 24, 150 + i * 8, 72, 3);
    blotches(ctx, w, h, 51, 12, '5,8,12', 0.35);
  });
  const rustCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a3029';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 61, 40, '120,60,28', 0.35);
    blotches(ctx, w, h, 62, 30, '15,10,8', 0.4);
    speckle(ctx, w, h, 63, 800, '#6b4a30', '#1e1712');
    ctx.fillStyle = 'rgba(20,14,10,0.6)';
    for (let y = 40; y < h; y += 80) ctx.fillRect(0, y, w, 3);
  });
  const macroCanvas = makeCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 71, 14, '255,255,255', 0.35);
    blotches(ctx, w, h, 72, 14, '40,40,40', 0.4);
  });

  const crateCanvas = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6a7684';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c343e';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(w - 8, h - 8);
    ctx.moveTo(w - 8, 8);
    ctx.lineTo(8, h - 8);
    ctx.stroke();
    ctx.fillStyle = '#a8b4c0';
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = '#d6a21e';
    ctx.fillRect(0, h / 2 - 5, w, 10);
    speckle(ctx, w, h, 91, 120, '#8a96a4', '#3a424c');
  });

  const grilleCanvas = makeCanvas(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#2b333d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4a5666';
    ctx.fillRect(0, 0, w, 3);
    ctx.fillRect(0, 0, 3, h);
    ctx.fillStyle = '#10151b';
    ctx.fillRect(0, h - 3, w, 3);
    ctx.fillRect(w - 3, 0, 3, h);
    for (let y = 8; y < h - 6; y += 8) {
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(7, y, w - 14, 4);
      ctx.fillStyle = '#3c4858';
      ctx.fillRect(7, y + 4, w - 14, 1);
    }
    ctx.fillStyle = '#6a7686';
    for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) ctx.fillRect(x - 1, y - 1, 2, 2);
  });
  const lampCanvas = makeCanvas(64, 32, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9a9a9a');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(1, '#a0a0a0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (let x = 6; x < w; x += 8) ctx.fillRect(x, 0, 2, h);
    const e = ctx.createLinearGradient(0, 0, w, 0);
    e.addColorStop(0, 'rgba(0,0,0,0.55)');
    e.addColorStop(0.12, 'rgba(0,0,0,0)');
    e.addColorStop(0.88, 'rgba(0,0,0,0)');
    e.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = e;
    ctx.fillRect(0, 0, w, h);
  });
  const shieldCanvas = makeCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d8d8d8';
    ctx.lineWidth = 2;
    const r = 16;
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    for (let col = -1; col * dx < w + r; col++) {
      for (let row = -1; row * dy < h + dy; row++) {
        const cx = col * dx;
        const cy = row * dy + (col % 2 === 0 ? 0 : dy / 2);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          const px = cx + Math.cos(a) * (r - 1);
          const py = cy + Math.sin(a) * (r - 1);
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  });
  const signCanvas = makeCanvas(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#20262e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a96a6';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 24;
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x + 14, h / 2);
      ctx.lineTo(x, h - 14);
      ctx.lineTo(x + 6, h - 14);
      ctx.lineTo(x + 20, h / 2);
      ctx.lineTo(x + 6, 14);
      ctx.closePath();
      ctx.fill();
    }
  });

  // R14: upscale the main surfaces to 512 px with kind-specific detail passes, and derive normal maps from them.
  const enriched = (c: HTMLCanvasElement, kind: TerrainKind): { color: HTMLCanvasElement; normal: THREE.CanvasTexture | null } => {
    const color = enrichTerrainCanvas(c, kind, 512);
    const nc = normalMapFromCanvas(color, kind === 'tile' ? 2.6 : 3.2);
    return { color, normal: nc ? asTiledTexture(nc, 1, 1, false) : null };
  };
  const rockE = enriched(rockCanvas, 'rock');
  const concreteE = enriched(concreteCanvas, 'concrete');
  const tileE = enriched(tileCanvas, 'tile');
  const panelE = enriched(panelCanvas, 'panel');
  const rustE = enriched(rustCanvas, 'rust');
  const wallE = enriched(wallCanvas, 'wall');
  const deckE = enriched(deckCanvas, 'deck');

  cached = {
    rockNormal: rockE.normal,
    concreteNormal: concreteE.normal,
    cleanTileNormal: tileE.normal,
    panelNormal: panelE.normal,
    rustMetalNormal: rustE.normal,
    wallNormal: wallE.normal,
    deckNormal: deckE.normal,
    grilleMap: asTiledTexture(grilleCanvas, 1, 1, true),
    lampMap: asTiledTexture(lampCanvas, 1, 1, true),
    shieldMap: asTiledTexture(shieldCanvas, 1, 2, true),
    signMap: asTiledTexture(signCanvas, 1, 1, true),
    crateMap: asTiledTexture(crateCanvas, 1, 1, true),
    rockMap: asTiledTexture(rockE.color, 1, 1, true),
    rockBump: asTiledTexture(rockBumpCanvas, 1, 1, false),
    concreteMap: asTiledTexture(concreteE.color, 1, 1, true),
    cleanTileMap: asTiledTexture(tileE.color, 1, 1, true),
    panelMap: asTiledTexture(panelE.color, 1, 1, true),
    rustMetalMap: asTiledTexture(rustE.color, 1, 1, true),
    macroMap: asTiledTexture(macroCanvas, 1, 1, true),
    deckMap: asTiledTexture(deckE.color, 1, 1, true),
    deckBump: asTiledTexture(bumpCanvas, 1, 1, false),
    wallMap: asTiledTexture(wallE.color, 1, 1, true),
    grateMap: asTiledTexture(grateCanvas, 2, 1, true),
    hazardMap: asTiledTexture(hazardCanvas, 4, 1, true),
    acidMap: asTiledTexture(acidCanvas, 2, 1, true),
  };
  return cached;
}

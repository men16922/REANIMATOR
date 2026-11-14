// Procedural canvas PBR textures for REANIMATOR's Full 3D industrial facility.
// Generates deck plates, ribbed bulkheads, perforated catwalk grates, hazard stripes, and glowing acid.
import * as THREE from 'three';

export interface FacilityTextures3D {
  deckMap: THREE.CanvasTexture;
  deckBump: THREE.CanvasTexture;
  wallMap: THREE.CanvasTexture;
  grateMap: THREE.CanvasTexture;
  hazardMap: THREE.CanvasTexture;
  acidMap: THREE.CanvasTexture;
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

  cached = {
    deckMap: asTiledTexture(deckCanvas, 1, 1, true),
    deckBump: asTiledTexture(bumpCanvas, 1, 1, false),
    wallMap: asTiledTexture(wallCanvas, 1, 1, true),
    grateMap: asTiledTexture(grateCanvas, 2, 1, true),
    hazardMap: asTiledTexture(hazardCanvas, 4, 1, true),
    acidMap: asTiledTexture(acidCanvas, 2, 1, true),
  };
  return cached;
}

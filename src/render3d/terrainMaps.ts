// R14 terrain quality: procedural detail passes and height-derived normal maps for the facility surface textures.
// Render-only. Everything is deterministic (mulberry32) and tolerant of a stub canvas (tests): without real pixel data
// the normal map falls back to null and callers simply skip the normalMap slot.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TerrainKind = 'rock' | 'concrete' | 'tile' | 'panel' | 'rust' | 'wall' | 'deck';

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Scales a 256 px base canvas to `size` (smooth), then paints kind-specific layers on top. Returns a new canvas. */
export function enrichTerrainCanvas(base: HTMLCanvasElement, kind: TerrainKind, size = 512): HTMLCanvasElement {
  const out = newCanvas(size, size);
  const ctx = out.getContext('2d');
  if (!ctx) return base;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, size, size);
  const rnd = mulberry32(0x7e44 + kind.length * 131 + kind.charCodeAt(0));
  const s = size / 256;
  if (kind === 'rock') {
    // Sedimentary strata: wavy light/dark bands, then fractured chips and pits.
    for (let i = 0; i < 16; i++) {
      const y0 = (i / 16) * size + (rnd() - 0.5) * 12 * s;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(8,6,4,0.34)' : 'rgba(140,120,92,0.2)';
      ctx.lineWidth = (1 + rnd() * 2.4) * s;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= size; x += 16 * s) ctx.lineTo(x, y0 + Math.sin(x * 0.03 + i) * 6 * s + (rnd() - 0.5) * 3 * s);
      ctx.stroke();
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = (3 + rnd() * 11) * s;
      ctx.fillStyle = 'rgba(10,8,6,0.5)';
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(150,130,104,0.22)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.7, r * 0.4, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Acid mineral veins: thin green-teal seams.
    ctx.strokeStyle = 'rgba(96,210,120,0.28)';
    ctx.lineWidth = 1.6 * s;
    for (let i = 0; i < 4; i++) {
      let x = rnd() * size;
      let y = rnd() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (rnd() - 0.4) * 40 * s;
        y += (rnd() - 0.5) * 30 * s;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'concrete') {
    // Poured slab: formwork seams, tie holes, aggregate pits, hairline cracks, rust bleed under the ties.
    ctx.strokeStyle = 'rgba(6,8,10,0.55)';
    ctx.lineWidth = 2 * s;
    for (const f of [0.25, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, size * f);
      ctx.lineTo(size, size * f);
      ctx.stroke();
    }
    for (const [fx, fy] of [[0.125, 0.125], [0.375, 0.125], [0.625, 0.125], [0.875, 0.125], [0.125, 0.5], [0.375, 0.5], [0.625, 0.5], [0.875, 0.5]]) {
      const x = fx * size;
      const y = fy * size;
      const g = ctx.createLinearGradient(0, y, 0, y + 70 * s);
      g.addColorStop(0, 'rgba(120,60,28,0.34)');
      g.addColorStop(1, 'rgba(120,60,28,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 3 * s, y, 6 * s, 70 * s);
      ctx.fillStyle = 'rgba(4,5,7,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 4.2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,100,112,0.4)';
      ctx.lineWidth = 1.4 * s;
      ctx.stroke();
    }
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(6,8,10,0.55)' : 'rgba(110,122,134,0.25)';
      const r = (0.8 + rnd() * 2.4) * s;
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(4,6,8,0.6)';
    ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < 3; i++) {
      let x = rnd() * size;
      let y = rnd() * size * 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (rnd() - 0.5) * 26 * s;
        y += (6 + rnd() * 16) * s;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (kind === 'tile') {
    // Lab tile: bevel highlights on each tile, dark grout, chipped corners, wet sheen streaks.
    const step = size / 4;
    for (let x = 0; x < size; x += step) {
      for (let y = 0; y < size; y += step) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(x + 4 * s, y + 4 * s, step - 8 * s, 2.5 * s);
        ctx.fillRect(x + 4 * s, y + 4 * s, 2.5 * s, step - 8 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.fillRect(x + 4 * s, y + step - 6.5 * s, step - 8 * s, 2.5 * s);
        ctx.fillRect(x + step - 6.5 * s, y + 4 * s, 2.5 * s, step - 8 * s);
        if (rnd() < 0.35) {
          ctx.fillStyle = 'rgba(14,22,20,0.75)';
          const cx = x + (rnd() < 0.5 ? 4 * s : step - 12 * s);
          const cy = y + (rnd() < 0.5 ? 4 * s : step - 12 * s);
          ctx.fillRect(cx, cy, (4 + rnd() * 6) * s, (4 + rnd() * 6) * s);
        }
      }
    }
    ctx.strokeStyle = 'rgba(8,16,14,0.9)';
    ctx.lineWidth = 3.4 * s;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const x = rnd() * size;
      const g = ctx.createLinearGradient(x, 0, x + 30 * s, size);
      g.addColorStop(0, 'rgba(210,255,240,0)');
      g.addColorStop(0.5, 'rgba(210,255,240,0.12)');
      g.addColorStop(1, 'rgba(210,255,240,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 30 * s, size);
    }
  } else if (kind === 'panel') {
    // Armored security panel: recessed inset, seam lines, hex bolts, status strip, warning stencil.
    const m = 14 * s;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3 * s;
    ctx.strokeRect(m, m, size - 2 * m, size - 2 * m);
    ctx.strokeStyle = 'rgba(120,140,170,0.28)';
    ctx.lineWidth = 1.6 * s;
    ctx.strokeRect(m + 3 * s, m + 3 * s, size - 2 * m - 6 * s, size - 2 * m - 6 * s);
    for (const [x, y] of [[m + 10 * s, m + 10 * s], [size - m - 10 * s, m + 10 * s], [m + 10 * s, size - m - 10 * s], [size - m - 10 * s, size - m - 10 * s]]) {
      ctx.fillStyle = 'rgba(14,18,24,0.9)';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const px = x + Math.cos(a) * 6 * s;
        const py = y + Math.sin(a) * 6 * s;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(150,170,200,0.4)';
      ctx.fillRect(x - 2 * s, y - 2 * s, 4 * s, 1.5 * s);
    }
    ctx.fillStyle = 'rgba(255,170,40,0.42)';
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.translate(size * 0.12 + i * 14 * s, size * 0.9);
      ctx.transform(1, 0, -0.9, 1, 0, 0);
      ctx.fillRect(0, -9 * s, 7 * s, 9 * s);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(70,210,230,0.5)';
    ctx.fillRect(size * 0.62, size * 0.1, size * 0.26, 3 * s);
  } else if (kind === 'rust') {
    // Corroded plating: layered flaking, pitting, weld seams, drip streaks.
    for (let i = 0; i < 60; i++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = (6 + rnd() * 22) * s;
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(150,76,30,0.3)' : 'rgba(18,12,9,0.42)';
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      for (let k = 1; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const rr = r * (0.6 + rnd() * 0.6);
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(160,150,140,0.28)';
    ctx.lineWidth = 3 * s;
    ctx.setLineDash([5 * s, 3 * s]);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.5);
    ctx.lineTo(size, size * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * size;
      const y0 = rnd() * size * 0.6;
      const len = (30 + rnd() * 120) * s;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
      g.addColorStop(0, 'rgba(130,64,26,0)');
      g.addColorStop(0.25, 'rgba(130,64,26,0.4)');
      g.addColorStop(1, 'rgba(130,64,26,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, (1.5 + rnd() * 3) * s, len);
    }
  } else if (kind === 'wall') {
    // Bulkhead: corrugation shading, panel joints, bolt rows, a faint conduit run.
    for (let x = 0; x < size; x += 16 * s) {
      const g = ctx.createLinearGradient(x, 0, x + 16 * s, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.07)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 16 * s, size);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, size * 0.25, size, 2.5 * s);
    ctx.fillRect(0, size * 0.75, size, 2.5 * s);
    ctx.fillStyle = 'rgba(150,170,196,0.34)';
    for (const fy of [0.25, 0.75]) for (let x = 12 * s; x < size; x += 32 * s) ctx.fillRect(x, size * fy + 6 * s, 3.5 * s, 3.5 * s);
    ctx.fillStyle = 'rgba(6,8,12,0.55)';
    ctx.fillRect(0, size * 0.44, size, 7 * s);
    ctx.fillStyle = 'rgba(110,130,152,0.3)';
    ctx.fillRect(0, size * 0.44, size, 1.6 * s);
  } else if (kind === 'deck') {
    // Diamond tread over the plate grid plus scuffed wear paths.
    ctx.strokeStyle = 'rgba(150,170,190,0.16)';
    ctx.lineWidth = 1.4 * s;
    const d = 16 * s;
    for (let x = 0; x < size; x += d) {
      for (let y = 0; y < size; y += d) {
        ctx.beginPath();
        ctx.moveTo(x + d / 2, y + 2 * s);
        ctx.lineTo(x + d - 2 * s, y + d / 2);
        ctx.lineTo(x + d / 2, y + d - 2 * s);
        ctx.lineTo(x + 2 * s, y + d / 2);
        ctx.closePath();
        ctx.stroke();
      }
    }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = 'rgba(190,205,220,0.07)';
      ctx.fillRect(0, rnd() * size, size, (3 + rnd() * 9) * s);
    }
  }
  return out;
}

/** Sobel normal map from the luminance of `src`. Returns null when the canvas has no readable pixels (stub DOM). */
export function normalMapFromCanvas(src: HTMLCanvasElement, strength = 2.2, invert = false): HTMLCanvasElement | null {
  const w = src.width;
  const h = src.height;
  if (!(w > 0) || !(h > 0)) return null;
  const sctx = src.getContext('2d');
  if (!sctx || typeof sctx.getImageData !== 'function') return null;
  let img: ImageData;
  try {
    img = sctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const px = img.data;
  if (!(px instanceof Uint8ClampedArray) || px.length < w * h * 4) return null;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  const out = newCanvas(w, h);
  const octx = out.getContext('2d');
  if (!octx) return null;
  const dst = octx.createImageData(w, h);
  const sgn = invert ? -1 : 1;
  const at = (x: number, y: number): number => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * strength * sgn;
      let ny = dy * strength * sgn;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * w + x) * 4;
      dst.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      dst.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      dst.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      dst.data[o + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

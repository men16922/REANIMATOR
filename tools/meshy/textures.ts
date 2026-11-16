// R24 terrain textures: raw Meshy 1024 albedo PNGs (gitignored, assets/meshy-raw/textures/) -> tiling-fixed 512 px WebP
// albedo plus deterministic normal maps in public/assets/textures/. Run: npm run meshy:textures
// No network, no randomness. Tiling fix: the half-period-shifted copy is cross-faded in toward the image edges, so the
// wrapped image has no seam (the shifted copy's own seam sits at the centre, where its weight is zero).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '../..');
const RAW = join(ROOT, 'assets/meshy-raw/textures');
const OUT = join(ROOT, 'public/assets/textures');
const MANIFEST = join(ROOT, 'reference/manifests/meshy-assets.json');
const REGISTER = join(ROOT, 'docs/reference/ASSET_REGISTER.md');
const N = 512;

export interface TextureSpec {
  id: string;
  taskId: string;
  prompt: string;
  /** Crop applied to the raw PNG before resizing (drops painted borders; selects the strip of a 16:9 sheet). */
  crop?: { left: number; top: number; width: number; height: number };
  /** Horizontally tileable strip (albedo only, no normal map), output size in px. */
  strip?: { w: number; h: number };
}

const STYLE = 'Seamless tileable texture, orthographic top-down view, even flat lighting, no shadows, no perspective, game texture, PBR albedo';
export const TEXTURES: TextureSpec[] = [
  { id: 's1-floor', taskId: '01a1e525-0304-7790-9a6b-8bae52f73b76', prompt: `${STYLE}: dark industrial steel floor plating, diamond tread` },
  { id: 's1-wall', taskId: '01a1e525-0725-7118-8f3a-c7ebb56038b0', prompt: `${STYLE}: dark gunmetal wall panels with teal accents` },
  { id: 'mines-rock', taskId: '01a1e525-0c95-766e-b480-dfb054a38260', prompt: `${STYLE}: dark basalt cave rock with rust ore veins` },
  { id: 'foundry-iron', taskId: '01a1e525-12da-765a-8f71-d7bc6a84f20d', prompt: `${STYLE}: black cast iron with hazard stripe` },
  { id: 'reactor-frost', taskId: '01a1e525-1830-71d2-a139-d3188287cf43', prompt: `${STYLE}: frosted dark steel reactor panels with cyan strips` },
  // R25
  { id: 'reactor-floor-calm', taskId: '01a1e535-6672-7203-a0b6-b5aa5c256ceb', prompt: 'calm dark frosted steel plates, large panels, subtle seams, light frost dusting, very muted, low contrast, no grid pattern, no glowing lines' },
  { id: 'reactor-wall', taskId: '01a1e535-6c0c-71c5-8eb8-ed2007af81dc', prompt: 'reactor facility wall, dark steel panels, ice crust in seams, pipes, sparse small cyan lights, muted' },
  { id: 'foundry-wall', taskId: '01a1e535-7313-735b-b55c-3c16efa87cb7', prompt: 'soot-blackened riveted iron panels and refractory brick sections, heat stains, faint orange glow in cracks, muted', crop: { left: 56, top: 70, width: 910, height: 895 } },
  { id: 'hazard-trim', taskId: '01a1e535-7955-711f-b921-b60d0475bb8c', prompt: '16:9, horizontally tileable strip, worn industrial platform edge trim, steel lip with yellow and black hazard chevrons, bolts', crop: { left: 0, top: 150, width: 690, height: 200 }, strip: { w: 512, h: 128 } },
  { id: 'steel-grating', taskId: '01a1e535-7eda-703b-93e0-c1267f79aa21', prompt: 'dark steel open floor grating, rectangular bars, thick support beams, grime, rust, dark void below' },
];

/** Cross-fade the half-shifted copy toward the edges so the result wraps without a seam. Pure, RGB interleaved. */
export function makeTileable(rgb: Uint8Array, n: number, ch: number): Uint8Array {
  return makeTileableWH(rgb, n, n, ch, true, true);
}

/** Rectangular variant; `tileY` false leaves the vertical axis untouched (strips that only repeat along their length). */
export function makeTileableWH(rgb: Uint8Array, w: number, hgt: number, ch: number, tileX: boolean, tileY: boolean): Uint8Array {
  const out = new Uint8Array(rgb.length);
  const hx = w >> 1;
  const hy = hgt >> 1;
  for (let y = 0; y < hgt; y++) {
    const wy = tileY ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (y + 0.5)) / hgt) : 1;
    for (let x = 0; x < w; x++) {
      const wx = tileX ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / w) : 1;
      const wt = wx * wy;
      const a = (y * w + x) * ch;
      const b = (((y + (tileY ? hy : 0)) % hgt) * w + ((x + (tileX ? hx : 0)) % w)) * ch;
      for (let c = 0; c < ch; c++) out[a + c] = Math.round(rgb[a + c] * wt + rgb[b + c] * (1 - wt));
    }
  }
  return out;
}

export function luminance(rgb: Uint8Array, n: number, ch: number): Float32Array {
  const l = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) l[i] = (0.2126 * rgb[i * ch] + 0.7152 * rgb[i * ch + 1] + 0.0722 * rgb[i * ch + 2]) / 255;
  return l;
}

/** Tangent-space normal map from a Sobel gradient of luminance (wrapping, so it tiles). */
export function sobelNormal(lum: Float32Array, n: number, strength: number): Uint8Array {
  const out = new Uint8Array(n * n * 3);
  const L = (x: number, y: number): number => lum[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
      const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
      let nx = -dx * strength;
      let ny = dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      const i = (y * n + x) * 3;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const rows: { id: string; bytes: number; sha: string; spec: TextureSpec }[] = [];
  for (const spec of TEXTURES) {
    const src = join(RAW, `${spec.id}.png`);
    if (!existsSync(src)) throw new Error(`missing raw texture ${src} (gitignored; regenerate from Meshy task ${spec.taskId})`);
    const W = spec.strip?.w ?? N;
    const H = spec.strip?.h ?? N;
    let img = sharp(src);
    if (spec.crop) img = img.extract(spec.crop);
    const { data } = await img.resize(W, H, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tiled = spec.strip ? makeTileableWH(new Uint8Array(data), W, H, 3, true, false) : makeTileable(new Uint8Array(data), N, 3);
    const files: [string, Buffer | Uint8Array, number][] = [[`${spec.id}.webp`, tiled, 3]];
    if (!spec.strip) files.push([`${spec.id}-n.webp`, sobelNormal(luminance(tiled, N, 3), N, 2.2), 3]);
    let bytes = 0;
    const hash = createHash('sha256');
    for (const [name, buf, channels] of files) {
      const webp = await sharp(Buffer.from(buf), { raw: { width: W, height: H, channels: channels as 1 | 3 } }).webp({ quality: name.endsWith('-n.webp') ? 88 : 82, effort: 5 }).toBuffer();
      writeFileSync(join(OUT, name), webp);
      bytes += webp.length;
      hash.update(webp);
    }
    rows.push({ id: spec.id, bytes, sha: hash.digest('hex'), spec });
    console.log(`${spec.id}: ${bytes} B`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { assets: Record<string, unknown>[] };
  manifest.assets = manifest.assets.filter((a) => !String(a.id).startsWith('texture/'));
  for (const r of rows) {
    manifest.assets.push({
      id: `texture/${r.id}`,
      role: r.spec.strip ? 'Platform edge trim strip: albedo only (horizontally tileable WebP)' : 'Terrain surface texture: albedo + derived normal (tiling-fixed, 512 px WebP)',
      generator: 'Meshy nano-banana-2 text-to-image, tiling cross-fade + Sobel normal (tools/meshy/textures.ts)',
      license: 'Private',
      pose: 'none',
      prompt: r.spec.prompt,
      taskId: r.spec.taskId,
      rawFile: `assets/meshy-raw/textures/${r.id}.png`,
      optimizedFile: `public/assets/textures/${r.id}.webp`,
      derivedFiles: r.spec.strip ? [] : [`public/assets/textures/${r.id}-n.webp`],
      optimizedBytes: r.bytes,
      optimizedSha256: r.sha,
    });
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  const table = [
    '<!-- textures:begin -->',
    '',
    '### Terrain textures (R24/R25, tools/meshy/textures.ts)',
    '',
    '| Id | Files (albedo, normal) | Bytes | Meshy task | Prompt |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| \`texture/${r.id}\` | \`public/assets/textures/${r.id}{,-n,-r}.webp\` | ${r.bytes.toLocaleString('en-US')} B | \`${r.spec.taskId}\` | ${r.spec.prompt} |`),
    '',
    '<!-- textures:end -->',
  ].join('\n');
  let reg = readFileSync(REGISTER, 'utf8');
  const re = /<!-- textures:begin -->[\s\S]*?<!-- textures:end -->/;
  reg = re.test(reg) ? reg.replace(re, table) : `${reg.trimEnd()}\n\n${table}\n`;
  writeFileSync(REGISTER, reg);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();

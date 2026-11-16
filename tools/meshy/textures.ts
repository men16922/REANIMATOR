// R24 terrain textures: raw Meshy 1024 albedo PNGs (gitignored, assets/meshy-raw/textures/) -> tiling-fixed 512 px WebP
// albedo plus deterministic normal and roughness maps in public/assets/textures/. Run: npm run meshy:textures
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
}

const STYLE = 'Seamless tileable texture, orthographic top-down view, even flat lighting, no shadows, no perspective, game texture, PBR albedo';
export const TEXTURES: TextureSpec[] = [
  { id: 's1-floor', taskId: '01a1e525-0304-7790-9a6b-8bae52f73b76', prompt: `${STYLE}: dark industrial steel floor plating, diamond tread` },
  { id: 's1-wall', taskId: '01a1e525-0725-7118-8f3a-c7ebb56038b0', prompt: `${STYLE}: dark gunmetal wall panels with teal accents` },
  { id: 'mines-rock', taskId: '01a1e525-0c95-766e-b480-dfb054a38260', prompt: `${STYLE}: dark basalt cave rock with rust ore veins` },
  { id: 'foundry-iron', taskId: '01a1e525-12da-765a-8f71-d7bc6a84f20d', prompt: `${STYLE}: black cast iron with hazard stripe` },
  { id: 'reactor-frost', taskId: '01a1e525-1830-71d2-a139-d3188287cf43', prompt: `${STYLE}: frosted dark steel reactor panels with cyan strips` },
];

/** Cross-fade the half-shifted copy toward the edges so the result wraps without a seam. Pure, RGB interleaved. */
export function makeTileable(rgb: Uint8Array, n: number, ch: number): Uint8Array {
  const out = new Uint8Array(rgb.length);
  const h = n >> 1;
  for (let y = 0; y < n; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * (y + 0.5)) / n);
    for (let x = 0; x < n; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * (x + 0.5)) / n);
      const w = wx * wy;
      const a = (y * n + x) * ch;
      const b = (((y + h) % n) * n + ((x + h) % n)) * ch;
      for (let c = 0; c < ch; c++) out[a + c] = Math.round(rgb[a + c] * w + rgb[b + c] * (1 - w));
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

/** Roughness: brighter pixels read as worn metal (smoother), darker as grime (rougher). Range 0.45 to 0.92. */
export function roughnessMap(lum: Float32Array, n: number): Uint8Array {
  const out = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = Math.round((0.92 - 0.47 * Math.min(1, lum[i] * 1.6)) * 255);
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const rows: { id: string; bytes: number; sha: string; spec: TextureSpec }[] = [];
  for (const spec of TEXTURES) {
    const src = join(RAW, `${spec.id}.png`);
    if (!existsSync(src)) throw new Error(`missing raw texture ${src} (gitignored; regenerate from Meshy task ${spec.taskId})`);
    const { data } = await sharp(src).resize(N, N, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const tiled = makeTileable(new Uint8Array(data), N, 3);
    const lum = luminance(tiled, N, 3);
    const files: [string, Buffer | Uint8Array, number][] = [
      [`${spec.id}.webp`, tiled, 3],
      [`${spec.id}-n.webp`, sobelNormal(lum, N, 2.2), 3],
      [`${spec.id}-r.webp`, roughnessMap(lum, N), 1],
    ];
    let bytes = 0;
    const hash = createHash('sha256');
    for (const [name, buf, channels] of files) {
      const webp = await sharp(Buffer.from(buf), { raw: { width: N, height: N, channels: channels as 1 | 3 } }).webp({ quality: name.endsWith('-n.webp') ? 88 : 82, effort: 5 }).toBuffer();
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
      role: 'Terrain surface texture: albedo + derived normal + roughness (tiling-fixed, 512 px WebP)',
      generator: 'Meshy nano-banana-2 text-to-image, tiling cross-fade + Sobel normal + luminance roughness (tools/meshy/textures.ts)',
      license: 'Private',
      pose: 'none',
      prompt: r.spec.prompt,
      taskId: r.spec.taskId,
      rawFile: `assets/meshy-raw/textures/${r.id}.png`,
      optimizedFile: `public/assets/textures/${r.id}.webp`,
      derivedFiles: [`public/assets/textures/${r.id}-n.webp`, `public/assets/textures/${r.id}-r.webp`],
      optimizedBytes: r.bytes,
      optimizedSha256: r.sha,
    });
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  const table = [
    '<!-- textures:begin -->',
    '',
    '### Terrain textures (R24, tools/meshy/textures.ts)',
    '',
    '| Id | Files (albedo, normal, roughness) | Bytes | Meshy task | Prompt |',
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

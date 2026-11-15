// R15 sample comparison: measure raw Meshy wall-panel samples and optimize them with the same steps as
// tools/meshy/terrain-kit.ts optimizeOne (weld, simplify, WebP, center, longest side = 1), with a configurable
// texture size and triangle target. Writes public/assets/models/terrain/samples/*.glb and docs/evidence/r15_meshy_terrain/samples.json.
// Usage: node tools/meshy/terrain-samples.ts
import { mkdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const RAW = join(ROOT, 'assets/meshy-raw/terrain');
const OUT = join(ROOT, 'public/assets/models/terrain/samples');
const EVID = join(ROOT, 'docs/evidence/r15_meshy_terrain');

interface Variant { name: string; raw: string; tris: number | null; tex: number; keep?: boolean }
const VARIANTS: Variant[] = [
  { name: 'a_t25', raw: 'sample_a_t25_wall_panel.glb', tris: null, tex: 512 },
  { name: 'a_t25_1k', raw: 'sample_a_t25_wall_panel.glb', tris: null, tex: 1024 },
  { name: 'b_m71', raw: 'sample_b_meshy71_wall_panel.glb', tris: null, tex: 512, keep: false },
  { name: 'b_m71_1k', raw: 'sample_b_meshy71_wall_panel.glb', tris: null, tex: 1024, keep: false },
  { name: 'b_m71_4k', raw: 'sample_b_meshy71_wall_panel.glb', tris: 4000, tex: 512 },
  { name: 'b_m71_4k_1k', raw: 'sample_b_meshy71_wall_panel.glb', tris: 4000, tex: 1024 },
];

type Doc = import('@gltf-transform/core').Document;
function countGeo(doc: Doc) {
  let vertices = 0;
  let triangles = 0;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const v = p.getAttribute('POSITION')?.getCount() ?? 0;
      const idx = p.getIndices()?.getCount() ?? 0;
      vertices += v;
      triangles += idx > 0 ? Math.floor(idx / 3) : Math.floor(v / 3);
    }
  }
  return { vertices, triangles };
}
const texInfo = (doc: Doc) =>
  doc.getRoot().listTextures().map((t) => `${t.getMimeType().replace('image/', '')} ${t.getSize()?.join('x')}`);

async function main() {
  const { NodeIO, getBounds } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { center, dedup, prune, simplify, textureCompress, weld } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  const sharp = (await import('sharp')).default;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(EVID, { recursive: true });

  const result: Record<string, unknown> = {};
  const rawSeen = new Set<string>();
  for (const v of VARIANTS) {
    const inPath = join(RAW, v.raw);
    const doc = await io.read(inPath);
    const raw = countGeo(doc);
    if (!rawSeen.has(v.raw)) {
      rawSeen.add(v.raw);
      result[v.raw] = { bytes: statSync(inPath).size, ...raw, textures: texInfo(doc) };
    }
    const ratio = v.tris ? Math.max(0.002, Math.min(1, v.tris / Math.max(1, raw.triangles))) : 1;
    // Sample A is already ~4000 tris (smart topology); only weld it unless a target is given.
    const steps = [weld()];
    if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.5, lockBorder: false }));
    steps.push(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [v.tex, v.tex], quality: 82 }),
      center({ pivot: 'below' }),
      prune(),
      dedup(),
    );
    await doc.transform(...steps);
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const b = getBounds(scene);
    const ext = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    const k = 1 / Math.max(1e-5, ...ext);
    const root = doc.createNode('NormalizedRoot');
    for (const c of scene.listChildren()) root.addChild(c);
    scene.addChild(root);
    root.setScale([k, k, k]);
    root.setTranslation([0, -b.min[1] * k, 0]);
    const outPath = join(OUT, `${v.name}.glb`);
    await io.write(outPath, doc);
    const opt = countGeo(doc);
    result[v.name] = {
      bytes: statSync(outPath).size,
      ...opt,
      textures: texInfo(doc),
      extentsRaw: ext.map((n) => +n.toFixed(3)),
    };
    if (v.keep === false) unlinkSync(outPath); // full-res B is ~9.8 MB: measured only, not shipped
    console.log(v.name, JSON.stringify(result[v.name]));
  }
  writeFileSync(join(EVID, 'samples.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('raw', JSON.stringify(Object.fromEntries([...rawSeen].map((r) => [r, result[r]]))));
}
await main();

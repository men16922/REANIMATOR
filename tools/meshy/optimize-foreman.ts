// Optimizes the static Meshy Slag Foreman (assets/meshy-raw/characters/slag-foreman-static.glb) into
// public/assets/models/foreman.glb and upserts its entry in reference/manifests/meshy-assets.json.
// Pipeline: weld -> simplify -> WebP 1024 textures -> center -> normalize height to 1 m (min.y = 0).
// The in-game Foreman animates procedurally (src/render3d/foremanMotion.ts). A manually downloaded rigged GLB can be
// dropped in later as public/assets/models/foreman-rigged.glb, see docs/reference/ASSET_REGISTER.md.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO, getBounds, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '../..');
const RAW = resolve(ROOT, 'assets/meshy-raw/characters/slag-foreman-static.glb');
const OUT = resolve(ROOT, 'public/assets/models/foreman.glb');
const MANIFEST = resolve(ROOT, 'reference/manifests/meshy-assets.json');
const TARGET_TRIS = 8000;
const MAX_BYTES = 1.5 * 1024 * 1024;

function countGeo(doc: Document): { vertices: number; triangles: number } {
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
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

if (!existsSync(RAW)) throw new Error(`missing ${RAW}`);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(RAW);
const raw = countGeo(doc);
const ratio = Math.max(0.002, Math.min(1, TARGET_TRIS / Math.max(1, raw.triangles)));
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: false }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }),
  center({ pivot: 'below' }),
  prune(),
  dedup(),
);
const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
const b = getBounds(scene);
const k = 1 / Math.max(1e-5, b.max[1] - b.min[1]);
const norm = doc.createNode('NormalizedRoot');
for (const c of scene.listChildren()) norm.addChild(c);
scene.addChild(norm);
norm.setScale([k, k, k]);
norm.setTranslation([0, -b.min[1] * k, 0]);
const fb = getBounds(scene);
await io.write(OUT, doc);
const bytes = statSync(OUT).size;
if (bytes > MAX_BYTES) throw new Error(`foreman.glb ${bytes} B exceeds cap ${MAX_BYTES}`);
const opt = countGeo(doc);

const entry = {
  id: 'foreman',
  role: 'Stage 2 mini-boss: Slag Foreman (static textured mesh, procedural animation)',
  generator: 'Meshy text-to-3D meshy-t2.5 smart topology (target 8000 tris, A-pose), PBR refine',
  license: 'Private',
  pose: 'A-pose',
  rigged: false,
  riggedTaskId: '01a1e487-6691-72c1-9713-581621b65785',
  riggedNote: 'Meshy auto-rig succeeded (2.9 m, walk/run clips) but the signed download URLs were not reachable from the build sandbox; drop a manual download in as public/assets/models/foreman-rigged.glb',
  previewTaskId: '01a1e486-4542-7679-aaa2-19ebba9bc310',
  taskId: '01a1e486-d3af-77ee-9ff1-4299e1aca7ee',
  prompt: 'Foundry brute mutant, hulking bio-mechanical humanoid creature with slag-crusted armour plates, glowing orange furnace vents in chest and back, massive forearms, hunched posture, dark iron and scorched flesh, game character, full body, A-pose, single character, no ground, no background',
  texturePrompt: 'scorched dark iron armour plates crusted with grey slag, burnt dark flesh, glowing orange furnace vents and cracks, muted palette',
  rawFile: 'assets/meshy-raw/characters/slag-foreman-static.glb',
  rawSha256: sha(RAW),
  rawBytes: statSync(RAW).size,
  rawVertices: raw.vertices,
  rawTriangles: raw.triangles,
  optimizedFile: 'public/assets/models/foreman.glb',
  optimizedSha256: sha(OUT),
  optimizedBytes: bytes,
  optimizedVertices: opt.vertices,
  optimizedTriangles: opt.triangles,
  textures: doc.getRoot().listTextures().length,
  normalizedBounds: { min: fb.min.map((n) => +n.toFixed(4)), max: fb.max.map((n) => +n.toFixed(4)) },
};
const m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { assets: { id: string }[]; generatedAt: string };
const i = m.assets.findIndex((a) => a.id === 'foreman');
if (i >= 0) m.assets[i] = entry;
else m.assets.splice(m.assets.findIndex((a) => a.id.startsWith('terrain/')) >= 0 ? m.assets.findIndex((a) => a.id.startsWith('terrain/')) : m.assets.length, 0, entry);
m.generatedAt = new Date().toISOString();
writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
console.log(`foreman: ${raw.triangles} -> ${opt.triangles} tris, ${(statSync(RAW).size / 1e6).toFixed(2)} MB -> ${(bytes / 1024).toFixed(0)} KB, bounds`, entry.normalizedBounds);

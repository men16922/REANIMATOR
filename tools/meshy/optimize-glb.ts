// Optimizes raw Meshy 7.1 .glb exports into compact web-ready 2.5D game assets in public/assets/models/.
// Pipeline: weld -> simplify (MeshoptSimplifier) -> textureCompress (512x512 WebP via sharp) -> center/normalize (height=1, min.y=0).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NodeIO, getBounds, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { center, dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

interface AssetMeta {
  id: string;
  taskId: string;
  meshyName: string;
  role: string;
  targetTris: number;
  pose: 'A-pose' | 'none';
}

const ASSETS: AssetMeta[] = [
  { id: 'operative', taskId: '01a1d9bb-d10c-71b0-b412-a0e81b545398', meshyName: 'Neon Sentinel', role: 'Player Operative', targetTris: 14000, pose: 'A-pose' },
  { id: 'warden', taskId: '01a1d9bc-7431-71ed-8892-1dc0e534bd42', meshyName: 'Embercore Titan', role: 'Sector C Core Warden Boss', targetTris: 16000, pose: 'A-pose' },
  { id: 'crawler', taskId: '01a1d9bc-727c-72f7-95f4-60d2f8579db0', meshyName: 'Ironclad Stalker', role: 'Skitter-Husk Melee Enemy', targetTris: 12000, pose: 'none' },
  { id: 'spitter', taskId: '01a1d9bc-6598-7449-b373-eba88b4ad4cf', meshyName: 'Neon Abyssal Sentinel', role: 'Spore-Sentinel Hovering Ranged Enemy', targetTris: 12000, pose: 'none' },
  { id: 'power-core', taskId: '01a1d9bc-9cb7-732b-9360-400faeb73139', meshyName: 'Arc Reactor Core', role: 'Sector C Reactor Power Core', targetTris: 10000, pose: 'none' },
  { id: 'exit-gate', taskId: '01a1d9bc-8d68-7583-9415-bdf7eaf36251', meshyName: 'Industrial Gateway', role: 'Sector D Extraction Airlock Gate', targetTris: 12000, pose: 'none' },
];

const RAW_DIR = resolve(import.meta.dirname, '../../assets/meshy-raw');
const OUT_DIR = resolve(import.meta.dirname, '../../public/assets/models');
const MANIFEST_PATH = resolve(import.meta.dirname, '../../reference/manifests/meshy-assets.json');
const MAX_BYTES = Math.round(1.5 * 1024 * 1024);

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(resolve(MANIFEST_PATH, '..'), { recursive: true });

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

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

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const manifestEntries: Record<string, unknown>[] = [];

for (const asset of ASSETS) {
  const inPath = join(RAW_DIR, `${asset.id}.glb`);
  const outPath = join(OUT_DIR, `${asset.id}.glb`);
  console.log(`Optimizing ${asset.id} from ${inPath}...`);

  const doc = await io.read(inPath);
  const rawStats = countGeo(doc);
  const rawBytes = statSync(inPath).size;

  // Compute simplification ratio to land comfortably in ~10k-18k triangles
  const ratio = Math.max(0.002, Math.min(1, asset.targetTris / Math.max(1, rawStats.triangles)));

  await doc.transform(
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio,
      error: 0.5,
      lockBorder: false,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [512, 512],
      quality: 82,
    }),
    center({ pivot: 'below' }),
    prune(),
    dedup(),
  );

  // Normalize vertical height to exactly 1.0 with min.y = 0 and centered X/Z
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) throw new Error(`Missing default scene in ${asset.id}.glb`);
  const preBounds = getBounds(scene);
  const rawHeight = Math.max(1e-5, preBounds.max[1] - preBounds.min[1]);
  const scaleFactor = 1 / rawHeight;

  const normNode = doc.createNode('NormalizedRoot');
  for (const child of scene.listChildren()) {
    normNode.addChild(child);
  }
  scene.addChild(normNode);
  normNode.setScale([scaleFactor, scaleFactor, scaleFactor]);
  normNode.setTranslation([0, -preBounds.min[1] * scaleFactor, 0]);

  const finalBounds = getBounds(scene);
  await io.write(outPath, doc);

  const outBytes = statSync(outPath).size;
  const optStats = countGeo(doc);
  if (outBytes > MAX_BYTES) {
    throw new Error(`${asset.id}.glb is ${(outBytes / 1024).toFixed(0)} KB (> 1536 KB cap)`);
  }

  const entry = {
    id: asset.id,
    role: asset.role,
    generator: 'Meshy 7.1 - Flagship (2K texture pass)',
    license: 'Private (비공식적인)',
    pose: asset.pose,
    taskId: asset.taskId,
    meshyName: asset.meshyName,
    rawFile: `assets/meshy-raw/${asset.id}.glb`,
    rawSha256: sha256(inPath),
    rawBytes,
    rawVertices: rawStats.vertices,
    rawTriangles: rawStats.triangles,
    optimizedFile: `public/assets/models/${asset.id}.glb`,
    optimizedSha256: sha256(outPath),
    optimizedBytes: outBytes,
    optimizedVertices: optStats.vertices,
    optimizedTriangles: optStats.triangles,
    textures: doc.getRoot().listTextures().length,
    normalizedBounds: {
      min: finalBounds.min.map((n) => +n.toFixed(4)),
      max: finalBounds.max.map((n) => +n.toFixed(4)),
    },
  };
  manifestEntries.push(entry);
  console.log(
    `  ${asset.id}: ${rawStats.triangles.toLocaleString()} -> ${optStats.triangles.toLocaleString()} tris | ${(rawBytes / 1e6).toFixed(1)} MB -> ${(outBytes / 1024).toFixed(0)} KB`,
  );
}

writeFileSync(
  MANIFEST_PATH,
  JSON.stringify(
    {
      schema: 'reanimator-meshy-assets-v1',
      generatedAt: new Date().toISOString(),
      classification: 'new-design (non-Abuse original 3D assets)',
      assets: manifestEntries,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Wrote ${MANIFEST_PATH}`);

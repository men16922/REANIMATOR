// Optimizes new static props (pulse-rifle, bio-barrel) and safely merges+compresses multi-clip
// rigged SkinnedMesh characters (operative, warden, bio-stalker) into public/assets/models/*.glb.
// CRITICAL: NEVER runs center(), weld(), or simplify() on SkinnedMesh characters (preserves inverseBindMatrices).
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO, type Accessor, type Document, type Node } from '@gltf-transform/core';
import { EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { center, dedup, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

interface StaticSpec {
  id: 'pulse-rifle' | 'bio-barrel';
  role: string;
  taskId: string;
  meshyName: string;
  targetTris: number;
  pivot: 'center' | 'bottom';
}

interface ClipMapping {
  canonical: 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'death';
  sourceFile: string;
}

interface RiggedSpec {
  id: 'operative' | 'warden' | 'bio-stalker';
  role: string;
  taskId: string;
  meshyName: string;
  clips: ClipMapping[];
}

const RAW_DIR = resolve(process.cwd(), 'assets/meshy-raw');
const RAW_RIGGED_DIR = resolve(RAW_DIR, 'rigged');
const OUT_DIR = resolve(process.cwd(), 'public/assets/models');
const MANIFEST_PATH = resolve(process.cwd(), 'reference/manifests/meshy-assets.json');

const STATIC_SPECS: StaticSpec[] = [
  {
    id: 'pulse-rifle',
    role: 'Heavy Plasma Pulse Rifle Weapon Prop',
    taskId: '01a1d9f7-64af-72cf-8d25-917c327763e4',
    meshyName: 'Neon Reaper',
    targetTris: 8000,
    pivot: 'center',
  },
  {
    id: 'bio-barrel',
    role: 'Explosive Bio-Hazard Reactor Barrel',
    taskId: '01a1d9f7-a3f5-700b-a25d-b98237c84b31',
    meshyName: 'Toxic Reactor Canister',
    targetTris: 7500,
    pivot: 'bottom',
  },
];

const RIGGED_SPECS: RiggedSpec[] = [
  {
    id: 'operative',
    role: 'Player Operative (Rigged + Multi-Clip)',
    taskId: '01a1d9fb-4f86-743a-9ad7-f28febe2aef7',
    meshyName: 'Neon Sentinel (30K SmartRig)',
    clips: [
      { canonical: 'idle', sourceFile: 'Animation_Combat_Stance_withSkin.glb' },
      { canonical: 'walk', sourceFile: 'Animation_Walking_man_withSkin.glb' },
      { canonical: 'run', sourceFile: 'Animation_Running_withSkin.glb' },
      { canonical: 'jump', sourceFile: 'Animation_Regular_Jump_withSkin.glb' },
      { canonical: 'attack', sourceFile: 'Animation_Attack_withSkin.glb' },
      { canonical: 'death', sourceFile: 'Animation_Dead_withSkin.glb' },
    ],
  },
  {
    id: 'warden',
    role: 'Sector C Core Warden Boss (Rigged + Multi-Clip)',
    taskId: '01a1d9fb-72e9-705f-b61d-3040157b9bd5',
    meshyName: 'Embercore Titan (30K SmartRig)',
    clips: [
      { canonical: 'idle', sourceFile: 'Animation_Alert_withSkin.glb' },
      { canonical: 'walk', sourceFile: 'Animation_Walking_man_withSkin.glb' },
      { canonical: 'run', sourceFile: 'Animation_Running_withSkin.glb' },
      { canonical: 'attack', sourceFile: 'Animation_Heavy_Hammer_Swing_withSkin.glb' },
      { canonical: 'death', sourceFile: 'Animation_Dead_withSkin.glb' },
    ],
  },
  {
    id: 'bio-stalker',
    role: 'Xenomorph Bio-Stalker Hunter (Rigged + Multi-Clip)',
    taskId: '01a1d9fc-b613-70d2-9b75-84dad49c4089',
    meshyName: 'Crimson Reaper (30K SmartRig)',
    clips: [
      { canonical: 'idle', sourceFile: 'Animation_Alert_withSkin.glb' },
      { canonical: 'walk', sourceFile: 'Animation_Walking_man_withSkin.glb' },
      { canonical: 'run', sourceFile: 'Animation_RunFast_withSkin.glb' },
      { canonical: 'attack', sourceFile: 'Animation_Triple_Combo_Attack_withSkin.glb' },
      { canonical: 'death', sourceFile: 'Animation_Dead_withSkin.glb' },
    ],
  },
];

async function sha256File(path: string): Promise<{ bytes: number; sha256: string }> {
  const buf = await readFile(path);
  return {
    bytes: buf.byteLength,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function measureStaticStats(doc: Document): {
  vertices: number;
  triangles: number;
  bounds: { min: number[]; max: number[] };
} {
  let vertices = 0;
  let triangles = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (pos) {
        vertices += pos.getCount();
        const pmin = pos.getMin([]);
        const pmax = pos.getMax([]);
        for (let k = 0; k < 3; k++) {
          if (pmin[k] < min[k]) min[k] = pmin[k];
          if (pmax[k] > max[k]) max[k] = pmax[k];
        }
      }
      const idx = prim.getIndices();
      triangles += idx ? Math.floor(idx.getCount() / 3) : pos ? Math.floor(pos.getCount() / 3) : 0;
    }
  }
  return { vertices, triangles, bounds: { min, max } };
}

function normalizeStaticGeometry(doc: Document, pivot: 'center' | 'bottom'): { min: number[]; max: number[] } {
  const { bounds } = measureStaticStats(doc);
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  const span = pivot === 'bottom' ? dy : Math.max(dx, dy, dz);
  const scale = span > 1e-6 ? 1 / span : 1;
  const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
  const cy = pivot === 'bottom' ? bounds.min[1] : (bounds.min[1] + bounds.max[1]) * 0.5;
  const cz = (bounds.min[2] + bounds.max[2]) * 0.5;

  const minOut = [Infinity, Infinity, Infinity];
  const maxOut = [-Infinity, -Infinity, -Infinity];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        const cur = pos.getElement(i, [0, 0, 0]);
        const vx = (cur[0] - cx) * scale;
        const vy = (cur[1] - cy) * scale;
        const vz = (cur[2] - cz) * scale;
        pos.setElement(i, [vx, vy, vz]);
        if (vx < minOut[0]) minOut[0] = vx;
        if (vy < minOut[1]) minOut[1] = vy;
        if (vz < minOut[2]) minOut[2] = vz;
        if (vx > maxOut[0]) maxOut[0] = vx;
        if (vy > maxOut[1]) maxOut[1] = vy;
        if (vz > maxOut[2]) maxOut[2] = vz;
      }
    }
  }
  return {
    min: minOut.map((n) => Number(n.toFixed(4))),
    max: maxOut.map((n) => Number(n.toFixed(4))),
  };
}

async function optimizeStaticProp(io: NodeIO, spec: StaticSpec) {
  const rawPath = resolve(RAW_DIR, `${spec.id}.glb`);
  const outPath = resolve(OUT_DIR, `${spec.id}.glb`);
  const doc = await io.read(rawPath);
  const rawInfo = await sha256File(rawPath);
  const rawStats = measureStaticStats(doc);
  const ratio = Math.max(0.004, Math.min(0.4, spec.targetTris / Math.max(1, rawStats.triangles)));

  await doc.transform(
    center({ pivot: spec.pivot === 'bottom' ? 'below' : 'center' }),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
    dedup(),
    prune(),
  );
  const bounds = normalizeStaticGeometry(doc, spec.pivot);
  await io.write(outPath, doc);

  const outInfo = await sha256File(outPath);
  const outStats = measureStaticStats(doc);
  console.log(
    `[static] ${spec.id}: ${(rawInfo.bytes / 1e6).toFixed(1)}MB -> ${(outInfo.bytes / 1024).toFixed(0)}KB (${outStats.triangles} tris)`,
  );
  return {
    id: spec.id,
    role: spec.role,
    generator: 'Meshy 7.1 - Flagship (WebP 512 + Meshopt)',
    license: 'Private (비공식적인)',
    pose: 'none',
    taskId: spec.taskId,
    meshyName: spec.meshyName,
    rawFile: `assets/meshy-raw/${spec.id}.glb`,
    rawSha256: rawInfo.sha256,
    rawBytes: rawInfo.bytes,
    rawVertices: rawStats.vertices,
    rawTriangles: rawStats.triangles,
    optimizedFile: `public/assets/models/${spec.id}.glb`,
    optimizedSha256: outInfo.sha256,
    optimizedBytes: outInfo.bytes,
    optimizedVertices: outStats.vertices,
    optimizedTriangles: outStats.triangles,
    textures: doc.getRoot().listTextures().length,
    normalizedBounds: bounds,
  };
}

function cloneAccessorInto(baseDoc: Document, src: Accessor, overrideArray?: Float32Array): Accessor {
  const buf = baseDoc.getRoot().listBuffers()[0] ?? baseDoc.createBuffer();
  const arr = (overrideArray ?? src.getArray()!.slice()) as Float32Array<ArrayBuffer>;
  return baseDoc
    .createAccessor()
    .setBuffer(buf)
    .setType(src.getType())
    .setNormalized(src.getNormalized())
    .setArray(arr);
}

async function optimizeRiggedCharacter(io: NodeIO, spec: RiggedSpec) {
  const basePath = resolve(RAW_RIGGED_DIR, spec.id, 'Character_output.glb');
  const outPath = resolve(OUT_DIR, `${spec.id}.glb`);
  const baseDoc = await io.read(basePath);
  const rawInfo = await sha256File(basePath);
  const rawStats = measureStaticStats(baseDoc);

  // Strip any stray animations from baseDoc before merging clean canonical clips
  for (const oldAnim of baseDoc.getRoot().listAnimations()) oldAnim.dispose();

  const nodeByName = new Map<string, Node>();
  for (const n of baseDoc.getRoot().listNodes()) {
    const nm = n.getName();
    if (nm) nodeByName.set(nm, n);
  }
  const hipsNode = nodeByName.get('mixamorig:Hips');
  if (!hipsNode) throw new Error(`Missing mixamorig:Hips in ${spec.id}`);
  const restHips = hipsNode.getTranslation();

  const embeddedClips: Array<{ name: string; durationSec: number; channels: number }> = [];

  for (const clip of spec.clips) {
    const clipPath = resolve(RAW_RIGGED_DIR, spec.id, clip.sourceFile);
    const clipDoc = await io.read(clipPath);
    const srcAnim = clipDoc.getRoot().listAnimations()[0];
    if (!srcAnim) throw new Error(`No animation found inside ${clipPath}`);

    const dstAnim = baseDoc.createAnimation(clip.canonical);
    const accessorCache = new Map<Accessor, Accessor>();
    let durationSec = 0;

    for (const ch of srcAnim.listChannels()) {
      const targetName = ch.getTargetNode()?.getName();
      const targetPath = ch.getTargetPath();
      const srcSampler = ch.getSampler();
      if (!targetName || !targetPath || !srcSampler) continue;
      const dstNode = nodeByName.get(targetName);
      if (!dstNode) continue;

      const srcIn = srcSampler.getInput();
      const srcOut = srcSampler.getOutput();
      if (!srcIn || !srcOut) continue;

      const timeArr = srcIn.getArray() as Float32Array;
      if (timeArr.length > 0 && timeArr[timeArr.length - 1] > durationSec) {
        durationSec = timeArr[timeArr.length - 1];
      }

      let dstIn = accessorCache.get(srcIn);
      if (!dstIn) {
        dstIn = cloneAccessorInto(baseDoc, srcIn);
        accessorCache.set(srcIn, dstIn);
      }

      let overrideOut: Float32Array | undefined;
      if (targetName === 'mixamorig:Hips' && targetPath === 'translation') {
        const rawArr = srcOut.getArray() as Float32Array;
        const arr = new Float32Array(rawArr);
        const x0 = arr[0];
        const z0 = arr[2];
        for (let i = 0; i < arr.length; i += 3) {
          if (clip.canonical === 'death') {
            arr[i] = restHips[0] + (arr[i] - x0) * 0.35;
            arr[i + 2] = restHips[2] + (arr[i + 2] - z0) * 0.35;
            arr[i + 1] = Math.max(0.22, arr[i + 1]);
          } else {
            // Lock X/Z to rest Hips so clip transitions never offset horizontally while preserving Y bob
            arr[i] = restHips[0];
            arr[i + 2] = restHips[2];
          }
        }
        overrideOut = arr;
      }

      let dstOut = overrideOut ? undefined : accessorCache.get(srcOut);
      if (!dstOut) {
        dstOut = cloneAccessorInto(baseDoc, srcOut, overrideOut);
        if (!overrideOut) accessorCache.set(srcOut, dstOut);
      }

      const dstSampler = baseDoc
        .createAnimationSampler()
        .setInput(dstIn)
        .setOutput(dstOut)
        .setInterpolation(srcSampler.getInterpolation());
      const dstCh = baseDoc
        .createAnimationChannel()
        .setTargetNode(dstNode)
        .setTargetPath(targetPath)
        .setSampler(dstSampler);
      dstAnim.addSampler(dstSampler);
      dstAnim.addChannel(dstCh);
    }

    embeddedClips.push({
      name: clip.canonical,
      durationSec: Number(durationSec.toFixed(3)),
      channels: dstAnim.listChannels().length,
    });
  }

  // Safely compress textures + dedup/prune unused buffers WITHOUT altering SkinnedMesh geometry/bones!
  await baseDoc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }),
    dedup(),
    prune(),
  );
  await io.write(outPath, baseDoc);

  const outInfo = await sha256File(outPath);
  const outStats = measureStaticStats(baseDoc);
  const joints = baseDoc.getRoot().listSkins().flatMap((s) => s.listJoints().map((j) => j.getName()));
  console.log(
    `[rigged] ${spec.id}: ${(rawInfo.bytes / 1e6).toFixed(1)}MB -> ${(outInfo.bytes / 1024).toFixed(0)}KB, joints=${joints.length}, clips=${embeddedClips.map((c) => `${c.name}(${c.durationSec}s)`).join(', ')}`,
  );

  return {
    id: spec.id,
    role: spec.role,
    generator: 'Meshy 7.1 SmartRig + Biped Auto-Rigging (WebP 512 + Merged Clips)',
    license: 'Private (비공식적인)',
    pose: 'Rigged SmartRigArmature',
    rigged: true,
    joints: joints.length,
    clips: embeddedClips,
    taskId: spec.taskId,
    meshyName: spec.meshyName,
    rawFile: `assets/meshy-raw/rigged/${spec.id}/Character_output.glb`,
    rawSha256: rawInfo.sha256,
    rawBytes: rawInfo.bytes,
    rawVertices: rawStats.vertices,
    rawTriangles: rawStats.triangles,
    optimizedFile: `public/assets/models/${spec.id}.glb`,
    optimizedSha256: outInfo.sha256,
    optimizedBytes: outInfo.bytes,
    optimizedVertices: outStats.vertices,
    optimizedTriangles: outStats.triangles,
    textures: baseDoc.getRoot().listTextures().length,
    normalizedBounds: {
      min: rawStats.bounds.min.map((n) => Number(n.toFixed(4))),
      max: rawStats.bounds.max.map((n) => Number(n.toFixed(4))),
    },
  };
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  await MeshoptSimplifier.ready;

  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, EXTTextureWebP])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

  const existingManifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as {
    schema: string;
    assets: Array<{ id: string }>;
  };

  const updatedEntries = new Map<string, Record<string, unknown>>();
  for (const prev of existingManifest.assets) {
    updatedEntries.set(prev.id, prev);
  }

  for (const spec of RIGGED_SPECS) {
    updatedEntries.set(spec.id, await optimizeRiggedCharacter(io, spec));
  }
  for (const spec of STATIC_SPECS) {
    updatedEntries.set(spec.id, await optimizeStaticProp(io, spec));
  }

  const orderedIds = [
    'operative',
    'warden',
    'bio-stalker',
    'pulse-rifle',
    'bio-barrel',
    'crawler',
    'spitter',
    'power-core',
    'exit-gate',
  ];
  const manifestOut = {
    schema: 'reanimator-meshy-assets-v2',
    generatedAt: new Date().toISOString(),
    classification: 'new-design (non-Abuse original 3D rigged & static assets)',
    assets: orderedIds.map((id) => updatedEntries.get(id)).filter(Boolean),
  };

  await writeFilePretty(MANIFEST_PATH, manifestOut);
  console.log(`Updated ${MANIFEST_PATH} (${manifestOut.assets.length} assets).`);
}

async function writeFilePretty(path: string, obj: unknown): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, JSON.stringify(obj, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Meshy text-to-3D terrain kit pipeline (R15). Run locally with network access:
//   node tools/meshy/terrain-kit.ts            (full run, resumable)
//   node tools/meshy/terrain-kit.ts --dry-run  (prints the plan, no network, no writes)
// Flow: balance check -> preview tasks -> refine (texture) tasks -> download GLB -> optimize -> manifest + ASSET_REGISTER.
// State (task ids only, no secrets) lives in reference/manifests/terrain-kit-state.json so a re-run resumes.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface TerrainPiece {
  id: string;
  role: string;
  prompt: string;
  texturePrompt: string;
  targetPolycount: number;
}

export interface PlanStep {
  id: string;
  rawFile: string;
  outFile: string;
  targetPolycount: number;
  prompt: string;
}

export interface PieceState {
  previewTaskId?: string;
  refineTaskId?: string;
  glbUrl?: string;
  rawFile?: string;
  optimized?: boolean;
  error?: string;
}
export type KitState = Record<string, PieceState>;

const ROOT = resolve(import.meta.dirname, '../..');
export const PATHS = {
  root: ROOT,
  env: join(ROOT, '.env'),
  state: join(ROOT, 'reference/manifests/terrain-kit-state.json'),
  manifest: join(ROOT, 'reference/manifests/meshy-assets.json'),
  register: join(ROOT, 'docs/reference/ASSET_REGISTER.md'),
  rawDir: join(ROOT, 'assets/meshy-raw/terrain'),
  outDir: join(ROOT, 'public/assets/models/terrain'),
};

const STYLE =
  'dark industrial sci-fi, worn gunmetal steel, grime and rust streaks, subtle teal and amber accent details, hard-surface, game-ready low poly modular kit piece, single object, no ground, no background';
const TEX = 'dark weathered metal, muted desaturated palette, scratches, oil stains, no bright colours';

export const TERRAIN_KIT: readonly TerrainPiece[] = [
  { id: 'wall-panel', role: 'Sci-fi wall panel', prompt: `Modular sci-fi wall panel with recessed seams, bolts and a small vent, flat rectangular slab, ${STYLE}`, texturePrompt: TEX, targetPolycount: 1500 },
  { id: 'floor-grate', role: 'Floor grate tile', prompt: `Square metal floor grate tile with diamond-pattern openings and a thick frame, ${STYLE}`, texturePrompt: TEX, targetPolycount: 1500 },
  { id: 'support-pillar', role: 'Support pillar', prompt: `Tall industrial support pillar with a base plate, rib collars and a capital bracket, ${STYLE}`, texturePrompt: TEX, targetPolycount: 2000 },
  { id: 'pipe-cluster', role: 'Pipe cluster', prompt: `Cluster of three thick industrial pipes with flanges, valves and clamps, ${STYLE}`, texturePrompt: TEX, targetPolycount: 2500 },
  { id: 'steel-girder', role: 'Steel girder', prompt: `Horizontal steel I-beam girder with rivets and cross bracing, ${STYLE}`, texturePrompt: TEX, targetPolycount: 1500 },
  { id: 'platform-edge-trim', role: 'Platform edge trim', prompt: `Long platform edge trim strip with hazard chevron plating and a raised lip, ${STYLE}`, texturePrompt: TEX, targetPolycount: 1000 },
  { id: 'mines-rock-chunk', role: 'Mines rock chunk', prompt: `Jagged dark cave rock chunk with ore veins and faceted edges, subterranean mine, matte stone, low poly, single object, no ground, no background`, texturePrompt: 'dark basalt rock, faint rust-orange ore veins, matte', targetPolycount: 1500 },
  { id: 'timber-brace', role: 'Timber brace', prompt: `Old mine timber support brace, two posts and a crossbeam with iron brackets, weathered dark wood, low poly, single object, no ground, no background`, texturePrompt: 'dark weathered timber, iron brackets, dust', targetPolycount: 1200 },
  { id: 'specimen-tank', role: 'Lab specimen tank', prompt: `Bio-lab specimen tank, cylindrical glass cylinder with steel base and cap, murky green fluid, pipes on top, ${STYLE}`, texturePrompt: `${TEX}, murky green glass`, targetPolycount: 3000 },
  { id: 'security-bulkhead-frame', role: 'Security bulkhead frame', prompt: `Heavy security bulkhead door frame with thick armoured jambs, hazard stripes and a lock housing, open doorway, ${STYLE}`, texturePrompt: TEX, targetPolycount: 3000 },
  { id: 'reactor-conduit', role: 'Reactor conduit', prompt: `Core reactor energy conduit, thick armoured cable trunk with glowing amber coupling rings and insulators, ${STYLE}`, texturePrompt: `${TEX}, faint amber glow in rings`, targetPolycount: 2500 },
];

export const CREDITS_PER_PIECE = 30; // conservative: preview + refine

export function buildPlan(kit: readonly TerrainPiece[] = TERRAIN_KIT, only?: string[]): PlanStep[] {
  const picked = only && only.length ? kit.filter((p) => only.includes(p.id)) : kit;
  return picked.map((p) => ({
    id: p.id,
    rawFile: `assets/meshy-raw/terrain/${p.id}.glb`,
    outFile: `public/assets/models/terrain/${p.id}.glb`,
    targetPolycount: p.targetPolycount,
    prompt: p.prompt,
  }));
}

export function formatPlan(plan: PlanStep[]): string {
  const lines = [
    `Terrain kit plan: ${plan.length} pieces, est. up to ${plan.length * CREDITS_PER_PIECE} credits (preview + refine each)`,
    ...plan.map((s) => `- ${s.id} (${s.targetPolycount} tris) -> ${s.outFile}\n    ${s.prompt}`),
    'Steps: balance check, preview, refine, download, optimize (weld/simplify/webp 512), manifest + ASSET_REGISTER.',
  ];
  return lines.join('\n');
}

export function parseArgs(argv: string[]): { dryRun: boolean; only: string[]; skipOptimize: boolean } {
  const only: string[] = [];
  let dryRun = false;
  let skipOptimize = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--skip-optimize') skipOptimize = true;
    else if (argv[i] === '--only' && argv[i + 1]) only.push(...argv[++i].split(','));
  }
  return { dryRun, only, skipOptimize };
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function registerSection(rows: { id: string; outFile: string; bytes: number; tris: number; taskId: string; prompt: string }[]): string {
  const body = rows.map(
    (r) => `| \`terrain/${r.id}\` | \`${r.outFile}\` | ${r.bytes.toLocaleString('en-US')} B / ${r.tris.toLocaleString('en-US')} | Meshy text-to-3D (refine \`${r.taskId.slice(0, 8)}…\`) | ${r.prompt.replace(/\|/g, '/')} |`,
  );
  return [
    '<!-- terrain-kit:begin -->',
    '',
    '### Terrain kit (R15, tools/meshy/terrain-kit.ts)',
    '',
    '| id | 경로 | 크기 / tris | 생성 | prompt |',
    '|---|---|---|---|---|',
    ...body,
    '',
    '<!-- terrain-kit:end -->',
  ].join('\n');
}

function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const API = 'https://api.meshy.ai/openapi';

async function api<T>(key: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Meshy ${path} -> HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

interface TaskInfo {
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  progress?: number;
  model_urls?: { glb?: string };
  task_error?: { message?: string };
}

async function waitTask(key: string, taskId: string): Promise<TaskInfo> {
  for (;;) {
    const t = await api<TaskInfo>(key, `/v2/text-to-3d/${taskId}`);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`task ${taskId} ${t.status}: ${t.task_error?.message ?? ''}`);
    await sleep(10_000);
  }
}

function countGeo(doc: import('@gltf-transform/core').Document): { vertices: number; triangles: number } {
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

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

// Same steps as tools/meshy/optimize-glb.ts (weld, simplify, webp 512, center), but per piece and without
// touching that script's hard-coded asset list or rewriting the manifest. Longest extent is normalized to 1 m units.
async function optimizeOne(step: PlanStep) {
  const { NodeIO, getBounds } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { center, dedup, prune, simplify, textureCompress, weld } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  const sharp = (await import('sharp')).default;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const inPath = join(PATHS.root, step.rawFile);
  const outPath = join(PATHS.root, step.outFile);
  const doc = await io.read(inPath);
  const raw = countGeo(doc);
  const ratio = Math.max(0.002, Math.min(1, step.targetPolycount / Math.max(1, raw.triangles)));
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.5, lockBorder: false }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
    center({ pivot: 'below' }),
    prune(),
    dedup(),
  );
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const longest = Math.max(1e-5, b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const k = 1 / longest;
  const root = doc.createNode('NormalizedRoot');
  for (const c of scene.listChildren()) root.addChild(c);
  scene.addChild(root);
  root.setScale([k, k, k]);
  root.setTranslation([0, -b.min[1] * k, 0]);
  const fb = getBounds(scene);
  await io.write(outPath, doc);
  const opt = countGeo(doc);
  return {
    rawBytes: statSync(inPath).size,
    rawSha256: sha256(inPath),
    rawTriangles: raw.triangles,
    optimizedBytes: statSync(outPath).size,
    optimizedSha256: sha256(outPath),
    optimizedTriangles: opt.triangles,
    optimizedVertices: opt.vertices,
    textures: doc.getRoot().listTextures().length,
    normalizedBounds: { min: fb.min.map((n) => +n.toFixed(4)), max: fb.max.map((n) => +n.toFixed(4)) },
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildPlan(TERRAIN_KIT, args.only);
  console.log(formatPlan(plan));
  if (args.dryRun) {
    console.log('\n--dry-run: no network, no files written.');
    return;
  }
  const key = process.env.MESHY_API_KEY || parseEnv(existsSync(PATHS.env) ? readFileSync(PATHS.env, 'utf8') : '').MESHY_API_KEY;
  if (!key) throw new Error('MESHY_API_KEY missing (set it in .env or the environment)');

  const state = readJson<KitState>(PATHS.state, {});
  const save = () => {
    mkdirSync(resolve(PATHS.state, '..'), { recursive: true });
    writeFileSync(PATHS.state, JSON.stringify(state, null, 2) + '\n');
  };

  const { balance } = await api<{ balance: number }>(key, '/v1/balance');
  const pending = plan.filter((s) => !state[s.id]?.optimized);
  const needed = pending.filter((s) => !state[s.id]?.refineTaskId).length * CREDITS_PER_PIECE;
  console.log(`Balance: ${balance} credits, up to ${needed} needed for remaining pieces.`);
  if (balance < needed) throw new Error(`Insufficient credits (${balance} < ${needed}). Use --only <ids> to run a subset.`);

  mkdirSync(PATHS.rawDir, { recursive: true });
  mkdirSync(PATHS.outDir, { recursive: true });
  const byId = new Map(TERRAIN_KIT.map((p) => [p.id, p]));

  // 1) queue previews
  for (const s of pending) {
    const st = (state[s.id] ??= {});
    if (st.previewTaskId || st.refineTaskId) continue;
    const r = await api<{ result: string }>(key, '/v2/text-to-3d', {
      mode: 'preview',
      prompt: s.prompt,
      target_polycount: s.targetPolycount,
      topology: 'triangle',
      should_remesh: true,
    });
    st.previewTaskId = r.result;
    save();
    console.log(`queued preview ${s.id}: ${r.result}`);
  }

  // 2) refine (texture) once preview succeeded, 3) download
  for (const s of pending) {
    const st = state[s.id];
    const piece = byId.get(s.id)!;
    try {
      if (!st.refineTaskId) {
        await waitTask(key, st.previewTaskId!);
        const r = await api<{ result: string }>(key, '/v2/text-to-3d', {
          mode: 'refine',
          preview_task_id: st.previewTaskId,
          enable_pbr: false,
          texture_prompt: piece.texturePrompt,
        });
        st.refineTaskId = r.result;
        save();
        console.log(`queued refine ${s.id}: ${r.result}`);
      }
      if (!st.rawFile) {
        const t = await waitTask(key, st.refineTaskId);
        const url = t.model_urls?.glb;
        if (!url) throw new Error('no glb url in finished task');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download HTTP ${res.status}`);
        writeFileSync(join(PATHS.root, s.rawFile), Buffer.from(await res.arrayBuffer()));
        st.rawFile = s.rawFile;
        delete st.error;
        save();
        console.log(`downloaded ${s.id}`);
      }
    } catch (e) {
      st.error = (e as Error).message;
      save();
      console.error(`FAILED ${s.id}: ${st.error}`);
    }
  }

  if (args.skipOptimize) return console.log('--skip-optimize: stopping before optimize.');

  // 4) optimize + manifest + register
  const manifest = readJson<{ schema: string; assets: Record<string, unknown>[] }>(PATHS.manifest, { schema: 'reanimator-meshy-assets-v2', assets: [] });
  const rows: Parameters<typeof registerSection>[0] = [];
  for (const s of plan) {
    const st = state[s.id];
    if (!st?.rawFile) continue;
    const o = await optimizeOne(s);
    st.optimized = true;
    save();
    const piece = byId.get(s.id)!;
    const entry = {
      id: `terrain/${s.id}`,
      role: `Terrain kit: ${piece.role}`,
      generator: 'Meshy text-to-3D (preview + refine, no PBR), WebP 512 + weld/simplify',
      license: 'Private',
      pose: 'none',
      prompt: s.prompt,
      taskId: st.refineTaskId,
      previewTaskId: st.previewTaskId,
      targetPolycount: s.targetPolycount,
      rawFile: s.rawFile,
      ...o,
      optimizedFile: s.outFile,
    };
    manifest.assets = manifest.assets.filter((a) => a.id !== entry.id);
    manifest.assets.push(entry);
    rows.push({ id: s.id, outFile: s.outFile, bytes: o.optimizedBytes, tris: o.optimizedTriangles, taskId: st.refineTaskId!, prompt: s.prompt });
    console.log(`  ${s.id}: ${o.rawTriangles} -> ${o.optimizedTriangles} tris | ${(o.optimizedBytes / 1024).toFixed(0)} KB`);
  }
  manifest.schema = 'reanimator-meshy-assets-v2';
  (manifest as Record<string, unknown>).generatedAt = new Date().toISOString();
  writeFileSync(PATHS.manifest, JSON.stringify(manifest, null, 2) + '\n');

  const reg = readFileSync(PATHS.register, 'utf8');
  const section = registerSection(rows);
  const re = /<!-- terrain-kit:begin -->[\s\S]*<!-- terrain-kit:end -->/;
  writeFileSync(PATHS.register, re.test(reg) ? reg.replace(re, () => section) : `${reg.trimEnd()}\n\n${section}\n`);
  const failed = plan.filter((s) => state[s.id]?.error).map((s) => s.id);
  console.log(failed.length ? `Done with failures: ${failed.join(', ')} (re-run to resume).` : 'Done. Next: review GLBs, then wire into the renderer.');
}

if (import.meta.main) {
  run().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
}

// Downloads all 6 textured Meshy 7.1 .glb models via XHR asset-url capture into assets/meshy-raw/.
// Avoids Chrome's multiple-download blocker while using the user's real authenticated Meshy session.
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

interface TargetAsset {
  id: string;
  taskId: string;
  cardIdx: number;
  expectedName: string;
}

const TARGETS: TargetAsset[] = [
  { id: 'power-core', taskId: '01a1d9bc-9cb7-732b-9360-400faeb73139', cardIdx: 0, expectedName: 'Arc Reactor Core' },
  { id: 'exit-gate', taskId: '01a1d9bc-8d68-7583-9415-bdf7eaf36251', cardIdx: 1, expectedName: 'Industrial Gateway' },
  { id: 'warden', taskId: '01a1d9bc-7431-71ed-8892-1dc0e534bd42', cardIdx: 2, expectedName: 'Embercore Titan' },
  { id: 'crawler', taskId: '01a1d9bc-727c-72f7-95f4-60d2f8579db0', cardIdx: 3, expectedName: 'Ironclad Stalker' },
  { id: 'spitter', taskId: '01a1d9bc-6598-7449-b373-eba88b4ad4cf', cardIdx: 4, expectedName: 'Neon Abyssal Sentinel' },
  { id: 'operative', taskId: '01a1d9bb-d10c-71b0-b412-a0e81b545398', cardIdx: 10, expectedName: 'Neon Sentinel' },
];

const DOWNLOADS_DIR = join(homedir(), 'Downloads');
const RAW_DIR = resolve(import.meta.dirname, '../../assets/meshy-raw');
mkdirSync(RAW_DIR, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function evalBrowser<T = unknown>(expr: string): Promise<T> {
  const res = await fetch('http://127.0.0.1:49222/eval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expr }),
  });
  const json = (await res.json()) as { ok?: boolean; result?: T; error?: string };
  if (!json.ok) throw new Error(`CDP eval failed: ${json.error ?? JSON.stringify(json)}`);
  return json.result as T;
}

function moveFile(src: string, dst: string) {
  try {
    renameSync(src, dst);
  } catch {
    copyFileSync(src, dst);
    unlinkSync(src);
  }
}

// Reclaim any already-downloaded raw GLBs from ~/Downloads if present
for (const f of readdirSync(DOWNLOADS_DIR)) {
  if (!/^Meshy_AI_.*_texture\.glb$/i.test(f)) continue;
  const full = join(DOWNLOADS_DIR, f);
  if (/Arc_Reactor_Core/i.test(f) && !existsSync(join(RAW_DIR, 'power-core.glb'))) {
    moveFile(full, join(RAW_DIR, 'power-core.glb'));
  } else if (/Industrial_Gateway/i.test(f)) {
    if (!existsSync(join(RAW_DIR, 'exit-gate.glb'))) moveFile(full, join(RAW_DIR, 'exit-gate.glb'));
    else unlinkSync(full);
  }
}

// Install idempotent XHR hook for Meshy asset-url responses
await evalBrowser(`
  if (!window.__xhrHooked) {
    window.__xhrHooked = true;
    window.__capturedUrls = [];
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u, ...rest) {
      this.__url = String(u);
      this.addEventListener('load', () => {
        if (this.__url.includes('asset-url')) {
          try {
            window.__capturedUrls.push({ req: this.__url, res: JSON.parse(this.responseText) });
          } catch {}
        }
      });
      return origOpen.call(this, m, u, ...rest);
    };
  }
  return Array.isArray(window.__capturedUrls) ? window.__capturedUrls.length : 0;
`);

// Verify workspace task mapping before downloading
const tasks = await evalBrowser<{ idx: number; id: string; name: string; status: string; phase: string }[]>(`
  const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
  const fk = Object.keys(cards[0]).find(k => k.startsWith('__reactFiber'));
  let cur = cards[0][fk];
  while (cur && !cur.memoizedProps?.tasks) cur = cur.return;
  return cur.memoizedProps.tasks.slice(0, 12).map((t, idx) => ({
    idx,
    id: t.originalTask?.id || '',
    name: t.originalTask?.name || '',
    status: t.status,
    phase: t.phase,
  }));
`);

async function downloadSignedUrl(url: string, dstPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN fetch ${res.status} ${res.statusText} for ${dstPath}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dstPath, buf);
}

for (const tgt of TARGETS) {
  const dstPath = join(RAW_DIR, `${tgt.id}.glb`);
  if (existsSync(dstPath) && statSync(dstPath).size > 100_000) {
    console.log(`Already present: ${tgt.id}.glb (${(statSync(dstPath).size / 1e6).toFixed(1)} MB)`);
    continue;
  }
  const info = tasks[tgt.cardIdx];
  if (!info || info.id !== tgt.taskId || info.name !== tgt.expectedName || info.status !== 'SUCCEEDED' || info.phase !== 'texture') {
    throw new Error(`Unexpected card at index ${tgt.cardIdx} for ${tgt.id}: ${JSON.stringify(info)}`);
  }

  // Check if already captured in window.__capturedUrls (e.g. exit-gate from prior test)
  let signedUrl = await evalBrowser<string | null>(`
    const found = (window.__capturedUrls || []).find(x => x.req.includes(${JSON.stringify(tgt.taskId)}) && x.res?.code === 'OK' && typeof x.res?.result === 'string');
    return found ? found.res.result : null;
  `);

  if (!signedUrl) {
    // Close any lingering dialog
    await evalBrowser(`
      if (document.querySelector('[role="dialog"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
      return true;
    `);
    await sleep(300);

    // Select card in viewer
    await evalBrowser(`
      const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
      const sel = cards[${tgt.cardIdx}].querySelector('[data-testid="assets-card-select"]');
      if (!sel) throw new Error('missing assets-card-select');
      sel.click();
      return true;
    `);
    await sleep(1200);

    // Open download modal
    await evalBrowser(`
      const btn = document.querySelector('[data-testid="viewer-download-btn"]');
      if (!btn) throw new Error('missing viewer-download-btn');
      btn.click();
      return true;
    `);
    await sleep(700);

    // Ensure glb format selected
    const curFmt = await evalBrowser<string>(`
      return document.querySelector('[data-testid="download-format-btn"]')?.innerText?.trim() || '';
    `);
    if (curFmt !== 'glb') {
      await evalBrowser(`
        const btn = document.querySelector('[data-testid="download-format-btn"]');
        btn.focus();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        btn.click();
        return true;
      `);
      await sleep(400);
      await evalBrowser(`
        const opt = document.querySelector('[data-testid="download-format-option-glb"]');
        if (!opt) throw new Error('missing download-format-option-glb');
        opt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        opt.click();
        return true;
      `);
      await sleep(400);
    }

    const finalFmt = await evalBrowser<string>(`
      return document.querySelector('[data-testid="download-format-btn"]')?.innerText?.trim() || '';
    `);
    if (finalFmt !== 'glb') {
      throw new Error(`Failed to select glb format for ${tgt.id}; got ${finalFmt}`);
    }

    await evalBrowser(`
      const confirm = document.querySelector('[data-testid="download-confirm-btn"]');
      if (!confirm) throw new Error('missing download-confirm-btn');
      confirm.click();
      return true;
    `);

    for (let i = 0; i < 60; i++) {
      await sleep(500);
      signedUrl = await evalBrowser<string | null>(`
        const found = (window.__capturedUrls || []).find(x => x.req.includes(${JSON.stringify(tgt.taskId)}) && x.res?.code === 'OK' && typeof x.res?.result === 'string');
        return found ? found.res.result : null;
      `);
      if (signedUrl) break;
    }
    if (!signedUrl) {
      throw new Error(`Timed out waiting for asset-url XHR of ${tgt.id}`);
    }
  }

  console.log(`Fetching CDN GLB for ${tgt.id}...`);
  await downloadSignedUrl(signedUrl, dstPath);
  console.log(`Saved ${tgt.id}.glb (${(statSync(dstPath).size / 1e6).toFixed(1)} MB)`);
  await sleep(500);
}

// Clean up any duplicate Meshy_AI_*_texture.glb Chrome might have saved alongside XHR capture
for (const f of readdirSync(DOWNLOADS_DIR)) {
  if (/^Meshy_AI_.*_texture\.glb$/i.test(f)) {
    try { unlinkSync(join(DOWNLOADS_DIR, f)); } catch {}
  }
}

// Validate every raw .glb contains meshes and embedded textures
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const summary: { id: string; bytes: number; meshes: number; textures: number; vertices: number }[] = [];
for (const tgt of TARGETS) {
  const path = join(RAW_DIR, `${tgt.id}.glb`);
  const doc = await io.read(path);
  const root = doc.getRoot();
  const meshes = root.listMeshes().length;
  const textures = root.listTextures().length;
  let vertices = 0;
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) {
      vertices += p.getAttribute('POSITION')?.getCount() ?? 0;
    }
  }
  if (meshes < 1 || textures < 1) {
    throw new Error(`Asset ${tgt.id}.glb failed validation (meshes=${meshes}, textures=${textures})`);
  }
  summary.push({ id: tgt.id, bytes: statSync(path).size, meshes, textures, vertices });
}
console.log(JSON.stringify({ status: 'OK', assets: summary }, null, 2));

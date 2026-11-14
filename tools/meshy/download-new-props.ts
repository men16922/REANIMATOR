import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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
  if (!json.ok) throw new Error(json.error ?? JSON.stringify(json));
  return json.result as T;
}

const PROPS = [
  { id: 'pulse-rifle', taskId: '01a1d9f7-64af-72cf-8d25-917c327763e4', expectedName: 'Neon Reaper' },
  { id: 'bio-barrel', taskId: '01a1d9f7-a3f5-700b-a25d-b98237c84b31', expectedName: 'Toxic Reactor Canister' },
];

for (const prop of PROPS) {
  const dstPath = join(RAW_DIR, `${prop.id}.glb`);
  if (existsSync(dstPath) && statSync(dstPath).size > 100_000) {
    console.log(`Already present: ${prop.id}.glb`);
    continue;
  }

  let signedUrl = await evalBrowser<string | null>(`
    const found = (window.__capturedUrls || []).find(x => x.req.includes(${JSON.stringify(prop.taskId)}) && x.res?.code === 'OK' && typeof x.res?.result === 'string');
    return found ? found.res.result : null;
  `);

  if (!signedUrl) {
    await evalBrowser(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
      const fk = Object.keys(cards[0]).find(k => k.startsWith('__reactFiber'));
      let cur = cards[0][fk];
      while (cur && !cur.memoizedProps?.tasks) cur = cur.return;
      const tasks = cur.memoizedProps.tasks;
      const idx = tasks.findIndex(t => (t.originalTask?.id || t.id) === ${JSON.stringify(prop.taskId)});
      if (idx < 0) throw new Error('card not found');
      cards[idx].querySelector('[data-testid="assets-card-select"]').click();
      return true;
    `);
    await sleep(1400);

    await evalBrowser(`
      const btn = document.querySelector('[data-testid="viewer-download-btn"]');
      if (!btn) throw new Error('missing viewer-download-btn');
      btn.click();
      return true;
    `);
    await sleep(700);

    const fmt = await evalBrowser<string>(`return document.querySelector('[data-testid="download-format-btn"]')?.innerText?.trim() || '';`);
    if (fmt !== 'glb') {
      await evalBrowser(`
        const btn = document.querySelector('[data-testid="download-format-btn"]');
        btn.focus();
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        btn.click();
        return true;
      `);
      await sleep(300);
      await evalBrowser(`
        const opt = document.querySelector('[data-testid="download-format-option-glb"]');
        if (!opt) throw new Error('missing download-format-option-glb');
        opt.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        opt.click();
        return true;
      `);
      await sleep(300);
    }

    await evalBrowser(`document.querySelector('[data-testid="download-confirm-btn"]').click(); return true;`);

    for (let i = 0; i < 60; i++) {
      await sleep(500);
      signedUrl = await evalBrowser<string | null>(`
        const found = (window.__capturedUrls || []).find(x => x.req.includes(${JSON.stringify(prop.taskId)}) && x.res?.code === 'OK' && typeof x.res?.result === 'string');
        return found ? found.res.result : null;
      `);
      if (signedUrl) break;
    }
    if (!signedUrl) throw new Error(`Timed out waiting for ${prop.id} asset-url`);
  }

  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`CDN fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dstPath, buf);
  console.log(`Saved ${prop.id}.glb (${(buf.length / 1e6).toFixed(1)} MB)`);
  await evalBrowser(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); return true;`);
  await sleep(400);
}

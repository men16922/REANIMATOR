// Runs Biped Auto-Rigging via Meshy CDP bridge for operative (30K), warden (30K), and bio-stalker (30K).
import { resolve } from 'node:path';

const SCRATCH = '/Users/men1692/.gemini/antigravity-cli/brain/cfd514a8-c51e-44ec-b9e3-f8bf4cf035a0/scratch';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:49222${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

async function evalBrowser<T = unknown>(expr: string): Promise<T> {
  const json = await post<{ ok?: boolean; result?: T; error?: string }>('/eval', { expr });
  if (!json.ok) throw new Error(json.error ?? JSON.stringify(json));
  return json.result as T;
}

// 1. Confirm current open Neon Sentinel step 3
const st0 = (await fetch('http://127.0.0.1:49222/status').then((r) => r.json())) as { credits: number };
console.log('Start credits:', st0.credits);
if (st0.credits < 400) throw new Error('Credits < 400');

const hasConfirm = await evalBrowser<boolean>(`return !!document.querySelector('[data-testid="animate-confirm-btn"]');`);
if (hasConfirm) {
  await evalBrowser(`document.querySelector('[data-testid="animate-confirm-btn"]').click(); return true;`);
  console.log('Confirmed rig for operative (30K)');
  await sleep(2200);
}

const OTHER_BIPEDS = [
  { id: 'warden', taskId: '01a1d9f7-acd9-74f5-add9-45733274363e' },
  { id: 'bio-stalker', taskId: '01a1d9f8-51e7-75f0-bd6d-d6c649a56a9c' },
];

for (const b of OTHER_BIPEDS) {
  const st = (await fetch('http://127.0.0.1:49222/status').then((r) => r.json())) as { credits: number };
  if (typeof st.credits === 'number' && st.credits < 400) {
    throw new Error(`Credit floor reached (${st.credits})`);
  }

  await evalBrowser(`
    document.querySelector('[data-testid="workspace-sidebar-animate-btn"]')?.click();
    const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
    const fk = Object.keys(cards[0]).find(k => k.startsWith('__reactFiber'));
    let cur = cards[0][fk];
    while (cur && !cur.memoizedProps?.tasks) cur = cur.return;
    const idx = cur.memoizedProps.tasks.findIndex(t => (t.originalTask?.id || t.id) === ${JSON.stringify(b.taskId)});
    if (idx < 0) throw new Error('Task not found: ' + ${JSON.stringify(b.taskId)});
    cards[idx].querySelector('[data-testid="assets-card-select"]').click();
    return idx;
  `);
  await sleep(1600);

  await evalBrowser(`document.querySelector('[data-testid="animate-rig-btn"]').click(); return true;`);
  await sleep(1400);

  // Step 1 -> continue (Biped is default)
  const step1 = await evalBrowser<boolean>(`
    const btn = [...document.querySelectorAll('button')].find(el => el.innerText.includes('계속'));
    if (!btn) return false;
    btn.click();
    return true;
  `);
  if (!step1) throw new Error(`Missing step 1 계속 button for ${b.id}`);
  await sleep(1400);

  // Step 2 -> next (alignment)
  await evalBrowser(`document.querySelector('[data-testid="animate-next-btn"]').click(); return true;`);
  await sleep(1600);

  await post('/screenshot', { outPath: resolve(SCRATCH, `meshy_rig_markers_${b.id}.png`) });

  // Step 3 -> confirm rig
  await evalBrowser(`document.querySelector('[data-testid="animate-confirm-btn"]').click(); return true;`);
  console.log(`Confirmed rig for ${b.id} (${b.taskId})`);
  await sleep(2200);
}

// Wait briefly and print top animate tasks
await sleep(2500);
const top = await evalBrowser(`
  const cards = [...document.querySelectorAll('[data-testid="assets-card"]')];
  const fk = Object.keys(cards[0]).find(k => k.startsWith('__reactFiber'));
  let cur = cards[0][fk];
  while (cur && !cur.memoizedProps?.tasks) cur = cur.return;
  return cur.memoizedProps.tasks.slice(0, 10).map((t, i) => ({
    i, id: t.originalTask?.id || t.id, name: t.originalTask?.name, phase: t.phase, status: t.status, progress: t.progress,
  }));
`);
const endCred = await fetch('http://127.0.0.1:49222/status').then((r) => r.json());
console.log('End status:', JSON.stringify(endCred));
console.log('Top tasks:', JSON.stringify(top, null, 2));

// Queues the 3 new 3D assets (bio-stalker A-pose, pulse-rifle, bio-barrel) into Meshy via CDP bridge.
import { readFileSync } from 'node:fs';

interface JobSpec {
  id: string;
  file: string;
  useAPose: boolean;
}

const JOBS: JobSpec[] = [
  { id: 'bio-stalker', file: 'assets/meshy-raw/concepts/bio-stalker.png', useAPose: true },
  { id: 'pulse-rifle', file: 'assets/meshy-raw/concepts/pulse-rifle.png', useAPose: false },
  { id: 'bio-barrel', file: 'assets/meshy-raw/concepts/bio-barrel.png', useAPose: false },
];

async function post<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:49222${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ensure Model sidebar is active
await post('/eval', {
  expr: `
    document.querySelector('[data-testid="workspace-sidebar-model-btn"]')?.click();
    return true;
  `,
});
await sleep(800);

for (const job of JOBS) {
  const status = (await fetch('http://127.0.0.1:49222/status').then((r) => r.json())) as { credits: number | null };
  if (typeof status.credits === 'number' && status.credits < 440) {
    throw new Error(`Credit cap reached (${status.credits} < 440); stopping before ${job.id}`);
  }

  const prevUpload = await post<{ result: string | null }>('/eval', {
    expr: `return document.querySelector("img[alt=image]")?.src || null;`,
  });

  const b64 = readFileSync(job.file).toString('base64');
  await post('/eval', {
    expr: `
      const b64 = ${JSON.stringify(b64)};
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], ${JSON.stringify(job.id + '.png')}, { type: "image/png" }));
      const input = document.querySelector("input[type=file]");
      if (!input) throw new Error("missing input[type=file]");
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    `,
  });

  let uploaded = false;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    const cur = await post<{ result: string | null }>('/eval', {
      expr: `return document.querySelector("img[alt=image]")?.src || null;`,
    });
    if (cur.result && cur.result !== prevUpload.result) {
      uploaded = true;
      break;
    }
  }
  if (!uploaded) throw new Error(`Upload preview did not update for ${job.id}`);

  await post('/eval', {
    expr: `
      const ensureClick = (sel) => {
        const el = document.querySelector(sel);
        if (el && el.getAttribute('aria-checked') !== 'true') el.click();
      };
      ensureClick('[data-testid="workspace-model-type-standard"]');
      ensureClick('[data-testid="workspace-ultra-mode-standard-btn"]');
      ensureClick('[data-testid="workspace-auto-texture-toggle"]');
      ensureClick('[data-testid="workspace-auto-texture-model-meshy-7-btn"]');
      ensureClick('[data-testid="workspace-license-private-btn"]');

      const poseSw = document.querySelector('[data-testid="workspace-pose-toggle-btn"]');
      const wantPose = ${JSON.stringify(job.useAPose)};
      if (poseSw && (poseSw.getAttribute('aria-checked') === 'true') !== wantPose) {
        poseSw.click();
      }
      return true;
    `,
  });
  await sleep(300);

  if (job.useAPose) {
    await post('/eval', {
      expr: `
        const ap = document.querySelector('[data-testid="workspace-pose-a-btn"]');
        if (ap && ap.getAttribute('aria-checked') !== 'true') ap.click();
        return true;
      `,
    });
    await sleep(200);
  }

  const clickRes = await post<{ result: { ok: boolean; reason?: string } }>('/eval', {
    expr: `
      const btn = document.querySelector('[data-testid="workspace-generate-btn"]');
      if (!btn || btn.disabled) return { ok: false, reason: "generate button disabled or missing" };
      btn.click();
      return { ok: true };
    `,
  });
  if (!clickRes.result.ok) {
    throw new Error(`Could not trigger generation for ${job.id}: ${clickRes.result.reason}`);
  }
  await sleep(2000);

  const state = await post<{ result: { toasts: string[]; credits: string | null } }>('/eval', {
    expr: `
      const toasts = [...document.querySelectorAll("[role=status], [data-sonner-toast]")].map(t => t.innerText.trim()).filter(Boolean);
      const cred = [...document.querySelectorAll("button")].find(b => /^\\d+$/.test(b.innerText.trim()))?.innerText?.trim() || null;
      return { toasts, credits: cred };
    `,
  });
  console.log(`Queued ${job.id}:`, JSON.stringify(state.result));
}

await post('/screenshot', {
  outPath: '/Users/men1692/.gemini/antigravity-cli/brain/cfd514a8-c51e-44ec-b9e3-f8bf4cf035a0/scratch/meshy_queued_new3d.png',
});

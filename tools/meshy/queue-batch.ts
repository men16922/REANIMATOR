// Queues the remaining REANIMATOR 3D assets into Meshy 7.1 via the persistent CDP bridge.
import { readFileSync } from 'node:fs';

interface JobSpec {
  id: string;
  file: string;
  useAPose: boolean;
}

const JOBS: JobSpec[] = [
  { id: 'warden', file: 'assets/meshy-raw/concepts/warden.png', useAPose: true },
  { id: 'crawler', file: 'assets/meshy-raw/concepts/crawler.png', useAPose: false },
  { id: 'spitter', file: 'assets/meshy-raw/concepts/spitter.png', useAPose: false },
  { id: 'power-core', file: 'assets/meshy-raw/concepts/power-core.png', useAPose: false },
  { id: 'exit-gate', file: 'assets/meshy-raw/concepts/exit-gate.png', useAPose: false },
];

async function post<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:49222${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const job of JOBS) {
  const status = await fetch('http://127.0.0.1:49222/status').then((r) => r.json()) as { credits: number };
  if (typeof status.credits === 'number' && status.credits < 640) {
    throw new Error(`Credit cap reached (${status.credits}); stopping before ${job.id}`);
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

  // Wait for new uploaded image src to settle
  let uploaded = false;
  for (let i = 0; i < 20; i++) {
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

  // Configure switches: texture ON, pose ON/OFF per job, private license
  await post('/eval', {
    expr: `
      const clickRadio = (txt) => {
        const b = [...document.querySelectorAll("button[role=radio]")].find(el => el.innerText.trim() === txt);
        if (b && b.getAttribute("aria-checked") !== "true") b.click();
      };
      clickRadio("높은 디테일");
      clickRadio("표준");
      clickRadio("비공식적인");
      const switches = [...document.querySelectorAll("[role=switch]")];
      const texSw = switches.find(s => /텍스처/.test(s.parentElement?.parentElement?.innerText || ""));
      if (texSw && texSw.getAttribute("aria-checked") !== "true") texSw.click();
      const poseSw = switches.find(s => /포즈/.test(s.parentElement?.parentElement?.innerText || ""));
      const wantPose = ${JSON.stringify(job.useAPose)};
      if (poseSw && (poseSw.getAttribute("aria-checked") === "true") !== wantPose) poseSw.click();
      if (wantPose) {
        const ap = [...document.querySelectorAll("button[role=radio]")].find(el => el.innerText.trim() === "A-포즈");
        if (ap && ap.getAttribute("aria-checked") !== "true") ap.click();
      }
      return true;
    `,
  });
  await sleep(400);

  const clickRes = await post<{ result: { ok: boolean; reason?: string } }>('/eval', {
    expr: `
      const btn = [...document.querySelectorAll("button")].find(b => b.innerText.includes("생성하기") && !b.disabled);
      if (!btn) return { ok: false, reason: "generate button disabled or missing" };
      btn.click();
      return { ok: true };
    `,
  });
  if (!clickRes.result.ok) {
    throw new Error(`Could not trigger generation for ${job.id}: ${clickRes.result.reason}`);
  }
  await sleep(1800);

  // Check if any toast indicated queue full or error
  const state = await post<{ result: { bodyHead: string; credits: string | undefined } }>('/eval', {
    expr: `
      const toasts = [...document.querySelectorAll("[role=status], [data-sonner-toast]")].map(t => t.innerText.trim()).filter(Boolean);
      const cred = [...document.querySelectorAll("button")].find(b => /^\\d+$/.test(b.innerText.trim()))?.innerText?.trim();
      return { toasts, credits: cred };
    `,
  });
  console.log(`Queued ${job.id}:`, JSON.stringify(state.result));
}

await post('/screenshot', {
  outPath: '/Users/men1692/.gemini/antigravity-cli/brain/cfd514a8-c51e-44ec-b9e3-f8bf4cf035a0/scratch/meshy_queued_all.png',
});

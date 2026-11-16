// Live enemy motion sampler: runs the built app (dist-debug/) in Chrome, lets the bot play one sim tick per rendered frame,
// and reads the displayed enemy x (telemetry enemyRender) and the sim x (snapshot enemySim) every frame. Reports, per
// kind, for floor foes in 'chase': largest per-frame display and sim step, display pops (> 0.2 m), display step sign
// flips, and the largest display-to-sim gap.
// Usage: node tools/smoke/enemy-live.ts [distDir] [fromTick] [toTick]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../../dist-debug'));
const fromTick = Number(process.argv[3] ?? 1900);
const toTick = Number(process.argv[4] ?? 3200);
if (!existsSync(resolve(root, 'index.html'))) {
  console.log(JSON.stringify({ status: 'NOT RUN', reason: `${root}/index.html missing` }));
  process.exit(2);
}
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch (e) {
  console.log(JSON.stringify({ status: 'NOT RUN', reason: String(e).split('\n')[0] }));
  process.exit(2);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
await page.route('http://reanimator.test/**', async (route) => {
  const p = new URL(route.request().url()).pathname;
  const file = p === '/' ? '/index.html' : p;
  if (!existsSync(root + file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ path: root + file, contentType: mime[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream' });
});
await page.goto('http://reanimator.test/?debug=1');
await page.waitForFunction(() => {
  const fn = (window as unknown as { __reanimator?: () => { loadedModels: string[]; failedModels: string[] } }).__reanimator;
  if (!fn) return false;
  const s = fn();
  return s.loadedModels.length === 9 || s.failedModels.length > 0;
}, null, { timeout: 15000 });

type Tel = { tick: number; status: string; enemySim: Record<string, { x: number; kind: string; surface: string; state: string }>; enemyRender: Record<string, { x: number }> };
const result = await page.evaluate(async ({ fromTick, toTick }) => {
  const wa = window as unknown as { __reanimatorRunBot: (n: number) => Tel };
  let s = wa.__reanimatorRunBot(fromTick);
  const prev = new Map<string, { dx: number; sx: number; dstep: number }>();
  type K = { frames: number; maxDisplayStep: number; maxSimStep: number; displayPops: number; displayFlips: number; maxGap: number };
  const stats: Record<string, K> = {};
  let frames = 0;
  while (s.tick < toTick && s.status === 'playing') {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    s = wa.__reanimatorRunBot(1);
    frames++;
    for (const [id, sim] of Object.entries(s.enemySim)) {
      const r = s.enemyRender[id];
      if (!r || (sim.kind !== 'crawler' && sim.kind !== 'stalker') || sim.state !== 'chase' || sim.surface !== 'floor') {
        prev.delete(id);
        continue;
      }
      const p = prev.get(id);
      const dstep = p ? r.x - p.dx : 0;
      if (p) {
        const sstep = Math.abs(sim.x - p.sx);
        if (sstep > 1.5) {
          prev.delete(id); // respawn or wave spawn: a teleport by design
          continue;
        }
        const k = (stats[sim.kind] ??= { frames: 0, maxDisplayStep: 0, maxSimStep: 0, displayPops: 0, displayFlips: 0, maxGap: 0 });
        const a = Math.abs(dstep);
        k.frames++;
        k.maxDisplayStep = Math.max(k.maxDisplayStep, a);
        k.maxSimStep = Math.max(k.maxSimStep, sstep);
        k.maxGap = Math.max(k.maxGap, Math.abs(r.x - sim.x));
        if (a > 0.2) k.displayPops++;
        if (dstep * p.dstep < 0 && a > 0.02 && Math.abs(p.dstep) > 0.02) k.displayFlips++;
      }
      prev.set(id, { dx: r.x, sx: sim.x, dstep });
    }
  }
  return { frames, endTick: s.tick, stats };
}, { fromTick, toTick });
console.log(JSON.stringify({ status: 'OK', root, fromTick, toTick, ...result }));
await browser.close();

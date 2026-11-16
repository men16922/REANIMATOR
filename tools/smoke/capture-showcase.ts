// Deterministic README showcase capturer. Serves dist-debug/ in headless Chrome (WebGL2) and asks the game for each scene
// through window.__reanimatorShowcase(name) (see src/ui/demo.ts SHOWCASE_SCENES), then writes 1280x800 PNGs to
// docs/evidence/showcase/: title, classic, combat, boss, mines, biolabs, lab. Needs Chrome; run `make build` first.
// Set SHOWCASE_EXTRA=1 to also capture security, slide and escape.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../dist-debug');
const outDir = resolve(import.meta.dirname, '../../docs/evidence/showcase');
mkdirSync(outDir, { recursive: true });

if (!existsSync(resolve(root, 'index.html'))) {
  console.error('dist-debug/index.html missing; run make smoke-build first');
  process.exit(2);
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('http://reanimator.test/**', async (route) => {
  const p = new URL(route.request().url()).pathname;
  const file = p === '/' ? '/index.html' : p;
  const mimeMap: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.glb': 'model/gltf-binary',
  };
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  if (!existsSync(root + file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ path: root + file, contentType: mimeMap[ext] ?? 'application/octet-stream' });
});

const NAMES = ['title', 'classic', 'combat', 'boss', 'mines', 'biolabs', 'lab'];
if (process.env.SHOWCASE_EXTRA) NAMES.push('security', 'slide', 'escape');

try {
  await page.goto('http://reanimator.test/?debug=1');
  await page.waitForFunction(
    () => {
      const fn = (window as unknown as { __reanimator?: () => { loadedModels: string[]; riggedCount: number } }).__reanimator;
      if (!fn) return false;
      const s = fn();
      return s.loadedModels.length === 10 && s.riggedCount >= 1;
    },
    null,
    { timeout: 15000 },
  );
  const files: string[] = [];
  const checks: Record<string, unknown> = {};
  for (const name of NAMES) {
    const snap = await page.evaluate((n) => (window as unknown as { __reanimatorShowcase: (n: string) => Promise<unknown> }).__reanimatorShowcase(n), name);
    await page.screenshot({ path: resolve(outDir, `${name}.png`) });
    files.push(`${name}.png`);
    const s = snap as { currentRoom: string; viewMode: string; rendererMode: string; status: string };
    checks[name] = { room: s.currentRoom, view: s.viewMode, renderer: s.rendererMode, status: s.status };
  }
  console.log(JSON.stringify({ status: 'CAPTURED', files, checks }, null, 2));
} finally {
  await browser.close();
}

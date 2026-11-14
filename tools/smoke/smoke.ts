// Browser smoke check for the built Full 3D app (dist/). No dev server: files are served through route interception.
// Usage: node tools/smoke/smoke.ts   (requires `vite build` first)
// Browser: the installed Google Chrome channel (WebGL2 verified).

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../dist');
const out = resolve(import.meta.dirname, '../../docs/evidence/g3');
mkdirSync(out, { recursive: true });

type Snap = {
  mode: string;
  status: string;
  phase: string;
  tick: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  weapon: number;
  dashCooldown: number;
  aimYaw: number;
  light: { on: boolean; battery: number };
  startX: number;
  startZ: number;
  rendererMode: string;
  modelsLoaded: boolean;
  loadedModels: string[];
  failedModels: string[];
  riggedCount: number;
};

const checks: { name: string; ok: boolean; detail?: unknown }[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => checks.push({ name, ok, detail });

if (!existsSync(resolve(root, 'index.html'))) {
  console.log(JSON.stringify({ status: 'NOT RUN', reason: 'dist/index.html missing; run vite build' }));
  process.exit(2);
}

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome' });
} catch (e) {
  console.log(JSON.stringify({ status: 'NOT RUN', reason: `Google Chrome channel unavailable: ${String(e).split('\n')[0]}` }));
  process.exit(2);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

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
  const type = mimeMap[ext] ?? 'application/octet-stream';
  if (!existsSync(root + file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ path: root + file, contentType: type });
});

const snap = () => page.evaluate(() => (window as unknown as { __reanimator: () => Snap }).__reanimator());
const wait = (ms: number) => page.waitForTimeout(ms);

try {
  await page.goto('http://reanimator.test/');
  await page.waitForFunction(
    () => {
      const fn = (window as unknown as { __reanimator?: () => Snap }).__reanimator;
      if (!fn) return false;
      const s = fn();
      return (s.loadedModels.length === 9 && s.riggedCount >= 1) || s.failedModels.length > 0;
    },
    null,
    { timeout: 10000 },
  );
  await wait(350);

  const initial = await snap();
  check('title screen first', initial.mode === 'title');
  check('Play is the primary button', await page.getByRole('button', { name: 'Play' }).isVisible());
  check('Full 3D WebGL renderer active', initial.rendererMode === 'webgl-3d', initial.rendererMode);
  check(
    'all 9 Meshy .glb models loaded with rigged bipeds',
    initial.loadedModels.length === 9 && initial.failedModels.length === 0 && initial.riggedCount >= 1,
    { loaded: initial.loadedModels, failed: initial.failedModels, riggedCount: initial.riggedCount },
  );

  await page.getByRole('button', { name: 'How it was revived' }).click();
  check('evidence panel opens', await page.getByRole('heading', { name: 'How it was revived' }).isVisible());
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Restoration Lab' }).click();
  await wait(200);
  const labIds = await page
    .locator('#lab-scenario option')
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const labResults: Record<string, string> = {};
  for (const id of labIds) {
    await page.selectOption('#lab-scenario', id);
    await wait(100);
    labResults[id] = ((await snap()) as unknown as { lab: { status: string } }).lab.status;
  }
  check('Lab: every scenario PASS in the browser', labIds.length >= 4 && Object.values(labResults).every((s) => s === 'PASS'), labResults);
  await page.screenshot({ path: resolve(out, 'lab_pass.png') });

  await page.selectOption('#lab-scenario', 'S1-spawn-fall-run-wall');
  await wait(100);
  await page.check('#lab-mutation');
  await wait(100);
  const mut = ((await snap()) as unknown as { lab: { status: string; mutation: boolean } }).lab;
  check('Lab: demo mutation is detected as FAIL', mut.status === 'FAIL' && mut.mutation, mut);
  await page.screenshot({ path: resolve(out, 'lab_mutation_fail.png') });
  await page.uncheck('#lab-mutation');
  await page.getByRole('button', { name: 'Back' }).click();

  // Start playing
  await page.getByRole('button', { name: 'Play' }).click();
  await wait(450);
  const s0 = await snap();
  check('play starts and 60 Hz simulation advances', s0.mode === 'playing' && s0.tick > 0, { tick: s0.tick });

  // Horizontal X movement (D)
  await page.keyboard.down('KeyD');
  await wait(450);
  await page.keyboard.up('KeyD');
  const s1 = await snap();
  check('D moves east (+X in 3D)', s1.x > s0.x + 1.0, { from: s0.x, to: s1.x });

  // True 3D Z-axis depth movement (W)
  await page.keyboard.down('KeyW');
  await wait(350);
  await page.keyboard.up('KeyW');
  const sW = await snap();
  check('W moves north (-Z in 3D)', sW.z < s1.z - 0.5, { from: s1.z, to: sW.z });

  // True 3D vertical Jump (Space)
  await page.keyboard.down('Space');
  await wait(140);
  const sJump = await snap();
  await page.keyboard.up('Space');
  check('Space jumps (+Y in 3D)', sJump.y > 0.1, { y: sJump.y });
  await wait(450);

  // Jet-Dash (ShiftLeft)
  await page.keyboard.press('ShiftLeft');
  await wait(120);
  const sDash = await snap();
  check('Shift triggers Jet-Dash cooldown', sDash.dashCooldown > 0, { dashCooldown: sDash.dashCooldown });
  await wait(400);

  // 360 cursor aiming + LMB firing
  await page.mouse.move(960, 220);
  await wait(120);
  const aimA = (await snap()).aimYaw;
  await page.mouse.move(320, 620);
  await page.mouse.down();
  await wait(180);
  await page.mouse.up();
  const aimB = (await snap()).aimYaw;
  check('Mouse 360 cursor aiming rotates aimYaw', Math.abs(aimB - aimA) > 0.3, { aimA, aimB });

  // R3.3 Headlamp toggle (wait deterministically in ticks so w.tick % 4 === 0 drains battery)
  const preLightTick = (await snap()).tick;
  await page.keyboard.press('KeyE');
  await page.waitForFunction(
    (t0) => (window as unknown as { __reanimator: () => { tick: number } }).__reanimator().tick >= t0 + 12,
    preLightTick,
    { timeout: 4000 },
  );
  const sLight = await snap();
  check('E turns headlamp ON and drains battery', sLight.light.on && sLight.light.battery < 100, sLight.light);
  await page.screenshot({ path: resolve(out, 'smoke_light_on.png') });

  await page.keyboard.press('KeyE');
  await wait(220);
  await page.screenshot({ path: resolve(out, 'smoke_light_off.png') });

  // Pause & Resume
  await page.keyboard.press('Escape');
  await wait(200);
  const p1 = await snap();
  await wait(450);
  const p2 = await snap();
  check('Esc pauses and freezes the simulation', p1.mode === 'paused' && p1.tick === p2.tick, { p1: p1.tick, p2: p2.tick });
  await page.getByRole('button', { name: 'Resume' }).click();
  await wait(300);
  check('resume continues', (await snap()).tick > p2.tick);

  // Focus loss: held key must be released and game paused
  await page.keyboard.down('KeyD');
  await wait(180);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await wait(200);
  const b1 = await snap();
  await page.keyboard.up('KeyD');
  await page.getByRole('button', { name: 'Resume' }).click();
  await wait(450);
  const b2 = await snap();
  check('blur pauses', b1.mode === 'paused');
  check('held key released after blur (no drift after resume)', Math.abs(b2.x - b1.x) <= 1.2, { before: b1.x, after: b2.x });

  // Restart
  await page.keyboard.press('Escape');
  await wait(150);
  await page.getByRole('button', { name: 'Restart' }).click();
  await wait(160);
  const r = await snap();
  check(
    'restart resets player, light, and time',
    Math.abs(r.x - r.startX) < 0.05 && Math.abs(r.z - r.startZ) < 0.05 && r.light.battery >= 98 && r.tick < 30,
    r,
  );

  // Volume & FPS
  const vol = page.locator('#volume-p');
  await page.keyboard.press('Escape');
  await wait(150);
  await vol.fill('0');
  check('volume control present and adjustable', (await page.locator('#volume').inputValue()) === '0');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resume' }).click().catch(() => {});

  const fps = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let c = 0;
        const t0 = performance.now();
        const f = () => {
          c++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(f);
          else res(c / 2);
        };
        requestAnimationFrame(f);
      }),
  );
  check('frame rate while playing >= 30 fps (Chrome WebGL2)', fps >= 30, { fps });
  check('no page errors', errors.length === 0, errors);
} catch (e) {
  await page.screenshot({ path: resolve(out, 'smoke_failure.png') }).catch(() => {});
  check('smoke script completed', false, String(e).split('\n')[0]);
} finally {
  await browser.close();
}

const ok = checks.every((c) => c.ok);
for (const c of checks) console.log(JSON.stringify(c));
console.log(JSON.stringify({ status: ok ? 'PASS' : 'FAIL', passed: checks.filter((c) => c.ok).length, total: checks.length }));
process.exit(ok ? 0 : 1);

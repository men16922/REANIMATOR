// Automated side-view Metroidvania showcase capturer: drives the deterministic sim and bot through dist/ debug hooks
// in headless Chrome (WebGL2) to capture 1280x800 PNGs in docs/evidence/g4_playable/ (run, backpedal, jump rise/fall,
// Thruster double-jump, locked doors, sector minimap, Core Warden, Meltdown escape, Restoration Lab).

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../dist');
const outG4 = resolve(import.meta.dirname, '../../docs/evidence/g4_playable');
mkdirSync(outG4, { recursive: true });

if (!existsSync(resolve(root, 'index.html'))) {
  console.error('dist/index.html missing; run make check first');
  process.exit(2);
}

// Clear stale 2.5D screenshots so g4_playable holds only current Full 3D showcase captures
for (const f of readdirSync(outG4)) {
  if (f.endsWith('.png')) unlinkSync(resolve(outG4, f));
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

async function settleFrames(count = 14) {
  await page.evaluate(
    (n) =>
      new Promise<void>((res) => {
        let i = 0;
        const step = () => {
          i++;
          if (i >= n) res();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

try {
  await page.goto('http://reanimator.test/');
  await page.waitForFunction(
    () => {
      const fn = (window as unknown as { __reanimator?: () => { loadedModels: string[]; riggedCount: number } }).__reanimator;
      if (!fn) return false;
      const s = fn();
      return s.loadedModels.length === 9 && s.riggedCount >= 1;
    },
    null,
    { timeout: 10000 },
  );
  await settleFrames(20);

  // 1. Title screen over live 3D Cryo Bay
  await page.screenshot({ path: resolve(outG4, '01_title_3d.png') });

  type Snap = Record<string, unknown> & {
    vy: number;
    jumpsUsed: number;
    grounded: boolean;
    openDoors: string[];
    currentRoom: string;
    facing: number;
    phase: string;
    status: string;
    bossHp: number;
    meltdownTicks: number;
  };
  type Frame = Record<string, unknown>;
  const rep = (n: number, f: Frame): Frame[] => Array.from({ length: n }, () => ({ ...f }));
  const advance = (inputs: Frame[], setup?: Record<string, unknown>) =>
    page.evaluate(([i, st]) => (window as unknown as { __reanimatorAdvance: (a: unknown, b: unknown) => unknown }).__reanimatorAdvance(i, st), [inputs, setup] as const) as Promise<Snap>;
  const step = (inputs: Frame[]) =>
    page.evaluate((i) => (window as unknown as { __reanimatorStep: (a: unknown) => unknown }).__reanimatorStep(i), inputs) as Promise<Snap>;
  const runBot = (ticks: number, until?: string) =>
    page.evaluate(([t, u]) => (window as unknown as { __reanimatorRunBot: (a: unknown, b: unknown) => unknown }).__reanimatorRunBot(t, u), [ticks, until] as const) as Promise<Snap>;
  const shot = async (name: string) => {
    await settleFrames(14);
    await page.screenshot({ path: resolve(outG4, name) });
    files.push(name);
  };
  const files = ['01_title_3d.png'];
  const checks: Record<string, unknown> = {};
  const allWeapons = { weapons: [2, 3, 4], boots: true, tanks: 1 };

  // 2. Run east while aiming up-right (two-handed rifle IK, laser sight, headlamp on)
  const f2 = rep(44, { moveX: 1, fire: true, aimX: 26, aimY: 6 });
  f2[0] = { ...f2[0], toggleLight: true };
  checks.run = await advance(f2, { x: 12, y: 0 });
  await shot('02_run_aim_up_right.png');

  // 3. Back-pedal: moving east while aiming west (legs run backwards)
  checks.backpedal = await advance(rep(40, { moveX: 1, fire: true, aimX: 3, aimY: 2 }), { x: 12, y: 0 });
  await shot('03_backpedal_aim_west.png');

  // 4/5. Jump rise (vy > 0) and fall (vy < 0)
  checks.rise = await advance(rep(12, { moveX: 1, jump: true, aimX: 40, aimY: 3 }), { x: 12, y: 0 });
  await shot('04_jump_rise.png');
  checks.fall = await step(rep(26, { moveX: 1, aimX: 40, aimY: 1 }));
  await shot('05_jump_fall.png');

  // 6. Thruster Boots double jump high in the Central Shaft
  const f6: Frame[] = [...rep(14, { jump: true }), ...rep(8, { jump: false }), ...rep(10, { jump: true })];
  checks.doubleJump = await advance(f6, { x: 38, y: 4.4, ...allWeapons, openDoors: ['door_airlock_shaft'] });
  await shot('06_thruster_double_jump.png');

  // 7. Locked doors: Scattergun breaks the green lock while blue/yellow/red shields stay visible
  checks.greenDoor = await advance(rep(26, { fire: true, weaponSlot: 2, aimX: 24, aimY: -9.4 }), {
    x: 31,
    y: -11,
    ...allWeapons,
    openDoors: ['door_airlock_shaft'],
  });
  await shot('07_green_door_scattergun.png');

  // 8. Sector minimap with several sectors explored: bot reaches the Security Console
  await advance([]); // fresh world for the bot run
  checks.console = await runBot(20000, 'save security');
  await shot('08_security_console_minimap.png');

  // 9. Core Warden boss fight
  await runBot(20000, 'warden');
  checks.boss = await runBot(240);
  await shot('09_warden_boss.png');

  // 10. Meltdown escape
  checks.escape = await runBot(20000, 'escape bio west');
  await shot('10_meltdown_escape.png');

  // 6. Restoration Lab proof overlay
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Restart' }).click().catch(() => {});
  await page.evaluate(() => {
    (document.getElementById('title') as HTMLElement).hidden = false;
    (document.getElementById('pause') as HTMLElement).hidden = true;
    (document.getElementById('hud') as HTMLElement).hidden = true;
  });
  await page.getByRole('button', { name: 'Restoration Lab' }).click();
  await settleFrames(8);
  await page.screenshot({ path: resolve(outG4, '11_restoration_lab.png') });

  files.push('11_restoration_lab.png');
  console.log(JSON.stringify({ status: 'CAPTURED', files, checks }, null, 2));
} finally {
  await browser.close();
}

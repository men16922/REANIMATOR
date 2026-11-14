// Automated Full 3D showcase capturer: drives real computeBotInput3D trajectories through dist/
// in headless Chrome (WebGL2) to capture 6 1280x800 PNGs in docs/evidence/g4_playable/.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeBotInput3D } from '../../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D, type InputState3D } from '../../src/game3d/world3d.ts';

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

function recordShowcaseSlices(): {
  zoneATick: number;
  zoneBTick: number;
  bossTick: number;
  escapeTick: number;
  inputs: InputState3D[];
} {
  let w = newWorld3D();
  const inputs: InputState3D[] = [];
  let zoneATick = -1;
  let zoneBTick = -1;
  let bossTick = -1;
  let escapeTick = -1;

  for (let t = 0; t < 3500 && w.status === 'playing'; t++) {
    const inp = computeBotInput3D(w);
    // Toggle R3.3 visual headlamp ON early so Zone A showcase shows volumetric beam + laser sight
    if (t === 4) inp.toggleLight = true;
    inputs.push(inp);
    w = stepWorld3D(w, inp);

    // 1. Zone A active Pulse combat with laser/muzzle/enemies visible
    if (
      zoneATick < 0 &&
      w.player.body.x >= 9.0 &&
      w.player.body.x <= 18.0 &&
      (w.projectiles.some((p) => p.fromPlayer) || w.explosions.length > 0)
    ) {
      zoneATick = inputs.length;
    }

    // 2. Zone B active combat with Grenade/Explosion or Acid Pool + Catwalk view
    if (
      zoneBTick < 0 &&
      w.player.body.x >= 26.0 &&
      w.player.body.x <= 46.0 &&
      w.player.unlocked[3] &&
      (w.explosions.length > 0 || w.projectiles.some((p) => p.kind === 'grenade') || w.tick > 380)
    ) {
      zoneBTick = inputs.length;
    }

    // 3. Zone C Core Warden Boss fight with visible Shockwave ring (or active windup/beam)
    if (w.phase === 'warden' && w.player.body.x >= 55.0) {
      const hasShockwave = w.shockwaves.length > 0;
      const wardenAlive = w.enemies.some((e) => e.kind === 'warden' && e.alive);
      if (wardenAlive && hasShockwave) {
        bossTick = inputs.length;
      } else if (bossTick < 0 && wardenAlive && (w.beams.length > 0 || w.explosions.length > 0)) {
        bossTick = inputs.length;
      }
    }

    // 4. Zone D Meltdown Escape with countdown active & barrel explosion / Exit Gate visible
    if (
      w.coreDestroyed &&
      w.meltdownTicks >= 0 &&
      w.player.body.x >= 80.5 &&
      w.player.body.x <= 91.5 &&
      (w.explosions.length > 0 || w.player.body.x >= 84.5)
    ) {
      escapeTick = inputs.length;
    }
  }

  return {
    zoneATick: zoneATick > 0 ? zoneATick : 95,
    zoneBTick: zoneBTick > 0 ? zoneBTick : 360,
    bossTick: bossTick > 0 ? bossTick : 720,
    escapeTick: escapeTick > 0 ? escapeTick : Math.max(inputs.length - 12, 100),
    inputs,
  };
}

const slices = recordShowcaseSlices();

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

  // Helper to replay slice and let Three.js animations & doors settle cleanly
  const captureSlice = async (tickCount: number, fileName: string) => {
    const snap = await page.evaluate(
      (sliceInputs) =>
        (window as unknown as { __reanimatorAdvance: (inp: unknown[]) => unknown }).__reanimatorAdvance(sliceInputs),
      slices.inputs.slice(0, tickCount),
    );
    await settleFrames(14);
    await page.screenshot({ path: resolve(outG4, fileName) });
    return snap;
  };

  // 2. Zone A decoupled aiming + headlamp + Pulse fire
  const snapA = await captureSlice(slices.zoneATick, '02_zone_a_aim_3d.png');

  // 3. Zone B catwalk / grenade / acid pool / barrel combat
  const snapB = await captureSlice(slices.zoneBTick, '03_catwalk_grenade_barrel.png');

  // 4. Zone C Core Warden Boss + shockwave ring
  const snapC = await captureSlice(slices.bossTick, '04_warden_boss_shockwave.png');

  // 5. Zone D Meltdown escape
  const snapD = await captureSlice(slices.escapeTick, '05_meltdown_escape.png');

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
  await page.screenshot({ path: resolve(outG4, '06_restoration_lab.png') });

  console.log(
    JSON.stringify(
      {
        status: 'CAPTURED',
        files: [
          '01_title_3d.png',
          '02_zone_a_aim_3d.png',
          '03_catwalk_grenade_barrel.png',
          '04_warden_boss_shockwave.png',
          '05_meltdown_escape.png',
          '06_restoration_lab.png',
        ],
        ticks: {
          zoneA: slices.zoneATick,
          zoneB: slices.zoneBTick,
          boss: slices.bossTick,
          escape: slices.escapeTick,
        },
        samples: { snapA, snapB, snapC, snapD },
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}

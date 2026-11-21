// Trailer music & SFX bed recorder. Captures a clean 3-act procedural music suite (title -> shaft -> security)
// plus isolated in-game sound effects via the WebAudio tap into docs/evidence/demo/raw/bed.webm + bed.json.
// Needs `make smoke-build` first.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../dist-debug');
const outDir = resolve(import.meta.dirname, '../../docs/evidence/demo/raw');
mkdirSync(outDir, { recursive: true });
if (!existsSync(resolve(root, 'index.html'))) { console.error('run make smoke-build first'); process.exit(2); }
const mime: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(() => {
  const w = window as unknown as Record<string, unknown>;
  const orig = AudioNode.prototype.connect as (...a: unknown[]) => unknown;
  let rec: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  const taps = new WeakMap<BaseAudioContext, MediaStreamAudioDestinationNode>();
  (AudioNode.prototype as unknown as { connect: (...a: unknown[]) => unknown }).connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
    if (dest instanceof AudioDestinationNode) {
      let tap = taps.get(dest.context);
      if (!tap) {
        tap = (dest.context as AudioContext).createMediaStreamDestination();
        taps.set(dest.context, tap);
        if (!rec) {
          rec = new MediaRecorder(tap.stream, { mimeType: 'audio/webm;codecs=opus' });
          rec.ondataavailable = (e) => chunks.push(e.data);
          rec.start(500);
          w.__tapStart = Date.now();
        }
      }
      orig.call(this, tap, ...rest);
    }
    return orig.call(this, dest, ...rest);
  };
  w.__tapStop = () => new Promise<string>((res) => {
    if (!rec) return res('');
    rec.onstop = async () => {
      const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      res(btoa(bin));
    };
    rec.stop();
  });
});

const page = await ctx.newPage();
await page.route('http://reanimator.test/**', async (route) => {
  const p = new URL(route.request().url()).pathname;
  const file = p === '/' ? '/index.html' : p;
  if (!existsSync(root + file)) return route.fulfill({ status: 404, body: '' });
  return route.fulfill({ path: root + file, contentType: mime[file.slice(file.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream' });
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto('http://reanimator.test/?debug=1');
  await page.waitForFunction(() => !!(window as unknown as { __reanimatorAudio?: unknown }).__reanimatorAudio, null, { timeout: 30000 });
  await page.evaluate(() => {
    for (const id of ['volume-bgm', 'volume-sfx']) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) { el.value = '100'; el.dispatchEvent(new Event('input')); }
    }
  });
  await page.keyboard.press('Shift'); // user gesture
  await page.waitForTimeout(8000); // let title attract settle cleanly

  const bedData = await page.evaluate(async () => {
    const A = (window as unknown as {
      __reanimatorAudio: {
        bgm: (on: boolean, t?: string, s?: number) => void;
        play: (id: string) => void;
      };
    }).__reanimatorAudio;
    const w = window as unknown as { __tapStart?: number };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const mark = () => (Date.now() - (w.__tapStart ?? Date.now())) / 1000;

    const themes: Record<string, number> = {};
    const sfx: Record<string, number> = {};

    A.bgm(false);
    await sleep(900);

    themes.title = mark(); A.bgm(true, 'title', 1); await sleep(20000);
    A.bgm(false); await sleep(900);

    themes.shaft = mark(); A.bgm(true, 'shaft', 1); await sleep(29500);
    A.bgm(false); await sleep(900);

    themes.security = mark(); A.bgm(true, 'security', 1); await sleep(33000);
    A.bgm(false); await sleep(1500);

    const cues: readonly [string, string][] = [
      ['explosion', 'world.explosion'],
      ['slam', 'boss.tele.slam'],
      ['alarm', 'world.alarm'],
      ['scan', 'world.scan'],
      ['parry', 'combat.parry'],
      ['boss_counter', 'boss.counter'],
      ['rail', 'weapon.rail'],
      ['scatter', 'weapon.scatter'],
      ['grenade', 'weapon.grenade'],
      ['pulse', 'weapon.pulse'],
      ['sector', 'ui.sector'],
      ['secret', 'world.secret'],
      ['foreman_atk', 'enemy.foreman.attack'],
      ['foreman_land', 'enemy.foreman.land'],
      ['dash', 'player.dash'],
    ];
    for (const [key, id] of cues) {
      sfx[key] = mark();
      A.play(id);
      await sleep(1500);
    }
    await sleep(1200);
    return { themes, sfx };
  });

  const b64 = await page.evaluate(() => (window as unknown as { __tapStop: () => Promise<string> }).__tapStop());
  writeFileSync(resolve(outDir, 'bed.webm'), Buffer.from(b64, 'base64'));
  writeFileSync(resolve(outDir, 'bed.json'), JSON.stringify(bedData, null, 2));
  console.log(JSON.stringify({ status: 'RECORDED', errors, bedData }, null, 2));
} finally {
  await ctx.close();
  await browser.close();
}

// Trailer music bed recorder. Plays the game's own procedural themes in a fixed order and captures the WebAudio output
// (same tap as record-demo.ts) to docs/evidence/demo/raw/bed.webm, plus bed.json with the start time of every piece.
// The trailer edit (tools/smoke/trailer.sh) cuts each piece on bar lines. Needs `make smoke-build` first.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../dist-debug');
const outDir = resolve(import.meta.dirname, '../../docs/evidence/demo/raw');
mkdirSync(outDir, { recursive: true });
if (!existsSync(resolve(root, 'index.html'))) { console.error('run make smoke-build first'); process.exit(2); }
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

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
  await page.keyboard.press('Shift'); // user gesture
  await page.waitForTimeout(8000); // the title theme of the idle menu stops here; the bed starts from a clean slate
  const marks = await page.evaluate(async () => {
    const A = (window as unknown as { __reanimatorAudio: { bgm: (on: boolean, t?: string, s?: number) => void; musicIntensity: (n: number) => void; escapeMusic: (t: number) => void } }).__reanimatorAudio;
    const w = window as unknown as { __tapStart?: number };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const marks: Record<string, number> = {};
    const mark = (k: string) => { marks[k] = (Date.now() - (w.__tapStart ?? Date.now())) / 1000; };
    A.bgm(false);
    await sleep(600);
    mark('title'); A.bgm(true, 'title', 1); await sleep(8800);
    mark('shaft'); A.bgm(true, 'shaft', 1); await sleep(19600);
    mark('security'); A.bgm(true, 'security', 1); await sleep(16800);
    mark('boss1'); A.bgm(true, 'boss', 1); await sleep(6300);
    mark('boss2'); A.musicIntensity(2); await sleep(6000);
    mark('boss3'); A.musicIntensity(3); await sleep(5900);
    mark('meltdown'); A.bgm(true, 'meltdown', 1); A.escapeMusic(-1); await sleep(2800);
    mark('esc1'); A.escapeMusic(3700); await sleep(2700);
    mark('esc2'); A.escapeMusic(2600); await sleep(2700);
    mark('esc3'); A.escapeMusic(1650); await sleep(2200);
    mark('esc4'); A.escapeMusic(700);
    for (let t = 600; t >= 0; t -= 6) { A.escapeMusic(t); await sleep(100); }
    mark('victory'); A.bgm(true, 'victory', 1); await sleep(7000);
    mark('end');
    return marks;
  });
  const b64 = await page.evaluate(() => (window as unknown as { __tapStop: () => Promise<string> }).__tapStop());
  writeFileSync(resolve(outDir, 'bed.webm'), Buffer.from(b64, 'base64'));
  writeFileSync(resolve(outDir, 'bed.json'), JSON.stringify(marks, null, 2));
  console.log(JSON.stringify({ status: 'RECORDED', errors, marks }, null, 2));
} finally {
  await ctx.close();
  await browser.close();
}

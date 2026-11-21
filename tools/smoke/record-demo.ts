// Demo video recorder (Kiroween submission). Serves dist-debug/ in Chrome, records the title screen and Trailer Reel
// or Watch Showcase with Playwright recordVideo, and writes docs/evidence/demo/raw/video_<TAG>.webm + meta_<TAG>.json.
// Needs `make smoke-build` first.

import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../dist-debug');
const outDir = resolve(import.meta.dirname, '../../docs/evidence/demo/raw');
mkdirSync(outDir, { recursive: true });
if (!existsSync(resolve(root, 'index.html'))) {
  console.error('dist-debug/index.html missing; run make smoke-build first');
  process.exit(2);
}

const mime: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
const MODE = process.env.MODE ?? 'reel'; // 'reel' (scripted Trailer Reel) or 'showcase' (live bot gameplay, Watch Showcase)
const W = Number(process.env.W ?? 1280);
const H = Number(process.env.H ?? 720);
const MUTE_BGM = process.env.MUTE_BGM === '1';
const HIDE_CAPTIONS = process.env.HIDE_CAPTIONS === '1';
const TAG = process.env.TAG ?? MODE;
const TITLE_MS = Number(process.env.TITLE_MS ?? 6000);
const REEL_MS = Number(process.env.REEL_MS ?? 100000);

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: outDir, size: { width: W, height: H } },
});
// Audio tap: the game's WebAudio graph ends at ctx.destination. Every connection to it is mirrored into a
// MediaStreamAudioDestinationNode that a MediaRecorder captures, so the video gets the real procedural music and sfx.
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
  w.__tapStop = () =>
    new Promise<string>((res) => {
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
const videoT0 = Date.now();
await page.route('http://reanimator.test/**', async (route) => {
  const p = new URL(route.request().url()).pathname;
  const file = p === '/' ? '/index.html' : p;
  if (!existsSync(root + file)) return route.fulfill({ status: 404, body: '' });
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  return route.fulfill({ path: root + file, contentType: mime[ext] ?? 'application/octet-stream' });
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));

let rawVideoPath: string | undefined;
let offset = -1;
let titleReadySec = 0;
let reelStartSec = 0;
let audioBytes = 0;

try {
  await page.goto('http://reanimator.test/?debug=1');
  if (HIDE_CAPTIONS) {
    await page.addStyleTag({
      content: '#showcase-caption, #reel-end { display: none !important; } body.reel-on #lab { transform: none !important; }',
    });
  }
  await page.waitForFunction(
    () => {
      const fn = (window as unknown as { __reanimator?: () => { loadedModels: string[] } }).__reanimator;
      return !!fn && fn().loadedModels.length >= 10;
    },
    null,
    { timeout: 30000 },
  );
  if (MUTE_BGM) await page.evaluate(() => { const e = document.getElementById('volume-bgm') as HTMLInputElement; e.value = '0'; e.dispatchEvent(new Event('input')); });
  await page.keyboard.press('Shift'); // user gesture: lets the game create its AudioContext and start the title music
  titleReadySec = (Date.now() - videoT0) / 1000;
  await page.waitForTimeout(TITLE_MS);
  reelStartSec = (Date.now() - videoT0) / 1000;
  if (MODE === 'showcase') await page.evaluate(() => (document.getElementById('showcase-open') as HTMLElement).click());
  else await page.evaluate(() => (window as unknown as { __reanimatorReel: () => unknown }).__reanimatorReel());
  await page.waitForTimeout(REEL_MS);
  const b64 = await page.evaluate(() => (window as unknown as { __tapStop: () => Promise<string> }).__tapStop());
  const tapStart = await page.evaluate(() => (window as unknown as { __tapStart?: number }).__tapStart ?? 0);
  writeFileSync(resolve(outDir, `audio_${TAG}.webm`), Buffer.from(b64, 'base64'));
  offset = tapStart ? (tapStart - videoT0) / 1000 : -1;
  audioBytes = b64.length * 0.75;
  writeFileSync(resolve(outDir, `offset_${TAG}.txt`), String(offset));
  rawVideoPath = await page.video()?.path();
} finally {
  await ctx.close(); // flushes the video file
  await browser.close();
}

const finalVideo = resolve(outDir, `video_${TAG}.webm`);
if (rawVideoPath && existsSync(rawVideoPath)) renameSync(rawVideoPath, finalVideo);
writeFileSync(
  resolve(outDir, `meta_${TAG}.json`),
  JSON.stringify({ tag: TAG, mode: MODE, width: W, height: H, titleReadySec, reelStartSec, audioOffset: offset }, null, 2),
);
console.log(JSON.stringify({ status: 'RECORDED', errors, audioBytes, titleReadySec, reelStartSec, offset, video: finalVideo }, null, 2));

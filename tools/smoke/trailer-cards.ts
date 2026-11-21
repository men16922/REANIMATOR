// Renders the trailer's text cards as 1920x1080 transparent PNGs (end card is opaque) into docs/evidence/demo/raw/cards/.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '../../docs/evidence/demo/raw/cards');
mkdirSync(out, { recursive: true });
const ORANGE = '#ffb347';
const base = `html,body{margin:0;width:1920px;height:1080px;background:transparent;overflow:hidden;font-family:Impact,'Arial Black',sans-serif;color:#fff}
.b{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.cap{position:absolute;left:56px;bottom:42px;max-width:1360px;font-size:56px;line-height:1.08;letter-spacing:3px;color:${ORANGE};text-shadow:0 0 22px rgba(255,120,20,.65),4px 4px 0 #000,-2px -2px 0 #000;background:linear-gradient(90deg,rgba(5,8,14,.90) 0%,rgba(5,8,14,.72) 72%,rgba(5,8,14,0) 100%);padding:12px 120px 12px 26px;border-left:8px solid ${ORANGE}}
.cap small{display:block;font-family:Menlo,'SF Mono',monospace;font-weight:700;font-size:22px;letter-spacing:4px;color:#f4f7fb;text-shadow:2px 2px 0 #000;margin-top:6px}
.big{font-size:176px;letter-spacing:14px;color:${ORANGE};text-shadow:0 0 42px rgba(255,100,10,.9),0 0 96px rgba(255,60,0,.55),10px 10px 0 #000}
.mid{font-size:112px;letter-spacing:10px;color:#fff;text-shadow:0 0 32px rgba(255,255,255,.55),8px 8px 0 #000}
.tag{font-family:Menlo,'SF Mono',monospace;font-weight:700;font-size:36px;letter-spacing:8px;color:#f4f7fb;text-shadow:3px 3px 0 #000;margin-top:20px}
.url{font-family:Menlo,'SF Mono',monospace;font-weight:700;font-size:48px;color:${ORANGE};letter-spacing:2px;margin-top:34px;text-shadow:3px 3px 0 #000}
.kiro{font-family:Menlo,'SF Mono',monospace;font-weight:700;font-size:32px;letter-spacing:8px;color:#c3b2ff;margin-top:26px;text-shadow:2px 2px 0 #000}`;

const cards: Record<string, string> = {
  c_1996: `<div class="b"><div class="mid">1996.</div><div class="tag">A DOS SHAREWARE CLASSIC.</div></div>`,
  c_rebuilt: `<div class="b"><div class="mid" style="font-size:90px">REBUILT FRAME BY FRAME.</div><div class="tag">11 PHYSICS FIELDS · ZERO TOLERANCE.</div></div>`,
  cap_lab: `<div class="cap">1996 PHYSICS · VERIFIED<small>ORIGINAL LOG VS ENGINE · MUTATE 1 CONSTANT → FAIL</small></div>`,
  cap_classic: `<div class="cap">PRESS V · CLASSIC VIEW<small>320x200 BAYER DITHER · SAME SIM UNDERNEATH</small></div>`,
  cap_sectors: `<div class="cap">SIX CONNECTED SECTORS<small>ABILITY GATES · HAZARDS · HIDDEN WALLS</small></div>`,
  cap_combat: `<div class="cap">PARRY · SCAN · SIX WEAPONS<small>COUNTER FOES · EXPOSE SECRETS · BREAK LOCKS</small></div>`,
  cap_hunter: `<div class="cap">HUNTED BY SOUND<small>THE RECLAIMER STALKS BIO-LABS</small></div>`,
  cap_stages: `<div class="cap">THREE DISTINCT STAGES<small>CRYO FACILITY · FOUNDRY LINE · REACTOR SPIRE</small></div>`,
  cap_foreman: `<div class="cap">SLAG FOREMAN<small>STAGE 2 MINI-BOSS · JUMP THE SHOCKWAVE</small></div>`,
  cap_spire: `<div class="cap">SPIRE WARDEN<small>STAGE 3 BOSS · BREAK ITS GUARD</small></div>`,
  cap_warden: `<div class="cap">CORE WARDEN<small>THREE PHASES · COUNTER TO EXPOSE</small></div>`,
  cap_meltdown: `<div class="cap">MELTDOWN · 90 SECONDS<small>ESCAPE BEFORE THE HATCH SEALS</small></div>`,
  end: `<div class="b" style="background:radial-gradient(ellipse at center,#241009 0%,#050304 78%)"><div class="big">REANIMATOR</div><div class="tag">1996 ABUSE PHYSICS · REANIMATED IN 3D</div><div class="url">dlr55kf9v2hn7.cloudfront.net</div><div class="tag" style="font-size:30px;letter-spacing:6px;margin-top:24px">PLAY FREE IN YOUR BROWSER · 3 STAGES · 60 FPS</div><div class="kiro">BUILT WITH KIRO</div></div>`,
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [name, html] of Object.entries(cards)) {
  await page.setContent(`<style>${base}</style>${html}`);
  await page.screenshot({ path: resolve(out, `${name}.png`), omitBackground: name !== 'end' });
}
await browser.close();
console.log(JSON.stringify({ status: 'CARDS', files: Object.keys(cards) }));

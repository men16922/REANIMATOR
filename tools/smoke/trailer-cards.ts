// Renders the trailer's text cards as transparent 1280x720 PNGs (ffmpeg here has no drawtext) into docs/evidence/demo/raw/cards/.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '../../docs/evidence/demo/raw/cards');
mkdirSync(out, { recursive: true });
const ORANGE = '#ffb347';
const base = `html,body{margin:0;width:1280px;height:720px;background:transparent;overflow:hidden;font-family:Impact,'Arial Black',sans-serif;color:#fff}
.b{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.cap{position:absolute;left:64px;bottom:76px;font-size:64px;letter-spacing:3px;color:${ORANGE};text-shadow:0 0 18px rgba(255,120,20,.65),4px 4px 0 #000,-2px -2px 0 #000;background:linear-gradient(90deg,rgba(0,0,0,.62),rgba(0,0,0,0));padding:6px 90px 6px 22px;border-left:8px solid ${ORANGE}}
.cap small{display:block;font-size:26px;letter-spacing:5px;color:#fff;text-shadow:3px 3px 0 #000;margin-top:2px}
.big{font-size:150px;letter-spacing:12px;color:${ORANGE};text-shadow:0 0 36px rgba(255,100,10,.9),0 0 80px rgba(255,60,0,.55),8px 8px 0 #000}
.mid{font-size:92px;letter-spacing:8px;color:#fff;text-shadow:0 0 28px rgba(255,255,255,.55),6px 6px 0 #000}
.tag{font-size:34px;letter-spacing:8px;color:#fff;text-shadow:3px 3px 0 #000;margin-top:14px}
.url{font-family:Menlo,monospace;font-weight:700;font-size:38px;color:${ORANGE};letter-spacing:2px;margin-top:26px;text-shadow:3px 3px 0 #000}
.kiro{font-size:30px;letter-spacing:8px;color:#b9a7ff;margin-top:22px}`;

const cards: Record<string, string> = {
  c_1996: `<div class="b"><div class="mid">1996.</div><div class="tag">A SHAREWARE SHOOTER</div></div>`,
  c_burns: `<div class="b"><div class="mid" style="font-size:78px">THE REACTOR<br>STILL BURNS.</div></div>`,
  c_logo: `<div class="b"><div class="big">REANIMATOR</div></div>`,
  c_logo_sub: `<div class="b" style="justify-content:flex-end;padding-bottom:70px"><div class="tag" style="font-size:42px">REVIVED IN 3D. RUNS IN YOUR BROWSER.</div></div>`,
  cap_sectors: `<div class="cap">SIX SECTORS<small>ONE CONNECTED FACILITY</small></div>`,
  cap_weapons: `<div class="cap">SIX WEAPONS<small>EACH WITH A JOB</small></div>`,
  cap_locks: `<div class="cap">THE RIGHT KEY FOR EVERY LOCK<small>PULSE. SCATTERGUN. GRENADE. RAIL.</small></div>`,
  cap_classic: `<div class="cap">PRESS V<small>1996 MODE: 320x200, 256 COLOURS</small></div>`,
  cap_stages: `<div class="cap">THREE STAGES<small>FOUNDRY LINE. REACTOR SPIRE.</small></div>`,
  cap_warden: `<div class="cap">CORE WARDEN<small>THREE PHASES</small></div>`,
  cap_foreman: `<div class="cap">SLAG FOREMAN<small>JUMP THE SHOCKWAVE</small></div>`,
  cap_spire: `<div class="cap">SPIRE WARDEN<small>BREAK IT OPEN</small></div>`,
  cap_melt: `<div class="cap">MELTDOWN<small>90 SECONDS TO THE HATCH</small></div>`,
  cap_run: `<div class="b"><div class="mid" style="font-size:150px;color:#ff5a3c">RUN.</div></div>`,
  end: `<div class="b" style="background:radial-gradient(ellipse at center,#26100a 0%,#050304 75%)"><div class="big" style="font-size:132px">REANIMATOR</div><div class="tag">A 1996 SHOOTER, REANIMATED</div><div class="url">dlr55kf9v2hn7.cloudfront.net</div><div class="tag" style="font-size:26px;letter-spacing:6px;margin-top:18px">PLAY FREE IN YOUR BROWSER</div><div class="kiro">BUILT WITH KIRO</div></div>`,
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [name, html] of Object.entries(cards)) {
  await page.setContent(`<style>${base}</style>${html}`);
  await page.screenshot({ path: resolve(out, `${name}.png`), omitBackground: name !== 'end' });
}
await browser.close();
console.log(JSON.stringify({ status: 'CARDS', files: Object.keys(cards) }));

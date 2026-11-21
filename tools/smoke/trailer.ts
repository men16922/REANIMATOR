// Trailer assembler. Cuts the 1080p Watch Showcase recording (raw/video_hd_showcase.webm: the bot actually plays, music muted,
// record-demo.ts W=1920 H=1080 MUTE_BGM=1 TAG=hd_showcase MODE=showcase) in its own order, plus one Restoration Lab shot from the
// Trailer Reel (raw/video_reel.webm). Shots sit on the bar lines of a music bed built from the game's own themes (raw/bed.webm,
// record-bed.ts). The showcase carries its own section captions, so the only added cards are the cold open and the end card
// (trailer-cards.ts). Gameplay sfx follow the shots; a few synthetic booms mark section changes.
// Hard cuts only, no zoom, no flash. Writes docs/evidence/demo/reanimator_trailer.mp4 (1280x720, ~70 s).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raw = resolve(import.meta.dirname, '../../docs/evidence/demo/raw');
const outFile = resolve(import.meta.dirname, '../../docs/evidence/demo/reanimator_trailer.mp4');
const SFX_OFFSET = Number(readFileSync(resolve(raw, 'offset_hd_showcase.txt'), 'utf8')); // audio starts this many seconds after the video

interface Shot { src: 'show' | 'lab' | 'black'; ss: number; d: number }
const show = (ss: number, d: number): Shot => ({ src: 'show', ss, d });
const bar = (bpm: number) => (60 / bpm) * 4;
const B2 = bar(128), B3 = bar(146); // shaft and security theme bars

const shots: Shot[] = [];
// P1: cold open (black, two lines), then the title screen on the downbeat
shots.push({ src: 'black', ss: 0, d: 4.3 }, show(2.0, 4.3));
// P2: shaft theme: Restoration Lab 2 bars, frame-exact physics run 3 bars, six sectors 3 bars
shots.push({ src: 'lab', ss: 9.0, d: 2 * B2 }, show(7.6, 3 * B2), show(15.3, 3 * B2));
// P3: security theme: hazards 3 bars, weapon locks 3 bars, classic view 2 bars
shots.push(show(23.3, 3 * B3), show(30.5, 3 * B3), show(39.0, 2 * B3));
// P4: boss theme, escalating: Slag Foreman, Spire Warden, Core Warden
shots.push(show(60.3, 5.5), show(76.0, 6.3), show(45.3, 6.3));
// P5: meltdown run to the hatch
shots.push(show(83.3, 6.5), show(91.3, 2.5));
// P6: end card
shots.push({ src: 'black', ss: 0, d: 6.0 });
const total = shots.reduce((a, s) => a + s.d, 0);

// Section starts on the output clock
const P = { p2: 8.6, p3: 8.6 + 8 * B2, p4: 8.6 + 8 * B2 + 8 * B3 };
const p5 = P.p4 + 18.1, p6 = p5 + 9.0;
const cards: [string, number, number][] = [
  ['c_1996', 0.25, 2.1], ['c_burns', 2.25, 4.2],
  ['end', p6, total],
];

// Music bed pieces: [start in bed.webm, duration, fade-out]
const bed = JSON.parse(readFileSync(resolve(raw, 'bed.json'), 'utf8')) as Record<string, number>;
const O = 0.05; // the scheduler starts a theme 50 ms after bgm()
const music: [number, number, number][] = [
  [bed.title + O, 8.6, 0.05],
  [bed.shaft + O + 2 * B2, 8 * B2, 0.05], // skip the two-bar intro: drums from the first bar
  [bed.security + O + 2 * B3, 8 * B3, 0.05],
  [bed.boss1 + O, 18.1, 0.05],
  [bed.meltdown + O, 9.0, 0.4],
  [bed.victory + O, 6.0, 1.6],
];
const booms = [4.3, P.p4, p5, p6];

const args: string[] = ['-v', 'error', '-y',
  '-i', resolve(raw, 'video_hd_showcase.webm'), '-i', resolve(raw, 'video_reel.webm'),
  '-i', resolve(raw, 'audio_hd_showcase.webm'), '-i', resolve(raw, 'bed.webm')];
cards.forEach(([n, a, b]) => args.push('-loop', '1', '-framerate', '30', '-t', (b - a + 0.1).toFixed(3), '-i', resolve(raw, 'cards', `${n}.png`)));
const cardBase = 4;
booms.forEach(() => args.push('-f', 'lavfi', '-i', 'sine=f=50:d=1.0'));
const boomBase = cardBase + cards.length;

const f: string[] = [];
shots.forEach((s, i) => {
  if (s.src === 'black') f.push(`color=c=black:s=1280x720:r=30:d=${s.d.toFixed(4)},format=yuv420p[v${i}]`);
  else if (s.src === 'lab') f.push(`[1:v]trim=start=${s.ss}:duration=${s.d.toFixed(4)},setpts=PTS-STARTPTS,fps=30,scale=1280:720,format=yuv420p[v${i}]`);
  // the showcase is darker than the reel: a mild lift, no crop
  else f.push(`[0:v]trim=start=${s.ss}:duration=${s.d.toFixed(4)},setpts=PTS-STARTPTS,fps=30,scale=1280:720:flags=lanczos,eq=gamma=1.1:saturation=1.08,format=yuv420p[v${i}]`);
});
f.push(`${shots.map((_, i) => `[v${i}]`).join('')}concat=n=${shots.length}:v=1:a=0[vc]`);
let cur = 'vc';
cards.forEach(([, a, b], i) => {
  const fadeOut = Math.max(0, b - a - 0.18);
  f.push(`[${cardBase + i}:v]format=rgba,fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=${fadeOut.toFixed(3)}:d=0.15:alpha=1,setpts=PTS+${a.toFixed(3)}/TB[c${i}]`);
  f.push(`[${cur}][c${i}]overlay=eof_action=pass:format=auto[o${i}]`);
  cur = `o${i}`;
});
f.push(`[${cur}]format=yuv420p[vout]`);

// gameplay sfx follow the showcase shots (video time ss maps to audio time ss - offset); black and lab shots are silent
shots.forEach((s, i) => {
  if (s.src === 'show') f.push(`[2:a]atrim=start=${(s.ss - SFX_OFFSET).toFixed(3)}:duration=${s.d.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,aresample=48000,aformat=channel_layouts=stereo[s${i}]`);
  else f.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${s.d.toFixed(4)},asetpts=PTS-STARTPTS[s${i}]`);
});
f.push(`${shots.map((_, i) => `[s${i}]`).join('')}concat=n=${shots.length}:v=0:a=1,volume=0.8[sfx]`);
music.forEach(([st, d, fo], i) => f.push(`[3:a]atrim=start=${st.toFixed(3)}:duration=${d.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=${(d - fo).toFixed(3)}:d=${fo},aresample=48000,aformat=channel_layouts=stereo[m${i}]`));
f.push(`${music.map((_, i) => `[m${i}]`).join('')}concat=n=${music.length}:v=0:a=1[mus]`);
booms.forEach((t, i) => f.push(`[${boomBase + i}:a]afade=t=out:st=0.04:d=0.9,volume=3.2,lowpass=f=140,aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(t * 1000)}|${Math.round(t * 1000)}[b${i}]`));
f.push(`[mus][sfx]${booms.map((_, i) => `[b${i}]`).join('')}amix=inputs=${2 + booms.length}:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9,atrim=duration=${total.toFixed(3)}[aout]`);

args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', total.toFixed(3),
  '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', outFile);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
console.log(JSON.stringify({ status: r.status === 0 ? 'TRAILER' : 'FAILED', total: Number(total.toFixed(2)), shots: shots.length, file: outFile }));
process.exit(r.status ?? 1);

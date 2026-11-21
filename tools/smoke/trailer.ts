// 1080p Full HD trailer assembler (25 fps native, ~71.9 s). Combines clean caption-free Trailer Reel + Watch Showcase
// recordings with the 3-act E minor -> D minor -> E minor arcade music bed and real game SFX cues from bed.webm.
// Outputs docs/evidence/demo/reanimator_trailer.mp4.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raw = resolve(import.meta.dirname, '../../docs/evidence/demo/raw');
const outFile = resolve(import.meta.dirname, '../../docs/evidence/demo/reanimator_trailer.mp4');

interface Meta {
  reelStartSec: number;
}
interface BedJson {
  themes: Record<'title' | 'shaft' | 'security', number>;
  sfx: Record<string, number>;
}

const metaReel = JSON.parse(readFileSync(resolve(raw, 'meta_hd_reel.json'), 'utf8')) as Meta;
const metaShow = JSON.parse(readFileSync(resolve(raw, 'meta_hd_showcase.json'), 'utf8')) as Meta;
const bed = JSON.parse(readFileSync(resolve(raw, 'bed.json'), 'utf8')) as BedJson;

const R0 = metaReel.reelStartSec;
const S0 = metaShow.reelStartSec;

const bar = (bpm: number) => (60 / bpm) * 4;
const B1 = bar(112); // title (E minor) = 2.142857 s
const B2 = bar(128); // shaft (D minor) = 1.875 s
const B3 = bar(146); // security (E minor) = 1.643836 s

interface Shot {
  src: 'reel' | 'show' | 'black';
  ss: number;
  d: number;
  ui?: boolean;
}
const reelShot = (ss: number, d: number, ui = false): Shot => ({ src: 'reel', ss, d, ui });
const showShot = (ss: number, d: number, ui = false): Shot => ({ src: 'show', ss, d, ui });
const blackShot = (d: number): Shot => ({ src: 'black', ss: 0, d, ui: true });

// Act lengths: Act 1 = 8*B1 (17.143 s), Act 2 = 12*B2 (22.500 s), Act 3 = 16*B3 (26.301 s), Outro = 6.000 s
const ACT1 = 8 * B1;
const ACT2 = 12 * B2;
const ACT3 = 16 * B3;
const OUTRO = 6.0;

const shots: Shot[] = [
  // Act 1 (title theme, E minor)
  blackShot(2 * B1),                                        // 0: cold open
  showShot(Math.max(0.5, S0 - 3.2), 1 * B1, true),          // 1: clean title screen
  reelShot(R0 + 3.0, 3 * B1, true),                         // 2: Restoration Lab PASS -> RED MUTATION FAIL
  reelShot(R0 + 12.2, 2 * B1),                              // 3: 1996 <-> 2026 live CRT collapse
  // Act 2 (shaft theme, D minor)
  showShot(S0 + 8.5, 1.5 * B2),                             // 4: Central Shaft
  showShot(S0 + 16.0, 1.5 * B2),                            // 5: Sunken Mines hazards
  reelShot(R0 + 26.2, 3 * B2),                              // 6: Parry + Scan + Weapons
  reelShot(R0 + 38.4, 2 * B2),                              // 7: Reclaimer Hunter
  showShot(S0 + 23.5, 1 * B2),                              // 8: Bio-Labs weapon locks
  showShot(S0 + 46.0, 1.5 * B2),                            // 9: Stage 2 Foundry Line
  showShot(S0 + 63.5, 1.5 * B2),                            // 10: Stage 3 Reactor Spire
  // Act 3 (security theme, E minor return)
  reelShot(R0 + 46.8, 4 * B3),                              // 11: Slag Foreman
  reelShot(R0 + 56.8, 4 * B3),                              // 12: Spire Warden
  reelShot(R0 + 66.8, 4 * B3),                              // 13: Core Warden counter -> Phase III
  reelShot(R0 + 78.8, 3.8),                                 // 14: Meltdown collapsing bridge
  showShot(S0 + 86.2, 4 * B3 - 3.8),                        // 15: Extraction hatch
  // Outro
  blackShot(OUTRO),                                         // 16: End card
];

const shotStart = (idx: number) => shots.slice(0, idx).reduce((a, s) => a + s.d, 0);
const total = shots.reduce((a, s) => a + s.d, 0);
const p2 = ACT1;
const p3 = ACT1 + ACT2;
const pEnd = ACT1 + ACT2 + ACT3;

const cards: [string, number, number, boolean][] = [
  ['c_1996', 0.25, 2.05, false],
  ['c_rebuilt', 2.15, shotStart(1) - 0.10, false],
  ['cap_lab', shotStart(2) + 0.15, shotStart(3) - 0.18, false],
  ['cap_classic', shotStart(3) + 0.15, shotStart(4) - 0.18, false],
  ['cap_sectors', shotStart(4) + 0.15, shotStart(6) - 0.18, false],
  ['cap_combat', shotStart(6) + 0.15, shotStart(7) - 0.18, false],
  ['cap_hunter', shotStart(7) + 0.15, shotStart(9) - 0.18, false],
  ['cap_stages', shotStart(9) + 0.15, shotStart(11) - 0.18, false],
  ['cap_foreman', shotStart(11) + 0.15, shotStart(12) - 0.18, false],
  ['cap_spire', shotStart(12) + 0.15, shotStart(13) - 0.18, false],
  ['cap_warden', shotStart(13) + 0.15, shotStart(14) - 0.18, false],
  ['cap_meltdown', shotStart(14) + 0.15, pEnd - 0.18, false],
  ['end', pEnd, total, true],
];

const O = 0.05;
const XF = 0.35;
const music: { st: number; d: number; fi: number; fo: number }[] = [
  { st: bed.themes.title + O, d: ACT1 + XF, fi: 0.05, fo: 0 },
  { st: bed.themes.shaft + O + 2 * B2, d: ACT2 + XF, fi: 0, fo: 0 },
  { st: bed.themes.security + O + 2 * B3, d: ACT3 + XF, fi: 0, fo: 0 },
  { st: bed.themes.title + O, d: OUTRO, fi: 0, fo: 2.2 },
];

const sfxCues: { key: string; at: number; gain: number }[] = [
  { key: 'slam', at: shotStart(1), gain: 1.3 },
  { key: 'alarm', at: shotStart(2) + 3.0, gain: 0.9 },
  { key: 'sector', at: shotStart(3) + 0.8, gain: 1.2 },
  { key: 'dash', at: p2, gain: 1.0 },
  { key: 'scan', at: shotStart(6) + 0.2, gain: 1.2 },
  { key: 'parry', at: shotStart(6) + 1.75, gain: 1.5 },
  { key: 'scatter', at: shotStart(6) + 3.3, gain: 1.2 },
  { key: 'grenade', at: shotStart(6) + 4.4, gain: 1.2 },
  { key: 'parry', at: shotStart(7) + 1.1, gain: 1.4 },
  { key: 'slam', at: p3, gain: 1.3 },
  { key: 'foreman_atk', at: p3 + 1.9, gain: 1.3 },
  { key: 'explosion', at: p3 + 3.6, gain: 1.4 },
  { key: 'foreman_land', at: p3 + 5.2, gain: 1.3 },
  { key: 'sector', at: shotStart(12), gain: 1.1 },
  { key: 'rail', at: shotStart(12) + 2.0, gain: 1.5 },
  { key: 'rail', at: shotStart(12) + 4.3, gain: 1.5 },
  { key: 'boss_counter', at: shotStart(13) + 0.4, gain: 1.6 },
  { key: 'explosion', at: shotStart(13) + 3.0, gain: 1.5 },
  { key: 'explosion', at: shotStart(13) + 4.8, gain: 1.4 },
  { key: 'alarm', at: shotStart(14), gain: 1.2 },
  { key: 'explosion', at: shotStart(14) + 2.0, gain: 1.4 },
  { key: 'dash', at: shotStart(15) + 0.3, gain: 1.1 },
  { key: 'explosion', at: pEnd, gain: 1.1 },
  { key: 'secret', at: pEnd + 0.2, gain: 1.2 },
];

const args: string[] = [
  '-v', 'error', '-y',
  '-i', resolve(raw, 'video_hd_reel.webm'),
  '-i', resolve(raw, 'video_hd_showcase.webm'),
  '-i', resolve(raw, 'bed.webm'),
];
for (const [name, a, b] of cards) {
  args.push('-loop', '1', '-framerate', '25', '-t', (b - a + 0.1).toFixed(3), '-i', resolve(raw, 'cards', `${name}.png`));
}
const cardBase = 3;

const f: string[] = [];
shots.forEach((s, i) => {
  if (s.src === 'black') {
    f.push(`color=c=black:s=1920x1080:r=25:d=${s.d.toFixed(4)},format=yuv420p[v${i}]`);
  } else {
    const inp = s.src === 'reel' ? 0 : 1;
    const grade = s.ui ? '' : ',eq=gamma=1.08:contrast=1.04:saturation=1.08';
    f.push(`[${inp}:v]trim=start=${s.ss.toFixed(4)}:duration=${s.d.toFixed(4)},setpts=PTS-STARTPTS,fps=25,scale=1920:1080:flags=lanczos${grade},format=yuv420p[v${i}]`);
  }
});
f.push(`${shots.map((_, i) => `[v${i}]`).join('')}concat=n=${shots.length}:v=1:a=0[vc]`);

let cur = 'vc';
cards.forEach(([, a, b, opaque], i) => {
  const dur = Math.max(0.4, b - a);
  const fadeOut = Math.max(0, dur - 0.18);
  if (opaque) {
    f.push(`[${cardBase + i}:v]format=rgba,fade=t=in:st=0:d=0.14:alpha=1,setpts=PTS+${a.toFixed(3)}/TB[c${i}]`);
  } else {
    f.push(`[${cardBase + i}:v]format=rgba,fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=${fadeOut.toFixed(3)}:d=0.15:alpha=1,setpts=PTS+${a.toFixed(3)}/TB[c${i}]`);
  }
  f.push(`[${cur}][c${i}]overlay=eof_action=pass:format=auto[o${i}]`);
  cur = `o${i}`;
});
f.push(`[${cur}]format=yuv420p[vout]`);

// Music bed with triangular bar-line crossfades across Act boundaries
music.forEach((m, i) => {
  const fades = [
    m.fi > 0 ? `afade=t=in:d=${m.fi}` : '',
    m.fo > 0 ? `afade=t=out:st=${(m.d - m.fo).toFixed(3)}:d=${m.fo}` : '',
  ].filter(Boolean).join(',');
  const fadeStr = fades ? `,${fades}` : '';
  f.push(`[2:a]atrim=start=${m.st.toFixed(4)}:duration=${m.d.toFixed(4)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo${fadeStr}[m${i}]`);
});
f.push(`[m0][m1]acrossfade=d=${XF}:c1=tri:c2=tri[ma]`);
f.push(`[ma][m2]acrossfade=d=${XF}:c1=tri:c2=tri[mb]`);
f.push(`[mb][m3]acrossfade=d=${XF}:c1=tri:c2=tri,highpass=f=30,highshelf=f=5500:g=-3.5,volume=0.88[mus]`);

// Real game SFX cues trimmed from bed.webm
sfxCues.forEach((c, i) => {
  const st = bed.sfx[c.key];
  if (st === undefined) throw new Error(`Missing sfx key "${c.key}" in bed.json`);
  const delayMs = Math.round(c.at * 1000);
  f.push(`[2:a]atrim=start=${st.toFixed(4)}:duration=1.35,asetpts=PTS-STARTPTS,afade=t=out:st=1.15:d=0.20,volume=${c.gain},aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[sfx${i}]`);
});
f.push(`${sfxCues.map((_, i) => `[sfx${i}]`).join('')}amix=inputs=${sfxCues.length}:normalize=0:dropout_transition=0[sfx]`);

// Master mix: loudnorm + 48 kHz resample + true-peak brickwall limiter
f.push(`[mus][sfx]amix=inputs=2:normalize=0:dropout_transition=0,loudnorm=I=-14.5:TP=-2.0:LRA=8,aresample=48000,alimiter=limit=0.79:attack=3:release=40:level=disabled,atrim=duration=${total.toFixed(4)}[aout]`);

args.push(
  '-filter_complex', f.join(';'),
  '-map', '[vout]', '-map', '[aout]',
  '-t', total.toFixed(4),
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  outFile,
);

const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
console.log(JSON.stringify({ status: r.status === 0 ? 'TRAILER' : 'FAILED', total: Number(total.toFixed(2)), shots: shots.length, file: outFile }));
process.exit(r.status ?? 1);

// Procedural WebAudio engine (NEW-DESIGN, zero copied files). Original Abuse SFX are excluded by the asset register.
// Graph: [voices] -> sfxBus ---\
//        ambient  -> ambBus -> sfxBus
//        bgm layers -> bgmBus -+-> master -> compressor(limiter) -> destination
// Pure decisions (mapping, attenuation, pan, voice stealing) live in audioLogic.ts; recipes in soundBank.ts; music in themes.ts.
import type { SectorId3D, SoundEvent3D } from '../game3d/types3d.ts';
import { isThrottled, soundIdForEvent, voiceToSteal, type ThemeId, type VoiceInfo } from './audioLogic.ts';
import { SOUND_BANK, type Layer, type SoundId } from './soundBank.ts';
import { stepSeconds, THEMES, type ThemeDef } from './themes.ts';

export type { SoundId };

const MAX_VOICES = 24;
const DEBUG_LOG_SIZE = 48;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let masterVol = 0.5;
let bgmVol = 1;
let sfxVol = 1;
/** AudioContext is only created after a user gesture, so browsers never log the autoplay warning. */
let unlocked = false;

function unlock(): void {
  unlocked = true;
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

function ensure(): AudioContext | null {
  if (!unlocked) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = masterVol;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 14;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master.connect(comp).connect(ctx.destination);
      bgmBus = ctx.createGain();
      bgmBus.gain.value = bgmVol;
      bgmBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxVol;
      sfxBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = 1;
      ambBus.connect(sfxBus);
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setVolume(v: number): void {
  masterVol = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = masterVol;
}
export function setBgmVolume(v: number): void {
  bgmVol = Math.min(1, Math.max(0, v));
  if (bgmBus) bgmBus.gain.value = bgmVol;
}
export function setSfxVolume(v: number): void {
  sfxVol = Math.min(1, Math.max(0, v));
  if (sfxBus) sfxBus.gain.value = sfxVol;
}

// ---- Debug log (also exposed as window.__reanimatorAudio by main.ts) ----
interface PlayLogEntry {
  id: string;
  ms: number;
  gain: number;
  pan: number;
  played: boolean;
}
const recent: PlayLogEntry[] = [];
const counters = { played: 0, stolen: 0, dropped: 0, throttled: 0 };

function logPlay(id: string, gain: number, pan: number, played: boolean): void {
  recent.push({ id, ms: Math.round(performance.now()), gain: Math.round(gain * 100) / 100, pan: Math.round(pan * 100) / 100, played });
  if (recent.length > DEBUG_LOG_SIZE) recent.shift();
}

// ---- One-shot voices ----
interface Voice extends VoiceInfo {
  stop: () => void;
}
const voices: Voice[] = [];
const lastStart = new Map<string, number>();

function startLayer(c: AudioContext, dest: AudioNode, t0: number, l: Layer, sources: AudioScheduledSourceNode[]): void {
  const start = t0 + (l.at ?? 0);
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, l.g), start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + l.d);
  if (l.t === 'o') {
    const o = c.createOscillator();
    o.type = l.w;
    o.frequency.setValueAtTime(l.f, start);
    if (l.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, l.to), start + l.d);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + l.d + 0.02);
    sources.push(o);
  } else {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = l.ft;
    f.Q.value = l.q ?? 1;
    f.frequency.setValueAtTime(l.f, start);
    if (l.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, l.to), start + l.d);
    s.connect(f).connect(g).connect(dest);
    s.start(start, Math.random());
    s.stop(start + l.d + 0.02);
    sources.push(s);
  }
}

/** Plays a recipe. `gain` (0..1) and `pan` (-1..1) come from spatialFor(); defaults are centred full volume. */
export function play(id: SoundId, opts: { gain?: number; pan?: number } = {}): void {
  const rec = SOUND_BANK[id];
  const gain = opts.gain ?? 1;
  const pan = opts.pan ?? 0;
  const wall = performance.now() / 1000;
  if (isThrottled(lastStart.get(id), wall, rec.gap)) {
    counters.throttled++;
    logPlay(id, gain, pan, false);
    return;
  }
  const c = ensure();
  if (!c || !sfxBus || gain < 0.02 || masterVol * sfxVol === 0) {
    logPlay(id, gain, pan, false);
    return;
  }
  const now = c.currentTime;
  // drop expired voices in place
  let w = 0;
  for (let i = 0; i < voices.length; i++) if (voices[i].endsAt > now) voices[w++] = voices[i];
  voices.length = w;
  const steal = voiceToSteal(voices, now, MAX_VOICES, rec.prio);
  if (steal === -2) {
    counters.dropped++;
    logPlay(id, gain, pan, false);
    return;
  }
  if (steal >= 0) {
    voices[steal].stop();
    voices.splice(steal, 1);
    counters.stolen++;
  }
  lastStart.set(id, wall);

  const out = c.createGain();
  out.gain.value = gain;
  let tail: AudioNode = out;
  let panner: StereoPannerNode | null = null;
  if (Math.abs(pan) > 0.01 && typeof c.createStereoPanner === 'function') {
    panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner);
    tail = panner;
  }
  tail.connect(sfxBus);
  const sources: AudioScheduledSourceNode[] = [];
  let dur = 0;
  for (const l of rec.layers) {
    startLayer(c, out, now, l, sources);
    dur = Math.max(dur, (l.at ?? 0) + l.d);
  }
  const last = sources[sources.length - 1];
  if (last) last.onended = () => { out.disconnect(); if (panner) panner.disconnect(); };
  voices.push({
    priority: rec.prio,
    startedAt: now,
    endsAt: now + dur + 0.05,
    stop: () => {
      out.gain.setTargetAtTime(0, c.currentTime, 0.01);
      for (const s of sources) { try { s.stop(c.currentTime + 0.05); } catch { /* already stopped */ } }
    },
  });
  counters.played++;
  logPlay(id, gain, pan, true);
  if (id.startsWith('stinger.')) duckBgm(dur);
}

let duckTimer: ReturnType<typeof setTimeout> | null = null;
function duckBgm(seconds: number): void {
  if (!ctx || !bgmBus) return;
  bgmBus.gain.setTargetAtTime(bgmVol * 0.35, ctx.currentTime, 0.05);
  if (duckTimer) clearTimeout(duckTimer);
  duckTimer = setTimeout(() => {
    if (ctx && bgmBus) bgmBus.gain.setTargetAtTime(bgmVol, ctx.currentTime, 0.4);
    duckTimer = null;
  }, Math.min(3, seconds) * 1000);
}

/** Small named set kept for the UI layer. */
export const sfx = {
  lightOn: () => play('world.light_on'),
  lightOff: () => play('world.light_off'),
  alarm: () => play('world.alarm'),
  lose: () => play('stinger.lose'),
};

export function playSoundEvent3D(ev: SoundEvent3D): void {
  play(soundIdForEvent(ev.type) as SoundId);
}

// ---- Ambient bed: per-sector drone + filtered noise + sparse one-shots ----
interface AmbDef {
  drone: number;
  wave: OscillatorType;
  droneGain: number;
  lfo: number;
  noiseF: number;
  noiseQ: number;
  noiseGain: number;
  one: SoundId | null;
  every: [number, number];
}
const AMB: Record<SectorId3D, AmbDef> = {
  airlock: { drone: 50, wave: 'sine', droneGain: 0.03, lfo: 0.1, noiseF: 1800, noiseQ: 0.7, noiseGain: 0.02, one: 'amb.vent', every: [5, 10] },
  shaft: { drone: 44, wave: 'sine', droneGain: 0.032, lfo: 0.15, noiseF: 500, noiseQ: 0.6, noiseGain: 0.035, one: 'amb.creak', every: [6, 12] },
  mines: { drone: 48, wave: 'sine', droneGain: 0.028, lfo: 0.07, noiseF: 350, noiseQ: 0.8, noiseGain: 0.015, one: 'amb.drip', every: [0.7, 2.6] },
  biolabs: { drone: 58, wave: 'triangle', droneGain: 0.02, lfo: 0.4, noiseF: 900, noiseQ: 2.5, noiseGain: 0.018, one: 'amb.bubble', every: [0.5, 1.8] },
  security: { drone: 60, wave: 'sawtooth', droneGain: 0.014, lfo: 0.05, noiseF: 3200, noiseQ: 4, noiseGain: 0.008, one: 'amb.spark', every: [3, 8] },
  core: { drone: 34, wave: 'sine', droneGain: 0.06, lfo: 0.22, noiseF: 160, noiseQ: 1.2, noiseGain: 0.04, one: 'amb.creak', every: [8, 14] },
};
let ambOsc: OscillatorNode | null = null;
let ambOscGain: GainNode | null = null;
let ambLfo: OscillatorNode | null = null;
let ambLfoGain: GainNode | null = null;
let ambNoise: AudioBufferSourceNode | null = null;
let ambFilter: BiquadFilterNode | null = null;
let ambNoiseGain: GainNode | null = null;
let ambTimer: ReturnType<typeof setInterval> | null = null;
let ambNextOne = 0;
let ambSector: SectorId3D | null = null;

/** Starts, retunes (sector or Meltdown change) or stops the ambient bed. Safe to call repeatedly. */
export function ambient(on: boolean, sector: SectorId3D = 'airlock', meltdown = false): void {
  if (!on) {
    if (ambTimer) clearInterval(ambTimer);
    ambTimer = null;
    ambSector = null;
    if (ctx && ambOscGain && ambNoiseGain) {
      ambOscGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      ambNoiseGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    }
    return;
  }
  const c = ensure();
  if (!c || !ambBus) return;
  if (!ambOsc) {
    ambOsc = c.createOscillator();
    ambOscGain = c.createGain();
    ambOscGain.gain.value = 0;
    ambOsc.connect(ambOscGain).connect(ambBus);
    ambOsc.start();
    ambLfo = c.createOscillator();
    ambLfoGain = c.createGain();
    ambLfo.connect(ambLfoGain).connect(ambOscGain.gain);
    ambLfo.start();
    ambNoise = c.createBufferSource();
    ambNoise.buffer = noiseBuf;
    ambNoise.loop = true;
    ambFilter = c.createBiquadFilter();
    ambFilter.type = 'bandpass';
    ambNoiseGain = c.createGain();
    ambNoiseGain.gain.value = 0;
    ambNoise.connect(ambFilter).connect(ambNoiseGain).connect(ambBus);
    ambNoise.start();
  }
  const def = AMB[sector];
  const t = c.currentTime;
  const boost = meltdown ? 1.4 : 1;
  ambOsc.type = def.wave;
  ambOsc.frequency.setTargetAtTime(def.drone * (meltdown ? 1.26 : 1), t, 0.4);
  ambOscGain!.gain.setTargetAtTime(def.droneGain * boost, t, 0.4);
  ambLfo!.frequency.setTargetAtTime(def.lfo * (meltdown ? 2 : 1), t, 0.4);
  ambLfoGain!.gain.setTargetAtTime(def.droneGain * 0.4, t, 0.4);
  ambFilter!.frequency.setTargetAtTime(def.noiseF, t, 0.4);
  ambFilter!.Q.setTargetAtTime(def.noiseQ, t, 0.4);
  ambNoiseGain!.gain.setTargetAtTime(def.noiseGain * boost, t, 0.4);
  if (ambSector !== sector) ambNextOne = t + 0.5;
  ambSector = sector;
  if (!ambTimer) {
    ambTimer = setInterval(() => {
      if (!ctx || !ambSector) return;
      const d = AMB[ambSector];
      if (!d.one || ctx.currentTime < ambNextOne) return;
      play(d.one, { gain: 0.55 + Math.random() * 0.45, pan: (Math.random() * 2 - 1) * 0.6 });
      ambNextOne = ctx.currentTime + d.every[0] + Math.random() * (d.every[1] - d.every[0]);
    }, 250);
  }
}

// ---- Procedural BGM with per-theme scheduling and crossfades ----
interface MusicLayer {
  theme: ThemeId;
  def: ThemeDef;
  gain: GainNode;
  step: number;
  next: number;
}
let musicLayer: MusicLayer | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;

function note(dest: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
  o.onended = () => g.disconnect();
}

function scheduleMusic(): void {
  const L = musicLayer;
  if (!ctx || !L) return;
  const { def } = L;
  const sd = stepSeconds(def);
  while (L.next < ctx.currentTime + 0.5) {
    const i = L.step % 8;
    const bar = Math.floor(L.step / 8) % def.bars.length;
    const off = def.bars[bar];
    const root = def.root * Math.pow(2, off / 12);
    const t = L.next;
    if (i === 0) note(L.gain, root, t, sd * 8, def.padWave, def.padGain);
    if (i === 0 && def.padWave !== 'sine') note(L.gain, root * 1.5, t, sd * 8, 'sine', def.padGain * 0.6);
    const a = def.arp[i];
    if (a !== null) note(L.gain, root * 4 * Math.pow(2, a / 12), t, sd * 1.7, def.arpWave, def.arpGain);
    if (def.kick[i] === 'x') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(L.gain);
      o.start(t);
      o.stop(t + 0.22);
      o.onended = () => g.disconnect();
      if (def.bass) note(L.gain, root * 2, t, sd * 0.9, 'triangle', 0.05);
    }
    if (def.hat[i] === 'x' && noiseBuf) {
      const s = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      s.buffer = noiseBuf;
      s.loop = true;
      f.type = 'highpass';
      f.frequency.value = 6500;
      g.gain.setValueAtTime(0.022, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.connect(f).connect(g).connect(L.gain);
      s.start(t, Math.random());
      s.stop(t + 0.06);
      s.onended = () => g.disconnect();
    }
    L.next += sd;
    L.step++;
  }
}

function retire(layer: MusicLayer, fadeTau: number): void {
  if (!ctx) return;
  layer.gain.gain.setTargetAtTime(0, ctx.currentTime, fadeTau);
  setTimeout(() => layer.gain.disconnect(), fadeTau * 8000 + 500);
}

/** Starts, switches (crossfade) or stops the music. Safe to call every frame. */
export function bgm(on: boolean, theme: ThemeId = 'airlock'): void {
  if (!on) {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    if (musicLayer) retire(musicLayer, 0.15);
    musicLayer = null;
    return;
  }
  const c = ensure();
  if (!c || !bgmBus) return;
  if (musicLayer && musicLayer.theme === theme && musicTimer) return;
  if (musicLayer) retire(musicLayer, 0.55);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(1, c.currentTime, 0.55);
  gain.connect(bgmBus);
  musicLayer = { theme, def: THEMES[theme], gain, step: 0, next: c.currentTime + 0.05 };
  if (!musicTimer) musicTimer = setInterval(scheduleMusic, 100);
  scheduleMusic();
}

export function getAudioDebug() {
  return {
    state: ctx ? ctx.state : 'none',
    unlocked,
    volumes: { master: masterVol, bgm: bgmVol, sfx: sfxVol },
    theme: musicLayer ? musicLayer.theme : null,
    ambientSector: ambSector,
    activeVoices: ctx ? voices.filter((v) => v.endsAt > ctx!.currentTime).length : 0,
    maxVoices: MAX_VOICES,
    counters: { ...counters },
    recent: recent.slice(),
  };
}

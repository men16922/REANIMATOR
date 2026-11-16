// Procedural WebAudio engine (NEW-DESIGN, zero copied files). Original Abuse SFX are excluded by the asset register.
// Graph: [voices] -> (distance lowpass) -> (pan) -> sfxBus -+-> master
//        ambient  -> ambBus -> sfxBus                      +-> reverb send
//        bgm layer(pad/melody/drums) -> bgmBus -> bgmDuck -> pauseFilter -> master (+ reverb send)
//        melody -> delay send -> feedback delay -> bgmBus
//        reverb: small + large ConvolverNodes (procedural IR) with per-room return gains
//        master -> glue compressor -> brickwall limiter -> destination
// Pure decisions (mapping, attenuation, pan, voice stealing) live in audioLogic.ts; recipes in soundBank.ts; music in themes.ts.
import type { SectorId3D, SoundEvent3D } from '../game3d/types3d.ts';
import {
  chargePitch, crowdGain, cueForEvent, fanfareFor, impulseResponse, isThrottled, LOOP_BASE, musicDuckFor, roomFor, roomMix, voiceToSteal,
  type LoopKind, type LoopTarget, type ThemeId, type VoiceInfo,
} from './audioLogic.ts';
import { SOUND_BANK, type Layer, type SoundId } from './soundBank.ts';
import {
  chordAt, delaySeconds, ESCAPE_LAYERS, escapeKeyLift, escapeStageFor, escapeTempoScale, fillHit, formAt, formOf, layersAt, semitone,
  STAGE_AMBIENT, stepSeconds, STEPS_PER_BAR, themeForStage,
  type Chord, type StageNo, type FormPos, type LayerMask, type ThemeDef,
} from './themes.ts';

export type { SoundId };

const MAX_VOICES = 24;
const DEBUG_LOG_SIZE = 48;

const LOOKAHEAD = 0.5;
/** Music sits a little above the nominal level so gunfire cannot bury it; SFX are trimmed for headroom. */
const BGM_TRIM = 1.4;
const SFX_TRIM = 0.85;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmBus: GainNode | null = null;
let bgmDuck: GainNode | null = null;
let pauseFilter: BiquadFilterNode | null = null;
let sfxBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let revIn: GainNode | null = null;
let revSmall: GainNode | null = null;
let revLarge: GainNode | null = null;
let delayIn: GainNode | null = null;
let delayNode: DelayNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let masterVol = 0.5;
let bgmVol = 1;
let sfxVol = 1;
let pausedFlag = false;
/** AudioContext is only created after a user gesture, so browsers never log the autoplay warning. */
let unlocked = false;

/** Music requested before the first user gesture (title screen): started as soon as the context may exist. */
let pendingBgm: ThemeId | null = null;
let pendingStage: StageNo = 1;

function unlock(): void {
  unlocked = true;
  if (ctx && ctx.state === 'suspended') void ctx.resume();
  if (pendingBgm) {
    const t = pendingBgm;
    pendingBgm = null;
    bgm(true, t, pendingStage);
  }
}
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

function convolver(c: AudioContext, seconds: number, decay: number, seed: number): ConvolverNode {
  const [l, r] = impulseResponse(c.sampleRate, seconds, decay, seed);
  const buf = c.createBuffer(2, l.length, c.sampleRate);
  buf.getChannelData(0).set(l);
  buf.getChannelData(1).set(r);
  const cv = c.createConvolver();
  cv.buffer = buf;
  return cv;
}

function ensure(): AudioContext | null {
  if (!unlocked) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = masterVol;
      // Glue compressor then a fast brickwall limiter: simultaneous explosions cannot clip.
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -18;
      glue.knee.value = 12;
      glue.ratio.value = 4;
      glue.attack.value = 0.008;
      glue.release.value = 0.25;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.12;
      master.connect(glue).connect(limiter).connect(ctx.destination);

      // Music: volume -> duck -> pause filter -> master
      bgmBus = ctx.createGain();
      bgmBus.gain.value = bgmVol * BGM_TRIM;
      bgmDuck = ctx.createGain();
      pauseFilter = ctx.createBiquadFilter();
      pauseFilter.type = 'lowpass';
      pauseFilter.frequency.value = 20000;
      bgmBus.connect(bgmDuck).connect(pauseFilter).connect(master);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxVol * SFX_TRIM;
      sfxBus.connect(master);
      ambBus = ctx.createGain();
      ambBus.gain.value = 1;
      ambBus.connect(sfxBus);

      // Reverb: shared input, two impulse responses crossfaded by room size
      revIn = ctx.createGain();
      revSmall = ctx.createGain();
      revLarge = ctx.createGain();
      revIn.connect(convolver(ctx, 0.55, 3, 11)).connect(revSmall).connect(master);
      revIn.connect(convolver(ctx, 2.6, 2.4, 29)).connect(revLarge).connect(master);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.9;
      sfxBus.connect(sfxSend).connect(revIn);
      const bgmSend = ctx.createGain();
      bgmSend.gain.value = 0.6;
      pauseFilter.connect(bgmSend).connect(revIn);
      setRoom('airlock', true);

      // Tempo-synced feedback delay for melodic layers
      delayIn = ctx.createGain();
      delayNode = ctx.createDelay(2);
      delayNode.delayTime.value = 0.4;
      const fb = ctx.createGain();
      fb.gain.value = 0.4;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      const dOut = ctx.createGain();
      dOut.gain.value = 0.55;
      delayIn.connect(delayNode).connect(tone);
      tone.connect(fb).connect(delayNode);
      tone.connect(dOut).connect(bgmBus);
      delayFb = fb;

      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      applyPause();
    } catch {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
let delayFb: GainNode | null = null;
let roomName: ThemeId | null = null;

/** Retunes the shared reverb to a room (small dry room ... large hall). Glides unless `now`. */
function setRoom(id: ThemeId, now = false): void {
  roomName = id;
  if (!ctx || !revSmall || !revLarge) return;
  const m = roomMix(roomFor(id));
  const tc = now ? 0.001 : 0.5;
  revSmall.gain.setTargetAtTime(m.small, ctx.currentTime, tc);
  revLarge.gain.setTargetAtTime(m.large, ctx.currentTime, tc);
}

function applyPause(): void {
  if (!ctx || !pauseFilter || !bgmDuck || !ambBus) return;
  const t = ctx.currentTime;
  pauseFilter.frequency.setTargetAtTime(pausedFlag ? 420 : 20000, t, 0.1);
  bgmDuck.gain.setTargetAtTime(pausedFlag ? 0.55 : 1, t, 0.12);
  ambBus.gain.setTargetAtTime(pausedFlag ? 0.35 : 1, t, 0.12);
}

/** Pause menu: music drops behind a lowpass filter and the ambient bed ducks. Safe before the context exists. */
export function setPaused(p: boolean): void {
  pausedFlag = p;
  applyPause();
}

export function setVolume(v: number): void {
  masterVol = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = masterVol;
}
export function setBgmVolume(v: number): void {
  bgmVol = Math.min(1, Math.max(0, v));
  if (bgmBus) bgmBus.gain.value = bgmVol * BGM_TRIM;
}
export function setSfxVolume(v: number): void {
  sfxVol = Math.min(1, Math.max(0, v));
  if (sfxBus) sfxBus.gain.value = sfxVol * SFX_TRIM;
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

function startLayer(c: AudioContext, dest: AudioNode, t0: number, l: Layer, sources: AudioScheduledSourceNode[], pitch: number): void {
  const start = t0 + (l.at ?? 0);
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, l.g), start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + l.d);
  if (l.t === 'o') {
    const o = c.createOscillator();
    o.type = l.w;
    o.frequency.setValueAtTime(l.f * pitch, start);
    if (l.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, l.to * pitch), start + l.d);
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

/**
 * Plays a recipe. `gain` (0..1), `pan` (-1..1) and `lp` (distance lowpass cutoff in Hz) come from spatialFor();
 * `pitch` multiplies oscillator frequencies. Defaults are centred, full volume, unfiltered.
 */
export function play(id: SoundId, opts: { gain?: number; pan?: number; pitch?: number; lp?: number } = {}): void {
  const rec = SOUND_BANK[id];
  const pan = opts.pan ?? 0;
  const pitch = opts.pitch ?? 1;
  const lp = opts.lp ?? 20000;
  const wall = performance.now() / 1000;
  const reqGain = opts.gain ?? 1;
  if (isThrottled(lastStart.get(id), wall, rec.gap)) {
    counters.throttled++;
    logPlay(id, reqGain, pan, false);
    return;
  }
  const c = ensure();
  if (!c || !sfxBus || reqGain < 0.02 || masterVol * sfxVol === 0) {
    logPlay(id, reqGain, pan, false);
    return;
  }
  const now = c.currentTime;
  // drop expired voices in place
  let w = 0;
  for (let i = 0; i < voices.length; i++) if (voices[i].endsAt > now) voices[w++] = voices[i];
  voices.length = w;
  const gain = reqGain * crowdGain(voices.length, MAX_VOICES);
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
  const chain: AudioNode[] = [out];
  let tail: AudioNode = out;
  if (lp < 15000) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.max(300, lp);
    tail.connect(f);
    tail = f;
    chain.push(f);
  }
  if (Math.abs(pan) > 0.01 && typeof c.createStereoPanner === 'function') {
    const panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    tail.connect(panner);
    tail = panner;
    chain.push(panner);
  }
  tail.connect(sfxBus);
  const sources: AudioScheduledSourceNode[] = [];
  let dur = 0;
  let lastEnd = -1;
  let lastSrc: AudioScheduledSourceNode | null = null;
  for (const l of rec.layers) {
    startLayer(c, out, now, l, sources, pitch);
    const end = (l.at ?? 0) + l.d;
    dur = Math.max(dur, end);
    if (end >= lastEnd) { lastEnd = end; lastSrc = sources[sources.length - 1]; }
  }
  // Free the whole chain when the longest layer ends (no leaked nodes)
  if (lastSrc) lastSrc.onended = () => { for (const n of chain) n.disconnect(); };
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
  if (id.startsWith('stinger.')) duckBgm(0.35, Math.min(3, dur));
  else if (id.startsWith('fanfare.')) duckBgm(0.22, Math.min(3, dur * 0.8));
  else if (musicDuckFor(rec.prio) < 1 && !id.startsWith('ui.') && id !== 'player.heartbeat') duckBgm(musicDuckFor(rec.prio), 0.35);
}

/** Dips the music (sidechain-style) and lets it recover. Uses its own gain stage, so the sliders are untouched. */
function duckBgm(amount: number, hold: number): void {
  if (!ctx || !bgmDuck) return;
  const t = ctx.currentTime;
  const floor = pausedFlag ? 0.55 : 1;
  if (typeof bgmDuck.gain.cancelAndHoldAtTime === 'function') bgmDuck.gain.cancelAndHoldAtTime(t);
  else bgmDuck.gain.cancelScheduledValues(t);
  bgmDuck.gain.setTargetAtTime(floor * amount, t, 0.03);
  bgmDuck.gain.setTargetAtTime(floor, t + hold, 0.35);
}

/** Plays a simulation event with per-pattern boss warnings and pitch scaling (combo chain length etc.). */
export function playCue(ev: SoundEvent3D, spatial: { gain?: number; pan?: number; lp?: number } = {}, bossPattern = 'none'): void {
  const cue = cueForEvent(ev, bossPattern);
  play(cue.id as SoundId, { ...spatial, gain: (spatial.gain ?? 1) * cue.gain, pitch: cue.pitch });
}

/** Small named set kept for the UI layer. */
export const sfx = {
  lightOn: () => play('world.light_on'),
  lightOff: () => play('world.light_off'),
  alarm: () => play('world.alarm'),
  lose: () => play('stinger.lose'),
};

/** Item pickup jingle (2-3 s, music ducks under it). `kind` is an upgrade kind or 'weapon'. Returns false when the kind has no fanfare. */
export function playFanfare(kind: string): boolean {
  const id = fanfareFor(kind);
  if (!id) return false;
  play(id as SoundId);
  return true;
}

export function playSoundEvent3D(ev: SoundEvent3D, bossPattern = 'none'): void {
  playCue(ev, {}, bossPattern);
}

// ---- Proximity loops: persistent hum beds (steam vents, laser grids, cargo lift motors) ----
// Each loop owns a few oscillator/noise nodes. setLoops() is called every tick with the planned targets (distance, pan, lowpass already
// applied by planLoops). Loops that drop out of the list fade away and are freed, so leaving a sector cleans them up.
interface LoopVoice {
  kind: LoopKind;
  out: GainNode;
  lp: BiquadFilterNode;
  pan: StereoPannerNode | null;
  sources: AudioScheduledSourceNode[];
  pitchable: OscillatorNode[];
  pitchBase: number[];
  timer: ReturnType<typeof setTimeout> | null;
}
const loopVoices = new Map<string, LoopVoice>();

function buildLoop(c: AudioContext, kind: LoopKind): LoopVoice | null {
  if (!ambBus || !noiseBuf) return null;
  const out = c.createGain();
  out.gain.value = 0;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 20000;
  const pan = typeof c.createStereoPanner === 'function' ? c.createStereoPanner() : null;
  out.connect(lp);
  if (pan) { lp.connect(pan); pan.connect(ambBus); } else lp.connect(ambBus);
  const sources: AudioScheduledSourceNode[] = [];
  const pitchable: OscillatorNode[] = [];
  const pitchBase: number[] = [];
  const osc = (type: OscillatorType, f: number, g: number, filt?: BiquadFilterNode): OscillatorNode => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const gn = c.createGain();
    gn.gain.value = g;
    if (filt) o.connect(filt).connect(gn);
    else o.connect(gn);
    gn.connect(out);
    o.start();
    sources.push(o);
    return o;
  };
  const noise = (ft: BiquadFilterType, f: number, q: number, g: number): void => {
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = ft;
    fl.frequency.value = f;
    fl.Q.value = q;
    const gn = c.createGain();
    gn.gain.value = g;
    s.connect(fl).connect(gn).connect(out);
    s.start(0, Math.random());
    sources.push(s);
  };
  if (kind === 'vent') {
    // steam: breathy band noise with a low pressure hum
    noise('bandpass', 900, 1.4, 0.8);
    noise('highpass', 4200, 0.7, 0.18);
    osc('sine', 62, 0.45);
  } else if (kind === 'laser') {
    // electric hum: detuned saw pair, a 100 Hz buzz and faint crackle
    const f1 = c.createBiquadFilter();
    f1.type = 'lowpass';
    f1.frequency.value = 900;
    osc('sawtooth', 100, 0.5, f1);
    osc('sawtooth', 100.9, 0.4, f1);
    osc('square', 200, 0.12);
    noise('highpass', 5200, 0.8, 0.07);
  } else {
    // lift motor: low saw drone through a lowpass plus gear rumble; pitch follows the lift speed
    const f1 = c.createBiquadFilter();
    f1.type = 'lowpass';
    f1.frequency.value = 520;
    f1.Q.value = 2;
    const a = osc('sawtooth', 48, 0.6, f1);
    const b = osc('triangle', 96, 0.3);
    pitchable.push(a, b);
    pitchBase.push(48, 96);
    noise('lowpass', 260, 0.8, 0.5);
  }
  return { kind, out, lp, pan, sources, pitchable, pitchBase, timer: null };
}

function freeLoop(key: string, v: LoopVoice): void {
  for (const s of v.sources) { try { s.stop(); } catch { /* already stopped */ } }
  v.out.disconnect();
  v.lp.disconnect();
  v.pan?.disconnect();
  loopVoices.delete(key);
}

/** Applies the planned loop targets: creates new voices, updates the rest, fades out and frees any loop that is no longer planned. */
export function setLoops(targets: readonly LoopTarget[]): void {
  if (!ctx) {
    if (targets.length === 0) return;
    if (!ensure()) return;
  }
  const c = ctx;
  if (!c) return;
  const t = c.currentTime;
  const live = new Set<string>();
  for (const tg of targets) {
    live.add(tg.key);
    let v = loopVoices.get(tg.key);
    if (!v) {
      const nv = buildLoop(c, tg.kind);
      if (!nv) continue;
      loopVoices.set(tg.key, nv);
      v = nv;
    }
    if (v.timer) { clearTimeout(v.timer); v.timer = null; }
    v.out.gain.setTargetAtTime(tg.gain * LOOP_BASE[tg.kind], t, 0.12);
    v.lp.frequency.setTargetAtTime(Math.max(300, tg.lp), t, 0.1);
    if (v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, tg.pan)), t, 0.1);
    for (let i = 0; i < v.pitchable.length; i++) v.pitchable[i].frequency.setTargetAtTime(v.pitchBase[i] * tg.rate, t, 0.3);
  }
  for (const [key, v] of loopVoices) {
    if (live.has(key) || v.timer) continue;
    v.out.gain.setTargetAtTime(0, t, 0.1);
    v.timer = setTimeout(() => freeLoop(key, v), 900);
  }
}

// ---- Rail-cannon charge loop: one persistent oscillator pair whose pitch climbs with the charge ----
let railOsc: OscillatorNode | null = null;
let railSub: OscillatorNode | null = null;
let railFilter: BiquadFilterNode | null = null;
let railGain: GainNode | null = null;
let railLast = -1;

/** Sets the charge loop from a fraction 0..1 (0 releases it). Cheap to call every tick. */
export function railCharge(frac: number): void {
  const q = Math.round(Math.max(0, Math.min(1, frac)) * 48) / 48;
  if (q === railLast) return;
  if (q === 0 && !railGain) { railLast = 0; return; }
  const c = ensure();
  if (!c || !sfxBus) return;
  railLast = q;
  if (!railOsc) {
    railOsc = c.createOscillator();
    railOsc.type = 'sawtooth';
    railSub = c.createOscillator();
    railSub.type = 'sine';
    railFilter = c.createBiquadFilter();
    railFilter.type = 'lowpass';
    railFilter.Q.value = 4;
    railGain = c.createGain();
    railGain.gain.value = 0;
    railOsc.connect(railFilter).connect(railGain).connect(sfxBus);
    railSub.connect(railGain);
    railOsc.start();
    railSub.start();
  }
  const t = c.currentTime;
  const f = chargePitch(q);
  railOsc.frequency.setTargetAtTime(f, t, 0.03);
  railSub!.frequency.setTargetAtTime(f / 2, t, 0.03);
  railFilter!.frequency.setTargetAtTime(f * 3, t, 0.03);
  railGain!.gain.setTargetAtTime(q === 0 ? 0 : 0.03 + 0.07 * q, t, q === 0 ? 0.04 : 0.03);
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
export function ambient(on: boolean, sector: SectorId3D = 'airlock', meltdown = false, stage: StageNo = 1): void {
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
  const sa = STAGE_AMBIENT[stage];
  const t = c.currentTime;
  setRoom(meltdown ? 'meltdown' : sector);
  const boost = meltdown ? 1.4 : 1;
  ambOsc.type = def.wave;
  ambOsc.frequency.setTargetAtTime(def.drone * sa.droneMul * (meltdown ? 1.26 : 1), t, 0.4);
  ambOscGain!.gain.setTargetAtTime(def.droneGain * boost, t, 0.4);
  ambLfo!.frequency.setTargetAtTime(def.lfo * (meltdown ? 2 : 1), t, 0.4);
  ambLfoGain!.gain.setTargetAtTime(def.droneGain * 0.4, t, 0.4);
  ambFilter!.frequency.setTargetAtTime(def.noiseF * sa.noiseFMul, t, 0.4);
  ambFilter!.Q.setTargetAtTime(def.noiseQ, t, 0.4);
  ambNoiseGain!.gain.setTargetAtTime(def.noiseGain * sa.noiseGainMul * boost, t, 0.4);
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

// ---- Procedural BGM: 16-step sections (intro/A/B/break), chord progressions, sidechain pump, reverb and delay sends ----
interface MusicLayer {
  theme: ThemeId;
  /** Stage the theme is voiced for (themeForStage). */
  stage: StageNo;
  def: ThemeDef;
  /** Layer output (crossfaded between themes). */
  gain: GainNode;
  /** Pad and melody pass through the sidechain duck. */
  padBus: GainNode;
  melody: GainNode;
  delaySend: GainNode;
  bar: number;
  stepInBar: number;
  next: number;
  pos: FormPos;
  mask: LayerMask;
  rootHz: number;
  chord: Chord;
  /** Set when the boss phase changes: the next bar opens with a crash and tom hit. */
  accent: boolean;
}
let musicLayer: MusicLayer | null = null;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let bossIntensity: 1 | 2 | 3 = 1;
/** Meltdown ticks remaining (-1 outside the escape). Drives the escape stage layers, tempo and key lift. */
let escapeTicks = -1;
let escapeStage = 0;

function tone(dest: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, gain: number, attack = 0.015, detune = 0): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (detune) o.detune.value = detune;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
  o.onended = () => g.disconnect();
}

function bassNote(dest: AudioNode, freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(Math.min(2400, freq * 14), start);
  f.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 2), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(f).connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
  o.onended = () => g.disconnect();
}

function noiseHit(dest: AudioNode, start: number, dur: number, gain: number, ft: BiquadFilterType, f0: number, f1: number, q = 1): void {
  if (!ctx || !noiseBuf) return;
  const s = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  s.buffer = noiseBuf;
  s.loop = true;
  f.type = ft;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, start);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, start + dur);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  s.connect(f).connect(g).connect(dest);
  s.start(start, Math.random());
  s.stop(start + dur + 0.02);
  s.onended = () => g.disconnect();
}

function kickHit(dest: AudioNode, t: number, gain: number): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.26);
  o.onended = () => g.disconnect();
  noiseHit(dest, t, 0.015, gain * 0.25, 'highpass', 3000, 3000);
}

function tomHit(dest: AudioNode, t: number, gain: number, f: number): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.2);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.28);
  o.onended = () => g.disconnect();
}

/** Industrial metal clang: four inharmonic partials through a band-pass, plus a noise strike. */
function clangHit(dest: AudioNode, t: number, gain: number, base: number): void {
  if (!ctx) return;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = base * 3;
  f.Q.value = 0.8;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  f.connect(g).connect(dest);
  let last: OscillatorNode | null = null;
  for (const r of [1, 2.76, 5.4, 8.93]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = Math.min(9000, base * r);
    o.connect(f);
    o.start(t);
    o.stop(t + 0.52);
    last = o;
  }
  if (last) last.onended = () => { g.disconnect(); f.disconnect(); };
  noiseHit(dest, t, 0.04, gain * 0.8, 'bandpass', 2400, 1200, 2);
}

function scheduleMusic(): void {
  const L = musicLayer;
  if (!ctx || !L) return;
  const def = L.def;
  const boss = L.theme === 'boss';
  const esc = L.theme === 'meltdown';
  const inten = boss ? bossIntensity : 1;
  while (L.next < ctx.currentTime + LOOKAHEAD) {
    // The escape tempo climbs with the seal stage and the final-10-second dash, so the step length is re-read every step
    const tempo = esc ? escapeTempoScale(escapeTicks) : 1;
    const sd = stepSeconds(def, inten) / tempo;
    const t = L.next;
    const si = L.stepInBar;
    if (si === 0) {
      L.pos = formAt(formOf(def), L.bar);
      L.mask = esc ? ESCAPE_LAYERS[escapeStage] : layersAt(L.pos, inten, boss);
      const ch = chordAt(def, L.bar);
      L.rootHz = esc ? ch.rootHz * Math.pow(2, escapeKeyLift(escapeStage) / 12) : ch.rootHz;
      if (esc) tuneDelay(def, 1, tempo);
      L.chord = ch.chord;
      const bd = sd * STEPS_PER_BAR;
      if (L.mask.pad) {
        const thick = def.padWave === 'sawtooth' || def.padWave === 'square';
        const per = def.padGain / Math.sqrt(L.chord.length * (thick ? 2 : 1));
        for (const iv of L.chord) {
          const f = semitone(L.rootHz * 2, iv);
          tone(L.padBus, f, t, bd * 1.05, def.padWave, per, bd * 0.35, thick ? -7 : 0);
          if (thick) tone(L.padBus, f, t, bd * 1.05, def.padWave, per, bd * 0.35, 7);
        }
      }
      // Crash on section starts (and boss phase accents), riser into the next section
      if ((L.pos.sectionStart && (L.pos.section === 'a' || L.pos.section === 'b')) || L.accent) {
        noiseHit(L.gain, t, 1.1, 0.03, 'highpass', 5000, 5000);
        if (L.accent) tomHit(L.gain, t, 0.14, 90);
        L.accent = false;
      }
      if (L.pos.riser || (esc && escapeStage >= 5)) noiseHit(L.gain, t, bd, 0.05, 'bandpass', 400, 6000, 1.5);
    }
    const m = L.mask;
    const inFill = L.pos.fill && si >= 12 && (m.snare || m.kick);
    const a = def.arp[si];
    if (m.arp && a !== null) {
      const f = semitone(L.rootHz * 4, a);
      tone(L.melody, f, t, sd * 1.9, def.arpWave, def.arpGain);
    }
    const ld = def.lead[si];
    if (m.lead && ld !== null) {
      const dur = L.theme === 'meltdown' ? sd * 0.95 : sd * 2.6;
      tone(L.melody, semitone(L.rootHz * 8, ld), t, dur, def.leadWave, def.leadGain, 0.02);
    }
    const bs = def.bassLine[si];
    if (m.bass && bs !== null) {
      const bf = semitone(L.rootHz * (L.rootHz < 50 ? 2 : 1), bs);
      bassNote(L.gain, bf, t, sd * 1.7, def.bassWave, def.bassGain);
    }
    if (m.kick && def.kick[si] === 'x') {
      kickHit(L.gain, t, 0.11 + (si === 0 ? 0.02 : 0));
      if (def.duck > 0) {
        L.padBus.gain.setValueAtTime(1 - def.duck, t);
        L.padBus.gain.linearRampToValueAtTime(1, t + 0.22);
      }
    }
    if (inFill) {
      const h = fillHit(si);
      noiseHit(L.gain, t, 0.12, 0.05 * h, 'bandpass', 1800, 900, 1.2);
      tomHit(L.gain, t, 0.09 * h, 210 - (si - 12) * 25);
    } else if (m.snare && def.snare[si] === 'x') {
      noiseHit(L.gain, t, 0.14, 0.06, 'bandpass', 2200, 1200, 1);
      tomHit(L.gain, t, 0.05, 200);
    }
    const hc = def.hat[si];
    if (m.hat && (hc === 'x' || hc === 'o')) {
      const accent = si % 4 === 2 ? 1 : 0.65;
      noiseHit(L.gain, t, hc === 'o' ? 0.22 : 0.05, 0.022 * accent, 'highpass', 6500, 6500);
    }
    const pc = def.perc[si];
    if (m.perc && pc === 'c') clangHit(L.gain, t, 0.04, semitone(L.rootHz * 8, (L.bar % 4) * 2));
    else if (m.perc && pc === 't') tomHit(L.gain, t, 0.08, 150 + (L.bar % 3) * 30);
    L.next += sd;
    L.stepInBar++;
    if (L.stepInBar >= STEPS_PER_BAR) {
      L.stepInBar = 0;
      L.bar++;
    }
  }
}

function retire(layer: MusicLayer, fadeTau: number): void {
  if (!ctx) return;
  layer.gain.gain.setTargetAtTime(0, ctx.currentTime, fadeTau);
  setTimeout(() => { layer.gain.disconnect(); layer.delaySend.disconnect(); }, fadeTau * 8000 + 700);
}

/** Applies the delay time and feedback of a theme to the shared delay. */
function tuneDelay(def: ThemeDef, inten: 1 | 2 | 3, tempo = 1): void {
  if (!ctx || !delayNode || !delayFb) return;
  delayNode.delayTime.setTargetAtTime(Math.min(1.9, delaySeconds(def, inten) / tempo), ctx.currentTime, 0.15);
  delayFb.gain.setTargetAtTime(def.delayFb, ctx.currentTime, 0.15);
}

/** Boss phase 1..3: more layers and ~4% more tempo per phase. Takes effect from the next bar. */
export function musicIntensity(n: number): void {
  const v = (n >= 3 ? 3 : n <= 1 ? 1 : 2) as 1 | 2 | 3;
  if (v === bossIntensity) return;
  bossIntensity = v;
  if (musicLayer && musicLayer.theme === 'boss') {
    musicLayer.accent = true;
    tuneDelay(musicLayer.def, v);
  }
}

/**
 * Escape sequence intensity from the meltdown ticks remaining (-1 outside the escape). Each bulkhead stage stacks a layer and nudges the
 * tempo up; the last 10 s accelerate further. Only affects the meltdown theme. Cheap to call every tick.
 */
export function escapeMusic(meltdownTicks: number): void {
  escapeTicks = meltdownTicks;
  const stage = escapeStageFor(meltdownTicks);
  if (stage === escapeStage) return;
  escapeStage = stage;
  if (musicLayer && musicLayer.theme === 'meltdown') musicLayer.accent = true;
}

/** Starts, switches (crossfade) or stops the music. Safe to call every frame. */
export function bgm(on: boolean, theme: ThemeId = 'airlock', stage: StageNo = 1): void {
  pendingBgm = on ? theme : null;
  pendingStage = stage;
  if (!on) {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
    if (musicLayer) retire(musicLayer, 0.15);
    musicLayer = null;
    return;
  }
  const c = ensure();
  if (!c || !bgmBus) return;
  pendingBgm = null;
  if (musicLayer && musicLayer.theme === theme && musicLayer.stage === stage && musicTimer) return;
  if (musicLayer) retire(musicLayer, 0.55);
  const def = themeForStage(theme, stage);
  const gain = c.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(1, c.currentTime, 0.55);
  gain.connect(bgmBus);
  const padBus = c.createGain();
  padBus.connect(gain);
  const melody = c.createGain();
  melody.connect(padBus);
  const delaySend = c.createGain();
  delaySend.gain.value = 0.5;
  melody.connect(delaySend);
  if (delayIn) delaySend.connect(delayIn);
  if (theme !== 'boss') bossIntensity = 1;
  if (theme !== 'meltdown') { escapeTicks = -1; escapeStage = 0; }
  musicLayer = {
    theme, stage, def, gain, padBus, melody, delaySend, bar: 0, stepInBar: 0, next: c.currentTime + 0.05,
    pos: formAt(formOf(def), 0), mask: layersAt(formAt(formOf(def), 0)), rootHz: def.root, chord: def.prog[0].chord, accent: false,
  };
  tuneDelay(def, bossIntensity);
  if (!musicTimer) musicTimer = setInterval(scheduleMusic, 100);
  scheduleMusic();
}

export function getAudioDebug() {
  return {
    state: ctx ? ctx.state : 'none',
    unlocked,
    volumes: { master: masterVol, bgm: bgmVol, sfx: sfxVol },
    theme: musicLayer ? musicLayer.theme : null,
    stage: musicLayer ? musicLayer.stage : null,
    music: musicLayer
      ? { section: musicLayer.pos.section, bar: musicLayer.bar, step: musicLayer.stepInBar, intensity: bossIntensity, layers: Object.entries(musicLayer.mask).filter(([, v]) => v).map(([k]) => k) }
      : null,
    paused: pausedFlag,
    room: roomName,
    rail: railLast,
    ambientSector: ambSector,
    escape: { ticks: escapeTicks, stage: escapeStage },
    loops: [...loopVoices.keys()],
    activeVoices: ctx ? voices.filter((v) => v.endsAt > ctx!.currentTime).length : 0,
    trackedVoices: voices.length,
    maxVoices: MAX_VOICES,
    counters: { ...counters },
    recent: recent.slice(),
  };
}

// Console helpers for manual checks: __reanimatorAudio.play('boss.phase'), .bgm(true,'boss'), .musicIntensity(3), .railCharge(0.5)
getAudioDebug.play = play;
getAudioDebug.bgm = bgm;
getAudioDebug.musicIntensity = musicIntensity;
getAudioDebug.railCharge = railCharge;
getAudioDebug.setPaused = setPaused;
getAudioDebug.playFanfare = playFanfare;
getAudioDebug.escapeMusic = escapeMusic;
getAudioDebug.setLoops = setLoops;

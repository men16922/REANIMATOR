// Synthesised sound effects (NEW-DESIGN WebAudio API, zero copied files). Original Abuse SFX are excluded by the asset register.
import type { SoundEvent3D } from '../game3d/types3d.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 0.5;
let hum: OscillatorNode | null = null;
let humGain: GainNode | null = null;

function ensure(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = volume;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0) {
  const c = ensure();
  if (!c || !master || volume === 0) return;
  const start = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + dur);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur);
}

export const sfx = {
  shot: () => {
    tone(880, 0.055, 'square', 0.07, 380);
    tone(220, 0.045, 'triangle', 0.06, 90);
  },
  scatter: () => {
    tone(420, 0.09, 'sawtooth', 0.13, 95);
    tone(160, 0.12, 'triangle', 0.11, 55);
  },
  grenade: () => {
    tone(260, 0.11, 'triangle', 0.12, 110);
    tone(520, 0.06, 'sine', 0.06, 290);
  },
  bounce: () => tone(210, 0.045, 'sine', 0.07, 130),
  explosion: () => {
    tone(135, 0.34, 'sawtooth', 0.22, 32);
    tone(72, 0.4, 'triangle', 0.2, 26, 0.02);
  },
  railShot: () => {
    tone(1420, 0.22, 'sawtooth', 0.14, 180);
    tone(320, 0.28, 'sine', 0.16, 65);
  },
  dash: () => {
    tone(320, 0.12, 'sine', 0.09, 760);
    tone(180, 0.09, 'triangle', 0.07, 90);
  },
  jump: () => tone(240, 0.09, 'sine', 0.07, 460),
  doubleJump: () => {
    tone(380, 0.08, 'sine', 0.08, 820);
    tone(1200, 0.1, 'square', 0.04, 1900, 0.04);
    tone(180, 0.12, 'triangle', 0.06, 80, 0.02);
  },
  doorBlast: () => {
    tone(1100, 0.06, 'square', 0.08, 300);
    tone(150, 0.22, 'sawtooth', 0.16, 40, 0.03);
    tone(600, 0.14, 'triangle', 0.08, 220, 0.08);
  },
  saveStation: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'sine', 0.11, undefined, i * 0.08));
    tone(130, 0.5, 'triangle', 0.08, 90);
  },
  upgrade: () => {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, undefined, i * 0.07));
    tone(98, 0.7, 'sawtooth', 0.07, 196);
  },
  hit: () => tone(240, 0.07, 'sawtooth', 0.11, 120),
  kill: () => {
    tone(175, 0.24, 'sawtooth', 0.14, 42);
    tone(95, 0.22, 'square', 0.08, 36, 0.04);
  },
  hurt: () => tone(92, 0.32, 'triangle', 0.28, 44),
  unlock: () => {
    tone(440, 0.11, 'sine', 0.14);
    tone(660, 0.16, 'sine', 0.14, undefined, 0.08);
  },
  slam: () => {
    tone(110, 0.28, 'sawtooth', 0.18, 36);
    tone(62, 0.32, 'triangle', 0.18, 28);
  },
  pickup: () => {
    tone(523, 0.1, 'sine', 0.15);
    tone(784, 0.14, 'sine', 0.15, undefined, 0.07);
  },
  meltdown: () => {
    tone(523, 0.15, 'sine', 0.2);
    tone(392, 0.28, 'sawtooth', 0.14, 220, 0.12);
    tone(784, 0.25, 'triangle', 0.16, undefined, 0.22);
  },
  alarm: () => tone(440, 0.16, 'sawtooth', 0.06, 330),
  lightOn: () => tone(1400, 0.03, 'square', 0.05),
  lightOff: () => tone(700, 0.03, 'square', 0.05),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.2, undefined, i * 0.11)),
  lose: () => tone(200, 0.9, 'triangle', 0.25, 40),
};

export function playSoundEvent3D(ev: SoundEvent3D): void {
  switch (ev.type) {
    case 'pulse': sfx.shot(); break;
    case 'scatter': sfx.scatter(); break;
    case 'grenade': sfx.grenade(); break;
    case 'bounce': sfx.bounce(); break;
    case 'explosion': sfx.explosion(); break;
    case 'rail': sfx.railShot(); break;
    case 'dash': sfx.dash(); break;
    case 'jump': sfx.jump(); break;
    case 'double_jump': sfx.doubleJump(); break;
    case 'door_blast': sfx.doorBlast(); break;
    case 'save_station': sfx.saveStation(); break;
    case 'upgrade': sfx.upgrade(); break;
    case 'hurt': sfx.hurt(); break;
    case 'unlock': sfx.unlock(); break;
    case 'slam': sfx.slam(); break;
    case 'pickup': sfx.pickup(); break;
    case 'meltdown': sfx.meltdown(); break;
    case 'win': sfx.win(); break;
  }
}

/** Low ambient reactor hum while playing (shifts pitch up during Meltdown escape). */
export function ambient(on: boolean, meltdown = false) {
  const c = ensure();
  if (!c || !master) return;
  if (on && !hum) {
    hum = c.createOscillator();
    humGain = c.createGain();
    hum.type = 'sine';
    hum.frequency.value = meltdown ? 68 : 54;
    humGain.gain.value = 0.03;
    hum.connect(humGain).connect(master);
    hum.start();
  } else if (on && hum) {
    hum.frequency.setTargetAtTime(meltdown ? 68 : 54, c.currentTime, 0.25);
  } else if (!on && hum) {
    hum.stop();
    hum = null;
    humGain = null;
  }
}

// Data-only sound recipes for the procedural SFX engine in audio.ts. NEW-DESIGN, zero sampled files.
// Each recipe is a list of oscillator ('o') and filtered-noise ('n') layers started together.

export type OscLayer = { t: 'o'; f: number; d: number; w: OscillatorType; g: number; to?: number; at?: number };
export type NoiseLayer = { t: 'n'; d: number; g: number; f: number; ft: BiquadFilterType; q?: number; to?: number; at?: number };
export type Layer = OscLayer | NoiseLayer;
export interface Recipe {
  /** Higher survives voice stealing. */
  prio: number;
  /** Minimum seconds between two starts of this id. */
  gap: number;
  layers: Layer[];
}

const o = (f: number, d: number, w: OscillatorType, g: number, to?: number, at = 0): OscLayer => ({ t: 'o', f, d, w, g, to, at });
const n = (d: number, g: number, f: number, ft: BiquadFilterType = 'lowpass', to?: number, at = 0, q = 1): NoiseLayer => ({ t: 'n', d, g, f, ft, to, at, q });
const r = (prio: number, gap: number, ...layers: Layer[]): Recipe => ({ prio, gap, layers });
const arp = (notes: number[], step: number, d: number, w: OscillatorType, g: number): OscLayer[] => notes.map((f, i) => o(f, d, w, g, undefined, i * step));

export const SOUND_BANK = {
  // ---- weapons (distinct layers per weapon) ----
  'weapon.pulse': r(3, 0.03, o(880, 0.055, 'square', 0.07, 380), o(220, 0.045, 'triangle', 0.06, 90), n(0.03, 0.05, 4200, 'highpass')),
  'weapon.scatter': r(4, 0.05, o(420, 0.09, 'sawtooth', 0.12, 95), o(160, 0.12, 'triangle', 0.11, 55), n(0.12, 0.16, 1800, 'bandpass', 600)),
  'weapon.grenade': r(4, 0.05, o(260, 0.11, 'triangle', 0.12, 110), o(520, 0.06, 'sine', 0.06, 290), n(0.05, 0.05, 900, 'lowpass')),
  'weapon.bounce': r(2, 0.04, o(210, 0.045, 'sine', 0.07, 130), n(0.02, 0.03, 3000, 'highpass')),
  'weapon.rail': r(6, 0.1, o(1420, 0.22, 'sawtooth', 0.12, 180), o(320, 0.28, 'sine', 0.16, 65), o(90, 0.4, 'triangle', 0.14, 40, 0.04), n(0.2, 0.08, 6000, 'highpass', 800)),
  'weapon.hit': r(2, 0.05, o(240, 0.07, 'sawtooth', 0.1, 120)),
  'world.explosion': r(7, 0.08, o(135, 0.34, 'sawtooth', 0.2, 32), o(72, 0.4, 'triangle', 0.2, 26, 0.02), n(0.5, 0.3, 1400, 'lowpass', 120)),

  // ---- player ----
  'player.dash': r(4, 0.1, o(320, 0.12, 'sine', 0.09, 760), o(180, 0.09, 'triangle', 0.07, 90), n(0.16, 0.1, 1200, 'bandpass', 3400, 0, 0.8)),
  'player.jump': r(3, 0.08, o(240, 0.09, 'sine', 0.07, 460), n(0.05, 0.03, 2500, 'highpass')),
  'player.double_jump': r(4, 0.08, o(380, 0.08, 'sine', 0.08, 820), o(1200, 0.1, 'square', 0.04, 1900, 0.04), o(180, 0.12, 'triangle', 0.06, 80, 0.02), n(0.14, 0.07, 2000, 'bandpass', 5000, 0, 1.2)),
  'player.hurt': r(9, 0.12, o(92, 0.32, 'triangle', 0.26, 44), o(310, 0.14, 'sawtooth', 0.1, 120), n(0.18, 0.12, 700, 'lowpass')),
  'player.heartbeat': r(8, 0.2, o(58, 0.14, 'sine', 0.3, 40), o(52, 0.16, 'sine', 0.24, 38, 0.17)),

  // ---- footsteps and landings by surface ----
  'step.metal': r(1, 0.07, n(0.05, 0.05, 2400, 'bandpass', 1400, 0, 3), o(190, 0.05, 'triangle', 0.035, 120)),
  'step.rock': r(1, 0.07, n(0.07, 0.06, 900, 'lowpass', 400), n(0.03, 0.025, 3500, 'highpass', undefined, 0.01)),
  'step.organic': r(1, 0.07, n(0.1, 0.06, 500, 'lowpass', 200), o(140, 0.09, 'sine', 0.035, 70)),
  'step.tile': r(1, 0.07, n(0.04, 0.045, 3200, 'bandpass', 2200, 0, 2), o(300, 0.03, 'square', 0.015, 200)),
  'step.crystal': r(1, 0.07, o(1760, 0.1, 'sine', 0.018, 1500), n(0.04, 0.04, 2800, 'bandpass', 1800, 0, 3), o(130, 0.06, 'triangle', 0.03, 90)),
  'land.metal': r(3, 0.12, n(0.12, 0.1, 1800, 'bandpass', 600, 0, 2), o(120, 0.14, 'triangle', 0.1, 55)),
  'land.rock': r(3, 0.12, n(0.16, 0.11, 700, 'lowpass', 250), o(80, 0.16, 'triangle', 0.1, 45)),
  'land.organic': r(3, 0.12, n(0.2, 0.1, 400, 'lowpass', 150), o(90, 0.18, 'sine', 0.1, 50)),
  'land.tile': r(3, 0.12, n(0.1, 0.09, 2600, 'bandpass', 1200, 0, 2), o(150, 0.1, 'triangle', 0.09, 70)),
  'land.crystal': r(3, 0.12, o(1320, 0.3, 'sine', 0.04, 1100), n(0.12, 0.08, 2200, 'bandpass', 900, 0, 3), o(100, 0.14, 'triangle', 0.09, 55)),

  // ---- enemies: crawler = skittery squeaks, stalker = low growl, spitter = wet gurgle, warden = machine bass ----
  'enemy.crawler.alert': r(5, 0.2, o(1100, 0.08, 'square', 0.05, 1500), o(1500, 0.07, 'square', 0.045, 1000, 0.09)),
  'enemy.crawler.windup': r(6, 0.2, o(700, 0.3, 'sawtooth', 0.05, 1800), n(0.3, 0.04, 3000, 'highpass')),
  'enemy.crawler.attack': r(6, 0.15, o(1900, 0.12, 'square', 0.07, 600), n(0.1, 0.07, 2500, 'bandpass', 900)),
  'enemy.crawler.land': r(4, 0.15, n(0.08, 0.08, 1500, 'bandpass', 500, 0, 2), o(140, 0.1, 'triangle', 0.08, 70)),
  'enemy.crawler.death': r(6, 0.15, o(1400, 0.22, 'square', 0.07, 200), n(0.22, 0.08, 3000, 'highpass', 600)),

  'enemy.stalker.alert': r(5, 0.2, o(130, 0.3, 'sawtooth', 0.09, 190), n(0.25, 0.06, 500, 'bandpass', 800, 0, 2)),
  'enemy.stalker.windup': r(6, 0.2, o(90, 0.35, 'sawtooth', 0.1, 230), o(95, 0.35, 'square', 0.04, 240), n(0.3, 0.05, 400, 'lowpass')),
  'enemy.stalker.attack': r(6, 0.15, o(260, 0.18, 'sawtooth', 0.12, 70), n(0.16, 0.12, 1200, 'bandpass', 300, 0, 1.5)),
  'enemy.stalker.land': r(5, 0.15, o(70, 0.2, 'triangle', 0.16, 38), n(0.14, 0.1, 600, 'lowpass', 150)),
  'enemy.stalker.death': r(7, 0.15, o(200, 0.5, 'sawtooth', 0.14, 45), n(0.4, 0.09, 700, 'lowpass', 120)),

  'enemy.spitter.alert': r(5, 0.2, o(360, 0.18, 'sine', 0.07, 280), o(240, 0.22, 'sine', 0.06, 340, 0.08), n(0.2, 0.04, 1000, 'bandpass', 500, 0, 3)),
  'enemy.spitter.windup': r(6, 0.2, o(180, 0.35, 'sine', 0.09, 420), n(0.35, 0.07, 700, 'bandpass', 1600, 0, 4)),
  'enemy.spitter.attack': r(6, 0.12, o(540, 0.12, 'sine', 0.1, 150), n(0.12, 0.1, 1800, 'bandpass', 600, 0, 3)),
  'enemy.spitter.death': r(6, 0.15, o(300, 0.4, 'sine', 0.09, 70), n(0.45, 0.1, 900, 'bandpass', 250, 0, 4)),

  'enemy.warden.alert': r(8, 0.5, o(55, 0.8, 'sawtooth', 0.14, 70), o(110, 0.8, 'square', 0.05, 82), n(0.7, 0.07, 300, 'lowpass')),
  'enemy.warden.windup': r(8, 0.4, o(70, 0.7, 'sawtooth', 0.15, 240), o(140, 0.7, 'square', 0.06, 480), n(0.7, 0.08, 400, 'bandpass', 2400, 0, 2)),
  'enemy.warden.attack': r(8, 0.3, o(480, 0.25, 'sawtooth', 0.14, 60), n(0.25, 0.15, 1500, 'bandpass', 250, 0, 1.5)),
  'enemy.warden.slam': r(9, 0.3, o(110, 0.28, 'sawtooth', 0.18, 36), o(62, 0.32, 'triangle', 0.18, 28), n(0.4, 0.2, 900, 'lowpass', 90)),
  'enemy.warden.death': r(10, 0.5, o(160, 1.4, 'sawtooth', 0.18, 28), o(80, 1.6, 'square', 0.1, 24, 0.1), n(1.4, 0.16, 1200, 'lowpass', 80)),

  // ---- world ----
  'world.door_blast': r(6, 0.15, o(1100, 0.06, 'square', 0.08, 300), o(150, 0.22, 'sawtooth', 0.16, 40, 0.03), o(600, 0.14, 'triangle', 0.08, 220, 0.08), n(0.3, 0.12, 1500, 'lowpass', 150)),
  'world.save': r(6, 0.3, ...arp([523, 659, 784, 1047], 0.08, 0.18, 'sine', 0.11), o(130, 0.5, 'triangle', 0.08, 90)),
  'world.upgrade': r(7, 0.5, ...arp([392, 523, 659, 784, 1047, 1319], 0.07, 0.22, 'triangle', 0.13), o(98, 0.7, 'sawtooth', 0.07, 196)),
  'world.unlock': r(5, 0.15, o(440, 0.11, 'sine', 0.14), o(660, 0.16, 'sine', 0.14, undefined, 0.08)),
  'world.pickup': r(4, 0.08, o(523, 0.1, 'sine', 0.15), o(784, 0.14, 'sine', 0.15, undefined, 0.07)),
  'world.light_on': r(2, 0.05, o(1400, 0.03, 'square', 0.05)),
  'world.light_off': r(2, 0.05, o(700, 0.03, 'square', 0.05)),
  'world.alarm': r(3, 0.3, o(440, 0.16, 'sawtooth', 0.06, 330)),

  // ---- stingers ----
  'stinger.win': r(10, 1, ...arp([523, 659, 784, 1047, 1319], 0.12, 0.45, 'sine', 0.16), ...arp([262, 330, 392, 523], 0.12, 0.6, 'triangle', 0.08)),
  'stinger.lose': r(10, 1, o(220, 1.4, 'triangle', 0.2, 40), o(165, 1.6, 'sawtooth', 0.08, 30, 0.15), n(1.0, 0.06, 500, 'lowpass', 80)),
  'stinger.meltdown': r(10, 1, o(523, 0.15, 'sine', 0.2), o(392, 0.28, 'sawtooth', 0.14, 220, 0.12), o(784, 0.25, 'triangle', 0.16, undefined, 0.22), n(0.5, 0.1, 800, 'lowpass', 100, 0.1)),

  // ---- movement tech (round 2) ----
  'player.wall_jump': r(3, 0.08, n(0.14, 0.09, 1800, 'bandpass', 700, 0, 2), o(260, 0.1, 'sine', 0.08, 620, 0.03), o(120, 0.08, 'triangle', 0.07, 70)),
  'player.dash_cancel': r(3, 0.06, o(900, 0.07, 'sine', 0.08, 220), n(0.04, 0.07, 5200, 'highpass'), o(160, 0.06, 'square', 0.04, 90)),
  'player.stomp': r(5, 0.1, o(150, 0.2, 'triangle', 0.2, 38), o(900, 0.05, 'square', 0.06, 300), n(0.22, 0.16, 1400, 'lowpass', 120), n(0.08, 0.07, 3400, 'bandpass', 1200, 0.01, 2)),
  'ui.combo': r(4, 0.05, o(880, 0.28, 'sine', 0.1), o(1760, 0.18, 'sine', 0.045, undefined, 0.01), o(1320, 0.22, 'triangle', 0.03, undefined, 0.02)),
  'world.collect': r(5, 0.2, ...arp([659, 880, 1175, 1568], 0.06, 0.2, 'sine', 0.09), o(1568, 0.5, 'triangle', 0.03, undefined, 0.2)),
  'world.secret': r(6, 0.5, ...arp([392, 466, 587, 740, 587, 880], 0.1, 0.35, 'triangle', 0.1), o(98, 0.9, 'sine', 0.08, 130), n(0.9, 0.025, 4000, 'bandpass', 1500, 0, 6)),

  // ---- Core Warden: a warning per pattern, then the attack and phase events ----
  'boss.tele.slam': r(8, 0.3, o(52, 0.8, 'sawtooth', 0.13, 150), o(104, 0.8, 'triangle', 0.07, 300), n(0.8, 0.12, 180, 'lowpass', 1100)),
  'boss.tele.charge': r(8, 0.3, o(60, 0.8, 'sawtooth', 0.12, 340), o(120, 0.8, 'square', 0.05, 680), n(0.8, 0.07, 500, 'bandpass', 3000, 0, 2)),
  'boss.tele.volley': r(8, 0.3, o(300, 0.7, 'sine', 0.1, 2000), o(600, 0.7, 'triangle', 0.05, 3000), n(0.7, 0.04, 2000, 'highpass')),
  'boss.tele.summon': r(8, 0.3, o(90, 0.8, 'sine', 0.12, 420), o(135, 0.8, 'sine', 0.08, 640, 0.05), n(0.8, 0.08, 400, 'bandpass', 2600, 0, 6)),
  'boss.charge': r(8, 0.3, o(340, 0.5, 'sawtooth', 0.14, 60), o(170, 0.5, 'square', 0.06, 40), n(0.5, 0.14, 2200, 'bandpass', 300, 0, 1.5)),
  'boss.summon': r(7, 0.3, o(140, 0.35, 'sine', 0.14, 900), o(60, 0.5, 'triangle', 0.16, 30, 0.1), n(0.4, 0.1, 3000, 'bandpass', 800, 0, 5)),
  'boss.phase': r(10, 1, o(75, 1.3, 'sawtooth', 0.16, 24), o(48, 1.5, 'sine', 0.2, 28), o(520, 0.8, 'square', 0.04, 500, 0.02), o(787, 0.8, 'square', 0.03, 770, 0.02), n(1.1, 0.15, 1800, 'lowpass', 70), n(0.9, 0.05, 6000, 'highpass', 2500, 0.05)),
  'boss.exposed': r(7, 0.4, o(1568, 0.5, 'sine', 0.08), o(2093, 0.45, 'sine', 0.05, undefined, 0.05), o(400, 0.35, 'triangle', 0.06, 1600), n(0.3, 0.05, 6000, 'highpass')),

  // ---- UI ----
  'ui.move': r(9, 0.03, o(1250, 0.03, 'square', 0.035, 1050)),
  'ui.select': r(9, 0.05, o(660, 0.09, 'sine', 0.12), o(990, 0.16, 'sine', 0.12, undefined, 0.07), o(110, 0.12, 'triangle', 0.06, 70)),
  'ui.back': r(9, 0.05, o(520, 0.09, 'sine', 0.1, 330), o(330, 0.14, 'sine', 0.09, 230, 0.06)),
  'ui.banner': r(5, 0.3, ...arp([784, 988, 1319], 0.07, 0.3, 'sine', 0.06), n(0.25, 0.03, 5000, 'highpass')),
  'ui.sector': r(7, 0.5, o(55, 1.4, 'sawtooth', 0.1, 38), o(110, 1.2, 'triangle', 0.07, 82, 0.05), n(1.2, 0.06, 300, 'bandpass', 2400, 0, 1.5), o(1100, 0.6, 'sine', 0.03, undefined, 0.5)),
  'ui.rank': r(9, 0.3, o(880, 1, 'sine', 0.1), o(1320, 0.9, 'sine', 0.06, undefined, 0.03), o(1760, 0.8, 'sine', 0.04, undefined, 0.06), o(110, 0.6, 'triangle', 0.08, 80), n(0.5, 0.03, 7000, 'highpass')),
  'ui.pause': r(9, 0.1, n(0.35, 0.08, 4000, 'lowpass', 300), o(300, 0.25, 'sine', 0.05, 120)),
  'ui.resume': r(9, 0.1, n(0.3, 0.08, 300, 'lowpass', 4000), o(150, 0.2, 'sine', 0.05, 380)),

  // ---- ambient one-shots (scheduled by the ambient layer, quiet) ----
  'amb.drip': r(0, 0.3, o(1900, 0.09, 'sine', 0.035, 700), o(950, 0.16, 'sine', 0.018, 420, 0.05)),
  'amb.bubble': r(0, 0.2, o(300, 0.1, 'sine', 0.04, 900), o(420, 0.08, 'sine', 0.025, 1200, 0.07)),
  'amb.spark': r(0, 0.4, n(0.06, 0.05, 5000, 'highpass'), o(2600, 0.04, 'square', 0.015, 900)),
  'amb.creak': r(0, 0.8, o(150, 0.7, 'sawtooth', 0.02, 110), n(0.7, 0.015, 600, 'bandpass', 380, 0, 8)),
  'amb.vent': r(0, 0.8, n(1.4, 0.03, 800, 'bandpass', 2200, 0, 1.5)),
} satisfies Record<string, Recipe>;

export type SoundId = keyof typeof SOUND_BANK;
export const SOUND_IDS = Object.keys(SOUND_BANK) as SoundId[];

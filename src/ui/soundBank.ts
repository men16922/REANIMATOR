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
  // Item grab: a short impact and a ping. The melody is the per-item fanfare.* recipe that follows it.
  'world.upgrade': r(7, 0.5, o(98, 0.32, 'sawtooth', 0.1, 55), o(1568, 0.3, 'sine', 0.09, undefined, 0.02), o(2093, 0.22, 'sine', 0.05, undefined, 0.05), n(0.12, 0.08, 4000, 'highpass', 1500)),
  'world.unlock': r(5, 0.15, o(440, 0.11, 'sine', 0.14), o(660, 0.16, 'sine', 0.14, undefined, 0.08)),
  'world.pickup': r(4, 0.08, o(523, 0.1, 'sine', 0.15), o(784, 0.14, 'sine', 0.15, undefined, 0.07)),
  // Round 9: chunky pickups. Ammo is a metal clack plus a bolt-slide ratchet, medical is a warm two-note chime with a low thump.
  'world.pickup_ammo': r(4, 0.06, o(190, 0.07, 'square', 0.12, 90), n(0.04, 0.1, 3200, 'bandpass', 1400, 0, 3), o(1250, 0.05, 'square', 0.06, undefined, 0.07), o(900, 0.06, 'square', 0.06, undefined, 0.11), o(70, 0.12, 'triangle', 0.14, 45, 0.02)),
  'world.pickup_med': r(4, 0.08, o(392, 0.12, 'sine', 0.14), o(587, 0.18, 'sine', 0.14, undefined, 0.07), o(1175, 0.2, 'sine', 0.05, undefined, 0.1), o(85, 0.14, 'triangle', 0.12, 50)),
  'world.light_on': r(2, 0.05, o(1400, 0.03, 'square', 0.05)),
  'world.light_off': r(2, 0.05, o(700, 0.03, 'square', 0.05)),
  'world.alarm': r(3, 0.12, o(440, 0.15, 'sawtooth', 0.06, 330)),

  // ---- R10 opening set piece: pod hiss, lamp stutter-on, vent blow-out ----
  'opening.hiss': r(3, 0.5, n(1.6, 0.1, 5200, 'highpass', 900, 0, 0.8), o(62, 1.4, 'sine', 0.08, 48), o(1800, 0.5, 'sine', 0.012, 900, 0.1)),
  'opening.lamp': r(3, 0.2, o(2400, 0.04, 'square', 0.05, 1500), n(0.06, 0.06, 3000, 'bandpass', 1200, 0, 2), o(90, 0.12, 'triangle', 0.08, 60)),
  'opening.rattle': r(3, 0.3, n(0.9, 0.05, 700, 'bandpass', 1500, 0, 3), o(70, 0.9, 'triangle', 0.07, 95)),
  'opening.burst': r(8, 0.5, n(0.45, 0.2, 2600, 'bandpass', 500, 0, 1.2), o(120, 0.35, 'sawtooth', 0.16, 38), o(2100, 0.18, 'square', 0.05, 300, 0.01), o(55, 0.5, 'triangle', 0.14, 30, 0.03)),

  // ---- stingers ----
  'stinger.win': r(10, 1, ...arp([523, 659, 784, 1047, 1319], 0.12, 0.45, 'sine', 0.16), ...arp([262, 330, 392, 523], 0.12, 0.6, 'triangle', 0.08)),
  'stinger.lose': r(10, 1, o(220, 1.4, 'triangle', 0.2, 40), o(165, 1.6, 'sawtooth', 0.08, 30, 0.15), n(1.0, 0.06, 500, 'lowpass', 80)),
  'stinger.meltdown': r(10, 1, o(523, 0.15, 'sine', 0.2), o(392, 0.28, 'sawtooth', 0.14, 220, 0.12), o(784, 0.25, 'triangle', 0.16, undefined, 0.22), n(0.5, 0.1, 800, 'lowpass', 100, 0.1)),

  // ---- Round 10 Reclaimer hunter: a dissonant tritone sting, a rising catch roar, plating pings ----
  'stinger.hunter': r(10, 1, o(185, 0.9, 'sawtooth', 0.15, 120), o(262, 0.9, 'square', 0.07, 170, 0.03), o(370, 0.7, 'sawtooth', 0.05, 250, 0.06), o(46, 1.2, 'sine', 0.2, 38), n(0.6, 0.08, 2400, 'bandpass', 500, 0, 3)),
  'hunter.grab': r(9, 0.3, o(120, 0.55, 'sawtooth', 0.15, 520), o(240, 0.55, 'square', 0.06, 1000), n(0.55, 0.1, 1800, 'bandpass', 4200, 0, 4)),
  'hunter.ping': r(4, 0.05, o(2300, 0.08, 'square', 0.07, 1500), o(3450, 0.1, 'sine', 0.05, 2400, 0.01), n(0.05, 0.06, 6000, 'highpass', 3000)),
  'hunter.counter': r(10, 0.1, o(1500, 0.14, 'square', 0.14, 500), o(70, 0.5, 'triangle', 0.22, 30), o(2200, 0.3, 'sine', 0.09, 1100, 0.02), n(0.3, 0.14, 4800, 'highpass', 1200), n(0.4, 0.1, 700, 'lowpass', 90, 0.03)),
  'hunter.off': r(10, 1, o(310, 0.9, 'sawtooth', 0.12, 40), o(96, 1.1, 'triangle', 0.16, 28), ...arp([392, 330, 262, 196], 0.14, 0.4, 'sine', 0.07), n(0.8, 0.08, 1400, 'lowpass', 80)),

  // ---- movement tech (round 2) ----
  'player.wall_jump': r(3, 0.08, n(0.14, 0.09, 1800, 'bandpass', 700, 0, 2), o(260, 0.1, 'sine', 0.08, 620, 0.03), o(120, 0.08, 'triangle', 0.07, 70)),
  'player.dash_cancel': r(3, 0.06, o(900, 0.07, 'sine', 0.08, 220), n(0.04, 0.07, 5200, 'highpass'), o(160, 0.06, 'square', 0.04, 90)),
  'player.stomp': r(5, 0.1, o(150, 0.2, 'triangle', 0.2, 38), o(900, 0.05, 'square', 0.06, 300), n(0.22, 0.16, 1400, 'lowpass', 120), n(0.08, 0.07, 3400, 'bandpass', 1200, 0.01, 2)),
  'combat.parry': r(9, 0.08, o(1900, 0.09, 'square', 0.12, 700), o(2850, 0.14, 'sine', 0.08, 1500, 0.01), o(110, 0.22, 'triangle', 0.2, 45), n(0.12, 0.14, 5200, 'highpass', 1800), n(0.2, 0.12, 900, 'lowpass', 120, 0.02)),
  'boss.counter': r(10, 0.3, o(1500, 0.12, 'square', 0.1, 500), o(2400, 0.2, 'sine', 0.07, 1200, 0.01), o(70, 0.5, 'triangle', 0.22, 32), n(0.3, 0.16, 700, 'lowpass', 90, 0.02), n(0.12, 0.1, 5200, 'highpass', 1800)),
  'combat.parry_whiff': r(3, 0.1, o(320, 0.09, 'triangle', 0.06, 180), n(0.07, 0.05, 1500, 'bandpass', 600)),
  'world.scan': r(3, 0.2, o(300, 0.5, 'sine', 0.1, 1400), o(1400, 0.35, 'triangle', 0.04, 2200, 0.08), n(0.4, 0.04, 3200, 'bandpass', 1800, 0.05, 3)),
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

  // ---- round 6: dedicated hazard recipes (replace the borrowed round 3-5 sounds) ----
  // Steam vent: rising hiss plus a pressure tone while warning, a hard burst when it fires.
  'hazard.vent_warn': r(3, 0.3, n(0.75, 0.05, 700, 'bandpass', 2000, 0, 2), o(110, 0.65, 'sine', 0.05, 175), n(0.5, 0.025, 5000, 'highpass', 3000, 0.2)),
  'hazard.vent_burst': r(5, 0.2, n(0.9, 0.2, 3200, 'highpass', 900), n(0.5, 0.1, 1200, 'bandpass', 380, 0, 1.2), o(72, 0.4, 'sine', 0.14, 40), o(1700, 0.18, 'sine', 0.035, 800)),
  // Crusher: hydraulic whine and a latch tick while the piston lifts, then a metal slam with a ring.
  'hazard.crush_warn': r(5, 0.3, o(95, 0.7, 'sawtooth', 0.05, 175), o(190, 0.7, 'square', 0.022, 340), n(0.7, 0.05, 500, 'bandpass', 1400, 0, 3), o(2400, 0.05, 'square', 0.02, 2400, 0.55)),
  'hazard.crush_slam': r(8, 0.15, o(75, 0.38, 'triangle', 0.2, 28), o(1400, 0.05, 'square', 0.05, 400), n(0.4, 0.17, 1600, 'bandpass', 200), o(310, 0.55, 'sine', 0.045, 270, 0.02), n(0.12, 0.07, 5000, 'highpass')),
  // Laser grid: a zap that settles into an electric hum when it switches on, a falling whine when it cuts out.
  'hazard.laser_on': r(4, 0.1, o(1800, 0.14, 'sine', 0.05, 3400), o(60, 0.55, 'sawtooth', 0.07, 120), o(120, 0.55, 'square', 0.035, 240), n(0.2, 0.05, 6000, 'highpass', 2200)),
  'hazard.laser_off': r(3, 0.1, o(2200, 0.22, 'sine', 0.05, 220), o(120, 0.3, 'sawtooth', 0.06, 50), n(0.12, 0.04, 4500, 'highpass', 1200)),
  // Explosive barrel: a fireball crack, then the heavier secondary blast 0.16 s later.
  'hazard.barrel': r(8, 0.1, o(120, 0.3, 'sawtooth', 0.12, 38), n(0.35, 0.14, 1800, 'lowpass', 200), o(2000, 0.05, 'square', 0.04, 500, 0.01), o(88, 0.55, 'triangle', 0.16, 26, 0.16), n(0.65, 0.18, 1000, 'lowpass', 90, 0.16), n(0.2, 0.05, 4500, 'highpass', 1500, 0.2)),
  // Wall switch: mechanical latch (click, clack) and a short confirming tone.
  'hazard.switch': r(5, 0.1, o(1500, 0.025, 'square', 0.06, 700), n(0.03, 0.09, 3500, 'bandpass', 2500, 0, 4), o(180, 0.06, 'triangle', 0.09, 90, 0.06), n(0.04, 0.07, 1800, 'bandpass', 900, 0.065, 3), o(660, 0.14, 'sine', 0.06, undefined, 0.13)),
  // Cargo lift: motor spools up with a coupling clunk; on arrival it winds down, clunks and dings.
  'hazard.elevator_start': r(6, 0.5, o(50, 0.9, 'sawtooth', 0.09, 98), n(0.8, 0.08, 300, 'lowpass', 900), o(150, 0.1, 'square', 0.05, 60), n(0.1, 0.09, 1800, 'bandpass', 500, 0, 2)),
  'hazard.elevator_stop': r(6, 0.5, o(98, 0.6, 'sawtooth', 0.07, 40), n(0.6, 0.06, 900, 'lowpass', 200), o(110, 0.2, 'triangle', 0.13, 50, 0.45), n(0.12, 0.1, 1400, 'bandpass', 400, 0.45, 2), o(1320, 0.3, 'sine', 0.04, undefined, 0.62)),
  // Collapsing floor: metal groans while it warns, then a falling slab with debris.
  'hazard.collapse_creak': r(5, 0.3, o(140, 0.7, 'sawtooth', 0.03, 100), n(0.7, 0.04, 500, 'bandpass', 300, 0, 9), o(210, 0.5, 'sawtooth', 0.025, 150, 0.2), n(0.12, 0.05, 3000, 'bandpass', 1500, 0.3, 5)),
  'hazard.collapse_crash': r(8, 0.2, o(65, 0.5, 'triangle', 0.2, 28), n(0.7, 0.2, 1200, 'lowpass', 100), n(0.25, 0.1, 4000, 'bandpass', 900, 0.03, 1.5), n(0.45, 0.06, 2500, 'highpass', 1200, 0.25), o(520, 0.25, 'square', 0.025, 260, 0.02)),

  // ---- round 6: Metroid systems ----
  'move.slide': r(3, 0.2, n(0.4, 0.08, 1600, 'bandpass', 700, 0, 1.5), n(0.35, 0.04, 5000, 'highpass', 2500, 0.02), o(110, 0.3, 'sawtooth', 0.03, 70)),
  'world.block_break': r(6, 0.1, n(0.3, 0.17, 2500, 'bandpass', 500, 0, 0.8), o(120, 0.22, 'triangle', 0.14, 45), o(1300, 0.15, 'square', 0.035, 500, 0.01), n(0.4, 0.07, 5000, 'highpass', 2000, 0.08)),
  // Data download: a fast rising pentatonic run, a sparkle and a final chime.
  'world.map_reveal': r(5, 0.4, ...arp([523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760], 0.045, 0.12, 'square', 0.035), o(1760, 0.14, 'sine', 0.03, undefined, 0.2), o(2093, 0.6, 'sine', 0.07, undefined, 0.5), n(0.5, 0.02, 7000, 'highpass', 3000, 0.1)),
  // Escape bulkheads: a two-tone siren with vowel-like formant sweeps ("warning"), a rising final-hatch siren, a heavy hatch slam.
  'escape.seal_warn': r(8, 0.3, o(740, 0.18, 'square', 0.055), o(520, 0.18, 'square', 0.055, undefined, 0.2), n(0.28, 0.09, 700, 'bandpass', 1150, 0.42, 12), n(0.3, 0.09, 1250, 'bandpass', 520, 0.74, 12), o(130, 0.5, 'sawtooth', 0.04, 105, 0.42)),
  'escape.seal_final': r(9, 0.5, o(500, 0.5, 'sawtooth', 0.09, 1000), o(1000, 0.5, 'sawtooth', 0.09, 500, 0.5), o(55, 1, 'sine', 0.12, 45), n(0.3, 0.08, 800, 'bandpass', 1300, 1.05, 12), n(0.3, 0.08, 1300, 'bandpass', 600, 1.4, 12)),
  'escape.seal_close': r(9, 0.5, o(48, 0.9, 'sine', 0.2, 26), o(90, 0.5, 'sawtooth', 0.1, 35, 0.02), n(0.7, 0.18, 700, 'lowpass', 80), n(0.14, 0.1, 3000, 'bandpass', 900, 0, 2), o(310, 0.8, 'square', 0.035, 300, 0.03), o(857, 0.6, 'square', 0.018, 850, 0.03), n(0.25, 0.09, 300, 'lowpass', 120, 0.5), o(140, 0.1, 'triangle', 0.1, 70, 0.55), o(140, 0.1, 'triangle', 0.1, 70, 0.78)),
  'world.countdown': r(8, 0.3, o(1320, 0.09, 'square', 0.05), o(660, 0.12, 'sine', 0.05)),

  // ---- round 6: round 3 foes ----
  'enemy.drop_land': r(6, 0.15, o(90, 0.2, 'triangle', 0.16, 45), n(0.14, 0.12, 900, 'lowpass', 250), n(0.12, 0.06, 3500, 'bandpass', 2000, 0.06, 3), o(1300, 0.06, 'square', 0.04, 800, 0.1)),
  'enemy.hive_spawn': r(5, 0.15, o(200, 0.12, 'sine', 0.12, 600), n(0.15, 0.08, 700, 'bandpass', 1500, 0, 4), o(420, 0.1, 'sine', 0.06, 200, 0.08)),
  'enemy.hive_burst': r(8, 0.3, o(150, 0.6, 'sawtooth', 0.14, 35), n(0.7, 0.16, 600, 'bandpass', 200, 0, 3), o(500, 0.4, 'sine', 0.08, 120, 0.04), n(0.3, 0.07, 4000, 'highpass', 1500, 0.1)),

  // ---- round 6: reserved for the round 6 weapon track (events flamer, rocket, burn, rocket_jump; see docs/R6_SOUND.md) ----
  'weapon.flamer_loop': r(2, 0.05, n(0.2, 0.1, 700, 'bandpass', 350, 0, 0.7), n(0.15, 0.045, 3000, 'highpass', 1500), o(70, 0.18, 'sawtooth', 0.05, 55)),
  'weapon.rocket': r(5, 0.1, o(180, 0.35, 'sawtooth', 0.09, 90), n(0.5, 0.13, 500, 'lowpass', 2400), o(1000, 0.08, 'square', 0.04, 300), n(0.3, 0.05, 5000, 'highpass', 1500, 0.05)),
  'weapon.rocket_explode': r(8, 0.08, o(110, 0.5, 'sawtooth', 0.17, 24), o(55, 0.6, 'triangle', 0.17, 22, 0.02), n(0.7, 0.24, 1600, 'lowpass', 90), n(0.2, 0.08, 5000, 'highpass', 1800)),
  'enemy.burn': r(2, 0.2, n(0.35, 0.055, 2500, 'highpass', 1200), n(0.3, 0.05, 600, 'bandpass', 300, 0, 2), o(2200, 0.03, 'square', 0.015, 900, 0.1)),
  'player.rocket_jump': r(5, 0.15, o(70, 0.3, 'sine', 0.15, 160), n(0.4, 0.14, 400, 'lowpass', 2000), o(220, 0.2, 'sawtooth', 0.06, 90)),

  // ---- round 6: item fanfares (2-3 s, music ducks underneath). The first phrase lands inside the 0.85 s item freeze. ----
  // Thruster boots: a jet whoosh and a bright major run that leaps an octave, ending on a high held chord.
  'fanfare.boots': r(10, 1, n(0.7, 0.05, 800, 'bandpass', 5200, 0, 1), ...arp([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], 0.09, 0.3, 'triangle', 0.1), ...arp([1046.5, 1318.5, 1568, 2093], 0.09, 0.2, 'sine', 0.035), o(1046.5, 1.7, 'sine', 0.07, undefined, 0.85), o(1318.5, 1.7, 'sine', 0.06, undefined, 0.85), o(1568, 1.7, 'sine', 0.05, undefined, 0.85), o(65.4, 1.8, 'triangle', 0.08, undefined, 0.85)),
  // Energy tank: two heartbeat thumps, then a warm full chord swelling upward with a bell.
  'fanfare.tank': r(10, 1, o(55, 0.25, 'sine', 0.2, 40), o(55, 0.28, 'sine', 0.2, 40, 0.2), ...arp([174.6, 220, 261.6, 349.2], 0.12, 0.5, 'sine', 0.07), ...arp([349.2, 440, 523.25, 698.5], 0.12, 0.4, 'triangle', 0.05), o(1396.9, 1.5, 'sine', 0.04, undefined, 0.5), o(349.2, 1.8, 'triangle', 0.06, undefined, 0.85), o(440, 1.8, 'triangle', 0.05, undefined, 0.85), o(523.25, 1.8, 'triangle', 0.05, undefined, 0.85), o(698.5, 1.6, 'sine', 0.05, undefined, 0.85), o(87.3, 1.8, 'sine', 0.1, undefined, 0.85)),
  // Crawl slide: a metal scrape sweep under a low A-minor riff that opens into a minor chord.
  'fanfare.slide': r(10, 1, n(0.55, 0.08, 400, 'bandpass', 3000, 0, 1.5), ...arp([110, 130.8, 164.8, 220, 261.6, 329.6], 0.1, 0.3, 'sawtooth', 0.045), o(55, 0.4, 'triangle', 0.1, 40), o(220, 1.8, 'triangle', 0.06, undefined, 0.85), o(261.6, 1.8, 'triangle', 0.05, undefined, 0.85), o(329.6, 1.8, 'triangle', 0.05, undefined, 0.85), o(493.9, 1.6, 'sine', 0.04, undefined, 0.85), o(55, 1.8, 'sine', 0.1, undefined, 0.85)),
  // Ammo expansion: three mechanical clacks, a quick square arpeggio and a bright G major chime.
  'fanfare.ammo': r(10, 1, n(0.03, 0.1, 3500, 'bandpass', 2500, 0, 4), n(0.03, 0.1, 3500, 'bandpass', 2500, 0.09, 4), n(0.04, 0.12, 2200, 'bandpass', 1500, 0.18, 4), ...arp([392, 493.9, 587.3, 784, 987.8, 1174.7], 0.07, 0.16, 'square', 0.04), o(784, 1.6, 'sine', 0.08, undefined, 0.85), o(987.8, 1.6, 'sine', 0.06, undefined, 0.85), o(1174.7, 1.6, 'sine', 0.05, undefined, 0.85), o(98, 1.7, 'triangle', 0.09, undefined, 0.85)),
  // New weapon: timpani and a heroic brass-like motif (three short pulses, a leap, the high note) resolving to C major.
  'fanfare.weapon': r(10, 1, o(80, 0.3, 'sine', 0.2, 45), o(80, 0.35, 'sine', 0.2, 45, 0.5), o(196, 0.12, 'sawtooth', 0.07), o(196, 0.12, 'sawtooth', 0.07, undefined, 0.16), o(196, 0.12, 'sawtooth', 0.07, undefined, 0.32), o(261.6, 0.5, 'sawtooth', 0.08, undefined, 0.48), o(130.8, 0.5, 'square', 0.03, undefined, 0.48), o(329.6, 0.35, 'sawtooth', 0.07, undefined, 0.5), o(392, 1.9, 'sawtooth', 0.07, undefined, 0.85), o(523.25, 1.9, 'sawtooth', 0.05, undefined, 0.85), o(329.6, 1.9, 'triangle', 0.06, undefined, 0.85), o(65.4, 1.9, 'triangle', 0.1, undefined, 0.85)),
} satisfies Record<string, Recipe>;

/** Layer envelope amplitude at time `t` (layers decay exponentially from `g` to 0.0001 over `d`, as audio.ts schedules them). */
function envelope(l: Layer, t: number): number {
  const s = t - (l.at ?? 0);
  if (s < 0 || s >= l.d) return 0;
  return l.g * Math.pow(0.0001 / l.g, s / l.d);
}

/** Total length of a recipe in seconds. */
export function recipeDuration(rec: Recipe): number {
  return Math.max(...rec.layers.map((l) => (l.at ?? 0) + l.d));
}

/** Estimated peak of the summed layer envelopes (linear, before pan, trim and reverb). Sampled at every layer start. */
export function recipePeak(rec: Recipe): number {
  let peak = 0;
  for (const a of rec.layers) {
    const t = a.at ?? 0;
    peak = Math.max(peak, rec.layers.reduce((s, b) => s + envelope(b, t), 0));
  }
  return peak;
}

/** Estimated energy of a recipe: integral of squared envelope amplitudes (closed form per layer; layers add as uncorrelated sources). Compares loudness across recipes. */
export function recipeEnergy(rec: Recipe): number {
  let e = 0;
  for (const l of rec.layers) {
    const k = Math.log(l.g / 0.0001);
    e += (l.g * l.g * l.d * (1 - Math.exp(-2 * k))) / (2 * k);
  }
  return e;
}

export type SoundId = keyof typeof SOUND_BANK;
export const SOUND_IDS = Object.keys(SOUND_BANK) as SoundId[];

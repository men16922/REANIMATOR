// R10 opening set piece, pure timeline (no DOM, no WebGL, no simulation state). The first-run intro plays this over
// the live airlock: wake in Pod Nine, the headlamp stutters on, an alarm sweeps the bay, a vent grille at the far end
// blows out and the first crawler drops in. Then control is handed over.
//
// Display side only. The simulation is held (not stepped) while the opening plays, so tick 0 of a run is identical
// with or without it. The crawler is the existing map enemy `e-airlock-1`; the opening only hides it until the burst.
// No random source at all: every flicker is a fixed table, so two plays look the same.

/** Enemy kept out of sight until the vent bursts (it already exists in the map; nothing is spawned). */
export const OPENING_ENEMY_ID = 'e-airlock-1';
/** World position of the vent that blows out (above the crawler's start, display-only debris). */
export const OPENING_VENT = { x: 12, y: 3.1 } as const;

/** Seconds at which each beat starts. */
export const OPENING_BEATS = {
  lampOn: 2.2,
  lampSteady: 3.7,
  alarmOn: 5.4,
  rattle: 9.0,
  burst: 10.4,
  prompt: 11.0,
  handoff: 12.9,
} as const;
/** R11 beats: the operative rises from a kneel (display pose only), a title card holds, letterbox bars retract into the handoff. */
export const OPENING_WAKE = { start: 2.0, standBy: 5.0, standByReduced: 3.2 } as const;
export const OPENING_TITLE = { in: 3.9, out: 7.4, text: 'CRYO AIRLOCK \u2014 03:12 AFTER BREACH' } as const;
export const OPENING_BARS = { retractFrom: 11.2 } as const;
export const OPENING_SECONDS = OPENING_BEATS.handoff;

export interface OpeningState {
  /** 0..1 black cover over the live scene (1 = black); the eyelids open through it */
  dark: number;
  /** status readout line for the bottom-left terminal */
  status: string;
  /** 0..1 frost on the pod glass (HUD overlay) */
  frost: number;
  /** 0..1 headlamp strength (render multiplier on the lamp, ambient dims with it) */
  lamp: number;
  /** 0..1 red alarm strength */
  alarm: number;
  /** radians; the existing alarm light orbits with this */
  sweep: number;
  /** 0..1 vent rattle amplitude (small camera shake) */
  rattle: number;
  /** 0..1 white-hot flash at the instant of the burst */
  burstFlash: number;
  /** camera distance multiplier: starts close and low, eases to 1 */
  dolly: number;
  /** camera focus lift in metres: starts looking up out of the pod */
  lift: number;
  /** the crawler stays hidden until the vent bursts */
  enemyHidden: boolean;
  /** true on the first state at/after the burst moment */
  burst: boolean;
  /** show the SHOOT prompt */
  prompt: boolean;
  /** control is handed back */
  done: boolean;
  /** 1 = kneeling in the pod, 0 = standing (display-only pose blend for the operative rig) */
  wake: number;
  /** 0..1 letterbox bar coverage (1 = fully in, retracts to 0 at the handoff) */
  bars: number;
  /** 0..1 title card opacity */
  title: number;
  /** the full HUD and minimap stay hidden until the handoff */
  hudHidden: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Headlamp stutter: [start, end, level] windows between lampOn and lampSteady; gaps are dark. */
const LAMP_FLICKER: ReadonlyArray<readonly [number, number, number]> = [
  [2.2, 2.32, 0.55],
  [2.5, 2.58, 0.8],
  [2.86, 2.92, 0.4],
  [3.05, 3.3, 0.9],
];

function lampAt(t: number, reduce: boolean): number {
  const B = OPENING_BEATS;
  if (t < B.lampOn) return 0;
  // Reduce flashing: one slow ramp, no strobing.
  if (reduce) return smooth((t - B.lampOn) / (B.lampSteady - B.lampOn));
  if (t >= B.lampSteady) return Math.min(1, 0.9 + smooth((t - B.lampSteady) / 0.5) * 0.1);
  for (const [a, b, lv] of LAMP_FLICKER) if (t >= a && t < b) return lv;
  return 0;
}

const STATUS: ReadonlyArray<readonly [number, string]> = [
  [0.4, 'CRYO POD 09 // SEAL RELEASE'],
  [2.9, 'CORE TEMP 31C // MOTOR RESPONSE 12%'],
  [5.4, 'ALERT // CONTAINMENT BREACH, BAY 1'],
  [7.9, 'VENT 4 // PRESSURE FAULT'],
  [10.4, 'CONTACT // HOSTILE AT VENT 4'],
];
/** Every status caption holds at least this long (seconds) before the next one replaces it. */
export const CAPTION_MIN_HOLD_S = 2.5;
/** The red alarm never covers the view: this caps its strength (a single slow pulse, never full-screen). */
export const ALARM_MAX = 0.5;
export const CAPTIONS: ReadonlyArray<readonly [number, string]> = STATUS;

function statusAt(t: number): string {
  let out = '';
  for (const [at, text] of STATUS) if (t >= at) out = text;
  return out;
}

/** Opening state at `t` seconds. `reduce` follows the Reduce flashing setting: no strobe, no sweep, no shake. */
export function openingState(t: number, reduce = false): OpeningState {
  const B = OPENING_BEATS;
  const time = Math.max(0, t);
  const alarmIn = smooth((time - B.alarmOn) / 1.4);
  const alarmOut = 1 - smooth((time - B.burst - 0.4) / 1.4);
  const pulse = reduce ? 1 : 0.8 + 0.2 * Math.sin((time - B.alarmOn) * 1.3);
  const alarm = alarmIn * alarmOut * pulse * (reduce ? ALARM_MAX * 0.5 : ALARM_MAX);
  const rattleAmp = smooth((time - B.rattle) / (B.burst - B.rattle)) * (time < B.burst ? 1 : 0);
  const sinceBurst = time - B.burst;
  return {
    dark: Math.max(0, 1 - 0.45 * smooth((time - 1.0) / 1.4) - 0.55 * smooth((time - 2.4) / 3.0)),
    status: statusAt(time),
    frost: 1 - smooth((time - 0.8) / 3.2),
    lamp: lampAt(time, reduce),
    alarm,
    sweep: reduce ? 0 : (time - B.alarmOn) * 1.1,
    rattle: reduce ? 0 : rattleAmp * 0.5,
    burstFlash: reduce || sinceBurst < 0 ? 0 : 0.45 * Math.max(0, 1 - sinceBurst / 0.6),
    dolly: 0.55 + 0.45 * smooth((time - 1.4) / 4.2),
    lift: -1.0 * (1 - smooth((time - 1.2) / 3.6)),
    enemyHidden: time < B.burst,
    burst: time >= B.burst,
    prompt: time >= B.prompt,
    done: time >= B.handoff,
    wake: 1 - smooth((time - OPENING_WAKE.start) / ((reduce ? OPENING_WAKE.standByReduced : OPENING_WAKE.standBy) - OPENING_WAKE.start)),
    bars: 1 - smooth((time - OPENING_BARS.retractFrom) / (B.handoff - OPENING_BARS.retractFrom)),
    title: smooth((time - OPENING_TITLE.in) / 0.7) * (1 - smooth((time - OPENING_TITLE.out + 0.7) / 0.7)),
    hudHidden: time < B.handoff,
  };
}

/** Stateful player: advance with real time, ask for the one-shot burst edge, skip to the end. */
export class OpeningClock {
  time = 0;
  private burstFired = false;
  private skipped = false;

  reset(): void {
    this.time = 0;
    this.burstFired = false;
    this.skipped = false;
  }

  get finished(): boolean {
    return this.skipped || this.time >= OPENING_SECONDS;
  }

  skip(): void {
    this.skipped = true;
  }

  advance(dt: number): void {
    if (this.finished) return;
    this.time += Math.max(0, Math.min(0.1, dt));
  }

  state(reduce: boolean): OpeningState {
    return openingState(this.skipped ? OPENING_SECONDS : this.time, reduce);
  }

  /** True once, on the first call at or after the burst beat (never when skipped before it). */
  takeBurst(): boolean {
    if (this.burstFired || this.skipped || this.time < OPENING_BEATS.burst) return false;
    this.burstFired = true;
    return true;
  }
}

/** The display-only view the renderer reads each frame (no world state). */
export interface OpeningView {
  lamp: number;
  alarm: number;
  sweep: number;
  rattle: number;
  dolly: number;
  lift: number;
  /** 1 kneeling .. 0 standing: blended into the operative's display pose offsets */
  wake: number;
  hideEnemyIds: ReadonlySet<string>;
}

const HIDE: ReadonlySet<string> = new Set([OPENING_ENEMY_ID]);
const SHOWN: ReadonlySet<string> = new Set();

export function openingView(s: OpeningState): OpeningView {
  return { lamp: s.lamp, alarm: s.alarm, sweep: s.sweep, rattle: s.rattle, dolly: s.dolly, lift: s.lift, wake: s.wake, hideEnemyIds: s.enemyHidden ? HIDE : SHOWN };
}

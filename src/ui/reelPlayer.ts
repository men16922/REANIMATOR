// Trailer Reel runtime. The pure parts (ReelRunner clock/cut/beat events, ReelWorldDriver scripted sim, transition
// rules) have no DOM and are unit tested; ReelPlayer drives them through a small ReelHost so main.ts only registers
// callbacks. Nothing here changes a sim rule: world cuts step the real sim from a fresh deterministic world.

import { emptyInput3D, newWorld3D, stepWorld3D, type InputState3D, type WorldState3D } from '../game3d/world3d.ts';
import { applyDebugSetup } from './demo.ts';
import { captionAlpha, REEL_CUTS, reelBeatAt, reelCutAt, reelCutTime, reelTotalSeconds, type ReelCut, type ReelWorldPlan } from './reel.ts';

type Beat = NonNullable<ReelCut['beats']>[number];
export type ReelView = 'modern' | 'classic';

export type ReelEvent = { type: 'cut'; cut: ReelCut } | { type: 'beat'; cut: ReelCut; beat: Beat } | { type: 'done' };

/** Clock over REEL_CUTS: emits one `cut` per entered cut, each `beat` once, then `done`. Skippable at any time. */
export class ReelRunner {
  time = 0;
  done = false;
  private idx = -1;
  private fired = 0;

  get cut(): ReelCut {
    return REEL_CUTS[Math.max(0, this.idx)];
  }

  get cutTime(): number {
    return reelCutTime(this.time);
  }

  skip(): void {
    this.done = true;
  }

  advance(dt: number): ReelEvent[] {
    const out: ReelEvent[] = [];
    if (this.done) return out;
    this.time = Math.min(reelTotalSeconds(), this.time + Math.max(0, dt));
    const target = REEL_CUTS.indexOf(reelCutAt(this.time));
    while (this.idx < target) {
      this.idx++;
      this.fired = 0;
      out.push({ type: 'cut', cut: REEL_CUTS[this.idx] });
    }
    const beats = this.cut.beats ?? [];
    while (this.fired < beats.length && this.cutTime >= beats[this.fired].at) {
      out.push({ type: 'beat', cut: this.cut, beat: beats[this.fired] });
      this.fired++;
    }
    if (this.time >= reelTotalSeconds()) {
      this.done = true;
      out.push({ type: 'done' });
    }
    return out;
  }
}

/** Seconds of fade-in at the head of a cut. Reduce flashing turns every hard cut into a slow, calm crossfade. */
export function cutFadeSeconds(cut: ReelCut, reduce: boolean): number {
  if (reduce) return 0.6;
  return cut.flashy ? 0.12 : 0.3;
}

/** 0 = clear, 1 = black, for the canvas dip at the head of a cut. */
export function cutFade(cut: ReelCut, cutTime: number, reduce: boolean): number {
  const len = cutFadeSeconds(cut, reduce);
  return Math.min(1, Math.max(0, 1 - cutTime / len));
}

/** The CRT mosaic collapse is a flash effect: only with Reduce flashing off. Otherwise the view switches in place. */
export function crtAllowed(reduce: boolean): boolean {
  return !reduce;
}

type Frame = Partial<InputState3D>;

/** Steps the real sim at 60 Hz through a cut's scripted inputs, then idles. No randomness, same cut gives the same world. */
export class ReelWorldDriver {
  world: WorldState3D = newWorld3D();
  alpha = 1;
  private acc = 0;
  private index = 0;
  private inputs: readonly Frame[] = [];

  load(plan: ReelWorldPlan | undefined): void {
    this.world = newWorld3D(plan?.stage ? { stage: plan.stage } : {});
    if (plan) applyDebugSetup(this.world, plan.setup);
    this.inputs = plan?.inputs ?? [];
    this.index = 0;
    this.acc = 0;
    this.alpha = 1;
  }

  advance(dt: number, onStep?: (w: WorldState3D) => void): void {
    // Catch up deterministically after a slow frame so the world stays on the reel clock (a throttled tab or a 10 fps
    // laptop must not stretch a cut): up to 0.5 s of sim per frame, 30 ticks at most.
    this.acc += Math.min(0.5, Math.max(0, dt));
    const step = 1 / 60;
    let n = 0;
    while (this.acc >= step && n < 30) {
      this.acc -= step;
      n++;
      if (this.world.status !== 'playing') continue;
      const p = this.world.player;
      const frame = this.inputs[this.index++] ?? {};
      this.world = stepWorld3D(this.world, { ...emptyInput3D(), aimX: p.body.x + p.facing * 8, aimY: p.body.y + 1.12, ...frame });
      onStep?.(this.world);
    }
    this.alpha = Math.min(1, this.acc * 60);
  }
}

export interface ReelHost {
  reduce(): boolean;
  view(): ReelView;
  /** Switch view. `crt` true plays the 0.4 s CRT collapse; false switches in place. Never persists. */
  setView(v: ReelView, crt: boolean): void;
  lab(on: boolean, mutation: boolean): void;
  /** True when the lab panel is really open (read from the DOM, not remembered), so outside closes are noticed. */
  labOpen(): boolean;
  /** Start or stop the opening wake overlay (real-time clock owned by main). */
  opening(on: boolean): void;
  endCard(on: boolean, cut: ReelCut): void;
  caption(title: string, sub: string, alpha: number): void;
  /** 0 clear .. 1 black over the 3D canvas. */
  canvasFade(f: number): void;
  observe(w: WorldState3D): void;
  resetFx(): void;
  /** The reel ended on its own. */
  finish(): void;
}

export class ReelPlayer {
  active = false;
  private runner = new ReelRunner();
  private readonly driver = new ReelWorldDriver();
  private savedView: ReelView = 'modern';

  private readonly host: ReelHost;

  constructor(host: ReelHost) {
    this.host = host;
  }

  get world(): WorldState3D {
    return this.driver.world;
  }

  get alpha(): number {
    return this.driver.alpha;
  }

  get time(): number {
    return this.runner.time;
  }

  get cut(): ReelCut {
    return this.runner.cut;
  }

  start(): void {
    this.runner = new ReelRunner();
    this.driver.load(undefined);
    this.savedView = this.host.view();
    this.active = true;
    this.host.setView('modern', false);
    this.apply(this.runner.advance(0));
  }

  /** Esc, any key or pointer: tear everything down and restore the viewer's view mode. */
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.runner.skip();
    this.host.lab(false, false);
    this.host.opening(false);
    this.host.endCard(false, REEL_CUTS[0]);
    this.host.caption('', '', 0);
    this.host.canvasFade(0);
    this.host.setView(this.savedView, false);
    this.host.resetFx();
  }

  frame(dt: number): void {
    if (!this.active) return;
    const reduce = this.host.reduce();
    const events = this.runner.advance(dt);
    this.apply(events);
    if (!this.active) return;
    const cut = this.runner.cut;
    // Invariant, every frame: the lab is open exactly during the lab cut. Anything else hid or showed it from outside.
    if (this.host.labOpen() !== (cut.target === 'lab')) this.host.lab(cut.target === 'lab', this.labMutation(cut));
    if (cut.target === 'world') this.driver.advance(dt, (w) => this.host.observe(w));
    const ct = this.runner.cutTime;
    this.host.canvasFade(cut.target === 'world' ? cutFade(cut, ct, reduce) : 0);
    this.host.caption(cut.caption, cut.sub, cut.target === 'endcard' ? 0 : captionAlpha(ct, cut.duration));
    if (this.runner.done) {
      this.stop();
      this.host.finish();
    }
  }

  private labMutation(cut: ReelCut): boolean {
    return reelBeatAt(cut, this.runner.cutTime).labMode === 'mutation';
  }

  private apply(events: ReelEvent[]): void {
    const reduce = this.host.reduce();
    for (const ev of events) {
      if (ev.type === 'cut') this.enter(ev.cut);
      else if (ev.type === 'beat') {
        if (ev.beat.labMode) this.host.lab(true, ev.beat.labMode === 'mutation');
        if (ev.beat.view) this.host.setView(ev.beat.view, ev.beat.crt === true && crtAllowed(reduce));
      }
    }
  }

  private enter(cut: ReelCut): void {
    this.host.resetFx();
    this.host.opening(false);
    this.host.lab(cut.target === 'lab', cut.labMode === 'mutation');
    this.host.endCard(cut.target === 'endcard', cut);
    if (cut.target === 'world') {
      if (cut.view) this.host.setView(cut.view, false);
      this.driver.load(cut.plan);
      if (cut.plan?.openingAt !== undefined) this.host.opening(true);
    }
  }
}

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
};

export interface ReelDomParts {
  canvas: HTMLCanvasElement;
  reduce(): boolean;
  view(): ReelView;
  setView(v: ReelView, crt: boolean): void;
  opening(on: boolean): void;
  observe(w: WorldState3D): void;
  resetFx(): void;
  finish(): void;
  openLab(): void;
  closeLab(): void;
  labOpen(): boolean;
}

/** Browser host: lower-third caption, lab mutation switch, end card and canvas fade. main.ts supplies the engine hooks. */
export function createReelHost(p: ReelDomParts): ReelHost {
  return {
    reduce: p.reduce,
    view: p.view,
    setView: p.setView,
    opening: p.opening,
    observe: p.observe,
    resetFx: p.resetFx,
    finish: p.finish,
    labOpen: p.labOpen,
    lab(on, mutation) {
      const open = p.labOpen();
      if (on && !open) p.openLab();
      else if (!on && open) p.closeLab();
      const box = byId('lab-mutation') as HTMLInputElement;
      if (!on) {
        // Leave the lab as the viewer would find it: the demo mutation is a reel beat, never a lasting setting
        if (box.checked) {
          box.checked = false;
          box.dispatchEvent(new Event('change'));
        }
        return;
      }
      if (box.checked !== mutation) {
        box.checked = mutation;
        box.dispatchEvent(new Event('change'));
      }
    },
    endCard(on, cut) {
      const el = byId('reel-end');
      el.hidden = !on;
      if (on) {
        byId('reel-end-title').textContent = cut.caption;
        byId('reel-end-sub').textContent = cut.sub;
      }
    },
    caption(title, sub, alpha) {
      const el = byId('showcase-caption');
      if (el.querySelector('b')!.textContent !== title) {
        byId('showcase-title').textContent = title;
        byId('showcase-sub').textContent = sub;
      }
      el.hidden = title === '';
      document.body.classList.toggle('reel-on', title !== '');
      el.style.opacity = String(alpha);
    },
    canvasFade(f) {
      p.canvas.style.opacity = f > 0 ? String(1 - f * 0.96) : '';
    },
  };
}

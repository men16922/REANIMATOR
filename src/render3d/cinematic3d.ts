// Core Warden intro cinematic: pure timeline (node-testable) plus a small DOM overlay (letterbox, title card,
// skip hint). Display-side only; the simulation holds the boss and the player for BOSS_INTRO_TICKS on its own.

import { BOSS_INTRO_TICKS } from '../game3d/world3d.ts';

export interface IntroState {
  /** 0 = camera on the player, 1 = camera on the boss */
  pan: number;
  /** 0..1 camera push-in */
  zoom: number;
  /** 0..1 awakening (core ignites, hull glows) */
  awake: number;
  /** 0..1 letterbox bar height */
  bars: number;
  /** 0..1 title card opacity */
  title: number;
  /** true once the roar beat has passed */
  roared: boolean;
}

const smooth = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** Fraction of the intro at which the roar (shake, shockwave ring) fires. */
export const INTRO_ROAR_AT = 0.42;

/**
 * Timeline over u = elapsed fraction (0..1):
 * 0.00-0.30 pan to the boss, 0.30-0.42 hold and push in, 0.42 roar + title,
 * 0.42-0.72 hold on the awakened boss, 0.72-1.00 pan back to the player.
 */
export function introState(ticksLeft: number, total: number = BOSS_INTRO_TICKS): IntroState {
  if (ticksLeft <= 0) return { pan: 0, zoom: 0, awake: 0, bars: 0, title: 0, roared: false };
  const u = Math.min(1, Math.max(0, 1 - ticksLeft / total));
  const pan = u < 0.72 ? smooth(u / 0.3) : 1 - smooth((u - 0.72) / 0.28);
  const zoom = u < 0.72 ? smooth(u / 0.42) : 1 - smooth((u - 0.72) / 0.28);
  const awake = smooth((u - 0.3) / 0.14);
  const bars = Math.min(smooth(u / 0.08), 1 - smooth((u - 0.94) / 0.06));
  const title = smooth((u - INTRO_ROAR_AT) / 0.06) * (1 - smooth((u - 0.7) / 0.1));
  return { pan, zoom, awake, bars, title, roared: u >= INTRO_ROAR_AT };
}

/**
 * Display clock for the intro. While the simulation ticks, the display follows it exactly. When the world is frozen
 * (manual/debug mode, pause-like holds) `sim` stops changing, so the display counts down on real time instead and
 * the cinematic still plays. Never drops below 1 while the intro is active and never reads 0 until the sim says so.
 */
export function nextIntroDisplayTicks(prevDisplay: number, prevSim: number, sim: number, dtSec: number, hz = 60): number {
  if (sim <= 0) return 0;
  if (sim !== prevSim || prevDisplay <= 0) return sim;
  return Math.max(1, prevDisplay - dtSec * hz);
}

const STYLE = `
.boss-intro{position:absolute;inset:0;pointer-events:none;z-index:40;overflow:hidden;font-family:"Arial Black",Impact,sans-serif}
.boss-intro .bar{position:absolute;left:0;right:0;height:11%;background:#000;transition:none}
.boss-intro .bar.t{top:0}.boss-intro .bar.b{bottom:0}
.boss-intro .card{position:absolute;left:0;right:0;top:56%;text-align:center;color:#ffe9d6;opacity:0}
.boss-intro .card .kicker{font-size:clamp(11px,1.3vw,16px);letter-spacing:.5em;color:#ff8a5c;text-shadow:0 0 12px #ff3b1a}
.boss-intro .card .name{font-size:clamp(34px,6vw,84px);letter-spacing:.14em;margin:.1em 0;text-shadow:0 0 18px #ff3b1a,0 0 48px #ff3b1a66,0 3px 0 #300}
.boss-intro .card .rule{height:2px;width:min(46%,520px);margin:.3em auto;background:linear-gradient(90deg,transparent,#ff6a3a,transparent)}
.boss-intro .card .sub{font-size:clamp(11px,1.2vw,15px);letter-spacing:.34em;color:#c9b8ae}
.boss-intro .skip{position:absolute;right:2.2%;bottom:13%;font-size:12px;letter-spacing:.2em;color:#bbb;opacity:.75}
body.meltdown-alert #meltdown{animation:melt-pulse .5s steps(2,end) infinite;box-shadow:0 0 18px #ff2936,inset 0 0 12px #ff293688;transform:scale(1.18);transform-origin:right top}
body.meltdown-calm #meltdown{animation:none}
@keyframes melt-pulse{0%{filter:brightness(1.7)}100%{filter:brightness(.8)}}
`;

/** DOM overlay for the intro. Created lazily on first use; parent is the canvas container. */
export class BossIntroOverlay {
  private root: HTMLDivElement | null = null;
  private barT!: HTMLDivElement;
  private barB!: HTMLDivElement;
  private card!: HTMLDivElement;
  private skip!: HTMLDivElement;

  private readonly host: () => HTMLElement | null;

  constructor(host: () => HTMLElement | null) {
    this.host = host;
  }

  private ensure(): boolean {
    if (this.root) return true;
    const parent = this.host();
    if (!parent) return false;
    if (!document.getElementById('boss-intro-style')) {
      const st = document.createElement('style');
      st.id = 'boss-intro-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    root.className = 'boss-intro';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="bar t"></div><div class="bar b"></div>' +
      '<div class="card"><div class="kicker">SECTOR 06 // CORE VAULT</div><div class="name">CORE WARDEN</div><div class="rule"></div><div class="sub">REACTOR GUARDIAN UNIT</div></div>' +
      '<div class="skip">ENTER / ESC: SKIP</div>';
    root.style.display = 'none';
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    parent.appendChild(root);
    this.root = root;
    this.barT = root.querySelector('.bar.t') as HTMLDivElement;
    this.barB = root.querySelector('.bar.b') as HTMLDivElement;
    this.card = root.querySelector('.card') as HTMLDivElement;
    this.skip = root.querySelector('.skip') as HTMLDivElement;
    return true;
  }

  apply(s: IntroState, active: boolean): void {
    if (!active) {
      if (this.root && this.root.style.display !== 'none') this.root.style.display = 'none';
      return;
    }
    if (!this.ensure() || !this.root) return;
    this.root.style.display = 'block';
    this.barT.style.transform = `scaleY(${s.bars})`;
    this.barB.style.transform = `scaleY(${s.bars})`;
    this.barT.style.transformOrigin = 'top';
    this.barB.style.transformOrigin = 'bottom';
    this.card.style.opacity = String(s.title);
    this.skip.style.opacity = String(0.75 * s.bars);
  }
}

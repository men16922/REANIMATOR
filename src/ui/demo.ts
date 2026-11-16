// Showcase demo support (pure, no DOM): checkpoint list for EXTRAS > DEMO TOUR, the deterministic
// world setup they share with the debug hooks, scene recipes for __reanimatorShowcase(name), and the
// captioned reel behind EXTRAS > WATCH SHOWCASE.

import { spawnBody3D } from '../engine/motion3d.ts';
import type { SectorId3D, StageId3D, WeaponSlot3D } from '../game3d/types3d.ts';
import { WEAPON_META, type InputState3D, type WorldState3D } from '../game3d/world3d.ts';

/** Deterministic world edits. Same shape the __reanimatorAdvance debug hook always accepted. */
export interface DebugSetup3D {
  x?: number;
  y?: number;
  boots?: boolean;
  tanks?: number;
  weapons?: WeaponSlot3D[];
  /** Grant the Crawl Slide module */
  slide?: boolean;
  /** Reactor already destroyed, this many meltdown ticks left (escape sequence beats, final hatch) */
  meltdownTicks?: number;
  openDoors?: string[];
  console?: boolean;
  hp?: number;
  aimX?: number;
  aimY?: number;
  /** Force the Core Warden to phase 1|2|3 (sets HP just inside the phase). */
  bossPhase?: 1 | 2 | 3;
  /** Mark the Warden intro as already played (no cinematic). */
  skipIntro?: boolean;
  /** Remove every enemy except bosses (Warden, Foreman) so a boss close-up is not crowded out by its pack. */
  clearFoes?: boolean;
}

export function applyDebugSetup(w: WorldState3D, o: DebugSetup3D): void {
  const p = w.player;
  if (o.x !== undefined || o.y !== undefined) {
    p.body = spawnBody3D(o.x ?? p.body.x, o.y ?? p.body.y, 0);
    w.hint = '';
    w.hintTicks = 0;
    w.hintSector = '';
  }
  if (o.boots) p.abilities.thrusterBoots = true;
  if (o.slide) p.abilities.crawlSlide = true;
  if (o.meltdownTicks !== undefined) {
    w.coreDestroyed = true;
    w.coreHp = 0;
    w.phase = 'escape';
    w.openDoors.add('door_escape');
    w.meltdownTicks = o.meltdownTicks;
    const wd = w.enemies.find((e) => e.kind === 'warden' && !e.minion);
    if (wd) {
      wd.alive = false;
      wd.hp = 0;
    }
  }
  if (o.tanks !== undefined) {
    p.energyTanks = o.tanks;
    p.maxHp = 100 + 30 * o.tanks;
    p.hp = p.maxHp;
  }
  for (const s of o.weapons ?? []) {
    p.unlocked[s] = true;
    if (s !== 1) p.ammo[s as 2 | 3 | 4 | 5 | 6] = WEAPON_META[s].initialAmmo;
  }
  for (const d of o.openDoors ?? []) w.openDoors.add(d);
  if (o.console) w.consoleUnlocked = true;
  if (o.hp !== undefined) p.hp = o.hp;
  if (o.aimX !== undefined) p.aimX = o.aimX;
  if (o.aimY !== undefined) p.aimY = o.aimY;
  if (o.skipIntro) w.bossIntroDone = true;
  if (o.clearFoes) {
    for (const e of w.enemies) {
      if (e.kind === 'warden' || e.variant === 'foreman') continue;
      e.alive = false;
      e.hp = 0;
    }
  }
  if (o.bossPhase) {
    const wd = w.enemies.find((e) => e.kind === 'warden' && !e.minion);
    if (wd) {
      wd.phase = o.bossPhase;
      wd.hp = Math.floor(wd.maxHp * (o.bossPhase === 1 ? 0.95 : o.bossPhase === 2 ? 0.6 : 0.28));
    }
  }
}

// ---- DEMO TOUR checkpoints ----

const ALL_WEAPONS: WeaponSlot3D[] = [1, 2, 3, 4];
/** Loadout for every checkpoint past the Airlock: the first four weapons, boots, two tanks. */
const KIT: DebugSetup3D = { boots: true, tanks: 2, weapons: ALL_WEAPONS };
/** Late checkpoints (Security Deck onward) also carry the Flamer and the Rocket launcher. */
const KIT_LATE: DebugSetup3D = { ...KIT, weapons: [...ALL_WEAPONS, 5, 6] };
const BOSS_BASE: DebugSetup3D = { ...KIT_LATE, x: 80, y: 0, console: true, openDoors: ['door_boss'], hp: 999, skipIntro: true };

export interface DemoStop {
  /** Stable id; the DOM button is `demo-<id>`. */
  id: string;
  label: string;
  /** One line shown in the DEMO badge while this checkpoint plays. */
  badge: string;
  /** Sector the player must be in right after entering (checked by tests/demo.test.ts). */
  sector: SectorId3D;
  setup: DebugSetup3D;
  /** Switch to Classic View on entry (the Classic View checkpoint). */
  view?: 'classic';
  /** Expected Warden phase for boss stops. */
  bossPhase?: 1 | 2 | 3;
}

export const DEMO_STOPS: readonly DemoStop[] = [
  { id: 'airlock', label: 'Airlock start', badge: 'AIRLOCK BAY · fresh run, Pulse rifle only', sector: 'airlock', setup: {} },
  {
    id: 'mines',
    label: 'Mines: crusher and hive',
    badge: 'ACID MINES · time the crusher, burn the hive, mind the acid',
    sector: 'mines',
    setup: { ...KIT, x: 11, y: -11 },
  },
  {
    id: 'biolabs',
    label: 'Bio-Labs: switch and barrels',
    badge: 'BIO-LABS · shoot the explosive barrels, hit the gantry switch',
    sector: 'biolabs',
    setup: { ...KIT, x: 47, y: 0, openDoors: ['door_airlock_shaft'] },
  },
  {
    id: 'security',
    label: 'Security: laser grid',
    badge: 'SECURITY DECK · lasers cycle; the console switches them off',
    sector: 'security',
    setup: { ...KIT_LATE, x: 55, y: 8.8 },
  },
  {
    id: 'slide',
    label: 'Crawl Slide tunnel',
    badge: 'SERVICE DUCT · hold S and dash to Crawl Slide through the gap',
    sector: 'shaft',
    setup: { ...KIT_LATE, slide: true, x: 38.5, y: -4.4 },
  },
  { id: 'boss1', label: 'Core Warden: phase I', badge: 'CORE WARDEN · phase I · aim for the glowing core', sector: 'core', setup: { ...BOSS_BASE, bossPhase: 1 }, bossPhase: 1 },
  { id: 'boss2', label: 'Core Warden: phase II', badge: 'CORE WARDEN · phase II · dodge the sweeps', sector: 'core', setup: { ...BOSS_BASE, bossPhase: 2 }, bossPhase: 2 },
  { id: 'boss3', label: 'Core Warden: phase III', badge: 'CORE WARDEN · phase III · finish it', sector: 'core', setup: { ...BOSS_BASE, bossPhase: 3 }, bossPhase: 3 },
  {
    id: 'collapse',
    label: 'Meltdown: collapsing bridge',
    badge: 'MELTDOWN · run west before the bridge crumbles',
    sector: 'airlock',
    setup: { ...KIT_LATE, x: 23.4, y: 5.2, console: true, meltdownTicks: 2400 },
  },
  {
    id: 'hatch',
    label: 'Meltdown: extraction hatch',
    badge: 'MELTDOWN · reach the hatch before the timer ends',
    sector: 'airlock',
    setup: { ...KIT_LATE, x: 14, y: 5.2, console: true, meltdownTicks: 900 },
  },
  {
    id: 'classic',
    label: 'Classic View (press V)',
    badge: 'CLASSIC VIEW · 320x200, 256 colours, dither · press V to switch back',
    sector: 'shaft',
    setup: { ...KIT_LATE, x: 30, y: 0 },
    view: 'classic',
  },
];

export function demoStopById(id: string): DemoStop | undefined {
  return DEMO_STOPS.find((s) => s.id === id);
}

// ---- __reanimatorShowcase(name) scenes ----

type Frame = Partial<InputState3D>;
const rep = (n: number, f: Frame): Frame[] => Array.from({ length: n }, () => ({ ...f }));

export interface ShowcaseScene {
  /** Where this scene is shown. `title` and `lab` are menu scenes with no world setup. */
  kind: 'world' | 'title' | 'lab';
  view?: 'modern' | 'classic';
  setup?: DebugSetup3D;
  /** Input frames stepped from the fresh world before the camera settles. */
  inputs?: Frame[];
  /** Expected sector after the inputs (for tests). */
  sector?: SectorId3D;
  /** R10: freeze the opening set piece at this many seconds (display clock) over the fresh airlock world. */
  openingAt?: number;
  /** Real animation frames to wait after the last tick. Short for scenes with fast-decaying particles. */
  settleFrames: number;
}

export const SHOWCASE_SCENES: Readonly<Record<string, ShowcaseScene>> = {
  title: { kind: 'title', settleFrames: 12 },
  classic: { kind: 'world', view: 'classic', setup: { ...KIT, x: 28, y: -11 }, inputs: rep(40, { moveX: 1 }), sector: 'shaft', settleFrames: 14 },
  // Three enemies in range, scattergun held down: muzzle flash, tracers and hit sparks are all live.
  combat: {
    kind: 'world',
    setup: { ...KIT, x: 53, y: 0, openDoors: ['door_airlock_shaft'], aimX: 62, aimY: 1.1 },
    inputs: [{ weaponSlot: 2, fire: true, aimX: 62, aimY: 1.1 }, ...rep(34, { fire: true, aimX: 62, aimY: 1.1 })],
    sector: 'biolabs',
    settleFrames: 2,
  },
  boss: { kind: 'world', setup: { ...BOSS_BASE, bossPhase: 2 }, inputs: rep(30, { fire: true, aimX: 83, aimY: 2.4 }), sector: 'core', settleFrames: 6 },
  mines: { kind: 'world', setup: { ...KIT, x: 12, y: -11 }, inputs: rep(70, { moveX: 1, fire: true }), sector: 'mines', settleFrames: 10 },
  biolabs: { kind: 'world', setup: { ...KIT, x: 46, y: 0 }, inputs: rep(30, { moveX: 1 }), sector: 'biolabs', settleFrames: 12 },
  security: { kind: 'world', setup: { ...KIT_LATE, x: 55, y: 8.8 }, inputs: rep(20, { moveX: 1 }), sector: 'security', settleFrames: 12 },
  slide: { kind: 'world', setup: { ...KIT_LATE, slide: true, x: 38.5, y: -4.4 }, inputs: rep(30, { moveX: 1 }), sector: 'shaft', settleFrames: 12 },
  escape: { kind: 'world', setup: { ...KIT_LATE, x: 23.4, y: 5.2, console: true, meltdownTicks: 2400 }, inputs: rep(60, { moveX: -1 }), sector: 'airlock', settleFrames: 8 },
  // R10 opening set piece, frozen at three beats (display-side: the world is the untouched tick-0 airlock).
  'opening-wake': { kind: 'world', openingAt: 3.0, sector: 'airlock', settleFrames: 8 },
  'opening-alarm': { kind: 'world', openingAt: 7.0, sector: 'airlock', settleFrames: 8 },
  opening: { kind: 'world', openingAt: 11.4, sector: 'airlock', settleFrames: 6 },
  // R12 bestiary: the Sunken Mines floor holds a stalker, two crawlers, two droppers, a climber and a spitter within
  // one screen of x = 14. The operative stands still with two tanks while they close in, so every foe is on camera.
  bestiary: { kind: 'world', setup: { ...KIT, x: 14, y: -11 }, inputs: rep(100, {}), sector: 'mines', settleFrames: 8 },
  lab: { kind: 'lab', settleFrames: 6 },
};

export const SHOWCASE_NAMES: readonly string[] = Object.keys(SHOWCASE_SCENES);

// ---- Autoplay showcase (EXTRAS > WATCH SHOWCASE) ----

export interface ShowCut {
  /** Bot tick the cut starts at; the deterministic bot reaches it from a fresh world. */
  tick: number;
  /** Sector the bot is expected to be in at that tick (checked by tests). */
  sector: SectorId3D;
  caption: string;
  sub: string;
  view?: 'classic' | 'modern';
  /** Stage whose world the bot plays for this cut (default 1). A cut with another stage swaps the world. */
  stage?: StageId3D;
}

export const SHOWCASE_CUT_SECONDS = 7.5;

/**
 * Twelve cuts of 7.5 s: 90 seconds, all three stages. Ticks are from the shipped bot runs on Normal
 * (Stage 1 wins at 4978, Stage 2 at 2858, Stage 3 at 3243). Each cut seeks by re-running its own stage's bot from a fresh world.
 */
export const SHOWCASE_REEL: readonly ShowCut[] = [
  { tick: 60, sector: 'airlock', caption: '1996 physics, frame-exact', sub: 'Abuse movement restored and checked field by field against the original' },
  { tick: 260, sector: 'shaft', caption: 'Six sectors, one connected map', sub: 'Central Shaft: every route in the facility passes through here' },
  { tick: 600, sector: 'mines', caption: 'Hazards that read before they hit', sub: 'Crushers, vents and hive nests all telegraph', view: 'modern' },
  { tick: 2150, sector: 'biolabs', caption: 'Locks that need the right weapon', sub: 'Pulse, Scattergun, Grenade and Rail open different doors' },
  { tick: 3000, sector: 'security', caption: 'Classic View: press V', sub: '320x200, 256 colours, Bayer dither. Same sim, 1996 look', view: 'classic' },
  { tick: 4100, sector: 'core', caption: 'Core Warden', sub: 'Three phases, telegraphed attacks, a weak-point window', view: 'modern' },
  { tick: 1200, sector: 'mines', stage: 2, caption: 'Stage 2: Foundry Line', sub: 'Lever doors, gantry pits and a molten furnace line', view: 'modern' },
  { tick: 2600, sector: 'core', stage: 2, caption: 'Slag Foreman', sub: 'A heavy mini-boss holds the exit teleporter. Jump the shockwave.' },
  { tick: 1000, sector: 'mines', stage: 3, caption: 'Stage 3: Reactor Spire', sub: 'A vertical climb through the broken reactor tower' },
  { tick: 2700, sector: 'core', stage: 3, caption: 'The Spire Warden', sub: 'Break the Warden to unlock the last teleporter' },
  { tick: 4420, sector: 'biolabs', caption: 'Meltdown: 90 seconds', sub: 'The reactor is gone. Get to the hatch.' },
  { tick: 4920, sector: 'airlock', caption: 'REANIMATOR', sub: 'Three stages. Reach the core. Get out. Press any key to play.' },
];

/** Index of the showcase cut for an elapsed time, clamped to the last cut. */
export function showcaseCutAt(time: number): number {
  return Math.min(SHOWCASE_REEL.length - 1, Math.floor(Math.max(0, time) / SHOWCASE_CUT_SECONDS));
}

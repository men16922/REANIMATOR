// Pure UI-flow logic (no DOM): run statistics and rank, collection percentage, sector title cards,
// retry tips, and the onboarding hint state machine. Kept DOM-free so tests/ui.test.ts can cover it.

import type { DoorLockKind3D, SectorId3D } from '../game3d/types3d.ts';
import { getRunSummary3D, updateCompletion3D, type InputState3D, type WorldState3D } from '../game3d/world3d.ts';

export type Rank = 'S' | 'A' | 'B' | 'C';

export interface RunStats {
  seconds: number;
  kills: number;
  deaths: number;
  collectionPct: number;
  rank: Rank;
}

/** Share of upgrades (Boots, E-Tanks) and weapons (2-4) collected, 0..100. */
export function collectionPercent(w: WorldState3D): number {
  const upgrades = w.level.upgrades.length;
  const weaponsTotal = 3;
  const total = upgrades + weaponsTotal;
  if (total === 0) return 100;
  const have =
    w.level.upgrades.filter((u) => w.collectedUpgrades.has(u.id)).length +
    ([2, 3, 4] as const).filter((s) => w.player.unlocked[s]).length;
  return Math.round((have / total) * 100);
}

/** Rank thresholds. Only meaningful for a won run; a lost run is always C. */
export function rankFor(won: boolean, seconds: number, deaths: number, collectionPct: number): Rank {
  if (!won) return 'C';
  if (deaths === 0 && collectionPct >= 100 && seconds <= 900) return 'S';
  if (deaths <= 2 && collectionPct >= 75 && seconds <= 1500) return 'A';
  if (collectionPct >= 50) return 'B';
  return 'C';
}

/** Result-screen stats come straight from the simulation (getRunSummary3D) so UI and sim never disagree. */
export function buildRunStats(w: WorldState3D, _deaths = 0, simHz = 60): RunStats {
  updateCompletion3D(w);
  const sm = getRunSummary3D(w);
  return {
    seconds: w.tick / simHz,
    kills: sm.kills,
    // A lost run is shown before respawnPlayer3D increments run.deaths, so count the current defeat.
    deaths: sm.deaths + (w.status === 'lost' ? 1 : 0),
    collectionPct: sm.completionPercent,
    rank: sm.rank,
  };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const SECTOR_SUBTITLE: Record<SectorId3D, string> = {
  airlock: 'Where you woke up. The extraction balcony is the way out.',
  shaft: 'Everything connects here. Not everything is open yet.',
  mines: 'Acid pools. Something here lets you jump twice.',
  biolabs: 'The specimens are not in their tanks anymore.',
  security: 'Armed locks. The console decides which doors die.',
  core: 'The reactor never stopped burning.',
};

export const RETRY_TIPS: string[] = [
  'Dash has invulnerability frames. Use it to pass through attacks, not just away from them.',
  'Save stations restore hull and ammo. Press F next to one before a hard fight.',
  'Each door color needs a matching weapon: blue Pulse, green Scattergun, yellow Grenade, red Rail.',
  'Press S on a grate to drop through it. Thruster Boots give you a second jump in mid-air.',
  'The headlamp is only for your eyes. It never changes what enemies see.',
  'Open the sector map with Tab to find doors you have not opened yet.',
];

export function retryTip(deaths: number): string {
  return RETRY_TIPS[Math.max(0, deaths - 1) % RETRY_TIPS.length];
}

// ---------------- Onboarding ----------------

export interface Hint {
  id: string;
  keys: string[];
  text: string;
}

export interface InputUsage {
  moved: boolean;
  jumped: boolean;
  fired: boolean;
  dashed: boolean;
  light: boolean;
  weapon: boolean;
}

export const ONBOARDING_WINDOW_TICKS = 5 * 60 * 60;

const DOOR_RULE: Record<DoorLockKind3D, Hint | null> = {
  blue: { id: 'door-blue', keys: ['1', 'LMB'], text: 'BLUE LOCK: shoot it with the Pulse Rifle' },
  green: { id: 'door-green', keys: ['2', 'LMB'], text: 'GREEN LOCK: needs the Scattergun' },
  yellow: { id: 'door-yellow', keys: ['3', 'LMB'], text: 'YELLOW LOCK: blast the Cracked Bio-Wall with a Grenade' },
  red: { id: 'door-red', keys: ['4', 'LMB'], text: 'RED LOCK: Rail-Cannon, and the Security Console must be armed' },
  console: { id: 'door-console', keys: ['F'], text: 'Arm the Security Console to power the red locks' },
  escape: null,
};

const NEAR_DOOR = 5.5;
const NEAR_SAVE = 4;
/** Terminals only announce themselves up close, so the spawn-side airlock terminal never pre-empts the opening tutorial */
const NEAR_MAP = 2.4;

/** Tracks which hints are finished and chooses the one to show now (at most one at a time). */
export class Onboarding {
  readonly done: Set<string>;
  readonly usage: InputUsage = { moved: false, jumped: false, fired: false, dashed: false, light: false, weapon: false };

  constructor(done: Iterable<string> = []) {
    this.done = new Set(done);
  }

  observe(inp: Pick<InputState3D, 'moveX' | 'jump' | 'fire' | 'dash' | 'toggleLight' | 'weaponSlot'>): void {
    if (inp.moveX !== 0) this.usage.moved = true;
    if (inp.jump) this.usage.jumped = true;
    if (inp.fire) this.usage.fired = true;
    if (inp.dash) this.usage.dashed = true;
    if (inp.toggleLight) this.usage.light = true;
    if (inp.weaponSlot) this.usage.weapon = true;
  }

  /** Returns the hint to show, or null. Marks hints done when the player performs the action. */
  update(w: WorldState3D): Hint | null {
    if (w.tick > ONBOARDING_WINDOW_TICKS || w.status !== 'playing') return null;
    const u = this.usage;
    const finish = (id: string, cond: boolean): boolean => {
      if (cond) this.done.add(id);
      return this.done.has(id);
    };

    // Context rules first: they matter more than the basic-controls tutorial when the player is at a door or a save.
    const p = w.player.body;
    for (const s of w.level.solids) {
      if (!s.doorId || !s.doorLock) continue;
      // Secret-room walls stay unannounced: discovering them is the point.
      if (w.level.secrets.some((sr) => sr.doorId === s.doorId)) continue;
      const rule = DOOR_RULE[s.doorLock];
      if (!rule) continue;
      if (this.done.has(rule.id)) continue;
      if (w.openDoors.has(s.doorId)) {
        this.done.add(rule.id);
        continue;
      }
      const dx = Math.max(s.minX - p.x, 0, p.x - s.maxX);
      const dy = Math.max(s.minY - p.y, 0, p.y - s.maxY);
      if (dx < NEAR_DOOR && dy < 3) return rule;
    }
    for (const st of w.level.saveStations) {
      if (this.done.has('save')) break;
      if (w.lastSaveId) {
        this.done.add('save');
        break;
      }
      if (Math.hypot(st.x - p.x, st.y - p.y) < NEAR_SAVE) return { id: 'save', keys: ['F'], text: 'SAVE STATION: restores hull and ammo, sets your respawn' };
    }

    for (const ms of w.level.mapStations) {
      if (this.done.has('map')) break;
      if (w.mapRevealed.length > 0) {
        this.done.add('map');
        break;
      }
      if (Math.hypot(ms.x - p.x, ms.y - p.y) < NEAR_MAP) return { id: 'map', keys: ['F'], text: 'MAP TERMINAL: reveals this whole sector on the minimap' };
    }
    if (w.player.abilities.crawlSlide && !this.done.has('slide')) {
      if (w.player.body.sliding) this.done.add('slide');
      else {
        for (const tn of w.level.tunnels) {
          if (Math.hypot(tn.approach.x - p.x, tn.approach.y - p.y) < NEAR_SAVE) return { id: 'slide', keys: ['S', 'SHIFT'], text: `${tn.label}: hold S and press Shift on the ground to slide under` };
        }
      }
    }

    if (w.tick < 90) return null;
    if (!finish('move', u.moved)) return { id: 'move', keys: ['A', 'D'], text: 'RUN' };
    if (!finish('jump', u.jumped)) return { id: 'jump', keys: ['SPACE'], text: 'JUMP' };
    if (!finish('fire', u.fired)) return { id: 'fire', keys: ['MOUSE', 'LMB'], text: 'AIM AND FIRE' };
    if (!finish('dash', u.dashed)) return { id: 'dash', keys: ['SHIFT'], text: 'DASH THROUGH DANGER' };
    if (w.tick > 1800 && !finish('light', u.light)) return { id: 'light', keys: ['E'], text: 'TOGGLE HEADLAMP' };
    return null;
  }
}

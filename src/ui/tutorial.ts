// Pure tutorial state machine (no DOM). Teaches one move at a time from read-only observation of input and world state.
// The sim is never touched: this only watches InputState3D and the player's ability flags.

import type { InputState3D, WorldState3D } from '../game3d/world3d.ts';

export interface TutorialPrompt {
  id: string;
  keys: string[];
  text: string;
}

export interface TutorialStep extends TutorialPrompt {
  /** Ability steps only appear after the ability is acquired. */
  needs?: 'thrusterBoots' | 'blastCore' | 'scanLens' | 'thermalPlating';
  /** Updates the prompt may stay up when the player never performs the action (ability steps retire themselves). */
  cap?: number;
}

export const TUTORIAL_STORE_KEY = 'reanimator.tutorial.v1';
/** Basic prompts wait this long after the run starts so the opening is not covered. */
export const TUTORIAL_START_TICK = 90;
const ABILITY_CAP = 900;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'move', keys: ['A', 'D'], text: 'RUN' },
  { id: 'jump', keys: ['SPACE'], text: 'JUMP' },
  { id: 'fire', keys: ['MOUSE', 'LMB'], text: 'AIM WITH THE MOUSE, FIRE WITH LMB' },
  { id: 'weapon', keys: ['1', 'Q'], text: 'SWITCH WEAPON' },
  { id: 'dash', keys: ['SHIFT'], text: 'DASH THROUGH DANGER' },
  { id: 'counter', keys: ['X'], text: 'COUNTER: press X when a foe flashes' },
  { id: 'scan', keys: ['Z'], text: 'SCAN PULSE: reveals breakables and secrets' },
  { id: 'boots', keys: ['SPACE', 'SPACE'], text: 'THRUSTER BOOTS: jump again in mid-air', needs: 'thrusterBoots', cap: ABILITY_CAP },
  { id: 'blast', keys: ['3', 'LMB'], text: 'BLAST CORE: Grenade or Rocket shatters blast plates', needs: 'blastCore', cap: ABILITY_CAP },
  { id: 'lens', keys: ['Z'], text: 'SCAN LENS: scan next to a sealed hatch to override it', needs: 'scanLens', cap: ABILITY_CAP },
  { id: 'thermal', keys: [], text: 'THERMAL PLATING: stand against a heat seal to melt it', needs: 'thermalPlating', cap: ABILITY_CAP },
];

export interface TutorialSaved {
  on: boolean;
  done: string[];
}

export type TutorialInput = Pick<InputState3D, 'moveX' | 'jump' | 'fire' | 'dash' | 'weaponSlot'> & { counter?: boolean; scan?: boolean };

export class Tutorial {
  on: boolean;
  readonly done: Set<string>;
  private readonly shown = new Map<string, number>();
  private wasAirborne = false;
  /** Set when the player pressed jump while off the ground (a double jump attempt). */
  private airJump = false;
  private prevJump = false;
  private seen = new Set<string>();

  constructor(saved?: Partial<TutorialSaved> | null) {
    this.on = saved?.on ?? true;
    this.done = new Set(saved?.done ?? []);
  }

  /** Read-only observation of the player's input for this frame. */
  observe(inp: TutorialInput, grounded = true, weapon = 1): void {
    if (!this.on) return;
    if (inp.moveX !== 0) this.seen.add('move');
    if (inp.jump) this.seen.add('jump');
    if (inp.fire) this.seen.add('fire');
    if (inp.weaponSlot) this.seen.add('weapon');
    if (inp.dash) this.seen.add('dash');
    if (inp.counter) this.seen.add('counter');
    if (inp.scan) {
      this.seen.add('scan');
      this.seen.add('lens');
    }
    if (inp.fire && (weapon === 3 || weapon === 6)) this.seen.add('blast');
    if (inp.jump && !this.prevJump && !grounded && this.wasAirborne) this.airJump = true;
    this.prevJump = inp.jump;
    this.wasAirborne = !grounded;
    if (this.airJump) this.seen.add('boots');
  }

  /** The single prompt to show now, or null. Marks steps done when the player has performed them. */
  update(w: WorldState3D): TutorialPrompt | null {
    if (!this.on || w.status !== 'playing') return null;
    const ab = w.player.abilities;
    for (const s of TUTORIAL_STEPS) {
      if (this.done.has(s.id)) continue;
      if (s.needs && !ab[s.needs]) continue;
      if (this.seen.has(s.id)) {
        this.done.add(s.id);
        continue;
      }
      if (s.cap !== undefined) {
        const n = (this.shown.get(s.id) ?? 0) + 1;
        this.shown.set(s.id, n);
        if (n > s.cap) {
          this.done.add(s.id);
          continue;
        }
      }
      if (!s.needs && w.tick < TUTORIAL_START_TICK) return null;
      // Counter and scan only matter once the player has the basics; wait for a calm moment for the situational ones.
      if ((s.id === 'counter' || s.id === 'scan') && w.tick < 1200) return null;
      return s;
    }
    return null;
  }

  skip(): void {
    this.on = false;
  }

  /** Replay: clears progress and turns the tutorial back on. */
  replay(): void {
    this.on = true;
    this.done.clear();
    this.seen.clear();
    this.shown.clear();
    this.airJump = false;
  }

  toJSON(): TutorialSaved {
    return { on: this.on, done: [...this.done] };
  }
}

export function parseTutorialSaved(raw: string | null): Partial<TutorialSaved> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TutorialSaved>;
    return { on: typeof v.on === 'boolean' ? v.on : true, done: Array.isArray(v.done) ? v.done.filter((x) => typeof x === 'string') : [] };
  } catch {
    return null;
  }
}

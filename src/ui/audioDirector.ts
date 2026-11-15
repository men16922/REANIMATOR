// Turns world snapshot differences into sounds. Read-only on the simulation: never mutates the world and never
// touches w.light for gameplay (R3.3). All decisions are pure functions from audioLogic.ts.
import { ABILITY_3D } from '../engine/motion3d.ts';
import type { EnemyAIState3D, WorldState3D } from '../game3d/world3d.ts';
import { ambient, bgm, play, playSoundEvent3D, sfx, type SoundId } from './audio.ts';
import { enemyCue, footstepPeriodTicks, heartbeatPeriodTicks, isHardLanding, selectTheme, spatialFor, surfaceFor, type ThemeId } from './audioLogic.ts';

export interface PreStep {
  hp: number;
  lightOn: boolean;
  meltdownTicks: number;
  grounded: boolean;
  vy: number;
}

export function snapshotPre(w: WorldState3D): PreStep {
  return { hp: w.player.hp, lightOn: w.light.on, meltdownTicks: w.meltdownTicks, grounded: w.player.body.grounded, vy: w.player.body.vy };
}

export function currentTheme(w: WorldState3D): ThemeId {
  const fighting = w.enemies.some((e) => e.kind === 'warden' && e.alive && e.state !== 'dormant');
  return selectTheme(w.currentRoom, w.meltdownTicks >= 0, fighting);
}

export class AudioDirector {
  private enemies = new Map<string, { state: EnemyAIState3D; alive: boolean; hp: number }>();
  private stepTicks = 0;
  private heartTicks = 0;
  private theme: ThemeId | null = null;
  private ambKey = '';

  /** Forget tracked state (new run, respawn, world replaced). */
  reset(): void {
    this.enemies.clear();
    this.stepTicks = 0;
    this.heartTicks = 0;
    this.theme = null;
    this.ambKey = '';
  }

  /** Starts or retunes music and ambient for the current world. Cheap; call after each step and on mode changes. */
  syncBeds(w: WorldState3D, playing: boolean): void {
    if (!playing) {
      bgm(false);
      ambient(false);
      this.theme = null;
      this.ambKey = '';
      return;
    }
    const theme = currentTheme(w);
    if (theme !== this.theme) {
      this.theme = theme;
      bgm(true, theme);
    }
    const key = `${w.currentRoom}|${w.meltdownTicks >= 0}`;
    if (key !== this.ambKey) {
      this.ambKey = key;
      ambient(true, w.currentRoom, w.meltdownTicks >= 0);
    }
  }

  afterStep(w: WorldState3D, pre: PreStep): void {
    const p = w.player;
    const lx = p.body.x;
    const ly = p.body.y;

    if (w.light.on !== pre.lightOn) (w.light.on ? sfx.lightOn : sfx.lightOff)();
    if (w.meltdownTicks > 0 && w.tick % 45 === 0) sfx.alarm();
    for (const ev of w.events) playSoundEvent3D(ev);

    // Footsteps (surface follows the sector) and landings
    const surface = surfaceFor(w.currentRoom);
    if (isHardLanding(pre.grounded, p.body.grounded, pre.vy)) {
      play(`land.${surface}` as SoundId);
      this.stepTicks = 0;
    } else if (p.body.grounded && p.body.state !== 5) {
      const period = footstepPeriodTicks(p.body.vx, ABILITY_3D.runTopSpeed);
      if (period === 0) this.stepTicks = 0;
      else if (++this.stepTicks >= period) {
        this.stepTicks = 0;
        play(`step.${surface}` as SoundId, { gain: 0.8 });
      }
    } else {
      this.stepTicks = 0;
    }

    // Low-health heartbeat
    const hb = heartbeatPeriodTicks(p.hp, p.maxHp);
    if (hb === 0) this.heartTicks = 0;
    else if (++this.heartTicks >= hb) {
      this.heartTicks = 0;
      play('player.heartbeat');
    }

    // Enemy state transitions, panned and attenuated by distance to the player
    for (const e of w.enemies) {
      const prev = this.enemies.get(e.id);
      const cue = enemyCue(e.kind, prev?.state, e.state, prev?.alive ?? e.alive, e.alive);
      const sp = spatialFor(e.x, e.y, lx, ly);
      if (cue) play(cue as SoundId, sp);
      else if (prev && e.alive && e.hp < prev.hp) play('weapon.hit', sp);
      this.enemies.set(e.id, { state: e.state, alive: e.alive, hp: e.hp });
    }

    this.syncBeds(w, true);
  }
}

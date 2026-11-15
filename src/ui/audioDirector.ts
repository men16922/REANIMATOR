// Turns world snapshot differences into sounds. Read-only on the simulation: never mutates the world and never
// touches w.light for gameplay (R3.3). All decisions are pure functions from audioLogic.ts.
import { ABILITY_3D } from '../engine/motion3d.ts';
import type { EnemyAIState3D, WorldState3D } from '../game3d/world3d.ts';
import { RAIL_CHARGE_TICKS } from '../game3d/world3d.ts';
import { ambient, bgm, musicIntensity, play, playCue, railCharge, setPaused, sfx, type SoundId } from './audio.ts';
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
  private mode = '';

  /** Forget tracked state (new run, respawn, world replaced). */
  reset(): void {
    this.enemies.clear();
    this.stepTicks = 0;
    this.heartTicks = 0;
    this.theme = null;
    this.ambKey = '';
    this.mode = '';
    railCharge(0);
  }

  /** Starts or retunes music and ambient for the current world. Cheap; call after each step and on mode changes. */
  syncBeds(w: WorldState3D, playing: boolean, mode: 'title' | 'playing' | 'paused' | 'result' = 'playing'): void {
    if (this.mode !== mode) {
      if (mode === 'paused') play('ui.pause');
      else if (this.mode === 'paused' && mode === 'playing') play('ui.resume');
      this.mode = mode;
      setPaused(mode === 'paused');
    }
    if (!playing) railCharge(0);
    if (mode === 'paused') return; // music keeps running behind the pause lowpass
    if (!playing) {
      // Title screen and winning result have their own themes; losing is silent apart from the stinger
      const idle: ThemeId | null = mode === 'title' ? 'title' : mode === 'result' && w.status === 'won' ? 'victory' : null;
      ambient(false);
      this.ambKey = '';
      if (idle) {
        if (idle !== this.theme) { this.theme = idle; bgm(true, idle); }
      } else {
        bgm(false);
        this.theme = null;
      }
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
    const warden = w.enemies.find((e) => e.kind === 'warden' && e.alive);
    for (const ev of w.events) playCue(ev, {}, warden ? warden.bossPattern : 'none');
    if (warden && this.theme === 'boss') musicIntensity(warden.phase);
    railCharge(p.weapon === 4 ? p.railCharge / RAIL_CHARGE_TICKS : 0);

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
      if (cue === 'enemy.warden.windup') { /* replaced by the per-pattern boss telegraph */ }
      else if (cue) play(cue as SoundId, sp);
      else if (prev && e.alive && e.hp < prev.hp) play('weapon.hit', sp);
      this.enemies.set(e.id, { state: e.state, alive: e.alive, hp: e.hp });
    }

    this.syncBeds(w, true);
  }
}

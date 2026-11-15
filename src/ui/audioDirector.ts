// Turns world snapshot differences into sounds. Read-only on the simulation: never mutates the world and never
// touches w.light for gameplay (R3.3). All decisions are pure functions from audioLogic.ts.
import { ABILITY_3D } from '../engine/motion3d.ts';
import type { EnemyAIState3D, WorldState3D } from '../game3d/world3d.ts';
import { hazardNowTick3D, RAIL_CHARGE_TICKS } from '../game3d/world3d.ts';
import { hazardPhase } from '../game3d/hazards.ts';
import { ambient, bgm, escapeMusic, musicIntensity, play, playCue, railCharge, setLoops, setPaused, sfx, type SoundId } from './audio.ts';
import {
  alarmPeriodTicks, alarmPitch, elevatorLoop, enemyCue, extraCueForEvent, footstepPeriodTicks, hazardLoopLevel, heartbeatPeriodTicks, isCountdownTick, isHardLanding,
  planLoops, selectTheme, spatialFor, surfaceFor, type LoopSource, type ThemeId,
} from './audioLogic.ts';

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

/** Hum sources near the player's sector: steam vents, laser grids and moving cargo lifts. Read-only on the world. */
export function loopSources(w: WorldState3D): LoopSource[] {
  const out: LoopSource[] = [];
  for (const h of w.level.hazards) {
    if (h.sector !== w.currentRoom || (h.kind !== 'vent' && h.kind !== 'laser')) continue;
    const t = hazardNowTick3D(w, h);
    if (t < 0) continue;
    const level = hazardLoopLevel(h.kind, hazardPhase(h, t));
    if (level > 0) out.push({ key: h.id, kind: h.kind === 'vent' ? 'vent' : 'laser', x: h.x, y: h.y + h.height * 0.5, level });
  }
  for (const sp of w.level.elevators) {
    if (sp.sector !== w.currentRoom) continue;
    const st = w.elevators.find((e) => e.id === sp.id);
    const car = w.level.solids.find((s) => s.id === sp.carId);
    if (!st || !car) continue;
    const { level, rate } = elevatorLoop(st.phase);
    if (level > 0) out.push({ key: sp.id, kind: 'motor', x: (car.minX + car.maxX) / 2, y: st.y, level, rate });
  }
  return out;
}

export class AudioDirector {
  private enemies = new Map<string, { state: EnemyAIState3D; alive: boolean; hp: number }>();
  private stepTicks = 0;
  private prevRailF = 0;
  private heartTicks = 0;
  private theme: ThemeId | null = null;
  private ambKey = '';
  private mode = '';
  private alarmTicks = 0;

  /** Forget tracked state (new run, respawn, world replaced). */
  reset(): void {
    this.enemies.clear();
    this.stepTicks = 0;
    this.heartTicks = 0;
    this.theme = null;
    this.ambKey = '';
    this.mode = '';
    this.alarmTicks = 0;
    railCharge(0);
    setLoops([]);
    escapeMusic(-1);
  }

  /** Starts or retunes music and ambient for the current world. Cheap; call after each step and on mode changes. */
  syncBeds(w: WorldState3D, playing: boolean, mode: 'title' | 'playing' | 'paused' | 'result' = 'playing'): void {
    if (this.mode !== mode) {
      if (mode === 'paused') play('ui.pause');
      else if (this.mode === 'paused' && mode === 'playing') play('ui.resume');
      this.mode = mode;
      setPaused(mode === 'paused');
    }
    if (!playing) {
      railCharge(0);
      setLoops([]);
    }
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
    // Escape alarm: pulses speed up and climb in pitch through the final 10 s, which also get a countdown beep each second
    const alarmEvery = alarmPeriodTicks(w.meltdownTicks);
    if (alarmEvery === 0) this.alarmTicks = 0;
    else if (++this.alarmTicks >= alarmEvery) {
      this.alarmTicks = 0;
      play('world.alarm', { pitch: alarmPitch(w.meltdownTicks) });
    }
    if (isCountdownTick(w.meltdownTicks)) play('world.countdown', { pitch: 1 + (600 - w.meltdownTicks) / 600 });
    escapeMusic(w.meltdownTicks);
    setLoops(planLoops(loopSources(w), lx, ly));
    const warden = w.enemies.find((e) => e.kind === 'warden' && e.alive);
    for (const ev of w.events) {
      playCue(ev, {}, warden ? warden.bossPattern : 'none');
      const extra = extraCueForEvent(ev);
      if (extra) play(extra as SoundId);
    }
    if (warden && this.theme === 'boss') musicIntensity(warden.phase);
    const railF = p.weapon === 4 ? p.railCharge / RAIL_CHARGE_TICKS : 0;
    // One-shot "charge complete" tick matches the muzzle warning ring (fx3d) at 92 %.
    if (railF >= 0.92 && this.prevRailF < 0.92) play('ui.select');
    this.prevRailF = railF;
    railCharge(railF);

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

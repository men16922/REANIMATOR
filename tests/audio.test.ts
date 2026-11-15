// Pure audio logic: event -> sound id mapping, enemy cues, attenuation/pan, footsteps, heartbeat, themes, voice stealing.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SectorId3D, SoundEventType3D } from '../src/game3d/types3d.ts';
import {
  EVENT_SOUND,
  HEAR_FAR,
  HEAR_NEAR,
  attenuation,
  enemyCue,
  footstepPeriodTicks,
  heartbeatPeriodTicks,
  isHardLanding,
  isThrottled,
  panFor,
  selectTheme,
  soundIdForEvent,
  spatialFor,
  surfaceFor,
  voiceToSteal,
  type EnemyKindA,
  type ThemeId,
  type VoiceInfo,
} from '../src/ui/audioLogic.ts';
import { SOUND_BANK, SOUND_IDS } from '../src/ui/soundBank.ts';
import { THEMES, stepSeconds } from '../src/ui/themes.ts';

const SECTORS: SectorId3D[] = ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'];
const KINDS: EnemyKindA[] = ['crawler', 'stalker', 'spitter', 'warden'];

test('every simulation event maps to a recipe in the sound bank', () => {
  const types = Object.keys(EVENT_SOUND) as SoundEventType3D[];
  assert.equal(types.length, 18);
  for (const t of types) assert.ok(SOUND_IDS.includes(soundIdForEvent(t) as never), `missing recipe for ${t}`);
});

test('weapons have distinct sounds', () => {
  const ids = (['pulse', 'scatter', 'grenade', 'rail'] as const).map(soundIdForEvent);
  assert.equal(new Set(ids).size, 4);
});

test('all recipes are well-formed', () => {
  for (const id of SOUND_IDS) {
    const r = SOUND_BANK[id];
    assert.ok(r.layers.length > 0, id);
    assert.ok(r.gap >= 0 && r.prio >= 0, id);
    for (const l of r.layers) assert.ok(l.d > 0 && l.g > 0 && (l.at ?? 0) >= 0, id);
  }
});

test('attenuation is 1 near, 0 far, monotone', () => {
  assert.equal(attenuation(0), 1);
  assert.equal(attenuation(HEAR_NEAR), 1);
  assert.equal(attenuation(HEAR_FAR), 0);
  assert.equal(attenuation(HEAR_FAR + 50), 0);
  let prev = 1;
  for (let d = HEAR_NEAR; d <= HEAR_FAR; d += 1) {
    const a = attenuation(d);
    assert.ok(a <= prev + 1e-12);
    prev = a;
  }
});

test('pan follows horizontal offset and is clamped', () => {
  assert.equal(panFor(0), 0);
  assert.ok(panFor(5) > 0 && panFor(-5) < 0);
  assert.equal(panFor(5), -panFor(-5));
  assert.equal(panFor(1000), 0.85);
  assert.equal(panFor(-1000), -0.85);
  const s = spatialFor(10, 0, 0, 0);
  assert.ok(s.pan > 0 && s.gain > 0 && s.gain < 1);
  assert.equal(spatialFor(100, 0, 0, 0).gain, 0);
});

test('enemy state transitions map to per-kind cues that exist in the bank', () => {
  for (const k of KINDS) {
    for (const [next, suffix] of [['alert', 'alert'], ['windup', 'windup'], ['attack', 'attack']] as const) {
      const cue = enemyCue(k, 'chase', next, true, true);
      assert.equal(cue, `enemy.${k}.${suffix}`);
      assert.ok(SOUND_IDS.includes(cue as never), String(cue));
    }
    const death = enemyCue(k, 'chase', 'dead', true, false);
    assert.equal(death, `enemy.${k}.death`);
    assert.ok(SOUND_IDS.includes(death as never));
  }
  assert.equal(enemyCue('crawler', 'attack', 'recover', true, true), 'enemy.crawler.land');
  assert.ok(SOUND_IDS.includes('enemy.stalker.land'));
  assert.equal(enemyCue('spitter', 'attack', 'recover', true, true), null);
  assert.equal(enemyCue('stalker', 'chase', 'chase', true, true), null);
  assert.equal(enemyCue('stalker', undefined, 'alert', true, true), null, 'first sighting of an id is not a transition');
  assert.equal(enemyCue('stalker', 'dead', 'dead', false, false), null);
  assert.equal(new Set(KINDS.map((k) => enemyCue(k, 'patrol', 'alert', true, true))).size, 4, 'timbres differ per kind');
});

test('footsteps: silent at rest, faster when running, surface per sector exists in bank', () => {
  assert.equal(footstepPeriodTicks(0, 7), 0);
  assert.equal(footstepPeriodTicks(0.3, 7), 0);
  assert.ok(footstepPeriodTicks(7, 7) < footstepPeriodTicks(2, 7));
  assert.equal(footstepPeriodTicks(-7, 7), footstepPeriodTicks(7, 7));
  const surfaces = new Set(SECTORS.map(surfaceFor));
  assert.ok(surfaces.size >= 4);
  for (const s of surfaces) {
    assert.ok(SOUND_IDS.includes(`step.${s}` as never), s);
    assert.ok(SOUND_IDS.includes(`land.${s}` as never), s);
  }
});

test('landing needs a real fall', () => {
  assert.equal(isHardLanding(false, true, -8), true);
  assert.equal(isHardLanding(false, true, -1), false);
  assert.equal(isHardLanding(true, true, -8), false);
  assert.equal(isHardLanding(false, false, -8), false);
});

test('heartbeat only below the low-hp threshold and speeds up', () => {
  assert.equal(heartbeatPeriodTicks(100, 100), 0);
  assert.equal(heartbeatPeriodTicks(30, 100), 0);
  assert.equal(heartbeatPeriodTicks(0, 100), 0);
  const slow = heartbeatPeriodTicks(29, 100);
  const fast = heartbeatPeriodTicks(5, 100);
  assert.ok(slow > 0 && fast > 0 && fast < slow);
});

test('theme selection: meltdown beats boss beats sector', () => {
  assert.equal(selectTheme('mines', false, false), 'mines');
  assert.equal(selectTheme('core', false, false), 'core');
  assert.equal(selectTheme('core', false, true), 'boss');
  assert.equal(selectTheme('mines', false, true), 'mines', 'boss theme only in the Core Vault');
  assert.equal(selectTheme('core', true, true), 'meltdown');
  const ids: ThemeId[] = [...SECTORS, 'boss', 'meltdown'];
  for (const id of ids) assert.ok(THEMES[id], id);
});

test('themes differ in tempo/key and are well-formed', () => {
  const bpms = new Set(Object.values(THEMES).map((t) => t.bpm));
  const roots = new Set(Object.values(THEMES).map((t) => t.root));
  assert.ok(bpms.size >= 7 && roots.size >= 6);
  for (const t of Object.values(THEMES)) {
    assert.equal(t.arp.length, 8);
    assert.equal(t.kick.length, 8);
    assert.equal(t.hat.length, 8);
    assert.ok(t.bars.length > 0 && stepSeconds(t) > 0.1 && stepSeconds(t) <= 0.6);
  }
  assert.ok(THEMES.meltdown.bpm > THEMES.boss.bpm && THEMES.boss.bpm > THEMES.core.bpm);
});

test('voice stealing: free slot, steal lowest-priority oldest, drop when outranked', () => {
  const v = (priority: number, startedAt: number, endsAt = 10): VoiceInfo => ({ priority, startedAt, endsAt });
  assert.equal(voiceToSteal([], 0, 2, 1), -1);
  assert.equal(voiceToSteal([v(1, 0)], 0, 2, 1), -1);
  const full = [v(5, 0), v(1, 1), v(1, 0.5)];
  assert.equal(voiceToSteal(full, 0, 3, 3), 2, 'oldest of the lowest priority');
  assert.equal(voiceToSteal([v(5, 0), v(6, 1)], 0, 2, 3), -2, 'newcomer outranked by every live voice');
  assert.equal(voiceToSteal([v(5, 0, 1), v(6, 1, 1)], 2, 2, 3), -1, 'expired voices free their slots');
});

test('throttle by minimum gap', () => {
  assert.equal(isThrottled(undefined, 1, 0.1), false);
  assert.equal(isThrottled(1, 1.05, 0.1), true);
  assert.equal(isThrottled(1, 1.2, 0.1), false);
});

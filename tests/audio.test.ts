// Pure audio logic: event -> sound id mapping, enemy cues, attenuation/pan, footsteps, heartbeat, themes, voice stealing.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SectorId3D, SoundEventType3D } from '../src/game3d/types3d.ts';
import {
  EVENT_SOUND,
  chargePitch,
  comboPitch,
  crowdGain,
  cueForEvent,
  distanceCutoff,
  impulseResponse,
  musicDuckFor,
  rankPitch,
  roomFor,
  roomMix,
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
import {
  FORM_LOOP, FORM_SONG, STEPS_PER_BAR, THEMES, bpmFor, chordAt, delaySeconds, duckGainAt, fillHit, formAt, formOf, layersAt, stepSeconds,
} from '../src/ui/themes.ts';

const SECTORS: SectorId3D[] = ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'];
const KINDS: EnemyKindA[] = ['crawler', 'stalker', 'spitter', 'warden'];

test('every simulation event maps to a recipe in the sound bank', () => {
  const types = Object.keys(EVENT_SOUND) as SoundEventType3D[];
  assert.equal(types.length, 29);
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

test('themes differ in tempo/key and are well-formed 16-step patterns', () => {
  const bpms = new Set(Object.values(THEMES).map((t) => t.bpm));
  const roots = new Set(Object.values(THEMES).map((t) => t.root));
  assert.ok(bpms.size >= 9 && roots.size >= 8);
  for (const t of Object.values(THEMES)) {
    for (const pat of [t.arp, t.bassLine, t.lead]) assert.equal(pat.length, STEPS_PER_BAR);
    for (const pat of [t.kick, t.snare, t.hat, t.perc]) assert.equal(pat.length, STEPS_PER_BAR);
    assert.ok(t.prog.length >= 4 && stepSeconds(t) > 0.05 && stepSeconds(t) <= 0.4);
    assert.ok(t.wet >= 0 && t.wet <= 1 && t.duck >= 0 && t.duck <= 0.6 && t.delayFb < 0.7);
    assert.ok(delaySeconds(t) > 0 && delaySeconds(t) < 1.9, 'delay fits the 2 s delay line');
  }
  assert.ok(THEMES.meltdown.bpm > THEMES.boss.bpm && THEMES.boss.bpm > THEMES.core.bpm);
});

test('all ten themes exist, including title and victory', () => {
  const ids: ThemeId[] = [...SECTORS, 'boss', 'meltdown', 'title', 'victory'];
  for (const id of ids) assert.ok(THEMES[id], id);
  assert.equal(Object.keys(THEMES).length, ids.length);
});

test('sector themes keep a distinct identity (percussion, wave, tempo)', () => {
  assert.ok(THEMES.airlock.kick.indexOf('x') < 0, 'airlock is drumless ambient');
  assert.ok(THEMES.mines.perc.includes('c'), 'mines uses metal clangs');
  assert.ok(THEMES.biolabs.arp.filter((x) => x !== null).length >= 14, 'biolabs is a busy dreamy arpeggio');
  assert.ok(THEMES.security.hat.split('x').length > 8, 'security is a tight pulse');
  assert.equal(THEMES.core.padWave, 'sawtooth');
  assert.ok(THEMES.meltdown.lead.every((x) => x !== null), 'meltdown alarm lead sounds on every step');
});

test('form: intro once, then A/B/A/B/break loops; fills and risers land on section ends', () => {
  const f = formOf(THEMES.shaft);
  assert.equal(formAt(f, 0).section, 'intro');
  assert.equal(formAt(f, 2).section, 'a');
  assert.equal(formAt(f, 6).section, 'b');
  assert.equal(formAt(f, 5).fill, true);
  assert.equal(formAt(f, 4).fill, false);
  const total = f.reduce((s, e) => s + e.bars, 0);
  assert.equal(formAt(f, total - 1).riser, true);
  assert.equal(formAt(f, total - 1).section, 'break');
  assert.equal(formAt(f, total).section, 'a', 'after the break the song loops past the intro');
  assert.equal(formAt(f, total + 100).sectionBars > 0, true);
  assert.equal(formAt(formOf(THEMES.boss), 0).section, 'a');
  assert.ok(f.length >= 4 && new Set(f.map((e) => e.section)).size === 4);
});

test('section layers: intro is gentle, B is full, break strips the drums', () => {
  const on = (m: Record<string, boolean>) => Object.values(m).filter(Boolean).length;
  const intro = layersAt(formAt(FORM_SONG, 0));
  const a = layersAt(formAt(FORM_SONG, 2));
  const b = layersAt(formAt(FORM_SONG, 6));
  const brk = layersAt(formAt(FORM_SONG, 19));
  assert.ok(on(intro) < on(a) && on(a) < on(b));
  assert.equal(brk.kick, false);
  assert.equal(brk.pad, true);
  assert.equal(b.lead && b.snare, true);
});

test('boss phases add layers and tempo (I -> II -> III)', () => {
  const pos = formAt(FORM_LOOP, 4); // section B: everything the section allows
  const l1 = layersAt(pos, 1, true);
  const l2 = layersAt(pos, 2, true);
  const l3 = layersAt(pos, 3, true);
  const n = (m: Record<string, boolean>) => Object.values(m).filter(Boolean).length;
  assert.ok(n(l1) < n(l2) && n(l2) < n(l3));
  assert.equal(l1.lead, false);
  assert.equal(l3.lead, true);
  assert.equal(l1.kick && l1.bass, true);
  assert.ok(bpmFor(THEMES.boss, 3) > bpmFor(THEMES.boss, 2) && bpmFor(THEMES.boss, 2) > bpmFor(THEMES.boss, 1));
  assert.ok(stepSeconds(THEMES.boss, 3) < stepSeconds(THEMES.boss, 1));
});

test('chords follow the progression and roots transpose in semitones', () => {
  const t = THEMES.airlock;
  assert.equal(chordAt(t, 0).rootHz, t.root);
  assert.ok(Math.abs(chordAt(t, 2).rootHz - t.root * Math.pow(2, -2 / 12)) < 1e-9);
  assert.deepEqual(chordAt(t, 4), chordAt(t, 0), 'progression loops');
});

test('sidechain duck: drops at the kick, recovers monotonically, never exceeds 1', () => {
  assert.equal(duckGainAt(-1, 0.4), 1);
  assert.ok(Math.abs(duckGainAt(0, 0.4) - 0.6) < 1e-12);
  let prev = 0;
  for (let dt = 0; dt <= 0.22; dt += 0.01) {
    const g = duckGainAt(dt, 0.4);
    assert.ok(g >= prev - 1e-12 && g <= 1);
    prev = g;
  }
  assert.equal(duckGainAt(0.5, 0.4), 1);
});

test('drum fill ramps up on the last beat only', () => {
  assert.equal(fillHit(11), 0);
  assert.ok(fillHit(12) > 0 && fillHit(15) > fillHit(12));
});

test('every new gameplay event has a dedicated recipe (no borrowed sounds)', () => {
  const fresh: SoundEventType3D[] = ['wall_jump', 'dash_cancel', 'stomp', 'combo', 'boss_telegraph', 'boss_charge', 'boss_summon', 'boss_phase', 'boss_exposed', 'collect', 'secret'];
  const ids = fresh.map(soundIdForEvent);
  assert.equal(new Set(ids).size, fresh.length, 'one distinct recipe each');
  const old = new Set(['world.pickup', 'world.unlock', 'world.upgrade', 'world.explosion', 'enemy.warden.slam', 'stinger.meltdown', 'player.double_jump', 'player.dash']);
  for (const id of ids) assert.ok(!old.has(id), id);
});

test('boss telegraph sound depends on the pattern', () => {
  const ids = ['slam', 'charge', 'volley', 'summon'].map((p) => cueForEvent({ type: 'boss_telegraph' }, p).id);
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) assert.ok(SOUND_IDS.includes(id as never), id);
  assert.equal(cueForEvent({ type: 'boss_telegraph' }, 'barrage').id, cueForEvent({ type: 'boss_telegraph' }, 'volley').id);
  assert.equal(cueForEvent({ type: 'boss_telegraph' }, 'none').id, EVENT_SOUND.boss_telegraph);
});

test('combo chime climbs with the chain and is capped', () => {
  let prev = 0;
  for (let n = 2; n <= 11; n++) {
    const p = comboPitch(n);
    assert.ok(p > prev, `chain ${n}`);
    prev = p;
  }
  assert.equal(comboPitch(2), 1);
  assert.equal(comboPitch(50), comboPitch(11));
  assert.ok(comboPitch(11) < 4);
  assert.equal(cueForEvent({ type: 'combo', value: 5 }).pitch, comboPitch(5));
});

test('rail charge pitch rises monotonically over three octaves', () => {
  assert.equal(chargePitch(0), 110);
  assert.ok(Math.abs(chargePitch(1) - 880) < 1e-9);
  let prev = 0;
  for (let i = 0; i <= 48; i++) {
    const f = chargePitch(i / 48);
    assert.ok(f > prev);
    prev = f;
  }
  assert.equal(chargePitch(-3), 110);
  assert.equal(chargePitch(9), chargePitch(1));
});

test('rank reveal pitch: better ranks ring higher', () => {
  assert.ok(rankPitch('S') > rankPitch('A') && rankPitch('A') > rankPitch('B') && rankPitch('B') > rankPitch('C'));
  assert.equal(rankPitch('?'), 1);
});

test('UI sounds exist and outrank everything so menus are never dropped', () => {
  const ui = SOUND_IDS.filter((id) => id.startsWith('ui.'));
  for (const id of ['ui.move', 'ui.select', 'ui.back', 'ui.banner', 'ui.sector', 'ui.rank', 'ui.pause', 'ui.resume', 'ui.combo']) assert.ok(ui.includes(id as never), id);
  for (const id of ui.filter((i) => i !== 'ui.combo' && i !== 'ui.banner' && i !== 'ui.sector')) assert.ok(SOUND_BANK[id as keyof typeof SOUND_BANK].prio >= 9, id);
});

test('rooms: mines is larger and wetter than security; mix splits between small and large IR', () => {
  assert.ok(roomFor('mines').wet > roomFor('security').wet);
  assert.ok(roomFor('mines').size > roomFor('security').size);
  const m = roomMix(roomFor('security'));
  assert.ok(m.small > m.large);
  const big = roomMix(roomFor('mines'));
  assert.ok(big.large > big.small);
  for (const id of Object.keys(THEMES) as ThemeId[]) {
    const mix = roomMix(roomFor(id));
    assert.ok(mix.small + mix.large <= 0.4, id);
  }
});

test('impulse response is deterministic, stereo-decorrelated, bounded and decays', () => {
  const [l, r] = impulseResponse(8000, 1, 3, 5);
  const [l2] = impulseResponse(8000, 1, 3, 5);
  assert.equal(l.length, 8000);
  assert.deepEqual(Array.from(l.slice(0, 50)), Array.from(l2.slice(0, 50)));
  assert.notDeepEqual(Array.from(l.slice(100, 150)), Array.from(r.slice(100, 150)));
  const energy = (a: Float32Array, from: number, to: number) => { let e = 0; for (let i = from; i < to; i++) e += a[i] * a[i]; return e; };
  assert.ok(energy(l, 0, 2000) > energy(l, 6000, 8000) * 10, 'tail is quieter than the head');
  assert.ok(l.every((v) => Math.abs(v) <= 1));
  assert.equal(l[0], 0, 'pre-delay is silent');
  assert.ok(impulseResponse(8000, 2, 2, 5)[0].length > l.length);
});

test('distance lowpass: open up close, darker with distance, monotone', () => {
  assert.equal(distanceCutoff(0), 20000);
  assert.equal(distanceCutoff(HEAR_NEAR), 20000);
  assert.ok(Math.abs(distanceCutoff(HEAR_FAR) - 700) < 1e-9);
  let prev = 20001;
  for (let d = HEAR_NEAR; d <= HEAR_FAR; d += 2) {
    const c = distanceCutoff(d);
    assert.ok(c <= prev);
    prev = c;
  }
  assert.equal(spatialFor(20, 0, 0, 0).lp, distanceCutoff(20));
  assert.ok(spatialFor(1, 0, 0, 0).lp > spatialFor(25, 0, 0, 0).lp);
});

test('mixing: crowd gain trims only when the voice pool fills; loud sounds duck the music', () => {
  assert.equal(crowdGain(0), 1);
  assert.equal(crowdGain(6), 1);
  assert.ok(Math.abs(crowdGain(24) - 0.55) < 1e-12);
  assert.ok(crowdGain(15) < crowdGain(10));
  assert.equal(musicDuckFor(3), 1);
  assert.ok(musicDuckFor(7) < 1 && musicDuckFor(10) < musicDuckFor(7));
});

test('pure loudness budget: recipe peak sums stay bounded per priority class', () => {
  // The brickwall limiter is the last line of defence; recipes should still leave headroom.
  for (const id of SOUND_IDS) {
    const ls = SOUND_BANK[id].layers;
    // worst case: sum of gains of layers sounding together at any layer start
    const peak = Math.max(...ls.map((a) => ls.filter((b) => (b.at ?? 0) <= (a.at ?? 0) && (b.at ?? 0) + b.d > (a.at ?? 0)).reduce((s, b) => s + b.g, 0)));
    assert.ok(peak < (id.startsWith('stinger.') ? 1 : 0.75), `${id} layer gain sum ${peak}`);
  }
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

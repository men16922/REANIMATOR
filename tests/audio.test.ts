// Pure audio logic: event -> sound id mapping, enemy cues, attenuation/pan, footsteps, heartbeat, themes, voice stealing.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { SectorId3D, SoundEventType3D } from '../src/game3d/types3d.ts';
import { ESCAPE_BEATS_3D, MELTDOWN_TICKS } from '../src/game3d/world3d.ts';
import {
  EVENT_SOUND,
  FANFARE_IDS,
  ITEM_FREEZE_SECONDS,
  LOOP_BASE,
  MAX_LOOPS,
  PANIC_TICKS,
  alarmPeriodTicks,
  alarmPitch,
  elevatorLoop,
  extraCueForEvent,
  fanfareFor,
  hazardLoopLevel,
  isCountdownTick,
  mixLevel,
  panicLevel,
  planLoops,
  toDb,
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
import { SOUND_BANK, SOUND_IDS, recipeDuration, recipeEnergy, recipePeak } from '../src/ui/soundBank.ts';
import {
  ESCAPE_LAYERS, ESCAPE_STAGE_TICKS, FORM_LOOP, FORM_SONG, STEPS_PER_BAR, THEMES, escapeKeyLift, escapeStageFor, escapeTempoScale, bpmFor, chordAt, delaySeconds, duckGainAt, fillHit, formAt, formOf, layersAt, stepSeconds,
} from '../src/ui/themes.ts';

const SECTORS: SectorId3D[] = ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'];
const KINDS: EnemyKindA[] = ['crawler', 'stalker', 'spitter', 'warden'];

test('every simulation event maps to a recipe in the sound bank', () => {
  const types = Object.keys(EVENT_SOUND) as SoundEventType3D[];
  assert.equal(types.length, 59);
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
    assert.ok(peak < (id.startsWith('stinger.') || id.startsWith('fanfare.') ? 1 : 0.75), `${id} layer gain sum ${peak}`);
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

// ---- Round 6 ----
const BORROWED_BEFORE_R6 = new Set([
  'enemy.crawler.land', 'enemy.crawler.alert', 'enemy.warden.death', 'enemy.warden.slam', 'world.light_on', 'world.light_off', 'world.explosion',
  'world.unlock', 'world.door_blast', 'world.pickup', 'player.stomp', 'player.dash', 'stinger.meltdown',
]);
const R6_EVENTS: SoundEventType3D[] = [
  'enemy_drop', 'hive_spawn', 'hive_destroyed', 'hazard_vent', 'hazard_crush', 'laser_on', 'laser_off', 'barrel_explode', 'switch_on',
  'elevator_start', 'elevator_stop', 'collapse', 'slide', 'block_break', 'map_reveal', 'seal_warn', 'seal_close',
];

test('round 3-5 events have dedicated recipes, none borrowed, all distinct', () => {
  const ids = R6_EVENTS.map(soundIdForEvent);
  assert.equal(new Set(ids).size, R6_EVENTS.length);
  for (const id of ids) {
    assert.ok(!BORROWED_BEFORE_R6.has(id), `${id} is still a borrowed recipe`);
    assert.ok(SOUND_IDS.includes(id as never), id);
  }
});

test('phase variants: warning and fire phases, final hatch and bulkhead sirens use different recipes', () => {
  const id = (type: SoundEventType3D, value?: number) => cueForEvent({ type, value }).id;
  assert.notEqual(id('hazard_vent', 0), id('hazard_vent', 1));
  assert.notEqual(id('hazard_crush', 0), id('hazard_crush', 1));
  assert.notEqual(id('collapse', 0), id('collapse', 2));
  assert.equal(id('collapse', 1), id('collapse', 2));
  assert.equal(extraCueForEvent({ type: 'seal_warn', value: 4 }), 'escape.seal_final');
  for (const v of [0, 1, 2, 3]) assert.equal(extraCueForEvent({ type: 'seal_warn', value: v }), null);
  assert.equal(extraCueForEvent({ type: 'seal_close' }), null);
  assert.ok(SOUND_IDS.includes('escape.seal_final'));
  for (const v of [0, 1, 2, 3, 4]) assert.ok(SOUND_IDS.includes(id('seal_warn', v) as never));
  for (const t of ['hazard_vent', 'hazard_crush', 'collapse'] as const) for (const v of [0, 1, 2]) assert.ok(SOUND_IDS.includes(id(t, v) as never), `${t} ${v}`);
  // bulkhead sirens climb in pitch; rail plates ring higher than stomp floors
  assert.ok(cueForEvent({ type: 'seal_warn', value: 3 }).pitch > cueForEvent({ type: 'seal_warn', value: 0 }).pitch);
  assert.ok(cueForEvent({ type: 'block_break', value: 1 }).pitch > cueForEvent({ type: 'block_break', value: 0 }).pitch);
});

test('weapon track events use their dedicated recipes', () => {
  const id = (type: SoundEventType3D, value?: number) => cueForEvent({ type, value }).id;
  assert.equal(id('flamer', 1), 'weapon.flamer_loop');
  assert.equal(id('rocket'), 'weapon.rocket');
  assert.equal(id('burn'), 'enemy.burn');
  assert.equal(id('rocket_jump'), 'player.rocket_jump');
  assert.equal(id('explosion', 1), 'weapon.rocket_explode');
  assert.equal(id('explosion'), 'world.explosion');
  assert.ok(cueForEvent({ type: 'flamer', value: 1 }).gain > cueForEvent({ type: 'flamer', value: 0 }).gain);
});

test('recipe peak estimate: single layer is its gain, overlapping layers add, decayed layers do not', () => {
  const one = { prio: 1, gap: 0, layers: [{ t: 'o' as const, f: 440, d: 1, w: 'sine' as const, g: 0.2 }] };
  assert.ok(Math.abs(recipePeak(one) - 0.2) < 1e-12);
  const two = { prio: 1, gap: 0, layers: [...one.layers, { t: 'o' as const, f: 220, d: 1, w: 'sine' as const, g: 0.1 }] };
  assert.ok(Math.abs(recipePeak(two) - 0.3) < 1e-12);
  const seq = { prio: 1, gap: 0, layers: [...one.layers, { t: 'o' as const, f: 220, d: 1, w: 'sine' as const, g: 0.1, at: 0.99 }] };
  assert.ok(Math.abs(recipePeak(seq) - 0.2) < 1e-9, 'the first layer has decayed to almost nothing when the second starts, so the peak is not 0.3');
  assert.ok(recipeEnergy(two) > recipeEnergy(one));
  assert.equal(recipeDuration(seq), 1.99);
});

test('loudness: new recipes stay under the peak ceiling and within the energy range of the existing bank', () => {
  const old = SOUND_IDS.filter((id) => !(id.startsWith('hazard.') || id.startsWith('fanfare.') || id.startsWith('escape.') || id.startsWith('move.') || id.startsWith('enemy.drop_') || id.startsWith('enemy.hive_') || id === 'world.map_reveal' || id === 'world.block_break' || id === 'world.countdown' || ARMS_IDS.has(id)));
  const energies = old.filter((id) => !id.startsWith('amb.') && !id.startsWith('ui.')).map((id) => recipeEnergy(SOUND_BANK[id])).sort((x, y) => x - y);
  const median = energies[Math.floor(energies.length / 2)];
  const fresh = SOUND_IDS.filter((id) => !old.includes(id));
  assert.ok(fresh.length >= 30, `expected the new recipe set, got ${fresh.length}`);
  for (const id of fresh) {
    const rec = SOUND_BANK[id];
    assert.ok(recipePeak(rec) < (id.startsWith('fanfare.') ? 0.9 : 0.6), `${id} peak ${recipePeak(rec).toFixed(3)}`);
    const ratio = recipeEnergy(rec) / median;
    assert.ok(ratio > 1 / 20 && ratio < 20, `${id} energy is ${ratio.toFixed(2)}x the median of the existing bank`);
  }
  // fanfares sit in the same class as the existing win stinger
  for (const id of FANFARE_IDS) {
    const ratio = recipeEnergy(SOUND_BANK[id as 'fanfare.boots']) / recipeEnergy(SOUND_BANK['stinger.win']);
    assert.ok(ratio > 0.4 && ratio < 2.5, `${id} is ${ratio.toFixed(2)}x stinger.win`);
  }
});
const ARMS_IDS = new Set(['weapon.flamer_loop', 'weapon.rocket', 'weapon.rocket_explode', 'enemy.burn', 'player.rocket_jump']);

test('heavy hits are not louder than the main explosion; warnings are quieter than the hits they announce', () => {
  const ref = recipePeak(SOUND_BANK['world.explosion']);
  for (const id of ['hazard.barrel', 'hazard.crush_slam', 'hazard.collapse_crash', 'escape.seal_close', 'enemy.hive_burst', 'weapon.rocket_explode'] as const) {
    assert.ok(recipePeak(SOUND_BANK[id]) <= ref * 1.1, `${id} ${recipePeak(SOUND_BANK[id]).toFixed(3)} vs explosion ${ref.toFixed(3)}`);
  }
  assert.ok(recipeEnergy(SOUND_BANK['hazard.vent_warn']) < recipeEnergy(SOUND_BANK['hazard.vent_burst']));
  assert.ok(recipeEnergy(SOUND_BANK['hazard.crush_warn']) < recipeEnergy(SOUND_BANK['hazard.crush_slam']));
  assert.ok(recipeEnergy(SOUND_BANK['hazard.collapse_creak']) < recipeEnergy(SOUND_BANK['hazard.collapse_crash']));
});

test('limiter headroom: a pile-up of the loudest effects stays bounded and the crowd trim helps', () => {
  const heavy = ['world.explosion', 'hazard.barrel', 'hazard.crush_slam', 'escape.seal_close', 'weapon.rail', 'player.hurt'] as const;
  const peaks = heavy.map((id) => recipePeak(SOUND_BANK[id]));
  const worst = mixLevel(peaks);
  // the glue compressor (-18 dB threshold, 4:1) and limiter (-3 dB) sit after this; worst case must stay inside what they can tame (+9 dB)
  assert.ok(toDb(worst) < 9, `worst case ${toDb(worst).toFixed(1)} dB`);
  assert.ok(mixLevel(peaks) <= peaks.reduce((s, p) => s + p, 0) * 0.85 + 1e-12);
  // three heavy new hits at once stay near unity before the limiter
  assert.ok(toDb(mixLevel(['hazard.barrel', 'hazard.crush_slam', 'escape.seal_close'].map((id) => recipePeak(SOUND_BANK[id as 'world.alarm'])))) < 3);
  assert.equal(toDb(0), -120);
  assert.ok(Math.abs(toDb(1)) < 1e-12);
  // a fanfare over a crowd of normal fire: the 3 s item jingle is the loudest thing in the mix but must not exceed a single big explosion pile-up
  for (const id of FANFARE_IDS) assert.ok(toDb(mixLevel([recipePeak(SOUND_BANK[id as 'fanfare.boots']), recipePeak(SOUND_BANK['weapon.pulse']), recipePeak(SOUND_BANK['step.metal'])])) < 0, id);
});

test('item fanfares: one per upgrade kind and one for a new weapon, 2-3 s, first phrase inside the item freeze', () => {
  const kinds = ['thruster_boots', 'energy_tank', 'crawl_slide', 'ammo_expansion', 'weapon'];
  const ids = kinds.map((k) => fanfareFor(k));
  assert.equal(new Set(ids).size, 5);
  assert.equal(fanfareFor('nothing'), null);
  assert.deepEqual([...FANFARE_IDS].sort(), [...ids].sort() as string[]);
  for (const id of ids as string[]) {
    assert.ok(SOUND_IDS.includes(id as never), id);
    const rec = SOUND_BANK[id as 'fanfare.boots'];
    const dur = recipeDuration(rec);
    assert.ok(dur >= 2 && dur <= 3, `${id} lasts ${dur}`);
    assert.equal(rec.prio, 10, 'fanfares are never stolen or dropped');
    // The opening phrase (everything before the held chord) starts and mostly ends inside the 0.85 s freeze
    const opening = rec.layers.filter((l) => (l.at ?? 0) < ITEM_FREEZE_SECONDS - 1e-9);
    assert.ok(opening.length >= 4, id);
    assert.ok(rec.layers.some((l) => (l.at ?? 0) >= ITEM_FREEZE_SECONDS - 1e-9 && l.d >= 1.5), `${id} resolves with a held chord after the freeze`);
  }
  assert.equal(ITEM_FREEZE_SECONDS, 0.85);
});

test('proximity loops: attenuated by distance, panned, capped, quiet sources dropped', () => {
  const near = { key: 'v1', kind: 'vent' as const, x: 2, y: 0, level: 1 };
  const far = { key: 'v2', kind: 'vent' as const, x: 22, y: 0, level: 1 };
  const gone = { key: 'v3', kind: 'laser' as const, x: 60, y: 0, level: 1 };
  const off = { key: 'v4', kind: 'laser' as const, x: 1, y: 0, level: 0 };
  const plan = planLoops([far, near, gone, off], 0, 0);
  assert.deepEqual(plan.map((p) => p.key), ['v1', 'v2'], 'nearest first, out-of-range and silent sources dropped');
  assert.equal(plan[0].gain, 1);
  assert.ok(plan[1].gain < plan[0].gain && plan[1].lp < plan[0].lp);
  assert.ok(plan[0].pan > 0 && planLoops([{ ...near, x: -2 }], 0, 0)[0].pan < 0);
  const many = Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, kind: 'motor' as const, x: i + 1, y: 0, level: 1 }));
  assert.equal(planLoops(many, 0, 0).length, MAX_LOOPS);
  assert.deepEqual(planLoops(many, 0, 0).map((p) => p.key), ['k0', 'k1', 'k2', 'k3']);
  assert.equal(planLoops([], 0, 0).length, 0);
  assert.equal(planLoops([{ ...near, level: 0.5 }], 0, 0)[0].gain, 0.5);
  assert.equal(planLoops([{ ...near, rate: 1.6 }], 0, 0)[0].rate, 1.6);
  assert.equal(planLoops([near], 0, 0)[0].rate, 1);
  for (const k of ['vent', 'laser', 'motor'] as const) assert.ok(LOOP_BASE[k] > 0 && LOOP_BASE[k] < 0.1, k);
});

test('hazard loop levels follow the cycle; lift motor runs only while moving and faster on the empty return', () => {
  assert.ok(hazardLoopLevel('vent', 'idle') > 0 && hazardLoopLevel('vent', 'idle') < hazardLoopLevel('vent', 'telegraph'));
  assert.ok(hazardLoopLevel('vent', 'telegraph') < hazardLoopLevel('vent', 'active'));
  assert.equal(hazardLoopLevel('laser', 'idle'), 0);
  assert.equal(hazardLoopLevel('laser', 'active'), 1);
  assert.ok(hazardLoopLevel('laser', 'telegraph') > 0 && hazardLoopLevel('laser', 'telegraph') < 1);
  assert.equal(elevatorLoop('bottom').level, 0);
  assert.equal(elevatorLoop('top').level, 0);
  assert.equal(elevatorLoop('rising').level, 1);
  assert.ok(elevatorLoop('returning').rate > elevatorLoop('rising').rate);
});

test('escape stages follow the bulkhead warnings and stack layers monotonically', () => {
  assert.equal(ESCAPE_STAGE_TICKS.length, ESCAPE_BEATS_3D.length);
  ESCAPE_BEATS_3D.forEach((b, i) => assert.equal(ESCAPE_STAGE_TICKS[i], b.at, 'stage thresholds match the simulation beats'));
  assert.equal(escapeStageFor(-1), 0);
  assert.equal(escapeStageFor(MELTDOWN_TICKS), 0);
  assert.equal(escapeStageFor(ESCAPE_STAGE_TICKS[0] + 1), 0);
  assert.equal(escapeStageFor(ESCAPE_STAGE_TICKS[0]), 1);
  assert.equal(escapeStageFor(ESCAPE_STAGE_TICKS[4]), 5);
  assert.equal(escapeStageFor(0), 5);
  let prev = 0;
  for (let t = MELTDOWN_TICKS; t >= 0; t--) {
    const s = escapeStageFor(t);
    assert.ok(s >= prev);
    prev = s;
  }
  const count = (m: (typeof ESCAPE_LAYERS)[number]) => Object.values(m).filter(Boolean).length;
  for (let i = 1; i < ESCAPE_LAYERS.length; i++) {
    assert.ok(count(ESCAPE_LAYERS[i]) >= count(ESCAPE_LAYERS[i - 1]));
    for (const k of Object.keys(ESCAPE_LAYERS[i]) as (keyof (typeof ESCAPE_LAYERS)[number])[]) if (ESCAPE_LAYERS[i - 1][k]) assert.ok(ESCAPE_LAYERS[i][k], `${k} stays on at stage ${i}`);
  }
  assert.ok(count(ESCAPE_LAYERS[5]) === 8 && count(ESCAPE_LAYERS[0]) < 8);
  assert.equal(escapeKeyLift(0), 0);
  assert.ok(escapeKeyLift(5) > escapeKeyLift(4) && escapeKeyLift(4) > escapeKeyLift(3));
});

test('escape tempo rises with stage and accelerates in the final 10 seconds', () => {
  assert.equal(escapeTempoScale(-1), 1);
  assert.equal(escapeTempoScale(MELTDOWN_TICKS), 1);
  let prev = 0;
  for (let t = MELTDOWN_TICKS; t >= 0; t -= 5) {
    const s = escapeTempoScale(t);
    assert.ok(s >= prev - 1e-12, `tempo never slows (${t})`);
    prev = s;
  }
  const calm = escapeTempoScale(PANIC_TICKS + 1);
  const mid = escapeTempoScale(PANIC_TICKS / 2);
  const end = escapeTempoScale(1);
  assert.ok(mid > calm * 1.08 && end > mid * 1.08, 'final dash speeds up smoothly');
  assert.ok(THEMES.meltdown.bpm * end < 240, 'sixteenths stay playable');
});

test('escape alarm: slow early, faster as bulkheads seal, fastest and highest in the last 10 seconds', () => {
  assert.equal(alarmPeriodTicks(-1), 0);
  assert.equal(alarmPeriodTicks(0), 0);
  assert.equal(alarmPeriodTicks(MELTDOWN_TICKS), 45);
  assert.equal(alarmPeriodTicks(30 * 60), 45);
  assert.equal(alarmPeriodTicks(20 * 60), 36);
  assert.ok(alarmPeriodTicks(PANIC_TICKS) < 36);
  assert.ok(alarmPeriodTicks(5) < alarmPeriodTicks(PANIC_TICKS - 1) || alarmPeriodTicks(5) === 10);
  let prev = 99;
  for (let t = MELTDOWN_TICKS; t > 0; t--) {
    const p = alarmPeriodTicks(t);
    assert.ok(p <= prev, `alarm never slows (${t})`);
    assert.ok(p >= 10, 'pulses stay slower than the recipe throttle');
    prev = p;
  }
  assert.equal(alarmPitch(MELTDOWN_TICKS), 1);
  assert.ok(alarmPitch(1) > alarmPitch(PANIC_TICKS - 1) && alarmPitch(1) <= 1.5);
  assert.equal(panicLevel(-1), 0);
  assert.equal(panicLevel(PANIC_TICKS + 1), 0);
  assert.equal(panicLevel(0), 1);
  assert.ok(SOUND_BANK['world.alarm'].gap < 10 / 60, 'the alarm recipe throttle must allow the fastest pulse');
});

test('countdown beeps land once per second in the last 10 seconds only', () => {
  const ticks = [];
  for (let t = MELTDOWN_TICKS; t >= 0; t--) if (isCountdownTick(t)) ticks.push(t);
  assert.deepEqual(ticks, [600, 540, 480, 420, 360, 300, 240, 180, 120, 60]);
});

// R21: Stage 3 Cryo Bulwark (frost-shield stalker) and the per-stage audio identity. Deterministic, node only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import {
  BULWARK_FRONT_MULT, STAGE3_BULWARK_IDS, bulwarkDamageMult3D, bulwarkShieldUp3D, buildStage3Map3D, type BulwarkView3D,
} from '../src/game3d/stage3.ts';
import { emptyInput3D, newWorld3D, stepWorld3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { EVENT_SOUND, stageStinger, stageSurfaceFor, surfaceFor, variantCue, enemyCue } from '../src/ui/audioLogic.ts';
import { SOUND_BANK } from '../src/ui/soundBank.ts';
import { STAGE_AMBIENT, STAGE_MUSIC, THEMES, themeForStage } from '../src/ui/themes.ts';

const SOUND_IDS = Object.keys(SOUND_BANK);
const view = (o: Partial<BulwarkView3D> = {}): BulwarkView3D => ({ alive: true, variant: 'bulwark', state: 'chase', staggerTicks: 0, facing: -1, ...o });

test('Stage 3 places three Cryo Bulwarks on existing stalker slots; other stages have none', () => {
  const l = buildStage3Map3D();
  const bw = l.enemies.filter((e) => e.variant === 'bulwark');
  assert.deepEqual(bw.map((e) => e.id).sort(), [...STAGE3_BULWARK_IDS].sort());
  for (const e of bw) assert.equal(e.kind, 'stalker');
  assert.equal(newWorld3D({ stage: 1 }).enemies.some((e) => e.variant === 'bulwark'), false);
  assert.equal(newWorld3D({ stage: 2 }).enemies.some((e) => e.variant === 'bulwark'), false);
  assert.equal(newWorld3D({ stage: 3 }).enemies.filter((e) => e.variant === 'bulwark').length, 3);
});

test('frost shield blocks Pulse and Scattergun from the front only', () => {
  // Facing west (-1): a shot travelling east (+x) meets the shield
  assert.equal(bulwarkDamageMult3D(view(), 2.5, 1), BULWARK_FRONT_MULT);
  assert.equal(bulwarkDamageMult3D(view(), 4, 2), BULWARK_FRONT_MULT);
  assert.equal(bulwarkDamageMult3D(view(), -2.5, 1), 1, 'back hit');
  assert.equal(bulwarkDamageMult3D(view({ facing: 1 }), -2.5, 1), BULWARK_FRONT_MULT);
  for (const slot of [0, 3, 4, 5, 6]) assert.equal(bulwarkDamageMult3D(view(), 2.5, slot), 1, `slot ${slot} pierces`);
  assert.equal(bulwarkDamageMult3D(view(), 0, 1), 1, 'no direction, no block');
  assert.equal(bulwarkDamageMult3D(view({ variant: 'none' }), 2.5, 1), 1);
});

test('shield drops while the Bulwark winds up, strikes, recovers or staggers', () => {
  assert.equal(bulwarkShieldUp3D(view()), true);
  for (const state of ['windup', 'attack', 'recover', 'stagger']) assert.equal(bulwarkShieldUp3D(view({ state })), false, state);
  assert.equal(bulwarkShieldUp3D(view({ staggerTicks: 3 })), false);
  assert.equal(bulwarkShieldUp3D(view({ alive: false })), false);
});

function bulwarkDuel(fromBehind: boolean): { w: WorldState3D; hpLost: number; blocks: number } {
  const w = newWorld3D({ stage: 3, difficulty: 'normal' });
  const e = w.enemies.find((x) => x.id === 'e-s3-shaft-14')!;
  for (const o of w.enemies) if (o !== e && o.kind !== 'warden') { o.alive = false; o.hp = 0; }
  // Park the Bulwark in plain sight, awake but calm, facing the shooter (or away from it)
  e.active = true;
  e.state = 'patrol';
  e.attackCooldown = 9999;
  const startHp = e.hp;
  const px = e.x - 6;
  w.player.body.x = px;
  w.player.body.y = 0;
  let blocks = 0;
  for (let t = 0; t < 40; t++) {
    e.facing = fromBehind ? 1 : -1;
    e.state = 'patrol';
    e.attackCooldown = 9999;
    stepWorld3D(w, { ...emptyInput3D(), fire: true, aimX: e.x, aimY: 1.1 });
    blocks += w.events.filter((ev) => ev.type === 'shield_block').length;
  }
  return { w, hpLost: startHp - e.hp, blocks };
}

test('in the sim a front Pulse volley mostly glances off; the same volley in the back hurts', () => {
  const front = bulwarkDuel(false);
  const back = bulwarkDuel(true);
  assert.ok(front.blocks > 0, 'shield_block events fire');
  assert.equal(back.blocks, 0);
  assert.ok(back.hpLost > 0 && front.hpLost < back.hpLost * 0.6, `front ${front.hpLost} vs back ${back.hpLost}`);
});

test('Stage 3 bot run with Bulwarks is deterministic', () => {
  const run = () => {
    const w = newWorld3D({ stage: 3, difficulty: 'normal' });
    const bot = createBot3D(w);
    let blocks = 0;
    for (let t = 0; t < 20000 && w.status !== 'won'; t++) {
      stepWorld3D(w, bot.next(w));
      blocks += w.events.filter((ev) => ev.type === 'shield_block').length;
    }
    return [w.tick, w.player.hp, blocks, w.status];
  };
  assert.deepEqual(run(), run());
});

test('Bulwark sounds: body cues, shield block and stage stingers map to bank recipes', () => {
  for (const next of ['alert', 'windup', 'attack'] as const) {
    const cue = variantCue(enemyCue('stalker', 'chase', next, true, true), 'bulwark');
    if (cue) assert.ok(SOUND_IDS.includes(cue), cue);
  }
  assert.equal(variantCue(enemyCue('stalker', 'chase', 'dead', true, false), 'bulwark'), 'enemy.bulwark.death');
  assert.ok(SOUND_IDS.includes('enemy.bulwark.land') && SOUND_IDS.includes('enemy.bulwark.death'));
  assert.ok(SOUND_IDS.includes(EVENT_SOUND.shield_block));
  assert.equal(stageStinger(1), null);
  for (const s of [2, 3] as const) assert.ok(SOUND_IDS.includes(stageStinger(s)!), `stage ${s} stinger`);
});

test('each stage re-voices the sector themes; Stage 1 is untouched and the result is deterministic', () => {
  for (const id of Object.keys(THEMES) as (keyof typeof THEMES)[]) assert.equal(themeForStage(id, 1), THEMES[id]);
  for (const id of ['title', 'victory', 'meltdown'] as const) assert.equal(themeForStage(id, 3), THEMES[id]);
  for (const id of ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core', 'boss'] as const) {
    const s1 = THEMES[id];
    const s2 = themeForStage(id, 2);
    const s3 = themeForStage(id, 3);
    assert.deepEqual(themeForStage(id, 2), s2);
    assert.ok(s2.root < s1.root && s2.bpm < s1.bpm, `${id}: Foundry is lower and slower`);
    assert.ok(s3.root > s1.root && s3.bpm > s1.bpm, `${id}: Spire is higher and faster`);
    assert.equal(s2.bassWave, 'sawtooth');
    assert.equal(s3.arpWave, 'sine');
    assert.ok((s2.perc.match(/c/g) ?? []).length > (s1.perc.match(/c/g) ?? []).length, `${id}: anvil clangs`);
    assert.ok((s3.hat.match(/x/g) ?? []).length >= (s1.hat.match(/x/g) ?? []).length);
    for (const d of [s2, s3]) {
      assert.equal(d.perc.length, 16);
      assert.equal(d.hat.length, 16);
      assert.ok(d.wet <= 0.75 && d.delayFb <= 0.7 && d.duck >= 0 && d.duck <= 0.6);
    }
  }
  assert.deepEqual(STAGE_MUSIC[1].transpose, 0);
  assert.ok(STAGE_AMBIENT[2].droneMul < 1 && STAGE_AMBIENT[3].droneMul > 1);
});

test('footstep surface follows the stage', () => {
  for (const s of ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'] as const) assert.equal(stageSurfaceFor(s, 1), surfaceFor(s));
  assert.equal(stageSurfaceFor('biolabs', 2), 'metal');
  assert.equal(stageSurfaceFor('mines', 2), 'rock');
  assert.equal(stageSurfaceFor('shaft', 3), 'crystal');
});

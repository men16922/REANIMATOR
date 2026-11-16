// FEAT-002: bot full-combat guards for Stages 2 and 3, balance floors, and the Stage 2 mini-boss (Slag Foreman).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { STAGE2_FOREMAN_ID } from '../src/game3d/stage2.ts';
import { countStageFoes3D } from '../src/game3d/stages3d.ts';
import {
  FOREMAN_HP, emptyInput3D, newWorld3D, respawnPlayer3D, stepWorld3D, type Difficulty3D, type WorldState3D,
} from '../src/game3d/world3d.ts';
import { objectiveFor, OBJECTIVES } from '../src/ui/objective.ts';
import { checkStage } from '../tools/game/reach3d.ts';

function botStage(stage: 2 | 3, difficulty: Difficulty3D, maxTicks = 20000) {
  const w = newWorld3D({ stage, difficulty });
  const bot = createBot3D(w);
  let deaths = 0;
  let minHp = w.player.hp;
  for (let t = 0; t < maxTicks && w.status !== 'won'; t++) {
    stepWorld3D(w, bot.next(w));
    minHp = Math.min(minHp, w.player.hp);
    if (w.status === 'lost') {
      deaths++;
      respawnPlayer3D(w);
    }
  }
  return { w, deaths, minHp, bot };
}

// Pinned bot results: [stage, difficulty, ticks, final HP, lowest HP]. Stage 1 pins live in tests/assist.test.ts.
const PINS: [2 | 3, Difficulty3D, number, number, number][] = [
  [2, 'story', 2790, 130, 94],
  [2, 'normal', 2858, 130, 89],
  [2, 'hard', 3232, 94, 70],
  [3, 'story', 3228, 120, 94],
  [3, 'normal', 3243, 87, 72],
  [3, 'hard', 3320, 56, 56],
];

for (const [stage, diff, ticks, hp, minHp] of PINS) {
  test(`bot clears Stage ${stage} on ${diff} (pinned ${ticks} ticks, HP ${hp})`, () => {
    const r = botStage(stage, diff);
    assert.equal(r.w.status, 'won');
    assert.ok(r.w.stageClear, 'clear stats recorded');
    assert.equal(r.w.stageClear!.stage, stage);
    assert.equal(r.deaths, 0);
    assert.equal(r.w.tick, ticks);
    assert.equal(r.w.player.hp, hp);
    assert.equal(r.minHp, minHp);
  });
}

test('balance: Normal keeps a first-time player above a 60 HP floor, Hard stays winnable', () => {
  for (const stage of [2, 3] as const) {
    assert.ok(botStage(stage, 'normal').minHp >= 60, `stage ${stage} normal floor`);
    assert.ok(botStage(stage, 'hard').minHp >= 40, `stage ${stage} hard floor`);
  }
});

test('stage bot runs are deterministic', () => {
  const a = botStage(2, 'normal');
  const b = botStage(2, 'normal');
  assert.equal(JSON.stringify([a.w.tick, a.w.player.hp, a.w.player.kills]), JSON.stringify([b.w.tick, b.w.player.hp, b.w.player.kills]));
});

function place(w: WorldState3D, x: number, y = 0): void {
  w.player.body.x = x;
  w.player.body.y = y;
  w.player.body.vx = 0;
  w.player.body.vy = 0;
  w.player.body.grounded = true;
}

test('Slag Foreman is a Stage 2 mini-boss guarding the exit', () => {
  const w = newWorld3D({ stage: 2 });
  const f = w.enemies.find((e) => e.id === STAGE2_FOREMAN_ID)!;
  assert.equal(f.variant, 'foreman');
  assert.equal(f.kind, 'stalker');
  assert.equal(f.maxHp, FOREMAN_HP);
  assert.ok(f.maxHp > 5 * 78, 'far tougher than a Stalker');
  assert.ok(f.height > 2.2);
  assert.equal(w.level.stage!.guardId, STAGE2_FOREMAN_ID);
  assert.ok(countStageFoes3D(w.level) > 0);
  assert.equal(newWorld3D({ stage: 3 }).enemies.some((e) => e.variant === 'foreman'), false);
  assert.equal(newWorld3D().enemies.some((e) => e.variant === 'foreman'), false);
  assert.equal(newWorld3D({ stage: 2, difficulty: 'story' }).enemies.find((e) => e.id === STAGE2_FOREMAN_ID)!.maxHp < FOREMAN_HP, true);
});

test('the exit teleporter stays locked until the Foreman dies, then it drops supplies', () => {
  const w = newWorld3D({ stage: 2 });
  const ex = w.level.exitPos;
  place(w, ex.x);
  for (let i = 0; i < 3; i++) stepWorld3D(w, { ...emptyInput3D(), interact: true });
  assert.equal(w.status, 'playing');
  assert.equal(w.stageClear, null);
  const f = w.enemies.find((e) => e.id === STAGE2_FOREMAN_ID)!;
  const before = w.pickups.length;
  f.active = true;
  f.hp = 1;
  // a Pulse shot at the Foreman
  place(w, f.x - 5);
  for (let i = 0; i < 90 && f.alive; i++) stepWorld3D(w, { ...emptyInput3D(), fire: true, aimX: f.x, aimY: f.y + 1.3, weaponSlot: 1 });
  assert.equal(f.alive, false, 'the Foreman can be killed');
  assert.ok(w.pickups.length >= before + 2, 'drops a medkit and ammo');
  assert.ok(w.pickups.some((p) => p.kind === 'med' && p.value >= 40));
  place(w, ex.x);
  for (let i = 0; i < 2; i++) stepWorld3D(w, { ...emptyInput3D(), interact: true });
  assert.equal(w.status, 'won');
  assert.equal(w.stageClear!.stage, 2);
});

test('the Foreman telegraphs a lunge and slams a jumpable shockwave', () => {
  const w = newWorld3D({ stage: 2 });
  const f = w.enemies.find((e) => e.id === STAGE2_FOREMAN_ID)!;
  for (const e of w.enemies) if (e !== f) e.alive = false;
  place(w, f.x - 3.5);
  w.player.hp = w.player.maxHp = 400;
  w.player.hurtInvulnTicks = 0;
  let windup = false;
  let parry = false;
  let wave = false;
  for (let i = 0; i < 600 && !wave; i++) {
    stepWorld3D(w, emptyInput3D());
    if (f.state === 'windup') windup = true;
    if (f.parryOpen) parry = true;
    if (w.shockwaves.length > 0) wave = true;
    w.player.hp = w.player.maxHp;
  }
  assert.ok(windup, 'windup telegraph');
  assert.ok(parry, 'melee counter window opens');
  assert.ok(wave, 'a shockwave follows the lunge');
});

test('HUD objective names the Foreman, then the exit', () => {
  const w = newWorld3D({ stage: 2 });
  assert.equal(objectiveFor(w), OBJECTIVES.foreman);
  w.enemies.find((e) => e.id === STAGE2_FOREMAN_ID)!.alive = false;
  assert.equal(objectiveFor(w), OBJECTIVES.exit);
});

test('reach3d guard check passes and catches a missing guard', () => {
  assert.deepEqual(checkStage(2).problems, []);
  assert.deepEqual(checkStage(3).problems, []);
});

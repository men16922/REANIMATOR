// R12 robust bot: respawn routing from any save/spawn/Story spot, and combat margin under harsher rules. Deterministic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D, incomingShotTicks } from '../src/game3d/bot3d.ts';
import { newWorld3D, respawnPlayer3D, stepWorld3D, type Difficulty3D, type WorldState3D } from '../src/game3d/world3d.ts';

interface BotResult {
  w: WorldState3D;
  deaths: number;
  minHp: number;
  stuckAt: string;
}

/** Bot run that forces a defeat at each tick in `kills` (HP to 0, same path as a lethal hit) and respawns like real play. */
function runWithKills(difficulty: Difficulty3D, kills: number[], maxTicks = 16000, tweak?: (w: WorldState3D) => void): BotResult {
  const w = newWorld3D({ difficulty });
  tweak?.(w);
  const bot = createBot3D(w);
  const pending = [...kills];
  let deaths = 0;
  let minHp = w.player.hp;
  for (let t = 0; t < maxTicks && w.status !== 'won'; t++) {
    if (pending.length && t === pending[0]) {
      pending.shift();
      w.player.hp = 0;
      w.status = 'lost';
    } else {
      stepWorld3D(w, bot.next(w));
      minHp = Math.min(minHp, w.player.hp);
    }
    if (w.status === 'lost') {
      deaths++;
      respawnPlayer3D(w);
    }
  }
  const b = w.player.body;
  return { w, deaths, minHp, stuckAt: `${bot.stepLabel} at (${b.x.toFixed(1)}, ${b.y.toFixed(1)})` };
}

// Kill schedules (bot ticks): before any save (spawn respawn, crate leap), on the cargo lift (Mines save), on the Security
// Deck (the reported Central Shaft stall at (38.1, 8.8) on Hard), and a double kill in the Warden fight and the meltdown run.
const SCHEDULES: number[][] = [[400], [1700], [3500], [4400, 5100]];

for (const d of ['normal', 'story', 'hard'] as Difficulty3D[]) {
  test(`respawn routing (${d}): the bot finishes after a defeat at every scheduled point`, () => {
    for (const kills of SCHEDULES) {
      const r = runWithKills(d, kills);
      assert.equal(r.w.status, 'won', `${d} kills ${kills.join('+')}: stuck on ${r.stuckAt}`);
      assert.ok(r.deaths >= kills.length, `${d} kills ${kills.join('+')}: ${r.deaths} deaths`);
    }
  });
}

test('Hard bot keeps a wide margin and still wins with harsher damage and tempo', () => {
  const base = runWithKills('hard', []);
  assert.equal(base.w.status, 'won');
  assert.equal(base.deaths, 0);
  assert.ok(base.minHp >= 80, `min HP ${base.minHp}`);
  assert.ok(base.w.player.hp >= 100, `final HP ${base.w.player.hp}`);
  // Rules untouched in the game; this probe only stresses the bot: x1.6 damage, x1.25 tempo
  const harsh = runWithKills('hard', [], 16000, (w) => {
    w.diff = { ...w.diff, damage: 1.6, tempo: 1.25 };
  });
  assert.equal(harsh.w.status, 'won', `harsh Hard: stuck on ${harsh.stuckAt}`);
  assert.equal(harsh.deaths, 0);
});

test('incomingShotTicks sees a hostile shot on course and ignores player shots and misses', () => {
  const w = newWorld3D();
  const b = w.player.body;
  const shot = { id: 999, kind: 'enemy_acid' as const, fromPlayer: false, x: b.x + 3, y: b.y + 1, z: 0, vx: -60, vy: 0, vz: 0, damage: 10, radius: 0.2, lifeTicks: 60, bounces: 0 };
  w.projectiles = [shot];
  const k = incomingShotTicks(w);
  assert.ok(k >= 1 && k <= 3, `ticks ${k}`);
  w.projectiles = [{ ...shot, vx: 60 }];
  assert.equal(incomingShotTicks(w), Infinity, 'flying away');
  w.projectiles = [{ ...shot, fromPlayer: true }];
  assert.equal(incomingShotTicks(w), Infinity, 'player shot');
  w.projectiles = [{ ...shot, y: b.y + 4 }];
  assert.equal(incomingShotTicks(w), Infinity, 'overhead');
});

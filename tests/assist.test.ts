// R8 track C: difficulty presets, assist options, death causes. All deterministic, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { hazardPhase } from '../src/game3d/hazards.ts';
import {
  assistAim, AIM_ASSIST_RADIUS, difficultyNote, displayClock, parseAssist, parseDifficulty, stepAutoFire,
} from '../src/game3d/assist.ts';
import {
  DEATH_CAUSES_3D, deathCauseOf3D, DIFFICULTIES_3D, DIFFICULTY_PARAMS_3D, emptyInput3D, hazardNowTick3D, newWorld3D,
  respawnPlayer3D, setAssist3D, stepWorld3D, type Difficulty3D, type WorldState3D,
} from '../src/game3d/world3d.ts';
import { runReckless } from '../tools/game/difficulty.ts';

function botRun(difficulty: Difficulty3D, maxTicks = 20000) {
  const w = newWorld3D({ difficulty });
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
  return { w, deaths, minHp };
}

const hz = (w: WorldState3D, id: string) => w.level.hazards.find((h) => h.id === id)!;
function quiet(w: WorldState3D): void {
  for (const e of w.enemies) e.alive = false;
  for (const h of w.hives) h.alive = false;
}
function place(w: WorldState3D, x: number, y: number): void {
  quiet(w);
  w.player.body = spawnBody3D(x, y, 0);
  w.player.hurtInvulnTicks = 0;
}
function runToPhase(w: WorldState3D, id: string, phase: string): void {
  const h = hz(w, id);
  for (let i = 0; i < h.period * 3 && hazardPhase(h, hazardNowTick3D(w, h)) !== phase; i++) {
    stepWorld3D(w, emptyInput3D());
    w.player.hp = w.player.maxHp;
  }
  assert.equal(hazardPhase(h, hazardNowTick3D(w, h)), phase);
}

test('Normal is the identity preset and keeps the pinned bot result', () => {
  assert.deepEqual(DIFFICULTY_PARAMS_3D.normal, { damage: 1, enemyHp: 1, tempo: 1, heal: 1, generousDrops: false, nearRespawn: false });
  const { w, deaths } = botRun('normal');
  assert.equal(w.status, 'won');
  // R12 integrated (onboard softened first encounter + robust bot): 5444 / HP 140. Robust alone was 5708 / 126.
  // R12 robust bot (dodges hostile shots on the dash i-frames, counters open windows): 5708 / HP 126.
  // R12 enemy locomotion was 5522 / 95; R10 was 5533; 5362 before the Reclaimer
  assert.equal(w.tick, 5444);
  assert.equal(w.player.hp, 140);
  assert.equal(deaths, 0);
  const d = newWorld3D();
  assert.equal(d.difficulty, 'normal');
  assert.deepEqual(d.assist, { aim: false, autoFire: false, slow: false, hazardWarn: false });
});

test('default reckless probe is unchanged on Normal', () => {
  const r = runReckless(3600);
  assert.equal(r.hpLost, 245);
  assert.equal(r.deaths, 2);
  assert.deepEqual(r, runReckless(3600, 'normal'));
});

test('Story: reckless policy dies at most once and loses far less HP than Normal', () => {
  const story = runReckless(3600, 'story');
  const normal = runReckless(3600, 'normal');
  assert.ok(story.deaths <= 1, `story deaths ${story.deaths}`);
  assert.ok(story.hpLost < normal.hpLost * 0.6, `story ${story.hpLost} vs normal ${normal.hpLost}`);
});

test('Hard: reckless is harsher, bot still wins without dying', () => {
  const hard = runReckless(3600, 'hard');
  assert.ok(hard.hpLost > runReckless(3600, 'normal').hpLost);
  const { w, deaths, minHp } = botRun('hard');
  assert.equal(w.status, 'won');
  assert.equal(deaths, 0);
  assert.ok(minHp >= 80, `min HP ${minHp}`); // R12 integrated bot: 100 (never under the base pool), was 48 with floor 40
});

test('Story: bot wins and ends healthier than on Hard', () => {
  const story = botRun('story');
  const hard = botRun('hard');
  assert.equal(story.w.status, 'won');
  assert.ok(story.w.player.hp > hard.w.player.hp);
});

test('every difficulty replays deterministically', () => {
  for (const d of DIFFICULTIES_3D) {
    const a = runReckless(1500, d);
    const b = runReckless(1500, d);
    assert.deepEqual(a, b, d);
  }
  const x = botRun('hard', 2500).w;
  const y = botRun('hard', 2500).w;
  assert.equal(x.tick, y.tick);
  assert.equal(x.player.hp, y.player.hp);
  assert.equal(x.player.body.x, y.player.body.x);
});

test('presets scale damage, enemy HP, tempo, healing and drops as documented', () => {
  const n = newWorld3D();
  const s = newWorld3D({ difficulty: 'story' });
  const h = newWorld3D({ difficulty: 'hard' });
  const sk = (w: WorldState3D) => w.enemies.find((e) => e.id === 'e-shaft-2')!.maxHp;
  assert.equal(sk(s), Math.round(sk(n) * 0.8));
  assert.ok(sk(s) < sk(n) && sk(h) === sk(n));
  assert.ok(s.hives.every((x, i) => x.maxHp < n.hives[i].maxHp));
  assert.equal(h.diff.tempo, 1.1);
  assert.equal(h.diff.damage, 1.35);
  assert.ok(h.diff.heal < 1 && s.diff.generousDrops && !n.diff.generousDrops);
  // damage: same spit hit takes less on Story, more on Hard
  const hit = (w: WorldState3D): number => {
    quiet(w);
    w.player.body = spawnBody3D(30, 0, 0);
    w.player.hurtInvulnTicks = 0;
    const before = w.player.hp;
    w.projectiles.push({ id: 900, kind: 'enemy_acid', fromPlayer: false, x: 30, y: 1, z: 0, vx: 0, vy: 0, vz: 0, damage: 20, radius: 0.24, lifeTicks: 30, bounces: 0 });
    stepWorld3D(w, emptyInput3D());
    return before - w.player.hp;
  };
  assert.equal(hit(newWorld3D()), 20);
  assert.equal(hit(newWorld3D({ difficulty: 'story' })), 10);
  assert.equal(hit(newWorld3D({ difficulty: 'hard' })), 27);
});

test('Story drops ammo or med on every kill, Normal only on odd kills', () => {
  const drops = (d: Difficulty3D): number => {
    const w = newWorld3D({ difficulty: d });
    const targets = w.enemies.filter((e) => e.alive && e.kind !== 'warden').slice(0, 4);
    const before = w.pickups.length;
    for (const e of targets) {
      w.player.body = spawnBody3D(e.x - 3, e.y, 0);
      e.hp = 1;
      w.projectiles.push({ id: 800 + w.nextId, kind: 'pulse', fromPlayer: true, x: e.x, y: e.y + 0.6, z: 0, vx: 0, vy: 0, vz: 0, damage: 50, radius: 0.2, lifeTicks: 10, bounces: 0 });
      stepWorld3D(w, emptyInput3D());
    }
    return w.pickups.length - before;
  };
  assert.ok(drops('story') > drops('normal'), `story ${drops('story')} normal ${drops('normal')}`);
});

test('Story respawns at the rolling checkpoint instead of the spawn or last save', () => {
  const w = newWorld3D({ difficulty: 'story' });
  quiet(w);
  w.player.body = spawnBody3D(12, 0, 0);
  for (let i = 0; i < 40; i++) stepWorld3D(w, emptyInput3D());
  assert.ok(w.checkpoint, 'checkpoint recorded');
  const cp = w.checkpoint!;
  w.player.body = spawnBody3D(18, 0, 0);
  w.status = 'lost';
  respawnPlayer3D(w);
  assert.equal(w.status, 'playing');
  assert.ok(Math.abs(w.player.body.x - cp.x) < 0.01);
  const n = newWorld3D();
  n.status = 'lost';
  respawnPlayer3D(n);
  assert.equal(n.checkpoint, null);
  assert.ok(Math.abs(n.player.body.x - n.level.spawn.x) < 0.01);
});

test('death cause mapping: hazards, acid, projectiles and every key has copy', () => {
  for (const [k, v] of Object.entries(DEATH_CAUSES_3D)) {
    assert.ok(v.label.length > 3 && v.tip.length > 10, k);
    assert.equal(deathCauseOf3D(k as keyof typeof DEATH_CAUSES_3D).label, v.label);
  }
  assert.equal(deathCauseOf3D(null).key, 'unknown');

  const w = newWorld3D();
  const crusher = hz(w, 'hz-mines-crusher');
  runToPhase(w, crusher.id, 'active');
  place(w, crusher.x, crusher.y);
  w.player.hp = 1;
  for (let i = 0; i < 8 && w.status === 'playing'; i++) stepWorld3D(w, emptyInput3D());
  assert.equal(w.status, 'lost');
  assert.equal(w.deathCause?.key, 'crusher');
  assert.equal(w.deathCause?.label, 'Crushed by piston');

  const v = newWorld3D();
  const vent = hz(v, 'hz-mines-vent');
  runToPhase(v, vent.id, 'active');
  place(v, vent.x + 0.2, vent.y);
  v.player.hp = 1;
  stepWorld3D(v, emptyInput3D());
  assert.equal(v.deathCause?.key, 'vent');

  const a = newWorld3D();
  const pool = a.level.acidPools[0];
  place(a, (pool.minX + pool.maxX) / 2, pool.surfaceY - 0.5);
  a.player.hp = 1;
  a.player.acidCooldown = 0;
  for (let i = 0; i < 30 && a.status === 'playing'; i++) {
    a.player.body.grounded = true;
    stepWorld3D(a, emptyInput3D());
  }
  assert.equal(a.status, 'lost');
  assert.equal(a.deathCause?.key, 'acid');

  for (const [kind, key] of [['enemy_acid', 'spit'], ['boss_plasma', 'plasma']] as const) {
    const p = newWorld3D();
    place(p, 30, 0);
    p.player.hp = 1;
    p.projectiles.push({ id: 901, kind, fromPlayer: false, x: 30, y: 1, z: 0, vx: 0, vy: 0, vz: 0, damage: 20, radius: 0.24, lifeTicks: 30, bounces: 0 });
    stepWorld3D(p, emptyInput3D());
    assert.equal(p.status, 'lost', kind);
    assert.equal(p.deathCause?.key, key);
  }
  // survives with no cause recorded
  assert.equal(newWorld3D().deathCause, null);
});

test('melee deaths map to the enemy kind', () => {
  const w = newWorld3D();
  const st = w.enemies.find((e) => e.kind === 'stalker')!;
  quiet(w);
  st.alive = true;
  st.active = true;
  w.player.body = spawnBody3D(st.x - 1.2, st.y, 0);
  w.player.hp = 1;
  w.player.hurtInvulnTicks = 0;
  for (let i = 0; i < 400 && w.status === 'playing'; i++) {
    w.player.body.x = st.x - 1.0;
    stepWorld3D(w, emptyInput3D());
  }
  assert.equal(w.status, 'lost');
  assert.equal(w.deathCause?.key, 'stalker');
});

test('Hazard Warning stretches the telegraph by 20% and keeps every other phase length', () => {
  const count = (warn: boolean) => {
    const w = newWorld3D({ assist: { hazardWarn: warn } });
    const h = hz(w, 'hz-mines-crusher');
    const n: Record<string, number> = { idle: 0, telegraph: 0, active: 0, recover: 0 };
    for (let i = 0; i < 4000; i++) {
      w.tick = i;
      n[hazardPhase(h, hazardNowTick3D(w, h))]++;
    }
    return { n, h };
  };
  const base = count(false);
  const warn = count(true);
  const cycles = (n: Record<string, number>, h: { period: number }) => (n.idle + n.telegraph + n.active + n.recover) / h.period;
  assert.ok(base.n.telegraph > 0);
  const tBase = base.n.telegraph / 4000;
  const tWarn = warn.n.telegraph / 4000;
  const perCycleBase = base.n.telegraph / (4000 / base.h.period);
  assert.ok(Math.abs(perCycleBase - base.h.telegraph) < 1.5);
  const periodWarn = base.h.period + Math.round(base.h.telegraph * 1.2) - base.h.telegraph;
  const perCycleWarn = warn.n.telegraph / (4000 / periodWarn);
  assert.ok(Math.abs(perCycleWarn - Math.round(base.h.telegraph * 1.2)) < 1.5, `telegraph/cycle ${perCycleWarn}`);
  assert.ok(Math.abs(warn.n.active / (4000 / periodWarn) - base.h.active) < 1.5);
  assert.ok(tWarn > 0 && tBase > 0 && cycles(base.n, base.h) === 4000 / base.h.period);
});

test('Hazard Warning leaves the level immutable and toggles live', () => {
  const w = newWorld3D();
  const before = JSON.stringify(w.level.hazards);
  setAssist3D(w, { hazardWarn: true });
  assert.equal(JSON.stringify(w.level.hazards), before);
  assert.equal(w.assist.hazardWarn, true);
  const a = newWorld3D({ assist: { hazardWarn: true } });
  const b = newWorld3D({ assist: { hazardWarn: true } });
  for (let i = 0; i < 600; i++) {
    stepWorld3D(a, emptyInput3D());
    stepWorld3D(b, emptyInput3D());
  }
  assert.equal(a.player.hp, b.player.hp);
});

test('Aim assist pulls toward the nearest enemy, is exact elsewhere and deterministic', () => {
  const w = newWorld3D();
  const e = w.enemies.find((x) => x.alive)!;
  w.player.body = spawnBody3D(e.x - 6, e.y, 0);
  const cy = e.y + e.height * 0.5;
  const far = assistAim(w, e.x - AIM_ASSIST_RADIUS - 1, cy + 5);
  assert.deepEqual(far, { x: e.x - AIM_ASSIST_RADIUS - 1, y: cy + 5 });
  const nearAim = { x: e.x - 1.5, y: cy + 1 };
  const pulled = assistAim(w, nearAim.x, nearAim.y);
  assert.ok(Math.hypot(pulled.x - e.x, pulled.y - cy) < Math.hypot(nearAim.x - e.x, nearAim.y - cy));
  assert.deepEqual(pulled, assistAim(w, nearAim.x, nearAim.y));
  assert.deepEqual(assistAim(w, e.x, cy), { x: e.x, y: cy });
  e.alive = false;
  assert.deepEqual(assistAim(w, nearAim.x, nearAim.y), nearAim);
});

test('Auto-fire latch toggles on a fresh press and holds without the button', () => {
  let s = stepAutoFire(false, false, false);
  assert.equal(s.fire, false);
  s = stepAutoFire(s.latched, true, true);
  assert.equal(s.fire, true);
  s = stepAutoFire(s.latched, false, false);
  assert.equal(s.fire, true, 'still firing after release');
  s = stepAutoFire(s.latched, true, true);
  s = stepAutoFire(s.latched, false, false);
  assert.equal(s.fire, false, 'second press switches it off');
});

test('Slow game only changes the display clock', () => {
  assert.equal(displayClock(false), 1);
  assert.equal(displayClock(true), 0.8);
});

test('stored preferences parse safely', () => {
  assert.equal(parseDifficulty(null), 'normal');
  assert.equal(parseDifficulty('story'), 'story');
  assert.equal(parseDifficulty('nightmare'), 'normal');
  assert.deepEqual(parseAssist(null), { aim: false, autoFire: false, slow: false, hazardWarn: false });
  assert.deepEqual(parseAssist('{"aim":true,"slow":true,"x":1}'), { aim: true, autoFire: false, slow: true, hazardWarn: false });
  assert.deepEqual(parseAssist('{oops'), { aim: false, autoFire: false, slow: false, hazardWarn: false });
  for (const d of DIFFICULTIES_3D) assert.ok(difficultyNote(d).length > 10);
});

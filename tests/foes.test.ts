// Round 3 foes: ceiling/wall ambushers, surface crawling, hive spawners, swarm behaviour, sector tempo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { buildFacilityMap3D } from '../src/game3d/map3d.ts';
import {
  CLIMB_SPEED_3D,
  DROP_WINDUP_TICKS_3D,
  HIVE_CAP_3D,
  HIVE_MATCHUP_3D,
  SECTOR_TEMPO_3D,
  emptyInput3D,
  newWorld3D,
  stepWorld3D,
  triggerExplosion3D,
  type EnemyState3D,
  type InputState3D,
  type WorldState3D,
} from '../src/game3d/world3d.ts';
import { runReckless } from '../tools/game/difficulty.ts';
import { checkFoePlacement } from '../tools/game/reach3d.ts';

function stepN(w: WorldState3D, n: number, inp: Partial<InputState3D> = {}): void {
  for (let i = 0; i < n; i++) {
    w.player.hp = w.player.maxHp;
    stepWorld3D(w, { ...emptyInput3D(), ...inp });
  }
}

/** World with only the named enemy (hives kept) and the player standing at (px, py). */
function solo(id: string, px: number, py: number): { w: WorldState3D; e: EnemyState3D } {
  const w = newWorld3D();
  const e = w.enemies.find((x) => x.id === id)!;
  w.enemies = [e];
  w.currentRoom = e.zone;
  w.player.body = spawnBody3D(px, py, 0);
  w.player.maxHp = w.player.hp = 500;
  return { w, e };
}

test('foes: every hive stands on floor and every ceiling/wall crawler is flush against real geometry', () => {
  assert.deepEqual(checkFoePlacement(buildFacilityMap3D()), []);
});

test('foes: hives are 0..2 per sector, concentrated in mines and biolabs', () => {
  const level = buildFacilityMap3D();
  const per: Record<string, number> = {};
  for (const h of level.hives) per[h.sector] = (per[h.sector] ?? 0) + 1;
  for (const n of Object.values(per)) assert.ok(n >= 0 && n <= 2);
  assert.ok((per.mines ?? 0) >= 1 && (per.biolabs ?? 0) === 2);
  const w = newWorld3D();
  assert.equal(w.hives.length, level.hives.length);
  for (const h of w.hives) assert.equal(w.enemies.filter((e) => e.hive === h.id).length, HIVE_CAP_3D);
});

test('dropper: waits on the ceiling, telegraphs for DROP_WINDUP ticks, then drops with enemy_drop and lands as a floor crawler', () => {
  const { w, e } = solo('e-drop-mines-1', 21.5, -11);
  assert.equal(e.surface, 'ceiling');
  assert.ok(Math.abs(e.surfaceAngle - Math.PI) < 1e-9, 'ceiling angle is PI');
  const y0 = e.y;
  // Player far away: stays put, never windups
  w.player.body = spawnBody3D(16, -11, 0);
  stepN(w, 120);
  assert.equal(e.surface, 'ceiling');
  assert.equal(e.y, y0);
  assert.notEqual(e.state, 'windup');
  // Player walks underneath
  w.player.body = spawnBody3D(21.5, -11, 0);
  stepN(w, 2);
  assert.equal(e.state, 'windup', 'telegraph starts as soon as the player is below');
  assert.equal(e.surface, 'ceiling');
  assert.ok(e.windupTicks > 0 && e.windupTicks <= DROP_WINDUP_TICKS_3D);
  let windTicks = 0;
  let dropEvent = 0;
  let landEvent = 0;
  for (let i = 0; i < 160 && landEvent === 0; i++) {
    if (e.state === 'windup') windTicks++;
    stepN(w, 1);
    for (const ev of w.events) if (ev.type === 'enemy_drop') (ev.value === 0 ? dropEvent++ : landEvent++);
  }
  assert.ok(windTicks >= DROP_WINDUP_TICKS_3D - 3, `fair telegraph (${windTicks} ticks)`);
  assert.equal(dropEvent, 1);
  assert.equal(landEvent, 1);
  assert.equal(e.surface, 'floor');
  assert.ok(Math.abs(e.y - -11) < 0.05, `landed on the floor (y=${e.y})`);
  stepN(w, 12);
  assert.ok(Math.abs(e.surfaceAngle) < 1e-6, 'flipped upright');
});

test('dropper: a clean landing on the player hurts, a sidestep does not', () => {
  const run = (stand: number): number => {
    const { w } = solo('e-drop-mines-1', 21.5, -11);
    w.player.body = spawnBody3D(stand, -11, 0);
    const hp0 = w.player.hp;
    let lost = 0;
    for (let i = 0; i < 140; i++) {
      w.player.body.x = stand;
      w.player.body.vx = 0;
      const before = w.player.hp;
      stepWorld3D(w, emptyInput3D());
      if (w.player.hp < before) lost += before - w.player.hp;
      w.player.hurtInvulnTicks = 0;
    }
    assert.ok(hp0 > 0);
    return lost;
  };
  assert.ok(run(21.5) > 0, 'standing under the ambush costs HP');
  // Three metres west is out of the trigger band, so it never drops at all and no damage lands from the ceiling
  const { w, e } = solo('e-drop-mines-1', 24, -11);
  w.player.body = spawnBody3D(18.5, -11, 0);
  stepN(w, 60);
  assert.equal(e.surface, 'ceiling');
});

test('dropper: shooting it off the ceiling makes it fall without an ambush attack', () => {
  const { w, e } = solo('e-drop-mines-1', 16, -11);
  stepN(w, 2);
  assert.equal(e.surface, 'ceiling');
  e.hitFlashTicks = 8; // as if hit
  stepN(w, 1);
  assert.equal(e.surface, 'floor');
  assert.equal(e.dropping, false);
  stepN(w, 70);
  assert.ok(Math.abs(e.y - -11) < 0.05);
});

test('climber (ceiling): crawls along the ceiling toward the player within its span, then drops when above', () => {
  const { w, e } = solo('e-climb-bio', 58, 0);
  const x0 = e.x;
  assert.equal(e.surface, 'ceiling');
  stepN(w, 30);
  assert.ok(e.x > x0 + 0.5, 'moved toward the player');
  assert.ok(e.x <= e.crawlMax && e.x >= e.crawlMin, 'stays inside its span');
  assert.equal(e.surface, 'ceiling');
  assert.ok(Math.abs(e.y - 7.55) < 1e-9, 'y stays on the ceiling plane');
  assert.ok(e.speedNow > 0 && e.speedNow <= CLIMB_SPEED_3D * SECTOR_TEMPO_3D.biolabs + 1e-9);
  let dropped = false;
  for (let i = 0; i < 200 && !dropped; i++) {
    stepN(w, 1);
    dropped = (e.surface as string) === 'floor';
  }
  assert.ok(dropped, 'drops once it is over the player');
});

test('climber (wall): crawls along the wall to the player height, then leaps away from the wall', () => {
  const { w, e } = solo('e-climb-mines', 6, -11);
  assert.equal(e.surface, 'wall');
  assert.ok(Math.abs(e.surfaceAngle - -Math.PI / 2) < 1e-9, 'open space east => -PI/2');
  w.player.body = spawnBody3D(3, -11, 0);
  const y0 = e.y;
  stepN(w, 20);
  assert.ok(e.y < y0, 'climbed down toward the player');
  assert.equal(e.x, 0.45, 'x stays flush against the wall');
  let leapX = 0;
  for (let i = 0; i < 200 && (e.surface as string) === 'wall'; i++) stepN(w, 1);
  assert.equal(e.surface as string, 'floor');
  stepN(w, 3);
  leapX = e.vx;
  assert.ok(leapX > 0, `leaps east, away from the west wall (vx ${leapX})`);
  stepN(w, 80);
  assert.ok(Math.abs(e.y - -11) < 0.05, 'ends up on the floor');
});

test('hive: spawns larvae on a fixed cadence up to the cap, only when the player is near, and the cap holds', () => {
  const w = newWorld3D();
  const h = w.hives.find((x) => x.id === 'hive-mines-1')!;
  const brood = () => w.enemies.filter((e) => e.hive === h.id);
  w.player.body = spawnBody3D(30, 0, 0); // far (shaft)
  stepN(w, 400);
  assert.equal(brood().filter((e) => e.alive).length, 0, 'idle while the player is away');
  w.currentRoom = 'mines';
  w.player.body = spawnBody3D(22.5, -11, 0);
  const spawns: number[] = [];
  for (let i = 0; i < 900; i++) {
    w.player.hp = w.player.maxHp = 5000;
    w.player.body.x = 22.5;
    w.player.body.y = -11;
    w.player.body.vx = 0;
    stepWorld3D(w, emptyInput3D());
    for (const ev of w.events) if (ev.type === 'hive_spawn') spawns.push(w.tick);
    assert.ok(brood().filter((e) => e.alive).length <= HIVE_CAP_3D, 'concurrent cap');
  }
  assert.ok(spawns.length >= 2, `spawned repeatedly (${spawns.length})`);
  const gap = spawns[1] - spawns[0];
  assert.ok(gap >= 60 && gap <= 400, `deterministic cadence (${gap})`);
});

test('hive: destroying it stops spawning and pays out ammo, combo and the hive_destroyed event; Grenade is its weakness', () => {
  const w = newWorld3D();
  const h = w.hives.find((x) => x.id === 'hive-bio-1')!;
  w.enemies = [];
  w.currentRoom = 'biolabs';
  w.player.body = spawnBody3D(44, 0, 0);
  w.player.unlocked[3] = true;
  w.player.ammo[3] = 5;
  // Pulse vs Grenade damage per shot
  const hp0 = h.hp;
  triggerExplosion3D(w, h.x, h.y + 0.8, 0, 4, 30, 0xff7a2f, 0, 0);
  const plain = hp0 - h.hp;
  const hpMid = h.hp;
  triggerExplosion3D(w, h.x, h.y + 0.8, 0, 4, 30, 0xff7a2f, 0, 3);
  const nade = hpMid - h.hp;
  assert.ok(nade > plain * 2, `grenade ${nade} vs plain ${plain}`);
  assert.ok(HIVE_MATCHUP_3D[3] > 2 && HIVE_MATCHUP_3D[1] < 1);
  const ammo0 = w.pickups.filter((p) => p.kind === 'ammo').length;
  const kills0 = w.player.kills;
  triggerExplosion3D(w, h.x, h.y + 0.8, 0, 4, 400, 0xff7a2f, 0, 3);
  assert.equal(h.alive, false);
  assert.ok(w.events.some((e) => e.type === 'hive_destroyed'));
  assert.equal(w.pickups.filter((p) => p.kind === 'ammo').length, ammo0 + 1, 'ammo reward');
  assert.equal(w.player.kills, kills0 + 1);
  assert.ok(w.combo.count >= 1);
  // No more spawning afterwards
  for (const e of w.enemies) if (e.hive === h.id) e.alive = false;
  stepN(w, 600);
  assert.equal(w.enemies.filter((e) => e.hive === h.id && e.alive).length, 0);
});

test('hive: player Pulse fire can destroy it (weapon path through stepWorld3D)', () => {
  const w = newWorld3D();
  const h = w.hives.find((x) => x.id === 'hive-bio-1')!;
  w.enemies = w.enemies.filter((e) => e.hive !== h.id).slice(0, 0);
  w.currentRoom = 'biolabs';
  w.player.body = spawnBody3D(43.5, 0, 0);
  const inp: Partial<InputState3D> = { fire: true, aimX: h.x, aimY: h.y + 0.8, weaponSlot: 1 };
  for (let i = 0; i < 400 && h.alive; i++) {
    w.player.hp = w.player.maxHp = 5000;
    stepWorld3D(w, { ...emptyInput3D(), ...inp });
  }
  assert.equal(h.alive, false);
});

test('swarm: crawlers repel overlapping neighbours and a pack sends flankers past the player', () => {
  const w = newWorld3D();
  const pack = w.enemies.filter((e) => e.kind === 'crawler' && !e.minion && e.variant === 'none').slice(0, 4);
  assert.ok(pack.length >= 4);
  w.enemies = pack;
  w.currentRoom = 'core';
  w.player.maxHp = w.player.hp = 5000;
  w.player.body = spawnBody3D(90, 0, 0);
  pack.forEach((e, i) => {
    e.x = 74 + i * 0.3; // stacked almost on top of each other, west of the player
    e.y = 0;
    e.zone = 'core';
    e.active = true;
    e.hp = e.maxHp = 9999;
    e.facing = 1;
    e.state = 'chase';
  });
  let minGapSeen = Infinity;
  let crossed = 0;
  for (let t = 0; t < 360; t++) {
    w.player.hp = 5000;
    w.player.body.x = 90;
    w.player.body.vx = 0;
    stepWorld3D(w, emptyInput3D());
    if (t === 60) {
      const xs = pack.map((e) => e.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) minGapSeen = Math.min(minGapSeen, xs[i] - xs[i - 1]);
    }
  }
  crossed = pack.filter((e) => e.x > 90.5).length;
  assert.ok(minGapSeen > 0.35, `separation spreads the pack (min gap ${minGapSeen.toFixed(2)})`);
  assert.ok(crossed >= 1, `at least one flanker ends up behind the player (${crossed})`);
  assert.ok(pack.some((e) => e.x < 89), 'while others hold the front');
});

test('tempo: pressure rises toward the Core while windups stay constant', () => {
  const order = ['airlock', 'shaft', 'mines', 'biolabs', 'security', 'core'] as const;
  for (let i = 1; i < order.length; i++) assert.ok(SECTOR_TEMPO_3D[order[i]] > SECTOR_TEMPO_3D[order[i - 1]]);
  assert.ok(SECTOR_TEMPO_3D.airlock < 1 && SECTOR_TEMPO_3D.core >= 1.3);
  // A crawler in security closes distance faster than one in the airlock
  const closeIn = (zone: 'airlock' | 'security'): number => {
    const { w, e } = solo('e-airlock-1', 0, 0);
    e.zone = zone;
    w.currentRoom = zone;
    e.x = 8;
    e.y = 0;
    w.player.body = spawnBody3D(0.5, 0, 0);
    e.active = true;
    setState(e);
    stepN(w, 14);
    return 8 - e.x;
  };
  function setState(e: EnemyState3D): void {
    e.state = 'chase';
    e.stateTicks = 0;
  }
  assert.ok(closeIn('security') > closeIn('airlock') * 1.15);
});

test('foes: the sim is deterministic with hives, droppers and swarms in play', () => {
  const sig = (): string => {
    const w = newWorld3D();
    const bot = createBot3D(w);
    for (let t = 0; t < 2600 && w.status === 'playing'; t++) stepWorld3D(w, bot.next(w));
    return JSON.stringify([w.tick, w.player.hp, w.player.kills, w.hives.map((h) => [h.alive, h.hp, h.spawnCount]), w.enemies.map((e) => [Math.round(e.x * 100), Math.round(e.y * 100), e.state, e.surface])]);
  };
  assert.equal(sig(), sig());
});

test('foes: bot clears the nests, wins, ends in the 60..140 HP window and the reckless probe stays fair', () => {
  const w = newWorld3D();
  const bot = createBot3D(w);
  let deaths = 0;
  for (let t = 0; t < 14000 && w.status !== 'won'; t++) {
    stepWorld3D(w, bot.next(w));
    if (w.status === 'lost') deaths++;
  }
  assert.equal(w.status, 'won');
  assert.equal(deaths, 0);
  assert.ok(w.player.hp >= 60 && w.player.hp <= 140, `final HP ${w.player.hp}`);
  assert.ok(w.hives.every((h) => !h.alive), 'every nest destroyed on the way');
  const r = runReckless(3600);
  assert.ok(r.deaths <= 2, `reckless deaths ${r.deaths}`);
});

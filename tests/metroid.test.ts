// Round 5 Metroid systems: Crawl Slide, breakable blocks, map terminals and '?' markers, backtracking rewards,
// completion reachability, escape sequence beats and the final hatch, item pickups and the bot balance window.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITY_3D, hasHeadroom3D, spawnBody3D, stepBody3D, type Body3D } from '../src/engine/motion3d.ts';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { buildCollider3D, buildFacilityMap3D } from '../src/game3d/map3d.ts';
import type { Collider3D, MapSolid3D } from '../src/game3d/types3d.ts';
import {
  ESCAPE_BEATS_3D,
  MELTDOWN_TICKS,
  SEAL_FINAL_CLOSED_TICKS,
  SEAL_FINAL_ID,
  SEAL_FINAL_WARN_TICKS,
  emptyInput3D,
  escapeSealView3D,
  newWorld3D,
  respawnPlayer3D,
  stepWorld3D,
  type InputState3D,
  type WorldState3D,
} from '../src/game3d/world3d.ts';
import { EVENT_SOUND, cueForEvent } from '../src/ui/audioLogic.ts';
import { collectMinimapMarkers } from '../src/ui/minimap.ts';
import { Onboarding } from '../src/ui/flow.ts';
import {
  buildBreakChecks,
  buildCompletionLegs,
  checkBreakables,
  checkCompletion,
  checkEscapeFairness,
  checkTunnels,
  slideWalk,
  tunnelBypassable,
} from '../tools/game/reach3d.ts';

function box(id: string, minX: number, maxX: number, minY: number, maxY: number, kind: MapSolid3D['kind'] = 'catwalk'): MapSolid3D {
  return { id, minX, maxX, minY, maxY, minZ: -3, maxZ: 3, kind };
}
function col(solids: MapSolid3D[]): Collider3D {
  return { solids, pillars: [], ramps: [] };
}
const idle = { moveX: 0, moveZ: 0, jump: false, dash: false, aimDirX: 1, aimDirZ: 0 };
function place(w: WorldState3D, x: number, y: number): void {
  w.player.body = spawnBody3D(x, y, 0);
}
function stepN(w: WorldState3D, n: number, inp: Partial<InputState3D> = {}): void {
  for (let i = 0; i < n; i++) stepWorld3D(w, { ...emptyInput3D(), ...inp });
}
function eventsOf(w: WorldState3D, type: string): number {
  return w.events.filter((e) => e.type === type).length;
}
function runBot(): WorldState3D {
  let w = newWorld3D();
  const bot = createBot3D(w);
  for (let t = 0; t < 24000 && w.status === 'playing'; t++) w = stepWorld3D(w, bot.next(w));
  return w;
}

// ---------------------------------------------------------------- Crawl Slide (motion3d)

/** Floor y=0, a lintel hanging down to y=1.0 over x 4..9 (a 1.0 m tunnel), open room either side. */
const tunnelCol = (): Collider3D => col([box('floor', -20, 40, -1, 0), box('lintel', 4, 9, 1.0, 6, 'wall')]);

test('crawl slide: ground dash + S starts a slide, a low body fits a 1.0 m tunnel and a standing body does not', () => {
  const c = tunnelCol();
  const slideIn = { ...idle, moveX: 1, dash: true, dropDown: true, crawlSlide: true };
  let b = spawnBody3D(0, 0, 0);
  b = stepBody3D(b, slideIn, c);
  assert.equal(b.sliding, true);
  assert.equal(b.slideStarted, true);
  for (let i = 0; i < 200 && b.x < 9.6; i++) b = stepBody3D(b, slideIn, c);
  assert.ok(b.x > 9.6, `slid through the tunnel, x=${b.x}`);
  // A standing player is stopped by the lintel
  let s = spawnBody3D(0, 0, 0);
  for (let i = 0; i < 90; i++) s = stepBody3D(s, { ...idle, moveX: 1 }, c);
  assert.ok(s.x < 4 - ABILITY_3D.radius + 0.01, `standing body blocked, x=${s.x}`);
  // So is a dash without the module, and S + dash without the module is only a dash
  let d = spawnBody3D(0, 0, 0);
  for (let i = 0; i < 90; i++) d = stepBody3D(d, { ...idle, moveX: 1, dash: true, dropDown: true }, c);
  assert.ok(d.x < 4, `no module, no slide, x=${d.x}`);
  assert.equal(d.sliding, false);
});

test('crawl slide: the body stays low while the tunnel is overhead, crawls at input speed, and stands only with headroom', () => {
  const c = tunnelCol();
  let b = spawnBody3D(2.6, 0, 0);
  b = stepBody3D(b, { ...idle, moveX: 1, dash: true, dropDown: true, crawlSlide: true }, c);
  for (let i = 0; i < ABILITY_3D.slideTicks + 4; i++) b = stepBody3D(b, { ...idle, moveX: 0, crawlSlide: true }, c);
  // Still under the lintel: the fast phase is over but the body cannot stand
  if (b.x > 4 - 0.3 && b.x < 9 + 0.3) {
    assert.equal(b.sliding, true, 'low while the lintel is overhead');
    assert.equal(hasHeadroom3D(b.x, b.y, b.z, c), false);
    const x0 = b.x;
    for (let i = 0; i < 30; i++) b = stepBody3D(b, { ...idle, moveX: 1, crawlSlide: true }, c);
    assert.ok(b.x > x0 + 1.5 && b.x < x0 + 3.0, `crawl speed ${ABILITY_3D.crawlSpeed} m/s, moved ${b.x - x0}`);
  }
  for (let i = 0; i < 200; i++) b = stepBody3D(b, { ...idle, moveX: 1, crawlSlide: true }, c);
  assert.equal(b.sliding, false, 'stands up once clear of the lintel');
  assert.ok(b.x > 9.3);
});

test('crawl slide: slide does not start in the air, on cooldown, or from a stomp input, and a wall beside the body never blocks standing', () => {
  const c = col([box('floor', -20, 40, -1, 0), box('wall', 5, 6, 0, 6, 'wall')]);
  let air = spawnBody3D(0, 3, 0);
  air.grounded = false;
  air = stepBody3D(air, { ...idle, moveX: 1, dash: true, dropDown: true, crawlSlide: true }, c);
  assert.equal(air.sliding, false, 'airborne dash + S is the stomp, not a slide');
  assert.equal(air.stomping, true);
  // Slide, then stop beside the wall: still headroom, so the body stands
  let b = spawnBody3D(3.0, 0, 0);
  b = stepBody3D(b, { ...idle, moveX: 1, dash: true, dropDown: true, crawlSlide: true }, c);
  for (let i = 0; i < 60; i++) b = stepBody3D(b, { ...idle, moveX: 1, crawlSlide: true }, c);
  assert.equal(b.sliding, false, 'a wall at the side is not a ceiling');
  // Jump cancels a slide when there is room
  let j = spawnBody3D(0, 0, 0);
  j = stepBody3D(j, { ...idle, moveX: 1, dash: true, dropDown: true, crawlSlide: true }, c);
  j = stepBody3D(j, { ...idle, moveX: 1, jump: true, crawlSlide: true }, c);
  assert.equal(j.sliding, false);
  assert.ok(j.vy > 0, 'slide-jump leaves the ground');
});

test('crawl slide: slide drops no one through a one-way platform and re-slide waits for the cooldown', () => {
  const c = col([box('plat', -20, 40, -0.28, 0, 'platform'), box('under', -20, 40, -3, -2.9)]);
  let b = spawnBody3D(0, 0, 0);
  for (let i = 0; i < 12; i++) b = stepBody3D(b, { ...idle, moveX: 1, dash: true, dropDown: true, crawlSlide: true }, c);
  assert.equal(b.y, 0, 'sliding on a platform does not drop through it');
  assert.ok(b.slideTicks < ABILITY_3D.slideTicks);
});

// ---------------------------------------------------------------- tunnels in the real map

test('map: two crawl tunnels (a reward and a shortcut) that need the Crawl Slide, with no bypass', () => {
  const level = buildFacilityMap3D();
  assert.deepEqual(level.tunnels.map((t) => t.purpose).sort(), ['reward', 'shortcut']);
  assert.deepEqual(checkTunnels(level), []);
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  for (const t of level.tunnels) {
    const to = { x: t.exit.x, y: t.exit.y, tolX: 0.7, tolY: 0.5 };
    assert.deepEqual(tunnelBypassable(level, doors, t.approach, to), [], `${t.id}: sealed without the module`);
    const r = slideWalk(spawnBody3D(t.approach.x, t.approach.y, 0), to, level, doors, 1, true, 900);
    assert.ok(r.reached, `${t.id}: crossable with the module even without boots`);
  }
});

test('world: Crawl Slide module is gated behind pickup, fires the slide event and takes the player through the Underfloor Duct', () => {
  const w = newWorld3D();
  const mod = w.level.upgrades.find((u) => u.kind === 'crawl_slide')!;
  assert.ok(mod, 'a crawl_slide pedestal exists');
  assert.equal(w.player.abilities.crawlSlide, false);
  // Without the module the same inputs do nothing
  const tn = w.level.tunnels.find((t) => t.id === 'tun-underfloor')!;
  place(w, tn.approach.x, tn.approach.y);
  stepN(w, 120, { moveX: -1, dash: true, dropDown: true });
  assert.ok(w.player.body.x > 20, `blocked at the mouth, x=${w.player.body.x}`);
  // Pick it up
  place(w, mod.x, mod.y);
  stepN(w, 1);
  assert.equal(w.player.abilities.crawlSlide, true);
  assert.ok(w.collectedUpgrades.has('crawl_slide'));
  assert.ok(w.events.some((e) => e.type === 'upgrade'));
  // Now slide through the duct to the Energy Tank
  place(w, tn.approach.x, tn.approach.y);
  let slid = 0;
  for (let i = 0; i < 400 && !w.collectedUpgrades.has('etank_underfloor'); i++) {
    stepWorld3D(w, { ...emptyInput3D(), moveX: -1, dash: true, dropDown: true });
    slid += eventsOf(w, 'slide');
  }
  assert.ok(slid >= 1, 'slide event raised');
  assert.ok(w.collectedUpgrades.has('etank_underfloor'), 'Energy Tank 3 reached');
  assert.equal(w.player.energyTanks, 1);
  assert.equal(w.player.maxHp, 130);
});

// ---------------------------------------------------------------- breakable blocks

test('breakables: a stomp breaks the Core slab, other stomps and other weapons do not, and the Core Cache counts as a secret', () => {
  const w = newWorld3D();
  const slab = w.level.solids.find((s) => s.id === 'stomp-core')!;
  assert.equal(slab.breakBy, 'stomp');
  // A stomp elsewhere does nothing to it
  place(w, 80, 4);
  w.player.body.grounded = false;
  stepN(w, 60, { dash: true, dropDown: true });
  assert.equal(w.openDoors.has('break_stomp_core'), false);
  // Weapons do not break a stomp floor
  place(w, 90, 0);
  w.player.unlocked[3] = true;
  w.player.ammo[3] = 3;
  stepN(w, 1, { fire: true, weaponSlot: 3, aimX: 96, aimY: -0.2 });
  stepN(w, 120, { aimX: 96, aimY: -0.2 });
  assert.equal(w.openDoors.has('break_stomp_core'), false, 'grenades do not break the stomp floor');
  // Stomp onto the slab
  place(w, 96, 4);
  w.player.body.grounded = false;
  let broke = 0;
  for (let i = 0; i < 90 && !w.openDoors.has('break_stomp_core'); i++) {
    stepWorld3D(w, { ...emptyInput3D(), dash: true, dropDown: true });
    broke += w.events.filter((e) => e.type === 'block_break' && e.value === 0).length;
  }
  assert.ok(w.openDoors.has('break_stomp_core'), 'the stomp breaks the slab');
  assert.equal(broke, 1);
  assert.ok(w.secretsFound.includes('secret_core_cache'));
  assert.equal(buildCollider3D(w.level, w.openDoors).isSolidActive!(slab), false);
  // The player is now in the cache hole and can take the expansion
  stepN(w, 90);
  place(w, 97.5, -3.4);
  stepN(w, 1);
  assert.ok(w.collectedUpgrades.has('ammo_ex_core'));
});

test('breakables: Rail plates break only to the Rail-Cannon, the shot ends on the plate and a secret is counted', () => {
  const w = newWorld3D();
  const plate = w.level.solids.find((s) => s.id === 'plate-mines')!;
  assert.equal(plate.breakBy, 'rail');
  // Pulse and grenades leave it alone
  place(w, 3, -8.6);
  w.player.unlocked[1] = true;
  stepN(w, 1, { fire: true, weaponSlot: 1, aimX: -3, aimY: -7.5 });
  stepN(w, 60, { aimX: -3, aimY: -7.5 });
  assert.equal(w.openDoors.has('break_plate_mines'), false);
  w.player.unlocked[3] = true;
  w.player.ammo[3] = 5;
  stepN(w, 1, { fire: true, weaponSlot: 3, aimX: -3, aimY: -7.5 });
  stepN(w, 100, { aimX: -3, aimY: -7.5 });
  assert.equal(w.openDoors.has('break_plate_mines'), false, 'grenades do not break rail plates');
  // The Rail-Cannon does
  w.player.unlocked[4] = true;
  w.player.ammo[4] = 5;
  stepN(w, 50);
  for (let i = 0; i < 3; i++) stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: true, aimX: -3, aimY: -7.5 });
  stepWorld3D(w, { ...emptyInput3D(), weaponSlot: 4, fire: false, aimX: -3, aimY: -7.5 });
  assert.ok(w.openDoors.has('break_plate_mines'), 'a rail shot shatters the plate');
  assert.ok(w.secretsFound.includes('secret_mines_pocket'));
  assert.ok(w.events.some((e) => e.type === 'block_break' && e.value === 1));
  // Walking in and picking up the expansion refills the recharge level
  place(w, -4, -8.6);
  stepN(w, 1);
  assert.ok(w.collectedUpgrades.has('ammo_ex_mines'));
  assert.equal(w.player.ammoExpansions, 1);
});

test('breakables: the shortcut plate opens a Bio-Labs <-> Shaft passage and every break check passes', () => {
  const level = buildFacilityMap3D();
  assert.equal(level.solids.filter((s) => s.breakId).length, 4);
  assert.deepEqual(checkBreakables(level), []);
  const ids = buildBreakChecks().map((c) => c.breakId).sort();
  assert.deepEqual(ids, ['break_lean_security', 'break_plate_mines', 'break_plate_shaft', 'break_stomp_core']);
  // Cracks are markers: every breakable is dynamic so the renderer draws it separately, with an emissive seam colour
  for (const s of level.solids.filter((x) => x.breakId)) {
    assert.equal(s.dynamic, true);
    assert.ok(s.emissive, `${s.id} carries a seam colour`);
  }
});

// ---------------------------------------------------------------- map terminals and markers

test('map terminal: F next to it reveals the sector once; out of range, or without F, nothing happens', () => {
  const w = newWorld3D();
  assert.equal(w.level.mapStations.length, 6);
  assert.deepEqual([...new Set(w.level.mapStations.map((m) => m.sector))].sort(), ['airlock', 'biolabs', 'core', 'mines', 'security', 'shaft']);
  const m = w.level.mapStations.find((s) => s.sector === 'shaft')!;
  place(w, m.x, m.y);
  stepN(w, 5);
  assert.deepEqual(w.mapRevealed, [], 'standing near is not enough');
  place(w, m.x + 6, m.y);
  stepN(w, 1, { interact: true });
  assert.deepEqual(w.mapRevealed, []);
  place(w, m.x, m.y);
  stepWorld3D(w, { ...emptyInput3D(), interact: true });
  assert.deepEqual(w.mapRevealed, ['shaft']);
  assert.equal(eventsOf(w, 'map_reveal'), 1);
  assert.match(w.hint, /MAP DATA/);
  stepWorld3D(w, { ...emptyInput3D(), interact: true });
  assert.equal(eventsOf(w, 'map_reveal'), 0, 'one reveal per sector');
});

test('map terminal: onboarding shows a hint near an unused terminal, and the slide hint near a tunnel once the module is owned', () => {
  const w = newWorld3D();
  const ob = new Onboarding();
  const m = w.level.mapStations[0];
  place(w, m.x, m.y);
  assert.equal(ob.update(w)?.id, 'map');
  w.mapRevealed.push(m.sector);
  assert.notEqual(ob.update(w)?.id, 'map');
  w.player.abilities.crawlSlide = true;
  const tn = w.level.tunnels[0];
  place(w, tn.approach.x, tn.approach.y);
  assert.equal(ob.update(w)?.id, 'slide');
});

test("minimap markers: '?' for every untaken item, log, weapon and unfound secret, and they disappear when found", () => {
  const w = newWorld3D();
  const all = collectMinimapMarkers(w);
  assert.equal(all.filter((m) => m.kind === 'secret').length, 5);
  assert.equal(all.filter((m) => m.kind === 'item').length, 7 + 6 + 5, 'upgrades + logs + weapon pedestals');
  w.collectedUpgrades.add('thruster_boots');
  w.collectibles[0].taken = true;
  w.secretsFound.push('secret_alcove');
  w.pickups.find((p) => p.kind === 'weapon')!.taken = true;
  const after = collectMinimapMarkers(w);
  assert.equal(after.length, all.length - 4);
  // Secret markers sit on the block that hides them
  const sec = collectMinimapMarkers(newWorld3D()).filter((m) => m.kind === 'secret');
  const core = sec.find((m) => m.x > 94 && m.x < 98)!;
  assert.ok(core && Math.abs(core.y + 0.6) < 0.7, 'core cache marker on the stomp slab');
});

// ---------------------------------------------------------------- backtracking rewards and completion

test('rewards: Energy Tank 3, two ammo expansions and the module raise completion to 100% over the full path', () => {
  const w = newWorld3D();
  assert.equal(w.level.upgrades.filter((u) => u.kind === 'energy_tank').length, 3);
  assert.equal(w.level.upgrades.filter((u) => u.kind === 'ammo_expansion').length, 2);
  stepN(w, 1);
  assert.equal(w.completion.total, 6 + 5 + 7 + 5);
  // Take every collectible by standing on it
  for (const u of w.level.upgrades) {
    place(w, u.x, u.y);
    stepN(w, 1);
  }
  for (const l of w.collectibles) {
    place(w, l.x, l.y);
    stepN(w, 1);
  }
  for (const p of w.pickups.filter((q) => q.kind === 'weapon')) {
    place(w, p.x, p.y);
    stepN(w, 1);
  }
  for (const sr of w.level.secrets) {
    const s = w.level.solids.find((x) => x.doorId === sr.doorId || x.breakId === sr.doorId)!;
    w.openDoors.add(s.breakId ?? s.doorId!);
    if (!w.secretsFound.includes(sr.id)) w.secretsFound.push(sr.id);
  }
  stepN(w, 1);
  assert.equal(w.completion.found, w.completion.total);
  assert.equal(w.completion.percent, 100);
  assert.equal(w.player.energyTanks, 3);
  assert.equal(w.player.maxHp, 190);
  assert.equal(w.player.ammoExpansions, 2);
});

test('rewards: an ammo expansion raises the Save/Recharge refill level by half the starting ammo', () => {
  const w = newWorld3D();
  w.player.unlocked[2] = true;
  w.player.unlocked[3] = true;
  w.player.unlocked[4] = true;
  const st = w.level.saveStations[0];
  place(w, st.x, st.y);
  stepN(w, 1);
  assert.deepEqual([w.player.ammo[2], w.player.ammo[3], w.player.ammo[4]], [28, 14, 10]);
  w.player.ammoExpansions = 2;
  w.player.ammo[2] = 0;
  w.saveCooldown = 0;
  place(w, st.x, st.y);
  stepWorld3D(w, { ...emptyInput3D(), interact: true });
  assert.deepEqual([w.player.ammo[2], w.player.ammo[3], w.player.ammo[4]], [56, 28, 20]);
});

test('completion path: every collectible has a verified route (reach3d completion legs)', () => {
  const level = buildFacilityMap3D();
  assert.deepEqual(checkCompletion(level), []);
  const labels = buildCompletionLegs(level).map((l) => l.label);
  for (const id of ['crawl_slide', 'etank_underfloor', 'ammo_ex_mines', 'ammo_ex_core']) assert.ok(labels.some((l) => l.startsWith(id)), `${id} has a leg`);
});

// ---------------------------------------------------------------- escape sequence

test('escape beats: sector bulkhead warnings fire once each in order, the final hatch warns, then shuts, and the clock reset reopens it', () => {
  const w = newWorld3D();
  w.coreDestroyed = true;
  w.phase = 'escape';
  w.meltdownTicks = MELTDOWN_TICKS;
  place(w, 40, 0);
  w.player.hp = 100000;
  w.player.maxHp = 100000;
  const warns: number[] = [];
  let closes = 0;
  let closedAt = -1;
  for (let i = 0; i < MELTDOWN_TICKS - 5 && w.status === 'playing'; i++) {
    w.player.hp = w.player.maxHp;
    stepWorld3D(w, emptyInput3D());
    for (const e of w.events) if (e.type === 'seal_warn') warns.push(e.value ?? -1);
    closes += eventsOf(w, 'seal_close');
    if (closedAt < 0 && w.openDoors.has(SEAL_FINAL_ID)) closedAt = w.meltdownTicks;
  }
  assert.deepEqual(warns, [0, 1, 2, 3, 4]);
  assert.equal(closes, 1);
  assert.equal(closedAt, SEAL_FINAL_CLOSED_TICKS);
  assert.ok(ESCAPE_BEATS_3D.length === 5 && ESCAPE_BEATS_3D[4].at === SEAL_FINAL_WARN_TICKS);
  assert.ok(SEAL_FINAL_WARN_TICKS - SEAL_FINAL_CLOSED_TICKS >= 180, 'at least 3 s of visible warning before the shutter is solid');
  // A restarted clock (death at 0, respawn) reopens the hatch
  w.meltdownTicks = MELTDOWN_TICKS;
  stepN(w, 1);
  assert.equal(w.openDoors.has(SEAL_FINAL_ID), false);
  assert.deepEqual(escapeSealView3D(w), { progress: 0, closed: false, warning: false });
});

test('escape hatch: the shut shutter blocks the balcony route and an open one does not', () => {
  const w = newWorld3D();
  w.coreDestroyed = true;
  w.phase = 'escape';
  w.openDoors.add('door_escape');
  w.meltdownTicks = SEAL_FINAL_CLOSED_TICKS + 1;
  place(w, 16, 5.2);
  stepWorld3D(w, { ...emptyInput3D(), moveX: -1 });
  assert.equal(w.openDoors.has(SEAL_FINAL_ID), true);
  stepN(w, 120, { moveX: -1 });
  assert.ok(w.player.body.x > 11.6 + ABILITY_3D.radius - 0.2, `held back by the shutter, x=${w.player.body.x}`);
  // Same walk with the shutter open reaches the exit
  const v = newWorld3D();
  v.coreDestroyed = true;
  v.phase = 'escape';
  v.openDoors.add('door_escape');
  v.meltdownTicks = SEAL_FINAL_WARN_TICKS + 600;
  place(v, 16, 5.2);
  stepN(v, 150, { moveX: -1 });
  assert.equal(v.status, 'won');
});

test('escape fairness: the walking route leaves 20+ s before the shutter shuts, and the bot arrives far earlier', () => {
  const level = buildFacilityMap3D();
  const f = checkEscapeFairness(level);
  assert.deepEqual(f.problems, []);
  assert.ok(f.spareTicks >= 20 * 60);
  const w = runBot();
  assert.equal(w.status, 'won');
  assert.ok(w.meltdownTicks > SEAL_FINAL_CLOSED_TICKS + 20 * 60, `bot finished with ${w.meltdownTicks} ticks left`);
});

// ---------------------------------------------------------------- audio mapping, determinism, balance

test('events: every new event has a sound and a retuned cue', () => {
  for (const t of ['slide', 'block_break', 'map_reveal', 'seal_warn', 'seal_close'] as const) {
    assert.ok(EVENT_SOUND[t], `${t} mapped`);
    const c = cueForEvent({ type: t, value: 4 });
    assert.equal(c.id, EVENT_SOUND[t]);
    assert.ok(c.pitch > 0 && c.gain > 0);
  }
  assert.ok(cueForEvent({ type: 'slide' }).pitch < 1, 'slide is a low whoosh');
  assert.ok(cueForEvent({ type: 'seal_close' }).pitch < cueForEvent({ type: 'seal_warn', value: 4 }).pitch);
});

test('determinism: slide, breaks and terminals replay identically (no Math.random in the new systems)', () => {
  const run = (): string => {
    const w = newWorld3D();
    const tn = w.level.tunnels[0];
    w.player.abilities.crawlSlide = true;
    place(w, tn.approach.x, tn.approach.y);
    stepN(w, 200, { moveX: -1, dash: true, dropDown: true });
    place(w, 96, 4);
    w.player.body.grounded = false;
    stepN(w, 60, { dash: true, dropDown: true });
    const m = w.level.mapStations[0];
    place(w, m.x, m.y);
    stepN(w, 3, { interact: true });
    return JSON.stringify({ b: w.player.body, o: [...w.openDoors].sort(), r: w.mapRevealed, c: w.completion });
  };
  assert.equal(run(), run());
});

test('bot: still wins the main path, final HP window and deaths hold, and the optional module does not change the route', () => {
  const w = runBot();
  assert.equal(w.status, 'won');
  assert.ok(w.player.hp >= 60 && w.player.hp <= 140, `final HP ${w.player.hp}`);
  assert.ok(w.run.deaths <= 1, `deaths ${w.run.deaths}`);
  assert.equal(w.visitedRooms.length, 6);
  // The main path never needs the module, breakables, or hatches
  assert.equal(w.player.abilities.crawlSlide, false);
  assert.equal(w.openDoors.has('break_plate_mines'), false);
  const again = runBot();
  assert.equal(again.tick, w.tick);
  assert.equal(again.player.hp, w.player.hp);
});

test('R3.3: the new systems never read the headlamp', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['src/render3d/metroid3d.ts', 'src/ui/minimap.ts']) {
    assert.ok(!/\.light\b/.test(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')), `${f} must not read the light`);
  }
});

test('type contract: Body3D carries the slide fields and the collider honours break and seal ids', () => {
  const b: Body3D = spawnBody3D(0, 0, 0);
  assert.equal(b.sliding, false);
  assert.equal(b.slideTicks, 0);
  const level = buildFacilityMap3D();
  const open = new Set<string>();
  const c = buildCollider3D(level, open);
  const shutter = level.solids.find((s) => s.sealId)!;
  const plate = level.solids.find((s) => s.breakId === 'break_plate_shaft')!;
  assert.equal(c.isSolidActive!(shutter), false, 'shutter open by default');
  assert.equal(c.isSolidActive!(plate), true);
  open.add(SEAL_FINAL_ID).add('break_plate_shaft');
  assert.equal(c.isSolidActive!(shutter), true);
  assert.equal(c.isSolidActive!(plate), false);
  respawnPlayer3D(newWorld3D()); // no-op when not lost
});

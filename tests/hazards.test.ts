import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { crusherBottomY, hazardClock, hazardHits, hazardPhase, hazardSafeWindow } from '../src/game3d/hazards.ts';
import { emptyInput3D, hazardNowTick3D, MELTDOWN_TICKS, newWorld3D, respawnPlayer3D, stepWorld3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { checkHazardLayout, checkHazardRoute } from '../tools/game/reach3d.ts';

const hz = (w: WorldState3D, id: string) => w.level.hazards.find((h) => h.id === id)!;
function quiet(w: WorldState3D): void {
  for (const e of w.enemies) if (!e.id.startsWith('e-lift-') || w.elevators[0].waveDone === false) e.alive = false;
  for (const h of w.hives) h.alive = false;
}
function place(w: WorldState3D, x: number, y: number): void {
  quiet(w);
  w.player.body = spawnBody3D(x, y, 0);
  w.player.hurtInvulnTicks = 0;
}
/** Advance until the hazard clock hits `phase` (stops on the first tick of that phase). */
function runToPhase(w: WorldState3D, id: string, phase: string): void {
  const h = hz(w, id);
  for (let i = 0; i < h.period * 2 && hazardPhase(h, hazardNowTick3D(w, h)) !== phase; i++) {
    stepWorld3D(w, emptyInput3D());
    w.player.hp = w.player.maxHp;
  }
  assert.equal(hazardPhase(h, hazardNowTick3D(w, h)), phase);
}

test('hazard cycle: phases partition the period with the declared lengths', () => {
  for (const h of newWorld3D().level.hazards) {
    const counts = { idle: 0, telegraph: 0, active: 0, recover: 0 };
    for (let t = 0; t < h.period; t++) counts[hazardPhase(h, t)]++;
    assert.equal(counts.telegraph, h.telegraph, h.id);
    assert.equal(counts.active, h.active, h.id);
    assert.equal(counts.recover, h.recover, h.id);
    assert.equal(counts.idle, h.period - h.telegraph - h.active - h.recover, h.id);
    assert.ok(h.telegraph >= 30, `${h.id} telegraph is at least half a second`);
    assert.equal(hazardClock(h, 5), hazardClock(h, 5 + h.period));
  }
});

test('hazard layout and timed routes pass reach3d checks', () => {
  assert.deepEqual(checkHazardLayout(newWorld3D().level), []);
  assert.deepEqual(checkHazardRoute(newWorld3D().level), []);
});

test('every hazard leaves a safe window long enough to cross', () => {
  for (const h of newWorld3D().level.hazards) assert.ok(hazardSafeWindow(h) >= 70, h.id);
});

test('steam vent: warning event first, damage and knock only while bursting', () => {
  const w = newWorld3D();
  const h = hz(w, 'hz-mines-vent');
  place(w, h.x, h.y);
  runToPhase(w, h.id, 'idle');
  place(w, h.x, h.y);
  const hp = w.player.hp;
  stepWorld3D(w, emptyInput3D());
  assert.equal(w.player.hp, hp, 'no damage while idle');
  runToPhase(w, h.id, 'telegraph');
  assert.ok(w.events.some((e) => e.type === 'hazard_vent' && e.value === 0), 'warning hiss');
  place(w, h.x, h.y);
  stepWorld3D(w, emptyInput3D());
  assert.equal(w.player.hp, w.player.maxHp, 'warning phase is harmless');
  runToPhase(w, h.id, 'active');
  assert.ok(w.events.some((e) => e.type === 'hazard_vent' && e.value === 1), 'burst event');
  place(w, h.x + 0.2, h.y);
  const before = w.player.hp;
  stepWorld3D(w, emptyInput3D());
  assert.equal(before - w.player.hp, h.damage);
  assert.ok(w.player.body.vy > 0 || !w.player.body.grounded, 'popped into the air');
  assert.ok(w.player.body.vx > 0, 'knocked away from the vent');
});

test('dash i-frames pass through a steam burst unharmed', () => {
  const w = newWorld3D();
  const h = hz(w, 'hz-mines-vent');
  runToPhase(w, h.id, 'active');
  place(w, h.x, h.y);
  w.player.dashInvulnTicks = 6;
  const before = w.player.hp;
  stepWorld3D(w, emptyInput3D());
  assert.equal(w.player.hp, before);
});

test('crusher: piston warns by lowering, then slams for heavy damage', () => {
  const w = newWorld3D();
  const h = hz(w, 'hz-mines-crusher');
  const rest = crusherBottomY(h, hazardNowTick3D(w, h) + 0);
  place(w, h.x - 5, h.y);
  runToPhase(w, h.id, 'telegraph');
  const t0 = hazardNowTick3D(w, h);
  assert.ok(w.events.some((e) => e.type === 'hazard_crush' && e.value === 0));
  assert.ok(crusherBottomY(h, t0 + h.telegraph - 1) < crusherBottomY(h, t0), 'piston lowers during the warning');
  assert.ok(crusherBottomY(h, t0 + h.telegraph - 1) > h.y + 1.82 + 2.2, 'warning stays clear of a jumping player');
  place(w, h.x, h.y);
  stepWorld3D(w, emptyInput3D());
  assert.equal(w.player.hp, w.player.maxHp, 'standing under a warning piston is safe');
  runToPhase(w, h.id, 'active');
  place(w, h.x, h.y);
  for (let i = 0; i < 8; i++) stepWorld3D(w, emptyInput3D());
  assert.equal(w.player.hp, w.player.maxHp - h.damage);
  assert.ok(h.damage >= 30, 'crush is a big hit');
  assert.ok(rest > crusherBottomY(h, t0 + h.telegraph + 10));
  assert.ok(!hazardHits(h, t0 + h.telegraph + 10, h.x + 3, h.y), 'outside the column is safe');
});

test('laser grid: beam on/off events, damage only while on, console shuts it down', () => {
  const w = newWorld3D();
  const h = hz(w, 'hz-sec-laser');
  place(w, h.x - 4, h.y);
  runToPhase(w, h.id, 'active');
  assert.ok(w.events.some((e) => e.type === 'laser_on'));
  place(w, h.x, h.y);
  const hp = w.player.hp;
  stepWorld3D(w, emptyInput3D());
  assert.equal(hp - w.player.hp, h.damage);
  place(w, h.x - 4, h.y);
  for (let i = 0; i < h.active + 2; i++) stepWorld3D(w, emptyInput3D());
  place(w, h.x, h.y);
  stepWorld3D(w, emptyInput3D());
  assert.equal(w.player.hp, hp - h.damage, 'no damage while the grid is off');
  // Console online: the grid never fires again
  w.consoleUnlocked = true;
  assert.equal(hazardNowTick3D(w, h), -1);
  for (let i = 0; i < h.period; i++) {
    place(w, h.x, h.y);
    stepWorld3D(w, emptyInput3D());
  }
  assert.equal(w.player.hp, hp - h.damage);
});

test('hazards hurt enemies in the column once per burst', () => {
  const w = newWorld3D();
  const h = hz(w, 'hz-core-vent-1');
  const e = w.enemies.find((x) => x.id === 'e-core-1')!;
  e.x = h.x;
  e.y = h.y;
  const hp = e.hp;
  runToPhase(w, h.id, 'active');
  assert.ok(e.hp < hp || !e.alive);
});

test('barrels chain: the Bio-Labs cluster detonates together and announces itself', () => {
  const w = newWorld3D();
  const a = w.barrels.find((b) => b.id === 'brl-bio-3')!;
  const b = w.barrels.find((x) => x.id === 'brl-bio-4')!;
  const c = w.barrels.find((x) => x.id === 'brl-bio-2')!;
  place(w, 40, 0);
  a.fuseTicks = 1;
  let blasts = 0;
  for (let i = 0; i < 40; i++) {
    stepWorld3D(w, emptyInput3D());
    blasts += w.events.filter((e) => e.type === 'barrel_explode').length;
  }
  assert.ok(!a.alive && !b.alive && !c.alive, 'chain reaction reached the third barrel');
  assert.equal(blasts, 3);
});

test('switch: a pulse shot opens the Bio-Labs gantry and F works too', () => {
  const w = newWorld3D();
  const sw = w.level.switches[0];
  const bridge = w.level.solids.find((s) => s.bridgeId === sw.opens)!;
  assert.ok(bridge);
  place(w, sw.x - 3, 0);
  assert.ok(!w.openDoors.has(sw.opens));
  const inp = emptyInput3D();
  inp.fire = true;
  inp.aimX = sw.x;
  inp.aimY = sw.y;
  for (let i = 0; i < 30 && !w.switches[0].on; i++) stepWorld3D(w, inp);
  assert.ok(w.switches[0].on, 'shot flips the switch');
  assert.ok(w.openDoors.has(sw.opens));
  const w2 = newWorld3D();
  place(w2, sw.x - 1, 0);
  const f = emptyInput3D();
  f.interact = true;
  stepWorld3D(w2, f);
  assert.ok(w2.switches[0].on, 'F flips it');
  assert.ok(w2.events.some((e) => e.type === 'switch_on'));
});

test('lowered gantry carries the player over the acid and removes the damage', () => {
  const w = newWorld3D();
  w.openDoors.add('bridge_bio');
  w.enemies.forEach((e) => (e.alive = false));
  place(w, 49.5, 0);
  const inp = emptyInput3D();
  inp.moveX = 1;
  for (let i = 0; i < 90; i++) {
    stepWorld3D(w, inp);
    w.enemies.forEach((e) => (e.alive = false));
  }
  assert.ok(w.player.body.x > 56, 'crossed the basin');
  assert.ok(Math.abs(w.player.body.y) < 0.05, 'on the gantry, not in the acid');
  assert.equal(w.player.hp, w.player.maxHp);
});

test('elevator: dwell, ride carries the player, ambush wave appears, empty return', () => {
  const w = newWorld3D();
  const sp = w.level.elevators[0];
  w.enemies.forEach((e) => { if (!e.id.startsWith('e-lift-')) e.alive = false; });
  place(w, 30.9, -11);
  assert.ok(w.enemies.filter((e) => e.id.startsWith('e-lift-')).every((e) => !e.alive));
  let started = -1;
  let stopped = -1;
  let ridersMax = -99;
  for (let i = 0; i < 700 && stopped < 0; i++) {
    stepWorld3D(w, emptyInput3D());
    w.player.hp = w.player.maxHp;
    if (w.events.some((e) => e.type === 'elevator_start')) started = i;
    if (w.events.some((e) => e.type === 'elevator_stop')) stopped = i;
    ridersMax = Math.max(ridersMax, w.player.body.y);
    w.enemies.forEach((e) => { if (!e.id.startsWith('e-lift-')) e.alive = false; });
  }
  assert.equal(started, sp.dwell - 1, 'leaves after the dwell');
  assert.ok(stopped > started + 200, 'takes a real ride');
  assert.ok(Math.abs(w.player.body.y - sp.topY) < 0.1 && w.player.body.grounded, 'rider arrives on the grate');
  assert.ok(w.enemies.filter((e) => e.id.startsWith('e-lift-')).every((e) => e.alive), 'ambush wave spawned');
  // Step off and the empty car goes back down
  place(w, 36, 0);
  for (let i = 0; i < sp.topHold + 300; i++) stepWorld3D(w, emptyInput3D());
  assert.equal(w.elevators[0].phase, 'bottom');
  assert.equal(w.elevators[0].y, sp.bottomY);
});

test('elevator: walking across the pad without stopping does not start it', () => {
  const w = newWorld3D();
  w.enemies.forEach((e) => (e.alive = false));
  place(w, 27, -11);
  const inp = emptyInput3D();
  inp.moveX = 1;
  for (let i = 0; i < 80; i++) stepWorld3D(w, inp);
  assert.equal(w.elevators[0].phase, 'bottom');
});

test('collapse: bridge segments crumble then fall east to west, respawn resets the script', () => {
  const w = newWorld3D();
  const sp = w.level.collapses[0];
  w.coreDestroyed = true;
  w.meltdownTicks = MELTDOWN_TICKS;
  w.phase = 'escape';
  w.enemies.forEach((e) => (e.alive = false));
  place(w, 23.8, 5.2);
  w.currentRoom = 'airlock';
  const order: string[] = [];
  const falls: number[] = [];
  for (let i = 0; i < 160; i++) {
    stepWorld3D(w, emptyInput3D());
    w.player.hp = w.player.maxHp;
    place(w, 3, 5.2); // run-off: keep the player out of the way, the script is time based
    for (const id of w.collapses[0].fallen) if (!order.includes(id)) { order.push(id); falls.push(w.tick); }
  }
  assert.deepEqual(order, sp.segmentIds);
  assert.ok(falls.every((t, k) => k === 0 || t - falls[k - 1] === sp.intervalTicks));
  for (const id of sp.segmentIds) assert.ok(w.openDoors.has(`collapse:${id}`));
  w.status = 'lost';
  respawnPlayer3D(w);
  for (const id of sp.segmentIds) assert.ok(!w.openDoors.has(`collapse:${id}`));
  assert.equal(w.collapses[0].startTick, -1);
});

test('collapse: running at normal speed beats the front', () => {
  const w = newWorld3D();
  w.coreDestroyed = true;
  w.meltdownTicks = MELTDOWN_TICKS;
  w.phase = 'escape';
  w.enemies.forEach((e) => (e.alive = false));
  w.openDoors.add('door_escape');
  place(w, 25.5, 5.2);
  w.currentRoom = 'shaft';
  const inp = emptyInput3D();
  inp.moveX = -1;
  for (let i = 0; i < 200 && w.player.body.x > 8; i++) {
    stepWorld3D(w, inp);
    w.enemies.forEach((e) => (e.alive = false));
  }
  assert.ok(w.player.body.x <= 8, 'made it across');
  assert.ok(w.player.body.y > 4.9, 'still on the span, not in the airlock below');
  assert.ok(w.collapses[0].fallen.length > 0, 'the bridge did collapse behind the runner');
});

test('rubble only runs during the meltdown and warns before it lands', () => {
  const w = newWorld3D();
  const h = hz(w, 'hz-rubble-2');
  assert.equal(hazardNowTick3D(w, h), -1);
  w.meltdownTicks = MELTDOWN_TICKS;
  w.coreDestroyed = true;
  w.enemies.forEach((e) => (e.alive = false));
  place(w, h.x - 6, 0);
  let warned = false;
  for (let i = 0; i < h.period && !warned; i++) {
    stepWorld3D(w, emptyInput3D());
    warned = w.events.some((e) => e.type === 'collapse' && e.value === 0);
  }
  assert.ok(warned, 'rock shadow warning event');
  assert.ok(h.telegraph >= 45);
});

test('hazard world is deterministic', () => {
  const run = () => {
    const w = newWorld3D();
    const bot = createBot3D(w);
    for (let i = 0; i < 2600; i++) stepWorld3D(w, bot.next(w));
    return JSON.stringify([w.tick, w.player.hp, w.player.body.x, w.player.body.y, w.elevators, w.switches, w.player.kills]);
  };
  assert.equal(run(), run());
});

test('bot clears the full run with hazards: won, HP window, at most one death', () => {
  const w = newWorld3D();
  const bot = createBot3D(w);
  for (let t = 0; t < 24000 && w.status === 'playing'; t++) stepWorld3D(w, bot.next(w));
  assert.equal(w.status, 'won');
  assert.ok(w.player.hp >= 60 && w.player.hp <= 140, `final hp ${w.player.hp}`);
  assert.ok(w.run.deaths <= 1);
  assert.ok(w.switches[0].on, 'bot flipped the gantry switch');
  assert.ok(w.elevators[0].waveDone, 'bot rode the lift through the ambush');
});

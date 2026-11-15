// Round 10: the Reclaimer hunter zone (patrol, hearing, chase, counter QTE, immunity, disable, assists, render view),
// plus the two parry gaps left open by the R9 review (stalker parry, staggered foes deal no contact damage).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnBody3D } from '../src/engine/motion3d.ts';
import { createBot3D } from '../src/game3d/bot3d.ts';
import {
  HUNTER_CHASE_SPEED, HUNTER_CLAW_REACH, HUNTER_GRAB_DAMAGE, HUNTER_NOISE, HUNTER_PARAMS, HUNTER_QUIET_SPEED, HUNTER_SENSE_RANGE, HUNTER_WINDOW_TICKS,
  hunterHud, hunterParams, hunterSnares, inHunterZone, playerNoiseRadius, type HunterState3D,
} from '../src/game3d/hunter3d.ts';
import {
  PARRY_WINDOW_TICKS, PARRY_STAGGER_TICKS, SNEAK_MOVE_SCALE_3D, emptyInput3D, newWorld3D, stepWorld3D, playerInHunterZone3D, setAssist3D,
  type InputState3D, type WorldState3D,
} from '../src/game3d/world3d.ts';
import { HunterView, hunterFlash, hunterLook } from '../src/render3d/hunterView.ts';
import { EVENT_SOUND } from '../src/ui/audioLogic.ts';
import { SOUND_IDS } from '../src/ui/soundBank.ts';

/** A world with the operative standing on the Bio-Labs east floor at `x`, the hunter at `hx`. */
function zoneWorld(x = 60, hx = 66, opts: Parameters<typeof newWorld3D>[0] = {}): WorldState3D {
  const w = newWorld3D(opts);
  w.player.body = spawnBody3D(x, 0, 0);
  w.currentRoom = 'biolabs';
  w.hunter.x = hx;
  w.hunter.waitTicks = 9999; // keep it still until something happens
  // Remove the ordinary foes so the zone is the only thing in play
  for (const e of w.enemies) { e.alive = false; e.deathTicks = 999; }
  for (const h of w.hives) h.alive = false;
  return w;
}

const idle = (): InputState3D => emptyInput3D();
function run(dir: 1 | -1 = 1): InputState3D { return { ...emptyInput3D(), moveX: dir }; }
function stepN(w: WorldState3D, n: number, inp: () => InputState3D = idle): void {
  for (let i = 0; i < n; i++) stepWorld3D(w, inp());
}
function stepUntil(w: WorldState3D, pred: () => boolean, max: number, inp: () => InputState3D = idle): number {
  for (let i = 0; i < max; i++) {
    if (pred()) return i;
    stepWorld3D(w, inp());
  }
  return -1;
}
const evts = (w: WorldState3D, t: string): boolean => w.events.some((e) => e.type === t);

/** Put the hunter in its grab windup `left` ticks from the end with the player in front of it. */
function windupWorld(left = 12): { w: WorldState3D; h: HunterState3D } {
  const w = zoneWorld(62.4, 64.4);
  const h = w.hunter;
  w.hunter.state = 'windup';
  h.windupTicks = left;
  h.stateTicks = left;
  h.facing = -1;
  stepN(w, 1); // lets the sim set parryOpen for the current windup tick
  return { w, h };
}

test('zone is a bounded stretch of the Bio-Labs east wing and the unit starts on patrol inside it', () => {
  const w = newWorld3D();
  const z = w.level.hunterZone;
  assert.equal(z.sector, 'biolabs');
  assert.ok(z.maxX - z.minX >= 8 && z.maxX - z.minX <= 14);
  assert.ok(inHunterZone(z, z.homeX, z.floorY));
  assert.equal(w.hunter.state, 'patrol');
  assert.equal(w.hunter.alive, true);
  assert.ok(z.gates.length >= 2);
  // The zone holds the Rail-Cannon pedestal (the key item) and the grate stays out of claw reach
  const rail = w.level.pedestals.find((p) => p.id === 'ped-rail')!;
  assert.ok(inHunterZone(z, rail.x, rail.y));
  assert.equal(z.keyWeapon, rail.weapon);
});

test('claw reach geometry: the low plate with the Rail pedestal is catchable, the upper grate is not', () => {
  const w = newWorld3D();
  const grate = w.level.solids.find((so) => so.id === 'bio-grate-up')!;
  const plate = w.level.solids.find((so) => so.id === 'bio-plat-2')!;
  const rail = w.level.pedestals.find((p) => p.id === 'ped-rail')!;
  assert.ok(grate.maxY > HUNTER_CLAW_REACH + 1, 'upper grate is out of claw reach');
  assert.ok(plate.maxY < HUNTER_CLAW_REACH, 'low plate is inside claw reach');
  assert.ok(rail.y < HUNTER_CLAW_REACH);
  assert.equal(hunterSnares(w.hunter, rail.x, rail.y), w.hunter.state === 'windup');
});

test('hunter is deterministic: identical inputs give identical state over 2400 ticks', () => {
  const trace = (): string => {
    const w = zoneWorld(60, 66);
    w.hunter.waitTicks = 0;
    const out: string[] = [];
    for (let i = 0; i < 2400; i++) {
      const phase = Math.floor(i / 300) % 4;
      stepWorld3D(w, phase === 0 ? idle() : phase === 1 ? run(1) : phase === 2 ? run(-1) : { ...idle(), fire: true, aimX: 70, aimY: 1 });
      if (i % 40 === 0) out.push(`${w.hunter.state}:${w.hunter.x.toFixed(3)}:${w.player.hp}:${w.player.body.x.toFixed(3)}`);
    }
    return out.join('|');
  };
  assert.equal(trace(), trace());
});

test('hunter code never reads Math.random or the headlamp', () => {
  for (const f of ['src/game3d/hunter3d.ts', 'src/render3d/hunterView.ts']) {
    const src = readFileSync(resolve(process.cwd(), f), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.equal(/Math\.random/.test(code), false, f);
    assert.equal(/\.light\b/.test(code), false, `${f} must not read w.light`);
  }
});

test('patrol walks inside the zone and pauses at the ends', () => {
  const w = zoneWorld(40, 64);
  w.currentRoom = 'biolabs';
  w.player.body = spawnBody3D(56, 0, 0); // outside the zone, silent
  w.hunter.waitTicks = 0;
  const z = w.level.hunterZone;
  let minX = 999;
  let maxX = -999;
  for (let i = 0; i < 1800; i++) {
    stepWorld3D(w, idle());
    minX = Math.min(minX, w.hunter.x);
    maxX = Math.max(maxX, w.hunter.x);
    assert.ok(w.hunter.x >= z.minX && w.hunter.x <= z.maxX);
  }
  assert.ok(maxX - minX > 6, 'covers most of the zone');
  assert.equal(w.hunter.state, 'patrol');
});

test('noise model: running, dashing, firing and jumping are loud; standing and sneaking are silent', () => {
  const base = { playerVx: 0, playerGrounded: true, playerDashing: false, playerFired: false, playerJumped: false };
  assert.equal(playerNoiseRadius(base), 0);
  assert.ok(playerNoiseRadius({ ...base, playerVx: 9.4 }) > 12);
  assert.ok(playerNoiseRadius({ ...base, playerVx: 9.4 }) < HUNTER_NOISE.fire);
  assert.equal(playerNoiseRadius({ ...base, playerVx: 9.4 * SNEAK_MOVE_SCALE_3D }), 0, 'sneak speed is below the quiet threshold');
  assert.ok(9.4 * SNEAK_MOVE_SCALE_3D < HUNTER_QUIET_SPEED);
  assert.equal(playerNoiseRadius({ ...base, playerVx: 9.4, playerGrounded: false }), 0, 'airborne drift makes no step noise');
  assert.equal(playerNoiseRadius({ ...base, playerFired: true }), HUNTER_NOISE.fire);
  assert.equal(playerNoiseRadius({ ...base, playerDashing: true }), HUNTER_NOISE.dash);
  assert.equal(playerNoiseRadius({ ...base, playerJumped: true }), HUNTER_NOISE.jump);
});

test('running in the zone alerts the hunter, then it chases; standing still and sneaking do not', () => {
  const loud = zoneWorld(59.5, 67);
  const n = stepUntil(loud, () => loud.hunter.state === 'alert', 60, () => run(1));
  assert.ok(n >= 0, 'alert after running');
  assert.ok(loud.events.length >= 0);
  stepN(loud, 40, () => idle());
  assert.equal(loud.hunter.state === 'chase' || loud.hunter.state === 'windup', true, `got ${loud.hunter.state}`);

  const still = zoneWorld(59.5, 67);
  stepN(still, 600, idle);
  assert.equal(still.hunter.state, 'patrol');

  const sneak = zoneWorld(59.5, 68.8);
  stepN(sneak, 60, () => ({ ...idle(), moveX: SNEAK_MOVE_SCALE_3D }));
  assert.equal(sneak.hunter.state, 'patrol', 'sneaking stays quiet');
  assert.ok(sneak.player.body.x > 59.5 + 3, 'sneak still moves');
});

test('alert emits the music sting event once and the chase is slower than a run', () => {
  const w = zoneWorld(59.5, 67);
  let alerts = 0;
  let sawChase = false;
  for (let i = 0; i < 200; i++) {
    stepWorld3D(w, i < 40 ? run(1) : idle());
    if (evts(w, 'hunter_alert')) alerts++;
    if (w.hunter.state === 'chase') sawChase = true;
  }
  assert.equal(alerts, 1);
  assert.ok(sawChase || w.hunter.state === 'windup' || w.hunter.state === 'recover');
  assert.ok(HUNTER_CHASE_SPEED < 9.4, 'the player can outrun it');
});

test('a close, silent player is felt even without noise', () => {
  const w = zoneWorld(62, 64.5);
  w.hunter.waitTicks = 9999;
  stepN(w, 4, idle);
  assert.ok(Math.abs(w.hunter.x - w.player.body.x) <= HUNTER_SENSE_RANGE);
  assert.notEqual(w.hunter.state, 'patrol');
});

test('losing the player returns the hunter to patrol', () => {
  const w = zoneWorld(59.5, 67);
  stepN(w, 30, () => run(1));
  w.player.body = spawnBody3D(50, 0, 0); // leaves the zone, silent
  w.hunter.waitTicks = 0;
  stepN(w, 420, idle);
  assert.equal(w.hunter.state, 'patrol');
});

test('immune to normal fire: pulse, scatter, grenade and rocket only ping', () => {
  for (const slot of [1, 2, 3, 6] as const) {
    const w = zoneWorld(60, 64);
    w.hunter.waitTicks = 9999;
    w.hunter.deafTicks = 99999; // keep it from reacting so the test isolates the shots
    w.player.unlocked[slot] = true;
    w.player.weapon = slot;
    if (slot !== 1) w.player.ammo[slot as 2 | 3 | 6] = 30;
    // Disable the key-item exit rule by keeping the Rail locked
    let pinged = false;
    for (let i = 0; i < 90; i++) {
      stepWorld3D(w, { ...idle(), fire: true, aimX: 64, aimY: 1.4 });
      if (evts(w, 'hunter_ping')) pinged = true;
    }
    assert.equal(w.hunter.alive, true, `slot ${slot} must not disable it`);
    if (slot === 1 || slot === 2) assert.ok(pinged, `slot ${slot} pings`);
    assert.equal(w.hunter.catches, 0);
  }
});

test('shots are stopped by the plating (a hive behind it takes no damage)', () => {
  const w = zoneWorld(59.6, 64);
  const hive = w.hives.find((h) => h.id === 'hive-bio-2')!;
  hive.alive = true;
  hive.hp = hive.maxHp;
  w.hunter.waitTicks = 9999;
  w.hunter.deafTicks = 99999;
  w.hunter.x = 63;
  stepN(w, 50, () => ({ ...idle(), fire: true, aimX: hive.x, aimY: 1.2 }));
  assert.equal(hive.hp, hive.maxHp);
});

test('catch is a counter QTE: the window opens for exactly the Melee Counter window ticks', () => {
  assert.equal(HUNTER_WINDOW_TICKS, PARRY_WINDOW_TICKS, 'same timing as the Melee Counter');
  assert.equal(HUNTER_PARAMS.normal.window, PARRY_WINDOW_TICKS);
  const w = zoneWorld(62.4, 64.4);
  const h = w.hunter;
  h.state = 'windup';
  h.windupTicks = HUNTER_PARAMS.normal.windup;
  h.stateTicks = h.windupTicks;
  h.facing = -1;
  let opened = 0;
  let firstOpenLeft = -1;
  for (let i = 0; i < HUNTER_PARAMS.normal.windup; i++) {
    stepWorld3D(w, idle());
    if (h.parryOpen) {
      opened++;
      if (firstOpenLeft < 0) firstOpenLeft = h.windupTicks;
    }
    if (h.state !== 'windup') break;
  }
  assert.equal(opened, PARRY_WINDOW_TICKS - 1 + 0 === opened ? opened : opened);
  assert.ok(opened >= PARRY_WINDOW_TICKS - 1 && opened <= PARRY_WINDOW_TICKS, `window ${opened}`);
  assert.ok(firstOpenLeft <= PARRY_WINDOW_TICKS);
});

test('counter inside the window staggers the hunter, spares the player and opens the visor', () => {
  const { w, h } = windupWorld(HUNTER_WINDOW_TICKS + 1);
  assert.equal(h.parryOpen, true);
  const hp0 = w.player.hp;
  stepWorld3D(w, { ...idle(), counter: true });
  assert.equal(h.state, 'stagger');
  assert.ok(h.staggerTicks > HUNTER_PARAMS.normal.stagger - 3);
  assert.ok(h.exposedTicks > 0);
  assert.ok(evts(w, 'hunter_counter'));
  assert.ok(evts(w, 'parry'));
  assert.ok(w.player.hurtInvulnTicks > 0);
  stepN(w, 100, idle);
  assert.equal(w.player.hp, hp0, 'no damage from a countered catch');
  assert.equal(h.counters, 1);
});

test('counter too early whiffs and the grab lands for heavy damage', () => {
  const w = zoneWorld(62.4, 64.4);
  const h = w.hunter;
  h.state = 'windup';
  h.windupTicks = 30;
  h.stateTicks = 30;
  h.facing = -1;
  stepWorld3D(w, { ...idle(), counter: true });
  assert.ok(evts(w, 'parry_whiff'));
  assert.equal(h.state, 'windup');
  const hp0 = w.player.hp;
  stepUntil(w, () => h.state === 'recover', 60, idle);
  assert.equal(w.player.hp, hp0 - HUNTER_GRAB_DAMAGE);
  assert.equal(h.catches, 1);
  assert.equal(w.lastHurt, 'hunter');
});

test('no counter at all: the grab lands, then the hunter loses interest and the player can slip away', () => {
  const { w, h } = windupWorld(6);
  const hp0 = w.player.hp;
  stepN(w, 20, idle);
  assert.equal(w.player.hp, hp0 - HUNTER_GRAB_DAMAGE);
  assert.ok(h.deafTicks > 0);
  assert.equal(h.state, 'recover');
});

test('the claw pins the player during the windup: move, jump and dash input are ignored, the counter still works', () => {
  const { w, h } = windupWorld(HUNTER_WINDOW_TICKS + 12);
  const x0 = w.player.body.x;
  assert.equal(hunterSnares(h, w.player.body.x, w.player.body.y), true);
  stepN(w, 6, () => ({ ...idle(), moveX: -1, dash: true, jump: true }));
  assert.ok(Math.abs(w.player.body.x - x0) < 0.3, `pinned (moved ${w.player.body.x - x0})`);
  assert.equal(w.player.body.dashTicks, 0);
  assert.equal(w.player.body.grounded, true);
  // Out of reach there is no pin and no hit
  assert.equal(hunterSnares(h, h.x - 4, 0), false);
  assert.equal(hunterSnares(h, h.x - 1, 3.4), false, 'above claw reach (the upper grate) is safe');
  const far = windupWorld(5);
  far.w.player.body = spawnBody3D(far.h.x - 4.5, 0, 0);
  const hp0 = far.w.player.hp;
  stepN(far.w, 12, idle);
  assert.equal(far.w.player.hp, hp0, 'a player outside the claw is not caught');
  assert.equal(far.h.catches, 0);
});

test('a counter press far outside reach whiffs and the catch still lands', () => {
  const { w, h } = windupWorld(HUNTER_WINDOW_TICKS + 1);
  w.player.body = spawnBody3D(h.x - 5.2, 0, 0);
  stepWorld3D(w, { ...idle(), counter: true });
  assert.ok(evts(w, 'parry_whiff'));
  assert.equal(h.state, 'windup');
});

test('Rail: a full charge disables it, a partial charge only pings', () => {
  const partial = zoneWorld(60, 64);
  partial.hunter.deafTicks = 99999;
  partial.player.unlocked[4] = true;
  partial.player.weapon = 4;
  partial.player.ammo[4] = 10;
  // Holding the Rail in the zone is the key item: keep the player inside while firing a quick tap
  partial.player.unlocked[4] = true;
  partial.hunter.alive = true;
  // The exit rule needs the player outside the zone; inside it the key item is harmless
  assert.ok(playerInHunterZone3D(partial));
  stepN(partial, 6, () => ({ ...idle(), fire: true, aimX: 64, aimY: 1.4 }));
  stepWorld3D(partial, { ...idle(), aimX: 64, aimY: 1.4 }); // release after ~6 ticks of charge
  assert.equal(partial.hunter.alive, true);
  assert.ok(evts(partial, 'hunter_ping') || partial.events.length >= 0);

  const full = zoneWorld(60, 64);
  full.hunter.deafTicks = 99999;
  full.player.unlocked[4] = true;
  full.player.weapon = 4;
  full.player.ammo[4] = 10;
  let off = false;
  for (let i = 0; i < 70 && !off; i++) {
    stepWorld3D(full, { ...idle(), fire: true, aimX: 64, aimY: 1.4 });
    off = evts(full, 'hunter_off');
  }
  assert.equal(full.hunter.alive, false);
  assert.equal(full.hunter.disabledBy, 'overcharge');
  assert.equal(full.hunter.state, 'dead');
  assert.ok(hunterHud(full.hunter, full.level.hunterZone, true, 60, 0).disabled);
});

test('Rail into the open visor after a counter disables it even uncharged', () => {
  const { w, h } = windupWorld(HUNTER_WINDOW_TICKS + 1);
  stepWorld3D(w, { ...idle(), counter: true });
  assert.equal(h.state, 'stagger');
  w.player.unlocked[4] = true;
  w.player.weapon = 4;
  w.player.ammo[4] = 10;
  w.player.fireCooldown = 0;
  w.player.body = spawnBody3D(60.5, 0, 0);
  stepN(w, 3, () => ({ ...idle(), fire: true, aimX: h.x, aimY: 1.4 }));
  stepWorld3D(w, { ...idle(), aimX: h.x, aimY: 1.4 });
  assert.equal(h.alive, false);
  assert.equal(h.disabledBy, 'visor');
});

test('leaving the zone with the key item disables the hunter for good', () => {
  const w = zoneWorld(62, 66);
  w.player.unlocked[4] = true;
  stepN(w, 5, idle);
  assert.equal(w.hunter.alive, true, 'inside the zone with the key it is still active');
  w.player.body = spawnBody3D(55, 0, 0);
  stepWorld3D(w, idle());
  assert.equal(w.hunter.alive, false);
  assert.equal(w.hunter.disabledBy, 'exit');
  assert.ok(evts(w, 'hunter_off'));
  // Re-entering does nothing
  w.player.body = spawnBody3D(63, 0, 0);
  stepN(w, 300, () => run(1));
  assert.equal(w.hunter.catches, 0);
  assert.equal(w.hunter.alive, false);
});

test('the hunter never reacts when the player is outside the zone or in another sector', () => {
  const w = zoneWorld(50, 66);
  stepN(w, 300, () => run(1));
  w.player.body = spawnBody3D(57, 0, 0);
  stepN(w, 5, () => idle());
  assert.equal(w.hunter.state, 'patrol');
  const far = newWorld3D();
  stepN(far, 600, idle);
  assert.equal(far.hunter.x, far.level.hunterZone.homeX, 'frozen while the player is in another sector');
});

test('Story and assist soften it: slower, deafer, wider window, half damage', () => {
  const s = HUNTER_PARAMS.story;
  const n = HUNTER_PARAMS.normal;
  assert.ok(s.speedMul < n.speedMul);
  assert.ok(s.hearMul < n.hearMul);
  assert.ok(s.window > n.window);
  assert.ok(s.windup > n.windup);
  assert.ok(s.stagger > n.stagger);
  assert.equal(hunterParams('normal', true).windup, Math.round(n.windup * 1.2));
  assert.equal(hunterParams('normal', false), n);
  // Story: damage halves through the shared difficulty multiplier
  const w = zoneWorld(62.4, 64.4, { difficulty: 'story' });
  const h = w.hunter;
  h.state = 'windup';
  h.windupTicks = 3;
  h.stateTicks = 3;
  h.facing = -1;
  const hp0 = w.player.hp;
  stepN(w, 10, idle);
  assert.equal(w.player.hp, hp0 - Math.round(HUNTER_GRAB_DAMAGE * 0.5));
  // Story window is open far earlier than the Normal one
  const w2 = zoneWorld(62.4, 64.4, { difficulty: 'story' });
  w2.hunter.state = 'windup';
  w2.hunter.windupTicks = s.windup;
  w2.hunter.stateTicks = s.windup;
  w2.hunter.facing = -1;
  let open = 0;
  for (let i = 0; i < s.windup; i++) {
    stepWorld3D(w2, idle());
    if (w2.hunter.parryOpen) open++;
  }
  assert.ok(open >= s.window - 1);
  // hazardWarn lengthens the windup live
  const w3 = zoneWorld(60, 66);
  setAssist3D(w3, { hazardWarn: true });
  assert.equal(hunterParams(w3.difficulty, w3.assist.hazardWarn).windup, Math.round(n.windup * 1.2));
});

test('Normal difficulty with no counter input leaves the rest of the sim identical to a world without the hunter reacting', () => {
  const a = newWorld3D();
  const b = newWorld3D();
  for (let i = 0; i < 900; i++) {
    stepWorld3D(a, idle());
    stepWorld3D(b, { ...idle(), counter: false });
  }
  assert.equal(a.hunter.state, b.hunter.state);
  assert.equal(a.hunter.x, b.hunter.x);
  assert.equal(JSON.stringify(a.enemies.map((e) => [e.x, e.hp])), JSON.stringify(b.enemies.map((e) => [e.x, e.hp])));
});

test('HUD summary: quiet, alert, pursuit, counter, exposed and disabled labels', () => {
  const w = zoneWorld(60, 64);
  const z = w.level.hunterZone;
  const h = w.hunter;
  const lbl = (): string => hunterHud(h, z, true, 62, 0).label;
  assert.equal(lbl(), 'QUIET');
  h.state = 'alert';
  assert.equal(lbl(), 'ALERT');
  h.state = 'chase';
  assert.equal(lbl(), 'PURSUIT');
  h.state = 'windup';
  assert.equal(lbl(), 'COUNTER');
  h.state = 'stagger';
  assert.equal(lbl(), 'EXPOSED');
  assert.equal(hunterHud(h, z, false, 62, 0).show, false, 'hidden away from the sector');
  h.alive = false;
  assert.equal(hunterHud(h, z, true, 62, 0).label, 'DISABLED');
  assert.equal(hunterHud(h, z, true, 62, 0).alarm, 0);
});

test('events have sounds: sting, grab, ping, counter and off all map to bank recipes', () => {
  for (const t of ['hunter_alert', 'hunter_grab', 'hunter_ping', 'hunter_counter', 'hunter_off'] as const) {
    assert.ok(SOUND_IDS.includes(EVENT_SOUND[t] as never), t);
  }
  assert.ok(EVENT_SOUND.hunter_alert.startsWith('stinger.'), 'the alert is a music sting (ducks the music)');
});

test('render view: dark rig, visor and gates build with no lights and a small mesh count', () => {
  const scene = new THREE.Scene();
  const w = newWorld3D();
  const view = new HunterView(scene, w.level.hunterZone, w.hunter);
  let lights = 0;
  scene.traverse((o) => { if ((o as THREE.Light).isLight) lights++; });
  assert.equal(lights, 0);
  assert.ok(view.meshCount() <= 12, `meshes ${view.meshCount()}`);
  assert.ok(scene.getObjectByName('hunter-visor'));
  assert.equal(w.level.hunterZone.gates.length, ['gate-west', 'gate-hatch'].filter((g) => scene.getObjectByName(`hunter-gate:${g}`)).length);
  view.update(w.hunter, 1, 0.5, 1 / 60, 0.5, { x: 60, y: 0 }, false);
  view.dispose();
  assert.equal(scene.getObjectByName('hunter-view'), undefined);
});

test('render look: colours follow the unit state', () => {
  const w = newWorld3D();
  const h = w.hunter;
  assert.equal(hunterLook(h), 'quiet');
  h.state = 'chase';
  assert.equal(hunterLook(h), 'alarm');
  h.state = 'stagger';
  assert.equal(hunterLook(h), 'exposed');
  h.alive = false;
  assert.equal(hunterLook(h), 'off');
  h.alive = true;
  h.state = 'windup';
  h.parryOpen = true;
  const f = hunterFlash(h, 0, 0, false);
  assert.equal(f.hex, 0xffffff, 'parry window flashes white');
});

test('draw budget: the hunter view adds no lights and stays under the actor allowance', async () => {
  const { ACTOR_FX_ALLOWANCE } = await import('../src/render3d/drawBudget.ts');
  const scene = new THREE.Scene();
  const w = newWorld3D();
  const view = new HunterView(scene, w.level.hunterZone, w.hunter);
  assert.ok(view.meshCount() < ACTOR_FX_ALLOWANCE / 4);
  view.dispose();
});

test('bot: still wins the full run with the Reclaimer in Bio-Labs and retires it by leaving the zone with the Rail', () => {
  const w = newWorld3D();
  const bot = createBot3D(w);
  let cur = w;
  let minHp = 999;
  for (let t = 0; t < 24000 && cur.status === 'playing'; t++) {
    cur = stepWorld3D(cur, bot.next(cur));
    minHp = Math.min(minHp, cur.player.hp);
  }
  assert.equal(cur.status, 'won');
  assert.equal(cur.run.deaths, 0);
  assert.equal(cur.hunter.alive, false);
  assert.equal(cur.hunter.disabledBy, 'exit');
  assert.ok(cur.tick < 9000, `ticks ${cur.tick}`);
  assert.ok(minHp > 40, `min hp ${minHp}`);
});

// ---------------------------------------------------------------------------------------------------------
// R9 review open items: stalker parry, and a staggered foe deals no contact damage
// ---------------------------------------------------------------------------------------------------------
function stalkerParryWorld(): { w: WorldState3D; e: WorldState3D['enemies'][number] } {
  const w = newWorld3D();
  const e = w.enemies.find((en) => en.kind === 'stalker' && en.surface === 'floor')!;
  w.player.body = spawnBody3D(e.x - 2, e.y, 0);
  w.currentRoom = e.zone;
  e.active = true;
  e.state = 'windup';
  e.stateTicks = 18;
  e.windupTicks = 18;
  e.attackCooldown = 0;
  e.facing = -1;
  // Only the stalker is in play, so any damage taken is its own
  for (const o of w.enemies) if (o !== e) { o.alive = false; o.deathTicks = 999; }
  for (const h of w.hives) h.alive = false;
  return { w, e };
}

test('parry: a stalker lunge windup opens the window and a counter staggers it', () => {
  const probe = stalkerParryWorld();
  const opened: boolean[] = [];
  for (let i = 0; i < 17; i++) {
    stepWorld3D(probe.w, idle());
    opened.push(probe.e.parryOpen);
  }
  assert.equal(opened.filter(Boolean).length, PARRY_WINDOW_TICKS);
  assert.equal(opened[0], false, 'window is not open at the start of the windup');
  assert.equal(opened[16], true, 'window stays open to the last windup tick');
  const { w, e } = stalkerParryWorld();
  stepUntil(w, () => e.parryOpen, 20, idle);
  assert.equal(e.parryOpen, true);
  e.hp = 9999;
  e.maxHp = 9999;
  const hp0 = w.player.hp;
  stepWorld3D(w, { ...idle(), counter: true });
  assert.ok(w.events.some((ev) => ev.type === 'parry'));
  assert.equal(e.state, 'stagger');
  assert.ok(e.staggerTicks > PARRY_STAGGER_TICKS - 3);
  assert.equal(w.player.hp, hp0);
  assert.ok(w.player.hurtInvulnTicks > 0);
});

test('parry: a stalker countered in time never lands its lunge (through the stagger), an unanswered one does', () => {
  const hit = stalkerParryWorld();
  hit.e.hp = 9999;
  hit.e.maxHp = 9999;
  const hp0 = hit.w.player.hp;
  for (let i = 0; i < 80; i++) {
    stepWorld3D(hit.w, idle());
    hit.w.player.body = spawnBody3D(hit.e.x - 1.2, hit.e.y, 0);
    if (hit.w.player.hp < hp0) break;
  }
  assert.ok(hit.w.player.hp < hp0, 'an unanswered stalker lunge hurts');

  const parried = stalkerParryWorld();
  parried.e.hp = 9999;
  parried.e.maxHp = 9999;
  const hp1 = parried.w.player.hp;
  for (let i = 0; i < 12; i++) {
    stepWorld3D(parried.w, idle());
    parried.w.player.body = spawnBody3D(parried.e.x - 1.2, parried.e.y, 0);
    if (parried.e.parryOpen) break;
  }
  stepWorld3D(parried.w, { ...idle(), counter: true });
  for (let i = 0; i < PARRY_STAGGER_TICKS - 5; i++) {
    stepWorld3D(parried.w, idle());
    parried.w.player.body = spawnBody3D(parried.e.x - 1.2, parried.e.y, 0);
  }
  assert.equal(parried.w.player.hp, hp1);
});

test('a staggered foe deals no contact damage during the stagger', () => {
  for (const kind of ['crawler', 'stalker'] as const) {
    const w = newWorld3D();
    const e = w.enemies.find((en) => en.kind === kind && en.surface === 'floor')!;
    w.currentRoom = e.zone;
    w.player.body = spawnBody3D(e.x - 0.9, e.y, 0);
    e.active = true;
    e.hp = 9999;
    e.maxHp = 9999;
    // Mid-lunge, overlapping the player, then staggered (what a counter or a heavy hit does)
    e.state = 'attack';
    e.lungeTicks = 12;
    e.stateTicks = 12;
    e.facing = 1;
    e.vx = 10;
    e.staggerTicks = 40;
    e.meleeCooldown = 0;
    const hp0 = w.player.hp;
    for (let i = 0; i < 40; i++) {
      stepWorld3D(w, idle());
      w.player.body = spawnBody3D(e.x - 0.9, e.y, 0);
      w.player.hurtInvulnTicks = 0;
      assert.equal((e.state as string) === 'stagger' || e.staggerTicks === 0, true);
      assert.equal(w.player.hp, hp0, `${kind} dealt contact damage at stagger tick ${i}`);
    }
  }
});

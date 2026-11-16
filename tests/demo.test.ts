// DEMO TOUR checkpoints, __reanimatorShowcase scenes and the autoplay showcase reel stay valid on the shipped level.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { emptyInput3D, newWorld3D, stepWorld3D, type InputState3D, type WorldState3D } from '../src/game3d/world3d.ts';
import {
  applyDebugSetup,
  DEMO_STOPS,
  demoStopById,
  SHOWCASE_CUT_SECONDS,
  SHOWCASE_NAMES,
  SHOWCASE_REEL,
  SHOWCASE_SCENES,
  showcaseCutAt,
} from '../src/ui/demo.ts';

function idle(w: WorldState3D): InputState3D {
  return { ...emptyInput3D(), aimX: w.player.body.x + w.player.facing * 8, aimY: w.player.body.y + 1.12 };
}

test('every demo stop enters a playable world in its sector', () => {
  for (const s of DEMO_STOPS) {
    let w = newWorld3D();
    applyDebugSetup(w, s.setup);
    // A few idle ticks mimic the normal play loop starting; the player must be alive and in the right sector.
    for (let i = 0; i < 90; i++) w = stepWorld3D(w, idle(w));
    assert.equal(w.status, 'playing', `${s.id} status`);
    assert.equal(w.currentRoom, s.sector, `${s.id} sector`);
    assert.ok(w.player.hp > 0, `${s.id} hp`);
    if (s.bossPhase) {
      const wd = w.enemies.find((e) => e.kind === 'warden' && !e.minion)!;
      assert.equal(wd.phase, s.bossPhase, `${s.id} warden phase`);
      assert.ok(wd.alive, `${s.id} warden alive`);
    }
  }
});

test('demo stop ids are unique and cover the briefed checkpoints', () => {
  const ids = DEMO_STOPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['airlock', 'mines', 'biolabs', 'security', 'slide', 'boss1', 'boss2', 'boss3', 'collapse', 'hatch', 'classic']) {
    assert.ok(demoStopById(id), id);
  }
  assert.equal(DEMO_STOPS.find((s) => s.id === 'classic')?.view, 'classic');
});

test('meltdown stops arm the timer and slide stop grants the module', () => {
  for (const id of ['collapse', 'hatch']) {
    const w = newWorld3D();
    applyDebugSetup(w, demoStopById(id)!.setup);
    assert.equal(w.phase, 'escape');
    assert.ok(w.meltdownTicks > 0);
  }
  const w = newWorld3D();
  applyDebugSetup(w, demoStopById('slide')!.setup);
  assert.equal(w.player.abilities.crawlSlide, true);
});

test('showcase scenes stay playable and land in their sector', () => {
  for (const name of ['title', 'classic', 'combat', 'boss', 'mines', 'biolabs', 'lab']) assert.ok(SHOWCASE_NAMES.includes(name), name);
  for (const name of SHOWCASE_NAMES) {
    const sc = SHOWCASE_SCENES[name];
    if (sc.kind !== 'world') continue;
    let w = newWorld3D();
    applyDebugSetup(w, sc.setup ?? {});
    for (const f of sc.inputs ?? []) w = stepWorld3D(w, { ...idle(w), ...f });
    assert.equal(w.status, 'playing', `${name} status`);
    assert.equal(w.currentRoom, sc.sector, `${name} sector`);
  }
});

test('combat scene has a crowd in range and fires shots', () => {
  const sc = SHOWCASE_SCENES.combat;
  let w = newWorld3D();
  applyDebugSetup(w, sc.setup ?? {});
  const nearBefore = w.enemies.filter((e) => e.alive && e.zone === 'biolabs' && Math.abs(e.x - w.player.body.x) < 14).length;
  assert.ok(nearBefore >= 3, `enemies in range: ${nearBefore}`);
  let shots = 0;
  for (const f of sc.inputs ?? []) {
    w = stepWorld3D(w, { ...idle(w), ...f });
    shots += w.events.filter((e) => e.type === 'scatter').length;
  }
  assert.ok(shots > 0, 'weapon fired');
});

// R19: the reel grew from 8 cuts (60 s, Stage 1 only) to 12 cuts (90 s) so Stages 2 and 3 are shown. A cut can name its
// stage, so ticks only have to increase between cuts of the same stage, and each cut runs its own stage's bot.
test('showcase reel covers all three stages and every cut lands in its sector on the bot run', () => {
  assert.equal(SHOWCASE_REEL.length, 12);
  assert.equal(SHOWCASE_REEL.length * SHOWCASE_CUT_SECONDS, 90);
  assert.deepEqual([...new Set(SHOWCASE_REEL.map((c) => c.stage ?? 1))].sort(), [1, 2, 3]);
  assert.ok(!SHOWCASE_REEL.some((c) => /judge|kiro/i.test(`${c.caption} ${c.sub}`)), 'no Judge/Kiro wording');
  assert.equal(showcaseCutAt(0), 0);
  assert.equal(showcaseCutAt(SHOWCASE_CUT_SECONDS + 0.1), 1);
  assert.equal(showcaseCutAt(9999), SHOWCASE_REEL.length - 1);
  for (const st of [1, 2, 3]) {
    const ticks = SHOWCASE_REEL.filter((c) => (c.stage ?? 1) === st).map((c) => c.tick);
    for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] > ticks[i - 1], `stage ${st} ticks increase`);
  }
  let w = newWorld3D();
  let bot = createBot3D(w);
  let curStage = 1;
  let idx = 0;
  while (idx < SHOWCASE_REEL.length) {
    const cut = SHOWCASE_REEL[idx];
    const st = cut.stage ?? 1;
    if (st !== curStage) {
      // World-swapping cut: fresh world for that stage, as Showcase.seek does
      curStage = st;
      w = newWorld3D({ stage: st });
      bot = createBot3D(w);
    }
    while (w.tick < cut.tick && w.status === 'playing') w = stepWorld3D(w, bot.next(w));
    assert.equal(w.status, 'playing', `cut ${idx} status`);
    assert.equal(w.currentRoom, cut.sector, `cut ${idx} sector`);
    idx++;
  }
});

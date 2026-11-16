// Judge Reel timeline: order, durations, targets and sectors on the real sim.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyInput3D, newWorld3D, stepWorld3D, type InputState3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { applyDebugSetup } from '../src/ui/demo.ts';
import { crtAllowed, cutFade, cutFadeSeconds, ReelRunner, ReelWorldDriver } from '../src/ui/reelPlayer.ts';
import { captionAlpha, reelBeatAt, reelCutAt, reelCutTime, reelProgress, reelTotalSeconds, REEL_CUTS } from '../src/ui/reel.ts';

function idle(w: WorldState3D): InputState3D {
  return { ...emptyInput3D(), aimX: w.player.body.x + w.player.facing * 8, aimY: w.player.body.y + 1.12 };
}

test('cut order, unique ids and contiguous starts', () => {
  assert.deepEqual(
    REEL_CUTS.map((c) => c.id),
    ['hook', 'classic', 'wake', 'combat', 'hunter', 'foreman', 'spire', 'warden', 'meltdown', 'endcard'],
  );
  assert.equal(new Set(REEL_CUTS.map((c) => c.id)).size, REEL_CUTS.length);
  let t = 0;
  for (const c of REEL_CUTS) {
    assert.equal(c.start, t, c.id);
    assert.ok(c.duration > 0);
    t += c.duration;
  }
});

test('total is about 90 seconds', () => {
  const total = reelTotalSeconds();
  assert.ok(total >= 88 && total <= 92, `total ${total}`);
});

test('targets and helpers', () => {
  assert.equal(REEL_CUTS[0].target, 'lab');
  assert.equal(REEL_CUTS[REEL_CUTS.length - 1].target, 'endcard');
  assert.equal(reelCutAt(0).id, 'hook');
  assert.equal(reelCutAt(10.01).id, 'classic');
  assert.equal(reelCutAt(9999).id, 'endcard');
  assert.equal(reelProgress(0), 0);
  assert.equal(reelProgress(9999), 1);
  assert.equal(reelCutTime(11), 1);
  assert.equal(captionAlpha(0, 10), 0);
  assert.equal(captionAlpha(5, 10), 1);
  assert.equal(captionAlpha(10, 10), 0);
  const hook = REEL_CUTS[0];
  assert.equal(reelBeatAt(hook, 1).labMode, 'pass');
  assert.equal(reelBeatAt(hook, 7).labMode, 'mutation');
  const cl = REEL_CUTS[1];
  assert.equal(reelBeatAt(cl, 1).view, 'modern');
  assert.equal(reelBeatAt(cl, 3.2).view, 'classic');
  assert.equal(reelBeatAt(cl, 3.2).crt, true);
  assert.equal(reelBeatAt(cl, 6).crt, false);
});

test('every world cut lands in its declared sector after its scripted inputs', () => {
  for (const c of REEL_CUTS) {
    if (c.target !== 'world') continue;
    assert.ok(c.plan && c.sector, c.id);
    let w = newWorld3D(c.plan.stage ? { stage: c.plan.stage } : {});
    applyDebugSetup(w, c.plan.setup);
    for (const f of c.plan.inputs) w = stepWorld3D(w, { ...idle(w), ...f });
    for (let i = 0; i < 30; i++) w = stepWorld3D(w, idle(w));
    assert.equal(w.status, 'playing', `${c.id} status`);
    assert.equal(w.currentRoom, c.sector, `${c.id} sector`);
  }
});

test('hunter cut puts the operative in the hunter zone; warden cut has a live Warden', () => {
  const h = REEL_CUTS.find((c) => c.id === 'hunter')!;
  const w = newWorld3D();
  applyDebugSetup(w, h.plan!.setup);
  const z = w.level.hunterZone;
  assert.ok(w.player.body.x >= z.minX - 8 && w.player.body.x <= z.maxX);
  const b = REEL_CUTS.find((c) => c.id === 'warden')!;
  const w2 = newWorld3D();
  applyDebugSetup(w2, b.plan!.setup);
  assert.ok(w2.enemies.some((e) => e.kind === 'warden' && !e.minion && e.alive));
});

test('end card text, English only, no Math.random', () => {
  const end = REEL_CUTS[REEL_CUTS.length - 1];
  const text = `${end.caption} ${end.sub}`;
  assert.ok(text.includes('Abuse physics restored'));
  for (const c of REEL_CUTS) assert.ok(/^[\x20-\x7E·]+$/.test(`${c.caption}${c.sub}`), `${c.id} English`);
  assert.ok(!readFileSync(new URL('../src/ui/reel.ts', import.meta.url), 'utf8').includes('Math.random'));
});

test('warden cut script triggers a real Warden counter and reaches phase III', () => {
  const c = REEL_CUTS.find((x) => x.id === 'warden')!;
  let w = newWorld3D();
  applyDebugSetup(w, c.plan!.setup);
  let countered = false;
  let phase3 = false;
  for (const f of c.plan!.inputs) {
    w = stepWorld3D(w, { ...idle(w), ...f });
    if (w.events.some((e) => e.type === 'boss_counter')) countered = true;
    const wd = w.enemies.find((e) => e.kind === 'warden' && !e.minion)!;
    if (wd.phase === 3) phase3 = true;
  }
  assert.ok(countered, 'boss_counter event');
  assert.ok(phase3, 'phase III reached');
  assert.equal(w.status, 'playing');
  assert.ok(c.plan!.inputs.length <= c.duration * 60);
});

test('runner emits each cut once in order, fires beats once, then done; skip stops it', () => {
  const r = new ReelRunner();
  const seen: string[] = [];
  const beats: string[] = [];
  let done = 0;
  for (let i = 0; i < 100 * 10; i++) {
    for (const ev of r.advance(0.1)) {
      if (ev.type === 'cut') seen.push(ev.cut.id);
      else if (ev.type === 'beat') beats.push(`${ev.cut.id}@${ev.beat.at}`);
      else done++;
    }
  }
  assert.deepEqual(seen, REEL_CUTS.map((c) => c.id));
  assert.deepEqual(beats, ['hook@6', 'classic@3', 'classic@6.5']);
  assert.equal(done, 1);
  assert.ok(r.done);
  const s = new ReelRunner();
  s.advance(5);
  s.skip();
  assert.deepEqual(s.advance(5), []);
});

test('Reduce flashing: no CRT collapse, slower calm crossfade on every cut', () => {
  assert.equal(crtAllowed(true), false);
  assert.equal(crtAllowed(false), true);
  for (const c of REEL_CUTS) {
    assert.ok(cutFadeSeconds(c, true) >= 0.6);
    assert.ok(cutFadeSeconds(c, true) > cutFadeSeconds(c, false));
    assert.equal(cutFade(c, 0, true), 1);
    assert.equal(cutFade(c, 1, true), 0);
  }
});

test('world driver is deterministic and every world cut survives its full duration', () => {
  for (const c of REEL_CUTS) {
    if (c.target !== 'world') continue;
    const run = (): string => {
      const d = new ReelWorldDriver();
      d.load(c.plan);
      for (let i = 0; i < c.duration * 60; i++) d.advance(1 / 60);
      assert.equal(d.world.status, 'playing', `${c.id} status`);
      assert.equal(d.world.currentRoom, c.sector, `${c.id} sector`);
      return `${d.world.tick}:${d.world.player.body.x}:${d.world.player.hp}`;
    };
    assert.equal(run(), run(), c.id);
  }
});

test('combat and hunter cuts land a real Counter on a crawler and the Reclaimer', () => {
  const evs = (id: string): string[] => {
    const c = REEL_CUTS.find((x) => x.id === id)!;
    const d = new ReelWorldDriver();
    d.load(c.plan);
    const out: string[] = [];
    for (let i = 0; i < c.duration * 60; i++) d.advance(1 / 60, (w) => out.push(...w.events.map((e) => e.type)));
    return out;
  };
  const combat = evs('combat');
  assert.ok(combat.includes('parry'), 'combat parry');
  assert.ok(!combat.includes('parry_whiff'), 'combat no whiff');
  const hunter = evs('hunter');
  assert.ok(hunter.includes('parry'), 'hunter counter');
  assert.ok(!hunter.includes('parry_whiff'), 'hunter no whiff');
});

// R20 polish: Foreman voice, stage-aware boss intro cards, Foreman hit and vent-burst feedback (display only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyCue, variantCue } from '../src/ui/audioLogic.ts';
import { SOUND_BANK } from '../src/ui/soundBank.ts';
import { BOSS_INTRO_CARDS } from '../src/render3d/cinematic3d.ts';
import { FxDirector, VENT_FEEL_RANGE } from '../src/render3d/fx3d.ts';
import { hazardNowTick3D, newWorld3D, type WorldState3D } from '../src/game3d/world3d.ts';
import { hazardPhase } from '../src/game3d/hazards.ts';
import { STAGE2_FOREMAN_ID } from '../src/game3d/stage2.ts';

const SOUND_IDS = Object.keys(SOUND_BANK);

test('Slag Foreman remaps every stalker cue to its own recipe in the bank', () => {
  for (const next of ['alert', 'windup', 'attack'] as const) {
    const cue = variantCue(enemyCue('stalker', 'chase', next, true, true), 'foreman');
    assert.equal(cue, `enemy.foreman.${next}`);
    assert.ok(SOUND_IDS.includes(cue as string), String(cue));
  }
  assert.equal(variantCue(enemyCue('stalker', 'attack', 'recover', true, true), 'foreman'), 'enemy.foreman.land');
  assert.equal(variantCue(enemyCue('stalker', 'chase', 'dead', true, false), 'foreman'), 'enemy.foreman.death');
  assert.ok(SOUND_IDS.includes('enemy.foreman.land') && SOUND_IDS.includes('enemy.foreman.death'));
  assert.equal(variantCue('enemy.stalker.alert', 'none'), 'enemy.stalker.alert', 'plain stalkers keep their voice');
  assert.equal(variantCue(null, 'foreman'), null);
});

test('boss intro cards: English, per stage, Stage 3 names the Spire Warden', () => {
  assert.equal(BOSS_INTRO_CARDS[1].name, 'CORE WARDEN');
  assert.equal(BOSS_INTRO_CARDS[3].name, 'SPIRE WARDEN');
  assert.equal(BOSS_INTRO_CARDS[2].name, 'SLAG FOREMAN');
  for (const c of Object.values(BOSS_INTRO_CARDS)) {
    for (const t of [c.kicker, c.name, c.sub]) {
      assert.match(t, /^[A-Z0-9 /]+$/, `plain English caps: ${t}`);
      assert.doesNotMatch(t, /kiro|judge/i);
    }
  }
});

function observeWith(fx: FxDirector, w: WorldState3D, mutate: () => void): void {
  fx.observe(w, true);
  w.tick++;
  w.events = [];
  mutate();
  fx.observe(w);
}

test('Foreman hit adds shake on top of the stalker hit; the world is not touched', () => {
  const mk = (variant: 'foreman' | 'none'): number => {
    const w = newWorld3D({ stage: 2 });
    const f = w.enemies.find((e) => e.id === STAGE2_FOREMAN_ID)!;
    f.variant = variant;
    w.player.body.x = f.x - 3;
    const fx = new FxDirector();
    const hpBefore = w.player.hp;
    observeWith(fx, w, () => {
      f.hp -= 20;
    });
    assert.equal(w.player.hp, hpBefore, 'display fx never writes the world');
    assert.equal(f.alive, true);
    return fx.telemetry().trauma;
  };
  assert.ok(mk('foreman') > mk('none'), 'foreman hits read heavier');
});

test('vent burst feel: close bursts shake, far ones do not', () => {
  const run = (dx: number): number => {
    const w = newWorld3D({ stage: 3 });
    const vent = w.level.hazards.find((h) => h.kind === 'vent')!;
    // Pick a tick where the vent is active: scan forward deterministically
    const fx = new FxDirector();
    w.player.body.x = vent.x + dx;
    w.player.body.y = vent.y;
    let found = false;
    for (let t = 1; t < 2000 && !found; t++) {
      w.tick = t;
      found = hazardActive(w, vent);
    }
    assert.ok(found, 'vent reaches its active phase');
    w.tick--; // observeWith steps one tick forward onto the active phase
    observeWith(fx, w, () => {
      w.events.push({ type: 'hazard_vent', value: 1 });
    });
    return fx.telemetry().trauma;
  };
  assert.ok(run(1) > 0.05, 'near burst shakes');
  assert.equal(run(VENT_FEEL_RANGE + 3), 0, 'far burst is quiet');
});

function hazardActive(w: WorldState3D, h: WorldState3D['level']['hazards'][number]): boolean {
  const t = hazardNowTick3D(w, h);
  return t >= 0 && hazardPhase(h, t) === 'active';
}

test('r21: Onboarding console hint is stage-aware (no red-lock text outside Stage 1)', async () => {
  const { Onboarding } = await import('../src/ui/flow.ts');
  for (const stage of [2, 3] as const) {
    const w = newWorld3D({ stage });
    const door = w.level.solids.find((s) => s.doorLock === 'console' && s.doorId);
    assert.ok(door, `stage ${stage} has a console gate`);
    w.player.body.x = (door.minX + door.maxX) / 2 - 2;
    w.player.body.y = (door.minY + door.maxY) / 2;
    w.tick = 100;
    const hint = new Onboarding().update(w);
    assert.equal(hint?.id, 'door-console');
    assert.doesNotMatch(hint!.text, /red|Vault/i);
  }
});

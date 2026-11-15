import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot3D } from '../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import { FxDirector } from '../src/render3d/fx3d.ts';
import { CHUNK_CAPACITY, DECAL_CAPACITY, GoreSim } from '../src/render3d/gore3d.ts';
import { DEATH_STYLE, WEAPON_IMPACT, WEAPON_TAGS, impactStyle, weaponFromSlot } from '../src/render3d/vfxStyle3d.ts';

test('all six weapons have distinct impact looks', () => {
  assert.equal(WEAPON_TAGS.length, 6);
  const shapes = new Set(WEAPON_TAGS.map((t) => WEAPON_IMPACT[t].shape));
  assert.equal(shapes.size, 5, 'grenade and rocket share the flash shape but differ in size and freeze');
  const sig = new Set(WEAPON_TAGS.map((t) => { const s = WEAPON_IMPACT[t]; return [s.rgb.join(','), s.hitStop, s.trauma, s.sparks].join('|'); }));
  assert.equal(sig.size, 6, 'six colour/hit-stop/trauma/spark signatures');
  assert.ok(WEAPON_IMPACT.rail.hitStop > WEAPON_IMPACT.pulse.hitStop, 'rail has the longest freeze');
  assert.equal(Math.max(...WEAPON_TAGS.map((t) => WEAPON_IMPACT[t].hitStop)), WEAPON_IMPACT.rail.hitStop);
  assert.equal(WEAPON_IMPACT.flamer.hitStop, 0, 'flamer ticks never freeze');
  for (const t of WEAPON_TAGS) assert.equal(weaponFromSlot([1, 2, 3, 4, 5, 6][WEAPON_TAGS.indexOf(t)]) !== undefined, true);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(weaponFromSlot), ['pulse', 'scatter', 'grenade', 'rail', 'flamer', 'rocket']);
});

test('crit and armour variants differ from normal hits', () => {
  for (const t of WEAPON_TAGS) {
    const n = impactStyle(t, 'normal');
    const c = impactStyle(t, 'crit');
    const a = impactStyle(t, 'armor');
    assert.equal(c.shape, 'crit');
    assert.equal(a.shape, 'ping');
    assert.ok(c.sparks > n.sparks || c.ringSize > n.ringSize);
    assert.ok(c.rgb[0] > 0.9 && c.rgb[1] > 0.8, 'gold-white');
    assert.ok(a.rgb[2] > a.rgb[0], 'cold metal');
    assert.ok(c.hitStop >= n.hitStop);
  }
});

test('deaths differ per kind', () => {
  const k = ['crawler', 'spitter', 'stalker', 'warden', 'hive'] as const;
  assert.ok(DEATH_STYLE.crawler.chunkMul > DEATH_STYLE.spitter.chunkMul);
  assert.ok(DEATH_STYLE.stalker.chunkSpeedMul < DEATH_STYLE.crawler.chunkSpeedMul, 'stalker settles heavier');
  assert.ok(DEATH_STYLE.warden.waves > DEATH_STYLE.hive.waves);
  assert.equal(new Set(k.map((x) => JSON.stringify(DEATH_STYLE[x]))).size, 5);
});

test('gore pools stay in capacity after many staged kills and waves, and are deterministic', () => {
  const run = (): number[] => {
    const g = new GoreSim();
    for (let i = 0; i < 40; i++) {
      g.spawnKill(i % 2 ? 'crawler' : 'warden', i, 1, 0, 1, 1.6, 0.8);
      g.spawnWave('warden', i, 1, 0, -1, 8, 0.8);
      g.update(1 / 60);
      assert.ok(g.chunks.count <= CHUNK_CAPACITY && g.decals.count <= DECAL_CAPACITY);
    }
    return [g.chunks.count, g.decals.count, Math.round(g.chunks.x[0] * 1000)];
  };
  assert.deepEqual(run(), run());
  const off = new GoreSim();
  off.level = 'off';
  off.spawnWave('warden', 0, 1, 0, 1, 20);
  assert.equal(off.chunks.count, 0, 'goreScale respected');
});

test('director infers weapons over a bot run, deterministically, within pool bounds', () => {
  const run = (): string => {
    const w0 = newWorld3D();
    const bot = createBot3D(w0);
    const fx = new FxDirector();
    let w = w0;
    const seen = new Set<string>();
    for (let i = 0; i < 2400 && w.status === 'playing'; i++) {
      w = stepWorld3D(w, bot.next(w));
      fx.observe(w);
      fx.update(1 / 60, w);
      seen.add(fx.weaponTag);
      assert.ok(fx.gore.chunks.count <= CHUNK_CAPACITY && fx.gore.decals.count <= DECAL_CAPACITY);
    }
    return [...seen].sort().join(',') + '|' + fx.telemetry().emitted;
  };
  const a = run();
  assert.equal(a, run());
  assert.ok(a.split('|')[0].length > 0);
});

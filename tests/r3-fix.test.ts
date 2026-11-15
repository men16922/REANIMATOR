// R3 bug-fix regressions: logo, CONTINUE visibility, texture keys, chroma, Warden materials, cinematic clock, objective.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { buildLogoSvg } from '../src/ui/brand.ts';
import { objectiveFor, OBJECTIVES, type ObjectiveWorld } from '../src/ui/objective.ts';
import { nextIntroDisplayTicks, introState } from '../src/render3d/cinematic3d.ts';
import { additive } from '../src/render3d/bossTelegraph3d.ts';
import { tuneWardenMaterials3D, WARDEN_EMISSIVE_PEAK_3D } from '../src/render3d/riggedModels.ts';
import { newWorld3D, BOSS_INTRO_TICKS } from '../src/game3d/world3d.ts';

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('logo: glyph placement is not on the animated element (CSS transform would override it)', () => {
  const svg = buildLogoSvg('t');
  const paths = svg.match(/<path class="lt"[^>]*>/g) ?? [];
  assert.ok(paths.length > 0);
  for (const p of paths) assert.ok(!/transform=/.test(p), p);
  assert.ok(/<g transform="translate\([\d.]+ [\d.]+\)"><path class="lt"/.test(svg));
});

test('logo: two instances on one page share no id', () => {
  const ids = (s: string): string[] => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const all = [...ids(buildLogoSvg('t')), ...ids(buildLogoSvg('l'))];
  assert.equal(new Set(all).size, all.length);
  for (const svg of [buildLogoSvg('t'), buildLogoSvg('l')]) {
    const defined = new Set(ids(svg));
    for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(defined.has(m[1]), `dangling ${m[1]}`);
  }
});

test('css: hidden menu buttons stay hidden (button.mi sets display:flex)', () => {
  assert.ok(/button\.mi\[hidden\]\s*\{\s*display:\s*none/.test(read('src/ui/style.css')));
});

test('textures: every tex.<key> the renderer reads exists in FacilityTextures3D', () => {
  const iface = read('src/render3d/textures3d.ts').match(/interface FacilityTextures3D \{([\s\S]*?)\n\}/)![1];
  const keys = new Set([...iface.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]));
  const dir = new URL('../src/render3d/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\btex\.(\w+)/g)) {
      if (['anisotropy', 'colorSpace', 'repeat', 'offset', 'wrapS', 'wrapT', 'needsUpdate', 'clone'].includes(m[1])) continue;
      assert.ok(keys.has(m[1]), `${f}: tex.${m[1]} is not a FacilityTextures3D key`);
    }
  }
  const surf = read('src/render3d/scene3dFull.ts').match(/type TexKey = ([^;]+);/)![1];
  for (const m of surf.matchAll(/'(\w+)'/g)) assert.ok(keys.has(m[1]), `TexKey ${m[1]}`);
});

test('materials: additive() without a map never passes map: undefined (three.js warns once per material)', () => {
  const warned: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => { warned.push(a.join(' ')); };
  try {
    additive(0xff3b2f);
    additive(0xff3b2f, new THREE.Texture());
  } finally {
    console.warn = orig;
  }
  assert.deepEqual(warned, []);
});

test('post pass: resting chromatic aberration is near zero, kick stays bounded', () => {
  const m = read('src/render3d/fx3dGfx.ts').match(/float k = ([\d.]+) \+ uChroma \* ([\d.]+);/)!;
  assert.ok(Number(m[1]) <= 0.0005, 'base offset');
  assert.ok(Number(m[2]) <= 0.012, 'kick scale');
});

test('warden materials: dark, metallic, opaque, emissive capped', () => {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.9, transparent: true, opacity: 0.5, emissive: 0xffffff });
  const base = [mat.emissive.clone()];
  tuneWardenMaterials3D([mat], base);
  assert.ok(mat.metalness >= 0.8);
  assert.ok(mat.color.r < 0.7);
  assert.equal(mat.transparent, false);
  assert.equal(mat.opacity, 1);
  assert.ok(Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) <= WARDEN_EMISSIVE_PEAK_3D + 1e-9);
});

test('cinematic clock: follows the sim while it ticks, runs on real time while the world is frozen', () => {
  assert.equal(nextIntroDisplayTicks(0, 0, 210, 0.016), 210);
  assert.equal(nextIntroDisplayTicks(210, 210, 209, 0.016), 209);
  let d = 131;
  for (let i = 0; i < 60; i++) d = nextIntroDisplayTicks(d, 131, 131, 1 / 60);
  assert.ok(Math.abs(d - 71) < 1e-6, `one second frozen consumes 60 ticks, got ${d}`);
  for (let i = 0; i < 600; i++) d = nextIntroDisplayTicks(d, 131, 131, 1 / 60);
  assert.equal(d, 1);
  assert.equal(nextIntroDisplayTicks(5, 5, 0, 0.016), 0);
  // frozen intro reaches the title card and the pan to the boss
  let seenTitle = 0;
  let seenPan = 0;
  let t = 131;
  for (let i = 0; i < 130; i++) {
    t = nextIntroDisplayTicks(t, 131, 131, 1 / 60);
    const s = introState(t, BOSS_INTRO_TICKS);
    seenTitle = Math.max(seenTitle, s.title);
    seenPan = Math.max(seenPan, s.pan);
  }
  assert.ok(seenTitle > 0.9 && seenPan > 0.99);
});

function ow(patch: (w: ReturnType<typeof newWorld3D>) => void): ObjectiveWorld {
  const w = newWorld3D();
  patch(w);
  return w;
}

test('objective: derived from world state, not the stored phase', () => {
  assert.equal(objectiveFor(ow(() => {})), OBJECTIVES.console);
  // console armed via debug setup (phase still "console"), still outside the vault
  assert.equal(objectiveFor(ow((w) => { w.consoleUnlocked = true; })), OBJECTIVES.vault);
  // armed and inside the vault with the boss alive
  assert.equal(objectiveFor(ow((w) => { w.consoleUnlocked = true; w.currentRoom = 'core'; })), OBJECTIVES.warden);
  // boss dead, core standing
  assert.equal(
    objectiveFor(ow((w) => { w.consoleUnlocked = true; w.currentRoom = 'core'; for (const e of w.enemies) if (e.kind === 'warden') e.alive = false; })),
    OBJECTIVES.core,
  );
  // meltdown
  assert.equal(objectiveFor(ow((w) => { w.coreDestroyed = true; w.meltdownTicks = 100; })), OBJECTIVES.escape);
  assert.equal(objectiveFor(ow((w) => { w.status = 'won'; })), OBJECTIVES.won);
  // deterministic
  const w = ow((x) => { x.consoleUnlocked = true; });
  assert.deepEqual(objectiveFor(w), objectiveFor(w));
});

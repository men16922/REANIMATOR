// R16 tutorial: ordered one-at-a-time prompts, skip/replay, ability steps, and a default HUD with no control list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyInput3D, newWorld3D, stepWorld3D } from '../src/game3d/world3d.ts';
import { Tutorial, TUTORIAL_STEPS, parseTutorialSaved } from '../src/ui/tutorial.ts';
import { Onboarding } from '../src/ui/flow.ts';

const idle = emptyInput3D();

test('tutorial teaches move, jump, fire in order and shows one prompt at a time', () => {
  const w = newWorld3D();
  for (let i = 0; i < 100; i++) stepWorld3D(w, idle);
  const t = new Tutorial();
  assert.equal(t.update(w)?.id, 'move');
  t.observe({ ...idle, moveX: 1 });
  assert.equal(t.update(w)?.id, 'jump');
  t.observe({ ...idle, jump: true });
  assert.equal(t.update(w)?.id, 'fire');
  t.observe({ ...idle, fire: true });
  assert.equal(t.update(w)?.id, 'weapon');
  assert.deepEqual([...t.done], ['move', 'jump', 'fire']);
});

test('tutorial waits for the opening, then skip and replay work and persist', () => {
  const w = newWorld3D();
  const t = new Tutorial();
  assert.equal(t.update(w), null, 'nothing before the opening ends');
  for (let i = 0; i < 100; i++) stepWorld3D(w, idle);
  t.skip();
  assert.equal(t.update(w), null);
  t.observe({ ...idle, moveX: 1 });
  assert.equal(t.done.size, 0, 'skipped tutorial records nothing');
  t.replay();
  assert.equal(t.update(w)?.id, 'move');
  const back = new Tutorial(parseTutorialSaved(JSON.stringify(t)));
  assert.equal(back.on, true);
  assert.equal(parseTutorialSaved('not json'), null);
});

test('ability steps only appear once the ability is acquired and retire on their own', () => {
  const w = newWorld3D();
  for (let i = 0; i < 1300; i++) stepWorld3D(w, idle);
  const t = new Tutorial({ on: true, done: ['move', 'jump', 'fire', 'weapon', 'dash', 'counter', 'scan'] });
  assert.equal(t.update(w), null);
  w.player.abilities.blastCore = true;
  assert.equal(t.update(w)?.id, 'blast');
  t.observe({ ...idle, fire: true }, true, 3);
  assert.equal(t.update(w), null);
  w.player.abilities.thermalPlating = true;
  assert.equal(t.update(w)?.id, 'thermal');
  for (let i = 0; i < 1000; i++) t.update(w);
  assert.ok(t.done.has('thermal'), 'a prompt that is never acted on times out');
});

test('double jump is detected from a second press in the air', () => {
  const w = newWorld3D();
  for (let i = 0; i < 100; i++) stepWorld3D(w, idle);
  w.player.abilities.thrusterBoots = true;
  const t = new Tutorial({ on: true, done: ['move', 'jump', 'fire', 'weapon', 'dash', 'counter', 'scan'] });
  t.observe({ ...idle, jump: true }, true);
  t.observe({ ...idle, jump: false }, false);
  t.observe({ ...idle, jump: true }, false);
  assert.equal(t.update(w), null);
  assert.ok(t.done.has('boots'));
});

test('every tutorial step has an id, text and unique id', () => {
  const ids = TUTORIAL_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(TUTORIAL_STEPS.every((s) => s.text.length > 0));
});

test('contextual hints stay but the basic-controls tutorial moves out of Onboarding when basics=false', () => {
  const w = newWorld3D();
  for (let i = 0; i < 100; i++) stepWorld3D(w, idle);
  assert.equal(new Onboarding().update(w)?.id, 'move');
  assert.equal(new Onboarding().update(w, false), null);
});

test('default HUD no longer lists every control or skill', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const hud = html.slice(html.indexOf('id="sector-hint"'), html.indexOf('id="sector-hint"') + 40);
  assert.match(hud, /<\/span>/);
  assert.doesNotMatch(html, /<span id="sector-hint">[^<]+<\/span>/);
  assert.doesNotMatch(html, /id="(boots|blast|lens|thermal)-pill"/);
  assert.doesNotMatch(html, /SCAN \[Z\]|LIGHT \[E\]/);
  assert.match(html, /id="controls-panel"/, 'full controls reference stays on the pause screen');
});

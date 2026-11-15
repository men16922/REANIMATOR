// Lore data, reader state machine and ending branches (R8 lore track). Pure, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorld3D } from '../src/game3d/world3d.ts';
import { SECTOR_SUBTITLE } from '../src/ui/flow.ts';
import {
  ENDING_VARIANT, CREDITS_LINES, INTRO_LINES, LOG_WORDS_MAX, LOG_WORDS_MIN, LORE_LOGS, SECTOR_SUB, countWords, endingText, endingTier, loreLogById, otherLang, pickLang,
} from '../src/ui/lore.ts';
import { ENCRYPTED_LABEL, LOG_FREEZE_S, READER_GUARD_S, TYPE_CPS, archiveRows, canOpen, openReader, pressReader, tickReader, visibleBody } from '../src/ui/logReader.ts';

const level = newWorld3D().level;

test('six logs, one per sector, ids match the level data logs, reading order 1..6', () => {
  assert.equal(LORE_LOGS.length, 6);
  assert.deepEqual(new Set(LORE_LOGS.map((l) => l.sector)).size, 6);
  for (const dl of level.dataLogs) {
    const e = loreLogById(dl.id);
    assert.ok(e, `${dl.id} has lore`);
    assert.equal(e.sector, dl.sector);
  }
  assert.deepEqual(LORE_LOGS.map((l) => l.order), [1, 2, 3, 4, 5, 6]);
});

test('every log has English and Korean text, the English body is 60-100 words, and Korean is a real translation', () => {
  for (const l of LORE_LOGS) {
    const w = countWords(l.body.en);
    assert.ok(w >= LOG_WORDS_MIN && w <= LOG_WORDS_MAX, `${l.id} has ${w} words`);
    for (const f of [l.title, l.speaker, l.body]) {
      assert.ok(f.en.trim().length > 0 && f.ko.trim().length > 0, l.id);
      assert.notEqual(f.en, f.ko);
    }
    assert.match(l.body.ko, /[\uAC00-\uD7A3]/, `${l.id} Korean body uses Hangul`);
    assert.doesNotMatch(l.body.en, /[\uAC00-\uD7A3]/);
    assert.ok(l.stamp.length > 0);
    assert.ok(!/\u2014/.test(l.body.en + l.body.ko), 'no em dashes');
  }
});

test('the story reveals in order: the last log names the Warden and the meltdown, the fourth names the operative', () => {
  const by = (n: number) => LORE_LOGS[n - 1].body.en;
  assert.match(by(1), /Pod Nine/);
  assert.match(by(4), /Kade Maren/);
  assert.match(LORE_LOGS[4].speaker.en, /Varga/);
  assert.match(by(5), /Kade/);
  assert.match(by(6), /meltdown/i);
  assert.match(LORE_LOGS[5].speaker.en, /Warden/);
  assert.match(ENDING_VARIANT.true.en, /Kade Maren/);
});

test('language pick: stored preference wins, then browser language, default English', () => {
  assert.equal(pickLang(null, 'en-US'), 'en');
  assert.equal(pickLang(null, 'ko-KR'), 'ko');
  assert.equal(pickLang(null, 'ko'), 'ko');
  assert.equal(pickLang('en', 'ko-KR'), 'en');
  assert.equal(pickLang('ko', 'en-US'), 'ko');
  assert.equal(pickLang('fr', 'fr-FR'), 'en');
  assert.equal(pickLang(undefined, undefined), 'en');
  assert.equal(otherLang('en'), 'ko');
});

test('sector subtitles and intro: every sector has both languages, flow.ts uses the English text', () => {
  for (const r of level.rooms) {
    assert.ok(SECTOR_SUB[r.sector].en.length > 0 && SECTOR_SUB[r.sector].ko.length > 0, r.sector);
    assert.equal(SECTOR_SUBTITLE[r.sector], SECTOR_SUB[r.sector].en);
  }
  assert.equal(INTRO_LINES.length, 4);
  // The intro lines are revealed on a fixed CSS timeline of about 9.8 s; keep the copy short enough for it.
  for (const l of INTRO_LINES) assert.ok(l.en.length <= 80 && l.ko.length > 0);
});

test('ending tiers: <50 low, 50-99 mid, 100 true; true ending adds a distinct paragraph', () => {
  assert.equal(endingTier(0), 'low');
  assert.equal(endingTier(49), 'low');
  assert.equal(endingTier(50), 'mid');
  assert.equal(endingTier(99), 'mid');
  assert.equal(endingTier(100), 'true');
  const texts = [0, 60, 100].map((p) => endingText(p, 'en'));
  assert.equal(new Set(texts.map((t) => t.paragraphs[1])).size, 3);
  assert.equal(new Set(texts.map((t) => t.heading)).size, 3);
  assert.equal(texts[0].paragraphs[0], texts[2].paragraphs[0], 'the base paragraph is shared');
  assert.match(texts[2].heading, /TRUE/);
  assert.match(endingText(100, 'ko').paragraphs[1], /[\uAC00-\uD7A3]/);
  assert.ok(CREDITS_LINES.length >= 6 && CREDITS_LINES.length <= 14, 'credits stay short');
});

test('reader state machine: types out, ignores keys during the guard, first key completes, second closes', () => {
  const e = LORE_LOGS[0];
  let s = openReader(e, 'en', 'pickup');
  assert.equal(s.phase, 'typing');
  assert.equal(visibleBody(s), '');
  assert.deepEqual(pressReader(s), s, 'guard time ignores the key');
  s = tickReader(s, 1);
  assert.equal(s.shown, TYPE_CPS);
  assert.equal(visibleBody(s), e.body.en.slice(0, TYPE_CPS));
  const skipped = pressReader(s);
  assert.equal(skipped.phase, 'done');
  assert.equal(visibleBody(skipped), e.body.en);
  assert.equal(pressReader(skipped).phase, 'closed');
  // natural completion
  const full = tickReader(s, e.body.en.length / TYPE_CPS + 1);
  assert.equal(full.phase, 'done');
  assert.equal(full.shown, full.total);
  assert.equal(pressReader(full).phase, 'closed');
  // closed stays closed
  const closed = pressReader(full);
  assert.equal(tickReader(closed, 1), closed);
  assert.equal(pressReader(closed), closed);
  assert.ok(READER_GUARD_S < 0.5 && LOG_FREEZE_S > 0 && LOG_FREEZE_S < 1);
});

test('reader uses the chosen language and the archive keeps order', () => {
  const ko = openReader(LORE_LOGS[2], 'ko', 'archive');
  assert.equal(ko.total, LORE_LOGS[2].body.ko.length);
  assert.equal(visibleBody(tickReader(ko, 100)), LORE_LOGS[2].body.ko);
  assert.equal(ko.from, 'archive');
});

test('archive: found logs show their title, missing ones are [ENCRYPTED] and cannot be opened', () => {
  const none = archiveRows(new Set(), 'en');
  assert.equal(none.length, 6);
  assert.ok(none.every((r) => !r.unlocked && r.label === ENCRYPTED_LABEL));
  const some = archiveRows(new Set(['log_mines', 'log_core']), 'ko');
  assert.deepEqual(some.map((r) => r.unlocked), [false, false, true, false, false, true]);
  assert.equal(some[2].label, loreLogById('log_mines')!.title.ko);
  assert.equal(some[0].label, '[ENCRYPTED]');
  assert.deepEqual(some.map((r) => r.order), [1, 2, 3, 4, 5, 6]);
  assert.equal(canOpen(new Set(['log_mines']), 'log_mines'), true);
  assert.equal(canOpen(new Set(['log_mines']), 'log_core'), false);
  assert.equal(canOpen(new Set(['nope']), 'nope'), false);
});

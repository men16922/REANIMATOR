// Pure data log helpers (no DOM). A pickup shows a transient toast (title + short excerpt) that fades by itself: the
// game never pauses and no input is captured. The full text lives in the pause archive, where a modal reader is fine
// because the game is already paused. Reader: keys are ignored for a short guard time so a held key cannot dismiss it;
// after that the first key finishes the typing and the next one closes the reader.

import { LORE_LOGS, type Lang, type LoreLog } from './lore.ts';

export const ENCRYPTED_LABEL = '[ENCRYPTED]';
/** Toast timing (seconds): fully visible for HOLD, then fades over FADE. */
export const TOAST_HOLD_S = 3.2;
export const TOAST_FADE_S = 0.8;
export const TOAST_TOTAL_S = TOAST_HOLD_S + TOAST_FADE_S;
/** Longest excerpt (characters) shown in the toast. */
export const TOAST_EXCERPT_CHARS = 110;

export interface LogToast {
  id: string;
  title: string;
  excerpt: string;
  elapsed: number;
}

/** Short excerpt: the first sentence(s) up to TOAST_EXCERPT_CHARS, cut at a word with an ellipsis if longer. */
export function toastExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  if (flat.length <= TOAST_EXCERPT_CHARS) return flat;
  const cut = flat.slice(0, TOAST_EXCERPT_CHARS);
  const sp = cut.lastIndexOf(' ');
  return `${cut.slice(0, sp > 40 ? sp : TOAST_EXCERPT_CHARS).trimEnd()}...`;
}

export function openToast(entry: LoreLog, lang: Lang): LogToast {
  return { id: entry.id, title: entry.title[lang], excerpt: toastExcerpt(entry.body[lang]), elapsed: 0 };
}

/** Advance the toast; null once it has fully faded. */
export function tickToast(t: LogToast | null, dt: number): LogToast | null {
  if (!t) return null;
  const elapsed = t.elapsed + Math.max(0, dt);
  return elapsed >= TOAST_TOTAL_S ? null : { ...t, elapsed };
}

/** 0..1 opacity of the toast at its current age. */
export function toastOpacity(t: LogToast): number {
  if (t.elapsed <= TOAST_HOLD_S) return Math.min(1, t.elapsed / 0.2);
  return Math.max(0, 1 - (t.elapsed - TOAST_HOLD_S) / TOAST_FADE_S);
}
/** Typing speed, characters per second. Counted per character. */
export const TYPE_CPS = 70;
/** Seconds after opening in which key presses are ignored. */
export const READER_GUARD_S = 0.35;

export type ReaderPhase = 'typing' | 'done' | 'closed';

export interface ReaderState {
  id: string;
  lang: Lang;
  phase: ReaderPhase;
  elapsed: number;
  /** Characters revealed so far. */
  shown: number;
  total: number;
  /** Where to go on close: back into the game or back to the archive list. */
  from: 'pickup' | 'archive';
}

export function openReader(entry: LoreLog, lang: Lang, from: 'pickup' | 'archive'): ReaderState {
  return { id: entry.id, lang, phase: 'typing', elapsed: 0, shown: 0, total: entry.body[lang].length, from };
}

export function tickReader(s: ReaderState, dt: number): ReaderState {
  if (s.phase !== 'typing') return s.phase === 'closed' ? s : { ...s, elapsed: s.elapsed + dt };
  const elapsed = s.elapsed + dt;
  const shown = Math.min(s.total, Math.floor(elapsed * TYPE_CPS));
  return { ...s, elapsed, shown, phase: shown >= s.total ? 'done' : 'typing' };
}

/** Result of a key press: guard time ignores it, typing completes, done closes. */
export function pressReader(s: ReaderState): ReaderState {
  if (s.phase === 'closed' || s.elapsed < READER_GUARD_S) return s;
  if (s.phase === 'typing') return { ...s, phase: 'done', shown: s.total };
  return { ...s, phase: 'closed' };
}

export function visibleBody(s: ReaderState): string {
  const e = LORE_LOGS.find((l) => l.id === s.id);
  return e ? e.body[s.lang].slice(0, s.shown) : '';
}

export interface ArchiveRow {
  id: string;
  order: number;
  unlocked: boolean;
  /** Real title when found, otherwise [ENCRYPTED]. */
  label: string;
  /** Sector tag shown next to the row, kept visible so players know where to look. */
  sector: string;
}

/** Archive list in reading order. takenIds are the ids of collected logs. */
export function archiveRows(takenIds: ReadonlySet<string>, lang: Lang): ArchiveRow[] {
  return [...LORE_LOGS]
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const unlocked = takenIds.has(l.id);
      return { id: l.id, order: l.order, unlocked, label: unlocked ? l.title[lang] : ENCRYPTED_LABEL, sector: l.sector };
    });
}

/** Archive rows are only openable when found. */
export function canOpen(takenIds: ReadonlySet<string>, id: string): boolean {
  return takenIds.has(id) && LORE_LOGS.some((l) => l.id === id);
}

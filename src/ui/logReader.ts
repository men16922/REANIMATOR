// Pure data log reader state machine (no DOM). A pickup freezes the game for a beat, then the reader types the log
// out. Keys are ignored for a short guard time so a held run key cannot dismiss it; after that the first key
// finishes the typing and the next one closes the reader. The pause archive reuses the same machine.

import { LORE_LOGS, type Lang, type LoreLog } from './lore.ts';

export const ENCRYPTED_LABEL = '[ENCRYPTED]';
/** Freeze (seconds) between the pickup and the reader opening. */
export const LOG_FREEZE_S = 0.6;
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

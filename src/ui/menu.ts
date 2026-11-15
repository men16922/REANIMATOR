// Pure title-menu logic (no DOM) so keyboard navigation can be tested under node.

export type TitlePanel = 'settings' | 'extras' | 'controls' | 'credits';

export interface MenuItem {
  id: string;
  label: string;
  /** Only shown when a save exists. */
  needsSave?: boolean;
}

/** First-screen menu: only these entries. Each id is the DOM id of its button. */
export const TITLE_MENU: readonly MenuItem[] = [
  { id: 'play', label: 'PLAY' },
  { id: 'continue', label: 'CONTINUE', needsSave: true },
  { id: 'settings-open', label: 'SETTINGS' },
  { id: 'extras-open', label: 'EXTRAS' },
];

/** Menu entries currently available. */
export function visibleMenu(hasSave: boolean): MenuItem[] {
  return TITLE_MENU.filter((m) => !m.needsSave || hasSave);
}

/** Wrap-around step through `count` entries. `from` of -1 means nothing focused yet. */
export function stepIndex(from: number, dir: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (from < 0) return dir === 1 ? 0 : count - 1;
  return (from + dir + count) % count;
}

export type MenuKeyAction = 'next' | 'prev' | 'activate' | 'back' | 'none';

/** Map a KeyboardEvent.code to a menu action. */
export function menuKeyAction(code: string): MenuKeyAction {
  if (code === 'ArrowDown') return 'next';
  if (code === 'ArrowUp') return 'prev';
  if (code === 'Enter' || code === 'NumpadEnter') return 'activate';
  if (code === 'Escape') return 'back';
  return 'none';
}

/** Which panel id (DOM) belongs to a title panel name. */
export const PANEL_IDS: Record<TitlePanel, string> = {
  settings: 'settings-panel',
  extras: 'extras-panel',
  controls: 'title-controls',
  credits: 'title-credits',
};

/** Loading progress 0..1 from counts; failed models count as settled so the bar never hangs. */
export function loadProgress(loaded: number, failed: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (loaded + failed) / total));
}

// Pure overlay-panel rules (no DOM) so the stacking contract can be tested under node.
// main.ts reads the open/closed state of the real elements into a PanelState, and this module decides
// which single layer owns the top and whether the title chrome (logo, menu, tagline) must step aside.

import { PANEL_IDS, type TitlePanel } from './menu.ts';

export type UiMode = 'title' | 'playing' | 'paused' | 'result' | 'showcase';

export interface PanelState {
  mode: UiMode;
  /** Open title sub panel (settings, extras, controls, credits, demo), if any. */
  titlePanel: TitlePanel | null;
  /** Restoration Lab and "How it was revived" open over the title. Only valid in title mode. */
  lab: boolean;
  revived: boolean;
  /** Controls grid inside the pause menu. Only valid while paused. */
  pauseControls: boolean;
  /** LOGS archive inside the pause menu. Only valid while paused. */
  logArchive: boolean;
  /** Data log reader (Metroid scan style). Opens over the frozen game or over the archive. Not valid on the title or result. */
  logReader: boolean;
  /** Short credits roll over the won result screen. Only valid in result mode. */
  creditsRoll: boolean;
}

/** DOM id of the single layer that owns the top of the stack, or null when only the canvas is showing. */
export function topLayer(s: PanelState): string | null {
  if (s.mode === 'title') {
    if (s.lab) return 'lab';
    if (s.revived) return 'revived';
    if (s.titlePanel) return PANEL_IDS[s.titlePanel];
    return 'title';
  }
  if (s.logReader && (s.mode === 'playing' || s.mode === 'paused')) return 'log-reader';
  if (s.mode === 'paused') return s.logArchive ? 'log-archive' : s.pauseControls ? 'controls-panel' : 'pause';
  if (s.mode === 'result') return s.creditsRoll ? 'credits-roll' : 'result';
  return null;
}

/** True when the title logo and main menu must be hidden: any panel is open over the title. */
export function titleCovered(s: PanelState): boolean {
  return s.mode === 'title' && topLayer(s) !== 'title';
}

/** Every layer id this contract manages. */
export const LAYER_IDS: readonly string[] = ['title', ...Object.values(PANEL_IDS), 'lab', 'revived', 'pause', 'controls-panel', 'log-archive', 'log-reader', 'result', 'credits-roll'];

/** Which managed layers may be visible for a state. Several can be (the title stays under its panels); the top one wins. */
export function visibleLayers(s: PanelState): string[] {
  const out: string[] = [];
  if (s.mode === 'title') {
    out.push('title');
    if (s.titlePanel) out.push(PANEL_IDS[s.titlePanel]);
    if (s.lab) out.push('lab');
    if (s.revived) out.push('revived');
  } else if (s.mode === 'paused') {
    out.push('pause');
    if (s.pauseControls) out.push('controls-panel');
    if (s.logArchive) out.push('log-archive');
    if (s.logReader) out.push('log-reader');
  } else if (s.mode === 'result') {
    out.push('result');
    if (s.creditsRoll) out.push('credits-roll');
  } else if (s.mode === 'playing' && s.logReader) {
    out.push('log-reader');
  }
  return out;
}

/** Drop combinations that cannot happen (Lab while playing, pause controls on the title, ...). */
export function normalizePanelState(s: PanelState): PanelState {
  const title = s.mode === 'title';
  return {
    mode: s.mode,
    titlePanel: title ? s.titlePanel : null,
    lab: title && s.lab,
    revived: title && s.revived,
    pauseControls: s.mode === 'paused' && s.pauseControls,
    logArchive: s.mode === 'paused' && s.logArchive,
    creditsRoll: s.mode === 'result' && s.creditsRoll,
    logReader: (s.mode === 'playing' || s.mode === 'paused') && s.logReader,
  };
}

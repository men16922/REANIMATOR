// Campaign progress across stages: which stages are cleared, best clear times. Pure parse/serialize helpers
// (the DOM layer owns localStorage). Old or corrupt saves default-merge: every missing field gets its default.

import { isStageId3D, STAGE_IDS_3D } from './stages3d.ts';
import type { StageClear3D, StageId3D } from './types3d.ts';
import type { PlayerAbilities3D } from './world3d.ts';

export const STAGE_PROGRESS_KEY = 'reanimator.stages.v1';

export const STAGE_TITLES: Record<StageId3D, { name: string; subtitle: string }> = {
  1: { name: 'Cryo Facility', subtitle: 'Six sectors, one reactor. Break the core and get out.' },
  2: { name: 'Foundry Line', subtitle: 'Cut through the dead foundry. Every door has a trigger.' },
  3: { name: 'Reactor Spire', subtitle: 'Break the Spire. The Warden holds the last teleporter.' },
};

export interface StageProgress {
  cleared: Record<StageId3D, boolean>;
  /** Best clear time in seconds, null until the stage is cleared. */
  best: Record<StageId3D, number | null>;
}

export function defaultProgress(): StageProgress {
  return { cleared: { 1: false, 2: false, 3: false }, best: { 1: null, 2: null, 3: null } };
}

/** Default-merge parse: unknown keys are dropped, wrong types fall back to the default, never throws. */
export function parseProgress(raw: string | null | undefined): StageProgress {
  const out = defaultProgress();
  let o: unknown;
  try {
    o = JSON.parse(raw ?? 'null');
  } catch {
    return out;
  }
  if (!o || typeof o !== 'object') return out;
  const rec = o as { cleared?: unknown; best?: unknown };
  const cl = rec.cleared && typeof rec.cleared === 'object' ? (rec.cleared as Record<string, unknown>) : {};
  const be = rec.best && typeof rec.best === 'object' ? (rec.best as Record<string, unknown>) : {};
  for (const s of STAGE_IDS_3D) {
    const t = be[String(s)];
    const hasTime = typeof t === 'number' && Number.isFinite(t) && t > 0;
    out.best[s] = hasTime ? t : null;
    out.cleared[s] = cl[String(s)] === true || hasTime;
  }
  return out;
}

export function serializeProgress(p: StageProgress): string {
  const cleared: Record<string, boolean> = {};
  const best: Record<string, number | null> = {};
  for (const s of STAGE_IDS_3D) {
    cleared[String(s)] = p.cleared[s];
    best[String(s)] = p.best[s];
  }
  return JSON.stringify({ cleared, best });
}

/** Stage 1 is always open; stage N opens once stage N-1 is cleared. */
export function isStageUnlocked(p: StageProgress, stage: StageId3D): boolean {
  return stage === 1 || p.cleared[(stage - 1) as StageId3D];
}

export function nextStage(stage: StageId3D): StageId3D | null {
  const n = stage + 1;
  return isStageId3D(n) ? n : null;
}

export interface ClearRecord {
  progress: StageProgress;
  /** True when this clear set a new best time (including the first clear). */
  newBest: boolean;
}

/** Pure: returns a new progress with the clear recorded. */
export function recordClear(p: StageProgress, stage: StageId3D, seconds: number): ClearRecord {
  const next: StageProgress = { cleared: { ...p.cleared, [stage]: true }, best: { ...p.best } };
  const prev = p.best[stage];
  const valid = Number.isFinite(seconds) && seconds > 0;
  const newBest = valid && (prev === null || seconds < prev);
  if (newBest) next.best[stage] = seconds;
  return { progress: next, newBest };
}

export function clearFromWorld(w: { stage: StageId3D; stageClear: StageClear3D | null }): StageClear3D | null {
  return w.stageClear && w.stageClear.stage === w.stage ? w.stageClear : null;
}

/** mm:ss.t clock, or a dash when there is no time yet. */
export function formatStageTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Fill every ability flag: older data that lacks blastCore / scanLens / thermalPlating reads as not owned. */
export function mergeAbilities(partial: Partial<PlayerAbilities3D> | null | undefined): PlayerAbilities3D {
  const d: PlayerAbilities3D = { thrusterBoots: false, crawlSlide: false, blastCore: false, scanLens: false, thermalPlating: false };
  for (const k of Object.keys(d) as (keyof PlayerAbilities3D)[]) d[k] = partial?.[k] === true;
  return d;
}

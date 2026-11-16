// Local run records per stage: best clear time, fewest deaths, most kills. Pure helpers; the DOM layer owns
// localStorage. Versioned key, safe parse (never throws), deterministic (no randomness, no clock).

import { STAGE_IDS_3D } from './stages3d.ts';
import type { StageId3D } from './types3d.ts';

export const RECORDS_KEY = 'reanimator.records.v1';

export interface StageRecord {
  bestTime: number | null;
  fewestDeaths: number | null;
  mostKills: number | null;
}

export type RunRecords = Record<StageId3D, StageRecord>;

export interface RunResult {
  seconds: number;
  deaths: number;
  kills: number;
}

export interface RecordUpdate {
  records: RunRecords;
  newBestTime: boolean;
  newFewestDeaths: boolean;
  newMostKills: boolean;
}

const emptyRecord = (): StageRecord => ({ bestTime: null, fewestDeaths: null, mostKills: null });

export function defaultRecords(): RunRecords {
  return { 1: emptyRecord(), 2: emptyRecord(), 3: emptyRecord() };
}

const num = (v: unknown, min: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null;

export function parseRecords(raw: string | null | undefined): RunRecords {
  const out = defaultRecords();
  let o: unknown;
  try {
    o = JSON.parse(raw ?? 'null');
  } catch {
    return out;
  }
  if (!o || typeof o !== 'object') return out;
  for (const s of STAGE_IDS_3D) {
    const r = (o as Record<string, unknown>)[String(s)];
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    out[s] = { bestTime: num(rec.bestTime, 0.001), fewestDeaths: num(rec.fewestDeaths, 0), mostKills: num(rec.mostKills, 0) };
  }
  return out;
}

export function serializeRecords(r: RunRecords): string {
  const o: Record<string, StageRecord> = {};
  for (const s of STAGE_IDS_3D) o[String(s)] = r[s];
  return JSON.stringify(o);
}

/** Pure: a new records object with this clear folded in. Invalid inputs change nothing. */
export function updateRecords(records: RunRecords, stage: StageId3D, run: RunResult): RecordUpdate {
  const prev = records[stage];
  const next: StageRecord = { ...prev };
  const timeOk = Number.isFinite(run.seconds) && run.seconds > 0;
  const deathsOk = Number.isFinite(run.deaths) && run.deaths >= 0;
  const killsOk = Number.isFinite(run.kills) && run.kills >= 0;
  const newBestTime = timeOk && (prev.bestTime === null || run.seconds < prev.bestTime);
  const newFewestDeaths = deathsOk && (prev.fewestDeaths === null || run.deaths < prev.fewestDeaths);
  const newMostKills = killsOk && (prev.mostKills === null || run.kills > prev.mostKills);
  if (newBestTime) next.bestTime = run.seconds;
  if (newFewestDeaths) next.fewestDeaths = run.deaths;
  if (newMostKills) next.mostKills = run.kills;
  return { records: { ...records, [stage]: next }, newBestTime, newFewestDeaths, newMostKills };
}

/** One-line summary, e.g. "Deaths 0 · Kills 12". Empty until the stage has a record. */
export function recordSummary(r: StageRecord): string {
  const parts: string[] = [];
  if (r.fewestDeaths !== null) parts.push(`Fewest deaths ${r.fewestDeaths}`);
  if (r.mostKills !== null) parts.push(`Most kills ${r.mostKills}`);
  return parts.join(' · ');
}

// ---- Full run (stages 1 to 3 in one sitting) -------------------------------------------------------------
// The per-stage records above stay on the v1 key untouched. The best full-run total lives on its own key, so a
// v1 save needs no migration and an unreadable value never damages the stage records.

export const FULLRUN_KEY = 'reanimator.fullrun.v1';

/** The latest clear of each stage in the current run. Clearing stage 1 starts a new run. */
export type RunLog = Partial<Record<StageId3D, RunResult>>;

export interface RunSummary {
  totalSeconds: number;
  totalDeaths: number;
  totalKills: number;
  perStage: Array<{ stage: StageId3D; seconds: number; deaths: number; kills: number }>;
}

const validRun = (r: RunResult): boolean =>
  Number.isFinite(r.seconds) && r.seconds > 0 && Number.isFinite(r.deaths) && r.deaths >= 0 && Number.isFinite(r.kills) && r.kills >= 0;

/** Pure: fold one stage clear into the run. Stage 1 starts over; an invalid result changes nothing. */
export function addToRun(log: RunLog, stage: StageId3D, run: RunResult): RunLog {
  if (!validRun(run)) return log;
  const base: RunLog = stage === 1 ? {} : log;
  return { ...base, [stage]: { seconds: run.seconds, deaths: run.deaths, kills: run.kills } };
}

/** Totals across all three stages, or null until every stage has a clear in this run. */
export function summarizeRun(log: RunLog): RunSummary | null {
  const perStage: RunSummary['perStage'] = [];
  for (const s of STAGE_IDS_3D) {
    const r = log[s];
    if (!r) return null;
    perStage.push({ stage: s, seconds: r.seconds, deaths: r.deaths, kills: r.kills });
  }
  return {
    totalSeconds: perStage.reduce((a, p) => a + p.seconds, 0),
    totalDeaths: perStage.reduce((a, p) => a + p.deaths, 0),
    totalKills: perStage.reduce((a, p) => a + p.kills, 0),
    perStage,
  };
}

/** Safe parse of the stored best full-run total in seconds; null when absent or invalid. */
export function parseBestRun(raw: string | null | undefined): number | null {
  try {
    const o = JSON.parse(raw ?? 'null') as unknown;
    if (!o || typeof o !== 'object') return null;
    return num((o as Record<string, unknown>).bestTotal, 0.001);
  } catch {
    return null;
  }
}

export function serializeBestRun(best: number | null): string {
  return JSON.stringify({ bestTotal: best });
}

export function updateBestRun(prev: number | null, total: number): { best: number | null; isNew: boolean } {
  if (!Number.isFinite(total) || total <= 0) return { best: prev, isNew: false };
  const isNew = prev === null || total < prev;
  return { best: isNew ? total : prev, isNew };
}

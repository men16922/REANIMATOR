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

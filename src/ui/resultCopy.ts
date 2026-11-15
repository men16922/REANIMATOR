/**
 * Result-screen checkpoint line (pure, no DOM). Story respawns at a rolling checkpoint near where the player fell
 * (respawnPlayer3D with diff.nearRespawn), other difficulties resume at the last Save station, or at the spawn with the run kept. Keep in step with canResumeNow().
 */
export interface ResultCopyInput {
  won: boolean;
  lastSaveId: string | null | undefined;
  nearRespawn: boolean;
}

/** R12: a defeat is always resumable. With no Save station the run restarts at the spawn and is kept. */
export function canResume(_: Pick<ResultCopyInput, 'lastSaveId' | 'nearRespawn'>): boolean {
  return true;
}

export function resultCheckpointLine(i: ResultCopyInput): string {
  if (i.won) return '';
  if (i.nearRespawn) return 'Press C or Enter to resume near where you fell.';
  if (i.lastSaveId) return 'Press C or Enter to resume at the last Save station.';
  return 'Press C or Enter to retry from the start. Your run is kept.';
}

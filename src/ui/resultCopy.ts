/**
 * Result-screen checkpoint line (pure, no DOM). Story respawns at a rolling checkpoint near where the player fell
 * (respawnPlayer3D with diff.nearRespawn), other difficulties need a Save station. Keep in step with canResumeNow().
 */
export interface ResultCopyInput {
  won: boolean;
  lastSaveId: string | null | undefined;
  nearRespawn: boolean;
}

export function canResume({ lastSaveId, nearRespawn }: Pick<ResultCopyInput, 'lastSaveId' | 'nearRespawn'>): boolean {
  return !!lastSaveId || nearRespawn;
}

export function resultCheckpointLine(i: ResultCopyInput): string {
  if (i.won) return '';
  if (i.nearRespawn) return 'Press C or Enter to resume near where you fell.';
  if (i.lastSaveId) return 'Press C or Enter to resume at the last Save station.';
  return 'No Save station reached yet. Play again restarts the run.';
}

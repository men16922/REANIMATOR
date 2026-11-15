// Pure objective line for the HUD. Derived only from world state (not from the stored `phase`, which debug setups and
// teleports can leave stale), so the same world always yields the same text.

import type { WorldState3D } from '../game3d/world3d.ts';

export type ObjectiveWorld = Pick<WorldState3D, 'status' | 'phase' | 'consoleUnlocked' | 'currentRoom' | 'coreDestroyed' | 'meltdownTicks' | 'enemies'>;

export interface Objective {
  text: string;
  color: string;
}

export const OBJECTIVES = {
  console: { text: 'OBJ: Arm the Security Console, break locks to reach the Core Vault', color: '#8ec5ff' },
  vault: { text: 'OBJ: Reach the Core Vault and slay the Core Warden', color: '#ffae6b' },
  warden: { text: 'OBJ: Slay the Core Warden (Core Vault)', color: '#ffae6b' },
  core: { text: 'OBJ: Shatter the Reactor Core!', color: '#4be8ff' },
  escape: { text: 'OBJ: ESCAPE to the Airlock extraction balcony!', color: '#5aff9c' },
  won: { text: 'EXTRACTED SAFELY', color: '#5aff9c' },
} as const satisfies Record<string, Objective>;

export function objectiveFor(w: ObjectiveWorld): Objective {
  if (w.status === 'won' || w.phase === 'won') return OBJECTIVES.won;
  if (w.coreDestroyed || w.meltdownTicks >= 0) return OBJECTIVES.escape;
  const wardenAlive = w.enemies.some((e) => e.kind === 'warden' && !e.minion && e.alive);
  if (!wardenAlive) return OBJECTIVES.core;
  if (!w.consoleUnlocked) return OBJECTIVES.console;
  return w.currentRoom === 'core' ? OBJECTIVES.warden : OBJECTIVES.vault;
}

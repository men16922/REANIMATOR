// Campaign stages. Stage 1 is the original six-sector facility (buildFacilityMap3D, unchanged and still ending in the
// reactor meltdown escape). Stages 2 and 3 are new designs: longer, more foes, lever doors and an exit teleporter.
// Stage design follows the Abuse observation of linear progression (level N unlocks N+1, foe counts grow per level)
// but contains no Abuse data. See docs/reference/ABUSE_LEVEL_OBSERVATION.md section 7.

import { buildFacilityMap3D } from './map3d.ts';
import { buildStage2Map3D, stage2Route, type StageWaypoint } from './stage2.ts';
import { buildStage3Map3D, stage3Route } from './stage3.ts';
import type { Level3D, StageId3D, WeaponSlot3D } from './types3d.ts';

export type { StageId3D, StageClear3D, StageInfo3D } from './types3d.ts';
export type { StageWaypoint } from './stage2.ts';

export const STAGE_IDS_3D: readonly StageId3D[] = [1, 2, 3];

export function isStageId3D(v: unknown): v is StageId3D {
  return v === 1 || v === 2 || v === 3;
}

/** Deterministic level for a stage. Every call returns a fresh object. */
export function buildStageMap3D(stage: StageId3D = 1): Level3D {
  if (stage === 2) return buildStage2Map3D();
  if (stage === 3) return buildStage3Map3D();
  return buildFacilityMap3D();
}

/** Weapons carried into each stage (stage 1 starts with the Pulse Rifle only). Ammo is the pedestal amount. */
export const STAGE_LOADOUT_3D: Record<StageId3D, readonly WeaponSlot3D[]> = {
  1: [],
  2: [2],
  3: [2, 3],
};

/** Foe toughness multiplier per stage on top of the sector and difficulty scaling. Stage 1 stays at 1 (bot pins). */
export const STAGE_HP_3D: Record<StageId3D, number> = { 1: 1, 2: 1, 3: 1.1 };

export function stageRoute3D(stage: StageId3D): StageWaypoint[] {
  return stage === 2 ? stage2Route() : stage === 3 ? stage3Route() : [];
}

/** Foes that count toward the clear screen: every placed foe except dead-start slots, plus hive nests. */
export function countStageFoes3D(level: Level3D): number {
  const slots = (id: string) => id.startsWith('e-core-m') || id.startsWith('e-esc-') || id.startsWith('e-lift-');
  return level.enemies.filter((e) => !slots(e.id)).length + level.hives.length;
}

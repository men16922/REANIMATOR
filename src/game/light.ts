// NEW-DESIGN light rule (variant-contract). Not a restored Abuse rule.
// The light only changes what the renderer reveals. It must never change motion, combat, or enemies.

export interface Light {
  on: boolean;
  battery: number;
}

export const LIGHT = {
  max: 100,
  drainPerTick: 1,
  rechargePerTick: 0.4,
  /** relight is refused below this charge, so an empty battery cannot flicker */
  relightMin: 15,
  radiusOn: 120,
  radiusOff: 26,
} as const;

export function newLight(): Light {
  return { on: false, battery: LIGHT.max };
}

/** toggle request from the player (E). Returns the new light. */
export function toggleLight(l: Light): Light {
  if (l.on) return { ...l, on: false };
  if (l.battery < LIGHT.relightMin) return l;
  return { ...l, on: true };
}

/** one simulation tick. Paused worlds must not call this. */
export function tickLight(l: Light): Light {
  if (l.on) {
    const battery = Math.max(0, l.battery - LIGHT.drainPerTick);
    return { on: battery > 0, battery };
  }
  return { on: false, battery: Math.min(LIGHT.max, l.battery + LIGHT.rechargePerTick) };
}

export function lightRadius(l: Light): number {
  return l.on ? LIGHT.radiusOn : LIGHT.radiusOff;
}

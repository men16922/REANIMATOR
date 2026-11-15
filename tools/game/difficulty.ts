// Difficulty probe: a reckless, non-adaptive policy (constant eastward run, periodic jump, always fire at a point
// ahead, never seeks cover, never opens doors on purpose) plays the world and reports HP lost, deaths and ticks.
// Deterministic: no randomness, fixed tick budget. Usage: node tools/game/difficulty.ts [ticks] [story|normal|hard]
import { DIFFICULTIES_3D, emptyInput3D, newWorld3D, respawnPlayer3D, stepWorld3D, type Difficulty3D, type InputState3D, type WorldState3D } from '../../src/game3d/world3d.ts';

export interface DifficultyReport {
  ticks: number;
  hpLost: number;
  deaths: number;
  kills: number;
  endX: number;
  status: WorldState3D['status'];
}

export function recklessInput(w: Readonly<WorldState3D>): InputState3D {
  const i = emptyInput3D();
  i.moveX = 1;
  i.fire = true;
  i.jump = Math.floor(w.tick / 20) % 2 === 0;
  i.aimX = w.player.body.x + 10;
  i.aimY = w.player.body.y + 1;
  i.interact = true;
  return i;
}

export function runReckless(maxTicks = 3600, difficulty: Difficulty3D = 'normal'): DifficultyReport {
  let w = newWorld3D({ difficulty });
  let hpLost = 0;
  let deaths = 0;
  let t = 0;
  for (; t < maxTicks && w.status !== 'won'; t++) {
    const before = w.player.hp;
    w = stepWorld3D(w, recklessInput(w));
    if (w.player.hp < before) hpLost += before - w.player.hp;
    if (w.status === 'lost') {
      deaths++;
      respawnPlayer3D(w);
    }
  }
  return { ticks: t, hpLost, deaths, kills: w.player.kills, endX: Number(w.player.body.x.toFixed(2)), status: w.status };
}

if (import.meta.main) {
  const n = Number(process.argv[2] ?? 3600);
  const only = process.argv[3] as Difficulty3D | undefined;
  for (const d of only ? [only] : DIFFICULTIES_3D) console.log(JSON.stringify({ difficulty: d, ...runReckless(n, d) }));
}

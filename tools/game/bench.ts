// Simulation cost benchmark: ticks of the full game world with a busy input script.
import { newWorld, update, SIM_HZ, type World } from '../../src/game/world.ts';
let w: World = newWorld();
const N = 20000;
const t0 = performance.now();
for (let i = 0; i < N; i++) {
  w = update(w, { left: i % 90 > 60, right: i % 90 < 50, jump: i % 25 === 0, fire: i % 4 === 0, aimX: w.player.x + 80, aimY: w.player.y - 30, toggleLight: i % 50 === 0 });
  if (w.phase !== 'playing') w = newWorld();
}
const ms = (performance.now() - t0) / N;
console.log(JSON.stringify({ ticks: N, msPerTick: +ms.toFixed(4), budgetMsPerTickAt15Hz: +(1000 / SIM_HZ).toFixed(1), shareOfBudget: +(ms / (1000 / SIM_HZ)).toFixed(4) }));

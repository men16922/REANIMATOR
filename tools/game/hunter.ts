// Reclaimer probe: runs the full bot playthrough on each difficulty and prints how the hunter fared.
// Usage: node tools/game/hunter.ts
import { createBot3D } from '../../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D, type Difficulty3D } from '../../src/game3d/world3d.ts';

export function runHunterProbe(difficulty: Difficulty3D, maxTicks = 24000) {
  let w = newWorld3D({ difficulty });
  const bot = createBot3D(w);
  let alerts = 0;
  let grabs = 0;
  let minHp = w.player.hp;
  let firstAlert = -1;
  for (let t = 0; t < maxTicks && w.status === 'playing'; t++) {
    w = stepWorld3D(w, bot.next(w));
    for (const ev of w.events) {
      if (ev.type === 'hunter_alert') {
        alerts++;
        if (firstAlert < 0) firstAlert = w.tick;
      }
      if (ev.type === 'hunter_grab') grabs++;
    }
    minHp = Math.min(minHp, w.player.hp);
  }
  return {
    difficulty,
    status: w.status,
    ticks: w.tick,
    hp: w.player.hp,
    minHp,
    kills: w.player.kills,
    deaths: w.run.deaths,
    alerts,
    grabs,
    firstAlertTick: firstAlert,
    catches: w.hunter.catches,
    counters: w.hunter.counters,
    hunterAlive: w.hunter.alive,
    disabledBy: w.hunter.disabledBy,
  };
}

if (process.argv[1]?.endsWith('hunter.ts')) {
  for (const d of ['story', 'normal', 'hard'] as const) console.log(JSON.stringify(runHunterProbe(d)));
}

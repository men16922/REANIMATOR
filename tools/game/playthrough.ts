// Automated closed-loop side-view Metroidvania playthrough: drives newWorld3D -> stepWorld3D through all six sectors,
// collecting Scattergun, Grenade, Thruster Boots, Energy Tanks and Rail-Cannon, opening blue/green/yellow/red locks,
// arming the Security Console, defeating the Core Warden, destroying the reactor core and escaping before Meltdown.
// Usage: node tools/game/playthrough.ts
import assert from 'node:assert/strict';
import { createBot3D } from '../../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D } from '../../src/game3d/world3d.ts';

export function runPlaythrough(maxTicks = 24000) {
  let w = newWorld3D();
  const bot = createBot3D(w);
  for (let t = 0; t < maxTicks && w.status === 'playing'; t++) {
    w = stepWorld3D(w, bot.next(w));
  }
  return { w, bot };
}

const { w, bot } = runPlaythrough();
const warden = w.enemies.find((e) => e.kind === 'warden');
const summary = {
  status: w.status,
  phase: w.phase,
  ticks: w.tick,
  seconds: Number((w.tick / 60).toFixed(2)),
  hp: w.player.hp,
  maxHp: w.player.maxHp,
  energyTanks: w.player.energyTanks,
  thrusterBoots: w.player.abilities.thrusterBoots,
  kills: w.player.kills,
  unlockedWeapons: ([1, 2, 3, 4] as const).filter((s) => w.player.unlocked[s]),
  openedDoors: [...w.openDoors].sort(),
  visitedRooms: w.visitedRooms,
  consoleUnlocked: w.consoleUnlocked,
  wardenDefeated: Boolean(warden && !warden.alive),
  coreDestroyed: w.coreDestroyed,
  meltdownLeftSeconds: w.meltdownTicks >= 0 ? Number((w.meltdownTicks / 60).toFixed(2)) : null,
  botStep: bot.stepLabel,
  endPos: { x: Number(w.player.body.x.toFixed(2)), y: Number(w.player.body.y.toFixed(2)) },
};
console.log(JSON.stringify(summary, null, 2));

assert.equal(w.status, 'won', `Expected win, got status=${w.status} phase=${w.phase} step="${bot.stepLabel}" pos=(${w.player.body.x.toFixed(2)}, ${w.player.body.y.toFixed(2)}) hp=${w.player.hp}`);
assert.equal(w.consoleUnlocked, true, 'Security Console must be unlocked');
assert.equal(w.coreDestroyed, true, 'Reactor core must be destroyed');
assert.equal(warden?.alive, false, 'Core Warden must be defeated');
assert.ok(w.player.unlocked[2] && w.player.unlocked[3] && w.player.unlocked[4], 'All 4 weapons must be unlocked');
assert.equal(w.visitedRooms.length, 6, 'All six sectors must be visited');
assert.ok(w.player.hp > 0, 'Operative must survive extraction');

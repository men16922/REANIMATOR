// Automated closed-loop Full 3D playthrough bot: drives newWorld3D -> stepWorld3D across Zones A-D,
// unlocking weapons, triggering Security Console, defeating Core Warden (jumping shockwaves),
// destroying Power Core, and escaping before Reactor Meltdown.
// Usage: node tools/game/playthrough.ts

import assert from 'node:assert/strict';
import { computeBotInput3D } from '../../src/game3d/bot3d.ts';
import { newWorld3D, stepWorld3D } from '../../src/game3d/world3d.ts';

let w = newWorld3D();
const maxTicks = 12000;

for (let t = 0; t < maxTicks && w.status === 'playing'; t++) {
  w = stepWorld3D(w, computeBotInput3D(w));
}

const warden = w.enemies.find((e) => e.kind === 'warden');
const summary = {
  status: w.status,
  phase: w.phase,
  ticks: w.tick,
  seconds: Number((w.tick / 60).toFixed(2)),
  hp: w.player.hp,
  kills: w.player.kills,
  unlockedWeapons: ([1, 2, 3, 4] as const).filter((s) => w.player.unlocked[s]),
  consoleUnlocked: w.consoleUnlocked,
  wardenDefeated: Boolean(warden && !warden.alive),
  coreDestroyed: w.coreDestroyed,
  meltdownLeftSeconds: w.meltdownTicks >= 0 ? Number((w.meltdownTicks / 60).toFixed(2)) : null,
  endPos: { x: Number(w.player.body.x.toFixed(2)), y: Number(w.player.body.y.toFixed(2)), z: Number(w.player.body.z.toFixed(2)) },
};

console.log(JSON.stringify(summary, null, 2));

assert.equal(w.status, 'won', `Expected win, got status=${w.status} at phase=${w.phase} pos=(${w.player.body.x.toFixed(2)}, ${w.player.body.y.toFixed(2)}, ${w.player.body.z.toFixed(2)}) hp=${w.player.hp}`);
assert.equal(w.consoleUnlocked, true, 'Security Console must be unlocked');
assert.equal(w.coreDestroyed, true, 'Power Core must be destroyed');
assert.equal(warden?.alive, false, 'Core Warden must be defeated');
assert.ok(w.player.unlocked[2] && w.player.unlocked[3] && w.player.unlocked[4], 'All 4 weapons must be unlocked');
assert.ok(w.player.hp > 0, 'Operative must survive extraction');

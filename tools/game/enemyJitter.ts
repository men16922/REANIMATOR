// Sim-level enemy motion probe: runs the bot and reports per-tick displacement of floor crawlers/stalkers.
// Deterministic. Usage: node tools/game/enemyJitter.ts [normal|story|hard]
import { createBot3D } from '../../src/game3d/bot3d.ts';
import { newWorld3D, respawnPlayer3D, stepWorld3D, type Difficulty3D } from '../../src/game3d/world3d.ts';

export interface JitterStats {
  ticks: number;
  hp: number;
  minHp: number;
  status: string;
  deaths: number;
  /** Tick-to-tick x steps of awake floor foes (excludes dead, attack lunges, airborne) */
  samples: number;
  maxStep: number;
  pops: number; // steps > 0.2 m
  bigPops: number; // steps > 0.5 m
  flips: number; // chase-state sign flips of the x step (reversal with both steps > 0.02 m)
  byKind: Record<string, { samples: number; maxStep: number; pops: number; flips: number }>;
}

export function measureJitter(difficulty: Difficulty3D = 'normal', maxTicks = 20000): JitterStats {
  const w = newWorld3D({ difficulty });
  const bot = createBot3D(w);
  const prev = new Map<string, { x: number; step: number; hp: number }>();
  const st: JitterStats = { ticks: 0, hp: 0, minHp: w.player.hp, status: '', deaths: 0, samples: 0, maxStep: 0, pops: 0, bigPops: 0, flips: 0, byKind: {} };
  for (let t = 0; t < maxTicks && w.status !== 'won'; t++) {
    stepWorld3D(w, bot.next(w));
    st.minHp = Math.min(st.minHp, w.player.hp);
    for (const e of w.enemies) {
      if ((e.kind !== 'crawler' && e.kind !== 'stalker') || !e.alive || !e.active || e.surface !== 'floor' || e.state === 'attack') {
        prev.delete(e.id);
        continue;
      }
      const p = prev.get(e.id);
      const step = p ? e.x - p.x : 0;
      // A hive or wave respawn reuses the slot (hp refills): that is a teleport by design, not a pop
      if (p && e.hp <= p.hp) {
        const a = Math.abs(step);
        const k = (st.byKind[e.kind] ??= { samples: 0, maxStep: 0, pops: 0, flips: 0 });
        st.samples++;
        k.samples++;
        if (a > st.maxStep) st.maxStep = a;
        if (a > k.maxStep) k.maxStep = a;
        if (a > 0.2) {
          st.pops++;
          k.pops++;
        }
        if (a > 0.5) st.bigPops++;
        if (e.state === 'chase' && step * p.step < 0 && a > 0.02 && Math.abs(p.step) > 0.02) {
          st.flips++;
          k.flips++;
        }
      }
      prev.set(e.id, { x: e.x, step, hp: e.hp });
    }
    if (w.status === 'lost') {
      st.deaths++;
      respawnPlayer3D(w);
      prev.clear();
    }
    st.ticks = w.tick;
  }
  st.hp = w.player.hp;
  st.status = w.status;
  return st;
}

if (import.meta.main) {
  const only = process.argv[2] as Difficulty3D | undefined;
  for (const d of only ? [only] : (['story', 'normal', 'hard'] as const)) console.log(JSON.stringify({ difficulty: d, ...measureJitter(d) }));
}

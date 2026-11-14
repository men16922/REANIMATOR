// Map playability check: BFS over standing positions using the restored engine and macro actions.
// Ensures START -> CORE -> EXIT is reachable WITHOUT touching any H hazard tile.
// Usage: node tools/game/reach.ts  (exit 0 when P -> C -> X is safely reachable)
import { step, spawnBody, type Body } from '../../src/engine/motion.ts';
import { COLLIDER, START, CORE, EXIT, isHazardTile } from '../../src/game/world.ts';
import { TILE } from '../../src/engine/collider.ts';

type Act = { xm: -1 | 0 | 1; jump: boolean; ticks: number };
const ACTS: Act[] = [];
for (const xm of [-1, 1] as const) for (const ticks of [1, 2, 4, 8]) ACTS.push({ xm, jump: false, ticks });
for (const xm of [-1, 0, 1] as const) ACTS.push({ xm, jump: true, ticks: 40 });

function touchesHazard(b: Body): boolean {
  const ty = Math.floor((b.y - 2) / TILE);
  const txL = Math.floor((b.x - 4) / TILE);
  const txR = Math.floor((b.x + 3) / TILE);
  return isHazardTile(txL, ty) || isHazardTile(txR, ty);
}

function settle(b: Body, xm: -1 | 0 | 1, jump: boolean, minTicks: number): Body | null {
  let s = b;
  for (let t = 0; t < 80; t++) {
    s = step(s, { xm: t < minTicks || jump ? xm : 0, ym: jump && t < 2 ? -1 : 0 }, COLLIDER);
    if (touchesHazard(s)) return null;
    if (t >= minTicks && s.gravity === 0 && s.xvel === 0) return s;
  }
  return null;
}

export interface ReachNode {
  x: number;
  y: number;
  ticks: number;
}

export function findRoute(from: { x: number; y: number }, goal: { x: number; y: number }, radius = 20) {
  let start = spawnBody(from.x, from.y);
  start = settle(start, 0, false, 1) ?? start;
  const key = (b: Body) => `${b.x},${b.y}`;
  const seen = new Set([key(start)]);
  const ticks = new Map<string, number>([[key(start), 0]]);
  const parent = new Map<string, { prev: string; act: Act }>();
  const bodyAt = new Map<string, Body>([[key(start), start]]);
  const queue: Body[] = [start];

  while (queue.length) {
    const b = queue.shift()!;
    const bk = key(b);
    const tb = ticks.get(bk)!;
    if (Math.hypot(b.x - goal.x, b.y - goal.y) < radius) {
      const steps: Act[] = [];
      let cur = bk;
      while (parent.has(cur)) {
        const p = parent.get(cur)!;
        steps.unshift(p.act);
        cur = p.prev;
      }
      return { ok: true as const, visited: seen.size, ticks: tb, steps };
    }
    for (const a of ACTS) {
      let s = b;
      let used = 0;
      let hitHazard = false;
      for (let t = 0; t < (a.jump ? 40 : a.ticks); t++) {
        s = step(s, { xm: a.xm, ym: a.jump && t < 2 ? -1 : 0 }, COLLIDER);
        used++;
        if (touchesHazard(s)) { hitHazard = true; break; }
        if (Math.hypot(s.x - goal.x, s.y - goal.y) < radius) {
          const steps: Act[] = [a];
          let cur = bk;
          while (parent.has(cur)) {
            const p = parent.get(cur)!;
            steps.unshift(p.act);
            cur = p.prev;
          }
          return { ok: true as const, visited: seen.size, ticks: tb + used, steps };
        }
        if (a.jump && t > 2 && s.gravity === 0) break;
      }
      if (hitHazard) continue;
      const end = settle(s, 0, false, 0);
      if (!end) continue;
      const k = key(end);
      if (!seen.has(k)) {
        seen.add(k);
        ticks.set(k, tb + used + 1);
        parent.set(k, { prev: bk, act: a });
        bodyAt.set(k, end);
        queue.push(end);
      }
    }
    if (seen.size > 40000) break;
  }
  const levels: Record<number, [number, number]> = {};
  for (const k of seen) {
    const [x, y] = k.split(',').map(Number);
    const l = levels[y] ?? [x, x];
    levels[y] = [Math.min(l[0], x), Math.max(l[1], x)];
  }
  return { ok: false as const, visited: seen.size, levels };
}

export function reachable(from: { x: number; y: number }, goal: { x: number; y: number }, radius = 20) {
  const r = findRoute(from, goal, radius);
  if (r.ok) return { ok: true, visited: r.visited, ticks: r.ticks };
  return r;
}

if (import.meta.main) {
  const a = reachable(START, CORE);
  const b = reachable(CORE, EXIT);
  const total = ((a as { ticks?: number }).ticks ?? 0) + ((b as { ticks?: number }).ticks ?? 0);
  console.log(JSON.stringify({
    startToCore: a,
    coreToExit: b,
    bfsRouteTicks: total,
    bfsRouteSecondsAt15Hz: +(total / 15).toFixed(1),
    note: 'BFS avoids all H hazard tiles and ignores enemies; rough route length, not human play-time.',
  }));
  process.exit(a.ok && b.ok ? 0 : 1);
}

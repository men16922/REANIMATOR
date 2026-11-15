// Kinematic reachability verifier for the six-sector side-view map using the real stepBody3D physics.
// Verifies the full progression route (blue -> green -> Mines upgrades -> yellow -> Bio-Labs -> Security -> red -> Core -> escape)
// and the Thruster Boots gate (shaft upper deck 4.4 m above the last platform).
import { ABILITY_3D, floorHeightAt3D, stepBody3D, spawnBody3D, type Body3D } from '../../src/engine/motion3d.ts';
import { buildCollider3D, buildFacilityMap3D, type Level3D } from '../../src/game3d/map3d.ts';
import { navReached, navSteer, type NavTarget } from '../../src/game3d/nav3d.ts';
import { hazardCrossHorizon, hazardHits, hazardHold, hazardSafeWindow } from '../../src/game3d/hazards.ts';

export interface ReachStep extends NavTarget {
  label: string;
  /** Door ids opened before this step (weapon/console actions are covered by tests/game3d.test.ts) */
  opens?: string[];
  /** Grants Thruster Boots on arrival */
  boots?: boolean;
}

export interface WalkResult {
  reached: boolean;
  body: Body3D;
  ticks: number;
}

export function walkTo(
  start: Body3D,
  step: NavTarget,
  level: Level3D,
  openDoors: ReadonlySet<string>,
  maxJumps: number,
  maxTicks = 700,
): WalkResult {
  const col = buildCollider3D(level, openDoors);
  let b = { ...start };
  let prevJump = false;
  for (let t = 0; t < maxTicks; t++) {
    if (navReached(b, step) && b.grounded) return { reached: true, body: b, ticks: t };
    const nav = navSteer(b, step, prevJump, { maxJumps });
    prevJump = nav.jump;
    b = stepBody3D(
      b,
      { moveX: nav.moveX, moveZ: 0, jump: nav.jump, dash: false, aimDirX: 1, aimDirZ: 0, dropDown: nav.dropDown, maxJumps },
      col,
    );
  }
  return { reached: false, body: b, ticks: maxTicks };
}

/**
 * Jet-dash probe: navSteer walks toward `target` (same policy as walkTo) while a dash is injected at every
 * combination of first-dash tick and repeat gap. Returns true if any schedule reaches the target.
 */
export function dashReaches(
  start: Body3D,
  target: NavTarget,
  level: Level3D,
  openDoors: ReadonlySet<string>,
  maxJumps: number,
  maxTicks = 700,
): boolean {
  const col = buildCollider3D(level, openDoors);
  for (const first of [0, 2, 4, 6, 8, 10, 12, 15, 18, 22, 26, 30, 36, 44]) {
    for (const gap of [ABILITY_3D.dashCooldownTicks, ABILITY_3D.dashCooldownTicks + 6, 90]) {
      let b = { ...start };
      let prevJump = false;
      for (let t = 0; t < maxTicks; t++) {
        if (navReached(b, target) && b.grounded) return true;
        const nav = navSteer(b, target, prevJump, { maxJumps });
        prevJump = nav.jump;
        const dash = t >= first && (t - first) % gap === 0;
        b = stepBody3D(
          b,
          { moveX: nav.moveX, moveZ: 0, jump: nav.jump, dash, aimDirX: nav.moveX || 1, aimDirZ: 0, dropDown: nav.dropDown, maxJumps },
          col,
        );
      }
    }
  }
  return false;
}

/**
 * Wall-hop probe: an exhaustive-ish "abuse" policy that presses into a wall and spams jump (and optionally dash-cancels)
 * at several periods, trying to climb to `target`. Wall jump needs Thruster Boots (maxJumps > 1), so without boots this
 * must never reach a boots gate.
 */
export function wallHopReaches(
  start: Body3D,
  target: NavTarget,
  level: Level3D,
  openDoors: ReadonlySet<string>,
  maxJumps: number,
  maxTicks = 900,
): boolean {
  const col = buildCollider3D(level, openDoors);
  for (const dir of [1, -1]) {
    for (const period of [4, 6, 8, 10, 14, 20]) {
      for (const dashCancel of [false, true]) {
        let b = { ...start };
        for (let t = 0; t < maxTicks; t++) {
          if (navReached(b, target) && b.grounded) return true;
          const jump = t % period < Math.ceil(period / 2);
          const dash = dashCancel && t % 30 === 0;
          b = stepBody3D(
            b,
            { moveX: dir, moveZ: 0, jump, dash, aimDirX: dir, aimDirZ: 0, dropDown: false, maxJumps },
            col,
          );
        }
      }
    }
  }
  return false;
}

export interface CollectibleCheck {
  label: string;
  from: { x: number; y: number };
  target: NavTarget;
  /** Doors opened before walking (secret doors, locks) */
  doors: string[];
  maxJumps: number;
}

/** Every data log must be reachable once its secret door (if any) is open. */
export function buildCollectibleChecks(level: Level3D): CollectibleCheck[] {
  const log = (id: string) => level.dataLogs.find((l) => l.id === id)!;
  const all = level.solids.filter((s) => s.doorId).map((s) => s.doorId!);
  const mk = (id: string, from: { x: number; y: number }, doors: string[], maxJumps: number, leap = false): CollectibleCheck => ({
    label: id,
    from,
    target: { x: log(id).x, y: log(id).y, tolX: 0.9, tolY: 0.5, leap },
    doors,
    maxJumps,
  });
  return [
    mk('log_airlock', { x: level.spawn.x, y: 0 }, ['door_secret_alcove'], 1),
    mk('log_shaft', { x: 30, y: 8.8 }, ['door_secret_cache'], 2),
    mk('log_mines', { x: 13, y: -9.6 }, all, 1, true),
    mk('log_biolabs', { x: 46, y: 0 }, all, 1),
    mk('log_security', { x: 65, y: 8.8 }, all, 1),
    mk('log_core', { x: 74, y: 0 }, all, 1),
  ];
}

export function buildReachRoute(level: Level3D): ReachStep[] {
  const ped = (id: string) => level.pedestals.find((p) => p.id === id)!;
  const up = (id: string) => level.upgrades.find((u) => u.id === id)!;
  const sv = (id: string) => level.saveStations.find((s) => s.id === id)!;
  const sc = ped('ped-scatter');
  const gr = ped('ped-grenade');
  const rl = ped('ped-rail');
  const boots = up('thruster_boots');
  const tankM = up('etank_mines');
  const tankB = up('etank_biolabs');
  const saveM = sv('save_mines');
  const saveS = sv('save_security');
  return [
    { label: 'Airlock crate', x: 7.5, y: 0 },
    { label: 'Past airlock crate', x: 12, y: 0, leap: true },
    { label: 'Airlock blue door', x: 20, y: 0 },
    { label: 'Airlock -> Shaft', x: 26, y: 0, opens: ['door_airlock_shaft'] },
    { label: 'Shaft grate (y0)', x: 33, y: 0 },
    { label: 'Shaft down 1', x: 33, y: -2.2 },
    { label: 'Shaft down 2', x: 33, y: -4.4 },
    { label: 'Shaft down 3', x: 33, y: -6.6 },
    { label: 'Shaft down 4', x: 33, y: -8.8 },
    { label: 'Shaft floor', x: 33, y: -11 },
    { label: 'Scattergun', x: sc.x, y: sc.y, tolX: 0.9, tolY: 0.4 },
    { label: 'Shaft green door', x: 30, y: -11 },
    { label: 'Shaft -> Mines', x: 20, y: saveM.y, opens: ['door_shaft_mines'] },
    { label: 'Save (Mines)', x: saveM.x, y: saveM.y, tolX: 1.0 },
    { label: 'Mines east edge', x: 16.9, y: -11, tolX: 0.3 },
    { label: 'Mines stone', x: 13, y: -9.6, leap: true },
    { label: 'Mines vault', x: 9.5, y: -8.6, leap: true },
    { label: 'Grenade', x: gr.x, y: gr.y, tolX: 0.9, tolY: 0.4 },
    { label: 'Energy Tank (Mines)', x: tankM.x, y: tankM.y, tolX: 0.9, tolY: 0.4 },
    { label: 'Thruster Boots', x: boots.x, y: boots.y, tolX: 0.9, tolY: 0.4, boots: true },
    { label: 'Vault east end', x: 9.8, y: -8.6, tolX: 0.3 },
    { label: 'Mines stone (return)', x: 13, y: -9.6, leap: true },
    { label: 'Mines east floor', x: 18, y: -11, leap: true },
    { label: 'Shaft floor (return)', x: 33, y: -11 },
    { label: 'Shaft up 4', x: 33, y: -8.8 },
    { label: 'Shaft up 3', x: 33, y: -6.6 },
    { label: 'Shaft up 2', x: 33, y: -4.4 },
    { label: 'Shaft up 1', x: 33, y: -2.2 },
    { label: 'Shaft grate (y0, return)', x: 33, y: 0 },
    { label: 'Shaft east ledge', x: 38, y: 0 },
    { label: 'Shaft -> Bio-Labs', x: 46, y: 0, opens: ['door_shaft_biolabs'] },
    { label: 'Bio-Labs plat 1', x: 50, y: 2.2 },
    { label: 'Energy Tank (Bio-Labs)', x: tankB.x, y: tankB.y, tolX: 0.9, tolY: 0.4, leap: true },
    { label: 'Bio grate up', x: 65, y: 4.4, leap: true },
    { label: 'Security grate', x: 65, y: 8.8 },
    { label: 'Security console', x: 55.8, y: 8.8, tolX: 0.4 },
    { label: 'Past console', x: 52, y: 8.8, leap: true },
    { label: 'Save (Security)', x: saveS.x, y: saveS.y, tolX: 1.0 },
    { label: 'Security grate (return)', x: 65, y: 8.8, leap: true },
    { label: 'Bio grate up (return)', x: 65, y: 4.4 },
    { label: 'Rail-Cannon', x: rl.x, y: rl.y, tolX: 0.9, tolY: 0.4 },
    { label: 'Bio floor east', x: 62, y: 0 },
    { label: 'Boss door', x: 74, y: 0, opens: ['door_boss'] },
    { label: 'Reactor core', x: level.corePos.x - 2.2, y: 0, tolX: 1.0 },
    { label: 'Core -> Bio-Labs', x: 60, y: 0 },
    { label: 'Bio-Labs west', x: 47, y: 0, leap: true },
    { label: 'Shaft east ledge (escape)', x: 38, y: 0 },
    { label: 'Escape up 1', x: 37, y: 2.2 },
    { label: 'Escape up 2', x: 38, y: 4.4 },
    { label: 'Escape ledge', x: 26.5, y: 5.2, leap: true },
    { label: 'Escape hatch', x: 22, y: 5.2, opens: ['door_escape'] },
    { label: 'Extraction', x: level.exitPos.x, y: level.exitPos.y, tolX: 1.5 },
  ];
}

function runRoute(): number {
  const level = buildFacilityMap3D();
  const route = buildReachRoute(level);
  const openDoors = new Set<string>();
  let body = spawnBody3D(level.spawn.x, level.spawn.y, 0);
  let maxJumps = 1;
  let total = 0;
  for (const step of route) {
    for (const d of step.opens ?? []) openDoors.add(d);
    const res = walkTo(body, step, level, openDoors, maxJumps);
    total += res.ticks;
    body = res.body;
    console.log(
      `${res.reached ? 'OK  ' : 'FAIL'} ${step.label.padEnd(26)} -> (${body.x.toFixed(2)}, ${body.y.toFixed(2)}) in ${res.ticks} ticks`,
    );
    if (!res.reached) {
      console.error(`Reachability check FAILED at "${step.label}"`);
      process.exit(1);
    }
    if (step.boots) maxJumps = 2;
  }
  return total;
}

function runGate(): void {
  const level = buildFacilityMap3D();
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  const start = spawnBody3D(38, 4.4, 0);
  const upper: NavTarget = { x: 31, y: 8.8 };
  const without = walkTo(start, upper, level, doors, 1, 600);
  const withBoots = walkTo(start, upper, level, doors, 2, 600);
  console.log(`GATE shaft 4.4 m: without boots reached=${without.reached}, with boots reached=${withBoots.reached} (${withBoots.ticks} ticks)`);
  if (without.reached || !withBoots.reached) {
    console.error('Thruster Boots gate FAILED: expected unreachable without boots and reachable with boots');
    process.exit(1);
  }
  for (const [sx, tx] of [[65, 4.4], [55, 4.5]] as const) {
    const from = spawnBody3D(sx, tx, 0);
    const target: NavTarget = { x: 65, y: 8.8 };
    const no = walkTo(from, target, level, doors, 1, 1500);
    const yes = walkTo(from, target, level, doors, 2, 1500);
    console.log(`GATE security 4.4 m (from x=${sx}, y=${tx}): without boots reached=${no.reached}, with boots reached=${yes.reached} (${yes.ticks} ticks)`);
    if (no.reached || !yes.reached) {
      console.error('Security deck boots gate FAILED');
      process.exit(1);
    }
  }
  const gates = [
    { sx: 38, sy: 4.4, target: { x: 31, y: 8.8 } },
    { sx: 65, sy: 4.4, target: { x: 65, y: 8.8 } },
    { sx: 55, sy: 4.5, target: { x: 65, y: 8.8 } },
  ];
  for (const g of gates) {
    const from = spawnBody3D(g.sx, g.sy, 0);
    const no = dashReaches(from, g.target, level, doors, 1, 1500);
    const yes = dashReaches(from, g.target, level, doors, 2, 1500);
    console.log(`GATE jet-dash (from x=${g.sx}, y=${g.sy}): without boots reached=${no}, with boots reached=${yes}`);
    if (no || !yes) {
      console.error('Jet-dash gate check FAILED (bypass without boots, or control failed with boots)');
      process.exit(1);
    }
    const hopNo = wallHopReaches(from, g.target, level, doors, 1, 900);
    console.log(`GATE wall-hop/dash-cancel (from x=${g.sx}, y=${g.sy}): without boots reached=${hopNo}`);
    if (hopNo) {
      console.error('Wall-hop gate check FAILED: wall slide / wall jump / dash cancel bypassed the Thruster Boots gate');
      process.exit(1);
    }
  }
}

function runCollectibles(): void {
  const level = buildFacilityMap3D();
  for (const c of buildCollectibleChecks(level)) {
    const r = walkTo(spawnBody3D(c.from.x, c.from.y, 0), c.target, level, new Set(c.doors), c.maxJumps, 1200);
    console.log(`${r.reached ? 'OK  ' : 'FAIL'} collect ${c.label.padEnd(14)} in ${r.ticks} ticks`);
    if (!r.reached) {
      console.error(`Collectible ${c.label} unreachable`);
      process.exit(1);
    }
  }
  // Secret doors must be sealed (solid) until opened: the alcove and cache are unreachable beforehand.
  const sealed = walkTo(spawnBody3D(level.spawn.x, 0, 0), { x: -5, y: 0, tolX: 0.9 }, level, new Set(), 2, 600);
  if (sealed.reached) {
    console.error('Secret alcove reachable while sealed');
    process.exit(1);
  }
  console.log('SECRETS sealed until opened: OK');
}

/**
 * Round 3 foes: every hive must stand on real floor, every ceiling hanger must touch a ceiling solid along its whole crawl
 * span, and every wall crawler must sit flush against a wall solid. Returns human-readable problems (empty = OK).
 */
export function checkFoePlacement(level: Level3D): string[] {
  const problems: string[] = [];
  const col = buildCollider3D(level, new Set());
  const solids = level.solids.filter((s) => s.kind !== 'platform');
  for (const h of level.hives) {
    const fy = floorHeightAt3D(h.x, 0, h.y + 0.5, 0.5, col);
    if (!(Math.abs(fy - h.y) < 0.05)) problems.push(`${h.id}: floor ${fy} != ${h.y}`);
  }
  for (const e of level.enemies) {
    if (!e.surface || e.surface === 'floor') continue;
    const span = e.span ?? [e.x, e.x];
    const bodyH = 0.85;
    if (e.surface === 'ceiling') {
      for (const x of span) {
        const ok = solids.some((s) => Math.abs(s.minY - (e.y + bodyH)) < 0.05 && x >= s.minX + 0.2 && x <= s.maxX - 0.2);
        if (!ok) problems.push(`${e.id}: no ceiling solid over x=${x}`);
      }
    } else {
      const dir = e.wallDir ?? 1;
      for (const y of span) {
        const ok = solids.some(
          (s) => Math.abs((dir > 0 ? s.maxX : s.minX) - (e.x - dir * 0.45)) < 0.05 && y >= s.minY - 0.01 && y + bodyH <= s.maxY + 0.01,
        );
        if (!ok) problems.push(`${e.id}: no wall flush at y=${y}`);
      }
    }
  }
  return problems;
}

/**
 * Round 4 layout checks: every hazard stands on real floor with a telegraph and a safe crossing window, the crusher hangs from a
 * real ceiling, the lift lane is clear of non-platform solids, the gantry makes the acid basin walkable, and the collapse leaves
 * a recovery route (floor -> maint ledge -> balcony needs the Double-Jump).
 */
export function checkHazardLayout(level: Level3D): string[] {
  const problems: string[] = [];
  const col = buildCollider3D(level, new Set());
  for (const h of level.hazards) {
    const fy = floorHeightAt3D(h.x, 0, h.y + 0.5, 0.3, col);
    if (!(Math.abs(fy - h.y) < 0.05)) problems.push(`${h.id}: floor ${fy} != ${h.y}`);
    if (h.telegraph < 30) problems.push(`${h.id}: telegraph ${h.telegraph} < 30 ticks`);
    if (hazardSafeWindow(h) < hazardCrossHorizon(h) + 20) problems.push(`${h.id}: safe window ${hazardSafeWindow(h)} too short`);
    if (h.kind === 'crusher') {
      const top = h.y + h.height;
      if (!level.solids.some((s) => s.kind !== 'platform' && Math.abs(s.minY - top) < 0.05 && h.x >= s.minX && h.x <= s.maxX)) problems.push(`${h.id}: no ceiling at ${top}`);
    }
  }
  for (const e of level.elevators) {
    const car = level.solids.find((s) => s.id === e.carId);
    if (!car) { problems.push(`${e.id}: car solid missing`); continue; }
    const blockers = level.solids.filter(
      (s) => s.kind !== 'platform' && s.id !== car.id && s.maxX > car.minX && s.minX < car.maxX && s.maxY > e.bottomY && s.minY < e.topY + 2,
    );
    for (const b of blockers) if (!(b.maxY <= e.bottomY + 0.01)) problems.push(`${e.id}: lane blocked by ${b.id}`);
    const top = floorHeightAt3D((car.minX + car.maxX) / 2, 0, e.topY + 0.3, 0.3, col);
    if (!(Math.abs(top - e.topY) < 0.05)) problems.push(`${e.id}: top landing ${top} != ${e.topY}`);
  }
  // Gantry: with the bridge down the basin is walkable at y = 0 (no acid contact), without it the floor is the sunken basin
  const sw = level.switches[0];
  if (sw) {
    const down = walkTo(spawnBody3D(49.5, 0, 0), { x: 59, y: 0 }, level, new Set([sw.opens]), 1, 400);
    if (!down.reached) problems.push('gantry: not walkable once lowered');
  }
  // Collapse recovery: after every segment fell, floor -> ledge -> balcony works with the Double-Jump
  for (const c of level.collapses) {
    const fallen = new Set(c.segmentIds.map((id) => `collapse:${id}`));
    const climb = (maxJumps: number): boolean => {
      let b = walkTo(spawnBody3D(15.5, 0, 0), { x: 15.5, y: 2.4, tolX: 0.6, tolY: 0.3 }, level, fallen, maxJumps, 300).body;
      if (Math.abs(b.y - 2.4) > 0.3) return false;
      const col = buildCollider3D(level, fallen);
      let prevJump = false;
      for (let t = 0; t < 400; t++) {
        const high = b.y > 5.0;
        const nav = navSteer(b, high ? { x: 8, y: 5.2 } : { x: 15.5, y: 8, tolX: 0.6 }, prevJump, { maxJumps });
        prevJump = nav.jump;
        b = stepBody3D(b, { moveX: nav.moveX, moveZ: 0, jump: nav.jump, dash: false, aimDirX: 1, aimDirZ: 0, dropDown: false, maxJumps }, col);
        if (b.grounded && Math.abs(b.y - 5.2) < 0.1 && b.x < 13) return true;
      }
      return false;
    };
    const up = { reached: climb(2) };
    const sealed = { reached: climb(1) };
    if (!up.reached) problems.push(`${c.id}: no recovery route after the fall`);
    if (sealed.reached) problems.push(`${c.id}: recovery must need the Double-Jump`);
  }
  return problems;
}

const HAZARD_CROSSINGS: Record<string, { from: NavTarget; via: NavTarget[] }[]> = {
  'hz-mines-crusher': [
    { from: { x: 23.5, y: -11 }, via: [{ x: 16.9, y: -11, tolX: 0.3 }] },
  ],
  'hz-mines-vent': [
    { from: { x: 9.8, y: -8.6 }, via: [{ x: 3, y: -8.6, tolX: 0.9 }] },
    { from: { x: 3, y: -8.6 }, via: [{ x: 9.8, y: -8.6, tolX: 0.3 }] },
  ],
  'hz-sec-laser': [
    { from: { x: 65, y: 8.8 }, via: [{ x: 55.8, y: 8.8, tolX: 0.4 }] },
    { from: { x: 55.8, y: 8.8 }, via: [{ x: 65, y: 8.8 }] },
  ],
  'hz-core-vent-1': [
    { from: { x: 73, y: 0 }, via: [{ x: 87.5, y: 0, tolX: 0.8 }] },
    { from: { x: 87.5, y: 0 }, via: [{ x: 73, y: 0 }] },
  ],
  'hz-core-vent-2': [
    { from: { x: 73, y: 0 }, via: [{ x: 94, y: 0, tolX: 0.8 }] },
    { from: { x: 94, y: 0 }, via: [{ x: 73, y: 0 }] },
  ],
};

/** A cautious walker (the bot's hold rule) crosses every hazard with zero hits from every cycle phase, in both directions. */
export function checkHazardRoute(level: Level3D): string[] {
  const problems: string[] = [];
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  const col = buildCollider3D(level, doors);
  for (const h of level.hazards) {
    for (const cr of HAZARD_CROSSINGS[h.id] ?? []) {
      for (let off = 0; off < h.period; off += 3) {
        let b = spawnBody3D(cr.from.x, cr.from.y, 0);
        let prevJump = false;
        let hits = 0;
        let leg = 0;
        let done = false;
        for (let t = 0; t < 1400 && !done; t++) {
          const tgt = cr.via[leg];
          if (navReached(b, tgt) && b.grounded && ++leg >= cr.via.length) { done = true; break; }
          const nav = navSteer(b, cr.via[Math.min(leg, cr.via.length - 1)], prevJump, { maxJumps: 2 });
          let moveX = nav.moveX;
          let jump = nav.jump;
          if (b.grounded && hazardHold(h, off + t, b.x, b.y, moveX)) { moveX = 0; jump = false; }
          prevJump = jump;
          b = stepBody3D(b, { moveX, moveZ: 0, jump, dash: false, aimDirX: 1, aimDirZ: 0, dropDown: nav.dropDown, maxJumps: 2 }, col);
          if (hazardHits(h, off + t, b.x, b.y)) hits++;
        }
        if (!done) { problems.push(`${h.id}: crossing from x=${cr.from.x} never completes (offset ${off})`); break; }
        if (hits > 0) { problems.push(`${h.id}: ${hits} hit ticks crossing from x=${cr.from.x} (offset ${off})`); break; }
      }
    }
  }
  return problems;
}

// Only run when executed directly (tests import walkTo/buildReachRoute).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const total = runRoute();
  runGate();
  runCollectibles();
  const foe = checkFoePlacement(buildFacilityMap3D());
  console.log(foe.length === 0 ? 'FOES placement (hives on floor, hangers on ceiling/wall): OK' : `FOES placement FAILED: ${foe.join('; ')}`);
  if (foe.length > 0) process.exit(1);
  const hzLayout = checkHazardLayout(buildFacilityMap3D());
  const hzRoute = checkHazardRoute(buildFacilityMap3D());
  console.log(hzLayout.length + hzRoute.length === 0 ? 'HAZARDS layout, safe windows and timed crossings: OK' : `HAZARDS FAILED: ${[...hzLayout, ...hzRoute].join('; ')}`);
  if (hzLayout.length + hzRoute.length > 0) process.exit(1);
  const n = buildReachRoute(buildFacilityMap3D()).length;
  console.log(`REACH3D PASS: ${n} waypoints, ${total} ticks (${(total / 60).toFixed(1)} s), Thruster Boots gate verified.`);
}

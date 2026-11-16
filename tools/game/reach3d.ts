// Kinematic reachability verifier for the six-sector side-view map using the real stepBody3D physics.
// Verifies the full progression route (blue -> green -> Mines upgrades -> yellow -> Bio-Labs -> Security -> red -> Core -> escape)
// and the Thruster Boots gate (shaft upper deck 4.4 m above the last platform).
import { ABILITY_3D, floorHeightAt3D, stepBody3D, spawnBody3D, type Body3D } from '../../src/engine/motion3d.ts';
import { buildCollider3D, buildFacilityMap3D, type Level3D } from '../../src/game3d/map3d.ts';
import { buildStageMap3D, stageRoute3D, type StageId3D } from '../../src/game3d/stages3d.ts';
import { navReached, navSteer, type NavTarget } from '../../src/game3d/nav3d.ts';
import { hazardCrossHorizon, hazardHits, hazardHold, hazardSafeWindow } from '../../src/game3d/hazards.ts';
import { MELTDOWN_TICKS, SEAL_FINAL_CLOSED_TICKS, SEAL_FINAL_ID, SEAL_FINAL_WARN_TICKS, ESCAPE_BEATS_3D, ROCKET_JUMP_3D, emptyInput3D, newWorld3D, stepWorld3D } from '../../src/game3d/world3d.ts';

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

export interface StageWalkResult {
  ok: boolean;
  ticks: number;
  waypoints: number;
  failedAt: string | null;
}

/** Walks a stage's authored route with the real body physics. Door and bridge ids open as the route names them. */
export function walkStageRoute(stage: StageId3D, skipBoots = false): StageWalkResult {
  const level = buildStageMap3D(stage);
  const route = stageRoute3D(stage);
  const openDoors = new Set<string>();
  let body = spawnBody3D(level.spawn.x, level.spawn.y, 0);
  let maxJumps = 1;
  let total = 0;
  for (const step of route) {
    for (const d of step.opens ?? []) openDoors.add(d);
    const res = walkTo(body, step, level, openDoors, maxJumps, 900);
    total += res.ticks;
    body = res.body;
    if (!res.reached) return { ok: false, ticks: total, waypoints: route.length, failedAt: step.label };
    if (step.boots && !skipBoots) maxJumps = 2;
  }
  return { ok: true, ticks: total, waypoints: route.length, failedAt: null };
}

/** Stage 2 and 3 checks: the route is walkable, every gate really gates, and nothing is sealed. Returns problems (empty = OK). */
export function checkStage(stage: StageId3D): { problems: string[]; ticks: number; waypoints: number } {
  const problems: string[] = [];
  const level = buildStageMap3D(stage);
  const walk = walkStageRoute(stage);
  if (!walk.ok) problems.push(`stage ${stage}: route blocked at "${walk.failedAt}"`);
  // Every lock must stop the route: skip the opens of one door at a time and the walk must fail at or after it.
  const route = stageRoute3D(stage);
  const openers = route.filter((st) => (st.opens ?? []).length > 0);
  for (const gate of openers) {
    const ids = gate.opens ?? [];
    const cut = route.map((st) => (st === gate ? { ...st, opens: [] } : st));
    const openDoors = new Set<string>();
    let body = spawnBody3D(level.spawn.x, level.spawn.y, 0);
    let maxJumps = 1;
    let blocked = false;
    for (const st of cut) {
      for (const d of st.opens ?? []) openDoors.add(d);
      const res = walkTo(body, st, level, openDoors, maxJumps, 900);
      body = res.body;
      if (!res.reached) { blocked = true; break; }
      if (st.boots) maxJumps = 2;
    }
    if (!blocked) problems.push(`stage ${stage}: ${ids.join(',')} does not gate the route`);
  }
  if (stage === 3) {
    const noBoots = walkStageRoute(3, true);
    if (noBoots.ok) problems.push('stage 3: the Hatchery lever ledge is reachable without the Thruster Boots');
    const all = new Set(level.solids.filter((sl) => sl.doorId).map((sl) => sl.doorId!));
    for (const g of [{ sx: 116, target: { x: 121, y: 4.4 } }, { sx: 164, target: { x: 169, y: 4.4 } }]) {
      const from = spawnBody3D(g.sx, 0, 0);
      if (dashReaches(from, g.target, level, all, 1, 900) || wallHopReaches(from, g.target, level, all, 1, 900)) problems.push(`stage 3: lever ledge at x=${g.target.x} is reachable without Boots (dash or wall hop)`);
      if (!walkTo(from, g.target, level, all, 2, 900).reached) problems.push(`stage 3: lever ledge at x=${g.target.x} is unreachable with Boots`);
    }
  }
  // A guard mini-boss must exist, stand on the walked floor inside the last room before the exit, and fit under the ceiling
  const gid = level.stage?.guardId;
  if (gid) {
    const g = level.enemies.find((e) => e.id === gid);
    const last = level.rooms[level.rooms.length - 1];
    if (!g) problems.push(`stage ${stage}: guard ${gid} is not placed`);
    else {
      if (g.x < last.minX + 4 || g.x > level.exitPos.x - 2) problems.push(`stage ${stage}: guard ${gid} is not between the room entrance and the exit`);
      if (g.y !== 0) problems.push(`stage ${stage}: guard ${gid} is not on the main floor`);
      const floor = level.solids.some((sl) => sl.minY <= -1.2 && sl.maxY === 0 && sl.minX <= g.x && sl.maxX >= g.x);
      if (!floor) problems.push(`stage ${stage}: guard ${gid} has no floor under it`);
      const shut = level.solids.find((sl) => sl.doorId && sl.minX > g.x && sl.minX < level.exitPos.x);
      if (shut && shut.doorLock !== 'console') problems.push(`stage ${stage}: guard ${gid} would be sealed behind a weapon lock`);
    }
  }
  // Pickups, logs, saves and the exit must sit within reach of the route (rough check: inside the level bounds, above a floor)
  const { bounds } = level;
  const pts = [...level.dataLogs, ...level.saveStations, ...level.medStations, ...level.upgrades, ...level.pedestals, { id: 'exit', x: level.exitPos.x, y: level.exitPos.y }];
  for (const p of pts) if (p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) problems.push(`stage ${stage}: ${p.id} is outside the level bounds`);
  const lastRoom = level.rooms[level.rooms.length - 1];
  if (level.exitPos.x < lastRoom.minX || level.exitPos.x > lastRoom.maxX) problems.push(`stage ${stage}: exit is not in the last room`);
  return { problems, ticks: walk.ticks, waypoints: walk.waypoints };
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


// ---------------------------------------------------------------------------------------------------------------------------
// Round 5 (Metroid systems): Crawl Slide tunnels, breakable blocks, completion reachability and escape fairness.
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Walks toward `target` holding ground dash + S the whole way (the way a player slides under a low tunnel). With `crawlSlide` false the
 * same inputs are a plain dash, so this doubles as the "no ability" bypass probe.
 */
export function slideWalk(
  start: Body3D,
  target: NavTarget,
  level: Level3D,
  openDoors: ReadonlySet<string>,
  maxJumps: number,
  crawlSlide: boolean,
  maxTicks = 700,
): WalkResult {
  const col = buildCollider3D(level, openDoors);
  const tolX = target.tolX ?? 0.5;
  let b = { ...start };
  for (let t = 0; t < maxTicks; t++) {
    if (navReached(b, target) && b.grounded) return { reached: true, body: b, ticks: t };
    const dx = target.x - b.x;
    const dir = Math.abs(dx) > tolX ? Math.sign(dx) : 0;
    b = stepBody3D(b, { moveX: dir, moveZ: 0, jump: false, dash: true, aimDirX: dir || 1, aimDirZ: 0, dropDown: true, maxJumps, crawlSlide }, col);
  }
  return { reached: false, body: b, ticks: maxTicks };
}

/** Every way a player without the module could try to enter a tunnel: walking, double-jump walking, jet-dash schedules, wall hops, slide inputs. */
export function tunnelBypassable(level: Level3D, openDoors: ReadonlySet<string>, from: { x: number; y: number }, target: NavTarget): string[] {
  const hits: string[] = [];
  const start = spawnBody3D(from.x, from.y, 0);
  for (const mj of [1, 2]) {
    if (walkTo(start, target, level, openDoors, mj, 900).reached) hits.push(`walk maxJumps=${mj}`);
    if (slideWalk(start, target, level, openDoors, mj, false, 900).reached) hits.push(`dash+S maxJumps=${mj}`);
    if (dashReaches(start, target, level, openDoors, mj, 900)) hits.push(`jet-dash maxJumps=${mj}`);
  }
  if (wallHopReaches(start, target, level, openDoors, 2, 900)) hits.push('wall hop / dash cancel');
  return hits;
}

/** Tunnel layout and gate checks. Returns human-readable problems (empty = OK). */
export function checkTunnels(level: Level3D): string[] {
  const problems: string[] = [];
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  const purposes = new Set(level.tunnels.map((t) => t.purpose));
  if (!purposes.has('reward') || !purposes.has('shortcut')) problems.push('need at least one reward and one shortcut tunnel');
  for (const tn of level.tunnels) {
    const from = tn.approach;
    const exitT: NavTarget = { x: tn.exit.x, y: tn.exit.y, tolX: 0.7, tolY: 0.5 };
    const back: NavTarget = { x: tn.approach.x, y: tn.approach.y, tolX: 0.7, tolY: 0.5 };
    const hits = tunnelBypassable(level, doors, from, exitT);
    if (hits.length) problems.push(`${tn.id}: reachable without Crawl Slide (${hits.join(', ')})`);
    const ok = slideWalk(spawnBody3D(from.x, from.y, 0), exitT, level, doors, 2, true, 900);
    if (!ok.reached) problems.push(`${tn.id}: Crawl Slide cannot cross the tunnel`);
    if (tn.purpose === 'shortcut') {
      const rev = slideWalk(spawnBody3D(tn.exit.x, tn.exit.y, 0), back, level, doors, 2, true, 900);
      if (!rev.reached) problems.push(`${tn.id}: shortcut cannot be crossed back`);
      const revNo = tunnelBypassable(level, doors, tn.exit, back);
      if (revNo.length) problems.push(`${tn.id}: reverse reachable without Crawl Slide (${revNo.join(', ')})`);
    }
    // The clearance must be below a standing body and above a sliding one
    if (!(tn.clearance < ABILITY_3D.height && tn.clearance > ABILITY_3D.slideHeight)) problems.push(`${tn.id}: clearance ${tn.clearance} out of range`);
  }
  return problems;
}

export interface BreakCheck {
  label: string;
  breakId: string;
  from: { x: number; y: number };
  target: NavTarget;
  maxJumps: number;
  /** Also require the way back out from `target` to `from` (no softlock inside) */
  back?: NavTarget[];
}

export function buildBreakChecks(): BreakCheck[] {
  return [
    // Rail plate: shaft up-2 platform to the Bio-Labs west ledge
    { label: 'plate-shaft', breakId: 'break_plate_shaft', from: { x: 38, y: 4.4 }, target: { x: 44.2, y: 4.4, tolX: 0.6, tolY: 0.5 }, maxJumps: 2, back: [{ x: 38, y: 4.4, tolX: 0.6, tolY: 0.5 }] },
    // Rail plate: Mines vault to the pocket
    { label: 'plate-mines', breakId: 'break_plate_mines', from: { x: 3, y: -8.6 }, target: { x: -4, y: -8.6, tolX: 0.6, tolY: 0.5 }, maxJumps: 1, back: [{ x: 3, y: -8.6, tolX: 0.6, tolY: 0.5 }] },
    // Stomp floor: Core arena floor to the cache, and back out even without the boots
    { label: 'stomp-core', breakId: 'break_stomp_core', from: { x: 96, y: 0 }, target: { x: 97.5, y: -3.4, tolX: 0.8, tolY: 0.5 }, maxJumps: 1, back: [{ x: 95.8, y: -1.9, tolX: 0.5, tolY: 0.4 }, { x: 92, y: 0, tolX: 0.8, tolY: 0.5 }] },
    // Lean wall: the Security Deck shelf (one plain jump from the deck) to the Vault Nook, and back out by walking off the shelf
    // Round 16 abilities: Blast plate (Cryo alcove floor) to the Blast Cache, Scan hatch (Core floor) to the Lens Cache, Heat seal (Vault Nook) to the Heat Cache
    { label: 'blast-alcove', breakId: 'break_blast_alcove', from: { x: -8, y: 0 }, target: { x: -5.1, y: -3.4, tolX: 0.6, tolY: 0.5 }, maxJumps: 1, back: [{ x: -4.9, y: -1.9, tolX: 0.5, tolY: 0.4 }, { x: -8, y: 0, tolX: 0.8, tolY: 0.5 }] },
    { label: 'scan-core', breakId: 'break_scan_core', from: { x: 76, y: 0 }, target: { x: 72.3, y: -3.4, tolX: 0.6, tolY: 0.5 }, maxJumps: 1, back: [{ x: 72.2, y: -1.9, tolX: 0.5, tolY: 0.4 }, { x: 76, y: 0, tolX: 0.8, tolY: 0.5 }] },
    { label: 'heat-nook', breakId: 'break_heat_nook', from: { x: 75, y: 10.8 }, target: { x: 83, y: 10.8, tolX: 0.6, tolY: 0.5 }, maxJumps: 1, back: [{ x: 75, y: 10.8, tolX: 0.8, tolY: 0.5 }] },
    { label: 'lean-security', breakId: 'break_lean_security', from: { x: 68.9, y: 10.8 }, target: { x: 74, y: 10.8, tolX: 0.8, tolY: 0.5 }, maxJumps: 1, back: [{ x: 68.9, y: 10.8, tolX: 0.5, tolY: 0.5 }, { x: 64, y: 8.8, tolX: 1, tolY: 0.5 }] },
  ];
}

export function checkBreakables(level: Level3D): string[] {
  const problems: string[] = [];
  const doors = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  for (const c of buildBreakChecks()) {
    const sol = level.solids.find((s) => s.breakId === c.breakId);
    if (!sol || !sol.breakBy) { problems.push(`${c.label}: no breakable solid ${c.breakId}`); continue; }
    const closed = new Set(doors);
    const open = new Set(doors).add(c.breakId);
    // Sealed: no walking, jumping, dashing or wall hopping gets through (the break itself needs the weapon or the stomp)
    const hits = tunnelBypassable(level, closed, c.from, c.target);
    if (hits.length) problems.push(`${c.label}: reachable while intact (${hits.join(', ')})`);
    if (!walkTo(spawnBody3D(c.from.x, c.from.y, 0), c.target, level, open, c.maxJumps, 1200).reached) problems.push(`${c.label}: not reachable once broken`);
    if (c.back) {
      let b = spawnBody3D(c.target.x, c.target.y, 0);
      let out = true;
      for (const leg of c.back) {
        const r = walkTo(b, leg, level, open, c.maxJumps, 1500);
        b = r.body;
        if (!r.reached) { out = false; break; }
      }
      if (!out) problems.push(`${c.label}: no way back out once broken`);
    }
  }
  return problems;
}

export interface CompletionLeg {
  label: string;
  from: { x: number; y: number };
  target: NavTarget;
  doors: string[];
  maxJumps: number;
  slide?: boolean;
}

/**
 * Every collectible that is not on the main route has an explicit leg here: the 100% path. Together with buildReachRoute (main route
 * pickups) and buildCollectibleChecks (data logs) every upgrade, log, secret and weapon is covered by `checkCompletion`.
 */
export function buildCompletionLegs(level: Level3D): CompletionLeg[] {
  const up = (id: string) => level.upgrades.find((u) => u.id === id)!;
  const all = level.solids.filter((s) => s.doorId).map((s) => s.doorId!);
  const tn = (id: string) => level.tunnels.find((t) => t.id === id)!;
  const t = (id: string, tol = 0.9): NavTarget => ({ x: up(id).x, y: up(id).y, tolX: tol, tolY: 0.5 });
  const under = tn('tun-underfloor');
  const ped = (id: string) => level.pedestals.find((q) => q.id === id)!;
  const pt = (id: string): NavTarget => ({ x: ped(id).x, y: ped(id).y, tolX: 0.9, tolY: 0.4 });
  return [
    // Round 6 arms: Flamer on the Bio-Labs west ledge (one jump from the first gantry), Rocket on the Security Deck past the console.
    // Neither needs Boots or the Crawl Slide, so both are walked with a single jump.
    { label: 'ped-flamer', from: { x: 48, y: 2.2 }, target: pt('ped-flamer'), doors: all, maxJumps: 1 },
    { label: 'ped-rocket', from: { x: 65, y: 8.8 }, target: { ...pt('ped-rocket'), leap: true }, doors: all, maxJumps: 1 },
    // Crawl Slide module: Security Deck west end, no ability needed
    { label: 'crawl_slide', from: { x: 52, y: 8.8 }, target: t('crawl_slide'), doors: all, maxJumps: 2 },
    // Backtrack 1: Airlock Underfloor Duct (Energy Tank 3). Walk to the ledge, then slide
    { label: 'etank_underfloor (walk west)', from: { x: 33, y: -4.4 }, target: { x: 27.8, y: -4.4, tolX: 0.3, tolY: 0.5 }, doors: all, maxJumps: 2 },
    { label: 'etank_underfloor (hop onto ledge)', from: { x: 27.8, y: -4.4 }, target: { x: under.approach.x, y: under.approach.y, tolX: 0.5, tolY: 0.5 }, doors: all, maxJumps: 2 },
    { label: 'etank_underfloor (slide)', from: under.approach, target: t('etank_underfloor'), doors: all, maxJumps: 2, slide: true },
    // Backtrack 2: Mines pocket behind the Rail plate
    { label: 'ammo_ex_mines', from: { x: 3, y: -8.6 }, target: t('ammo_ex_mines'), doors: [...all, 'break_plate_mines'], maxJumps: 1 },
    // Round 16 abilities. Pickups need no gate bypass: the alcove (Grenade door), the roof cache (Boots, yellow door) and the Core Cache (stomp).
    { label: 'blast_core', from: { x: 3, y: 0 }, target: t('blast_core'), doors: all, maxJumps: 1 },
    { label: 'scan_lens', from: { x: 30, y: 8.8 }, target: t('scan_lens'), doors: all, maxJumps: 2 },
    { label: 'thermal_plating', from: { x: 96, y: 0 }, target: t('thermal_plating'), doors: [...all, 'break_stomp_core'], maxJumps: 1 },
    { label: 'etank_blast', from: { x: -8, y: 0 }, target: t('etank_blast'), doors: [...all, 'break_blast_alcove'], maxJumps: 1 },
    { label: 'ammo_ex_scan', from: { x: 76, y: 0 }, target: t('ammo_ex_scan'), doors: [...all, 'break_scan_core'], maxJumps: 1 },
    { label: 'etank_heat', from: { x: 75, y: 10.8 }, target: t('etank_heat'), doors: [...all, 'break_heat_nook'], maxJumps: 1 },
    // Backtrack 3: Core cache under the stomp floor
    { label: 'ammo_ex_core', from: { x: 96, y: 0 }, target: t('ammo_ex_core'), doors: [...all, 'break_stomp_core'], maxJumps: 1 },
  ];
}

export function checkCompletion(level: Level3D): string[] {
  const problems: string[] = [];
  for (const leg of buildCompletionLegs(level)) {
    const start = spawnBody3D(leg.from.x, leg.from.y, 0);
    const doors = new Set(leg.doors);
    const r = leg.slide ? slideWalk(start, leg.target, level, doors, leg.maxJumps, true, 900) : walkTo(start, leg.target, level, doors, leg.maxJumps, 1500);
    if (!r.reached) problems.push(`completion leg "${leg.label}" unreachable (ended at ${r.body.x.toFixed(2)}, ${r.body.y.toFixed(2)})`);
  }
  // Coverage: every upgrade is either on the main route or has a leg here
  const mainRoute = new Set(['thruster_boots', 'etank_mines', 'etank_biolabs']);
  const covered = new Set(buildCompletionLegs(level).map((l) => l.label.split(' ')[0]));
  for (const u of level.upgrades) {
    if (!mainRoute.has(u.id) && !covered.has(u.id)) problems.push(`upgrade ${u.id} is not on any completion leg`);
  }
  // Weapons: pedestals 2-4 sit on the main route, the Round 6 arms have explicit legs
  const mainPeds = new Set(['ped-scatter', 'ped-grenade', 'ped-rail']);
  for (const q of level.pedestals) {
    if (!mainPeds.has(q.id) && !covered.has(q.id)) problems.push(`pedestal ${q.id} is not on any completion leg`);
  }
  return problems;
}

/**
 * Escape fairness: the walking route from the reactor to the exit (no dash, no bot) must finish with at least 20 s to spare before
 * the final hatch shutter closes, the beats must be ordered, and the shutter must block the route once shut.
 */
export function checkEscapeFairness(level: Level3D): { problems: string[]; routeTicks: number; spareTicks: number } {
  const problems: string[] = [];
  const route = buildReachRoute(level);
  const startIdx = route.findIndex((r) => r.label === 'Core -> Bio-Labs');
  const legs = route.slice(startIdx);
  const open = new Set(level.solids.filter((s) => s.doorId).map((s) => s.doorId!));
  let body = spawnBody3D(level.corePos.x - 2.2, 0, 0);
  let routeTicks = 0;
  for (const step of legs) {
    const res = walkTo(body, step, level, open, 2);
    routeTicks += res.ticks;
    body = res.body;
    if (!res.reached) problems.push(`escape route stuck at "${step.label}"`);
  }
  const spareTicks = MELTDOWN_TICKS - SEAL_FINAL_CLOSED_TICKS - routeTicks;
  if (spareTicks < 20 * 60) problems.push(`final hatch closes with only ${(spareTicks / 60).toFixed(1)} s to spare (need 20 s)`);
  if (SEAL_FINAL_WARN_TICKS - SEAL_FINAL_CLOSED_TICKS < 180) problems.push('final hatch warning shorter than 3 s');
  const ats = ESCAPE_BEATS_3D.map((b) => b.at);
  if (!ats.every((a, i) => i === 0 || a < ats[i - 1])) problems.push('escape beats are not in descending time order');
  if (ats[ats.length - 1] !== SEAL_FINAL_WARN_TICKS) problems.push('last beat must be the final hatch warning');
  // The shutter sits on the route and blocks it once shut
  const shut = new Set([...open, SEAL_FINAL_ID]);
  const blocked = walkTo(spawnBody3D(22, 5.2, 0), { x: level.exitPos.x, y: level.exitPos.y, tolX: 1.5 }, level, shut, 2, 900);
  if (blocked.reached) problems.push('shut final hatch does not block the route');
  const free = walkTo(spawnBody3D(22, 5.2, 0), { x: level.exitPos.x, y: level.exitPos.y, tolX: 1.5 }, level, open, 2, 900);
  if (!free.reached) problems.push('open final hatch route is blocked');
  return { problems, routeTicks, spareTicks };
}


// ---------------------------------------------------------------------------------------------------------------------------
// Round 6 arms: the Rocket launcher's self-blast must never substitute for Thruster Boots (4.4 m gates) or the Crawl Slide (tunnels).
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Real-world rocket-jump probe (stepWorld3D, no Boots, no Crawl Slide, enemies removed). Sweeps jump timing, hold length, rocket
 * timing and aim (down, down-forward, down-back), horizontal input, and an optional dash, firing at most one rocket per schedule
 * plus a follow-up rocket. Returns true if any schedule lands (grounded) on `target`.
 */
export function rocketJumpReaches(
  from: { x: number; y: number },
  target: NavTarget,
  /** 'land' = grounded inside the target tolerance (tunnels); 'height' = feet ever reach the target's elevation (gates, conservative) */
  mode: 'land' | 'height' = 'land',
  maxTicks = 170,
): { reached: boolean; apex: number } {
  const openAll = true;
  let apex = from.y;
  const w = newWorld3D();
  for (const e of w.enemies) e.alive = false;
  for (const h of w.hives) h.alive = false;
  for (const b of w.barrels) b.alive = false;
  if (openAll) for (const s of w.level.solids) if (s.doorId) w.openDoors.add(s.doorId);
  const towards = Math.sign(target.x - from.x) || 1;
  for (const jumpAt of [0, 6, 14, 24]) {
    for (const hold of [2, 40]) {
      for (const fireOff of [-3, 0, 3, 7, 12, 18, 26, 36]) {
        for (const aimDeg of [90, 62, 35, 118]) {
          for (const mv of [towards, 0]) {
            for (const dashAt of [-1, jumpAt + 8]) {
              // reset the single reusable world
              w.status = 'playing';
              w.projectiles = [];
              w.explosions = [];
              w.tick = 0;
              const p = w.player;
              p.body = spawnBody3D(from.x, from.y, 0);
              p.hp = p.maxHp;
              p.hurtInvulnTicks = 0;
              p.fireCooldown = 0;
              p.rocketBoosted = false;
              p.unlocked[6] = true;
              p.ammo[6] = 9;
              p.weapon = 6;
              p.abilities.thrusterBoots = false;
              p.abilities.crawlSlide = false;
              let followed = false;
              for (let t = 0; t < maxTicks; t++) {
                const inp = emptyInput3D();
                inp.moveX = mv;
                inp.jump = t >= jumpAt && t < jumpAt + hold;
                inp.dash = t === dashAt;
                const fireAt = jumpAt + fireOff;
                // second rocket a bit after the first lands, aimed down again (the one-boost-per-airborne rule must hold)
                const shoot = t === fireAt || (!followed && t === fireAt + 24 && fireAt >= 0);
                if (t === fireAt + 24) followed = true;
                inp.fire = shoot && fireAt >= 0;
                const b = p.body;
                const a = (aimDeg * Math.PI) / 180;
                // aim 90 = straight down; angles lean toward the target side (or away when > 90)
                inp.aimX = b.x + Math.cos(a - Math.PI / 2) * towards * 4;
                inp.aimY = b.y + 1.12 - Math.sin(a) * 4;
                stepWorld3D(w, inp);
                if (w.status !== 'playing') break;
                const nb = p.body;
                apex = Math.max(apex, nb.y);
                if (mode === 'height' ? nb.y >= target.y - 0.05 : navReached(nb, target) && nb.grounded) return { reached: true, apex };
                if (nb.y < from.y - 14) break;
                if (nb.grounded && t > fireAt + 40) break;
              }
            }
          }
        }
      }
    }
  }
  return { reached: false, apex };
}

export interface RocketProbeSite {
  label: string;
  from: { x: number; y: number };
  target: NavTarget;
  mode: 'land' | 'height';
}

/** The three Thruster Boots gates (4.4 m) and the two Crawl Slide tunnels. */
export function rocketProbeSites(level: Level3D): RocketProbeSite[] {
  const sites: RocketProbeSite[] = [
    { label: 'shaft upper deck', from: { x: 38, y: 4.4 }, target: { x: 31, y: 8.8 }, mode: 'height' },
    { label: 'security grate', from: { x: 65, y: 4.4 }, target: { x: 65, y: 8.8 }, mode: 'height' },
    { label: 'security grate (west plat)', from: { x: 55, y: 4.5 }, target: { x: 65, y: 8.8 }, mode: 'height' },
  ];
  for (const tn of level.tunnels) sites.push({ label: tn.id, from: tn.approach, target: { x: tn.exit.x, y: tn.exit.y, tolX: 0.7, tolY: 0.5 }, mode: 'land' });
  return sites;
}

/**
 * Rocket jump must not bypass any Thruster Boots gate or Crawl Slide tunnel. The control run lifts the vertical cap (and only that) and
 * must then reach at least one gate, otherwise the probe is too weak to mean anything. Returns problems (empty = OK).
 */
export function checkRocketJump(level: Level3D): { problems: string[]; bestApex: number } {
  const problems: string[] = [];
  const sites = rocketProbeSites(level);
  let bestApex = 0;
  for (const s of sites) {
    const r = rocketJumpReaches(s.from, s.target, s.mode);
    if (s.mode === 'height') bestApex = Math.max(bestApex, r.apex - s.from.y);
    if (r.reached) problems.push(`${s.label}: rocket jump reaches the target without Boots / Crawl Slide (apex ${r.apex.toFixed(2)})`);
  }
  const saved = { ...ROCKET_JUMP_3D };
  try {
    ROCKET_JUMP_3D.vyCap = 40;
    ROCKET_JUMP_3D.kickY = 40;
    ROCKET_JUMP_3D.radius = 6;
    const gateReached = sites.slice(0, 3).some((s) => rocketJumpReaches(s.from, s.target, s.mode).reached);
    if (!gateReached) problems.push('control: an uncapped rocket jump reaches no boots gate, so the probe is not exercising the blast');
  } finally {
    Object.assign(ROCKET_JUMP_3D, saved);
  }
  return { problems, bestApex };
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
  const lvl = buildFacilityMap3D();
  const r5 = [...checkTunnels(lvl), ...checkBreakables(lvl), ...checkCompletion(lvl)];
  console.log(r5.length === 0 ? `METROID tunnels (${lvl.tunnels.length}, no bypass without Crawl Slide), breakables, 100% completion legs: OK` : `METROID FAILED: ${r5.join('; ')}`);
  if (r5.length > 0) process.exit(1);
  const esc = checkEscapeFairness(lvl);
  console.log(esc.problems.length === 0 ? `ESCAPE fairness: walking route ${(esc.routeTicks / 60).toFixed(1)} s, ${(esc.spareTicks / 60).toFixed(1)} s spare before the final hatch shuts: OK` : `ESCAPE FAILED: ${esc.problems.join('; ')}`);
  if (esc.problems.length > 0) process.exit(1);
  const t0 = Date.now();
  const rj = checkRocketJump(lvl);
  console.log(rj.problems.length === 0 ? `ROCKET JUMP: no bypass of ${rocketProbeSites(lvl).length} boots gates / tunnels (vy cap ${ROCKET_JUMP_3D.vyCap} m/s, best rise ${rj.bestApex.toFixed(2)} m of 4.40 m), uncapped control reaches a gate (${Date.now() - t0} ms): OK` : `ROCKET JUMP FAILED: ${rj.problems.join('; ')}`);
  if (rj.problems.length > 0) process.exit(1);
  for (const st of [2, 3] as const) {
    const sc = checkStage(st);
    const lvl2 = buildStageMap3D(st);
    const foe2 = checkFoePlacement(lvl2);
    const hz2 = [...checkHazardLayout(lvl2), ...checkHazardRoute(lvl2)];
    const all = [...sc.problems, ...foe2, ...hz2];
    console.log(all.length === 0 ? `STAGE ${st} (${lvl2.stage?.name}): ${sc.waypoints} waypoints, ${sc.ticks} ticks (${(sc.ticks / 60).toFixed(1)} s), gates, foes, hazards: OK` : `STAGE ${st} FAILED: ${all.join('; ')}`);
    if (all.length > 0) process.exit(1);
  }
  const n = buildReachRoute(buildFacilityMap3D()).length;
  console.log(`REACH3D PASS: ${n} waypoints, ${total} ticks (${(total / 60).toFixed(1)} s), Thruster Boots gate verified.`);
}

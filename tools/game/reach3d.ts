// Kinematic 3D capsule reachability verifier for src/game3d/map3d.ts using real stepBody3D physics.
// Verifies START -> [Scattergun Catwalk] -> CONSOLE (Gate C) -> CORE (Gate D) -> EXIT.
import { stepBody3D, spawnBody3D, type Body3D } from '../../src/engine/motion3d.ts';
import { buildCollider3D, buildFacilityMap3D } from '../../src/game3d/map3d.ts';

interface Waypoint {
  label: string;
  x: number;
  y: number;
  z: number;
  tolXZ: number;
  tolY: number;
  unlocksDoor?: string;
}

function steerTo(
  start: Body3D,
  targetX: number,
  targetY: number,
  targetZ: number,
  tolXZ: number,
  tolY: number,
  openDoors: Set<string>,
  level: ReturnType<typeof buildFacilityMap3D>,
  maxTicks = 900,
): { reached: boolean; body: Body3D; ticks: number } {
  const col = buildCollider3D(level, openDoors);
  let b = { ...start };
  let stuckTicks = 0;
  let lastDist = Infinity;

  for (let t = 0; t < maxTicks; t++) {
    const dx = targetX - b.x;
    const dz = targetZ - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= tolXZ && Math.abs(b.y - targetY) <= tolY) {
      return { reached: true, body: b, ticks: t };
    }
    const dirX = dist > 1e-4 ? dx / dist : 0;
    const dirZ = dist > 1e-4 ? dz / dist : 0;
    if (dist > lastDist - 0.01) stuckTicks++;
    else stuckTicks = 0;
    lastDist = dist;

    // Jump if obstacle/acid/elevation needs clearing, dash on long stretches
    const inAcid = level.acidPools.some(
      (p) => b.x + dirX * 1.1 >= p.minX && b.x + dirX * 1.1 <= p.maxX && b.z >= p.minZ && b.z <= p.maxZ,
    );
    const jump = b.grounded && (stuckTicks > 22 || inAcid);
    const dash = b.dashCooldown === 0 && dist > 6.0 && stuckTicks === 0;

    b = stepBody3D(
      b,
      {
        moveX: dirX,
        moveZ: dirZ,
        jump,
        dash,
        aimDirX: dirX,
        aimDirZ: dirZ,
      },
      col,
    );
  }
  return { reached: false, body: b, ticks: maxTicks };
}

const level = buildFacilityMap3D();
const openDoors = new Set<string>();
let body = spawnBody3D(level.spawn.x, level.spawn.y, level.spawn.z);

const route: Waypoint[] = [
  { label: 'Ramp A foot', x: 9.8, y: 0, z: -6.2, tolXZ: 0.9, tolY: 0.5 },
  { label: 'Catwalk A / Scattergun', x: level.pedestals[0].x, y: level.pedestals[0].y, z: level.pedestals[0].z, tolXZ: 0.9, tolY: 0.4 },
  { label: 'Ramp A down exit', x: 20.87, y: 0, z: 0.0, tolXZ: 1.2, tolY: 0.5 },
  { label: 'Gate AB threshold', x: 24.0, y: 0, z: 0.0, tolXZ: 1.0, tolY: 0.5 },
  { label: 'Ramp B foot', x: 24.4, y: 0, z: -6.8, tolXZ: 0.9, tolY: 0.5 },
  { label: 'Security Console', x: level.consolePos.x, y: level.consolePos.y, z: level.consolePos.z, tolXZ: 1.3, tolY: 0.5, unlocksDoor: 'gate_c' },
  { label: 'Ramp B down exit', x: 49.4, y: 0, z: -6.8, tolXZ: 1.0, tolY: 0.5 },
  { label: 'Gate C threshold', x: 52.5, y: 0, z: 0.0, tolXZ: 1.1, tolY: 0.5 },
  { label: 'Power Core', x: level.corePos.x - 1.6, y: 0, z: 0.0, tolXZ: 1.4, tolY: 0.5, unlocksDoor: 'gate_d' },
  { label: 'Exit Gate', x: level.exitPos.x, y: level.exitPos.y, z: level.exitPos.z, tolXZ: 1.5, tolY: 0.5 },
];

let totalTicks = 0;
for (const wp of route) {
  const res = steerTo(body, wp.x, wp.y, wp.z, wp.tolXZ, wp.tolY, openDoors, level);
  totalTicks += res.ticks;
  body = res.body;
  console.log(
    `${res.reached ? 'OK  ' : 'FAIL'} ${wp.label.padEnd(24)} -> pos=(${body.x.toFixed(2)}, ${body.y.toFixed(2)}, ${body.z.toFixed(2)}) in ${res.ticks} ticks`,
  );
  if (!res.reached) {
    console.error(`Reachability check FAILED at "${wp.label}"`);
    process.exit(1);
  }
  if (wp.unlocksDoor) {
    openDoors.add(wp.unlocksDoor);
    console.log(`     [unlocked ${wp.unlocksDoor}]`);
  }
}

console.log(`REACH3D PASS: All ${route.length} 3D facility waypoints traversed cleanly in ${totalTicks} ticks (${(totalTicks / 60).toFixed(1)}s).`);

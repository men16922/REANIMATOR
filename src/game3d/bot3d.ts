// Deterministic closed-loop Full 3D tactical bot for REANIMATOR.
// Shared by tools/game/playthrough.ts and tools/smoke/capture-showcase.ts to drive real stepWorld3D runs.

import { castRaySolidDistance3D, emptyInput3D, type InputState3D, type WorldState3D } from './world3d.ts';
import type { WeaponSlot3D } from './map3d.ts';

function chooseWaypoint(w: WorldState3D): { x: number; z: number; interact: boolean } {
  const pb = w.player.body;
  const x = pb.x;
  const y = pb.y;
  const z = pb.z;

  // Low HP priority: scoop nearby med pickup inside current/adjacent arena if close
  if (w.player.hp < 68) {
    let bestMed: { x: number; z: number; d: number } | null = null;
    for (const pk of w.pickups) {
      if (pk.taken || pk.kind !== 'med') continue;
      const d = Math.hypot(pk.x - x, pk.z - z);
      if (d < 10 && Math.abs(pk.y - y) < 0.8 && (!bestMed || d < bestMed.d)) {
        bestMed = { x: pk.x, z: pk.z, d };
      }
    }
    if (bestMed) return { x: bestMed.x, z: bestMed.z, interact: false };
  }

  // 1. Grab Scattergun on Catwalk A
  if (!w.player.unlocked[2]) {
    if (y > 1.3 && z <= -4.4) {
      return { x: w.level.pedestals[0].x, z: w.level.pedestals[0].z, interact: false };
    }
    if (z > -4.6) {
      return { x: 9.8, z: -6.2, interact: false };
    }
    return { x: 18.6, z: -6.2, interact: false };
  }

  // Descend Catwalk A before entering Zone B
  if (x < 22.8 && (y > 0.6 || z < -3.5)) {
    if (x < 19.6 && y > 1.4) return { x: 20.5, z: -6.2, interact: false };
    return { x: 20.8, z: -0.2, interact: false };
  }

  // 2. Unlock Zone B Console (& scoop Grenade Launcher on south side first)
  if (!w.consoleUnlocked) {
    if (!w.player.unlocked[3] && y < 0.8) {
      if (x < 24.2) return { x: 24.4, z: 0.2, interact: false };
      if (z < 4.5 && x < 31.0) return { x: 25.0, z: 6.2, interact: false };
      return { x: w.level.pedestals[1].x, z: w.level.pedestals[1].z, interact: false };
    }
    if (y > 1.4 && z <= -4.8) {
      return { x: w.level.consolePos.x, z: w.level.consolePos.z + 0.6, interact: true };
    }
    // Route safely west of acid pit back up Ramp B (x 25..29.8, z -8.5..-5.1)
    if (z > 2.6 && x > 25.8) {
      return { x: 24.6, z: 6.5, interact: false };
    }
    if (z > -5.1) {
      return { x: 24.6, z: -6.8, interact: false };
    }
    return { x: 31.0, z: -6.8, interact: false };
  }

  // 3. Descend Catwalk B & Pass Gate C into Boss Arena
  if (x < 51.8) {
    if (y > 0.6 || (x < 49.4 && z < -4.5)) {
      if (x < 49.2) return { x: 49.8, z: -6.8, interact: false };
      return { x: 50.2, z: -0.2, interact: false };
    }
    return { x: 52.8, z: 0.0, interact: false };
  }

  // Grab Rail-Cannon pedestal in NW corner of Zone C
  if (!w.player.unlocked[4] && w.phase === 'warden') {
    if (z > -4.2) return { x: 54.0, z: -7.2, interact: false };
    return { x: w.level.pedestals[2].x, z: w.level.pedestals[2].z, interact: false };
  }

  // 4. Core Warden Boss Arena Orbit (Zone C: x 54..71, z -7.5..7.5)
  const warden = w.enemies.find((e) => e.kind === 'warden');
  if (warden && warden.alive) {
    // Dynamic orbit around arena center (64, 0) opposing Warden's vector to maintain 7.5..11m range
    const ang = (Math.floor(w.tick / 90) % 4) * (Math.PI / 2) + 0.45;
    let tx = 64.0 + Math.cos(ang) * 7.2;
    let tz = Math.sin(ang) * 6.4;
    // Keep clear of Core Warden collision & pillars
    const dW = Math.hypot(tx - warden.x, tz - warden.z);
    if (dW < 5.5) {
      tx = warden.x < 64 ? 70.5 : 56.5;
      tz = warden.z > 0 ? -6.2 : 6.2;
    }
    return { x: tx, z: tz, interact: false };
  }

  // 5. Shatter Reactor Power Core
  if (!w.coreDestroyed) {
    if (Math.hypot(x - 69.0, z) > 2.2) return { x: 69.0, z: 0.0, interact: false };
    return { x: 70.2, z: 0.0, interact: false };
  }

  // 6. Meltdown Escape through Gate D -> Exit Portal
  if (x < 79.0 && Math.abs(z) > 2.2) {
    return { x: 77.2, z: 0.0, interact: false };
  }
  return { x: w.level.exitPos.x, z: w.level.exitPos.z, interact: false };
}

function avoidObstacles(w: WorldState3D, dx: number, dz: number): { mx: number; mz: number } {
  const pb = w.player.body;
  let rx = dx;
  let rz = dz;

  // Repel from sunken acid pool unless jumping or on catwalk
  if (pb.y < 1.2) {
    for (const pool of w.level.acidPools) {
      const cx = (pool.minX + pool.maxX) * 0.5;
      const cz = (pool.minZ + pool.maxZ) * 0.5;
      const halfW = (pool.maxX - pool.minX) * 0.5 + 1.0;
      const halfD = (pool.maxZ - pool.minZ) * 0.5 + 1.0;
      const ox = pb.x + dx * 1.4 - cx;
      const oz = pb.z + dz * 1.4 - cz;
      if (Math.abs(ox) < halfW && Math.abs(oz) < halfD) {
        rz += pb.z >= cz ? 1.5 : -1.5;
      }
    }
  }

  // Steer smoothly around structural pillars
  for (const p of w.level.pillars) {
    const px = pb.x + dx * 1.1 - p.x;
    const pz = pb.z + dz * 1.1 - p.z;
    const d = Math.hypot(px, pz);
    if (d < p.radius + 1.05 && d > 1e-4) {
      rx += (px / d) * 1.2;
      rz += (pz / d) * 1.2;
    }
  }

  // Add slight sinusoidal dodge jitter when facing ranged spitters/warden projectiles
  for (const pr of w.projectiles) {
    if (pr.fromPlayer) continue;
    const dp = Math.hypot(pr.x - pb.x, pr.z - pb.z);
    if (dp < 6.0 && dp > 0.2) {
      const pLen = Math.hypot(pr.vx, pr.vz) || 1;
      const sideX = -pr.vz / pLen;
      const sideZ = pr.vx / pLen;
      const sideSign = (pb.x - pr.x) * sideX + (pb.z - pr.z) * sideZ >= 0 ? 1 : -1;
      rx += sideX * sideSign * 1.4;
      rz += sideZ * sideSign * 1.4;
    }
  }

  const len = Math.hypot(rx, rz);
  return len > 1e-4 ? { mx: rx / len, mz: rz / len } : { mx: 0, mz: 0 };
}

function pickCombatTarget(w: WorldState3D): {
  x: number;
  y: number;
  z: number;
  dist: number;
  isBoss: boolean;
  isCore: boolean;
  clusterCount: number;
} | null {
  const pb = w.player.body;
  const ox = pb.x;
  const oy = pb.y + 1.12;
  const oz = pb.z;

  // Priority 1: Core Target after Warden dies
  const wardenAlive = w.enemies.some((e) => e.kind === 'warden' && e.alive);
  if (!wardenAlive && !w.coreDestroyed && pb.x >= 50.5) {
    const cx = w.level.corePos.x;
    const cy = 1.25;
    const cz = w.level.corePos.z;
    const dist = Math.hypot(cx - ox, cy - oy, cz - oz);
    if (dist < 22) {
      return { x: cx, y: cy, z: cz, dist, isBoss: false, isCore: true, clusterCount: 1 };
    }
  }

  // Priority 2: Explosive barrel within blast radius of enemies (when player outside self-damage zone)
  for (const b of w.barrels) {
    if (!b.alive || b.fuseTicks >= 0) continue;
    const db = Math.hypot(b.x - ox, (b.y + 0.65) - oy, b.z - oz);
    if (db < 4.2 || db > 19) continue;
    const nearEnemy = w.enemies.some((e) => e.alive && Math.hypot(e.x - b.x, e.z - b.z) < 4.3);
    if (!nearEnemy) continue;
    const dx = (b.x - ox) / db;
    const dy = (b.y + 0.65 - oy) / db;
    const dz = (b.z - oz) / db;
    if (castRaySolidDistance3D(w, ox, oy, oz, dx, dy, dz, db) >= db - 0.8) {
      return { x: b.x, y: b.y + 0.65, z: b.z, dist: db, isBoss: false, isCore: false, clusterCount: 2 };
    }
  }

  // Priority 3: Nearest enemy with clear line of sight (skip non-blocking chase targets far behind walls)
  let best: {
    x: number;
    y: number;
    z: number;
    dist: number;
    isBoss: boolean;
    isCore: boolean;
    clusterCount: number;
    score: number;
  } | null = null;

  for (const e of w.enemies) {
    if (!e.alive) continue;
    const ty = e.y + e.height * 0.52;
    const dist = Math.hypot(e.x - ox, ty - oy, e.z - oz);
    if (dist > 24) continue;
    const dx = (e.x - ox) / (dist || 1);
    const dy = (ty - oy) / (dist || 1);
    const dz = (e.z - oz) / (dist || 1);
    const wallDist = castRaySolidDistance3D(w, ox, oy, oz, dx, dy, dz, dist);
    if (wallDist < dist - e.radius - 0.55) continue;

    const cluster = w.enemies.filter(
      (o) => o.alive && Math.hypot(o.x - e.x, o.z - e.z) < 3.6,
    ).length;
    const score = dist - (e.kind === 'warden' ? 4 : 0) - cluster * 1.2;
    if (!best || score < best.score) {
      best = {
        x: e.x,
        y: ty,
        z: e.z,
        dist,
        isBoss: e.kind === 'warden',
        isCore: false,
        clusterCount: cluster,
        score,
      };
    }
  }

  return best;
}

function selectWeapon(w: WorldState3D, target: ReturnType<typeof pickCombatTarget>): WeaponSlot3D {
  const p = w.player;
  if (!target) return p.unlocked[2] && p.ammo[2] > 6 ? 2 : 1;

  if (p.unlocked[4] && p.ammo[4] > 0 && (target.isBoss || target.isCore || target.clusterCount >= 2 || target.dist > 11)) {
    return 4;
  }
  if (p.unlocked[3] && p.ammo[3] > 0 && target.dist > 5.0 && target.dist < 17 && (target.clusterCount >= 2 || target.isBoss || target.isCore)) {
    return 3;
  }
  if (p.unlocked[2] && p.ammo[2] > 0 && target.dist < 9.5) {
    return 2;
  }
  return 1;
}

export function computeBotInput3D(w: WorldState3D): InputState3D {
  const inp = emptyInput3D();
  const pb = w.player.body;

  // Steering toward objective waypoint
  const wp = chooseWaypoint(w);
  const wx = wp.x - pb.x;
  const wz = wp.z - pb.z;
  const wpDist = Math.hypot(wx, wz);
  if (wpDist > 0.35) {
    const { mx, mz } = avoidObstacles(w, wx / wpDist, wz / wpDist);
    inp.moveX = mx;
    inp.moveZ = mz;
  }
  inp.interact = wp.interact;

  // Jump cleanly over approaching Core Warden shockwave rings
  for (const sw of w.shockwaves) {
    const dXZ = Math.hypot(pb.x - sw.x, pb.z - sw.z);
    if (dXZ > sw.radius - 0.6 && dXZ - sw.radius < 2.25 && pb.grounded) {
      inp.jump = true;
      break;
    }
  }

  // Also jump if trying to traverse a low crate / lip and horizontal speed stalls
  if (pb.grounded && wpDist > 1.2 && Math.hypot(pb.vx, pb.vz) < 1.2 && w.tick % 24 === 12) {
    inp.jump = true;
  }

  // Jet-Dash through Gate D meltdown run or incoming boss plasma volleys
  const dangerIncoming = w.projectiles.some((pr) => !pr.fromPlayer && Math.hypot(pr.x - pb.x, pr.z - pb.z) < 3.6);
  if (pb.dashCooldown === 0 && (w.phase === 'escape' || dangerIncoming)) {
    inp.dash = true;
  }

  // Aim & fire at optimal threat / barrel / core
  const target = pickCombatTarget(w);
  if (target) {
    inp.aimX = target.x;
    inp.aimY = target.y;
    inp.aimZ = target.z;
    inp.weaponSlot = selectWeapon(w, target);
    inp.fire = true;
  } else {
    // Look down travel vector
    inp.aimX = pb.x + (inp.moveX || 1) * 8;
    inp.aimY = pb.y + 1.1;
    inp.aimZ = pb.z + inp.moveZ * 8;
  }

  return inp;
}

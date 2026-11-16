// Stage 3: Reactor Spire. New design (not Abuse data). A 212 m run with a Thruster Boots gate, two brood nests,
// chained lever doors and the Core Warden at the end. The exit teleporter only works once the Warden is down.

import { StageKit } from './stageKit.ts';
import type { StageWaypoint } from './stage2.ts';
import type { Level3D } from './types3d.ts';

export const STAGE3_NAME = 'Reactor Spire';

export function buildStage3Map3D(): Level3D {
  const k = new StageKit('s3');

  // ===== 1. Breach Hall (airlock) =====
  const breach = k.room('breach', 'airlock', 'Breach Hall', 'Blown-out lobby. The blue shutter opens to a Pulse shot.', 30, 0x1a2a3a);
  k.fullFloor(breach);
  k.crate('breach-crate', 9.0, 10.4, 1.4);
  k.platform('breach-ledge', 17, 23, 2.2);
  k.pillarRow(breach, 7);
  k.pack('airlock', ['crawler', 'crawler', 'stalker', 'crawler', 'spitter', 'crawler', 'stalker', 'crawler'], 12.5, 27.5);
  k.barrel(16.2);
  k.med(5, 35);
  k.save(breach, 28.5);
  k.log('log_s3_breach', 'airlock', 'Spire Log 01: Breach Report', 20, 2.2);
  k.gate(30, 'blue', 'door_s3_breach');

  // ===== 2. Cryo Stacks (shaft) =====
  const stacks = k.room('stacks', 'shaft', 'Cryo Stacks', 'Frozen racks. A lever on the top rack unlocks the east door.', 34, 0x1d2433);
  k.fullFloor(stacks);
  k.platform('stacks-a', 36, 41, 2.2);
  k.platform('stacks-b', 41, 46.5, 4.4);
  k.platform('stacks-c', 48, 53, 2.2);
  k.lever('sw-s3-stacks', 'shaft', 45, 4.4, 'door_s3_stacks', 'CRYO RACK LEVER');
  k.pack('shaft', ['stalker', 'crawler', 'spitter', 'crawler', 'crawler', 'stalker', 'spitter', 'crawler', 'crawler', 'stalker', 'crawler', 'spitter'], 33.5, 61);
  k.foe('shaft', 'spitter', 50.5, 2.2);
  k.barrel(56);
  k.save(stacks, 32);
  k.med(52, 40);
  k.log('log_s3_stacks', 'shaft', 'Spire Log 02: Cold Storage', 38.5, 2.2);
  k.pillarRow(stacks, 8);
  k.gate(64, 'console', 'door_s3_stacks');

  // ===== 3. Drain Tunnels (mines) =====
  const drain = k.room('drain', 'mines', 'Drain Tunnels', 'Flooded drain. Lower the gantry. The Thruster Boots sit on the far ledge.', 36, 0x1f3a22);
  k.pit(drain, 74, 82, 'bridge_s3_drain');
  k.lever('sw-s3-drain', 'mines', 71, 0, 'bridge_s3_drain', 'DRAIN GANTRY LEVER');
  k.platform('drain-ledge', 88, 94, 2.2);
  k.upgrade('thruster_boots', 'thruster_boots', 91, 2.2);
  k.weapon('ped-s3-rail', 4, 97, 0);
  k.pack('mines', ['crawler', 'spitter'], 65.5, 70);
  k.pack('mines', ['stalker', 'crawler', 'spitter', 'crawler', 'stalker', 'crawler', 'crawler', 'spitter'], 83.5, 98.5, [[88, 94]]);
  k.vent('mines', 86.5, 0);
  k.barrel(84.4);
  k.save(drain, 66);
  k.med(96, 45);
  k.log('log_s3_drain', 'mines', 'Spire Log 03: Outflow Valve', 78, 0.4);
  k.pillarRow(drain, 8);
  k.gate(100, 'green', 'door_s3_drain');

  // ===== 4. Hatchery (biolabs) =====
  const hatch = k.room('hatchery', 'biolabs', 'Hatchery', 'Two brood nests. The lever ledge is out of reach of a single jump.', 42, 0x2b3a1a);
  k.fullFloor(hatch);
  k.hive('biolabs', 108);
  k.hive('biolabs', 130);
  k.platform('hatch-low', 103, 108, 2.2);
  k.upgrade('etank_s3_hatchery', 'energy_tank', 105.5, 2.2);
  k.platform('hatch-gate', 118, 124, 4.4);
  k.lever('sw-s3-hatchery', 'biolabs', 121, 4.4, 'door_s3_hatchery', 'HATCHERY LEVER');
  k.foe('biolabs', 'spitter', 111, 2.2);
  k.pack('biolabs', ['crawler', 'stalker', 'crawler'], 101.5, 106.5, [[107, 109]]);
  k.pack('biolabs', ['spitter', 'crawler', 'stalker', 'crawler', 'crawler', 'stalker', 'spitter', 'crawler'], 111, 128);
  k.pack('biolabs', ['stalker', 'crawler', 'spitter', 'crawler'], 133, 139.5);
  k.barrel(114);
  k.barrel(126);
  k.save(hatch, 102);
  k.med(133, 45);
  k.log('log_s3_hatchery', 'biolabs', 'Spire Log 04: Brood Census', 140, 0.4);
  k.pillarRow(hatch, 8);
  k.gate(142, 'console', 'door_s3_hatchery');

  // ===== 5. Power Spine (security) =====
  const spine = k.room('spine', 'security', 'Power Spine', 'Two lever doors, then the Warden hatch. Mind the vents.', 42, 0x2a2038);
  k.fullFloor(spine);
  k.lever('sw-s3-spine-a', 'security', 150, 0, 'door_s3_mid1', 'SPINE LEVER A');
  k.gate(160, 'console', 'door_s3_mid1');
  k.platform('spine-gate', 166, 172, 4.4);
  k.lever('sw-s3-spine-b', 'security', 169, 4.4, 'door_s3_mid2', 'SPINE LEVER B');
  k.gate(176, 'console', 'door_s3_mid2');
  k.pack('security', ['crawler', 'stalker', 'spitter', 'crawler', 'stalker'], 144, 158, [[149, 151]]);
  k.pack('security', ['stalker', 'crawler', 'spitter', 'crawler', 'stalker', 'spitter'], 162, 174.5);
  k.pack('security', ['stalker', 'crawler', 'spitter', 'crawler', 'stalker'], 177.5, 182.5);
  k.vent('security', 154, 0);
  k.vent('security', 168, 120);
  k.vent('security', 180, 60);
  k.save(spine, 144);
  k.med(158.6, 45);
  k.med(182, 50);
  k.log('log_s3_spine', 'security', 'Spire Log 05: Breaker Orders', 169, 4.4);
  k.pillarRow(spine, 8);
  k.gate(184, 'green', 'door_s3_spine');

  // ===== 6. Warden Arena (core) =====
  const arena = k.room('arena', 'core', 'Warden Arena', 'The Core Warden guards the exit teleporter. Bring it down, then press interact at the pad.', 28, 0x3a1a1a);
  k.fullFloor(arena, 0x1c212a);
  k.platform('arena-w', 188, 194, 2.4);
  k.platform('arena-e', 204, 209, 2.4);
  k.enemies.push({ id: 'e-core-warden', kind: 'warden', x: 197, y: 0, z: 0, zone: 'core' });
  k.foe('core', 'crawler', 191);
  k.foe('core', 'stalker', 205, 2.4);
  k.foe('core', 'spitter', 201);
  k.foe('core', 'crawler', 208);
  k.enemies.push({ id: 'e-core-m1', kind: 'crawler', x: 194, y: 0, z: 0, zone: 'core' });
  k.enemies.push({ id: 'e-core-m2', kind: 'crawler', x: 206, y: 0, z: 0, zone: 'core' });
  k.vent('core', 192.5, 30);
  k.vent('core', 202, 150);
  k.barrel(190);
  k.barrel(207);
  k.save(arena, 186.4);
  k.med(188.4, 55);
  k.log('log_s3_arena', 'core', 'Spire Log 06: Warden Protocol', 206.5, 2.4);
  k.pillarRow(arena, 7, 9);
  k.endWall(212);

  return k.finish({
    stage: { id: 3, name: STAGE3_NAME, subtitle: 'Break the Spire. The Warden holds the last teleporter.', goal: 'boss' },
    spawn: { x: 3, y: 0 },
    exit: { x: 208.6, y: 0 },
  });
}

/** Reachability route for stage 3. The Thruster Boots step flips maxJumps to 2 (the Hatchery lever ledge needs 4.4 m). */
export function stage3Route(): StageWaypoint[] {
  return [
    { label: 'Breach crate', x: 8, y: 0 },
    { label: 'Past breach crate', x: 12, y: 0, leap: true },
    { label: 'Breach blue door', x: 27, y: 0 },
    { label: 'Breach -> Stacks', x: 32, y: 0, opens: ['door_s3_breach'] },
    { label: 'Stacks step', x: 37.5, y: 2.2 },
    { label: 'Stacks rack', x: 44.5, y: 4.4 },
    { label: 'Stacks floor', x: 58, y: 0 },
    { label: 'Stacks door', x: 62.5, y: 0, opens: ['door_s3_stacks'] },
    { label: 'Stacks -> Drain', x: 66, y: 0 },
    { label: 'Drain lever', x: 71, y: 0 },
    { label: 'Drain gantry', x: 78, y: 0, opens: ['bridge_s3_drain'], leap: true },
    { label: 'Drain far side', x: 85, y: 0 },
    { label: 'Drain ledge', x: 89.5, y: 2.2 },
    { label: 'Thruster Boots', x: 91, y: 2.2, tolX: 0.9, tolY: 0.4, boots: true },
    { label: 'Rail-Cannon', x: 97, y: 0, tolX: 0.9, tolY: 0.4 },
    { label: 'Drain door', x: 98.5, y: 0 },
    { label: 'Drain -> Hatchery', x: 102, y: 0, opens: ['door_s3_drain'] },
    { label: 'Hatchery step', x: 104, y: 2.2 },
    { label: 'Energy Tank', x: 105.5, y: 2.2, tolX: 0.9, tolY: 0.4 },
    { label: 'Hatchery floor', x: 114, y: 0 },
    { label: 'Hatchery lever ledge', x: 121, y: 4.4 },
    { label: 'Hatchery east', x: 138, y: 0 },
    { label: 'Hatchery door', x: 140.5, y: 0, opens: ['door_s3_hatchery'] },
    { label: 'Hatchery -> Spine', x: 144, y: 0 },
    { label: 'Spine lever A', x: 150, y: 0 },
    { label: 'Spine mid door 1', x: 158.5, y: 0, opens: ['door_s3_mid1'] },
    { label: 'Spine gantry', x: 169, y: 4.4 },
    { label: 'Spine floor', x: 174.5, y: 0 },
    { label: 'Spine mid door 2', x: 174.8, y: 0, opens: ['door_s3_mid2'] },
    { label: 'Spine hatch', x: 182, y: 0 },
    { label: 'Spine -> Arena', x: 186.5, y: 0, opens: ['door_s3_spine'] },
    { label: 'Exit teleporter', x: 208.6, y: 0, tolX: 1.5 },
  ];
}

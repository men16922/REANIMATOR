// Stage 2: Foundry Line. New design (not Abuse data). A 188 m run through six rooms with lever doors,
// two gantry pits, a weapon lock chain and a furnace gauntlet before the exit teleporter.

import { StageKit } from './stageKit.ts';
import type { Level3D } from './types3d.ts';

export interface StageWaypoint {
  label: string;
  x: number;
  y: number;
  tolX?: number;
  tolY?: number;
  leap?: boolean;
  /** Door or bridge ids opened before this step (weapon shots and lever presses are covered by the sim tests) */
  opens?: string[];
  /** Grants Thruster Boots on arrival */
  boots?: boolean;
}

export const STAGE2_NAME = 'Foundry Line';
export const STAGE2_FOREMAN_ID = 'e-s2-foreman';
/** Single source for the mini-boss name: HUD bar, hints and objective all derive from it. */
export const FOREMAN_NAME = 'Slag Foreman';

export function buildStage2Map3D(): Level3D {
  const k = new StageKit('s2');

  // ===== 1. Cargo Dock (airlock) =====
  const dock = k.room('dock', 'airlock', 'Cargo Dock', 'Loading bay. The blue shutter at the east end opens to a Pulse shot.', 28, 0x1a2a3a);
  k.fullFloor(dock);
  k.crate('dock-crate', 10.0, 11.4, 1.4);
  k.platform('dock-ledge', 16, 22, 2.2);
  k.pillarRow(dock, 7);
  k.pack('airlock', ['crawler', 'crawler', 'stalker', 'crawler', 'spitter', 'crawler'], 13.5, 24);
  k.barrel(15.2);
  k.med(6, 35);
  k.save(dock, 26);
  k.log('log_s2_dock', 'airlock', 'Foundry Log 01: Shift Roster', 19, 2.2);
  k.gate(28, 'blue', 'door_s2_dock');

  // ===== 2. Conveyor Hall (shaft) =====
  const hall = k.room('hall', 'shaft', 'Conveyor Hall', 'The east door is dead. A lever sits on the high gantry.', 30, 0x1d2433);
  k.fullFloor(hall);
  k.platform('hall-low', 33, 38, 2.2);
  k.platform('hall-high', 38, 43.5, 4.4);
  k.lever('sw-s2-conveyor', 'shaft', 42, 4.4, 'door_s2_conveyor', 'CONVEYOR LEVER');
  k.pack('shaft', ['stalker', 'crawler', 'spitter', 'crawler', 'crawler', 'stalker', 'spitter', 'crawler'], 33, 55);
  k.barrel(50);
  k.med(47, 40);
  k.save(hall, 30.5);
  k.log('log_s2_hall', 'shaft', 'Foundry Log 02: Belt Fault', 40.5, 4.4);
  k.pillarRow(hall, 8);
  k.gate(58, 'console', 'door_s2_conveyor');

  // ===== 3. Slag Pits (mines) =====
  const slag = k.room('slag', 'mines', 'Slag Pits', 'Acid basin. Throw the lever to lower the gantry.', 32, 0x1f3a22);
  k.pit(slag, 66, 74, 'bridge_s2_slag');
  k.lever('sw-s2-slag', 'mines', 63, 0, 'bridge_s2_slag', 'SLAG GANTRY LEVER');
  k.platform('slag-ledge', 80, 86, 2.2);
  k.weapon('ped-s2-grenade', 3, 83, 2.2);
  k.pack('mines', ['crawler', 'spitter'], 59.5, 64);
  k.pack('mines', ['stalker', 'crawler', 'spitter', 'crawler', 'crawler', 'stalker'], 76.5, 88);
  k.vent('mines', 78.5, 0);
  k.barrel(80.6);
  k.save(slag, 61);
  k.med(88.4, 40);
  k.log('log_s2_slag', 'mines', 'Foundry Log 03: Pour Schedule', 70, 0.4);
  k.pillarRow(slag, 8);
  k.gate(90, 'yellow', 'door_s2_slag');

  // ===== 4. Culture Vats (biolabs) =====
  const vats = k.room('vats', 'biolabs', 'Culture Vats', 'A brood nest guards the lever. Green shutter east.', 34, 0x2b3a1a);
  k.pit(vats, 106, 114, 'bridge_s2_vat');
  k.lever('sw-s2-vat', 'biolabs', 103, 0, 'bridge_s2_vat', 'VAT GANTRY LEVER');
  k.hive('biolabs', 98);
  k.platform('vats-low', 93, 98, 2.2);
  k.platform('vats-high', 98, 103.5, 4.4);
  k.upgrade('etank_s2_vats', 'energy_tank', 101, 4.4);
  k.foe('biolabs', 'spitter', 95.5, 2.2);
  k.pack('biolabs', ['crawler', 'stalker', 'crawler', 'spitter'], 93, 104.5, [[97, 99.5]]);
  k.pack('biolabs', ['stalker', 'crawler', 'spitter', 'crawler', 'crawler', 'stalker'], 115.5, 122);
  k.barrel(119.2);
  k.save(vats, 92);
  k.med(121, 45);
  k.log('log_s2_vats', 'biolabs', 'Foundry Log 04: Vat Seven', 120, 0.4);
  k.pillarRow(vats, 8);
  k.gate(124, 'green', 'door_s2_vat');

  // ===== 5. Control Spine (security) =====
  const spine = k.room('spine', 'security', 'Control Spine', 'Two levers, two doors. The second lever is up on the gantry.', 32, 0x2a2038);
  k.fullFloor(spine);
  k.lever('sw-s2-mid', 'security', 130, 0, 'door_s2_mid', 'SPINE LEVER A');
  k.gate(140, 'console', 'door_s2_mid');
  k.platform('spine-low', 143, 148, 2.2);
  k.platform('spine-high', 148, 153.5, 4.4);
  k.lever('sw-s2-spine', 'security', 151.5, 4.4, 'door_s2_spine', 'SPINE LEVER B');
  k.pack('security', ['crawler', 'stalker', 'spitter', 'crawler'], 125.5, 138.5, [[129, 131]]);
  k.pack('security', ['stalker', 'crawler', 'spitter', 'crawler', 'stalker', 'spitter'], 141.5, 154.5, [[143, 145]]);
  k.vent('security', 134, 0);
  k.vent('security', 146.5, 120);
  k.save(spine, 127);
  k.med(138, 45);
  k.log('log_s2_spine', 'security', 'Foundry Log 05: Interlock Memo', 145.5, 2.2);
  k.pillarRow(spine, 8);
  k.gate(156, 'console', 'door_s2_spine');

  // ===== 6. Furnace Gate (core) =====
  const furnace = k.room('furnace', 'core', 'Furnace Gate', 'Last gauntlet. Slay the Slag Foreman, pull the lever, then press interact at the exit teleporter.', 32, 0x3a1a1a);
  k.fullFloor(furnace, 0x1c212a);
  k.platform('furnace-w', 162, 168, 2.2);
  k.platform('furnace-e', 170, 176, 2.2);
  k.foe('core', 'spitter', 165, 2.2);
  k.foe('core', 'spitter', 173, 2.2);
  k.pack('core', ['crawler', 'stalker', 'crawler', 'spitter', 'crawler', 'crawler', 'spitter', 'crawler'], 160.5, 168);
  // Mini-boss: the Slag Foreman guards the exit teleporter (it stays locked while the Foreman lives)
  k.enemies.push({ id: STAGE2_FOREMAN_ID, kind: 'stalker', variant: 'foreman', x: 175, y: 0, z: 0, zone: 'core' });
  k.lever('sw-s2-furnace', 'core', 177.5, 0, 'door_s2_exit', 'FURNACE LEVER');
  k.gate(181, 'console', 'door_s2_exit');
  k.vent('core', 169, 60);
  k.barrel(166.4);
  k.save(furnace, 158.5);
  k.med(163, 50);
  k.log('log_s2_furnace', 'core', 'Foundry Log 06: Final Pour', 185, 0.4);
  k.pillarRow(furnace, 8, 9);
  k.endWall(188);

  return k.finish({
    stage: { id: 2, name: STAGE2_NAME, subtitle: 'Cut through the dead foundry. Every door has a trigger.', goal: 'exit', guardId: STAGE2_FOREMAN_ID },
    spawn: { x: 3, y: 0 },
    exit: { x: 185, y: 0 },
  });
}

/** Reachability route for stage 2 (walked with the real body physics by tools/game/reach3d.ts). */
export function stage2Route(): StageWaypoint[] {
  return [
    { label: 'Dock crate', x: 9, y: 0 },
    { label: 'Past dock crate', x: 13, y: 0, leap: true },
    { label: 'Dock blue door', x: 25, y: 0 },
    { label: 'Dock -> Hall', x: 30, y: 0, opens: ['door_s2_dock'] },
    { label: 'Hall step', x: 34.5, y: 2.2 },
    { label: 'Hall gantry', x: 41.5, y: 4.4 },
    { label: 'Hall floor', x: 50, y: 0 },
    { label: 'Hall door', x: 56.5, y: 0, opens: ['door_s2_conveyor'] },
    { label: 'Hall -> Slag', x: 60, y: 0 },
    { label: 'Slag lever', x: 63, y: 0 },
    { label: 'Slag gantry', x: 70, y: 0, opens: ['bridge_s2_slag'], leap: true },
    { label: 'Slag far side', x: 77, y: 0 },
    { label: 'Slag ledge', x: 81.5, y: 2.2 },
    { label: 'Grenade', x: 83, y: 2.2, tolX: 0.9, tolY: 0.4 },
    { label: 'Slag door', x: 88, y: 0, leap: true },
    { label: 'Slag -> Vats', x: 92, y: 0, opens: ['door_s2_slag'] },
    { label: 'Vats step', x: 94.5, y: 2.2 },
    { label: 'Vats gantry', x: 100.5, y: 4.4 },
    { label: 'Energy Tank', x: 101, y: 4.4, tolX: 0.9, tolY: 0.4 },
    { label: 'Vats lever', x: 103, y: 0, leap: true },
    { label: 'Vats gantry bridge', x: 110, y: 0, opens: ['bridge_s2_vat'], leap: true },
    { label: 'Vats far side', x: 117, y: 0 },
    { label: 'Vats door', x: 122, y: 0 },
    { label: 'Vats -> Spine', x: 126, y: 0, opens: ['door_s2_vat'] },
    { label: 'Spine lever A', x: 130, y: 0 },
    { label: 'Spine mid door', x: 138, y: 0, opens: ['door_s2_mid'] },
    { label: 'Spine step', x: 144, y: 2.2 },
    { label: 'Spine gantry', x: 151, y: 4.4 },
    { label: 'Spine floor', x: 154, y: 0 },
    { label: 'Spine -> Furnace', x: 158, y: 0, opens: ['door_s2_spine'] },
    { label: 'Furnace lever', x: 177.5, y: 0 },
    { label: 'Furnace -> Exit', x: 183, y: 0, opens: ['door_s2_exit'] },
    { label: 'Exit teleporter', x: 185, y: 0, tolX: 1.5 },
  ];
}

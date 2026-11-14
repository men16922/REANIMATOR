// Full 3D 4-zone facility layout for REANIMATOR (Zone A Cryo Bay -> Zone B Bio-Processing ->
// Zone C Reactor Core Boss Arena -> Zone D Extraction Gauntlet).
// Designed for Quarter-View visibility (low south cutaway barriers) with true multi-elevation catwalks,
// walkable ramps, acid cooling pits, blast pillars, security bulkhead doors, weapon pedestals, and bio-barrels.

import type { BoxSolid3D, Collider3D, Pillar3D, Ramp3D } from '../engine/motion3d.ts';

export type { Ramp3D };
export type WeaponSlot3D = 1 | 2 | 3 | 4;

export interface MapSolid3D extends BoxSolid3D {
  /** Render top height when south cutaway wall should stay low visually while keeping full collision height. */
  visualMaxY?: number;
  color?: number;
  emissive?: number;
}

export interface AcidPool3D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  surfaceY: number;
}

export interface BarrelSpawn3D {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface WeaponPedestal3D {
  id: string;
  weapon: WeaponSlot3D;
  x: number;
  y: number;
  z: number;
}

export interface MedStation3D {
  id: string;
  x: number;
  y: number;
  z: number;
  heal: number;
}

export interface EnemySpawn3D {
  id: string;
  kind: 'stalker' | 'crawler' | 'spitter' | 'warden';
  x: number;
  y: number;
  z: number;
  zone: 'A' | 'B' | 'C' | 'D';
}

export interface Level3D {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; y: number; z: number };
  consolePos: { x: number; y: number; z: number; radius: number };
  corePos: { x: number; y: number; z: number; radius: number };
  exitPos: { x: number; y: number; z: number; radius: number };
  solids: MapSolid3D[];
  pillars: Pillar3D[];
  ramps: Ramp3D[];
  acidPools: AcidPool3D[];
  barrels: BarrelSpawn3D[];
  pedestals: WeaponPedestal3D[];
  medStations: MedStation3D[];
  enemies: EnemySpawn3D[];
}

function box(
  id: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  kind: MapSolid3D['kind'] = 'wall',
  extra: Partial<MapSolid3D> = {},
): MapSolid3D {
  return { id, minX, maxX, minY, maxY, minZ, maxZ, kind, ...extra };
}

export function buildFacilityMap3D(): Level3D {
  const solids: MapSolid3D[] = [
    // --- FLOOR DECKS ---
    // Zone A floor (0..23, -8..8)
    box('floor-a', -0.5, 23.2, -1.2, 0, -8.5, 8.5, 'catwalk', { color: 0x1e252e }),
    // Zone B floor split around sunken acid cooling vat (31..40, z -1.8..2.4)
    box('floor-b-n', 23.2, 51.0, -1.2, 0, -9.5, -1.8, 'catwalk', { color: 0x1d252d }),
    box('floor-b-s', 23.2, 51.0, -1.2, 0, 2.4, 9.5, 'catwalk', { color: 0x1d252d }),
    box('floor-b-w', 23.2, 31.0, -1.2, 0, -1.8, 2.4, 'catwalk', { color: 0x1d252d }),
    box('floor-b-e', 40.0, 51.0, -1.2, 0, -1.8, 2.4, 'catwalk', { color: 0x1d252d }),
    box('floor-b-vat', 30.8, 40.2, -1.5, -0.35, -2.0, 2.6, 'catwalk', { color: 0x12261a }),
    // Zone C boss arena floor (51..78, -10..10)
    box('floor-c', 51.0, 78.0, -1.2, 0, -10.5, 10.5, 'catwalk', { color: 0x1c212a }),
    // Zone D extraction corridor floor (78..98, -8..8)
    box('floor-d', 78.0, 99.0, -1.2, 0, -8.5, 8.5, 'catwalk', { color: 0x1c232c }),

    // --- PERIMETER WALLS (North high walls, South low cutaway barriers with full collision height) ---
    box('wall-west', -1.2, 0.0, 0, 5.4, -8.5, 8.5, 'wall'),
    box('wall-east', 98.0, 99.4, 0, 5.4, -8.5, 8.5, 'wall'),

    box('wall-a-n', 0, 23.2, 0, 5.4, -9.2, -8.0, 'wall'),
    box('wall-a-s', 0, 23.2, 0, 4.6, 8.0, 9.2, 'wall', { visualMaxY: 0.78 }),

    box('wall-b-n', 23.2, 51.0, 0, 5.4, -10.2, -9.0, 'wall'),
    box('wall-b-s', 23.2, 51.0, 0, 4.6, 9.0, 10.2, 'wall', { visualMaxY: 0.78 }),

    box('wall-c-n', 51.0, 78.0, 0, 5.8, -11.2, -10.0, 'wall'),
    box('wall-c-s', 51.0, 78.0, 0, 4.6, 10.0, 11.2, 'wall', { visualMaxY: 0.78 }),

    box('wall-d-n', 78.0, 98.0, 0, 5.4, -9.2, -8.0, 'wall'),
    box('wall-d-s', 78.0, 98.0, 0, 4.6, 8.0, 9.2, 'wall', { visualMaxY: 0.78 }),

    // --- ZONE DIVIDERS & SECURITY BULKHEAD DOORS ---
    // Zone A -> B open bulkhead arch at x=23.2 (open gateway z -2.9..+2.9)
    box('div-ab-n', 22.8, 23.6, 0, 5.4, -9.2, -2.9, 'wall'),
    box('div-ab-s', 22.8, 23.6, 0, 4.6, 2.9, 9.2, 'wall', { visualMaxY: 1.4 }),

    // Zone B -> C partition at x=51.0 (gateway z -3.1..+3.1 guarded by gate_c)
    box('div-bc-n', 50.6, 51.5, 0, 5.6, -10.2, -3.1, 'wall'),
    box('div-bc-s', 50.6, 51.5, 0, 4.6, 3.1, 10.2, 'wall', { visualMaxY: 1.5 }),
    box('door-gate-c', 50.7, 51.4, 0, 4.4, -3.1, 3.1, 'door', {
      doorId: 'gate_c',
      color: 0x3b2220,
      emissive: 0xff5a2a,
    }),

    // Zone C -> D partition at x=78.0 (gateway z -3.0..+3.0 guarded by gate_d)
    box('div-cd-n', 77.6, 78.5, 0, 5.6, -10.2, -3.0, 'wall'),
    box('div-cd-s', 77.6, 78.5, 0, 4.6, 3.0, 10.2, 'wall', { visualMaxY: 1.5 }),
    box('door-gate-d', 77.7, 78.4, 0, 4.4, -3.0, 3.0, 'door', {
      doorId: 'gate_d',
      color: 0x3b2220,
      emissive: 0xff2a3c,
    }),

    // --- MULTI-ELEVATION CATWALKS ---
    // Zone A upper catwalk (y=2.2) housing Scattergun pedestal
    box('catwalk-a', 15.2, 22.2, 1.9, 2.2, -7.8, -4.6, 'catwalk', { color: 0x2a3542 }),
    // Zone B upper catwalk (y=2.2) housing Security Console
    box('catwalk-b', 29.8, 44.2, 1.9, 2.2, -8.5, -5.1, 'catwalk', { color: 0x2a3542 }),

    // --- TACTICAL COVER CRATES ---
    box('crate-a1', 7.2, 8.8, 0, 1.35, -3.4, -1.8, 'crate', { color: 0x3a434e }),
    box('crate-a2', 11.4, 13.0, 0, 1.35, 2.2, 3.8, 'crate', { color: 0x3a434e }),
    box('crate-b1', 26.5, 28.1, 0, 1.4, 3.6, 5.2, 'crate', { color: 0x3a434e }),
    box('crate-b2', 44.8, 46.5, 0, 1.4, 2.6, 4.3, 'crate', { color: 0x3a434e }),
    box('crate-c1', 54.0, 55.6, 0, 1.3, 4.8, 6.4, 'crate', { color: 0x3a434e }),
    box('crate-d1', 82.0, 83.6, 0, 1.4, -5.0, -3.4, 'crate', { color: 0x3a434e }),
    box('crate-d2', 87.2, 88.8, 0, 1.4, 3.4, 5.0, 'crate', { color: 0x3a434e }),

    // Console physical pedestal collision box on Catwalk B (y=2.2..3.5)
    box('console-b', 38.8, 40.0, 2.2, 3.45, -7.4, -6.2, 'console', {
      color: 0x1f3644,
      emissive: 0x2bf0ff,
    }),
  ];

  const ramps: Ramp3D[] = [
    // Zone A Ramp Up (x 10.2 -> 15.2 reaches y=2.2 onto catwalk-a)
    { id: 'ramp-a-up', minX: 10.2, maxX: 15.2, minZ: -7.8, maxZ: -4.6, axis: 'x', yMinEdge: 0, yMaxEdge: 2.2, thickness: 0.25 },
    // Zone A Ramp Down along -Z side back to Zone A deck (allows smooth return or step-off)
    { id: 'ramp-a-down', minX: 18.8, maxX: 22.2, minZ: -4.6, maxZ: -1.0, axis: 'z', yMinEdge: 2.2, yMaxEdge: 0, thickness: 0.25 },
    // Zone B Ramp Up (x 25.0 -> 29.8 reaches y=2.2 onto catwalk-b)
    { id: 'ramp-b-up', minX: 25.0, maxX: 29.8, minZ: -8.5, maxZ: -5.1, axis: 'x', yMinEdge: 0, yMaxEdge: 2.2, thickness: 0.25 },
    // Zone B Ramp Down (x 44.2 -> 49.0 descends y=2.2 -> 0 near Gate C!)
    { id: 'ramp-b-down', minX: 44.2, maxX: 49.0, minZ: -8.5, maxZ: -5.1, axis: 'x', yMinEdge: 2.2, yMaxEdge: 0, thickness: 0.25 },
  ];

  const pillars: Pillar3D[] = [
    // Zone A Structural Pillars
    { id: 'pil-a1', x: 18.0, z: 4.8, radius: 0.78, minY: 0, maxY: 4.8 },
    // Zone B Atrium Pillars
    { id: 'pil-b1', x: 32.0, z: -3.2, radius: 0.78, minY: 0, maxY: 4.8 },
    { id: 'pil-b2', x: 41.5, z: 4.4, radius: 0.78, minY: 0, maxY: 4.8 },
    // Zone C Reactor Arena 4 Heavy Blast Pillars (critical Rail/Grenade cover!)
    { id: 'pil-c1', x: 58.5, z: -4.8, radius: 1.05, minY: 0, maxY: 5.5 },
    { id: 'pil-c2', x: 58.5, z: 4.8, radius: 1.05, minY: 0, maxY: 5.5 },
    { id: 'pil-c3', x: 69.5, z: -4.8, radius: 1.05, minY: 0, maxY: 5.5 },
    { id: 'pil-c4', x: 69.5, z: 4.8, radius: 1.05, minY: 0, maxY: 5.5 },
  ];

  const acidPools: AcidPool3D[] = [
    { id: 'acid-b1', minX: 31.0, maxX: 40.0, minZ: -1.8, maxZ: 2.4, surfaceY: -0.18 },
  ];

  const barrels: BarrelSpawn3D[] = [
    // Zone A
    { id: 'brl-a1', x: 15.6, y: 0, z: 0.8 },
    // Zone B (overlooking acid bridge & atrium packs)
    { id: 'brl-b1', x: 28.8, y: 0, z: -0.4 },
    { id: 'brl-b2', x: 35.5, y: 0, z: 4.8 },
    { id: 'brl-b3', x: 43.2, y: 0, z: -1.2 },
    // Zone C Boss Arena
    { id: 'brl-c1', x: 61.5, y: 0, z: -3.2 },
    { id: 'brl-c2', x: 61.5, y: 0, z: 3.2 },
    { id: 'brl-c3', x: 68.5, y: 0, z: 0.0 },
    // Zone D Domino Chain Barrel Line
    { id: 'brl-d1', x: 83.2, y: 0, z: 0.0 },
    { id: 'brl-d2', x: 85.4, y: 0, z: -1.1 },
    { id: 'brl-d3', x: 87.6, y: 0, z: 1.0 },
    { id: 'brl-d4', x: 90.0, y: 0, z: -0.2 },
  ];

  const pedestals: WeaponPedestal3D[] = [
    { id: 'ped-scatter', weapon: 2, x: 19.2, y: 2.2, z: -6.2 },
    { id: 'ped-grenade', weapon: 3, x: 33.0, y: 0.0, z: 6.2 },
    { id: 'ped-rail', weapon: 4, x: 54.6, y: 0.0, z: -7.2 },
  ];

  const medStations: MedStation3D[] = [
    { id: 'med-a', x: 21.0, y: 0, z: 5.5, heal: 35 },
    { id: 'med-b', x: 47.6, y: 0, z: 6.4, heal: 45 },
    { id: 'med-c', x: 64.0, y: 0, z: 7.8, heal: 55 },
  ];

  const enemies: EnemySpawn3D[] = [
    // Zone A patrols
    { id: 'e-a1', kind: 'crawler', x: 12.2, y: 0, z: -0.4, zone: 'A' },
    { id: 'e-a2', kind: 'stalker', x: 16.8, y: 0, z: 1.6, zone: 'A' },
    { id: 'e-a3', kind: 'crawler', x: 18.4, y: 2.2, z: -6.0, zone: 'A' },
    { id: 'e-a4', kind: 'spitter', x: 20.6, y: 0, z: -2.0, zone: 'A' },

    // Zone B Bio-Processing swarm
    { id: 'e-b1', kind: 'stalker', x: 28.5, y: 0, z: 0.2, zone: 'B' },
    { id: 'e-b2', kind: 'crawler', x: 32.0, y: 0, z: 4.5, zone: 'B' },
    { id: 'e-b3', kind: 'spitter', x: 36.2, y: 2.2, z: -6.6, zone: 'B' },
    { id: 'e-b4', kind: 'stalker', x: 42.8, y: 0, z: -0.6, zone: 'B' },
    { id: 'e-b5', kind: 'spitter', x: 47.2, y: 0, z: 3.5, zone: 'B' },

    // Zone C Boss Arena
    { id: 'e-c1', kind: 'warden', x: 66.2, y: 0, z: 0.0, zone: 'C' },
    { id: 'e-c2', kind: 'stalker', x: 62.5, y: 0, z: -4.4, zone: 'C' },
    { id: 'e-c3', kind: 'crawler', x: 62.5, y: 0, z: 4.4, zone: 'C' },

    // Zone D Extraction Gauntlet
    { id: 'e-d1', kind: 'stalker', x: 84.5, y: 0, z: 0.8, zone: 'D' },
    { id: 'e-d2', kind: 'crawler', x: 86.2, y: 0, z: -1.8, zone: 'D' },
    { id: 'e-d3', kind: 'stalker', x: 89.2, y: 0, z: 1.6, zone: 'D' },
    { id: 'e-d4', kind: 'spitter', x: 92.2, y: 0, z: -4.0, zone: 'D' },
  ];

  return {
    bounds: { minX: 0, maxX: 98, minZ: -10, maxZ: 10 },
    spawn: { x: 3.2, y: 0, z: 0.0 },
    consolePos: { x: 39.4, y: 2.2, z: -5.4, radius: 2.1 },
    corePos: { x: 74.0, y: 0, z: 0.0, radius: 1.85 },
    exitPos: { x: 95.0, y: 0, z: 0.0, radius: 2.5 },
    solids,
    pillars,
    ramps,
    acidPools,
    barrels,
    pedestals,
    medStations,
    enemies,
  };
}

export function buildCollider3D(level: Level3D, openDoors: ReadonlySet<string>): Collider3D {
  return {
    solids: level.solids,
    pillars: level.pillars,
    ramps: level.ramps,
    isSolidActive: (s) => !s.doorId || !openDoors.has(s.doorId),
  };
}

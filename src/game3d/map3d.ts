// Full 3D side-view Metroidvania facility for REANIMATOR.
// Gameplay lane is the XY plane at Z=0. All solids span Z -3.2..3.2; decorative pillars sit at
// z=-2.4 (background) so the Z=0 lane stays unobstructed.
//
// Rooms (6): airlock -> shaft (hub) -> mines | biolabs <-> security ; biolabs -> core (boss).
// Jump budget: single jump ~2.55 m, Thruster Double-Jump ~5.0 m. One-way platforms (kind 'platform',
// thickness 0.28) are passable from below and can be dropped through with S/Down.
//
// Progression gates (heights measured against the nearest reachable footing):
//   shaft y=4.4 -> y=8.8 : 4.4 m, needs Double-Jump (thruster_boots, from room_mines).
//   biolabs grate y=4.4 -> security y=8.8 : 4.4 m, needs Double-Jump (or the 4.5 platform + long jump).

import type {
  AcidPool3D,
  BarrelSpawn3D,
  Collider3D,
  EnemySpawn3D,
  Level3D,
  MapSolid3D,
  MedStation3D,
  Pillar3D,
  RoomDef3D,
  SaveStation3D,
  UpgradePedestal3D,
  WeaponPedestal3D,
} from './types3d.ts';

export type {
  AcidPool3D,
  BarrelSpawn3D,
  BoxKind3D,
  Collider3D,
  DoorLockKind3D,
  EnemySpawn3D,
  Level3D,
  MapSolid3D,
  MedStation3D,
  Pillar3D,
  Ramp3D,
  RoomDef3D,
  SaveStation3D,
  SectorId3D,
  UpgradePedestal3D,
  UpgradePickupKind3D,
  WeaponPedestal3D,
  WeaponSlot3D,
} from './types3d.ts';

const MIN_Z = -3.2;
const MAX_Z = 3.2;
const PLATFORM_THICKNESS = 0.28;

function box(
  id: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  kind: MapSolid3D['kind'] = 'wall',
  extra: Partial<MapSolid3D> = {},
): MapSolid3D {
  return { id, minX, maxX, minY, maxY, minZ: MIN_Z, maxZ: MAX_Z, kind, ...extra };
}

/** One-way platform whose walkable top surface is `y`. */
function platform(id: string, minX: number, maxX: number, y: number, extra: Partial<MapSolid3D> = {}): MapSolid3D {
  return box(id, minX, maxX, y - PLATFORM_THICKNESS, y, 'platform', extra);
}

function door(
  id: string,
  doorId: string,
  doorLock: NonNullable<MapSolid3D['doorLock']>,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  emissive: number,
): MapSolid3D {
  return box(id, minX, maxX, minY, maxY, 'door', { doorId, doorLock, color: 0x2c2f3a, emissive });
}

function pillar(id: string, x: number, minY: number, maxY: number, radius = 0.5): Pillar3D {
  return { id, x, z: -2.4, radius, minY, maxY };
}

export function buildFacilityMap3D(): Level3D {
  const rooms: RoomDef3D[] = [
    {
      id: 'room_airlock', sector: 'airlock', name: 'Airlock Bay',
      hint: 'Cryo airlock. The extraction balcony above is sealed until the reactor goes critical.',
      minX: 0, maxX: 24, minY: 0, maxY: 9,
      gridX: 0, gridY: 1, gridW: 3, gridH: 1, ambientColor: 0x1a2a3a,
      hasExit: true, neighbors: ['room_shaft'],
    },
    {
      id: 'room_shaft', sector: 'shaft', name: 'Central Shaft',
      hint: 'Vertical hub. The upper deck is out of reach of a single jump.',
      minX: 24, maxX: 42, minY: -12, maxY: 14,
      gridX: 3, gridY: 0, gridW: 2, gridH: 4, ambientColor: 0x1d2433,
      neighbors: ['room_airlock', 'room_mines', 'room_biolabs', 'room_security'],
    },
    {
      id: 'room_mines', sector: 'mines', name: 'Acid Mines',
      hint: 'Acid pit with a stepping stone. The vault ledge holds the Thruster Boots.',
      minX: 0, maxX: 24, minY: -12, maxY: -4,
      gridX: 0, gridY: 3, gridW: 3, gridH: 1, ambientColor: 0x1f3a22,
      hasSave: true, neighbors: ['room_shaft'],
    },
    {
      id: 'room_biolabs', sector: 'biolabs', name: 'Bio-Labs',
      hint: 'Acid basin, tiered grates and the Rail-Cannon. A grate leads up to Security.',
      minX: 42, maxX: 70, minY: -1, maxY: 8,
      gridX: 5, gridY: 1, gridW: 3, gridH: 2, ambientColor: 0x2b3a1a,
      neighbors: ['room_shaft', 'room_security', 'room_core'],
    },
    {
      id: 'room_security', sector: 'security', name: 'Security Deck',
      hint: 'Console that arms the reactor sequence.',
      minX: 42, maxX: 70, minY: 8.4, maxY: 14,
      gridX: 5, gridY: 0, gridW: 3, gridH: 1, ambientColor: 0x2a2038,
      hasSave: true, neighbors: ['room_shaft', 'room_biolabs'],
    },
    {
      id: 'room_core', sector: 'core', name: 'Reactor Core',
      hint: 'Core Warden arena. The reactor sits at the east end.',
      minX: 70, maxX: 98, minY: -1, maxY: 10,
      gridX: 8, gridY: 1, gridW: 3, gridH: 2, ambientColor: 0x3a1a1a,
      hasBoss: true, neighbors: ['room_biolabs'],
    },
  ];

  const solids: MapSolid3D[] = [
    // ===== 1. room_airlock =====
    box('airlock-floor', -0.5, 24, -1.2, 0, 'catwalk', { color: 0x4a5866 }),
    box('airlock-ceiling', 0, 24, 9.0, 10.2),
    box('airlock-wall-west', -1.5, 0, 0, 10),
    box('airlock-balcony', 1.5, 13.5, 4.8, 5.2, 'catwalk', { color: 0x2a3542 }),
    box('airlock-bridge', 13.5, 24.4, 4.8, 5.2, 'catwalk', { color: 0x2a3542 }),
    // East partition: lower doorway y0..3.6, upper doorway y5.2..8.6
    door('door-airlock-shaft', 'door_airlock_shaft', 'blue', 23.6, 24.4, 0, 3.6, 0x3a8cff),
    box('airlock-divider-mid', 23.6, 24.4, 3.6, 4.8),
    door('door-escape', 'door_escape', 'escape', 23.6, 24.4, 5.2, 8.6, 0xff3a2a),
    box('airlock-divider-top', 23.6, 24.4, 8.6, 10.2),
    box('airlock-crate', 9.0, 10.6, 0, 1.4, 'crate', { color: 0x3a434e }),

    // ===== 2. room_shaft =====
    box('shaft-floor', 24, 42, -12.2, -11.0, 'catwalk', { color: 0x1d252d }),
    box('shaft-ceiling', 24, 42, 13.8, 14.8),
    box('shaft-wall-west-low', 23.6, 24.4, -7.4, 0),
    box('shaft-wall-west-bottom', 23.6, 24.4, -12, -11),
    door('door-shaft-mines', 'door_shaft_mines', 'green', 23.6, 24.4, -11, -7.4, 0x3aff6a),
    box('shaft-wall-west-up', 23.6, 24.4, 8.8, 14),
    box('shaft-wall-east-low', 41.6, 42.4, -12, 0),
    door('door-shaft-biolabs', 'door_shaft_biolabs', 'yellow', 41.6, 42.4, 0, 3.6, 0xffd23a),
    box('shaft-wall-east-mid', 41.6, 42.4, 3.6, 8.8),
    box('shaft-wall-east-top', 41.6, 42.4, 12.4, 13.8),
    // y=0 landing: solid side ledges and a one-way centre grate
    box('shaft-ledge-west-0', 24, 29, -0.5, 0, 'catwalk'),
    box('shaft-ledge-east-0', 37, 42, -0.5, 0, 'catwalk'),
    platform('shaft-grate-0', 29, 37, 0),
    // Descent platforms (one-way)
    platform('shaft-down-1', 29, 37, -2.2),
    platform('shaft-down-2', 26, 34, -4.4),
    platform('shaft-down-3', 31, 39, -6.6),
    platform('shaft-down-4', 27, 35, -8.8),
    // Ascent platforms (one-way), kept on the east side
    platform('shaft-up-1', 34, 40, 2.2),
    platform('shaft-up-2', 35, 41, 4.4),
    // Upper deck at y=8.8: 4.4 m above shaft-up-2 -> Double-Jump gate
    platform('shaft-upper-grate', 28, 37, 8.8),
    box('shaft-upper-floor-east', 37, 42, 8.4, 8.8, 'catwalk'),
    // Escape step-down ledge, flush with the airlock bridge (y=5.2)
    platform('shaft-escape-ledge', 24.4, 28, 5.2),

    // ===== 3. room_mines =====
    box('mines-wall-west', -1.5, 0, -12.2, -3.5),
    box('mines-ceiling', 0, 24, -4.0, -3.2),
    box('mines-floor-west', 0, 9.2, -12.2, -11.0, 'catwalk', { color: 0x1d252d }),
    box('mines-floor-pit', 9.0, 16.7, -12.6, -11.4, 'catwalk', { color: 0x12261a }),
    box('mines-floor-east', 16.5, 24, -12.2, -11.0, 'catwalk', { color: 0x1d252d }),
    platform('mines-stone', 11.3, 14.3, -9.6),
    box('mines-vault', 1.0, 10.5, -9.0, -8.6, 'catwalk', { color: 0x2a3542 }),

    // ===== 4. room_biolabs =====
    box('bio-floor-west', 42, 51, -1.2, 0, 'catwalk', { color: 0x1d252d }),
    box('bio-floor-basin', 50.8, 58.2, -1.5, -0.45, 'catwalk', { color: 0x12261a }),
    box('bio-floor-east', 58, 70, -1.2, 0, 'catwalk', { color: 0x1d252d }),
    platform('bio-plat-1', 46, 54, 2.2),
    platform('bio-plat-2', 60, 69, 2.2),
    platform('bio-plat-3', 52, 58, 4.5),
    platform('bio-grate-up', 62, 68, 4.4),
    box('bio-wall-east-up', 69.6, 70.4, 4.0, 8.8),
    door('door-boss', 'door_boss', 'red', 69.6, 70.4, 0, 4.0, 0xff2a3c),

    // ===== 5. room_security (its floor doubles as the biolabs ceiling) =====
    box('sec-floor-west', 42, 62, 8.4, 8.8, 'catwalk', { color: 0x1d252d }),
    platform('sec-grate', 62, 68, 8.8),
    box('sec-floor-east', 68, 70.4, 8.4, 8.8, 'catwalk', { color: 0x1d252d }),
    box('sec-ceiling', 42, 70.8, 13.8, 14.8),
    box('sec-wall-east', 69.6, 70.8, 8.4, 14.8),
    box('sec-console', 54.0, 55.0, 8.8, 10.1, 'console', {
      minZ: -0.6, maxZ: 0.6, color: 0x1f3644, emissive: 0x2bf0ff,
    }),

    // ===== 6. room_core =====
    box('core-floor', 70, 98, -1.2, 0, 'catwalk', { color: 0x1c212a }),
    box('core-ceiling', 70, 98, 9.6, 10.8),
    box('core-wall-east', 98, 99.5, -1.2, 10.8),
    platform('core-plat-1', 73, 79, 2.4),
    platform('core-plat-2', 85, 90, 2.4),
  ];

  // Background pillars at z=-2.4 (never block the Z=0 lane)
  const pillars: Pillar3D[] = [
    pillar('pil-airlock-1', 6, 0, 9),
    pillar('pil-airlock-2', 12, 0, 9),
    pillar('pil-airlock-3', 18, 0, 9),
    pillar('pil-shaft-1', 25.5, -11, 13.8),
    pillar('pil-shaft-2', 40.5, -11, 13.8),
    pillar('pil-mines-1', 5, -11, -4),
    pillar('pil-mines-2', 20, -11, -4),
    pillar('pil-bio-1', 45, 0, 8.4),
    pillar('pil-bio-2', 60, 0, 8.4),
    pillar('pil-sec-1', 48, 8.8, 13.8),
    pillar('pil-sec-2', 64, 8.8, 13.8),
    pillar('pil-core-1', 76, 0, 9.6, 0.7),
    pillar('pil-core-2', 82, 0, 9.6, 0.7),
    pillar('pil-core-3', 90, 0, 9.6, 0.7),
  ];

  const acidPools: AcidPool3D[] = [
    { id: 'acid-mines', minX: 9.2, maxX: 16.5, minZ: MIN_Z, maxZ: MAX_Z, surfaceY: -11.12, bottomY: -11.4 },
    { id: 'acid-biolabs', minX: 51, maxX: 58, minZ: MIN_Z, maxZ: MAX_Z, surfaceY: -0.15, bottomY: -0.45 },
  ];

  const saveStations: SaveStation3D[] = [
    { id: 'save_mines', roomId: 'room_mines', x: 20.0, y: -11.0, z: 0, radius: 1.6 },
    { id: 'save_security', roomId: 'room_security', x: 45.5, y: 8.8, z: 0, radius: 1.6 },
  ];

  const upgrades: UpgradePedestal3D[] = [
    { id: 'thruster_boots', kind: 'thruster_boots', x: 3.0, y: -8.6, z: 0 },
    { id: 'etank_mines', kind: 'energy_tank', x: 5.5, y: -8.6, z: 0 },
    { id: 'etank_biolabs', kind: 'energy_tank', x: 55.0, y: 4.5, z: 0 },
  ];

  const pedestals: WeaponPedestal3D[] = [
    { id: 'ped-scatter', weapon: 2, x: 38.5, y: -11.0, z: 0 },
    { id: 'ped-grenade', weapon: 3, x: 8.5, y: -8.6, z: 0 },
    { id: 'ped-rail', weapon: 4, x: 65.5, y: 2.2, z: 0 },
  ];

  const barrels: BarrelSpawn3D[] = [
    { id: 'brl-airlock-1', x: 15.0, y: 0, z: 0 },
    { id: 'brl-shaft-1', x: 32.0, y: -11.0, z: 0 },
    { id: 'brl-mines-1', x: 19.0, y: -11.0, z: 0 },
    { id: 'brl-mines-2', x: 6.5, y: -11.0, z: 0 },
    { id: 'brl-bio-1', x: 47.0, y: 0, z: 0 },
    { id: 'brl-bio-2', x: 63.0, y: 0, z: 0 },
    { id: 'brl-sec-1', x: 60.0, y: 8.8, z: 0 },
    { id: 'brl-core-1', x: 76.0, y: 0, z: 0 },
    { id: 'brl-core-2', x: 88.0, y: 0, z: 0 },
  ];

  const medStations: MedStation3D[] = [
    { id: 'med-airlock', x: 10.0, y: 0, z: 0, heal: 35 },
    { id: 'med-shaft', x: 40.0, y: -11.0, z: 0, heal: 40 },
    { id: 'med-security', x: 65.0, y: 8.8, z: 0, heal: 45 },
    { id: 'med-core', x: 72.0, y: 0, z: 0, heal: 55 },
  ];

  const enemies: EnemySpawn3D[] = [
    { id: 'e-airlock-1', kind: 'crawler', x: 12.0, y: 0, z: 0, zone: 'airlock' },
    { id: 'e-airlock-2', kind: 'crawler', x: 18.0, y: 0, z: 0, zone: 'airlock' },
    { id: 'e-shaft-1', kind: 'spitter', x: 30.0, y: -2.2, z: 0, zone: 'shaft' },
    { id: 'e-shaft-2', kind: 'stalker', x: 33.0, y: -11.0, z: 0, zone: 'shaft' },
    { id: 'e-shaft-3', kind: 'crawler', x: 38.0, y: 0, z: 0, zone: 'shaft' },
    { id: 'e-mines-1', kind: 'crawler', x: 4.0, y: -11.0, z: 0, zone: 'mines' },
    { id: 'e-mines-2', kind: 'spitter', x: 7.0, y: -8.6, z: 0, zone: 'mines' },
    { id: 'e-mines-3', kind: 'stalker', x: 21.0, y: -11.0, z: 0, zone: 'mines' },
    { id: 'e-bio-1', kind: 'crawler', x: 45.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-bio-2', kind: 'spitter', x: 48.0, y: 2.2, z: 0, zone: 'biolabs' },
    { id: 'e-bio-3', kind: 'stalker', x: 62.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-bio-4', kind: 'spitter', x: 66.0, y: 2.2, z: 0, zone: 'biolabs' },
    { id: 'e-sec-1', kind: 'stalker', x: 50.0, y: 8.8, z: 0, zone: 'security' },
    { id: 'e-sec-2', kind: 'spitter', x: 60.0, y: 8.8, z: 0, zone: 'security' },
    { id: 'e-core-warden', kind: 'warden', x: 83.0, y: 0, z: 0, zone: 'core' },
    { id: 'e-core-1', kind: 'crawler', x: 77.0, y: 0, z: 0, zone: 'core' },
    { id: 'e-core-2', kind: 'stalker', x: 90.0, y: 2.4, z: 0, zone: 'core' },
  ];

  return {
    bounds: { minX: -1.5, maxX: 99.5, minY: -12.6, maxY: 14.8, minZ: MIN_Z, maxZ: MAX_Z },
    spawn: { x: 3.5, y: 0, z: 0 },
    consolePos: { x: 54.5, y: 8.8, z: 0, radius: 2.2 },
    corePos: { x: 93.5, y: 0, z: 0, radius: 1.85 },
    exitPos: { x: 5.5, y: 5.2, z: 0, radius: 2.2 },
    rooms,
    saveStations,
    upgrades,
    solids,
    pillars,
    ramps: [],
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

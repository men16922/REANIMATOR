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
  CachePickup3D,
  Collider3D,
  DataLog3D,
  CollapseSpawn3D,
  CrawlTunnel3D,
  ElevatorSpawn3D,
  EnemySpawn3D,
  HazardSpawn3D,
  HiveSpawn3D,
  Level3D,
  MapSolid3D,
  MapStation3D,
  MedStation3D,
  Pillar3D,
  RoomDef3D,
  SaveStation3D,
  SwitchSpawn3D,
  UpgradePedestal3D,
  WeaponPedestal3D,
} from './types3d.ts';

export type {
  AcidPool3D,
  BarrelSpawn3D,
  BoxKind3D,
  Collider3D,
  DoorLockKind3D,
  DataLog3D,
  EnemySpawn3D,
  EnemySurface3D,
  EnemyVariant3D,
  HazardKind3D,
  HazardSpawn3D,
  CollapseSpawn3D,
  CrawlTunnel3D,
  ElevatorSpawn3D,
  SwitchSpawn3D,
  HiveSpawn3D,
  Level3D,
  MapSolid3D,
  MapStation3D,
  MedStation3D,
  Pillar3D,
  Ramp3D,
  RoomDef3D,
  SaveStation3D,
  SecretRoom3D,
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
      minX: -9, maxX: 24, minY: -3.4, maxY: 14.2,
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
      minX: -7, maxX: 24, minY: -12, maxY: -4,
      gridX: 0, gridY: 3, gridW: 3, gridH: 1, ambientColor: 0x1f3a22,
      hasSave: true, neighbors: ['room_shaft'],
    },
    {
      id: 'room_biolabs', sector: 'biolabs', name: 'Bio-Labs',
      hint: 'Acid basin, tiered grates and the Rail-Cannon. A grate leads up to Security.',
      minX: 42, maxX: 70, minY: -4.8, maxY: 8,
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
      minX: 70, maxX: 98, minY: -3.8, maxY: 10,
      gridX: 8, gridY: 1, gridW: 3, gridH: 2, ambientColor: 0x3a1a1a,
      hasBoss: true, neighbors: ['room_biolabs'],
    },
  ];

  const solids: MapSolid3D[] = [
    // ===== 1. room_airlock =====
    box('airlock-floor', -0.5, 24, -1.2, 0, 'catwalk', { color: 0x4a5866 }),
    box('airlock-ceiling', 0, 24, 9.0, 10.2),
    // Secret alcove behind a Cracked Bio-Wall (Grenade), west of the spawn
    door('door-secret-alcove', 'door_secret_alcove', 'yellow', -1.5, 0, 0, 3.4, 0xffd23a),
    box('airlock-wall-west-up', -1.5, 0, 3.4, 10),
    box('alcove-floor-w', -9, -6.4, -1.2, 0, 'catwalk', { color: 0x2a3542 }),
    // Blast plate (R16): a scorched slab in the alcove floor. Only a Grenade or Rocket blast with the Blast Core breaks it. Opens the Blast Cache below.
    box('blast-alcove', -6.4, -3.8, -1.2, 0, 'catwalk', { breakId: 'break_blast_alcove', breakBy: 'blast', dynamic: true, color: 0x2a3542, emissive: 0xff5a1a }),
    box('alcove-floor-e', -3.8, -0.5, -1.2, 0, 'catwalk', { color: 0x2a3542 }),
    box('blast-cache-wall-w', -6.8, -6.4, -3.7, -1.2, 'wall', { color: 0x2a3542 }),
    box('blast-cache-wall-e', -3.8, -3.4, -3.7, -1.2, 'wall', { color: 0x2a3542 }),
    box('blast-cache-floor', -6.8, -3.4, -3.7, -3.4, 'catwalk', { color: 0x2a3542 }),
    platform('blast-cache-step', -5.6, -4.2, -1.9, { color: 0x3a434e }),
    box('alcove-ceiling', -9, -1.5, 3.4, 4.6),
    box('alcove-wall-west', -9.5, -9, -1.2, 4.6),
    // Secret roof cache above the airlock ceiling (needs Boots to reach the shaft deck, then a Grenade)
    box('cache-wall-west', 12, 13, 10.2, 14.2),
    box('cache-ceiling', 12, 24, 13.2, 14.2),
    box('airlock-balcony', 1.5, 13.5, 4.8, 5.2, 'catwalk', { color: 0x2a3542 }),
    // Collapse set piece: four segments that fall east to west during the meltdown escape
    box('bridge-seg-3', 21.6, 24.4, 4.8, 5.2, 'catwalk', { color: 0x2a3542, collapseId: 'collapse:bridge-seg-3', dynamic: true }),
    box('bridge-seg-2', 18.9, 21.6, 4.8, 5.2, 'catwalk', { color: 0x2a3542, collapseId: 'collapse:bridge-seg-2', dynamic: true }),
    box('bridge-seg-1', 16.2, 18.9, 4.8, 5.2, 'catwalk', { color: 0x2a3542, collapseId: 'collapse:bridge-seg-1', dynamic: true }),
    box('bridge-seg-0', 13.5, 16.2, 4.8, 5.2, 'catwalk', { color: 0x2a3542, collapseId: 'collapse:bridge-seg-0', dynamic: true }),
    // Recovery ledge for anyone who drops with the bridge: floor -> ledge -> balcony needs the Double-Jump
    platform('airlock-maint-ledge', 14.4, 17.0, 2.4),
    // East partition: lower doorway y0..3.6, upper doorway y5.2..8.6
    door('door-airlock-shaft', 'door_airlock_shaft', 'blue', 23.6, 24.4, 0, 3.6, 0x3a8cff),
    box('airlock-divider-mid', 23.6, 24.4, 3.6, 4.8),
    door('door-escape', 'door_escape', 'escape', 23.6, 24.4, 5.2, 8.6, 0xff3a2a),
    box('airlock-divider-top', 23.6, 24.4, 8.6, 10.2),
    box('airlock-crate', 9.0, 10.6, 0, 1.4, 'crate', { color: 0x3a434e }),
    // Underfloor Duct (reward): crawl 1.0 m high from the shaft (x 24 -> 8), then a 2.0 m chamber under the airlock floor (x 8 -> 1.6).
    // Floor is the Mines ceiling top (y -3.2); the roof of the chamber is the airlock floor underside (y -1.2).
    box('duct-roof', 8.0, 23.6, -2.2, -1.2, 'wall', { color: 0x2a3542 }),
    box('duct-end', 0.6, 1.6, -3.2, -1.2, 'wall', { color: 0x2a3542 }),
    // Final extraction hatch shutter: only exists while the meltdown clock says it is shut (derived, see world3d)
    box('final-shutter', 11.0, 11.6, 5.2, 9.0, 'wall', { sealId: 'seal_final', dynamic: true, color: 0x3a3f4a, emissive: 0xff2a2a }),

    // ===== 2. room_shaft =====
    box('shaft-floor', 24, 42, -12.2, -11.0, 'catwalk', { color: 0x1d252d }),
    box('shaft-ceiling', 24, 42, 13.8, 14.8),
    // Crawl tunnel mouth (Underfloor Duct): 1.0 m opening at y -3.2..-2.2, lintel above it
    box('shaft-wall-west-low-a', 23.6, 24.4, -7.4, -3.2),
    box('shaft-wall-west-low-b', 23.6, 24.4, -2.2, 0),
    box('shaft-wall-west-bottom', 23.6, 24.4, -12, -11),
    door('door-shaft-mines', 'door_shaft_mines', 'green', 23.6, 24.4, -11, -7.4, 0x3aff6a),
    box('shaft-wall-west-up', 23.6, 24.4, 8.8, 10.2),
    door('door-secret-cache', 'door_secret_cache', 'yellow', 23.6, 24.4, 10.2, 13.2, 0xffd23a),
    box('shaft-wall-west-top', 23.6, 24.4, 13.2, 14),
    // Crawl tunnel mouth (Service Duct): 1.0 m opening at y -4.4..-3.4, lintel above it
    box('shaft-wall-east-low-a', 41.6, 42.4, -12, -4.4),
    box('shaft-wall-east-low-b', 41.6, 42.4, -3.4, 0),
    door('door-shaft-biolabs', 'door_shaft_biolabs', 'yellow', 41.6, 42.4, 0, 3.6, 0xffd23a),
    // Rail plate: a metal panel (cracked seams) that only a Rail-Cannon shot breaks. Opens a Bio-Labs <-> Shaft shortcut at y 4.4
    box('shaft-wall-east-mid-a', 41.6, 42.4, 3.6, 4.4),
    box('plate-shaft', 41.6, 42.4, 4.4, 6.6, 'wall', { breakId: 'break_plate_shaft', breakBy: 'rail', dynamic: true, color: 0x4a4f58, emissive: 0xff7a2a }),
    box('shaft-wall-east-mid-b', 41.6, 42.4, 6.6, 8.8),
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
    // Cargo lift car (one-way, moved by the world): rests flush with the shaft floor, rises to the y=0 grate
    box('lift-car-shaft', 29.4, 32.4, -11.28, -11.0, 'platform', { color: 0x6a5a1c, emissive: 0xffb02a, dynamic: true }),
    // Footing in front of the two crawl tunnels (one-way)
    platform('shaft-crawl-ledge', 24.4, 27.4, -3.2),
    platform('shaft-duct-ledge', 35, 41.6, -4.4),
    // Ascent platforms (one-way), kept on the east side
    platform('shaft-up-1', 34, 40, 2.2),
    platform('shaft-up-2', 35, 41.6, 4.4),
    // Upper deck at y=8.8: 4.4 m above shaft-up-2 -> Double-Jump gate
    platform('shaft-upper-grate', 28, 37, 8.8),
    box('shaft-upper-floor-east', 37, 42, 8.4, 8.8, 'catwalk'),
    // Escape step-down ledge, flush with the airlock bridge (y=5.2)
    platform('shaft-escape-ledge', 24.4, 28, 5.2),

    // ===== 3. room_mines =====
    box('mines-wall-west-a', -1.5, 0, -12.2, -8.6),
    // Rail plate hides a pocket west of the vault (ammo expansion)
    box('plate-mines', -1.5, 0, -8.6, -6.6, 'wall', { breakId: 'break_plate_mines', breakBy: 'rail', dynamic: true, color: 0x4a4f58, emissive: 0xff7a2a }),
    box('mines-wall-west-b', -1.5, 0, -6.6, -3.5),
    box('pocket-floor', -6.5, -1.5, -9.0, -8.6, 'catwalk', { color: 0x2a3542 }),
    box('pocket-roof', -6.5, -1.5, -6.6, -6.2, 'wall', { color: 0x2a3542 }),
    box('pocket-wall', -6.9, -6.5, -9.0, -6.2, 'wall', { color: 0x2a3542 }),
    box('mines-ceiling', 0, 24, -4.0, -3.2),
    box('mines-floor-west', 0, 9.2, -12.2, -11.0, 'catwalk', { color: 0x1d252d }),
    box('mines-floor-pit', 9.0, 16.7, -12.6, -11.4, 'catwalk', { color: 0x12261a }),
    box('mines-floor-east', 16.5, 24, -12.2, -11.0, 'catwalk', { color: 0x1d252d }),
    platform('mines-stone', 11.3, 14.3, -9.6),
    box('mines-vault', 1.0, 10.5, -9.0, -8.6, 'catwalk', { color: 0x2a3542 }),

    // ===== 4. room_biolabs =====
    box('bio-floor-west-a', 42, 43.2, -1.2, 0, 'catwalk', { color: 0x1d252d }),
    // Service grate over the Service Duct (shortcut): walkable like floor, passable from below, drop through with S
    platform('bio-service-grate', 43.2, 45.4, 0, { color: 0x3a434e }),
    box('bio-floor-west-b', 45.4, 51, -1.2, 0, 'catwalk', { color: 0x1d252d }),
    box('service-floor', 42.4, 46.2, -4.7, -4.4, 'catwalk', { color: 0x1d252d }),
    box('service-wall-e', 45.4, 46.2, -4.4, -1.2, 'wall', { color: 0x2a3542 }),
    platform('service-step', 43.4, 45.2, -2.2),
    platform('bio-ledge-w', 42.4, 45.6, 4.4),
    box('bio-floor-basin', 50.8, 58.2, -1.5, -0.45, 'catwalk', { color: 0x12261a }),
    box('bio-floor-east', 58, 70, -1.2, 0, 'catwalk', { color: 0x1d252d }),
    platform('bio-plat-1', 46, 54, 2.2),
    platform('bio-plat-2', 60, 69, 2.2),
    platform('bio-plat-3', 52, 58, 4.5),
    // Gantry over the acid basin, lowered by the Bio-Labs switch
    box('bio-bridge', 51, 58, -0.28, 0, 'platform', { color: 0x59611f, emissive: 0x9aff3a, bridgeId: 'bridge_bio', dynamic: true }),
    platform('bio-grate-up', 62, 68, 4.4),
    box('bio-wall-east-up', 69.6, 70.4, 4.0, 8.8),
    door('door-boss', 'door_boss', 'red', 69.6, 70.4, 0, 4.0, 0xff2a3c),

    // ===== 5. room_security (its floor doubles as the biolabs ceiling) =====
    box('sec-floor-west', 42, 62, 8.4, 8.8, 'catwalk', { color: 0x1d252d }),
    platform('sec-grate', 62, 68, 8.8),
    box('sec-floor-east', 68, 70.4, 8.4, 8.8, 'catwalk', { color: 0x1d252d }),
    box('sec-ceiling', 42, 70.8, 13.8, 14.8),
    // Fake wall (round 9, Abuse-style hidden passage): the east wall looks solid but gives way when leaned on. Behind it is the Vault Nook.
    box('sec-wall-east-low', 69.6, 70.8, 8.4, 10.8),
    box('sec-wall-east-top', 69.6, 70.8, 13.8, 14.8),
    box('sec-fake-wall', 69.6, 70.8, 10.8, 13.8, 'wall', { breakId: 'break_lean_security', breakBy: 'lean', dynamic: true, color: 0x2f3a48, emissive: 0x2a5a66 }),
    // One-way shelf in front of the sill: 2.0 m above the deck, a full jump (apex 2.29 m) from a running start
    platform('sec-nook-step', 67.8, 69.6, 10.8, { color: 0x3a434e }),
    box('nook-lip', 69.6, 70.0, 9.6, 10.8, 'wall', { color: 0x2a3542 }),
    box('nook-ceiling', 70.8, 78.8, 13.8, 14.8),
    box('nook-wall-back', 78.0, 78.8, 13.8, 14.8, 'wall', { color: 0x2a3542 }),
    // Heat seal (R16): a glowing bulkhead at the back of the Vault Nook. Only the Thermal Plating can press through it. Opens the Heat Cache.
    box('heat-seal', 78.0, 78.8, 10.8, 13.8, 'wall', { breakId: 'break_heat_nook', breakBy: 'heat', dynamic: true, color: 0x3a2a24, emissive: 0xff4a1a }),
    box('nook2-ceiling', 78.8, 86.0, 13.8, 14.8),
    box('nook2-wall-back', 86.0, 86.8, 10.8, 14.8, 'wall', { color: 0x2a3542 }),
    box('sec-console', 54.0, 55.0, 8.8, 10.1, 'console', {
      minZ: -0.6, maxZ: 0.6, color: 0x1f3644, emissive: 0x2bf0ff,
    }),

    // ===== 6. room_core =====
    box('core-floor-a-w', 70, 71.0, -1.2, 0, 'catwalk', { color: 0x1c212a }),
    // Scan hatch (R16): a sealed floor panel with a lens socket. A Scan Pulse with the Scan Lens overrides it. Opens the Lens Cache below.
    box('scan-core', 71.0, 73.6, -1.2, 0, 'catwalk', { breakId: 'break_scan_core', breakBy: 'scan', dynamic: true, color: 0x1c212a, emissive: 0x2bf0ff }),
    box('core-floor-a', 73.6, 94.6, -1.2, 0, 'catwalk', { color: 0x1c212a }),
    box('scan-cache-wall-w', 70.6, 71.0, -3.7, -1.2, 'wall', { color: 0x2a3542 }),
    box('scan-cache-wall-e', 73.6, 74.0, -3.7, -1.2, 'wall', { color: 0x2a3542 }),
    box('scan-cache-floor', 70.6, 74.0, -3.7, -3.4, 'catwalk', { color: 0x1c212a }),
    platform('scan-cache-step', 71.5, 73.0, -1.9, { color: 0x3a434e }),
    // Stomp floor: cracked slab over the Core Cache. A down-dash stomp breaks it.
    box('stomp-core', 94.6, 97.4, -1.2, 0, 'catwalk', { breakId: 'break_stomp_core', breakBy: 'stomp', dynamic: true, color: 0x1c212a, emissive: 0xffb02a }),
    box('core-floor-b', 97.4, 98, -1.2, 0, 'catwalk', { color: 0x1c212a }),
    box('core-cache-floor', 94.2, 99.5, -3.7, -3.4, 'catwalk', { color: 0x1c212a }),
    box('core-cache-wall-w', 93.8, 94.2, -3.7, -1.2, 'wall', { color: 0x2a3542 }),
    box('core-cache-wall-e', 98, 99.5, -3.7, -1.2, 'wall', { color: 0x2a3542 }),
    platform('core-cache-step', 95.0, 96.6, -1.9),
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
    // Round 5 Metroid systems. The module sits in the Security Deck; the rest are backtracking rewards in earlier sectors.
    { id: 'crawl_slide', kind: 'crawl_slide', x: 44.0, y: 8.8, z: 0 },
    { id: 'etank_underfloor', kind: 'energy_tank', x: 4.0, y: -3.2, z: 0 },
    { id: 'ammo_ex_mines', kind: 'ammo_expansion', x: -4.0, y: -8.6, z: 0 },
    { id: 'ammo_ex_core', kind: 'ammo_expansion', x: 97.5, y: -3.4, z: 0 },
    // Round 16 Metroid abilities. Each one sits in an optional spot and unlocks one sealed cache (see docs/archive/rounds/R16_METROID_ABILITIES.md).
    { id: 'blast_core', kind: 'blast_core', x: -7.4, y: 0, z: 0 },
    { id: 'scan_lens', kind: 'scan_lens', x: 21.5, y: 10.2, z: 0 },
    { id: 'thermal_plating', kind: 'thermal_plating', x: 95.6, y: -3.4, z: 0 },
    { id: 'etank_blast', kind: 'energy_tank', x: -5.1, y: -3.4, z: 0 },
    { id: 'ammo_ex_scan', kind: 'ammo_expansion', x: 72.3, y: -3.4, z: 0 },
    { id: 'etank_heat', kind: 'energy_tank', x: 83.0, y: 10.8, z: 0 },
  ];

  const mapStations: MapStation3D[] = [
    { id: 'map_airlock', sector: 'airlock', x: 6.4, y: 0, z: 0, radius: 1.6 },
    { id: 'map_shaft', sector: 'shaft', x: 25.6, y: 0, z: 0, radius: 1.6 },
    { id: 'map_mines', sector: 'mines', x: 22.8, y: -11.0, z: 0, radius: 1.6 },
    { id: 'map_biolabs', sector: 'biolabs', x: 44.0, y: 0, z: 0, radius: 1.6 },
    { id: 'map_security', sector: 'security', x: 47.4, y: 8.8, z: 0, radius: 1.6 },
    { id: 'map_core', sector: 'core', x: 74.2, y: 0, z: 0, radius: 1.6 },
  ];

  const tunnels: CrawlTunnel3D[] = [
    {
      id: 'tun-underfloor', sector: 'airlock', purpose: 'reward', floorY: -3.2, clearance: 1.0, mouthX: 24.0, minX: 8.0, maxX: 24.4,
      approach: { x: 26.0, y: -3.2 }, exit: { x: 4.0, y: -3.2 }, label: 'UNDERFLOOR DUCT',
    },
    {
      id: 'tun-service', sector: 'shaft', purpose: 'shortcut', floorY: -4.4, clearance: 1.0, mouthX: 42.0, minX: 41.6, maxX: 42.4,
      approach: { x: 39.0, y: -4.4 }, exit: { x: 44.3, y: -4.4 }, label: 'SERVICE DUCT',
    },
  ];

  const pedestals: WeaponPedestal3D[] = [
    { id: 'ped-scatter', weapon: 2, x: 38.5, y: -11.0, z: 0 },
    { id: 'ped-grenade', weapon: 3, x: 8.5, y: -8.6, z: 0 },
    { id: 'ped-rail', weapon: 4, x: 65.5, y: 2.2, z: 0 },
    // Round 6 arms. Flamer: optional ledge above the Bio-Labs west floor (one jump from the first gantry). Rocket: Security Deck, past the console.
    { id: 'ped-flamer', weapon: 5, x: 43.8, y: 4.4, z: 0 },
    { id: 'ped-rocket', weapon: 6, x: 51.5, y: 8.8, z: 0 },
  ];

  const barrels: BarrelSpawn3D[] = [
    { id: 'brl-airlock-1', x: 15.0, y: 0, z: 0 },
    { id: 'brl-shaft-1', x: 32.0, y: -11.0, z: 0 },
    { id: 'brl-mines-1', x: 19.0, y: -11.0, z: 0 },
    { id: 'brl-mines-2', x: 6.5, y: -11.0, z: 0 },
    { id: 'brl-bio-1', x: 47.0, y: 0, z: 0 },
    { id: 'brl-bio-2', x: 63.0, y: 0, z: 0 },
    { id: 'brl-bio-3', x: 59.2, y: 0, z: 0 },
    { id: 'brl-bio-4', x: 60.1, y: 0, z: 0 },
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
    { id: 'e-mines-4', kind: 'crawler', x: 8.0, y: -11.0, z: 0, zone: 'mines' },
    { id: 'e-bio-1', kind: 'crawler', x: 45.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-bio-2', kind: 'spitter', x: 48.0, y: 2.2, z: 0, zone: 'biolabs' },
    { id: 'e-bio-3', kind: 'stalker', x: 62.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-bio-4', kind: 'spitter', x: 66.0, y: 2.2, z: 0, zone: 'biolabs' },
    { id: 'e-bio-5', kind: 'stalker', x: 56.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-sec-1', kind: 'stalker', x: 50.0, y: 8.8, z: 0, zone: 'security' },
    { id: 'e-sec-2', kind: 'spitter', x: 60.0, y: 8.8, z: 0, zone: 'security' },
    { id: 'e-sec-3', kind: 'stalker', x: 66.0, y: 8.8, z: 0, zone: 'security' },
    { id: 'e-core-warden', kind: 'warden', x: 83.0, y: 0, z: 0, zone: 'core' },
    { id: 'e-core-1', kind: 'crawler', x: 77.0, y: 0, z: 0, zone: 'core' },
    { id: 'e-core-2', kind: 'stalker', x: 90.0, y: 2.4, z: 0, zone: 'core' },
    { id: 'e-core-3', kind: 'spitter', x: 95.0, y: 0, z: 0, zone: 'core' },
    // Warden minion slots: dead and hidden until the Phase III summon revives them
    { id: 'e-core-m1', kind: 'crawler', x: 80.0, y: 0, z: 0, zone: 'core' },
    { id: 'e-core-m2', kind: 'crawler', x: 92.0, y: 0, z: 0, zone: 'core' },
    // Extraction ambush slots: dead until the reactor goes critical, then they hold the escape route
    { id: 'e-esc-1', kind: 'stalker', x: 64.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-esc-2', kind: 'crawler', x: 49.0, y: 0, z: 0, zone: 'biolabs' },
    { id: 'e-esc-3', kind: 'spitter', x: 33.0, y: 0, z: 0, zone: 'shaft' },
    { id: 'e-esc-4', kind: 'crawler', x: 39.0, y: 0, z: 0, zone: 'shaft' },
    { id: 'e-esc-5', kind: 'spitter', x: 9.0, y: 5.2, z: 0, zone: 'airlock' },
    // Round 4 lift ambush: dead until the cargo lift passes y -9 on its way up
    { id: 'e-lift-1', kind: 'crawler', x: 27.2, y: -4.4, z: 0, zone: 'shaft' },
    { id: 'e-lift-2', kind: 'stalker', x: 37.5, y: -6.6, z: 0, zone: 'shaft' },
    { id: 'e-lift-3', kind: 'spitter', x: 34.6, y: -2.2, z: 0, zone: 'shaft' },
    // Round 3: ceiling ambushers (y = ceiling underside - 0.85 body height) and wall/ceiling climbers.
    // Appended last so the original roster order is unchanged.
    { id: 'e-drop-airlock', kind: 'crawler', x: 15.5, y: 3.95, z: 0, zone: 'airlock', variant: 'dropper', surface: 'ceiling', span: [15.5, 15.5] },
    { id: 'e-drop-mines-1', kind: 'crawler', x: 21.5, y: -4.85, z: 0, zone: 'mines', variant: 'dropper', surface: 'ceiling', span: [21.5, 21.5] },
    { id: 'e-drop-mines-2', kind: 'crawler', x: 6.0, y: -4.85, z: 0, zone: 'mines', variant: 'dropper', surface: 'ceiling', span: [6, 6] },
    { id: 'e-climb-mines', kind: 'crawler', x: 0.45, y: -7.0, z: 0, zone: 'mines', variant: 'climber', surface: 'wall', wallDir: 1, span: [-10.6, -5.6] },
    { id: 'e-climb-shaft', kind: 'crawler', x: 41.15, y: 6.0, z: 0, zone: 'shaft', variant: 'climber', surface: 'wall', wallDir: -1, span: [4.5, 7.6] },
    { id: 'e-drop-bio-1', kind: 'crawler', x: 44.5, y: 7.55, z: 0, zone: 'biolabs', variant: 'dropper', surface: 'ceiling', span: [44.5, 44.5] },
    { id: 'e-drop-bio-2', kind: 'crawler', x: 60.5, y: 7.55, z: 0, zone: 'biolabs', variant: 'dropper', surface: 'ceiling', span: [60.5, 60.5] },
    { id: 'e-climb-bio', kind: 'crawler', x: 52.0, y: 7.55, z: 0, zone: 'biolabs', variant: 'climber', surface: 'ceiling', span: [47, 61.5] },
    { id: 'e-drop-sec-1', kind: 'crawler', x: 49.0, y: 12.95, z: 0, zone: 'security', variant: 'dropper', surface: 'ceiling', span: [49, 49] },
    { id: 'e-climb-sec', kind: 'crawler', x: 60.0, y: 12.95, z: 0, zone: 'security', variant: 'climber', surface: 'ceiling', span: [50, 67] },
    { id: 'e-climb-sec-wall', kind: 'crawler', x: 69.15, y: 11.0, z: 0, zone: 'security', variant: 'climber', surface: 'wall', wallDir: -1, span: [9.4, 12.4] },
  ];

  // Spawner nests: 0..2 per sector, concentrated in the Mines and Bio-Labs
  const hives: HiveSpawn3D[] = [
    { id: 'hive-mines-1', sector: 'mines', x: 18.2, y: -11.0, z: 0 },
    { id: 'hive-bio-1', sector: 'biolabs', x: 48.5, y: 0, z: 0 },
    { id: 'hive-bio-2', sector: 'biolabs', x: 66.5, y: 0, z: 0 },
    { id: 'hive-sec-1', sector: 'security', x: 58.5, y: 8.8, z: 0 },
  ];

  const hazards: HazardSpawn3D[] = [
    // Acid Mines: crusher on the east walkway before the acid pit, steam vent on the vault ledge
    { id: 'hz-mines-crusher', kind: 'crusher', sector: 'mines', x: 17.5, y: -11.0, width: 1.6, height: 7.0, period: 270, offset: 40, telegraph: 40, active: 26, recover: 40, damage: 40, knock: 0 },
    { id: 'hz-mines-vent', kind: 'vent', sector: 'mines', x: 7.0, y: -8.6, width: 1.0, height: 2.6, period: 210, offset: 0, telegraph: 45, active: 40, recover: 15, damage: 12, knock: 5 },
    // Security Deck: laser grid in front of the console, dark after the console is online
    { id: 'hz-sec-laser', kind: 'laser', sector: 'security', x: 60.8, y: 8.8, width: 0.3, height: 3.0, period: 300, offset: 100, telegraph: 36, active: 130, recover: 0, damage: 18, knock: 4, consoleOff: true },
    // Reactor Core: two steam vents in the arena
    { id: 'hz-core-vent-1', kind: 'vent', sector: 'core', x: 79.0, y: 0, width: 1.2, height: 2.8, period: 240, offset: 30, telegraph: 50, active: 40, recover: 20, damage: 14, knock: 5 },
    { id: 'hz-core-vent-2', kind: 'vent', sector: 'core', x: 88.0, y: 0, width: 1.2, height: 2.8, period: 240, offset: 150, telegraph: 50, active: 40, recover: 20, damage: 14, knock: 5 },
    // Meltdown rockfall along the escape route: shadow first, then the rock
    { id: 'hz-rubble-1', kind: 'rubble', sector: 'core', x: 76.0, y: 0, width: 1.8, height: 7, period: 190, offset: 20, telegraph: 50, active: 8, recover: 0, damage: 20, knock: 3, meltdownOnly: true },
    { id: 'hz-rubble-2', kind: 'rubble', sector: 'biolabs', x: 64.5, y: 0, width: 1.8, height: 7, period: 190, offset: 90, telegraph: 50, active: 8, recover: 0, damage: 20, knock: 3, meltdownOnly: true },
    { id: 'hz-rubble-5', kind: 'rubble', sector: 'biolabs', x: 68.0, y: 0, width: 1.8, height: 7, period: 190, offset: 120, telegraph: 50, active: 8, recover: 0, damage: 20, knock: 3, meltdownOnly: true },
    { id: 'hz-rubble-3', kind: 'rubble', sector: 'biolabs', x: 45.5, y: 0, width: 1.8, height: 7, period: 190, offset: 150, telegraph: 50, active: 8, recover: 0, damage: 20, knock: 3, meltdownOnly: true },
    { id: 'hz-rubble-4', kind: 'rubble', sector: 'shaft', x: 35.0, y: 0, width: 1.8, height: 7, period: 190, offset: 55, telegraph: 50, active: 8, recover: 0, damage: 20, knock: 3, meltdownOnly: true },
  ];

  const switches: SwitchSpawn3D[] = [
    { id: 'sw-bio-bridge', sector: 'biolabs', x: 50.2, y: 0.15, z: 0, radius: 0.45, opens: 'bridge_bio', label: 'GANTRY SWITCH' },
  ];

  const elevators: ElevatorSpawn3D[] = [
    { id: 'lift-shaft', sector: 'shaft', carId: 'lift-car-shaft', bottomY: -11.0, topY: 0, speed: 0.04, dwell: 45, topHold: 240, waveIds: ['e-lift-1', 'e-lift-2', 'e-lift-3'], waveY: -9.0 },
  ];

  const collapses: CollapseSpawn3D[] = [
    { id: 'collapse-airlock-bridge', sector: 'airlock', segmentIds: ['bridge-seg-3', 'bridge-seg-2', 'bridge-seg-1', 'bridge-seg-0'], triggerX: 24.2, triggerMinY: 4.4, graceTicks: 20, intervalTicks: 18, crumbleTicks: 14 },
  ];

  // Loot in the Vault Nook (ammo is split across weapons by AMMO_PICKUP_SHARE_3D, so these are generous)
  const caches: CachePickup3D[] = [
    { id: 'cache-nook-ammo-a', kind: 'ammo', value: 60, x: 73.0, y: 10.8 },
    { id: 'cache-nook-ammo-b', kind: 'ammo', value: 60, x: 75.4, y: 10.8 },
    { id: 'cache-nook-med', kind: 'med', value: 80, x: 76.8, y: 10.8 },
  ];

  const dataLogs: DataLog3D[] = [
    { id: 'log_airlock', sector: 'airlock', title: 'Cryo Log 01: Alcove Manifest', x: -5, y: 0, z: 0 },
    { id: 'log_shaft', sector: 'shaft', title: 'Shaft Log 02: Roof Cache', x: 18, y: 10.2, z: 0 },
    { id: 'log_mines', sector: 'mines', title: 'Mines Log 03: Vault Drift', x: 7.0, y: -8.6, z: 0 },
    { id: 'log_biolabs', sector: 'biolabs', title: 'Bio-Labs Log 04: Specimen Tray', x: 52.6, y: 4.5, z: 0 },
    { id: 'log_security', sector: 'security', title: 'Security Log 05: Override Memo', x: 68.8, y: 8.8, z: 0 },
    { id: 'log_core', sector: 'core', title: 'Core Log 06: Warden Protocol', x: 87.5, y: 2.4, z: 0 },
  ];

  return {
    bounds: { minX: -9.5, maxX: 99.5, minY: -12.6, maxY: 14.8, minZ: MIN_Z, maxZ: MAX_Z },
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
    hives,
    hazards,
    switches,
    elevators,
    collapses,
    mapStations,
    tunnels,
    caches,
    hunterZone: {
      id: 'zone_reclaimer',
      sector: 'biolabs',
      name: 'RECLAIMER ZONE',
      // East wing of Bio-Labs: floor, the low plate (2.2) with the Rail-Cannon pedestal and the upper grate (4.4). The grate sits out of claw reach.
      minX: 58.6,
      maxX: 69.4,
      minY: -1.6,
      maxY: 6.8,
      floorY: 0,
      homeX: 64.2,
      keyWeapon: 4,
      gates: [
        { id: 'gate-west', x: 58.6, y: 0, axis: 'x', size: 3.6 },
        { id: 'gate-hatch', x: 65, y: 6.8, axis: 'y', size: 5.6 },
      ],
    },
    dataLogs,
    secrets: [
      { id: 'secret_alcove', sector: 'airlock', name: 'Cryo Alcove', doorId: 'door_secret_alcove' },
      { id: 'secret_cache', sector: 'shaft', name: 'Roof Cache', doorId: 'door_secret_cache' },
      { id: 'secret_mines_pocket', sector: 'mines', name: 'Rail Plate Pocket', doorId: 'break_plate_mines' },
      { id: 'secret_vault_nook', sector: 'security', name: 'Vault Nook', doorId: 'break_lean_security' },
      { id: 'secret_core_cache', sector: 'core', name: 'Core Cache', doorId: 'break_stomp_core' },
    ],
  };
}

export function buildCollider3D(level: Level3D, openDoors: ReadonlySet<string>): Collider3D {
  return {
    solids: level.solids,
    pillars: level.pillars,
    ramps: level.ramps,
    isSolidActive: (s) =>
      (!s.doorId || !openDoors.has(s.doorId)) &&
      (!s.collapseId || !openDoors.has(s.collapseId)) &&
      (!s.bridgeId || openDoors.has(s.bridgeId)) &&
      (!s.breakId || !openDoors.has(s.breakId)) &&
      (!s.sealId || openDoors.has(s.sealId)),
  };
}

// Shared Metroidvania 3D type contracts for REANIMATOR (Full 3D Side-View Action Platformer).
// Keeps module dependencies acyclic across engine, game3d, render3d, and ui layers.

export type WeaponSlot3D = 1 | 2 | 3 | 4;
export type ActorAnimAction = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'death';
export type SoundEventType3D =
  | 'pulse'
  | 'scatter'
  | 'grenade'
  | 'bounce'
  | 'explosion'
  | 'rail'
  | 'dash'
  | 'jump'
  | 'double_jump'
  | 'door_blast'
  | 'save_station'
  | 'upgrade'
  | 'hurt'
  | 'unlock'
  | 'slam'
  | 'pickup'
  | 'meltdown'
  | 'win'
  // Gameplay-depth events (round 1): movement mastery, combat feedback, boss patterns, exploration
  | 'wall_jump'
  | 'dash_cancel'
  | 'stomp'
  | 'combo'
  | 'boss_telegraph'
  | 'boss_charge'
  | 'boss_summon'
  | 'boss_phase'
  | 'boss_exposed'
  | 'collect'
  | 'secret'
  // Round 3 foes: ceiling ambush landing, hive larvae spawn, hive destruction
  | 'enemy_drop'
  | 'hive_spawn'
  | 'hive_destroyed'
  // Round 4 hazards and set pieces. value 0 = warning phase, 1 = the hazard fires (vent, crush, collapse)
  | 'hazard_vent'
  | 'hazard_crush'
  | 'laser_on'
  | 'laser_off'
  | 'barrel_explode'
  | 'switch_on'
  | 'elevator_start'
  | 'elevator_stop'
  | 'collapse';

export interface SoundEvent3D {
  type: SoundEventType3D;
  /** Optional magnitude: combo count, boss phase number, collectible index */
  value?: number;
}
export type BoxKind3D = 'wall' | 'crate' | 'catwalk' | 'platform' | 'console' | 'door';
export type DoorLockKind3D = 'blue' | 'green' | 'yellow' | 'red' | 'console' | 'escape';
export type SectorId3D = 'airlock' | 'shaft' | 'mines' | 'biolabs' | 'security' | 'core';
export type UpgradePickupKind3D = 'thruster_boots' | 'energy_tank';

export interface RoomDef3D {
  id: string;
  sector: SectorId3D;
  name: string;
  hint: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Grid coordinates for the Metroid-style sector minimap */
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
  ambientColor: number;
  hasSave?: boolean;
  hasBoss?: boolean;
  hasExit?: boolean;
  neighbors: string[];
}

export interface SaveStation3D {
  id: string;
  roomId: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface UpgradePedestal3D {
  id: string;
  kind: UpgradePickupKind3D;
  x: number;
  y: number;
  z: number;
}

export interface MapSolid3D {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  kind?: BoxKind3D;
  doorId?: string;
  doorLock?: DoorLockKind3D;
  /** Optional lower visual top height for architectural cutaway rendering */
  visualMaxY?: number;
  color?: number;
  emissive?: number;
  /** Round 4: solid disappears once `openDoors` holds this id (collapsing bridge segment) */
  collapseId?: string;
  /** Round 4: solid only exists once `openDoors` holds this id (bridge lowered by a switch) */
  bridgeId?: string;
  /** Round 4: moved or toggled at runtime, so the renderer draws it from hazards3d instead of the static batches */
  dynamic?: boolean;
}

export interface Pillar3D {
  id: string;
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

export interface Ramp3D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  yMinEdge: number;
  yMaxEdge: number;
  thickness: number;
}

export interface Collider3D {
  solids: readonly MapSolid3D[];
  pillars: readonly Pillar3D[];
  ramps: readonly Ramp3D[];
  isSolidActive?: (s: MapSolid3D) => boolean;
}

export interface AcidPool3D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  surfaceY: number;
  /** Bottom elevation inside sunken basin for 3D side-view visuals */
  bottomY?: number;
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

export interface DataLog3D {
  id: string;
  sector: SectorId3D;
  title: string;
  x: number;
  y: number;
  z: number;
}

export interface SecretRoom3D {
  id: string;
  sector: SectorId3D;
  name: string;
  /** Door solid (Cracked Bio-Wall, yellow lock) that hides the room */
  doorId: string;
}

/** Surface a crawler clings to. `floor` is the normal walking state. */
export type EnemySurface3D = 'floor' | 'wall' | 'ceiling';
/** `dropper`: waits on the ceiling and falls when the player passes below. `climber`: crawls along a wall/ceiling toward the player, then drops or leaps. */
export type EnemyVariant3D = 'none' | 'dropper' | 'climber';

export interface EnemySpawn3D {
  id: string;
  kind: 'stalker' | 'crawler' | 'spitter' | 'warden';
  x: number;
  y: number;
  z: number;
  zone: SectorId3D;
  /** Crawler variants only. y is the bottom of the body box (ceiling hang: ceiling - body height). */
  variant?: EnemyVariant3D;
  surface?: EnemySurface3D;
  /** Wall only: +1 when the open space is east of the wall (leap direction), -1 when west */
  wallDir?: 1 | -1;
  /** Crawl range along the surface: x for ceiling, y for wall */
  span?: [number, number];
}

/** Destructible spawner structure that periodically births crawlers until destroyed. */
export interface HiveSpawn3D {
  id: string;
  sector: SectorId3D;
  x: number;
  /** Floor height the nest sits on */
  y: number;
  z: number;
}

export type HazardKind3D = 'vent' | 'crusher' | 'laser' | 'rubble';

/** Deterministic cyclic hazard. One cycle of `period` ticks: idle, telegraph, active, recover (recover is the remainder tail). */
export interface HazardSpawn3D {
  id: string;
  kind: HazardKind3D;
  sector: SectorId3D;
  /** Centre x */
  x: number;
  /** Floor height it stands on (crusher: the surface the piston presses toward) */
  y: number;
  /** Footprint width in x */
  width: number;
  /** Vent/laser: column height above y. Crusher: distance from y up to the ceiling the piston hangs from. Rubble: fall height. */
  height: number;
  period: number;
  offset: number;
  telegraph: number;
  active: number;
  recover: number;
  damage: number;
  knock: number;
  /** Laser grid goes dark for good once the Security Console is online */
  consoleOff?: boolean;
  /** Only runs during the reactor meltdown (cycle clock starts at the meltdown) */
  meltdownOnly?: boolean;
}

/** Shoot or press F to flip. Sets `opens` in the world's openDoors set (a bridgeId solid appears). */
export interface SwitchSpawn3D {
  id: string;
  sector: SectorId3D;
  x: number;
  y: number;
  z: number;
  radius: number;
  opens: string;
  label: string;
}

/** Cargo lift in the Central Shaft: rides up after a short dwell, spawns an ambush wave on the way. */
export interface ElevatorSpawn3D {
  id: string;
  sector: SectorId3D;
  /** Id of the dynamic one-way car solid in `solids` */
  carId: string;
  bottomY: number;
  topY: number;
  /** Metres per tick going up */
  speed: number;
  /** Ticks a rider must stand on the car at the bottom before it leaves */
  dwell: number;
  /** Ticks the car waits at the top (empty) before returning */
  topHold: number;
  /** Dead enemy slots revived once at `waveY` while rising */
  waveIds: string[];
  waveY: number;
}

/** Scripted bridge collapse: starts when the player runs onto it during the meltdown, segments fall east to west. */
export interface CollapseSpawn3D {
  id: string;
  sector: SectorId3D;
  /** Segment solid ids in fall order (each carries collapseId `collapse:<solid id>`) */
  segmentIds: string[];
  /** Player must be west of this x (and above minY) to start the script */
  triggerX: number;
  triggerMinY: number;
  graceTicks: number;
  intervalTicks: number;
  crumbleTicks: number;
}

export interface Level3D {
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  spawn: { x: number; y: number; z: number };
  consolePos: { x: number; y: number; z: number; radius: number };
  corePos: { x: number; y: number; z: number; radius: number };
  exitPos: { x: number; y: number; z: number; radius: number };
  rooms: RoomDef3D[];
  saveStations: SaveStation3D[];
  upgrades: UpgradePedestal3D[];
  solids: MapSolid3D[];
  pillars: Pillar3D[];
  ramps: Ramp3D[];
  acidPools: AcidPool3D[];
  barrels: BarrelSpawn3D[];
  pedestals: WeaponPedestal3D[];
  medStations: MedStation3D[];
  enemies: EnemySpawn3D[];
  hives: HiveSpawn3D[];
  dataLogs: DataLog3D[];
  secrets: SecretRoom3D[];
  hazards: HazardSpawn3D[];
  switches: SwitchSpawn3D[];
  elevators: ElevatorSpawn3D[];
  collapses: CollapseSpawn3D[];
}

export interface PlayerPoseState3D {
  /** +1 facing East (+X), -1 facing West (-X) */
  aimSignX: 1 | -1;
  /** Vertical aim elevation angle in [-PI/2, +PI/2], atan2(aimDy, |aimDx|) */
  aimPitch: number;
  /** Normalized XY aim unit vector X */
  aimDirX: number;
  /** Normalized XY aim unit vector Y */
  aimDirY: number;
  /** Vertical physics velocity (m/s) for velocity-locked 3-phase jump clip scrubbing */
  vy: number;
  grounded: boolean;
  /** 0..1 touchdown compression impulse for landing knee/hip cushion */
  landingFactor: number;
  /** Normalized horizontal speed vx / runTopSpeed (-1..1) */
  moveX: number;
}

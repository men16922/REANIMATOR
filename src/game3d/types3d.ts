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
  | 'win';

export interface SoundEvent3D {
  type: SoundEventType3D;
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

export interface EnemySpawn3D {
  id: string;
  kind: 'stalker' | 'crawler' | 'spitter' | 'warden';
  x: number;
  y: number;
  z: number;
  zone: SectorId3D;
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

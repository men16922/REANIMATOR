// Builder kit for the stage 2 and stage 3 levels (new design, deterministic, no RNG).
// Every stage is one horizontal run of rooms along the Z=0 lane. Floors sit at y=0, ceilings at y=9, and rooms
// reuse the six SectorId3D values so the renderer, sector damage scaling and enemy activation keep working.

import type {
  AcidPool3D,
  BarrelSpawn3D,
  DataLog3D,
  DoorLockKind3D,
  EnemySpawn3D,
  HazardSpawn3D,
  HiveSpawn3D,
  Level3D,
  MapSolid3D,
  MedStation3D,
  Pillar3D,
  RoomDef3D,
  SaveStation3D,
  SectorId3D,
  StageInfo3D,
  SwitchSpawn3D,
  UpgradePedestal3D,
  UpgradePickupKind3D,
  WeaponPedestal3D,
  WeaponSlot3D,
} from './types3d.ts';

const MIN_Z = -3.2;
const MAX_Z = 3.2;
const PLATFORM_THICKNESS = 0.28;
export const STAGE_CEILING_Y = 9.0;
export const STAGE_DOOR_TOP_Y = 3.6;

const LOCK_EMISSIVE: Record<DoorLockKind3D, number> = {
  blue: 0x3a8cff, green: 0x3aff6a, yellow: 0xffd23a, red: 0xff2a3c, console: 0x2bf0ff, escape: 0xff3a2a,
};

type EnemyKind = EnemySpawn3D['kind'];

export interface StageRoomHandle {
  id: string;
  sector: SectorId3D;
  x0: number;
  x1: number;
}

function sbox(
  id: string, minX: number, maxX: number, minY: number, maxY: number,
  kind: MapSolid3D['kind'] = 'wall', extra: Partial<MapSolid3D> = {},
): MapSolid3D {
  return { id, minX, maxX, minY, maxY, minZ: MIN_Z, maxZ: MAX_Z, kind, ...extra };
}

export class StageKit {
  readonly rooms: RoomDef3D[] = [];
  readonly solids: MapSolid3D[] = [];
  readonly pillars: Pillar3D[] = [];
  readonly acidPools: AcidPool3D[] = [];
  readonly saveStations: SaveStation3D[] = [];
  readonly upgrades: UpgradePedestal3D[] = [];
  readonly pedestals: WeaponPedestal3D[] = [];
  readonly medStations: MedStation3D[] = [];
  readonly barrels: BarrelSpawn3D[] = [];
  readonly enemies: EnemySpawn3D[] = [];
  readonly hives: HiveSpawn3D[] = [];
  readonly hazards: HazardSpawn3D[] = [];
  readonly switches: SwitchSpawn3D[] = [];
  readonly dataLogs: DataLog3D[] = [];
  private cursor = 0;
  private count = 0;

  private readonly tag: string;
  private readonly startX: number;

  constructor(tag: string, startX = 0) {
    this.tag = tag;
    this.startX = startX;
    this.cursor = startX;
  }

  /** Append a room of `width` metres. Adds floor, ceiling and the west wall of the first room. */
  room(key: string, sector: SectorId3D, name: string, hint: string, width: number, ambientColor: number): StageRoomHandle {
    const x0 = this.cursor;
    const x1 = x0 + width;
    const id = `room_${this.tag}_${key}`;
    const i = this.count++;
    const prev = this.rooms[this.rooms.length - 1];
    const row = i < 3 ? 0 : 1;
    const col = row === 0 ? i : 5 - i;
    const def: RoomDef3D = {
      id, sector, name, hint, minX: x0, maxX: x1, minY: -3.4, maxY: 10.4,
      gridX: col * 3, gridY: row, gridW: 3, gridH: 1, ambientColor, neighbors: prev ? [prev.id] : [],
    };
    if (prev) prev.neighbors.push(id);
    this.rooms.push(def);
    this.solids.push(sbox(`${this.tag}-${key}-ceiling`, x0, x1, STAGE_CEILING_Y, STAGE_CEILING_Y + 1.2));
    if (i === 0) this.solids.push(sbox(`${this.tag}-wall-west`, x0 - 0.8, x0, -1.2, STAGE_CEILING_Y + 1.2));
    this.cursor = x1;
    return { id, sector, x0, x1 };
  }

  /** Solid floor strip. Colour is cosmetic. */
  floor(r: StageRoomHandle, key: string, a: number, b: number, color = 0x1d252d): void {
    this.solids.push(sbox(`${this.tag}-${r.id}-floor-${key}`, a, b, -1.2, 0, 'catwalk', { color }));
  }

  /** Whole-room floor (no pit). */
  fullFloor(r: StageRoomHandle, color = 0x1d252d): void {
    this.floor(r, 'a', r.x0, r.x1, color);
  }

  /** Floor with an acid basin between `a` and `b`. A switch-driven gantry (`bridgeId`) spans the basin. */
  pit(r: StageRoomHandle, a: number, b: number, bridgeId: string): void {
    const t = this.tag;
    this.floor(r, 'w', r.x0, a + 0.2);
    this.floor(r, 'e', b - 0.2, r.x1);
    this.solids.push(sbox(`${t}-${r.id}-basin`, a, b, -1.5, -0.45, 'catwalk', { color: 0x12261a }));
    this.acidPools.push({ id: `acid-${t}-${r.id}`, minX: a, maxX: b, minZ: MIN_Z, maxZ: MAX_Z, surfaceY: -0.15, bottomY: -0.45 });
    this.solids.push(sbox(`${t}-${r.id}-bridge`, a - 0.2, b + 0.2, -0.28, 0, 'platform', {
      color: 0x59611f, emissive: 0x9aff3a, bridgeId, dynamic: true,
    }));
  }

  /** One-way platform whose walkable top is `y`. */
  platform(id: string, a: number, b: number, y: number, color = 0x3a434e): void {
    this.solids.push(sbox(`${this.tag}-${id}`, a, b, y - PLATFORM_THICKNESS, y, 'platform', { color }));
  }

  crate(id: string, a: number, b: number, h: number): void {
    this.solids.push(sbox(`${this.tag}-${id}`, a, b, 0, h, 'crate', { color: 0x3a434e }));
  }

  /** Full-height partition at `x` with a door opening of STAGE_DOOR_TOP_Y. Weapon locks open when shot; `console` locks open from a switch. */
  gate(x: number, lock: DoorLockKind3D, doorId: string): void {
    this.solids.push(sbox(`${this.tag}-door-${doorId}`, x - 0.4, x + 0.4, 0, STAGE_DOOR_TOP_Y, 'door', {
      doorId, doorLock: lock, color: 0x2c2f3a, emissive: LOCK_EMISSIVE[lock],
    }));
    this.solids.push(sbox(`${this.tag}-lintel-${doorId}`, x - 0.4, x + 0.4, STAGE_DOOR_TOP_Y, STAGE_CEILING_Y + 1.2));
  }

  /** East wall of the last room. */
  endWall(x: number): void {
    this.solids.push(sbox(`${this.tag}-wall-east`, x, x + 0.8, -1.2, STAGE_CEILING_Y + 1.2));
  }

  /** Lever or shoot target that adds `opens` to the open set. */
  lever(id: string, sector: SectorId3D, x: number, y: number, opens: string, label: string): void {
    this.switches.push({ id, sector, x, y: y + 0.15, z: 0, radius: 0.45, opens, label });
  }

  save(r: StageRoomHandle, x: number, y = 0): void {
    this.saveStations.push({ id: `save_${this.tag}_${this.saveStations.length + 1}`, roomId: r.id, x, y, z: 0, radius: 1.6 });
    const def = this.rooms.find((d) => d.id === r.id);
    if (def) def.hasSave = true;
  }

  med(x: number, heal: number, y = 0): void {
    this.medStations.push({ id: `med-${this.tag}-${this.medStations.length + 1}`, x, y, z: 0, heal });
  }

  barrel(x: number, y = 0): void {
    this.barrels.push({ id: `brl-${this.tag}-${this.barrels.length + 1}`, x, y, z: 0 });
  }

  weapon(id: string, weapon: WeaponSlot3D, x: number, y = 0): void {
    this.pedestals.push({ id, weapon, x, y, z: 0 });
  }

  upgrade(id: string, kind: UpgradePickupKind3D, x: number, y: number): void {
    this.upgrades.push({ id, kind, x, y, z: 0 });
  }

  log(id: string, sector: SectorId3D, title: string, x: number, y: number): void {
    this.dataLogs.push({ id, sector, title, x, y, z: 0 });
  }

  hive(sector: SectorId3D, x: number, y = 0): void {
    this.hives.push({ id: `hive-${this.tag}-${this.hives.length + 1}`, sector, x, y, z: 0 });
  }

  vent(sector: SectorId3D, x: number, offset: number, y = 0): void {
    this.hazards.push({
      id: `hz-${this.tag}-vent-${this.hazards.length + 1}`, kind: 'vent', sector, x, y, width: 1.2, height: 2.6,
      period: 240, offset, telegraph: 50, active: 40, recover: 20, damage: 12, knock: 5,
    });
  }

  pillarRow(r: StageRoomHandle, every: number, maxY = STAGE_CEILING_Y): void {
    for (let x = r.x0 + every / 2; x < r.x1; x += every) {
      this.pillars.push({ id: `pil-${this.tag}-${this.pillars.length + 1}`, x, z: -2.4, radius: 0.5, minY: 0, maxY });
    }
  }

  /** One foe at `x` standing on `y`. */
  foe(sector: SectorId3D, kind: EnemyKind, x: number, y = 0): void {
    this.enemies.push({ id: `e-${this.tag}-${sector}-${this.enemies.length + 1}`, kind, x, y, z: 0, zone: sector });
  }

  /** Spread `kinds` evenly between `a` and `b`, skipping any x inside a `skip` range. Deterministic. */
  pack(sector: SectorId3D, kinds: EnemyKind[], a: number, b: number, skip: [number, number][] = []): void {
    const n = kinds.length;
    for (let i = 0; i < n; i++) {
      let x = n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1);
      for (const [s0, s1] of skip) if (x >= s0 && x <= s1) x = s1 + 0.8;
      this.foe(sector, kinds[i], Number(x.toFixed(2)));
    }
  }

  get endX(): number {
    return this.cursor;
  }

  /** Assemble the Level3D. Console, core and hunter are parked far below the lane so no stage-1 logic can trigger. */
  finish(o: {
    stage: StageInfo3D;
    spawn: { x: number; y: number };
    exit: { x: number; y: number };
  }): Level3D {
    const parked = { x: this.startX, y: -80, z: 0, radius: 0.1 };
    return {
      stage: o.stage,
      bounds: { minX: this.startX - 1, maxX: this.cursor + 1, minY: -4, maxY: 11, minZ: MIN_Z, maxZ: MAX_Z },
      spawn: { x: o.spawn.x, y: o.spawn.y, z: 0 },
      consolePos: parked,
      corePos: { ...parked },
      exitPos: { x: o.exit.x, y: o.exit.y, z: 0, radius: 2.2 },
      rooms: this.rooms,
      saveStations: this.saveStations,
      upgrades: this.upgrades,
      solids: this.solids,
      pillars: this.pillars,
      ramps: [],
      acidPools: this.acidPools,
      barrels: this.barrels,
      pedestals: this.pedestals,
      medStations: this.medStations,
      enemies: this.enemies,
      hives: this.hives,
      dataLogs: this.dataLogs,
      secrets: [],
      hazards: this.hazards,
      switches: this.switches,
      elevators: [],
      collapses: [],
      mapStations: [],
      tunnels: [],
      caches: [],
      hunterZone: {
        id: `zone_none_${this.tag}`, sector: 'biolabs', name: 'NONE',
        minX: this.startX - 900, maxX: this.startX - 890, minY: -90, maxY: -80, floorY: -90, homeX: this.startX - 895,
        keyWeapon: 4, gates: [],
      },
    };
  }
}

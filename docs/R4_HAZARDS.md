# R4 hazards and set pieces (track B, branch `r4/hazards`)

New design. No original Abuse code or data is used; only the idea "levels have traps, lifts and switches". All cycles are pure functions of the tick (`src/game3d/hazards.ts`), no `Math.random`, `w.light` is never read.

## Hazards (`Level3D.hazards`)

One cycle = idle, telegraph, active, recover (tail). Player damage uses `damagePlayer` (hurt i-frames 28 ticks, dash i-frames pass through). Enemies standing in the column take `damage x 3` once per burst (Warden excluded).

| id | kind | sector | x | floor y | size | period / offset | telegraph / active / recover | damage |
|---|---|---|---|---|---|---|---|---|
| hz-mines-crusher | crusher | mines | 17.5 | -11.0 | 1.6 wide, ceiling -4.0 | 270 / 40 | 40 / 26 / 40 | 40 |
| hz-mines-vent | vent | mines | 7.0 | -8.6 | 1.0 x 2.6 | 210 / 0 | 45 / 40 / 15 | 12 + pop |
| hz-sec-laser | laser | security | 60.8 | 8.8 | 0.3 x 3.0 | 300 / 100 | 36 / 130 / 0 | 18, dark after console |
| hz-core-vent-1 | vent | core | 79.0 | 0 | 1.2 x 2.8 | 240 / 30 | 50 / 40 / 20 | 14 |
| hz-core-vent-2 | vent | core | 88.0 | 0 | 1.2 x 2.8 | 240 / 150 | 50 / 40 / 20 | 14 |
| hz-rubble-1..5 | rubble | core, bio, shaft | 76, 64.5, 45.5, 35, 68 | 0 | 1.8 wide | 190 | 50 / 8 / 0, meltdown only | 20 |

- Crusher: piston lowers 0.5 m while warning (still clear of a jumping player), slams in 6 ticks to 1.25 m above the floor, rises over the recover tail.
- Laser: flickers during the 36 tick telegraph, solid beam while active, never fires again once the Security Console is online (`consoleOff`).
- Rubble: shadow disc grows for 50 ticks, rock falls in the last 10, impact on the first active tick. Clock starts at the meltdown.
- Barrels: Bio-Labs gets a chained cluster (`brl-bio-3`, `brl-bio-4` next to `brl-bio-2`, 0.9 and 2.9 m apart, blast radius 4.4). `barrel_explode` fires for every detonation.

## Set pieces

- **Cargo lift** (`lift-shaft`, `Level3D.elevators`, `lift-car-shaft` solid, x 29.4..32.4): rests flush with the shaft floor (y -11). Stand on it 45 ticks, it rises 2.4 m/s to the y 0 grate (`elevator_start`/`elevator_stop`). Passing y -9 revives the dead slots `e-lift-1..3` (crawler, stalker, spitter on the shaft platforms). Returns empty after 240 ticks. The car is a one-way solid moved in place, so `motion3d` floor snap carries the rider; no sealed file and no motion3d change. Only the up trip carries (down would drop the rider at one-way platforms). It tops out at y 0, so the Thruster Boots gate (y 4.4 to 8.8) is untouched.
- **Gantry switch** (`sw-bio-bridge`, x 50.2, y 0.15): shoot (Pulse/Scatter) or press F within 1.7 m. Lowers `bio-bridge` (x 51..58, y 0) over the acid basin (`bridgeId: 'bridge_bio'`). The hive at x 48.5 stands in the line of fire from the west; stand east of it or use F.
- **Bridge collapse** (`collapse-airlock-bridge`): after the reactor dies, entering the airlock bridge (x < 24.2, y > 4.4) starts the script. Segments `bridge-seg-3..0` (east to west) crumble 14 ticks, then fall at 20 + 18k ticks (front 9.0 m/s, run speed 9.4 m/s, so standing still or walking loses). Falling drops the runner to the airlock floor; `airlock-maint-ledge` (x 14.4..17.0, y 2.4) gives a Double-Jump recovery to the balcony (checked in reach3d). Dying resets the script.
- Solid flags added to `MapSolid3D`: `collapseId` (inactive once `openDoors` has it), `bridgeId` (active only once `openDoors` has it), `dynamic` (renderer draws it from hazards3d). The ids live in `openDoors`, so saves and `__reanimatorAdvance` setups keep working.

## Events and audio

`hazard_vent`, `hazard_crush` (value 0 warning, 1 fires), `laser_on`, `laser_off`, `barrel_explode`, `switch_on`, `elevator_start`, `elevator_stop`, `collapse` (0 start, 1 segment falls, 2 rock lands). Mapped in `audioLogic.ts` to borrowed recipes (`enemy.crawler.land`, `enemy.warden.slam`, `world.light_on/off`, `world.explosion`, `world.unlock`, `world.door_blast`, `world.pickup`, `player.stomp`); warnings play quieter and higher. Events only fire within 18 m of the player. `tests/audio.test.ts` event count is 41.

## Bot and balance

- Bot rule (`hazardHold`, shared with reach3d): stop short of a hazard column that will be dangerous during the next crossing horizon (crusher 80, laser 70, vent 50, rubble 26 ticks). It does not hold in Warden/core steps and ignores rubble (trusts its dash), so it takes some hits.
- New bot steps: `lift board`, `lift ride` (stand still on the car), `bio switch` (F at x 49.4). `green door` fires from x 28.5 instead of 31 so it does not idle on the lift pad.
- Bot result (`tools/game/playthrough.ts`): won, 5362 ticks (89.4 s), final HP 112 of 160, min HP 86, 0 deaths. Before this track 4901 ticks, HP 126. HP depends on the last save and the escape, so it moves with any tuning; the window test asserts 60..140 and at most one death.
- `tools/game/reach3d.ts` (`checkHazardLayout`, `checkHazardRoute`): every hazard stands on floor, telegraph >= 30 ticks, safe window >= horizon + 20, crusher hangs from a real ceiling, lift lane clear and top landing flush, gantry walkable, collapse recovery needs the Double-Jump, and a cautious walker crosses each hazard with zero hit ticks from every cycle phase (step 3) in both directions. Boots gates (3), dash and wall-hop bypass checks unchanged. 52 waypoints, 3432 ticks.
- `tools/game/difficulty.ts` reckless probe unchanged: HP lost 200, deaths 2.

## Renderer (unverified, no browser run)

`src/render3d/hazards3d.ts` builds meshes once per level: vent grate and additive plume plus smoke pool puffs, striped piston with emissive warning pulse and shake, additive laser plane with striped beam texture and flicker, rubble shadow disc and falling rock, switch post and head, lift car and rails, sliding gantry, falling collapse segments. No PointLights. Instancing is not used because each hazard type has at most five instances. `scene3dFull.ts` changes: import, one field, skip `s.dynamic` in the static solid loop, build and `update` calls next to `mood`. `fx3d.ts` adds camera trauma for the new events; `fallback2d.ts` hides collapsed or not-yet-lowered solids.

## Browser reproduction (unverified)

`__reanimatorAdvance(inputs, setup{x,y,boots,tanks,weapons,openDoors,console,hp})`:

1. Crusher: `{x: 22, y: -11, openDoors: ['door_airlock_shaft','door_shaft_mines'], weapons: [1,2]}`, hold move west; piston at x 17.5 shudders, then slams. Wait at x 20 for the safe window.
2. Mines vent: `{x: 10, y: -8.6, boots: true, openDoors: [...]}`, walk west to x 7.
3. Laser: `{x: 65, y: 8.8, boots: true, openDoors: [all], console: false}`, walk west to the console at 54.5; grid at x 60.8 flickers 0.6 s before it fires. With `console: true` it stays dark.
4. Core vents: `{x: 73, y: 0, openDoors: [..., 'door_boss']}`, vents at x 79 and 88.
5. Barrel chain: `{x: 52, y: 0}`, shoot toward x 59.2 (cluster at 59.2, 60.1, 63).
6. Switch: `{x: 49.4, y: 0}`, press F; gantry slides out over the basin.
7. Lift: `{x: 30.9, y: -11}`, stand still 0.75 s; ride up, ambush appears near y -9.
8. Collapse: `{x: 25.5, y: 5.2, console: true}` with the reactor destroyed (meltdown running) and `openDoors` including `door_escape`; run west along the bridge.
9. Rubble: any position on the escape route during the meltdown, for example `{x: 64.5, y: 0}`.

## Plan: borrowing from Metroid where Abuse is thin (not implemented)

Abuse gives traps, lifts and switches but no map-gated exploration loop or boss-readable movement tests. Candidate Metroid-style systems, each as new design on the existing tick/openDoors contracts:

1. **Morph-style gate**: a low crawl tunnel needing a `crouch_slide` upgrade (new `UpgradePickupKind3D`, reuse the boots gate pattern and the reach3d bypass probes).
2. **Shootable blocks and bomb walls**: breakable tiles that reveal shortcuts (reuse `doorId` solids with a `breakable` lock opened by any weapon, mirrors Cracked Bio-Wall).
3. **Scan and map reveal**: map stations that reveal a sector on the minimap, reusing `visitedRooms` and `saveStations`.
4. **Missile-door style locks per weapon**: already present (blue/green/yellow/red); extend with a Rail-only lock behind the gantry.
5. **Escape sequence beats**: the collapse and rubble here are the first step; add a timed door seal on the exit hatch.
6. **Elevator hubs**: more lifts between sectors once the single set piece is proven.

Each would need its own reach3d bypass check before it ships.

## Tests

`tests/hazards.test.ts` (18): cycle partition and telegraph length, reach3d layout and timed routes, safe windows, vent warning/damage/knock, dash i-frames, crusher warn/slam/damage, laser on/off and console shutdown, enemy damage, barrel chain with `barrel_explode`, switch by shot and by F, gantry crossing, lift dwell/ride/wave/return, no accidental lift start, collapse order and reset, running beats the collapse front, rubble meltdown only with warning, determinism, bot win with HP window.

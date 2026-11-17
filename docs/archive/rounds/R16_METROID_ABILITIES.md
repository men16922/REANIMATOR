# R16 Metroid abilities: Blast Core, Scan Lens, Thermal Plating

Design written before the code. Original design, no Metroid assets or data. All three abilities are optional side-route keys: each opens one sealed cache, so the main route, the bot route and the bot pins in `tests/assist.test.ts` do not change. Browser behavior is **unverified**.

## Shared rules

- Each ability is a flag in `PlayerAbilities3D` (`blastCore`, `scanLens`, `thermalPlating`), set by an `UpgradePickupKind3D` pickup (`blast_core`, `scan_lens`, `thermal_plating`) in `applyUpgrade`. The flags live in the player state, so they survive death and respawn (checked by test) and Save stations (the world is never rebuilt).
- Each gate is a breakable solid (`MapSolid3D.breakBy` gained `'blast' | 'scan' | 'heat'`) with its own `breakId`. Without the ability nothing in the sim can remove it, so the cache is sealed by construction (`checkBreakables` also probes walking, double jump, dash and wall hop).
- No new movement physics: nothing is added to `src/engine/motion3d.ts` and the sealed `motion.ts` is untouched. All checks are pure, deterministic functions of world state. `w.light` is never read (R3.3, covered by a test).
- Rendering reuses the breakable-block mesh in `metroid3d.ts` (crack colour per kind) and the existing item silhouettes (`buildAmmoItem`, `buildSlideItem`, `buildBootsItem`) with a new colour. No new PointLights. Sectors touched: Airlock, Shaft (pickup), Security nook, Core. Nothing is added in Bio-Labs.

## Abilities

| | Blast Core | Scan Lens | Thermal Plating |
| --- | --- | --- | --- |
| Pickup | `blast_core` at (-7.4, 0), Cryo Alcove (Airlock, behind the yellow Cracked Bio-Wall, so it needs the Grenade) | `scan_lens` at (21.5, 10.2), Roof Cache (Shaft, needs Boots then a Grenade at the yellow door) | `thermal_plating` at (95.6, -3.4), Core Cache (needs the stomp) |
| Input | Fire a Grenade (3) or Rocket (6) at the plate | Scan Pulse (Z) within 6 m of the hatch | Walk into the seal (hold toward it) for 30 ticks |
| Rule | `triggerExplosion3D` with `byWeapon` 3 or 6 breaks `breakBy: 'blast'` solids within `0.8 * radius` | `stepScan3D` on a successful press breaks `breakBy: 'scan'` solids within `SCAN_OVERRIDE_RADIUS_3D` (6 m) of the player's chest | Same contact rule as the fake wall, needs `thermalPlating`, `HEAT_TICKS_3D = 30` |
| Gate | `blast-alcove`, floor panel at x -6.4..-3.8 of the Cryo Alcove | `scan-core`, floor panel at x 71..73.6 in the Reactor Core | `heat-seal`, back wall of the Vault Nook at x 78..78.8 |
| Reward | `etank_blast` Energy Tank at (-5.1, -3.4), Blast Cache under the alcove | `ammo_ex_scan` Ammo Expansion at (72.3, -3.4), Lens Cache under the Core floor | `etank_heat` Energy Tank at (83, 10.8), Heat Cache east of the nook |
| Way out | One-way step `blast-cache-step` (y -1.9), same climbs as the Core Cache, works with one jump | `scan-cache-step` (y -1.9), same | Walk back west at floor level |
| HUD | Pill `BLAST CORE` (hidden until owned) | Pill `SCAN LENS` | Pill `THERMAL`. Classic View status line appends `BLAST LENS THERMAL` |
| Item colour | orange | pale cyan | red |

The new Energy Tanks and Ammo Expansion bring the totals to 5 tanks, 3 expansions, 13 upgrades. `completion.total` is now 6 logs + 5 secrets + 13 upgrades + 5 weapons = 29.

Pickup banners (existing mechanism) show the one-line use of each ability when it is collected. There are no always-on control hints; the tutorial is FEAT-003.

## Map changes (all `map3d.ts`)

- Airlock: `alcove-floor` split into `alcove-floor-w`, `blast-alcove`, `alcove-floor-e`; walls and floor of the Blast Cache and `blast-cache-step` (cavity y -3.4..-1.2, inside the existing Airlock room box minY -3.4).
- Security/Core ceiling nook: `nook-wall-back` lowered to y 13.8..14.8, new `heat-seal` below it, `nook2-ceiling`, `nook2-wall-back` (the annex floor is the Core ceiling top y 10.8). The annex is outside every room box like the nook itself; `tests/game3d.test.ts` exempts `etank_heat` from the "props inside a room" check.
- Core: `core-floor-a` split into `core-floor-a-w`, `scan-core`, `core-floor-a`; Lens Cache walls, floor and step under the floor (inside Core minY -3.8).
- Room boxes and bounds are unchanged. A first attempt put the Blast Cache under the Mines floor and extended `room_mines.minY`; that moved the vista window grid (it derives from `room.minY`) and failed `tests/vista.test.ts`, so the cache moved under the Cryo Alcove instead.

## reach3d impact (`tools/game/reach3d.ts`, not sealed)

- `buildBreakChecks` gained `blast-alcove`, `scan-core`, `heat-nook`: sealed when intact (no walk, jump, dash or wall hop), reachable once broken, with a way back out.
- `buildCompletionLegs` gained the three pickups and the three rewards. `reach3d` still reports 52 waypoints / 3432 ticks (the main route is untouched).

## Bot pins

Unchanged: Normal 4978 ticks / HP 126, Story 4880 / 142, Hard 5319 / 104 (min 100). The bot never owns the abilities and never walks into the new pockets. Count-based assertions that moved:

- `completion.total` 23 to 29, energy tanks 3 to 5, ammo expansions 2 to 3, breakable blocks 4 to 7, minimap items 18 to 24.
- The bot's completion floor in the difficulty-curve test: the same haul was 39% of 23 and is now 34% of 29, so the floor moved from 35 to 30.

## Tests (`tests/game3d.test.ts`, 6 new)

Acquisition, blast with and without the ability and range, scan with and without the lens and range, heat contact time, gate sealed without the ability and open with it (reach3d walks), determinism, ability persistence across respawn, and headlamp independence.

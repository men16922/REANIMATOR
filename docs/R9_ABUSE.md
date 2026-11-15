# R9 Abuse feel (track D, branch `r9/abuse`)

Mechanics are newly designed, inspired by how Abuse plays. No original Abuse code, data or assets are used. Sealed files are untouched.

## Scope decision

| Idea | Outcome |
|---|---|
| 1. Ants that crawl walls and ceilings and drop on the player | Already shipped in R3 (`dropper`, `climber`, `surfaceAngle`) and R5 (rig and spring secondary motion), see `docs/R3_FOES.md` and `docs/R5_RIG.md`. Not redone. |
| 2. Hidden alcoves behind fake walls, counted in completion | **Done.** Vault Nook, see below. |
| 3. Mouse-aim crosshair and 360 degree aim | Already present: Classic View pixel crosshair cursor (`src/ui/style.css`) and the 3D ground reticle plus laser sight (`scene3dFull.ts`). Not changed. |
| 4. Pickup magnet and chunky pickup sounds | **Done.** |

## Vault Nook (fake-wall secret)

- Security Deck east wall: the segment at x 69.6 to 70.8, y 10.8 to 13.8 is `sec-fake-wall`, a solid with `breakBy: 'lean'` and `breakId: 'break_lean_security'`. It looks like the surrounding wall (no crack texture, teal seam shimmer at 0.1 to 0.17 emissive, `reduceMotion` freezes it).
- Leaning on it (pressing toward it while touching, `LEAN_TICKS_3D` = 18 ticks, 0.3 s) opens it: `block_break` event (value 2, lower pitch), `secret` event, +500 score, hint `SECRET FOUND: VAULT NOOK`. Progress decays at 2 per tick when released (`WorldState3D.leanProgress`).
- Access: a one-way shelf `sec-nook-step` (x 67.8 to 69.6, top y 10.8) 2.0 m above the deck. One plain jump with a running start reaches it (jump apex 2.29 m), no boots needed. Test searches start positions and jump timings.
- Pocket: x 70.8 to 78, y 10.8 to 13.8, standing on the Core ceiling slab, outside every `RoomDef3D` rectangle, so the sector card does not flip.
- Cache (`Level3D.caches`): two ammo packs (60) and one med pack (80), ids `cache-nook-*`, added to `w.pickups` at world creation.
- Guard: the existing wall climber `e-climb-sec-wall` clings at x 69, y 11 and now ambushes from the secret wall. This was not planned and remains as is.
- Completion: 5 secrets, total 23 (was 22). Minimap `?` marker via the existing breakable lookup. `tools/game/reach3d.ts` has a new `lean-security` break check (sealed while intact, reachable once open, way back out).

## Pickup magnet and chunky pickups

- Dropped packs (`drop-*`: kill drops, hive ammo, Warden med) drift to the player when within `MAGNET_RANGE_3D` = 4.6 m horizontally and 2.4 m vertically, accelerating by 0.9 m/s per tick from 2 up to 15 m/s. Y only rises toward the player, never sinks into the floor. Ammo is always pulled. A med pack is pulled only when HP is under 80%, so walking past never wastes it. Placed pickups (pedestals, med stations, caches) never move.
- `pickup` events now carry `value`: 0 med, 1 ammo, 2 weapon. Audio maps them to `world.pickup_med` (warm two-note chime with a thump), `world.pickup_ammo` (metal clack, bolt ratchet, low thump) and the old `world.pickup` for weapons. FX: green ring and sparks for med, amber ring and sparks plus a tiny shake for ammo.

## Bot and gate numbers

- Bot (`createBot3D`): won, 5362 ticks, final HP 112 of 160, min HP 86, 56 kills, 0 deaths. Identical to the baseline. The first shelf design (two steps at x 63.6 to 69.6) collided with the bot's grate climb and cost 42 HP, so the shelf was cut to one platform at x 67.8 to 69.6.
- `make check`: exit 0, 434/434 tests, reach3d PASS (52 waypoints, 3432 ticks), dist-guard PASS (13 files, 14,778,232 B).
- Edited tests for the new counts: `tests/arms.test.ts`, `tests/game3d.test.ts`, `tests/metroid.test.ts` (secrets 4 to 5, completion total 22 to 23, breakables 3 to 4). New `tests/abuse9.test.ts` (7 tests: lean timing, completion and pay-out, jump reachability, cache placement, magnet rules and determinism, pickup cue mapping, bot win).

## Verified vs unverified

| Item | Status |
|---|---|
| Simulation rules (lean, magnet, caches, completion) | Verified by node tests and `make check` |
| Jump reachability of the shelf | Verified by search in `tests/abuse9.test.ts` and `reach3d` break check |
| Bot win and numbers | Verified |
| Sound recipes exist and map | Verified structurally. How they sound is unverified |
| Fake wall appearance (disguise quality, shimmer), nook lighting and camera framing, pickup FX look | **Unverified**, Chrome could not run here. Check in `make dev`: walk to the Security east end, jump onto the shelf, lean east. |
| Draw calls per sector, 60 fps | Unverified. One extra box mesh in `metroid3d` blocks and a handful of static solids, no new lights. |

# R5 Metroid track (B): exploration loop

Branch `r5/metroid` (worktree `/private/tmp/r5-metroid`). Original design, no Metroid asset or data. Abuse stays the reference for the movement feel; this track fills what Abuse never had (gated backtracking, map reveal, a timed exit) with Metroid-style structure. Browser behavior below is **unverified** (no browser run); everything marked "checked" is covered by node tests or `tools/game/reach3d.ts`.

## What was added

| System | Where | Notes |
| --- | --- | --- |
| Crawl Slide ability | `src/engine/motion3d.ts` (`slideHeight 0.9`, `slideSpeed 11.5`, `slideTicks 24`, `crawlSpeed 4.6`, `hasHeadroom3D`) | New `UpgradePickupKind3D` `crawl_slide`, `PlayerAbilities3D.crawlSlide` |
| Two crawl tunnels | `map3d.ts` (`level.tunnels`) | reward: Underfloor Duct, shortcut: Service Duct |
| Breakable blocks (3) | `MapSolid3D.breakId/breakBy`, `breakBlock3D` in `world3d.ts` | stomp slab, two Rail plates, all cracked and marked |
| Map terminals (6) | `level.mapStations`, `WorldState3D.mapRevealed`, `minimap.ts` | F reveals a sector; `?` markers with `M` toggle |
| Backtracking rewards | `level.upgrades` | Energy Tank 3, two Ammo Expansions; counted in completion |
| Escape beats and final hatch | `ESCAPE_BEATS_3D`, `escapeSealView3D`, solid `final-shutter` (`sealId`) | pure function of `meltdownTicks` |
| Item pickup beat | `main.ts` (`itemFreeze`, banners) | display-clock freeze only, simulation untouched |
| Renderer objects | `src/render3d/metroid3d.ts` | cracked blocks, tunnel stripes, terminals, shutter, two item silhouettes |

## Controls

- **Crawl Slide**: on the ground, hold `S` and press `Shift` (or right mouse). Direction is the move key (or the aim side). A fast slide lasts 24 ticks (about 4.8 m); inside a 1.0 m tunnel the body stays low and crawls at the move key (4.6 m/s). It stands up as soon as there is headroom, on a jump, or when it leaves the ground. Without the module the same input is a plain dash.
- **Map terminal**: `F` within 1.6 m. Once per sector.
- **Minimap**: `Tab` expands, `M` toggles the `?` markers (amber = unfound item or log or weapon, magenta = unfound secret). Revealed but unvisited sectors are teal; `M` glyph marks a terminal.
- **Stomp** (existing): airborne `Shift` + `S`. It now also breaks the cracked slab it lands on.
- **Rail-Cannon** (existing): any shot that meets a Rail plate first breaks it.

## Map additions (world coordinates, x east, y up)

Room bounds grew to cover the new spaces: airlock `minY -3.4`, mines `minX -7`, biolabs `minY -4.8`, core `minY -3.8`.

### Crawl tunnels (both 1.0 m clear, standing body 1.82 m, sliding body 0.9 m)

1. **Underfloor Duct** (reward, Airlock). Start on the one-way ledge `shaft-crawl-ledge` (x 24.4..27.4, y -3.2), slide west through the mouth in the shaft wall (x 23.6..24.4, opening y -3.2..-2.2). The duct runs x 24 to 8 under the airlock floor (`duct-roof`), then opens into a 2.0 m chamber (x 1.6..8) holding **`etank_underfloor` (Energy Tank 3)** at (4.0, -3.2). Reach the ledge by hopping from the shaft platform at y -4.4.
2. **Service Duct** (shortcut, Shaft to Bio-Labs). Start on `shaft-duct-ledge` (x 35..41.6, y -4.4), slide east through the wall opening (x 41.6..42.4, y -4.4..-3.4) into a column under the Bio-Labs floor (x 42.4..46.2). Two 2.2 m hops (`service-step`, y -2.2) lead up through the one-way `bio-service-grate` (x 43.2..45.4, flush with the Bio-Labs floor at y 0). Two-way: from the Bio-Labs, `S` drops through the grate, then slide west back to the shaft. It skips the yellow door, the hive and the first rubble lane on the escape route.

Neither tunnel can be entered by walking, double-jumping, jet-dashing, wall hopping, dash-cancelling, or dash+S without the module (`checkTunnels`, both directions for the shortcut). The slide also works without the Boots (maxJumps 1).

### Breakable blocks (all `dynamic`, drawn by `metroid3d.ts`, cracks in amber or orange)

| Id | Box | Breaks with | Opens |
| --- | --- | --- | --- |
| `stomp-core` | x 94.6..97.4, y -1.2..0 (Core floor) | down-dash stomp landing on it | Core Cache: **`ammo_ex_core`** at (97.5, -3.4). Secret `secret_core_cache`. A step platform at y -1.9 gives a way out even with one jump |
| `plate-mines` | x -1.5..0, y -8.6..-6.6 (Mines west wall) | one Rail-Cannon shot | pocket x -6.9..-1.5: **`ammo_ex_mines`** at (-4.0, -8.6). Secret `secret_mines_pocket` |
| `plate-shaft` | x 41.6..42.4, y 4.4..6.6 (Shaft east wall) | one Rail-Cannon shot | shortcut Shaft up-2 platform (y 4.4) to the new `bio-ledge-w` (x 42.4..45.6, y 4.4). Also lets the escape skip the yellow door |

Every plate and slab is unreachable while intact (checked with walk, double-jump, dash and wall-hop probes) and the broken state keeps a way back out (`checkBreakables`). Grenades, Pulse and Scatter do not break rail plates; no weapon breaks the stomp slab.

### Map terminals (F)

`map_airlock` (6.4, 0), `map_shaft` (25.6, 0), `map_mines` (22.8, -11), `map_biolabs` (44.0, 0), `map_security` (47.4, 8.8), `map_core` (74.2, 0).

### Items

| Id | Kind | Position | Reached with |
| --- | --- | --- | --- |
| `crawl_slide` | module | (44.0, 8.8) Security Deck west end, beside the save | Boots (Security gate) |
| `etank_underfloor` | Energy Tank 3 (+30 max HP) | (4.0, -3.2) | Crawl Slide |
| `ammo_ex_mines` | Ammo Expansion | (-4.0, -8.6) | Rail-Cannon (plate) |
| `ammo_ex_core` | Ammo Expansion | (97.5, -3.4) | stomp |

An Ammo Expansion adds half the starting ammo of every owned weapon on pickup and raises every Save/Recharge refill level by half the starting ammo per expansion (Scatter 28, Grenade 14, Rail 10 base).

### Completion

`completion.total` is 20: 6 logs + 4 secrets (2 Cracked Bio-Walls, Mines pocket, Core cache) + 7 upgrades (Boots, 3 Energy Tanks, module, 2 expansions are counted as upgrades) + 3 weapons. `tools/game/reach3d.ts` now walks every off-route collectible (`buildCompletionLegs`, `checkCompletion`), including the slide leg; main-route items stay covered by the 52 waypoints, logs by `buildCollectibleChecks`. `tests/metroid.test.ts` also takes all 20 in the simulation and asserts `percent === 100`.

### Escape sequence

Pure function of `meltdownTicks` (no extra state, so death and restart reset it). 90 s clock, beats by seconds left:

| Left | Beat | Event |
| --- | --- | --- |
| 80 s | Core bulkhead sealed | `seal_warn` 0 |
| 62 s | Bio-Labs sealing | `seal_warn` 1 |
| 44 s | Shaft sealing | `seal_warn` 2 |
| 28 s | Airlock sealing, final hatch soon | `seal_warn` 3 |
| 12 s | **Final hatch closing**, shutter starts to lower (red strobe, shake) | `seal_warn` 4 |
| 9 s | Shutter solid (x 11.0..11.6, y 5.2..9.0, on the balcony, between the collapse bridge and the exit at x 5.5) | `seal_close` |

Fairness (checked): the walking route Core to exit (no dash) takes 15.7 s and leaves 65.3 s before the shutter shuts; the bot arrives with 78.75 s left. `checkEscapeFairness` fails the gate if the spare time drops under 20 s, the warning is under 3 s, the beats are out of order, or the shut shutter does not block the route. Sector bulkheads only warn; they never trap anyone.

### Pickup beat

On an upgrade pickup `main.ts` stops the display clock for 0.85 s (the simulation does not advance, so replays stay identical), shows the existing pickup banner with the new text (`CRAWL SLIDE`, `AMMO EXPANSION`), and plays `world.upgrade` (sim event) + `ui.banner` + a delayed `ui.rank` stinger. No new sound recipe.

### Events and audio

New `SoundEventType3D`: `slide`, `block_break` (0 stomp, 1 rail), `map_reveal`, `seal_warn` (0..4), `seal_close`. Mapped in `audioLogic.ts` to `player.dash`, `world.door_blast`, `world.unlock`, `stinger.meltdown`, `world.door_blast` with retuned pitch and gain in `cueForEvent`. `tests/audio.test.ts` counts 46 events.

## Bot and balance

- `tools/game/playthrough.ts`: **won, 5362 ticks (89.37 s), final HP 112, 0 deaths**, meltdown left 78.75 s at extraction. Identical to before this track: the main path never needs the module, a plate, the slab, or a terminal (the bot presses F every tick, so it does download maps it walks past; that has no gameplay effect). The Slide Module is placed one step past the save station so the bot does not take it.
- Window kept: final HP 60..140, deaths 0..1 (`tests/metroid.test.ts`, `tests/game3d.test.ts`).
- `tools/game/reach3d.ts`: 52 waypoints, 3432 ticks (57.2 s); Boots gates, dash and wall-hop bypass probes, hazards unchanged; new lines `METROID tunnels ... OK` and `ESCAPE fairness ... OK`.

## Tests

`tests/metroid.test.ts` (23): slide start, low body in the tunnel, crawl speed, stand-up rules, no air or cooldown slide, jump cancel, platform no drop-through, tunnel gates with every bypass probe, module gating through the world, stomp and rail breaking (and what must not break them), secrets, map terminal rules and hints, `?` markers, 100% completion, ammo refill levels, completion legs, escape beats in order, shutter blocking and reopening on a clock reset, fairness, audio cues, determinism, bot window, R3.3 non-coupling, collider contract. Existing tests updated only where counts changed (3 Energy Tanks, 4 secrets, completion total 20, 46 audio events).

## Renderer (unverified)

`src/render3d/metroid3d.ts` builds once per level: cracked breakables (procedural crack texture, breathing seam glow, fade and sink on break), hazard-stripe frames and an amber glow at each tunnel mouth (dim until the module is owned), six terminals (cyan, teal once used), the lowering shutter (strobe, solid at 9 s), and the Crawl Slide and Ammo item silhouettes. `scene3dFull.ts` changes: import, one field plus `slideSquash`, build and `update` calls next to `hazards3d`, three upgrade color/model cases, and a visual crouch (`root.scale.y` x 0.58 while sliding). `fallback2d.ts` hides broken or shut blocks. No PointLights, no per-frame allocation.

## Browser reproduction (unverified)

`__reanimatorAdvance(inputs, setup)`; new setup keys `slide: true` (grant the module) and `meltdownTicks: n` (reactor already destroyed, `door_escape` open, Warden removed).

1. **Underfloor Duct**: setup `{x: 26, y: -3.2, slide: true}`, inputs 300 x `{moveX: -1, dash: true, dropDown: true}` (about 4.8 m of fast slide, then 4.6 m/s crawl: the 18 m run needs about 200 ticks to reach x 8, then the body stands in the chamber and takes the tank at x 4). Without `slide: true` the player stops at x 24.82 (checked in node).
2. **Service Duct**: `{x: 39, y: -4.4, slide: true}`, inputs 120 x `{moveX: 1, dash: true, dropDown: true}`: ends at x 44.98 on the column floor under the Bio-Labs (checked in node); jump twice from there (step at y -2.2, then the grate at y 0).
3. **Stomp slab**: `{x: 96, y: 4, skipIntro: true}` (without `skipIntro` the Core Warden intro freezes input for 210 ticks), inputs: 3 idle frames first (a dash on the first frame, while the debug body still counts as grounded, is a plain dash and its cooldown blocks the stomp), then 60 x `{dash: true, dropDown: true}` (checked in node with the intro flag set). The slab vanishes with `block_break`; a second setup `{x: 97.5, y: -3.4}` takes the expansion.
4. **Rail plate (Mines)**: `{x: 3, y: -8.6, weapons: [4]}`, inputs: 4 frames `{weaponSlot: 4, fire: true, aimX: -3, aimY: -7.5}` then 1 frame `fire: false`. Walk west to x -4 for the pocket.
5. **Rail plate (Shaft)**: `{x: 38, y: 4.4, weapons: [4]}`, shoot at `aimX: 44, aimY: 5.5`; walk east onto the Bio-Labs ledge at y 4.4.
6. **Map terminal**: `{x: 25.6, y: 0}`, 2 frames `{interact: true}`; open the map with Tab; `M` toggles the `?` markers. Walk to a terminal in another sector first to see the teal revealed rooms.
7. **Escape beats**: `{x: 20, y: 5.2, meltdownTicks: 740}` then step 60 frames per screenshot: `seal_warn` 4 at tick 20, shutter lowers, `seal_close` at tick 200 (`meltdownTicks` 540; checked in node). Run west at x 11 before it shuts to win; stand east of it and the shutter blocks.
8. **Pickup beat** (live loop only, not reachable through `__reanimatorAdvance`): play to the Security Deck save, step west to x 44: the display freezes 0.85 s, the banner reads CRAWL SLIDE, stinger plays.

## Notes for the integrator

- Shared files touched outside this track's core set: `scene3dFull.ts` (see above), `main.ts` (minimap args, `M` key, freeze, two debug setup keys, snapshot fields `sliding`, `mapRevealed`, `ammoExpansions`), `fallback2d.ts`, `flow.ts` (two hints), `index.html` (minimap label).
- Slide uses `dropDown` + `dash` on the ground, so `navSteer` and the bot never produce it by accident (the bot never owns the module).
- Sealed files untouched.

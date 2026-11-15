# R14 track A: room transitions

Feedback: "방 넘어갈 때 너무 빠르게 넘어가서 사람 대응이 어려움" (room transitions are too fast to react to).

Before R14, crossing a door changed `currentRoom` in one tick. The camera clamp rectangle jumped to the new room at the
`FrameRectSmoother` default rate (8/s, about 138 m/s peak pan on the Airlock-to-Shaft change), the Central Shaft's
1.14x pull-back popped in one frame, and foes near the entrance woke and attacked at once.

## What changed

All sim changes are in `src/game3d/world3d.ts` (new design, no sealed file touched). Everything is tick-based and
deterministic: no `Math.random`, no wall clock, `w.light` unused.

| Piece | Rule | Constant |
| --- | --- | --- |
| Walk-through | A side-door crossing (player within 1.5 m of the new room's side edge, on foot, moved < 3 m this tick, previous position in the old room or a gap) starts a hold. For 42 ticks (0.7 s) the operative auto-walks through the door at 0.55 of walk speed. Jump, dash, drop and fire are ignored, aim stays live, and hurt i-frames are kept up. | `TRANSITION_TICKS_3D = 42` |
| Entry grace | For 150 ticks (2.5 s) after a side-door entry, non-Warden foes of the new room within 14 m of the player do not wake, aggro, move or attack. A foe that gets hit during the window is released at once (`w.graceReleased`), so shooting a passive foe never gets free kills. | `ENTRY_GRACE_TICKS_3D = 150`, `ENTRY_GRACE_RADIUS_3D = 14` |
| Doorway clearance | `doorways3D(level)` lists every sector door sill (secret hatches excluded). No enemy spawn or hive sits within 3 m of one. The escape ambush crawler `e-esc-4` moved from x 39.5 to 39.0 (it was 2.5 m from the Shaft-Bio-Labs door). | `DOORWAY_CLEAR_M_3D = 3` |
| Skipped cases | Teleports and respawns (previous position already in the new room), lift and drop entries through a floor or ceiling (only the title card and camera ease apply), and the meltdown escape (the clock is the challenge). | |
| Camera | `FrameRectSmoother.update` takes a `maxSpeed`; the scene uses rate 5/s with edges capped at 16 m/s (`ROOM_EASE_RATE`, `ROOM_EASE_MAX_SPEED` in `src/render3d/cameraFrame.ts`). The per-sector distance and screen-height hint now eases at 3/s. `rectIncludingPlayer` (R9) still runs after smoothing, so the operative stays in frame. The teleport snap (player more than 3 m outside the rect) is unchanged. | |
| Title card | The existing sector card (eyebrow, name, sub-line) shows on every room change. Reduce motion swaps its slide for an opacity-only fade (`body.reduce-fx` and `prefers-reduced-motion`). | |
| Reduce motion | The camera cuts to the new room framing (infinite rate) and the hint snaps instead of panning. The sim hold and grace are the same with or without it, so replays and the bot do not depend on the setting. | |

Why the side-entry restriction: giving lift entries into the Security Deck the same grace made the bot route 300 ticks
slower and caused a Hard death in the sweep below. Lifts are slow and visible, so the reaction problem is at doors.

## Tuning sweep (bot, deterministic)

Sweep over transition 30/36/42/48 ticks, grace 120/150/180 ticks, radius 12/14/16 m. The bot outcome is chaotic in
these parameters (Hard min HP ranged 1 to 100 across the grid). The chosen point, 42/150/14, sits in the only
neighbourhood where all three radii passed every pin: Normal final HP 107 to 126, Hard min HP 100, Story above Hard.

## Bot numbers (createBot3D, fresh world)

| Difficulty | Before (main 758daa1) | After |
| --- | --- | --- |
| Normal | won, 5208 ticks, HP 126, min 93, 0 deaths | won, 4978 ticks, HP 126, min 93, 0 deaths |
| Story | won, 5599 ticks, HP 139 | won, 4880 ticks, HP 142 |
| Hard | won, 5094 ticks, HP 114, min 100 | won, 5319 ticks, HP 104, min 100, 0 deaths |

Normal reckless probe (3600 ticks): hpLost 281 / 2 deaths before, 160 / 1 death after. Re-pinned in
`tests/assist.test.ts` (Normal 4978 / HP 126, reckless 160 / 1). The Hard min HP floor 80 and the
`tests/bot-robust.test.ts` Hard final HP >= 100 still hold without changes.

`SHOWCASE_REEL` (`src/ui/demo.ts`): cuts 3, 6 and 7 moved to ticks 2150 (Bio-Labs), 4420 (Bio-Labs, meltdown) and
4920 (Airlock) to land in their sectors on the new bot run. Judge Reel cuts (`src/ui/reel.ts`) build their own scene
worlds and pass `tests/r13-reel.test.ts` unchanged. reach3d: PASS, 52 waypoints, 3432 ticks (unchanged).

## Tests

`tests/r14-transit.test.ts`: transition length in 0.4 to 0.8 s; the walk-through ignores reverse input, jump, dash and
fire and returns control; determinism; grace keeps a foe passive with no damage, it wakes afterwards, and a hit
releases it inside the window; teleports and the meltdown start no hold; doorway clearance for all enemy and hive
spawns; the eased clamp pans at most 24 m/s with the player in frame (22.6 m/s measured) against 138 m/s at the old
default rate, and the reduce-motion cut.

## Real-time check (Playwright, built `dist/`, 1280x800)

Bot to just before the door, then a held key in real time, sampling every ~33 ms. Screenshots in
`docs/evidence/r14_transit/`.

| Door | Walk-through | Card | Peak camera pan | Notes |
| --- | --- | --- | --- | --- |
| Airlock to Central Shaft (D) | 3.69 m in 709 ms | CENTRAL SHAFT | 17.1 m/s | HP 100 to 100 |
| Central Shaft to Acid Mines (A) | 3.69 m in 742 ms | ACID MINES | 18.7 m/s | HP 100 to 76 after holding A for 3 s into the crusher lane (hazards are not part of the grace) |
| Central Shaft to Bio-Labs (D) | 3.93 m in 720 ms | BIO-LABS | 17.3 m/s | HP 118 to 102 later in the run; one 22.9 m/s camera z step, likely the reset at the start of the sample (not isolated) |

The operative stayed in frame in every sample (largest player-to-camera x offset 9.08 m). Before the hint ease, the
first run showed a 1 m backward camera step at the Shaft crossing (the 1.14x pull-back popping); that step is gone.

Not verified: a human playing through with the new pacing (G5), and the reduce-motion path in a browser (covered by
the unit test only).

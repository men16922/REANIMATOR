# R12 Onboarding: the first minute

Problem: on Normal, a player who walked right and stood still died in about 14 s to the two airlock crawlers plus the ceiling dropper, with no resume.

## Changes (all deterministic, no Math.random)
- `src/game3d/world3d.ts`, tutorial encounter (zone `airlock`: `e-airlock-1`, `e-airlock-2`, `e-drop-airlock`):
  - `e-airlock-2` and the dropper stay asleep while `e-airlock-1` lives, up to 1200 ticks (20 s). Hard skips the hold.
  - Until the player's first kill (not on Hard): contact damage x0.6, alert 60 ticks instead of 20, lunge windup 28 ticks instead of 14 (readable telegraph).
  - `respawnPlayer3D` with no Save station: restarts at spawn, run kept; live foes within 14 m of the spawn drop to patrol with a 150 tick aggro cooldown.
- `src/ui/main.ts`: Resume is always offered. Without a save the text reads "Press C or Enter to retry from the start. Your run is kept."
- `src/ui/flow.ts`: the FOE FLASHING hint also teaches Dash (X to COUNTER, or SHIFT to DASH through it) until the player has dashed.
- `tests/onboard.test.ts` (5 tests); `tests/game3d.test.ts` `soloEnemy` renames the enemy id so generic AI tests do not pick up the tutorial tuning.

## Verification
- `make check`: exit 0 (549/549 node tests, reference-verify 3/3, reach3d 52 waypoints 3432 ticks, dist-guard PASS).
- Bot pins unchanged: Normal 5522 ticks HP 95; Hard min HP floor unchanged and still passing.
- Idle-player probe: alive after 1200 ticks on Normal (was dead at about 840).
- Real-time browser play: unverified (not run in this sandbox).

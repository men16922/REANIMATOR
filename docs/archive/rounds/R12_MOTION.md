# R12 Motion (track B)

Display-side only. No file under `src/game3d` changed, so the bot (Normal, 5522 ticks) and reach3d (52 waypoints, 3432 ticks) are unchanged. No sealed file was touched, no new PointLights, no `Math.random`.

## Already in place (verified by reading, kept)

- Stalker and Warden rigs: `strideLength * gaitCycleRate = ground speed` for every speed, smooth walk/run blend (`runBlend`), head leads body on turns, yaw rate capped at 12 rad/s (`stepEnemyYaw`).
- Crawler scuttle: stride-locked bob, roll and yaw swing (`proceduralEnemyPose`, `gaitStep`).

## Changes

Pure functions in `src/render3d/enemyMotion.ts`, wired in `scene3dFull.ts` and `hunterView.ts`:

| Kind | Change | Function |
| --- | --- | --- |
| All | Hit flinch (pitch back, squash) and a display-only knockback offset (max 0.3 m, opposes facing) that decays to exactly zero | `flinchStep`, `flinchPose` |
| Stalker, Warden, crawlers | Turn-around squash: the body gathers while the heading is far from the target and recovers as it settles | `turnAmount`, `turnSquash` |
| Climber | Travelling body wave (roll, yaw, stretch, nose) along walls and ceilings, phase from the integrated gait | `surfaceWave` |
| Dropper | Coil before the drop (stretch toward the ceiling, draw in, tremble), heavier landing squash | `dropAnticipation`, `landSquash` |
| Spitter | Backward kick on firing in addition to the existing inflate windup | `spitKick` |
| Reclaimer | Death collapse: buckle, thud, settle (sink and squash on the root) | `collapsePose` |

Gibs (`gore3d.ts`) were reviewed and left unchanged: recipes already cover stalker, crawler, spitter and warden.

## Tests

`tests/r12-motion.test.ts`: foot speed equals ground speed, turn blend continuous and at most 0.2 rad per 60 Hz frame, flinch decays to exactly zero and knockback is bounded, squash returns to 1, dropper coil and wall wave, spitter kick, Reclaimer collapse, determinism, and `bestiary` registration. They call the new functions, so reverting the functions fails them.

## Showcase

`await __reanimatorShowcase('bestiary')` loads the Sunken Mines at x = 14 with the operative standing still. A stalker, two crawlers, two droppers, a climber and a spitter are within one screen and animate as they close in. Rigged and single-mesh models are created at scene load, so the lineup uses the existing mine roster rather than spawning new foes.

## Verification

- `make check`: exit 0 (typecheck, node tests, reference-verify, reach and reach3d, vite build, dist-guard).
- Visual check: unverified. The sandbox refused to start the Vite dev server, so no screenshots exist under `docs/evidence/r12_motion/`.

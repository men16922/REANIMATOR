# R13 UX fixes

- **Debug layers**: `__reanimator().layers` reads computed display, visibility, opacity and size (`onScreen` in `src/ui/main.ts`), not just the `hidden` attribute. CSS forces `#loading[hidden], #title[hidden]` to `display:none !important`.
- **Hints**: `WorldState3D.hintSector`. `setHint` defaults to the sector the player is in; the Reclaimer messages use the hunter zone sector; meltdown beats are global. The HUD shows a hint through `visibleHint(world)`. `applyDebugSetup` clears the hint when it moves the player. Display only: the bot pin is unchanged.
- **Damage popups**: identical hits within 0.4 s near the same x merge (`14x2`, summed value when over 5 chars). `PopupPool.write(z, maxY)` clamps glyph y; `popupCeilWorldY` converts the NDC ceiling (set from the boss bar bottom edge in `hud()`) to world y.
- **Classic HUD**: DASH, LIGHT, THRUSTER and SCAN pills are hidden under `body.classic` and replaced by one pixel `#classic-status` line (`classicStatusText`). The TIME pill stays: the pixel strip has no clock.

## Verification

`make check`: exit 0. `node --test`: 587 tests, 587 pass, 0 fail. reach3d PASS (52 waypoints, 3432 ticks), dist guard PASS (13 files, 218 checked). Sealed files unchanged against main.

Browser checks (Playwright 1200x843, branch dev server on 5176, main on 5173):

- Fresh load, wait 6 s, `__reanimatorShowcase('bestiary')` shows the bestiary scene on the first call on both main and the branch. `#loading` and `#title` have computed `display:none`, top layer is `playing` (expected, world showcases end in `enterManual`). A layered loading/title screenshot seen earlier did not reproduce; the likely cause is a frame composited before the overlays were removed. Layer telemetry now reads computed styles, so it matches what is painted.
- Hint leak reproduced on main (MINES line read "RECLAIMER OFFLINE. THE ZONE IS SAFE" after the bestiary showcase). On the branch the sector's own hint is shown; the boss showcase reads "CORE · REACTOR CORE  Core Warden arena. The reactor sits at the east end."
- Classic view: ability pills hidden, one `#classic-status` line (`DASH RDY  LIGHT OFF 100%  SCAN READY  BOOTS`), objective pill, pixel strip with HP, weapons, KILLS and sector.

## Unverified

- Damage popup ceiling under the boss bar during live hits.
- Live popup merging during real combat.
- Crawler gait and rig run lean judged by eye. The stride match is only checked by node tests, so the user's report that enemy running looks awkward may need another pass after a visual check.

## Enemy running (FEAT-002)

User steering: "enemies' running still looks awkward". Display-side only; no file under `src/game3d` changed (bot pin 5123/118 and reach3d 52/3432 unchanged).

### Causes found

- Single-mesh crawlers: the old gait `6 + 28 * speed / 5` rad/s hit its 6.5 Hz cap at 6 m/s, so the bob (twice per stride) buzzed at about 13 Hz. Stride did not match ground speed, and the gait followed the raw sim speed, which steps.
- Crawler pose amplitude jumped from 0 to 50% the frame the foe started moving (`max(0.5, run)`).
- Rigged stalker and warden: the moving flag used a single 0.35 m/s threshold (could flap), and there was no forward lean while running, so the run read upright and stiff.

### Changes (`enemyMotion.ts`, `enemyRig3d.ts`, `scene3dFull.ts`)

- `crawlerStride` and a stride-locked `gaitStep`: foot travel equals ground speed (`crawlerFootSpeed`, exposed as `footSpeed` telemetry); cadence is 3.4 Hz at the fastest sim speed (6.1 m/s) instead of 6.5 Hz.
- `smoothDisplaySpeed`: about 0.1 s filter on the speed that drives the crawler gait and pose.
- Pose amplitude `0.3 + 0.7 * run`: no pop at start.
- `latchHysteresis` (on above 0.5, off below 0.25 m/s) for rigged biped locomotion; `runLean` adds forward spine lean (stalker up to 0.17 rad, warden 0.06) scaled by speed.
- Yaw turns already capped at 12 rad/s (`stepEnemyYaw`); kept and tested.

### Tests

`tests/r13-enemy-run.test.ts`: crawler skate ratio 0.8..1.25 for 0.5..8 m/s, cadence under 4 Hz, speed filter has no step, no pop at the walk threshold, 180 degree turn takes at least 10 frames, hysteresis does not flap on a trace inside the dead band (a single threshold flips more than 50 times), run lean on the real rig driver, rig foot speed within 25% of ground speed at 5.8 m/s.

### Classic View HUD

`body.classic #warden-hud` and `#minimap-wrap` (plus phase tag, boss bar, minimap label) now use square 2 px borders, flat palette colours, Courier New bold uppercase, no blur or shadow. Computed styles checked in the browser (2px border, no backdrop-filter, no box-shadow, radius 0).

### Browser evidence

Screenshots in `.playwright-mcp/`: `r13-run-before-1.png`, `r13-run-after-1.png`, `r13-run-after-2.png`, `r13-classic-hud.png`. The bestiary showcase did not keep crawlers in the `crawl` clip during sampling, so crawler `footSpeed` telemetry was not observed live; the stride match is verified by the node tests. Visual smoothness of the new gait is unverified by eye on a moving crawler.

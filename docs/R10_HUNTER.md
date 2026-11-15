# R10 Reclaimer: an E.M.M.I.-style hunter zone (track `r10/hunter`)

Original design, no original Abuse assets or data. The Reclaimer is a Metroid Dread E.M.M.I. idea (a patrol unit that cannot be shot, that listens, and that you answer with a timed counter) rebuilt on this project's sim. It reuses the rigged Bio-Stalker GLB (taller, dark steel tint), existing materials and the existing Melee Counter. No new assets, no new lights.

## The zone

`Level3D.hunterZone` (`src/game3d/map3d.ts`), the east wing of Bio-Labs:

| | |
|---|---|
| Volume | x 58.6 to 69.4, y -1.6 to 6.8 (floor y 0, home x 64.2) |
| Contains | Bio-Labs east floor, the low plate (y 2.2) with the Rail-Cannon pedestal `ped-rail` (65.5, 2.2), the upper grate (y 4.4) |
| Gates | `gate-west` (x 58.6, vertical bar) and `gate-hatch` (y 6.8 over the Security hatch). Render only, never solid, so physics and reach routes are unchanged |
| Key item | Rail-Cannon (`keyWeapon` 4) |

The Rail-Cannon is the Dread-style reward at the end of the zone and is mandatory (red door), so the zone is on the main path. The upper grate (4.4 m) is out of claw reach (2.6 m): crossing above is the safe line, taking the Rail from the low plate is the risk.

## Behaviour (`src/game3d/hunter3d.ts`, pure and deterministic)

States: `patrol`, `alert` (28 ticks, red visor, music sting), `chase`, `windup` (the catch), `recover`, `stagger` (visor open), `dead` (disabled). No `Math.random`, no hash; everything is a function of the tick and the player. The unit simulates only while the player is in Bio-Labs.

**Hearing.** Noise only counts while the player is inside the zone volume. `playerNoiseRadius` is a pure function:

| Source | Radius (m) |
|---|---|
| Run (grounded, speed above 5.2 m/s) | 3 + 1.15 x speed (about 13.8 at 9.4) |
| Firing (any weapon event) | 15 |
| Dash | 14 |
| Jump, double jump, wall jump | 8 |
| Standing, sneaking, airborne drift | 0 |
| Anything within 2.8 m horizontally and claw reach | felt regardless |

Sneak: hold Ctrl or Alt. `main.ts` scales `moveX` by 0.45 (`SNEAK_MOVE_SCALE_3D`), 4.2 m/s, below the quiet threshold. The HUD pill shows a noise bar.

**Chase.** Walks to the last heard x at 6.2 m/s (player run 9.4, so it can be outrun). It gives up after 270 silent ticks. A player outside the zone is ignored. After a landed catch or a counter it is deaf for 150 ticks.

**The catch is a counter QTE.** Inside 2.2 m horizontally and claw reach 2.6 m it starts a 40 tick `windup`. The window opens for the last 8 ticks: `HUNTER_WINDOW_TICKS` equals `PARRY_WINDOW_TICKS` (a test pins the equality), so it is the existing Melee Counter timing. The claw pins the player (move, jump and dash input ignored; counter, fire and aim still work), so the counter is the answer.

- Counter in time (`X`/`C`, within `PARRY_REACH` 3.6 m): the Reclaimer staggers 110 ticks with its visor open, is knocked back 1.4 m, the player gets 44 invulnerable ticks and a free dash, events `parry` (value -1) and `hunter_counter`.
- Counter early or late: whiff and the normal 30 tick lockout. The grab lands for 48 damage (after the difficulty multiplier), 70 ticks of invulnerability, 150 ticks of `recover`, then back to patrol.
- Run out of reach before the windup starts (beyond 2.2 m) and nothing happens.

**Immunity.** Pulse, Scatter and the Flamer cone never hurt it. Pulse and Scatter shots spark off the plating (`hunter_ping`, the shot is consumed, so it also shields what stands behind it). Grenade and Rocket detonate on it and the blast ignores it.

**Disabling it permanently** (`hunter_off`, value 0, 1 or 2):

1. Overcharge: a Rail shot at 95% charge or more that hits it (value 2).
2. Visor shot: any Rail shot while it is staggered after a counter (value 1).
3. Exit: leaving the zone volume while the Rail-Cannon is owned (value 0).

An uncharged Rail shot only pings. Re-entering a disabled zone does nothing. A defeat resets a living unit to patrol at home.

## Presentation

- HUD pill `HUNTER ZONE` (QUIET, ALERT, PURSUIT, COUNTER [X], EXPOSED, RECOVERING, DISABLED) with a noise bar. It shows while the player is in Bio-Labs and in or near the zone, and for a few seconds after the unit is disabled.
- Zone colour shift: while alarmed the background and the hemisphere ambient lerp toward red (existing lights only, `hunterTint` smoothed at 4/s) and `body.hunter-alarm` adds a red vignette (CSS). Reduced motion removes the pulse and caps the tint at 70%.
- Red visor: a small emissive bar on the rig (amber quiet, red alarmed, cyan exposed, dark when disabled). The body flashes white during the counter window (shared `parryFlashAmount`), cyan when exposed, pulsing red while hunting. Gates share the visor colour and turn green when the unit is disabled.
- Audio: `stinger.hunter` (tritone sting, ducks the music through the existing `stinger.` rule), `hunter.grab` (rising roar), `hunter.ping`, `hunter.counter`, `hunter.off`. Sound event count 53 to 58 (`tests/audio.test.ts`).
- Render module `src/render3d/hunterView.ts` (about 5 to 8 meshes, 0 lights): rig clone via `instantiateRiggedModel3D('bio-stalker', 2.9)` driven by `EnemyRigDriver` (the unit exposes the rig-compatible fields), skips posing beyond 45 m.
- Death screen cause `hunter` ("Caught by the Reclaimer") with a tip.

## Assists (R8)

| | Story | Normal | Hard |
|---|---|---|---|
| Speed | x0.8 | x1 | x1.1 |
| Hearing range | x0.75 | x1 | x1.1 |
| Catch windup | 56 ticks | 40 | 36 |
| Counter window | 18 ticks | 8 | 8 |
| Stagger | 150 ticks | 110 | 90 |
| Grab damage | 24 (damage x0.5) | 48 | 65 (x1.35) |

Hazard Warning assist lengthens the catch windup by 20% (rounded). Normal is the identity preset. The reduce-motion and 0.8x game speed options need no hunter handling.

## Bot and reach results (observed, `node tools/game/hunter.ts`, `make check`)

`createBot3D` changes: the Rail step now exits the zone west (`zone exit` x 57.2), `hive bio east` and `red door` fire from x 56.0 (outside the zone, 10.5 m from the hive, 13.6 m from the door) instead of x 60.5 and 61, and the bot presses the counter when the hunter's window is open within 3.4 m. The bot is always noisy, wakes the unit with the jump onto the upper grate (first alert at tick 2200), is pinned during the single catch that reaches it on the low plate, counters it, takes the Rail and leaves the zone (disabled by exit).

| | Before (R9) | After (Normal) | Story | Hard |
|---|---|---|---|---|
| Result | won | **won** | won | won |
| Ticks | 5362 | **5533** | 5602 | 5927 |
| Final HP | 112/160 | **95/160** | 146 | 77 |
| Min HP | 86 | **86** | 93 | 77 |
| Kills | 56 | **57** | 57 | 62 |
| Deaths | 0 | **0** | 0 | 0 |
| Hunter | none | 1 alert, 1 grab, 1 counter, 0 catches | same | same |
| Completion | 43% | 39% | | |

- Hard before R10 was won at 5121 ticks and HP 73. The change moves the Warden fight start, and the Hard bot is timing sensitive: with red-door x 57.4 or 57.0 it lost in the Warden or escape rubble, x 56.0 wins. This is the same chaotic sensitivity noted in R8, not a hunter effect.
- Completion fell from 43% to 39% because the Core data log (87.5, 2.4) was picked up by chance in the old Warden fight and no longer is. The assertion in the difficulty test is now at least 35.
- Pinned numbers updated in `tests/assist.test.ts` (5533, HP 95) and the showcase reel ticks in `src/ui/demo.ts` (meltdown cut 4800 to 5050, final cut 5280 to 5470; sector windows: biolabs 4964 to 5131, airlock from 5448).
- `reach3d`: unchanged, PASS, 52 waypoints 3432 ticks (57.2 s). The reach routes are physics only and the zone gates are not solid. The geometry facts the hunter relies on are pinned in `tests/hunter.test.ts` (the upper grate top is above claw reach, the low plate and the Rail pedestal are inside it).
- Reckless probe (`tools/game/difficulty.ts`): unchanged, Normal 245 HP / 2 deaths.
- Sealed files untouched. `w.light` is not read by the hunter code (the R3.3 scan test passes).

## Tests (`tests/hunter.test.ts`, 33 tests, `make check` 493/493)

Zone placement and claw geometry, determinism over 2400 ticks, source has no `Math.random` or headlamp read, patrol bounds, noise model, run alerts and chases while standing and sneaking do not, single sting per alert, felt at close range, lose-and-return, immunity (Pulse, Scatter, Grenade, Rocket), shot shielding, window length equals the Melee Counter window, counter, early counter, unanswered catch, pin, out-of-reach, Overcharge, visor shot, exit disable, out-of-sector freeze, Story and assist numbers, Normal sim identity, HUD labels, sound mapping, render view (no lights, at most 12 meshes), look colours, draw budget allowance, full bot run.

Also the two R9 review items: stalker parry (window length, counter, no damage through the stagger, unanswered lunge hurts) and "a staggered crawler or stalker deals no contact damage during its stagger".

## Draw calls

The estimator (`src/render3d/drawBudget.ts`) covers decor, solids, vista, hazards and a fixed actor allowance of 70. The hunter adds at most about 8 meshes (rig and visor and 2 gates), inside that allowance (test: under a quarter of it). Bio-Labs worst case stays at or under 300 (`tests/draw-budget.test.ts` passes). Real browser counts: unverified.

## Unverified (Chrome cannot run here)

- How the rig, tint and visor bar look in the browser (the visor sits at a fixed 86% of body height, not tied to the head bone), the red zone shift and vignette, gate bar look, the HUD pill and noise bar.
- Audio feel of the sting, roar, ping and off recipes.
- Human feel: the 8 tick window, the 40 tick windup, the pin, the sneak key (Ctrl or Alt, and Ctrl may be claimed by the OS or browser), noise radii, claw reach against the low plate, whether the zone is fair at 160 HP.
- Gamepad analog sneak is not wired (the sim supports analog `moveX`).
- Real draw call count with the hunter on screen.

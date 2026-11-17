# R6 Sound (track C: audio finish)

All sound is still WebAudio procedural synthesis (no sampled files). **Listening checks are unverified.** Only pure logic and recipe numbers are covered by `tests/audio.test.ts` (now 46 tests).

## Dedicated recipes (replace the borrowed round 3-5 sounds)
| Event (value) | Recipe id | Character |
|---|---|---|
| `enemy_drop` | `enemy.drop_land` | ceiling ambush: heavy thud and skitter |
| `hive_spawn` | `enemy.hive_spawn` | wet pop |
| `hive_destroyed` | `enemy.hive_burst` | sawtooth boom with a squelch |
| `hazard_vent` 0 / 1 | `hazard.vent_warn` / `hazard.vent_burst` | rising hiss and pressure tone / hard steam burst |
| `hazard_crush` 0 / 1 | `hazard.crush_warn` / `hazard.crush_slam` | hydraulic whine and latch tick / metal slam with ring |
| `laser_on` / `laser_off` | `hazard.laser_on` / `hazard.laser_off` | zap into electric hum / falling whine |
| `barrel_explode` | `hazard.barrel` | double blast, secondary 0.16 s later |
| `switch_on` | `hazard.switch` | mechanical latch click-clack and a confirm tone |
| `elevator_start` / `elevator_stop` | `hazard.elevator_start` / `hazard.elevator_stop` | motor spool-up and clunk / wind-down, clunk, ding |
| `collapse` 0 / 1,2 | `hazard.collapse_creak` / `hazard.collapse_crash` | metal groans / falling slab and debris |
| `slide` | `move.slide` | friction scrape |
| `block_break` 0 / 1 | `world.block_break` (pitch 0.85 / 1.25) | concrete and metal burst; rail plates ring higher |
| `map_reveal` | `world.map_reveal` | data-download pentatonic run and chime |
| `seal_warn` 0-4 | `escape.seal_warn` (pitch +6 % per bulkhead); value 4 also plays `escape.seal_final` via `extraCueForEvent` | two-tone siren with vowel-like formant sweeps / rising final-hatch siren on top |
| `seal_close` | `escape.seal_close` | heavy hatch slam, ring and two bolt thunks |

`world.upgrade` (the `upgrade` event) is now a short grab impact and ping. The melody comes from the fanfare below.
New helper recipe: `world.countdown` (beep each second in the last 10 s).

## Item fanfares (2-3 s)
`fanfare.boots`, `fanfare.tank`, `fanfare.slide`, `fanfare.ammo`, `fanfare.weapon`. Each opens with a phrase that finishes inside the 0.85 s item freeze, then resolves into a held chord. They have priority 10 (never stolen) and duck the music to 22 % for about 80 % of their length.
`playFanfare(kind)` in `audio.ts` takes an upgrade kind or `'weapon'`; `fanfareFor(kind)` in `audioLogic.ts` is the pure mapping.

**main.ts edits (2 places, minimal):** `observeWorld()` upgrade branch now calls `showPickupBanner(UPGRADE_BANNER[kind], playFanfare(kind))` instead of the `setTimeout(ui.rank)` stinger; the weapon-unlock branch calls `showPickupBanner(WEAPON_BANNER[s], playFanfare('weapon'))`. `showPickupBanner` gained a `quiet` flag that skips `ui.banner` when a fanfare plays. Import line 25 adds `playFanfare`. Track D should keep these three spots when merging.

## Proximity loops (distance, pan, lowpass)
`audio.ts` `setLoops(targets)` keeps persistent node sets per key (steam vent: band noise and 62 Hz hum; laser grid: detuned saws and crackle; lift motor: saw drone, rumble, pitch follows speed). Loops fade out and are freed when they leave the list. `audioDirector.ts` `loopSources(w)` builds sources from the current sector only (hazards of kind vent or laser that are switched on, moving elevators) and `planLoops` (pure) applies attenuation, pan, lowpass and keeps the nearest 4. Leaving a sector, `reset()`, or leaving play clears them. Levels: vent 0.15 idle / 0.6 warning / 1 firing; laser 0.3 charging / 1 live; lift 1 rising, 0.8 and 1.6x pitch on the empty return.

## Escape music
- `escapeMusic(meltdownTicks)` (called every step by the director). Stage 0-5 = bulkhead warnings fired (thresholds match `ESCAPE_BEATS_3D`, tested).
- Stage layers: 0 pad/bass/kick/perc; 1 + hat, arp; 2 + snare; 3 + lead; 4 and 5 full. A crash and tom accent marks each stage change.
- Tempo: +2.5 % per stage, then up to +20 % more across the last 10 s (max about 221 bpm). Delay time follows the tempo.
- Key lift: +1 semitone from the airlock seal (stage 4), +2 at the final hatch (stage 5). Stage 5 also adds a riser every bar.
- Alarm: pulse every 45 ticks, 36 once 28 s or less remain, then 24 down to 10 ticks across the last 10 s, pitch up to x1.5. A countdown beep each second in the last 10 s.

## Mix checks (pure, in tests)
`recipePeak`, `recipeEnergy`, `recipeDuration` in `soundBank.ts`; `mixLevel`, `toDb` in `audioLogic.ts`.
- every new recipe peak < 0.6 (fanfares < 0.9), energy within 1/20 to 20x the median of the old bank; fanfares 0.4-2.5x `stinger.win`;
- barrel, crush slam, collapse, seal close, hive burst, rocket explosion are no louder than `world.explosion` (peak +10 %);
- worst-case pile-up of six heavy effects < 9 dB at the glue compressor input, three heavy new hits < 3 dB;
- alarm recipe throttle (0.12 s) is below the fastest pulse (10 ticks).

## Weapon track wiring (done at integration)
| Event | Recipe id |
|---|---|
| `flamer` (value 1 ignition, 0 sustain tick) | `weapon.flamer_loop` |
| `rocket` | `weapon.rocket` |
| `explosion` with value 1 (rocket detonation, set in `triggerExplosion3D` when `byWeapon === 6`) | `weapon.rocket_explode` |
| `burn` | `enemy.burn` |
| `rocket_jump` | `player.rocket_jump` |

`PENDING_EVENT_SOUND` was removed; the ids live in `EVENT_SOUND` and `cueForEvent`.

## Checking by ear (unverified)
In the browser console after one click or key press:
- `__reanimatorAudio.play('hazard.barrel')`, `.play('fanfare.boots')`, `.play('escape.seal_final')`, `.play('weapon.rocket_explode')` and any id from the tables above.
- `__reanimatorAudio.playFanfare('energy_tank')` plays the item jingle by kind.
- `__reanimatorAudio.bgm(true,'meltdown')` then `.escapeMusic(4800)`, `.escapeMusic(1680)`, `.escapeMusic(500)`, `.escapeMusic(60)` to hear each stage and the final dash.
- `__reanimatorAudio.setLoops([{key:'t',kind:'laser',gain:1,pan:0,lp:20000,rate:1}])` starts a hum; `setLoops([])` clears it. `__reanimatorAudio().loops` lists active loops and `.escape` the stage.

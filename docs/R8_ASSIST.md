# R8 assist: difficulty presets, assist options, death causes (track C, branch `r8/assist`)

All mechanics are newly designed. Browser behaviour below is **unverified** (no browser run in this track); simulation behaviour is covered by `tests/assist.test.ts`.

## Difficulty

`newWorld3D({ difficulty, assist })`. Normal is the identity preset: every multiplier is exactly 1 and every branch is skipped, so the default sim is unchanged (bot Normal: won, 5362 ticks, HP 112/160, 0 deaths, same as before; reckless Normal 245 HP / 2 deaths, same as before).

| | Story | Normal | Hard |
|---|---|---|---|
| Damage taken (all sources, min 1) | x0.5 | x1 | x1.35 |
| Enemy and nest HP | x0.8 | x1 | x1 |
| Enemy tempo (move speed, attack cadence; windups unchanged) | x1 | x1 | x1.1 |
| Healing (med pickups, combo heal) | x1 | x1 | x0.6 |
| Drops | every kill drops ammo or med, bigger packs (ammo 14, med 24, hive 20) | existing | existing |
| Checkpoint | rolling safe spot (sector entry, then every 3 s when grounded, calm, outside hazard columns and acid) | last Save station | last Save station |
| Death | respawn at that safe spot, always resumable | Save station | Save station |

Pinned numbers (3600-tick reckless probe `node tools/game/difficulty.ts`, bot = `createBot3D` full run):

| | HP lost | deaths | kills | endX | bot result |
|---|---|---|---|---|---|
| Story | 94 | 0 | 2 | 41.18 | won 5123 ticks, HP 146/160, 0 deaths, min HP 93 |
| Normal | 245 | 2 | 4 | 41.18 | won 5362 ticks, HP 112/160, 0 deaths, min HP 86 |
| Hard | 306 | 3 | 5 | 41.18 | won 5121 ticks, HP 73/160, 0 deaths, min HP 73 |

## Why the reckless policy stalls at x 41.18

`x 41.6..42.4` is the east wall of the Central Shaft. At y 0..3.6 it holds `door_shaft_biolabs`, a yellow door that is the **Cracked Bio-Wall** (opens only to a Grenade). The reckless policy holds "run east + fire Pulse", never owns the Grenade (it sits behind the green door), so it walks into a locked wall inside the shaft. That spot is also where the shaft Stalker (`e-shaft-2`, x 40.7) and the ceiling climber (`e-climb-shaft`, x 41.1) converge, so the policy stands still in melee range and bleeds HP. Death is the damage race, not level density: the stall is a progression gate, which is intended. Normal balance is untouched; Story halves the damage and respawns beside the shaft, giving 0 deaths. Browser reading (unverified): a human walking into that wall sees the gate hint from the door lock; if play-testing shows people lingering there, the cheapest fix is a clearer "needs Grenade" prompt rather than rebalancing the Stalker.

## Assist options (each a toggle, persisted)

| Option | Where | Behaviour |
|---|---|---|
| Aim assist | input layer, `assistAim` in `src/game3d/assist.ts` | Aim point within 2.6 m of a live enemy centre (nearest wins, ties by roster order, range 22 m) is pulled toward it, 70% at the centre fading to 0 at the edge. Open-air aim stays exact. The sim never sees it, it only receives the adjusted `aimX/aimY`. |
| Auto-fire hold | input layer, `stepAutoFire` | A fresh LMB press toggles a latch; the shot keeps firing after release; the next press turns it off. Pause or toggling the option off clears it. |
| Game speed 0.8x | display clock | `acc += dt * clock * 0.8`. The 60 Hz sim tick, SIM_HZ and all tick counts are unchanged. |
| Hazard warning | sim (`w.assist.hazardWarn`) | Telegraph length +20% (rounded). The period grows by the same amount so the idle gap, active and recover lengths are unchanged. Done as a pure clock warp in `hazardTickAt3D`, so `hazardNowTick3D` consumers (sim, renderer, audio) agree and the shared immutable `Level3D` is never mutated. Toggles live via `setAssist3D`. |

## Death causes

`w.deathCause = { key, label, tip }` is set when HP reaches 0 (or the Meltdown clock ends). `w.lastHurt` tracks the last source. Keys and copy live in `DEATH_CAUSES_3D`:
`crusher` Crushed by piston, `laser`, `vent`, `rubble`, `acid`, `stalker`, `crawler`, `spitter`, `spit`, `warden`, `plasma`, `shockwave`, `explosion`, `meltdown`, `unknown`. The result screen shows the label in `#result-cause` and the tip in `#result-tip`. A cause persists after respawn (last defeat).

## Other changes

- `freshWorld(options)` in `attract.ts` forwards the options (attract and showcase still use Normal).
- Story makes a defeat always resumable (`canResumeNow`), so "Resume at Save (C)" works without a Save station.
- `tools/game/difficulty.ts [ticks] [story|normal|hard]` prints all three presets by default.
- Telemetry: `__reanimator()` returns `difficulty`, `assist: {aim, autoFire, slow, hazardWarn}`, `deathCause` (key or null).

## DOM ids

Title settings: `difficulty` (select), `difficulty-note`, `assist-aim`, `assist-autofire`, `assist-slow`, `assist-hazard`. Pause mirrors: `assist-aim-p`, `assist-autofire-p`, `assist-slow-p`, `assist-hazard-p`. Result: `result-cause`. localStorage: `reanimator.difficulty.v1`, `reanimator.assist.v1` (JSON). Difficulty applies when a run starts; assists apply live.

## Reproduce

1. `make check` (tsc, 397 tests incl. `tests/assist.test.ts` x17, reference-verify, reach, reach3d, build, dist-guard): exit 0.
2. `node tools/game/difficulty.ts` prints the three reckless rows above.
3. Browser (unverified): `make dev`, Title > Settings, set Difficulty Story, tick the assists, Back, Play. `__reanimator().difficulty` is `"story"`. Walk into the shaft crusher or acid to see "Crushed by piston" / "Dissolved in acid" and the tip on the result screen.

## Tests

`tests/assist.test.ts`: Normal identity and pinned bot result, reckless on Normal unchanged, Story reckless deaths <= 1, Hard bot won with min HP >= 40, determinism per preset, preset scaling (damage 10/20/27 for a 20 hit, HP, drops), Story checkpoint respawn, death-cause mapping (crusher, vent, acid, spit, plasma, stalker, copy table), hazard warning phase lengths and immutability, aim magnet, auto-fire latch, display clock, preference parsing.

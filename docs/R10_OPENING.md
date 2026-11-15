# R10 Opening set piece (Cryo Airlock)

Branch `r10/opening`. A 9.8 s cinematic over the live airlock replaces the plain first-run intro. It plays on the first run and on EXTRAS > Watch intro. Automation (`navigator.webdriver`) still skips it.

## Beats (seconds, `src/ui/opening.ts` `OPENING_BEATS`)

| t | Beat |
|---|---|
| 0.3 | Pod hiss (`opening.hiss`). Black cover, frost on the pod glass, eyelids open (existing CSS lids) |
| 1.4 to 5.6 | Camera starts close and low, looking up out of the pod, and dollies out to the normal frame |
| 2.2 to 3.7 | Headlamp stutters on (fixed flicker table), room dims and brightens with the lamp |
| 4.2 | Alarm sweep: the existing alarm light orbits the bay, red sweep band and vignette, `world.alarm` pulses |
| 7.2 | Vent 4 rattles: small camera shake, `opening.rattle` |
| 8.4 | Vent blows out at (12, 3.1): sparks, dust, ring, shake, flash, `opening.burst`. The crawler `e-airlock-1` becomes visible and drops in |
| 9.0 / 9.8 | SHOOT IT prompt (coach, MOUSE LMB) / control handed over, sim starts |

A status readout (bottom-left) narrates each beat. Skip: any key, pointer press, or the Skip button.

## Design rules kept

- Display side only. The simulation is not stepped while the opening plays, so tick 0 of a run is identical with or without it. No spawn, no sim state change. The crawler is the existing map enemy `e-airlock-1`; the renderer only hides it until the burst (`scene3d.opening.hideEnemyIds`).
- Reduce flashing: no strobe (one slow lamp ramp), no sweep (steady half-strength red), no shake, no burst flash, backdrop blur off.
- No new lights (reuses the alarm light, headlamp and ambient), no new meshes, so draw calls are unchanged.
- No random source in the timeline. Skipping before the burst never reveals a half-played beat (the crawler is simply visible).
- Showcase hook: `__reanimatorShowcase('opening' | 'opening-wake' | 'opening-alarm')` freezes the piece at 8.7 / 3.0 / 5.6 s.

## Files

`src/ui/opening.ts` (timeline, clock, view), `src/ui/main.ts` (clock tick, sim hold, cues, prompt, showcase), `src/render3d/scene3dFull.ts` (`opening` view: lamp, alarm, camera, hidden enemy), `src/render3d/fx3d.ts` (`ventBurst`), `src/ui/soundBank.ts` (4 recipes), `index.html` + `src/ui/style.css` (overlay layers), `src/ui/demo.ts` (3 scenes), `tests/opening.test.ts` (7 tests).

## Verified

- `make check` exit 0: tsc, 467/467 node tests (460 + 7 new), reference-verify, reach, reach3d 52 waypoints 3432 ticks, vite build, dist-guard PASS (13 files).
- Bot still wins 5362 ticks (HP 112/160, 56 kills): no pinned number changed.
- Timeline tests: beat order, dark start, frost clears, stutter count, reduce-mode monotonic lamp, burst edge fires once, skip behavior, no random or sim imports in `opening.ts`.

## Unverified (needs a browser; Chrome cannot run in this sandbox)

- How the frost, alarm sweep, flash and status readout look and read against the live scene; text overlap with the intro lines (delays 0.7/2.4/4.2/6.0 s).
- Camera dolly and lift framing at 0.55x distance, and that the crawler is hidden and then visible at the vent position (x 12) within the frame.
- Audio feel of the four new sound recipes and the alarm pulse.
- Frame time during the opening (backdrop-filter blur on the frost layer) and the `rendererMode` smoke.
- Reduce flashing look in a real browser; `__reanimatorShowcase('opening')` captures.

## Fix pass (post-merge browser check)
- Root cause of the "black opening": the eyelid (`.lid`) and caption CSS animations run on wall time from `showIntro()`. The showcase hold (`opening-wake|alarm|opening`) set the clock to 3.0/5.6/8.7 s but the lids were still closed, so only the status line was visible. The renderer, lamp and camera were fine (rendered live in Chromium at 1200x843). Fix: the showcase seeks the lid and line animations to the held time (negative `animation-delay`), and `showIntro()` clears that delay.
- `__reanimatorUiAudit()` now ends the opening first and returns `reason` when `ok` is false without a failing control (`auditReport` in `ui/uiAudit.ts`).

## R11 cinematic pass
- HUD and minimap (`#hud`, `#minimap-wrap`, `#classic-hud`, `#coach`) stay hidden under `body.opening-on` and fade in (0.9 s CSS transition, 0.01 s with Reduce flashing) when `hideIntro()` runs. Every exit goes through `hideIntro()`: finish at 9.8 s, skip (any key, button), showcase exit, `__reanimatorUiAudit()` (which also adds `opening-snap` so measuring is not mid-fade).
- Letterbox bars (`.op-bar`, 11% each) are in during the opening and retract from 8.9 s to the handoff (`--op-bars`).
- Wake pose: `OpeningState.wake` (1 kneeling, 0 standing, rising 2.0 to 5.0 s; to 3.2 s with Reduce flashing). `scene3dFull` blends `WAKE_POSE` (thigh, knee, lean, headPitch, hipsDrop via `legDrop`, rifle lowered) into the hero's display offsets only. No new rig channels, sim untouched.
- Title card `CRYO AIRLOCK — 03:12 AFTER BREACH` (`#op-title`, 3.9 to 7.4 s, opacity only).
- Tests: 4 new in `tests/opening.test.ts` (wake monotone and reduced, bars/title/HUD timing, HUD restore on every exit path, display-only). Visuals unverified (headless Chrome cannot launch here): kneel look, hip drop clipping the floor, title card overlap with the status line.

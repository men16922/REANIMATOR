# R16 UI pass: transient data log, retro UI, calmer intro

Display-side only. No simulation change; bot pins in `tests/assist.test.ts` unchanged.

## DATA LOG
- Pickup no longer freezes the game (`LOG_FREEZE_S` removed) and no longer opens the modal reader.
- A toast (`#log-toast`, `pointer-events: none`, no focus, no input capture) shows title + excerpt (<= 110 chars) for 3.2 s, then fades over 0.8 s (`src/ui/logReader.ts`: `openToast`, `tickToast`, `toastOpacity`).
- Full text stays in the pause-menu LOGS archive (modal reader is fine there: the game is paused).
- The objective line fades out 6 s after its text last changed (`#objective.idle`).
- Debug: `__reanimatorShowLog(id, 'toast')`.

## Retro UI (CSS only, `src/ui/style.css`)
- Monospace pixel-style type (`Press Start 2P`/`Silkscreen` if installed, else system monospace, no smoothing), square 2px frames with hard drop shadow, segmented bars.
- CRT scanlines + light vignette on `#stage::after` (opacity 0.16, 0.08 with Reduce flashing or `prefers-reduced-motion`). No WebGL cost, no new lights or draw calls.

## Intro (`src/ui/opening.ts`)
- Timeline lengthened to 12.9 s. Status captions now come one at a time, each held at least 2.5 s (`CAPTION_MIN_HOLD_S`). The old 0.5 s "HEADLAMP ONLINE" caption was removed.
- Red alarm capped at `ALARM_MAX = 0.5` with a slow single pulse. Sweep slowed from 2.6 to 1.1 rad/s, alarm light pulse slowed from 7 to 2.2 rad/s, burst flash dimmed to 0.45 over 0.6 s, camera rattle halved. CSS alarm gradient alphas lowered from 0.34/0.45 to 0.2/0.3.
- Intro story lines respaced: 0.7 / 3.4 / 6.1 / 8.8 s.

## Verification
- `make check` exit 0 (657/657 tests, reach3d 52 waypoints / 3432 ticks, dist-guard PASS).
- Playwright MCP on the dev server, 0 console errors. Screenshots are in `docs/evidence/r16_ui/`.

## Open finding (existing bug, not fixed here)
In this browser, the airlock 3D scene renders mostly black at the run start (x around 3.5 to 8.6). The HUD and DOM render normally, and Bio-Labs renders normally. Most of the canvas stays black even with the headlamp on, apart from a strip on the right. The same thing happens on HEAD `c40d5d6` with these changes stashed. On HEAD, the dark frame plus the stronger red alarm looks like the "dark red overlay hiding the game view" that was reported. Suspected cause: R15 terrain kit or culling in the airlock. Not diagnosed.

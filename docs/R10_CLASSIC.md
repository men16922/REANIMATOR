# R10 Classic View audit and CRT toggle

Scope: R9/R4 elements under the Classic (1996) view. No sim changes (bot 5362 ticks, reach3d 52 waypoints 3432 ticks unchanged). No new lights. Palette and pixel font stay original designs.

## Audit

| Element | Classic path before | Finding | Change |
|---|---|---|---|
| Scan frames and rings (metroid3d) | additive cyan, 0.9 alpha fade, 8 rad/s scale pulse | soft fade dithers to grey; pulse jitters in pixels | `classicFxOpacity` hard steps (0, 0.55, 1), pulse off in Classic |
| Cracked-wall seams | emissive breathing 0.45..0.65 | breathing shimmers through dither | flat 0.55 in Classic (`classicSeamEmissive`) |
| Fake wall (Vault Nook) shimmer | faint 0.1..0.17 emissive | already faint and gated by reduce | unchanged |
| Parry flash (enemy) | `parryFlashAmount(.., reduce)` | gated; palette pass handles it | unchanged |
| COUNTER popup, damage digits | instanced glyph layer in scene | passes through palette quantize | unchanged, unverified in browser |
| SCAN pill, other `.pill`, banners, coach | rounded, glow, mono UI font | soft look clashes with pixel HUD | `body.classic` CSS: square borders, 2 px, flat palette colours, no shadow glow |
| Meltdown pill | pulsing box-shadow | strobe in Classic | animation off in Classic CSS (also off under reduce-fx) |
| Meltdown alarm light intensity | 8.5 rad/s swing ignored reduce setting | gap | `gateStrobe` holds steady under reduce |
| Lasers, steam, crushers | `classicK` 0.45 intensity (R4) | already scaled | unchanged |
| Pickup magnet FX, decor sparks | gated by `reduceMotion` | ok | unchanged |
| Classic HUD strip | static canvas, no blink | ok | none |
| DOM damage flash | hidden by reduce | Classic already shows palette hurt flash | hidden in Classic CSS |
| View toggle | 0.4 s mosaic, instant under reduce | requested CRT look | CRT collapse, see below |

## Toggle transition

`PixelTransition` now draws a CRT power-off/on: the picture squashes to one scanline by t = 0.5 (whole-scanline steps, 200 rows), a hard white line appears, the mode switches at the midpoint, and the "1996"/"2026" label shows on the line before the picture opens. Total 0.4 s. Pure curve: `crtFrame` in `classicLogic.ts`. `transitionPlan(reduceFlash)` returns `animate: false` and `toggleView` switches instantly. The old `transitionFrame` stays for compatibility.

## Reduce-flashing sweep

Checked: parry blink, scan pulse (now off in Classic, gated otherwise), meltdown sparks and siren (gated), meltdown alarm light (fixed), hit flashes, DOM damage flash and `#hud.hit`, transition (instant), classic HUD (no blink). Tests: `tests/r10-classic.test.ts`.

## Unverified (no Chrome available here)

- CRT collapse visuals, label legibility and timing in a real browser.
- Scan frames and rings legibility after quantize and dither in Classic.
- Cracked-wall seam readability at flat 0.55 emissive.
- DOM pill look at several viewport sizes under `body.classic`.
- Parry flash and COUNTER popup colours after palette snap.

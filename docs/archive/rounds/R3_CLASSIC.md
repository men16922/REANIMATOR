# R3 Classic View (1996 look)

Toggle between the modern renderer ("2026") and a 320x200 palette-dithered orthographic look ("1996") at any time.

## How to use

- Press **V** (title, play, pause). A 0.4 s mosaic transition shows a "1996" or "2026" label. Reduce-flashing mode switches instantly.
- Title > SETTINGS has `View: Modern / Classic 1996` and `CRT: On/Off`. Both persist in localStorage (`reanimator.viewMode.v1`, `reanimator.crt.v1`).
- Debug: `window.__reanimator().viewMode` (`'modern' | 'classic'`), `.crt`; `window.__reanimatorSetView('classic' | 'modern')` switches immediately without the transition.

## What changes in Classic

| Part | Behaviour | Code |
| --- | --- | --- |
| Render path | Scene renders into a reused 320x200 target (height always 200, width follows aspect). A palette pass applies ACES, 4x4 Bayer dither and nearest-colour matching against 256 colours. A blit pass upscales with nearest filtering at an integer scale, centred with black bars when the buffer is not an exact multiple. Targets are rebuilt only when the drawing buffer size changes. | `src/render3d/classicView.ts` |
| Camera | Orthographic side view that copies the perspective camera pose (shake, look-ahead, intro push-in as zoom). Aim raycasts use the active camera and remap NDC through the letterbox. | `scene3dFull.ts` (`setViewMode`, `syncOrtho`) |
| Post | Bloom and the `fx3dGfx` grade pass (chroma, grain, vignette) are bypassed. Damage flash and the low-HP red tint are re-applied in the palette pass. | `scene3dFull.ts` render end |
| CRT (optional) | Mild barrel distortion, scanlines per source row, RGB shadow mask, corner vignette. | `BLIT_FRAG` |
| HUD | A 320x24 pixel status strip (HP number and segment bar, Energy Tanks, four weapon slots with icons and ammo, kills, sector). The DOM HP, kills, tank pills, weapon bar and hint line are hidden under `body.classic`; objective, meltdown, boss bar and minimap stay. | `src/ui/classicHud.ts`, `style.css` |
| Cursor | 16x16 pixel crosshair as an SVG data URI in `body.classic #screen`. | `style.css` |

Classic is cheaper than Modern: no bloom mip chain, no post pass, and all shading happens on 64,000 pixels instead of 1.2 to 2.3 million.

## Original design, no Abuse data

- **Palette**: 16 hue ramps x 16 shades, defined by three anchors per ramp (dark, mid, light) and linear interpolation in `buildPalette()`. Rust, olive, toxic green, steel and amber lean toward a 1990s DOS shooter mood. No palette file, sprite or colour table from Abuse was read, converted or copied.
- **Pixel font**: 5x7 glyphs drawn by hand as strings in `src/ui/pixelFont.ts`. Weapon icons are 7x7 hand drawn.
- **Dither**: standard 4x4 Bayer matrix (public-domain technique).
- `dist-guard` still has to pass: no original file reaches `dist/`.

## Estimated values (not measured from the original)

- Visible height `CLASSIC_VIEW_HEIGHT_UNITS = 9.2` world units (about five 1.8 m characters in 200 px). This is an estimate for the "flat 2D feel" and is not taken from Abuse.
- Dither spread 0.07 and CRT constants were chosen by eye reasoning, not tuned in a browser.

## Verification status

- Observed: `make check` (see PROGRESS_LOG entry), `tests/classic.test.ts` (palette, dither, quantiser, integer layout, aim remap, transition curve, preference parsing, font, HUD helpers).
- **Unverified (no Chrome here)**: the GLSL passes compiling, actual brightness and look of the palette pass (exposure `uExposure = 1.0` may need tuning), transition overlay timing, CRT look, crosshair cursor, HUD strip alignment, fps.

### Browser check procedure

1. `npm run dev`, open the page, watch the browser console for shader compile errors.
2. Press **V** in the title: mosaic, "1996" label, then the 320x200 dithered look. Press **V** again for "2026".
3. Start a run. Confirm the bottom strip updates (HP, active weapon slot, ammo, kills). Confirm the crosshair cursor and that aiming hits where the cursor points.
4. Toggle `CRT` in SETTINGS. Check scanlines and curvature.
5. Console: `__reanimator().viewMode`, `__reanimatorSetView('classic')`, `__reanimator().crt`.
6. Compare fps in both modes (`__reanimator().fps` if exposed, or devtools Performance). Classic should not be slower.
7. Resize or change zoom: the picture must stay integer scaled and centred.

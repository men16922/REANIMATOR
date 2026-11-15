# R13 Judge Reel

A 90-second auto-playing reel of live in-engine cuts with lower-third captions. No video files: every cut runs the real sim or the real Restoration Lab.

## Launch

- `Extras` > `Judge Reel`
- `/?reel` URL parameter (waits for models, then plays)
- `__reanimatorReel()` in the console

Esc, any key or a click returns to the title and restores the previous view mode.

## Cuts

| Time | Cut | What it shows |
| --- | --- | --- |
| 0-12 s | hook | Restoration Lab PASS (S1, 11 fields), then the demo mutation FAIL alarm |
| 12-22 s | classic | 2026 view, then 1996 Classic View with the CRT collapse, then back |
| 22-32 s | wake | The opening wake and vent burst on the airlock world |
| 32-46 s | combat | Scan Pulse, a Counter on a Crawler, Pulse, Scattergun, Grenade |
| 46-58 s | hunter | Run into the Reclaimer zone, Counter its grab |
| 58-70 s | warden | Counter on the Warden charge, exposed window, phase III |
| 70-82 s | meltdown | Escape run toward the hatch |
| 82-90 s | endcard | Title, "Built with Kiro · spec-driven", feature bullets, repo |

The timeline is pure data in `src/ui/reel.ts`. The runtime is `src/ui/reelPlayer.ts`: `ReelRunner` (clock, cut and beat events), `ReelWorldDriver` (scripted 60 Hz sim from a fresh deterministic world, then idle), and a DOM host. `main.ts` only registers callbacks.

## Determinism and sim rules

World cuts use `applyDebugSetup` plus fixed input frames. No `Math.random`, no sim rule changes. `tests/r13-reel.test.ts` steps each script and asserts that the combat and hunter cuts produce a real `parry`, the Warden cut produces `boss_counter` and reaches phase III, every cut survives its full duration in its declared sector, and two runs end in identical states. Cuts use `hp: 999` so no cut ends on a death screen.

## Reduce flashing

The CRT collapse is skipped (the view switches in place), every cut fades in over 0.6 s instead of a hard cut, the opening uses its reduced timeline, and the lab alarm animation is off.

## Verified

Headless Chrome against a dev server: `?reel` ran every cut in order, ended on the end card and returned to the title at about 86 s; Esc mid-reel returned to the title with the Classic View restored and the lab, end card and caption hidden. Screenshots of cuts other than the lab were not reviewed.

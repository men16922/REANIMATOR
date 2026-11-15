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

## Post-R13 fix

Reported: after `__reanimatorReel()` the Restoration Lab stayed on screen over the combat cut, and the reel was back at the title by 50 s.

A clean run in the Playwright MCP browser before the fix already played every cut in order and returned to the title at about 92 s, so the report was not reproduced exactly. The fixes below remove every path found that produces the reported symptoms (`src/ui/reelPlayer.ts`, `src/ui/main.ts`):
- The DOM host remembered "lab open" in a private flag. Anything else that hid or showed `#lab` (`show()`, `closeSubPanels`, `labCtl` itself) could leave the flag wrong, so the close at the end of the hook cut was skipped and the panel stayed over the world cuts. The host now reads `#lab` itself, and `ReelPlayer.frame` re-asserts every frame that the lab is open exactly during the lab cut.
- The reel clock used the gameplay `dt` (clamped to 0.1 s) and the scripted world stepped at most 6 ticks per frame, so on a slow or throttled frame rate the world fell behind the clock and cuts no longer matched their captions. The reel now takes real time up to 0.5 s per frame and the world catches up to 30 ticks per frame.
- If something left the showcase mode from outside (a debug hook, a menu), the player stayed `active` with no frames. It now stops whenever the mode is no longer `showcase`, and `exitShowcase` always stops it.
- The lab mutation box stayed checked after the reel, so a later Lab visit opened on FAIL. Closing the lab from the reel now clears it.

`tests/r13-reel-player.test.ts` drives `ReelPlayer` against a fake host at 60, 10 and 4 fps: every cut in order, lab only in the hook, end card only last, finish at 90 s, outside lab hide/show corrected on the next frame, `stop()` tears everything down, the world catches up after a 0.5 s frame.

Playwright MCP browser, 1280x800, `__reanimatorReel()` called from a playing world, sampled every 2 s (mode, `#lab` visible, `#reel-end` visible, caption, lab case state):

| t (s) | mode | lab | end card | caption | lab case |
| --- | --- | --- | --- | --- | --- |
| 2-4 | showcase | yes | | 1996 DOS physics, verified frame-exact | PASS |
| 6-10 | showcase | yes | | 1996 DOS physics, verified frame-exact | FAIL (mutation) |
| 12-20 | showcase | | | 1996 and 2026, same moment | |
| 22-30 | showcase | | | Cryo wake, vent burst | |
| 32-44 | showcase | | | Parry, scan, then weapons | |
| 46-56 | showcase | | | The Reclaimer hunts by sound | |
| 58-68 | showcase | | | Core Warden: counter and phases | |
| 70-80 | showcase | | | Meltdown: reach the hatch | |
| 82-88 | showcase | | yes | REANIMATOR | |
| 90-96 | title | | | | |

That run predates the mutation-clear fix (the lab case still read FAIL after the reel); the fix is covered by code review only and was not re-run in the browser. Mid-cut screenshots of each world cut were not reviewed in this pass.

## Verified

Headless Chrome against a dev server: `?reel` ran every cut in order, ended on the end card and returned to the title at about 86 s; Esc mid-reel returned to the title with the Classic View restored and the lab, end card and caption hidden. Screenshots of cuts other than the lab were not reviewed.

# R16 summary: abilities, tutorial, transient logs, retro UI, calmer intro

Display and UI work plus three optional-route abilities. Bot pins in `tests/assist.test.ts` are unchanged (Normal 4978 ticks HP 126, Story 4880 HP 142, Hard 5319 HP 104). The tutorial only reads input and world state; it changes nothing in the simulation.

## Abilities (details: [R16_METROID_ABILITIES](R16_METROID_ABILITIES.md))
| Ability | Gets you | Gate it opens |
|---|---|---|
| Thruster Boots | Sunken Mines pickup | Double jump to the upper Central Shaft |
| Blast Core | Blast Cache | Grenade/Rocket shatters blast plates |
| Scan Lens | Lens Cache | A Scan Pulse beside a sealed hatch overrides it |
| Thermal Plating | Heat Cache | Standing against a heat seal melts it |

## Tutorial and minimal HUD (`src/ui/tutorial.ts`)
- The default HUD shows HP, dash, light, kills, energy tanks, weapon bar and ammo, minimap, and the objective. The always-on control line, the key labels on the LIGHT/SCAN pills, and the four ability pills are gone. The SCAN pill appears only while a pulse is active or recharging. Acquired abilities are listed on the pause Controls page.
- The tutorial is a pure state machine: run, jump, aim and fire, switch weapon, dash, counter, scan, then one prompt per ability when it is acquired (Thruster Boots, Blast Core, Scan Lens, Thermal Plating). One prompt at a time, shown near the bottom of the screen, retired when the action is observed. Ability prompts time out after 15 s of play if ignored.
- The first run starts with the tutorial on. `T` skips it for good; `Extras > Tutorial` toggles it and replays it from the start. State is stored in `localStorage` (`reanimator.tutorial.v1`).
- Context prompts (locked doors, save station, map terminal, slide tunnel, Warden charge) stay and are shown only near the object.
- The full controls list stays in the title Controls panel and the pause Controls page.

## DATA LOG
Pickups no longer freeze the game or open a modal reader. A non-interactive toast shows the title and an excerpt for about 3 s and fades. The full text is in the pause menu LOGS archive. Details: [R16_UI](R16_UI.md).

## Retro UI
Pixel-style type with no smoothing, square 2 px frames with hard shadows, segmented bars, light CRT scanlines (reduced under Reduce flashing). CSS only; no new lights or draw calls.

## Intro verdict
The opening was an intentional alarm set piece (red vent burst, sweeping light, rapid captions) but it was overdone. It now runs 12.9 s with one caption at a time (2.5 s minimum hold), a red alarm capped at half intensity with a slow single pulse, and slower sweeps.

## Release packaging
Player-facing text no longer mentions the development tools: page metadata, title footer, credits panel, credits roll, demo and trailer captions. The README is a game README. The menu entry "Judge Reel" is now "Trailer reel". `dist/` contains no such strings.

## Verification
- `make check` exit 0: 672/672 tests (new `tests/tutorial.test.ts`), reference-verify 3/3, reach3d, dist-guard PASS (24 files, 17,004,885 B).
- Playwright against the dev server: tutorial prompt "RUN" with the T skip chip shown, T skip persisted, 0 console errors. Screenshots in `docs/evidence/r16_tutorial/`.
- Draw calls (`__reanimator().perf.drawCalls`, showcase scenes): combat 305, mines 197, biolabs 295, security 274, boss 166, escape 156. The combat scene is a transient peak over 300; the same scene measured 303 to 313 with this change stashed, so it is not caused by this change. Left as is.
- Not verified: `make smoke-local` (Chrome cannot launch in the agent sandbox), a pickup toast and an ability prompt in the browser, human playtest (G5).

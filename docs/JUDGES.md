# Judges' guide

- **Live demo:** https://dlr55kf9v2hn7.cloudfront.net (desktop Chrome, Edge, Firefox or Safari with WebGL2; headphones recommended).
- **Local source setup:** `npm install && npm run dev`, then open the printed URL in Chrome. Total demo time: 3 minutes.

## 3-minute demo script

Every stop below is in `Extras` > `Demo tour`. Each one drops you into the normal play loop (not a debug mode) at a fixed, deterministic checkpoint with a small `DEMO` badge at the top. `R` restarts the checkpoint, `Esc` pauses. Menus take Up/Down, Enter and Esc.

| Time | Do | What to point out |
|---|---|---|
| 0:00 | Open Settings and pick difficulty **Story** (recommended for a short look; Normal is the tuned default), then return to the title. Wait on the title screen about 10 s. | The title plays an attract reel of a bot playing the real game, not a pre-rendered video. Procedural music is already running (no audio files in the repo). |
| 0:15 | Dev / `?debug=1` smoke builds only: `Extras` > `Watch showcase`. Let it run, or press any key to leave. | One minute of captioned cuts by the same deterministic bot: "1996 physics, frame-exact", sector tour, weapon locks, Classic View, Core Warden, Meltdown. (Stripped from production builds.) |
| 0:15 | Dev / `?debug=1` smoke builds only: `Extras` > `Trailer reel` (or open `/?debug=1&reel`, or `__reanimatorReel()`). About 90 seconds, press any key or Esc to leave. | Lab PASS then mutation FAIL, 1996/2026 Classic View toggle with CRT collapse, opening wake, Counter and Scan, Reclaimer, Warden counter and phase III, Meltdown, end card, plus Stage 2 & 3 cuts. See [R13_REEL](archive/rounds/R13_REEL.md). |
| 0:25 | `Extras` > `Physics lab`. | The core claim. Pick a scenario card (S1, S2, S3, M05). The ORIGINAL canvas replays the numeric log captured from the 1996 game; the REANIMATED canvas replays our `motion.ts` from the same input. Press play or drag the tick slider. The heatmap shows 11 fields by every tick, all green. Tick "Demo mutation": a wall moves 3 px and "First mismatch" jumps to the broken tick. It is a demo, not an original bug. The side panel explains how it is verified. |
| 1:00 | `Demo tour` > `Airlock start`. Run right with `D`, aim with the mouse, fire with left click, `Shift` dashes. | 60 Hz deterministic sim, hit-stop and screen shake on kills, combo kills refund the dash. Only movement physics is restored; everything else is new design. |
| 1:15 | `Demo tour` > `Mines: crusher and hive`. | Telegraphed crusher, vents, acid, a hive that spawns larvae. Hazards warn before they hurt. |
| 1:30 | `Demo tour` > `Bio-Labs: switch and barrels`. | Explosive barrels chain, the gantry switch (`F`) extends a bridge, four weapons each open a different lock; slots 5 and 6 add a Flamer and a Rocket launcher (a Security Deck stop carries all six). |
| 1:45 | `Demo tour` > `Security: laser grid`. | Lasers cycle on a timer; the Security Console turns them off. |
| 1:55 | `Demo tour` > `Crawl Slide tunnel`. Hold `S` and dash. | Ability-gated shortcut: the Crawl Slide module opens a 1 m duct. |
| 2:05 | `Demo tour` > `Core Warden: phase II`. (I and III are also listed.) | Telegraphed attacks, weak-point window, damage numbers, three phases, no cinematic needed. |
| 2:30 | `Demo tour` > `Meltdown: collapsing bridge`, then `extraction hatch`. | 90-second timer, rubble hazards, the bridge crumbling behind you, the hatch as the win condition. |
| 2:45 | `Demo tour` > `Classic View (press V)`. Press `V` twice. | 320x200, 256-colour palette with Bayer dither, orthographic camera, pixel HUD. One keypress swaps the whole render path. |
| 2:50 | Title > `Stages` menu (`Foundry Line` / `Reactor Spire`). | Stages 2 & 3 add Slag Foreman mini-boss, Cryo Bulwark frost-shield foes, Spire Warden, Meshy surface textures, per-stage color grading, and re-voiced retro arcade BGM. |
| 2:55 | Open `docs/KIRO_USAGE.md` and `.kiro/specs/`. | Specs, steering, a hook, and parallel sub-agent rounds with browser verification. |

**Demo tour list** (DOM ids `demo-<id>`): `airlock`, `mines`, `biolabs`, `security`, `slide`, `boss1`, `boss2`, `boss3`, `collapse`, `hatch`, `classic`. The same checkpoints are reachable from the console with `__reanimatorDemo('<id>')`. Definitions live in `src/ui/demo.ts` and `tests/demo.test.ts` checks that each one starts alive in the right sector.

**README scenes.** `await __reanimatorShowcase('<name>')` builds a deterministic scene and resolves once the renderer has settled. Names: `title`, `classic`, `combat`, `boss`, `mines`, `biolabs`, `security`, `slide`, `escape`, `lab`, plus the R10 opening beats `opening-wake`, `opening-alarm`, `opening` (see [R10_OPENING](archive/rounds/R10_OPENING.md)). `tools/smoke/capture-showcase.ts` uses it to write `docs/evidence/showcase/*.png` (needs Chrome).

## Technical highlights (top 5)

1. **Frame-exact restoration with an honest holdout.** Movement physics of a 1996 DOS binary reproduced in TypeScript, verified on 11 fields per tick against logs of the original running (S1, S2, S3, sealed M05). A first holdout failed (M04), the cause was found in the binary, the engine was fixed, and a new holdout passed. Files: `src/engine/motion.ts`, `tools/reference/verify.ts`, `docs/evidence/G2_REPORT.md`.
2. **Deterministic 60 Hz simulation, decoupled from rendering.** The sim never reads render state, so a bot can play the whole game headlessly and tests can assert on it. The headlamp is proven to be visual only by a test that runs two worlds in lockstep. Files: `src/game3d/world3d.ts`, `tests/game3d.test.ts`.
3. **Reachability proof for ability gates.** `tools/game/reach3d.ts` searches for a path through 52 waypoints and checks that each Thruster Boots gate is impassable without the boots and passable with them, including a check that the dash cannot bypass the gate.
4. **Two render paths from one scene.** Modern (bloom, grade, instanced and batched statics) and Classic View (`src/render3d/classicView.ts`: 320x200 render target, 4x4 Bayer dither, nearest-colour match against a 256-colour palette built from original anchors, integer upscale, optional CRT). Draw calls observed: 159 to 275 Modern, 123 Classic.
5. **Everything procedural and licence-clean.** Music and effects are synthesized in WebAudio (`src/ui/soundBank.ts`, `audioDirector.ts`). The palette and pixel font are hand-defined. `tools/release/check-dist.ts` fails the build if any original Abuse file, hash, `MZ` header, or DOS/4G banner reaches `dist/`.

## How to verify

```bash
make check               # expected exit 0: tsc, node --test, reference-verify 3/3, reach, reach3d, build, dist-guard
make reference-holdout   # 4/4 including sealed M05
make smoke-local         # needs Chrome; headless browser smoke test
```

Observed on `main` (R28 audio/trailer polish): `make check` exit 0 (`tsc`, 766/766 node tests, `reference-verify` 3/3 PASS on S1·S2·S3, `reach` + `reach3d` PASS — Stage 1: 52 waypoints / 3,432 ticks / 57.2 s, Stage 2: 33 waypoints / 2,526 ticks / 42.1 s, Stage 3: 32 waypoints / 1,798 ticks / 30.0 s — Vite production build, and `dist-guard` PASS on 56 files, 20,780,579 B, `checkedAgainst: 218`). `make smoke-local` passed 30/30 in headless Chrome (`rendererMode: "webgl-3d"`, 10 models / 11 rigged, 60.5 fps, full Stage 1 bot clear in 4,978 ticks, 0 page errors), and Playwright checks on `dist-debug/?debug=1` measured Bio-Labs showcase at 222 draw calls and verified the `REANIMATED` full-run ending card with 0 errors. `make reference-holdout` was observed 4 of 4 on sealed `src/engine/motion.ts` (unchanged since).

Unverified: a full human playthrough (G5) and human listening review of the R28 retro arcade BGM and trailer audio.

## Where to read more

[`README.md`](../README.md) · [`docs/KIRO_USAGE.md`](KIRO_USAGE.md) · [`docs/reference/VERIFICATION_CONTRACT.md`](reference/VERIFICATION_CONTRACT.md) · [`docs/archive/rounds/R3_CLASSIC.md`](archive/rounds/R3_CLASSIC.md) · [`docs/archive/rounds/R2_BOSS.md`](archive/rounds/R2_BOSS.md)

## R9 additions

- Melee Counter (`X`/`C`) and Scan Pulse (`Z`) borrow Metroid Dread ideas. Security Deck hides a lean-to-open fake wall (Abuse style) with a Vault Nook reward, counted in completion (23 items). Pickups are chunky and magnetised. Details: [R9_PARRY](archive/rounds/R9_PARRY.md), [R9_ABUSE](archive/rounds/R9_ABUSE.md). Browser behaviour unverified in this round.


## R10 additions

- A 9.8 s cinematic opening, Classic View CRT transition, a Metroid Dread style Warden counter with escape set pieces, and a Bio-Labs Hunter zone with stealth (sneak with Ctrl/Alt). Details: [R10_OPENING](archive/rounds/R10_OPENING.md), [R10_CLASSIC](archive/rounds/R10_CLASSIC.md), [R10_BOSS](archive/rounds/R10_BOSS.md), [R10_HUNTER](archive/rounds/R10_HUNTER.md). Browser behaviour unverified.

## R11 additions and verification status

- Hunter armour fitted to the rig bones, opening HUD fade-in with letterbox and title card, showcase hold exit, Escape resume in the pause menu, English UI chrome.
- Observed in Chrome by the orchestrator: the R9 UI audit passes in 12 scenarios, Scan Pulse outlines show, the Vault Nook secret is found with the camera following into it, and there are no console warnings. The opening renders with letterbox and no HUD. The HUD fits one row with the HUNTER pill.
- Not yet verified: the final `3c8e7a0` hunter look, the feel of the counter window, a human playtest (G5), and `make smoke-local` (needs a real Chrome).

## Debug hooks

All are on `window` (declared in `src/ui/main.ts`). Every synchronous one cancels a pending async hook.

- `__reanimator()`: state snapshot (includes `layers` and `worldSerial`).
- `__reanimatorAdvance(inputs, setup?, { continue? })`: runs input frames. Default builds a fresh world; `{ continue: true }` keeps the current one. Returns snapshot plus `debug`.
- `__reanimatorStep(inputs, alpha?)`: runs input frames on the current world (always continues).
- `__reanimatorRunBot(maxTicks, untilStep?, showResultOnEnd?)`: bot plays.
- `__reanimatorSetView(mode)`: switch Modern or Classic view.
- `__reanimatorAudio`: audio debug state.
- `__reanimatorShowResult('won' | 'lost')`: open the result screen.
- `__reanimatorShowBanner(kind)`: show a sector, weapon, boots, etank or coach banner.
- `__reanimatorPick(px, py, includePoints?)`: list scene objects under a pixel.
- `__reanimatorReel()`: starts the Trailer Reel (same as `Extras` > `Trailer reel` and `/?debug=1&reel`).
- `__reanimatorShowcase(name)`: async README scene; resolves with `superseded: true` if a later debug call took over.
- `__reanimatorDemo(id)`: jump to a demo tour checkpoint.
- `__reanimatorSoak(n?, opts?)`: async soak run over demos and showcases.
- `__reanimatorUiAudit()`: async UI audit; may resolve with `superseded: true`.
- `__reanimatorShowLog(id, view?)`: open a log in the reader, archive, credits or ending view.

## R12 additions

- Bot respawn routing, shot dodging and counters, plus debug hook robustness (`continue` mode, supersede rule, `debug` and `layers` fields) and result screen copy. Details: [R12_ROBUST](archive/rounds/R12_ROBUST.md). Browser behaviour unverified.
- Integrated R12: diegetic extraction hatch and pickups ([R12_LOOK](archive/rounds/R12_LOOK.md)), display-only enemy poses and bestiary view ([R12_MOTION](archive/rounds/R12_MOTION.md)), softened first airlock encounter and always-resumable defeat ([R12_ONBOARD](archive/rounds/R12_ONBOARD.md)). Bot Normal 5444 ticks HP 140.

## R13 additions

- Trailer Reel (`Extras` > `Trailer reel`, `/?debug=1&reel`), ambient background life per sector ([R13_ALIVE](archive/rounds/R13_ALIVE.md)), Core Warden readability and per-weapon impacts ([R13_COMBAT](archive/rounds/R13_COMBAT.md)), truthful debug layers, sector hints and a single Classic HUD ([R13_UX](archive/rounds/R13_UX.md)).
- Enemy running: one locomotion model, and the sim no longer teleports queued foes at closed doors. Floor crawlers and stalkers never move more than 0.2 m in one tick on the bot run (`node tools/game/enemyJitter.ts`, `tests/r13-smooth.test.ts`). Bot Normal 5208 ticks HP 126.

## R14 additions

- Room transitions slow down: a 42-tick door walk-through, a 150-tick entry grace for nearby foes, a sector title card, and gentler camera framing ([R14_TRANSIT](archive/rounds/R14_TRANSIT.md)).
- Terrain has procedural detail textures, normal maps and relief meshes (Meshy was unreachable, so none of it is Meshy output) ([R14_TERRAIN](archive/rounds/R14_TERRAIN.md)).
- Characters get per-kind key and fill light with a softer rim so they read as shapes ([R14_CHARLIGHT](archive/rounds/R14_CHARLIGHT.md)).
- Evidence: `docs/evidence/r14/` screenshots from a no-error Playwright run. No human playtest yet, so feel is unverified.

## R15 additions

- Eleven Meshy-generated terrain pieces (about 0.2 MB each) are instanced in all six sectors, visual only. Draw calls stayed at or under 300 (148 to 299) with 0 console errors in a Playwright run; screenshots in `docs/evidence/r15_meshy_terrain/`. Not human-playtested ([R15_MESHY_TERRAIN](archive/rounds/R15_MESHY_TERRAIN.md)).

## R16–R28 additions

- **Tutorial & retro UI (R16):** Optional step-by-step tutorial mode, minimal HUD, transient non-blocking DATA LOG notices, calmer opening alarm, and retro CRT framing.
- **Multi-stage campaign (R17–R23):** Stages 2 (**Foundry Line**, Slag Foreman mini-boss) and 3 (**Reactor Spire**, Cryo Bulwark shield foes + Spire Warden), stage unlock & best-time persistence (`stageFlow.ts`, `records.ts`), full-run `REANIMATED` ending card, gamepad support, and debug hook stripping from production builds.
- **Surface textures & per-stage color grading (R24–R26):** Meshy surface textures & hazard trims (`public/assets/textures/`), shared GLSL warm/cold stage grading (`vista3d.ts`, `ambient3d.ts`), and stage-specific HUD sector labels.
- **Audio & live hosting (R27–R28):** Restored small-text antialiasing (`style.css`), 10-theme retro arcade procedural BGM rewrite (`src/ui/themes.ts`), and AWS S3 + CloudFront deployment (`https://dlr55kf9v2hn7.cloudfront.net`).

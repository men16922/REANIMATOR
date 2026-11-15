# Judges' guide

Setup: `npm install && npm run dev`, then open the printed URL in Chrome. Use headphones. Total demo time: 3 minutes.

## 3-minute demo script

Every stop below is in `Extras` > `Demo tour`. Each one drops you into the normal play loop (not a debug mode) at a fixed, deterministic checkpoint with a small `DEMO` badge at the top. `R` restarts the checkpoint, `Esc` pauses. Menus take Up/Down, Enter and Esc.

| Time | Do | What to point out |
|---|---|---|
| 0:00 | Load the page. Wait on the title screen about 10 s. | The title plays an attract reel of a bot playing the real game, not a pre-rendered video. Procedural music is already running (no audio files in the repo). |
| 0:15 | `Extras` > `Watch showcase`. Let it run, or press any key to leave. | One minute of captioned cuts by the same deterministic bot: "1996 physics, frame-exact", sector tour, weapon locks, Classic View, Core Warden, Meltdown. |
| 0:25 | `Extras` > `Restoration Lab`. | The core claim. The left side is the numeric log captured from the 1996 original. The right side is our `motion.ts` replaying the same input. 11 fields per tick match exactly on S1, S2, S3 and the sealed holdout M05. Tick "Demo mutation": a wall moves 3 px and the comparator flags the first mismatch. It is a demo, not an original bug. |
| 1:00 | `Demo tour` > `Airlock start`. Run right with `D`, aim with the mouse, fire with left click, `Shift` dashes. | 60 Hz deterministic sim, hit-stop and screen shake on kills, combo kills refund the dash. Only movement physics is restored; everything else is new design. |
| 1:15 | `Demo tour` > `Mines: crusher and hive`. | Telegraphed crusher, vents, acid, a hive that spawns larvae. Hazards warn before they hurt. |
| 1:30 | `Demo tour` > `Bio-Labs: switch and barrels`. | Explosive barrels chain, the gantry switch (`F`) extends a bridge, four weapons each open a different lock. |
| 1:45 | `Demo tour` > `Security: laser grid`. | Lasers cycle on a timer; the Security Console turns them off. |
| 1:55 | `Demo tour` > `Crawl Slide tunnel`. Hold `S` and dash. | Ability-gated shortcut: the Crawl Slide module opens a 1 m duct. |
| 2:05 | `Demo tour` > `Core Warden: phase II`. (I and III are also listed.) | Telegraphed attacks, weak-point window, damage numbers, three phases, no cinematic needed. |
| 2:30 | `Demo tour` > `Meltdown: collapsing bridge`, then `extraction hatch`. | 90-second timer, rubble hazards, the bridge crumbling behind you, the hatch as the win condition. |
| 2:45 | `Demo tour` > `Classic View (press V)`. Press `V` twice. | 320x200, 256-colour palette with Bayer dither, orthographic camera, pixel HUD. One keypress swaps the whole render path. |
| 2:55 | Open `docs/KIRO_USAGE.md` and `.kiro/specs/`. | Specs, steering, a hook, and parallel sub-agent rounds with browser verification. |

**Demo tour list** (DOM ids `demo-<id>`): `airlock`, `mines`, `biolabs`, `security`, `slide`, `boss1`, `boss2`, `boss3`, `collapse`, `hatch`, `classic`. The same checkpoints are reachable from the console with `__reanimatorDemo('<id>')`. Definitions live in `src/ui/demo.ts` and `tests/demo.test.ts` checks that each one starts alive in the right sector.

**README scenes.** `await __reanimatorShowcase('<name>')` builds a deterministic scene and resolves once the renderer has settled. Names: `title`, `classic`, `combat`, `boss`, `mines`, `biolabs`, `security`, `slide`, `escape`, `lab`. `tools/smoke/capture-showcase.ts` uses it to write `docs/evidence/showcase/*.png` (needs Chrome).

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

Observed on `main` at `c84649e`: `make check` exit 0, 211 of 211 node tests, `reference-verify` 3 of 3, `reach3d` 52 waypoints, `dist-guard` PASS on 13 files. Bot run won in 4,901 ticks. `make reference-holdout` was last observed 4 of 4 on an earlier engine revision and the sealed engine files have not changed since.

Not verified: human play-through difficulty, and `make smoke-local` on the newest build (earlier runs aborted in a sandboxed Chrome).

## Where to read more

[`README.md`](../README.md) · [`docs/KIRO_USAGE.md`](KIRO_USAGE.md) · [`docs/reference/VERIFICATION_CONTRACT.md`](reference/VERIFICATION_CONTRACT.md) · [`docs/R3_CLASSIC.md`](R3_CLASSIC.md) · [`docs/R2_BOSS.md`](R2_BOSS.md)

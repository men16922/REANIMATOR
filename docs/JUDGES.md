# Judges' guide

Setup: `npm install && npm run dev`, then open the printed URL in Chrome. Use headphones. Total demo time: 3 minutes.

## 3-minute demo script

| Time | Do | What to point out |
|---|---|---|
| 0:00 | Load the page. Wait on the title screen about 10 s. | The title plays an attract reel of a bot playing the real game, not a pre-rendered video. Procedural music is already running (no audio files in the repo). |
| 0:20 | `Extras` > `Restoration Lab`. | The core claim. The left side is the numeric log captured from the 1996 original. The right side is our `motion.ts` replaying the same input. 11 fields per tick match exactly on S1, S2, S3 and the sealed holdout M05. Tick the "Demo mutation" box: a wall moves 3 px and the comparator flags the first mismatch. It is a demo, not an original bug. |
| 1:00 | Back to the menu. `Extras` > `Credits`, then back. Press `Play`. | Honest scope: only movement physics is restored. Everything else is new design. No original Abuse assets ship. |
| 1:15 | Run right with `D`, aim with the mouse, fire with left click. Press `Shift` to dash. | 60 Hz deterministic sim, hit-stop and screen shake on kills, combo kills refund the dash. |
| 1:35 | Press `V`. Then press `V` again. | Classic View: 320x200, 256-colour palette with Bayer dither, orthographic camera, pixel HUD. One keypress swaps the whole render path. |
| 1:50 | Press `Tab`. | Sector map of a six-sector metroidvania with weapon-locked doors and a Thruster Boots height gate. |
| 2:00 | Show the boss (see the shortcut below). | Core Warden: intro cinematic, telegraphed attacks, three phases, weak-point window, damage numbers. |
| 2:40 | Open `docs/KIRO_USAGE.md` and `.kiro/specs/`. | Five specs, steering, a hook, and four parallel sub-agent rounds with browser verification. |

**Boss shortcut.** Playing to the boss takes several minutes. After pressing `Play`, run `__reanimatorRunBot(2400)` in the browser console. This steps the deterministic bot forward to about the Core Vault entry (the tick comes from the earlier debugging checklist in `docs/archive/NEXT_PLAN_through_R3.md`). It enters the debug manual mode, which holds the live loop, so use it to show the boss state and not for live play. Say that it is a debug hook when you use it.

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

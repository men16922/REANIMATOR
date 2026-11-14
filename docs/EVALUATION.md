# Evaluation — commands, environment, actual results

2026-11-14 · macOS arm64 · project Node 26.13.1 · Google Chrome (Chromium headless channel, Metal WebGL2 verified).
Only commands that were actually run are listed. Results are from the latest verified runs after code edits.

## Current milestone: Full 3D Quarter-View (asset schema `reanimator-meshy-assets-v2`)

| Command | What it checks | Result |
|---|---|---|
| `make check` | typecheck · `node --test tests/` · `reference-verify` · `reach` · `reach3d` · Vite build · dist guard | exit 0. `tsc` ok; 35/35 tests (`game`, `game3d`, `reference`); S1·S2·S3 3/3 PASS; `reach` PASS; `reach3d` 10 waypoints, 573 ticks (9.6 s); `dist-guard` `{"status":"PASS","files":12,"bytes":14304572,"checkedAgainst":218,"problems":[]}` |
| `make reference-holdout` | development scenarios + sealed holdout M05 | 4/4 PASS (S1, S2, S3, M05). Holdout is regression-only, never used for tuning |
| `make smoke-local` | title, WebGL2 renderer, Meshy GLB loads, Lab, play, input, pause, restart, FPS, page errors | exit 0, 22/22 PASS. `rendererMode: "webgl-3d"`, `loadedModels: 9`, `failedModels: []`, `riggedCount: 8`, `fps: 60.5`, no page errors |
| `node tools/smoke/capture-showcase.ts` | real-browser capture of title, Zone A, catwalk, boss, escape, Lab | 6 PNGs in `docs/evidence/g4_playable/` (`01_title_3d.png` … `06_restoration_lab.png`); capture ticks zoneA 55, zoneB 426, boss 946, escape 1223; all visually inspected |
| `node tools/game/playthrough.ts` | deterministic 3D bot full run (Zone A → Core Warden → Meltdown escape) | `status: "won"`, 1234 ticks (20.57 s), `hp: 81`, `kills: 16`, `unlockedWeapons: [1,2,3,4]`, `meltdownLeftSeconds: 87.7` |
| `node tools/release/check-dist.ts` | `dist/` has no original file (218 sha256), no original names, no MZ header, no extender banner | PASS (12 files, 14,304,572 B) |

The 3D game simulates at 60 Hz (`src/game3d/`). The restored player physics `src/engine/motion.ts` runs at 15 Hz (design value).

## Earlier 2.5D-stage record (history, superseded)

| Command | Result then |
|---|---|
| `make check` | exit 0 with 30 tests, `reach` 404 ticks, dist 9 files / 5,171,090 B |
| `make smoke-local` | 19/19 PASS (`webgl-2.5d`, 6 GLB, 60.5 fps) |
| `node tools/game/playthrough.ts` | 2.5D build: `won`, 747 ticks (49.8 s), `hp: 100`, `kills: 12` |
| `node tools/game/bench.ts` | 15 Hz tick cost 0.0187 ms/tick (20,000 ticks) |

## Reference comparison (validationKind `reference-state`)

| Scenario | Kind | Rows × fields | Tolerance | Status |
|---|---|---|---|---|
| S1-spawn-fall-run-wall | development | 100 × 11 | exact | PASS |
| S2-jump | development | 35 × 11 | exact | PASS |
| S3-wall-air-jump | development (former holdout M04, FAILED its single judgement) | 59 × 11 | exact | PASS |
| M05-holdout-jump-in-place | holdout | 88 × 11 | exact | PASS |

Reference logs come from the original `ABUSE.EXE` (sha256 `8ba92587…1074f`) under DOSBox Staging 0.83.0 with an instrumented Lisp input hook (`docs/evidence/G1_REPORT.md`).

## Limits

- No human has played the game yet (G5 playtest open). Difficulty feel, fun, and human completion time are unmeasured outside automated bots.
- Restored scope remains `src/engine/motion.ts` player physics only (flat floor, left wall, ceiling, gravity, jump, landing). The 3D shooter, weapons, enemies, 4 zones, Meshy 7.1 models, Three.js renderer, and WebAudio are `new-design`.
- The 15 Hz simulation tick of the restored engine is a design choice; the original DOS tick rate was not measured.
- Smoke and showcase runs exercise headless Google Chrome over request routing (`http://reanimator.test/`) rather than an external web server.

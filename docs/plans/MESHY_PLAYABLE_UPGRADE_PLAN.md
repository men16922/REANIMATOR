# REANIMATOR — Meshy 7.1 2.5D Dark Biomechanical Action Upgrade Plan

2026-11-14 · Upgrade from G4 prototype (`320×200` Canvas2D) to 2.5D WebGL2 Playable Build · **Status: COMPLETED & VERIFIED (2.5D stage), then SUPERSEDED by Full 3D Quarter-View**

> **Update (2026-11-14):** 이 계획의 2.5D 단계 위에 Full 3D Quarter-View 트윈스틱 슈터가 추가되었다. 현재 자산은 schema `reanimator-meshy-assets-v2`의 Meshy 7.1 9종(`operative`, `warden`, `bio-stalker` 리깅 66 joints + `pulse-rifle`, `bio-barrel`, `crawler`, `spitter`, `power-core`, `exit-gate`), 60 Hz 시뮬레이션 `src/game3d/`, WebGL2 렌더러 `src/render3d/`이다. 설계는 `.kiro/specs/full-3d-quarter-view/`. 아래 2.5D 본문과 검증 수치는 당시(G4 2.5D) 기록으로 보존하며, 현재 게이트 수치는 `docs/STATUS.md`가 기준이다. Meshy 크레딧 잔량 718.

## Scope & Preserved Invariants

- **Untouched Restored Engine**: `src/engine/motion.ts` and `reference/{fixtures,holdout}/**` remain completely unmodified (`S1`, `S2`, `S3`, and holdout `M05` exact 11-field match).
- **Light Variant-Contract (`R3.3`)**: `w.light` only affects rendering (`src/render/scene3d.ts` / `src/render/canvas.ts`) and never alters player motion, combat, pickups, hazards, or enemies.
- **Determinism & Purity**: `update(w0, c)` remains pure and deterministic (`structuredClone`, no `Math.random()`, no wall-clock dependency).
- **Provenance Separation**: Restored motion physics (`binary-static` + `runtime-observed`) stay strictly separated from `new-design` elements (Meshy 7.1 3D models, Three.js 2.5D WebGL renderer, enemies, dual-fire weapons, 4-sector facility map, hazards, med-stations, and WebAudio).

## Asset Pipeline (Meshy 7.1 via Chrome CDP)

- Connect via native WebSocket CDP exclusively to `meshy.ai` in the user's open Chrome `"억울해"` profile (`DevToolsActivePort`).
- Generate 6 dark biomechanical 3D assets (`operative`, `crawler`, `spitter`, `warden`, `power-core`, `exit-gate`) within a strict credit cap (keep balance `>= 600`), download raw `.glb` to `assets/meshy-raw/` (gitignored), optimize textures/geometry via `@gltf-transform/*` + `sharp` into `public/assets/models/*.glb`, and record hashes/prompts/licenses in `reference/manifests/meshy-assets.json` and `docs/reference/ASSET_REGISTER.md`.
- Visually inspect 4-angle orientation sheets to lock `yawFront` and `groundOffset` per model.

## Gameplay & Rendering Architecture

- **Level (`src/game/map.ts`)**: `140×36` tile facility (`TILE = 16`, `2240×576` world px) across 4 sectors (`A` Calibration Airlock, `B` Conduit & Bio-Sludge Hazards, `C` Blackout Vertical Shaft & Core Vault, `D` Lockdown Extraction Run).
- **Combat (`src/game/world.ts`)**: Dual-fire pulse rifle (rapid energy pulse + piercing Overcharge Rail-Slug with cooldown & stagger), 3 enemy types (`crawler`, `spitter`, `warden`), `MedStation` (`+35 HP`), and `H` hazard troughs.
- **2.5D Renderer (`src/render/scene3d.ts`, `src/render/models.ts`)**: Three.js WebGL2 renderer with dynamic headlamp `SpotLight` cone, emissive enemy/hazard telegraphs, 360° aimed weapon & laser sight, depth parallax corridor geometry, particle bursts, and Canvas2D fallback (`src/render/canvas.ts`).

## Verification Gates (Verified Complete)

- [x] `make check` — exit `0` (`tsc`, `30/30` tests, `S1/S2/S3` PASS, `reach` `404` ticks, `vite build`, `check-dist` PASS `9 files / 5,171,090 B`)
- [x] `make reference-holdout` — `4/4 PASS` (`S1/S2/S3/M05`)
- [x] `node tools/game/playthrough.ts` — exit `0` (`phase: "won"`, `747` ticks / `49.8s`, `hp: 100`, `kills: 12`, `wardenRemainingHp: 0`)
- [x] `make smoke-local` — `19/19 PASS` (`webgl-2.5d`, `6/6` `.glb` loaded, `60.5 fps`, `0` errors)
- [x] `node tools/smoke/capture-showcase.ts` + visual `read_file` check of all 6 screenshots in `docs/evidence/g4_playable/` (`title_25d.png`, `sector_a_light_on.png`, `sector_a_light_off.png`, `combat_action.png`, `core_vault_warden.png`, `restoration_lab.png`)

## Superseded 현재 게이트 (Full 3D, 관찰값)

- `make check` exit `0` (`35/35` tests, `reference-verify` 3/3, `reach` PASS, `reach3d` 10 waypoint 573 ticks / 9.6 s, `dist-guard` `12 files / 14,304,572 B / 218`)
- `make reference-holdout` `4/4 PASS` · `make smoke-local` `22/22 PASS` (`webgl-3d`, `loadedModels: 9`, `riggedCount: 8`, `60.5 fps`) · `capture-showcase.ts` PNG 6장(`01_title_3d.png`…`06_restoration_lab.png`)

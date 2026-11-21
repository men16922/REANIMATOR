# Pre-existing Work & Original Contributions Disclosure

REANIMATOR was created for **Kiroween 2026** (Category: **Resurrection**). The first commit in this repository is dated `2026-11-14`, within the `2026-10-30`–`2026-12-04` hackathon submission period.

This document discloses all pre-existing projects, reference materials, and external tools used during development, separated from the new work created for this submission.

## Pre-existing projects and external references

| Item | Origin / License | How it was used | What is shipped in REANIMATOR |
|---|---|---|---|
| **MYTHOS: BLACKOUT** | Author's prior unrelated game project | Design and architecture notes were read for planning lessons. | **None.** Zero code, art, audio, or assets reused. |
| **REA (`6.9.0`)** | Author's MIT-licensed reverse-engineering CLI | Used externally during G1 binary decompilation (`inspect`, `instructions`, `decompile-all`). | **None.** Build/runtime has no REA dependency. |
| ***Abuse* DOS Shareware 1.05** (1996, Crack dot Com) | Commercial shareware binary & data (local analysis only) | Executed locally in DOSBox Staging for behavioral observation, LE-to-ELF binary analysis, and numeric movement trace logging. | **None.** Excluded from git and `dist/`. Enforced by [`tools/release/check-dist.ts`](../tools/release/check-dist.ts). |
| **Three.js, Vite, TypeScript, Playwright** | Open-source libraries / tooling (MIT / Apache-2.0) | Runtime 3D WebGL2 rendering, bundling, typechecking, and headless browser smoke verification. | Standard bundled dependencies (`three` at runtime). |
| **Ghidra 12.2, DOSBox Staging** | Open-source analysis / emulation tools | Local reverse-engineering and DOS capture environment during G0–G1. | **None.** |
| **Meshy** | External 3D/texture generator (`reference/manifests/meshy-assets.json`) | Generated original new-design 3D models and surface textures (see [`docs/reference/ASSET_REGISTER.md`](reference/ASSET_REGISTER.md) and [`NOTICE.md`](../NOTICE.md)). | Optimized `.glb` models and `.webp` textures in `public/assets/`. |
| **Kiro** | AI development IDE / CLI | Specs, steering rules, PostFileSave hook, custom agent, sub-agents, and MCP workflows (see [`docs/KIRO_USAGE.md`](KIRO_USAGE.md)). | Development artifacts in `.kiro/`. |

## New work created for Kiroween 2026

Everything that makes up the playable application and verification harness was written in this repository starting `2026-11-14`:

- **Binary analysis & capture tooling**: LE-to-ELF converter (`scripts/le2elf.py`), DOSBox observation harness (`reference/harness/`), and numeric movement comparator/verifier (`tools/reference/`).
- **Restored movement engine & Physics Lab**: clean-room TypeScript implementation of the observed 1996 player movement physics (`src/engine/motion.ts`) and the in-browser side-by-side comparison UI (`src/ui/lab.ts`, `labModel.ts`, `labView.ts`).
- **Original 3D Metroidvania**: 60 Hz deterministic simulation (`src/game3d/`, `src/engine/motion3d.ts`), dual WebGL2 renderers including 320×200 Bayer-dithered Classic View (`src/render3d/`), procedural WebAudio synthesizer with per-stage themes and effects (`src/ui/themes.ts`, `soundBank.ts`, `audioDirector.ts`), multi-stage progression, automated reachability/bot test suite (`tests/`, `tools/game/`), and AWS S3/CloudFront deployment (`infra/`).

## Related documents

- Code license: [`LICENSE`](../LICENSE) (MIT)
- License scope & Meshy/Abuse notice: [`NOTICE.md`](../NOTICE.md)
- Kiro usage evidence: [`docs/KIRO_USAGE.md`](KIRO_USAGE.md)
- Asset & license register: [`docs/reference/ASSET_REGISTER.md`](reference/ASSET_REGISTER.md)
- Verification contract: [`docs/reference/VERIFICATION_CONTRACT.md`](reference/VERIFICATION_CONTRACT.md)

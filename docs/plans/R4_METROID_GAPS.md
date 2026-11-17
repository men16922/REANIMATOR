# R4 plan: fill Abuse gaps with Metroid (Dread) ideas

Rule: Abuse (1996) is the reference for movement physics and the 90s look. Where Abuse has nothing to offer, borrow the structure from Metroid. All of this is original design; no Metroid asset or data is used.

| Gap in Abuse | Metroid-style answer | Status |
| --- | --- | --- |
| No ability-gated map | Thruster Boots open the Central Shaft top; coloured locks need matching weapons | Done (R1 to R3) |
| No save points or upgrades | Save/Recharge stations, Energy Tanks, pedestal items | Done. R4 polish: machine, holo rings, boots and tank silhouettes |
| No map | Sector map with visited rooms, doors and save marks | Done |
| Flat enemy behaviour | Telegraphed boss phases, per-kind AI | Done (R2, R3 foes) |
| No traversal depth | Next: wall-jump on marked surfaces, dash-slide under low gaps | Proposed, owned by the player track (C) |
| No melee counter | Dread-style parry: press X/C in the last 8 ticks of a crawler/stalker lunge windup | Implemented R9 (`docs/archive/rounds/R9_PARRY.md`) |
| No scanning or lore | Data-log holograms exist. Scan Pulse (Z) reveals breakables, secrets and items within 14 m for 4 s | Scan Pulse implemented R9 (`docs/archive/rounds/R9_PARRY.md`); foe weakness text still proposed |
| No emergency run | Meltdown escape timer after the core falls | Done |

Rules for adding any of these: keep Abuse-style 2D readability (side view, one z=0 combat lane), keep movement in `src/engine/motion3d.ts`, never touch sealed restoration files.

## R5 status

Implemented in `docs/archive/rounds/R5_METROID.md`: dash-slide (Crawl Slide, two tunnels), shootable and stompable blocks, map terminals with `?` markers, backtracking rewards, escape hatch beats. Parry and Scan Pulse landed in R9 (`docs/archive/rounds/R9_PARRY.md`).

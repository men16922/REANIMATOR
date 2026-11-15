# R4 plan: fill Abuse gaps with Metroid (Dread) ideas

Rule: Abuse (1996) is the reference for movement physics and the 90s look. Where Abuse has nothing to offer, borrow the structure from Metroid. All of this is original design; no Metroid asset or data is used.

| Gap in Abuse | Metroid-style answer | Status |
| --- | --- | --- |
| No ability-gated map | Thruster Boots open the Central Shaft top; coloured locks need matching weapons | Done (R1 to R3) |
| No save points or upgrades | Save/Recharge stations, Energy Tanks, pedestal items | Done. R4 polish: machine, holo rings, boots and tank silhouettes |
| No map | Sector map with visited rooms, doors and save marks | Done |
| Flat enemy behaviour | Telegraphed boss phases, per-kind AI | Done (R2, R3 foes) |
| No traversal depth | Next: wall-jump on marked surfaces, dash-slide under low gaps | Proposed, owned by the player track (C) |
| No melee counter | Next: Dread-style parry that opens a stagger window | Proposed |
| No scanning or lore | Data-log holograms exist; next: scan a foe for weakness text | Proposed |
| No emergency run | Meltdown escape timer after the core falls | Done |

Rules for adding any of these: keep Abuse-style 2D readability (side view, one z=0 combat lane), keep movement in `src/engine/motion3d.ts`, never touch sealed restoration files.

# R9 fix (track A)

## Changes
- `__reanimatorUiAudit()` skips disabled, aria-hidden, clipped (sr-only) and opacity-0 controls via the pure `auditShouldSkipControl` in `src/ui/panels.ts`. `lab-scenario` and `lab-jump` are no longer flagged. Half-transparent live controls are still reported.
- HUD: `meltdownPillVisible` (`src/ui/objective.ts`) hides the red MELTDOWN pill once the run is won, so it no longer shows beside "EXTRACTED SAFELY".
- Central Shaft yellow gate (`door-shaft-biolabs`, x 41.6): `updateCrackedWallPrompt3D` shows "CRACKED WALL — GRENADE REQUIRED" through the normal hint channel when the player is within 3.5 m without the Grenade. No randomness; `w.light` unused.

## Verification
- Verified: node tests (skip rule, meltdown pill, grenade prompt) and `make check`.
- Unverified: browser behavior (real `__reanimatorUiAudit()` result, HUD after a bot win, prompt on screen). Playwright cannot run here.

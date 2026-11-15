# R9 fix (track A)

## Changes
- `__reanimatorUiAudit()` skips disabled, aria-hidden, clipped (sr-only) and opacity-0 controls via the pure `auditShouldSkipControl` in `src/ui/panels.ts`. `lab-scenario` and `lab-jump` are no longer flagged. Half-transparent live controls are still reported.
- HUD: `meltdownPillVisible` (`src/ui/objective.ts`) hides the red MELTDOWN pill once the run is won, so it no longer shows beside "EXTRACTED SAFELY".
- Central Shaft yellow gate (`door-shaft-biolabs`, x 41.6): `updateCrackedWallPrompt3D` shows "CRACKED WALL — GRENADE REQUIRED" through the normal hint channel when the player is within 3.5 m without the Grenade. No randomness; `w.light` unused.

## Verification
- Verified: node tests (skip rule, meltdown pill, grenade prompt) and `make check`.
- Unverified: browser behavior (real `__reanimatorUiAudit()` result, HUD after a bot win, prompt on screen). Playwright cannot run here.

## Post-integration fixes (Nook camera, material warnings)
- `metroid3d.ts`: breakable/fake-wall materials add `map` and `emissiveMap` only when a texture exists, which removes the two `THREE.Material ... undefined` warnings per level build.
- Vault Nook camera: the Nook lies outside every room rect, so the R7 room clamp kept the camera at the Security room and the player left the frame. `rectIncludingPlayer` (`cameraFrame.ts`) extends the clamp rect to include the player plus a half-frustum margin when the player is outside it. Framing inside rooms is unchanged. Test in `tests/camera-frame.test.ts`.
- Unverified: browser view of the Nook.

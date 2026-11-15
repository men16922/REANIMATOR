# R5 Enemy Rig (track A)

Render-only. The simulation, `world3d.ts` and all sealed files are untouched. Browser behaviour is **unverified** (Chrome would not launch in this sandbox, `make smoke-local` reported NOT RUN). Everything below marked "measured" comes from node tests on the deterministic bot run.

## What changed

| File | Change |
| --- | --- |
| `src/render3d/enemyRig3d.ts` (new) | `EnemyRigDriver` (stalker, warden), `ProcSecondary` (crawler, dropper, climber, spitter), spring and gait helpers. Pure math, no THREE. |
| `src/render3d/riggedModels.ts` | `stepEnemyRigAnimation3D` (weight-blended mixer) and `applyEnemyRigChannels3D` (additive bone rotations about rig axes) replace `stepRiggedEnemyAnimation3D`. |
| `src/render3d/enemyMotion.ts` | `analyzeEnemyTrace` now reports yaw rate, skate fraction, pose steps, pose jumps and transition jumps. Telemetry type gains `poseState`, `blend`, `footSpeed`, `headRel`. |
| `src/render3d/scene3dFull.ts` | Rigged foes go through the driver, with LOD. Single-mesh foes go through `ProcSecondary`. |
| `tests/enemy-rig.test.ts` (new) | 9 tests, including a bot playthrough with the numeric criteria below. |

## Design

- **Axis check.** The GLBs face +Z, left is +X, arms rest in an A pose. Bone signs were checked in node against the real GLB bones (hands, knees, head tip world positions), not guessed: spine +X leans forward, arm `-X` raises forward, arm `Z` spreads out, head `+Y` turns toward +X, head `+X` nods down.
- **Every frame starts from the clip pose.** The mixer rewrites the bones, then the channels are layered on top, so nothing accumulates.
- **Foot lock.** Walk and run share one normalised gait phase. Phase rate = ground speed / stride length (m per cycle: `ref speed x clip duration`, blended by speed). Ground speed is measured from the displayed position delta, so interpolation and sim speed never disagree. Walk to run weights follow `smoothstep(blendLo, blendHi, speed)`. The old 0.45 to 1.8 timeScale clamp is gone.
- **Crossfades.** `idle/walk/run/attack/death` weights are smoothed with exponential rates (idle to move 40/s in, 18/s out; attack in 24/s; death in 20/s), normalised to sum 1. Bone channels use exponential smoothing plus a 12 rad/s slew cap, so a state edge cannot pop a bone.
- **Head leads the body.** Head yaw chases the sim yaw at rate 14, body at 5.5 (stalker) or 4.5 (warden), both capped at 12 rad/s. The head offset relative to the body is limited to 0.95 rad and the spine twists 35% of it.
- **Aim.** Engaged foes (not dormant/patrol, within 16 m) tilt head (0.7x) and spine (0.25x) toward the player's elevation, limited to 0.45 rad.

### Stalker

- Windup: crouch (hips down 0.3 m, thighs 0.6, knees 1.05, spine 0.34, head up), shudder growing with the windup fraction. The attack clip is no longer frozen. It plays only for the strike (restarted at 35% of the clip).
- Leap or strike: legs tuck (knees 1.25 to 1.45), claws forward. Landing: hips and knees squash with decay, plus a 7% root squash.
- Hit: a damped spring (3.2 Hz, zeta 0.32) kicks the spine against the player side (front hit tips back, rear hit tips forward). It overshoots once and settles.
- Death: hips, spine, head, left and right arm sag with delays of 0.05, 0.2, 0.4, 0.3, 0.38 s over the death clip, with a small damped overshoot.

### Warden

| Pattern | Pose |
| --- | --- |
| slam | arms overhead during windup (2.7 rad), hammered down at the strike with hips drop |
| charge | forward lean, hips drop, alternating foot stomps in windup, arms swept back |
| volley, barrage | both arms level toward the player (elevation tracked), barrage kick |
| summon | arms thrown wide, head back, tremor |
| stagger or weak point exposed | kneel (hips down 0.78 m, knees 1.9 to 2.1), chest open, head hanging |
| phase change | 1.1 s roar: chest out, head up, arms wide, shake |

Pattern weights ease in and out, so consecutive patterns blend.

### Single-mesh foes (crawler, dropper, climber, spitter)

The GLBs are one unskinned mesh, so it cannot be split into hip and head groups, and no new model can be generated offline. Instead:

- Body scale (x, y, z) runs on underdamped springs (7.5 Hz, zeta 0.42): landing, windup and inflate squash then rebound with overshoot. A spit fires an impulse that squeezes the body and rebounds.
- The inner mesh gets an inertial rotation spring driven by body rotation rate and horizontal acceleration. It lags the outer body and overshoots, which reads as a delayed second segment (spitter: softer 2.6 Hz sway like a trailing tentacle).
- Letting go of a ceiling or wall adds a tumble impulse.
- Surface angle is rotated toward the sim angle at a capped 8 rad/s.
- Wall and ceiling crawlers use surface speed (not `vy`) for the gait and no longer read as "leaping" while climbing.

## Common

- **LOD.** Rigged foes more than 24 m from the player re-pose at 24 Hz, beyond 40 m at 12 Hz (the Warden is never throttled). A state change always re-poses immediately. Accumulated time is passed to the mixer so the gait stays in step.
- **Determinism.** Pure render state, nothing feeds back to the sim. The R3.3 headlamp rule is unaffected.
- **Telemetry** (`window.__reanimator().enemyRender[id]`): `yaw, clip, timeScale, x, y, z` plus `poseState`, `blend` (idle/walk/run/attack/death weights), `footSpeed`, `headRel`.

## Measured (node, `tests/enemy-rig.test.ts`, bot playthrough, Stalkers and Warden)

| Metric | 60 fps | 30 fps | Criterion |
| --- | --- | --- | --- |
| Rig frames analysed | 53,620 | 26,810 | |
| Moving frames judged | 518 | 260 | |
| Skate frames (foot speed vs ground speed off by more than 40%) | 3 (0.58%) | 0 (0%) | under 2% |
| Max yaw rate | 12.00 rad/s | 12.00 rad/s | 12 rad/s cap |
| Yaw jumps (0.5 rad or more per frame) | 0 | 0 | 0 |
| Max bone channel step per frame | 0.200 rad | 0.400 rad | 0.25 rad per 60 fps frame |
| Pose jumps | 0 | 0 | 0 |
| Max step on a pose-state change | 0.200 rad | 0.318 rad | same limit |

The remaining 3 skate frames are the first frame or two of a sim start from rest (the sim reaches 1.5 m/s in one tick, and a 0.12 s crossfade cannot match that).

`make check` exit 0 (253 tests pass, tsc, reference-verify, reach, reach3d, build, dist-guard PASS 13 files).

## Unverified

- Visual quality of all poses in a browser (angles come from reasoned numbers plus node checks of bone axes and world positions, not from a rendered frame).
- Whether the kneel reads as a kneel (the knee floats about 0.25 m above the floor at the Warden's scale).
- Frame cost of about 30 rotation calls per rigged foe per frame (LOD limits it for far foes).

## Browser repro

1. `npm run dev` (or the built `dist`), open the game, open DevTools.
2. Stalker `e-shaft-2`: `__reanimatorAdvance([], {x:34,y:-7,boots:true,hp:999})`, then `__reanimatorStep([{}])`. Read `__reanimator().enemyRender['e-shaft-2']`: `poseState` should go `idle` to `aim` to `move`, `blend.walk`/`blend.run` should follow speed, and `footSpeed` should track the stalker's x speed.
3. Warden: `{x:80,y:0,boots:true,tanks:2,weapons:[1,2,3,4],console:true,openDoors:['door_boss'],hp:999,skipIntro:true,bossPhase:2}` as the setup, then step. Expect `poseState` `windup` (arms overhead on slam), `roar` after a phase change, and `stagger` (kneel) while exposed.
4. Look for: no foot sliding while walking, head turning before the torso on a flip, crouch before a lunge, one overshoot on a hit, delayed limp fall on death.

## Follow-ups

- Mirror the landing squash into the clip for the Warden stomp.
- Real hip/head split for crawler and spitter needs a rigged or two-part model (not possible offline).

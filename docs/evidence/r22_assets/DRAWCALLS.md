# R22 Stage 3 draw calls

Measured in the dev server with `__reanimator().perf.drawCalls` (max of 6 samples, 9 to 12 s after loading the spot on a fresh page, so the lazy kit GLBs have loaded, Stage 3, foes present, player on the floor). Budget is 300 per sector.

| Spot | Room | Draw calls |
|---|---|---|
| Breach Hall (x 10) | room_s3_breach | 95 |
| Cryo Stacks (x 36) | room_s3_stacks | 138 |
| Hatchery (x 108) | room_s3_hatchery | 128 |
| Power Spine (x 150) | room_s3_spine | 122 |
| Warden Arena (x 194) | room_s3_arena | 124 |

Console errors: 0.

## Screenshots

- `bulwark_shield_up.png`: Bulwark with the frost shield raised in front.
- `bulwark_shield_down.png`: Bulwark in its attack state, shield lowered and tilted to the ground in front of it.
- `cryo_stacks_rack_pipewall.png`: Cryo Stacks with coolant-pipe-wall units on the back lane and cryo-racks.
- `hatchery_pipe_wall.png`: Hatchery pipe walls with all foes alive.
- `warden_arena_pipe_wall.png`: `room_s3_arena` with the pipe walls.

## Findings

- The all-white enemies in the earlier `hatchery_pipe_wall.png` were not a regression. That capture used the `clearFoes` debug setup, which sets `alive = false` with `deathTicks = 0`, so every corpse sat on the first frame of the white death pop (`deathPopAmount`). Without `clearFoes` enemies render normally (see the screenshots above).
- The pipe walls were not visible because `face` mode puts them on the front plane of the floor slabs, below the floor edge. They now use a new `back` mode (upright on the floor top against the rear lane, `z = minZ + 1.2`), size 4.2 (4.4 in the arena), pitch 5, max 3.
- Kit GLBs stream in a few seconds after a sector loads, so a screenshot taken right after the setup call shows no props yet.

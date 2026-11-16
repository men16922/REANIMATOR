# R22 Stage 3 draw calls

Measured in the dev server with `__reanimator().perf.drawCalls` (max of 6 samples after the sector GLBs loaded, Stage 3, player on the floor). Budget is 300 per sector.

| Spot | Sector | Draw calls |
|---|---|---|
| Breach Hall (x 10) | airlock | 95 |
| Cryo Stacks (x 40, Bulwark fight) | shaft | 108 |
| Cryo Stacks (x 60) | shaft | 108 |
| Hatchery (x 105) | biolabs | 104 (94 with foes cleared) |
| Power Spine (x 165) | security | 104 |
| Spine end (x 185) | core | 104 |

Console errors: 0. Screenshots: `bulwark_shield_up.png`, `bulwark_shield_down.png` (shield lowered on the ground during windup), `hatchery_pipe_wall.png`. The cryo rack and coolant column are visible in `bulwark_shield_up.png`.

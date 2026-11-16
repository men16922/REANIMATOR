# R20 reel draw calls (dev server, live reel, peak per cut, sampled every 250 ms)

| Cut | Peak drawCalls |
|---|---|
| hook (lab) | 164 |
| classic | 189 |
| wake | 165 |
| combat | 306 (Stage 1, pre-existing, not changed here) |
| hunter | 273 |
| foreman (Stage 2) | 147 |
| spire (Stage 3) | 155 |
| warden | 162 |
| meltdown | 193 |
| endcard | 145 |

Screenshot: warden_arena_coolant.png (Stage 3 Warden Arena, coolant tank at left).

## After R20 polish (fd78fd5, every frame sampled over the live reel)

| Cut | Peak drawCalls |
|---|---|
| hook (lab) | 150 |
| classic | 175 |
| wake | 152 |
| combat | 287 (was 306) |
| hunter | 261 |
| foreman (Stage 2) | 136 |
| spire (Stage 3) | 145 |
| warden | 154 |
| meltdown | 194 |
| endcard | 136 |

Source of the combat peak (renderBufferDirect probe, one frame): about 55 calls were the sun shadow pass
(15 static foes, 15 ramps off screen but inside the shadow box, rig meshes). Fixes in scene3dFull.ts: nearest 5 foes cast,
ramps cast within 10 m of the camera focus, med/ammo pickups without pad decal and halo sprite, pillar collar rings instanced,
view cull margin 4 -> 2.5 m. Sampling noise between runs is about 3 calls.

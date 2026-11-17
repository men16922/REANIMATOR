# R12 Look pass (track C)

Display-side only. No sim, bot or reach3d change; sealed files untouched; no new PointLights.

## The orange ring
It was the **exit portal ring** (`exitPortalRing` in `scene3dFull.ts`): a bare `TorusGeometry(1.5)` above the Airlock exit at (5.5, 7.25), tinted orange (`0xff6b3d`) until the Core is destroyed, green after. It is now a diegetic **extraction hatch** (`src/render3d/hatch3d.ts`): a dark metal frame, an 8-blade iris with brushed segments, rivets and a hub, emissive amber seams that pulse while sealed, and an "EXTRACTION HATCH / SEALED" plate. When `coreDestroyed` the plate reads OPEN, seams turn green, the iris rotates and retracts, and a green glow well shows behind it. 4 draw calls instead of 1, built once per level.

## Pickups and reticle
- `getOrCreatePickupGroup`: the flat ring is replaced by a projector base (child[0]): a soft additive ground decal plus a slowly turning holo pad (outer ring, dashed ring, ticks), and a halo sprite at the item. Child indices [1..3] are unchanged, so item/log hologram animation is intact.
- Aim reticle: the cyan ring and orange dot became a thin broken-arc crosshair with ticks (`pickupGfx3d.ts`), rotating slowly (frozen under reduce motion).

## Surfaces
`textures3d.ts` gained `weather()`: grime blotches, drip streaks, edge scratches and a stencil mark. Applied to the deck map (`DK-07`) and wall map (`SEC-B`), so every sector using them gets breakup through the existing instanced materials; no new draw calls.

## Player readability
Operative fresnel rim raised (0.42 to 0.7), directional rim light 1.25 to 1.7, and a soft cool additive halo sprite behind the operative (hidden in Classic View and when dead).

## Grading
`SECTOR_GRADE` retuned for clearer sector identity inside the existing test bounds: Airlock cold steel, Mines hot orange, Biolabs toxic green, Security blue with violet lift; Core and Shaft keep warm reds/ambers. Bloom: Airlock 0.36, Shaft 0.33, Security 0.37.

## Verification
- `make check`: see the final report for the exit code.
- Screenshots (1200x843, headless browser via MCP, Chrome launch from the Node script aborts in this sandbox): `docs/evidence/r12_look/before/airlock.png`, `after/{airlock,mines,security}.png`. Biolabs and the other sectors' first views, and Classic View (V), were not re-captured: unverified visually.

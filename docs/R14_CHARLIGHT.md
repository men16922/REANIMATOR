# R14 Character Lighting (track C)

## Problem
User feedback: the hero reads fine, but other characters show mostly a highlighted outline (fresnel rim 0.55-0.7 plus
a dark body), so their form, surface and colours are hard to read at gameplay distance.

## Texture audit (src/render3d/riggedModels.ts)
- GLB materials come through `GLTFLoader`, which assigns sRGB to base colour and emissive maps and leaves ORM and
  normal maps linear. No code path overrides `map.colorSpace`. Static and rigged paths both `clone()` the
  `MeshStandardMaterial`, so every map survives.
- No maps are dropped for operative, bio-stalker, crawler, spitter or warden. The only intentional drop is the R11
  hunter steel (`applyHunterSteel`). No fix was needed.
- The real cause was lighting, not textures: `envMapIntensity` 0.6, a strong rim and a single global exposure.

## Rig design
`src/render3d/charLight3d.ts` holds the constants and one GLSL snippet. The snippet is injected next to the existing
rim term (`applyEnemyRim3D`, `applyWardenLook3D`), so it affects only character materials and never terrain. It adds:
- a camera-relative key (upper left front) and fill (lower right front), computed in view space, so the form is lit
  from the viewer's side regardless of sector light;
- a cheap crevice term: downward-facing normals darken to `CHAR_AO_FLOOR` (0.78);
- a character-only exposure multiplier (about one stop for enemies, 1.25-1.45 overall), leaving the global tone
  mapping and terrain unchanged.
No new `THREE.PointLight`, no extra shadow casters, no extra draw calls. `w.light` is untouched (R3.3). Shader cache
keys bumped to `enemy-rim-v2`, `enemy-rim-v2+scuttle-v1`, `warden-look-v2`.

## Per-kind values (rim / lift / key / fill / exposure)
| kind | rim | lift | key | fill | exposure |
|---|---|---|---|---|---|
| operative | 0.30 | 0.04 | 0.55 | 0.20 | 1.30 |
| heroGear | 0.25 | 0.02 | 0.45 | 0.15 | 1.30 |
| stalker | 0.32 | 0.10 | 0.70 | 0.28 | 1.45 |
| crawler / spitter | 0.30 | 0.10 | 0.70 | 0.28 | 1.45 |
| warden | 0.35 | 0 | 0.60 | 0.22 | 1.35 |
| hunter | 0.25 | 0 | 0.50 | 0.20 | 1.25 |

Also: enemy `envMapIntensity` 0.6 to 0.85, Warden 0.9 (kept, floor via max). Warden rim 0.55 to 0.35, hunter 0.22 to 0.25.
Classic View uses its own renderer and is unchanged.

## Verification
- `make check`: exit 0 (typecheck, node tests including new `tests/charlight.test.ts`, reference-verify, reach, reach3d,
  build, dist-guard).
- Sim untouched, no sealed files edited.
- UNVERIFIED: shader compile in a real browser, draw-call count (`make smoke-local`), and all before/after
  screenshots (`docs/evidence/r14_charlight/`). The sandbox could not launch Chrome (`smoke` reported NOT RUN) or a
  background vite server. Capture with `__reanimatorShowcase('bestiary')`, Airlock close-up, Bio-Labs stalker and
  Warden, and tune the table above by eye. No draw calls were added by design.

# R5 render track (draw calls, front faces, steam, boss camera)

Status: `make check` exit 0 in the r5/render worktree. Browser results below are unverified.

- Draw calls: `perf.byGroup` (new telemetry) lists visible meshes by scene-root group and geometry type. Hero weapons, the HP pack, the headlamp lens, hive sacs and hazard statics are merged by shared material (`src/render3d/meshMerge.ts`). The HP pack is one vertex-colored mesh recolored per frame. Hazard statics are merged per room.
- Front faces: `frontLift.ts` adds an albedo-tinted emissive term on camera-facing normals for wall and crate batches and individual walls, so shadowed full-depth faces no longer go black. No lights added.
- Steam: vent plume is a noise shader sheet behind the character lane (z = -0.7, depth test on, no depth write), peak alpha 0.2 (Classic x0.45); smoke puff rate and alpha reduced.
- Boss camera: `bossCamera.ts` blends the focus toward the player+boss midpoint and raises `camDistZ` up to 27. Classic ortho zoom derives from the same value. Off during intro and attract.
- Measurement note: on main 2e47a6b the headless browser showed 138 to 176 drawCalls in mines/security (not 401). The headless rAF barely advances, so camera convergence could not be observed live.

---
title: "Phase 6 — Penumbra SDF integration"
date: 2026-05-01
tags:
  - feature
  - penumbra
  - integration
status: in-progress
project: qualia
phase: "6"
---

# Phase 6 — Penumbra SDF integration

## Description

Drive Penumbra (the SDF rendering engine) from Qualia's `SceneManager` to render Visual Groups as SDF backdrops behind the Three.js node/edge meshes. Replaces the SDF rendering code that Phase 0 stripped out.

## Acceptance Criteria

- [x] Qualia depends on `@penumbra/three` via version-pinned tarballs (`file:../Penumbra/dist-pkg/penumbra-*-0.1.0.tgz`)
- [x] `SceneManager.setPenumbraRenderer(pass)` attaches a `PenumbraPass` and adds a fullscreen-quad backdrop scene
- [x] `SceneManager.updateVisualGroups(groups)` recompiles Visual Groups → `SDFScene` and pushes via `PenumbraPass.setScene()`
- [x] Render loop draws Penumbra backdrop, then nodes/edges on top, then labels
- [x] Disposal cleans up Penumbra GPU resources + backdrop geometry/material
- [x] `npm run typecheck` clean
- [x] `npm run build` succeeds
- [ ] Visual smoke test: load a context with Visual Groups, see SDF blobs render behind nodes
- [ ] Performance check: 100 nodes / 5 groups at 60fps
- [ ] Encoding bridge (Phase 4): graph metrics → SDF material/effects parameters
- [ ] Drag responsiveness: dragging a node updates Penumbra's positions per frame

## Implementation Notes

- **Conversion lives in Qualia** — `packages/renderer/src/PenumbraGroupCompiler.ts` translates `VisualGroup[]` (group + member-node positions) into `SDFScene` (one `point-cloud` field per group). Penumbra renders whatever scene it's given; mapping graph concepts to SDF concepts is Qualia's responsibility per ADR 0001.
- **Per-frame call order**: `controls.update()` → `transition.update(dt)` → `interaction.updateGumball()` → `_syncVisuals()` → `penumbra.render(camera)` → `renderer.render(backdropScene, backdropCamera)` → `renderer.render(scene, camera)` → labels.
- **Depth compositing not implemented in v1** — Penumbra's output is a flat color texture drawn as a background plane. SDF surfaces cannot occlude Three meshes. Acceptable for the "blob behind nodes" use case Phase 6 was scoped to. Track future depth handoff as its own ADR.
- **`?raw` shim removed (2026-05-01)** — Penumbra v0.1.1 shipped ADR 0005 (precompiled shader sources via `sources.generated.ts`), eliminating the 63 `?raw` imports. Qualia bumped to v0.1.1 tarballs; `penumbra-shims.d.ts` and the corresponding tsconfig include were deleted. Qualia typechecks and builds cleanly without any Vite-specific shader workaround.

## Files Changed

- `Qualia/packages/renderer/src/PenumbraGroupCompiler.ts` (new) — `compileGroupsToScene()`, `packPositions()`
- `Qualia/packages/renderer/src/SceneManager.ts` — Penumbra fields, render loop integration, `setPenumbraRenderer()`, `updateVisualGroups()`, dispose
- `Qualia/packages/renderer/src/index.ts` — re-exports `compileGroupsToScene`, `packPositions`, `PenumbraPass`
- `Qualia/package.json` — adds `@penumbra/{core,runtime,shaders,three}` deps + `@webgpu/types` devDep
- `Qualia/tsconfig.json` — adds `"types": ["@webgpu/types"]`

## Related

- ADR: `docs/decisions/0001-penumbra-as-rendering-engine.md`
- Phase doc: `QUALIA-CLAUDE-CODE-PHASES.md` § Phase 6
- Penumbra adapter: `Penumbra/packages/three/README.md`
- Cross-repo log entry: `MultiVerse/BUILD_LOG.md` 2026-05-01

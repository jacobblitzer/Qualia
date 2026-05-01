---
title: "Qualia cross-repo contracts"
tags:
  - peers
  - integration
status: active
project: qualia
---

# PEERS.md — Qualia Cross-Repo Contracts

## Penumbra (`C:\Repos\Penumbra\`)

**Role:** SDF rendering engine. Qualia consumes Penumbra to render Visual Groups as metaball/RBF blobs behind the Three.js node/edge meshes.

**Adapter:** `@penumbra/three` only. Qualia MUST NOT import from `@penumbra/runtime` or `@penumbra/core` directly — see [`Qualia/docs/decisions/0001-penumbra-as-rendering-engine.md`](../docs/decisions/0001-penumbra-as-rendering-engine.md) and Penumbra's [`docs/decisions/0004-host-adapter-boundaries.md`](../../Penumbra/docs/decisions/0004-host-adapter-boundaries.md).

**Penumbra-side files (the contract surface):**
- `packages/three/src/PenumbraPass.ts` — public class `PenumbraPass` (`setScene`, `render(THREE.Camera)`, `texture`, `resize`, `dispose`)
- `packages/three/src/camera-bridge.ts` — `cameraToPenumbra()`
- `packages/core` — canonical types (`SDFScene`, `SDFField`, `SDFMaterial`, `SDFEffects`, `SDFGeometry`, etc.)

**Qualia-side files:**
- `packages/renderer/src/SceneManager.ts` — `setPenumbraRenderer(pass)`, `updateVisualGroups(groups)`, render-loop integration (Penumbra backdrop scene rendered before main Three scene)
- `packages/renderer/src/PenumbraGroupCompiler.ts` — `VisualGroup[]` → `SDFScene` (one `point-cloud` field per group)
- `packages/renderer/src/index.ts` — re-exports `PenumbraPass` + compiler helpers
- `package.json` — `@penumbra/{core,runtime,shaders,three}` declared as `file:../Penumbra/dist-pkg/penumbra-*-0.1.1.tgz`

**Contract:**
- **Version-pinned dependency.** Qualia depends on Penumbra packed tarballs in `Penumbra/dist-pkg/`. Day-to-day Penumbra dev cannot break Qualia until Qualia explicitly bumps the references. See Penumbra [ADR 0006](../../Penumbra/docs/decisions/0006-penumbra-package-publication.md).
- **Sibling-checkout requirement.** `Penumbra/` and `Qualia/` must be checked out under a common parent (true at `C:\Repos\` today). Goes away when Phase 2 (GitHub Packages) lands.
- **Conversion lives on Qualia side.** Mapping `VisualGroup` (graph concept) → `SDFScene` (rendering concept) is Qualia's responsibility. Penumbra renders whatever scene it's given.
- **Visual encoding bridge** (graph metric → SDF parameter, table at `QUALIA-CLAUDE-CODE-PHASES.md:486-491`) lives on the Qualia side.
- **Camera matrices.** Qualia calls `camera.updateMatrixWorld()` and `camera.updateProjectionMatrix()` before `pass.render(camera)`. Penumbra never mutates Three state.
- **Depth compositing not implemented in v1.** Penumbra renders to a flat color texture used as a fullscreen background plane. SDF cannot occlude Three meshes. Acceptable for the initial "blob behind nodes" use case.

**Upgrade flow:**
1. Penumbra produces new tarballs + tags `v0.1.x`.
2. Qualia bumps `0.1.x` references in `package.json`.
3. `npm install` → typecheck → build → manual smoke test.
4. Commit + merge.

A failure at step 3 stays on a branch.

## MultiVerse (`C:\Repos\MultiVerse\`)

**Role:** Cross-repo coordination room. When Qualia changes affect Penumbra (contract, integration shape, version pin), append a one-line `BUILD_LOG.md` entry:

```
YYYY-MM-DD | cross-repo | Qualia → Penumbra | one-line summary
```

## Related

- Phase doc: `QUALIA-CLAUDE-CODE-PHASES.md` § Phase 6
- Decision: `docs/decisions/0001-penumbra-as-rendering-engine.md`
- Feature tracking: `docs/features/penumbra-integration.md`
- Penumbra peer file: `../../Penumbra/spec/PEERS.md`

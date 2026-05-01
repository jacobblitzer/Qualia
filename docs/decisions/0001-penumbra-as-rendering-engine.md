---
title: "Penumbra as Qualia's SDF rendering engine, consumed via @penumbra/three"
date: 2026-05-01
tags:
  - decision
  - architecture
  - integration
status: accepted
project: qualia
component: renderer
---

# Penumbra as Qualia's SDF rendering engine, consumed via `@penumbra/three`

## Context and Problem Statement

Qualia's `Phase 0` (strip) deleted all SDF rendering code in favor of clean integration hooks for an external SDF engine. `Phase 6` of `QUALIA-CLAUDE-CODE-PHASES.md` documents the planned `PenumbraIntegration` interface and the visual-encoding → SDF-parameter mapping. The two stub methods at `packages/renderer/src/SceneManager.ts:577-585` (`setPenumbraRenderer`, `updateVisualGroups`) are the contract surface.

Three questions had to be answered before wiring anything:

1. **Which engine?** — Penumbra. (Decided implicitly by the phase doc; this ADR records it formally.)
2. **What is the integration shape?** — Through `@penumbra/three`, the Three.js host adapter. NOT through `@penumbra/runtime` directly.
3. **How does Qualia depend on Penumbra?** — Via a version-pinned package, never source paths. See `Penumbra/docs/decisions/0006-penumbra-package-publication.md` for the publication mechanism.

The constraint that drives all three: Penumbra is platform-agnostic by design (`Penumbra/docs/decisions/0004-host-adapter-boundaries.md`). Qualia is one host of N — Rhino/Grasshopper, headless CI, and `@penumbra/studio` are the others. Qualia must not warp Penumbra's runtime API to suit React + Three.js, and Penumbra dev cycles must not break Qualia.

## Considered Options

1. **Embed Penumbra source as a Qualia subdirectory** — copy or submodule. Lowest install friction, highest coupling. Any Penumbra refactor breaks Qualia immediately. Rejected.

2. **Depend on `@penumbra/runtime` directly + write a Qualia-internal Three.js wrapper** — Qualia controls the Three integration. But this duplicates the work that `@penumbra/three` exists to do, and forks the Three integration into a Qualia-specific shape that Studio + future hosts can't reuse. Rejected by ADR 0004.

3. **Depend on `@penumbra/three`, version-pinned** — the documented host-adapter pattern. Qualia treats Penumbra as a black-box rendering library exposing `PenumbraPass`. Upgrades are explicit (`package.json` bump). Penumbra dev never touches Qualia source.

## Decision Outcome

Chosen option: **Option 3 (depend on `@penumbra/three`, version-pinned)**.

### Dependency wiring

`Qualia/package.json`:

```json
{
  "dependencies": {
    "@penumbra/core":    "file:../Penumbra/dist-pkg/penumbra-core-0.1.0.tgz",
    "@penumbra/runtime": "file:../Penumbra/dist-pkg/penumbra-runtime-0.1.0.tgz",
    "@penumbra/shaders": "file:../Penumbra/dist-pkg/penumbra-shaders-0.1.0.tgz",
    "@penumbra/three":   "file:../Penumbra/dist-pkg/penumbra-three-0.1.0.tgz"
  }
}
```

The relative path requires `Penumbra/` and `Qualia/` checked out as siblings (already true under `C:\Repos\`). When Penumbra migrates to GitHub Packages (per ADR 0006 Phase 2), this becomes a semver range + an `.npmrc` — no other Qualia changes.

### Integration surface

Qualia's `SceneManager` consumes `@penumbra/three` only. The two stubs at `packages/renderer/src/SceneManager.ts:577-585` become real:

```ts
// SceneManager owns a PenumbraPass instance.
// updateVisualGroups() converts VisualGroup[] → SDFScene → pass.setScene().
// The render loop calls pass.render(camera) each frame and composites
// pass.texture into the Three scene as a background plane.
```

The conversion `VisualGroup → SDFScene` (point-cloud → metaball/RBF SDF reconstruction) lives in Qualia. It is NOT Penumbra's responsibility — Penumbra just renders whatever scene it's given. This keeps the visual-encoding bridge (`avgEdgeConfidence → material.transparency`, etc., per `QUALIA-CLAUDE-CODE-PHASES.md:486-491`) on the Qualia side where graph metrics are available.

### What Qualia MUST NOT do

- Import from `@penumbra/runtime` or `@penumbra/core` to bypass `@penumbra/three`. The adapter is the contract.
- Modify Penumbra source to fix a Qualia bug. File a Penumbra issue / PR.
- Take a `git` dep on Penumbra (submodule, subtree). The `file:`/registry boundary is intentional.

### Consequences

- **Good:** Penumbra v4 Phase 3+ work continues unblocked; Qualia upgrades are explicit and skippable.
- **Good:** The same Penumbra package powers Studio, Rhino-via-CPig, and headless CI without forking. Qualia benefits from improvements made for any other host.
- **Good:** Qualia's bundle includes only what `@penumbra/three` re-exports — runtime internals are not surface area.
- **Bad:** Two-repo upgrade flow: Penumbra change → release → Qualia bump. Mitigated by ADR 0006 documenting the steps.
- **Bad:** Local-tarball path means CI must clone Penumbra as a sibling. Resolved when Phase 2 (GitHub Packages) lands.
- **Bad:** Depth compositing is not solved in `@penumbra/three` v1 — Qualia composites Penumbra's output as a background pass behind nodes/edges, no SDF-mesh occlusion. Acceptable for the initial visual-group rendering use case; tracked as future work in `@penumbra/three`'s README.

## Implementation Notes

- This ADR predates a `Qualia/CLAUDE.md`. When that file is created (close-out task #12), it gets a "Penumbra dependency" section linking here.
- The first Penumbra release tarball must be built before this ADR's `package.json` snippet works. Track via Penumbra's release process per ADR 0006.
- Qualia's `vite-plugin-glsl` is unrelated to Penumbra's shaders — it was used by the pre-strip SDF code. Leave or remove independently.

## Related

- `QUALIA-CLAUDE-CODE-PHASES.md` § Phase 6 — Penumbra integration hooks
- Stub methods: `packages/renderer/src/SceneManager.ts:577-585`
- `Penumbra/docs/decisions/0004-host-adapter-boundaries.md` — the rule that forces the adapter
- `Penumbra/docs/decisions/0006-penumbra-package-publication.md` — the publication mechanism
- `Penumbra/packages/three/README.md` — adapter usage

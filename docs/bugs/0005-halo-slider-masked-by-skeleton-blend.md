---
title: "Halo radius slider effect not visible — skeleton smooth-blend dominates"
date: 2026-05-02
tags:
  - bug
  - rendering
  - ux
status: resolved
project: qualia
component: penumbra-network-compiler
severity: low
fix-commit: "(working tree, 2026-05-02)"
---

# Halo radius slider effect not visible — skeleton smooth-blend dominates

## Summary
The `Halo radius` slider added in fix 0002 IS wired and re-pushes the Penumbra scene. But on dense graphs (12 nodes + 23 edges in the demo), the SDF silhouette is overwhelmingly determined by the **skeleton's** smooth-union (per-node spheres + per-edge capsules merged with `blendRadius: 0.3`). Reducing halo radius to 0.0 only removes the per-group color tinting; the underlying blob shape barely changes. User reasonably reports "halo radius has no effect."

## Environment
- OS: Windows 11
- Browser: Chrome 147 (WebGPU enabled)
- File: `Qualia/packages/renderer/src/PenumbraNetworkCompiler.ts`

## Root Cause
The skeleton's `skeletonBlend` default is `0.3`. Combined with edge capsules of radius `0.2` and node spheres of radius `0.4`, neighbors within ~0.7 world units smooth-fuse into one mass. With 23 edges in a 12-node graph and node spacing in the 1-5 unit range, much of the graph lives within fusion distance, producing a single continuous blob.

The halo is rendered as a separate point-cloud SDF field, smooth-unioned at the scene level. When halos are small (multiplier 0.25, group radius ~3-5 → halo ~0.75-1.25), the skeleton's surface mostly sits *outside* them, so reducing/increasing the halo barely changes the visible silhouette.

The slider works as designed; the issue is **discoverability** — the user can't tell what shapes the blob without independently controlling the skeleton fusion.

## Steps to Reproduce
1. Open Qualia, default demo dataset (Reporting Structure + Social Network superposition).
2. Open Perf panel (`P`).
3. Drag `Halo radius` slider from 0.7 → 0.25 → 0.0.
4. Observe: blob silhouette barely changes (only group-color tint variation).

## Fix
1. **Lower skeleton blend default** `0.3 → 0.15`. Less aggressive fusion; per-node and per-edge primitives are more visually distinct.
2. **Add a `skeletonBlend` field to `PerfSettings`** plumbed through `compileGraphToScene` opts.
3. **Add a `Skeleton blend` slider in PerfPanel** alongside the halo slider, range 0.0–1.0. Lets users tune fusion independently.
4. **Update Bug 0002 doc** noting the slider is now joined by skeleton-blend control.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] Skeleton blend = 0.0 → individual sphere/capsule primitives visible (sharp, no fusion)
- [ ] Skeleton blend = 1.0 → giant single blob (the previous default behavior)
- [ ] Halo radius slider effect now visible-distinct from skeleton effect

## Related
- Bug 0002 — Halo blobs swamp node detail (this bug is the residual issue after that fix)
- Files changed: `packages/renderer/src/PenumbraNetworkCompiler.ts`, `packages/renderer/src/SceneManager.ts`, `packages/ui/src/PerfPanel.tsx`

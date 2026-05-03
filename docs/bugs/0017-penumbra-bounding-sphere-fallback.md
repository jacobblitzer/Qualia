---
title: "Penumbra falls back to bounding-sphere because tapeEvalLimit too low"
date: 2026-05-02
tags:
  - bug
  - rendering
  - penumbra
status: resolved
project: qualia
component: penumbra-pass
severity: high
fix-commit: "(Penumbra v0.1.5 + Qualia working tree, 2026-05-02)"
---

# Penumbra falls back to bounding-sphere because tapeEvalLimit too low

## Summary
The Penumbra "halo" (the network blob) appeared as a single uniform sphere encompassing the graph's AABB instead of as a smooth-unioned spaceframe of node spheres + edge capsules. The user described it as "should look like a wood gloopy spaceframe, and it's just a sphere at the moment." This was the load-bearing visual bug behind Bugs 0002, 0005, and 0006 — they were all treating symptoms of the same fallback behavior.

## Environment
- File: `Penumbra/packages/runtime/src/renderer-webgpu.ts:1391`
- File: `Penumbra/packages/three/src/PenumbraPass.ts` (constructor — option not exposed)
- File: `Qualia/packages/ui/src/Viewport.tsx` (PenumbraPass instantiation)

## Root Cause
`PenumbraRendererWebGPU.setScene` classifies fields by tape length:

```ts
const useAtlas = this.currentEvalMode === 'atlas' ||
  (this.currentEvalMode !== 'multi-tape' && tape.instructionCount > this.tapeEvalLimit);
```

`tapeEvalLimit` defaults to **50 instructions**. Our skeleton field — 12 spheres + 23 capsules smooth-unioned — compiles to roughly **200–350 instructions** (each primitive ≈ 5–10 ops, each smooth-union ≈ 3–5 ops, 34 unions for 35 leaves). This trips the threshold; the field flips to atlas mode.

Until the atlas bake completes (which is non-trivial work in WebGPU and may not actually be reached), Penumbra renders the field via its **companion tape** — and the companion tape is **explicitly a bounding-sphere SDF** (`generateBoundingSphereTape(field.aabbMin, field.aabbMax)`, line 1474).

For 12 nodes spread across ~30 world units, the AABB bounding sphere is ~17 units in radius — exactly the giant uniform sphere the user has been seeing.

## Steps to Reproduce
1. Open Qualia at default demo with Penumbra enabled.
2. Observe: SDF backdrop is a single translucent sphere covering the viewport.
3. No matter how aggressively you tune `skeletonBlend` or `haloRadiusMultiplier`, the silhouette doesn't change — because what's rendering isn't the smooth-union at all, it's the bounding sphere fallback.

## Fix
1. **Penumbra**: `PenumbraPassOptions` exposes `tapeEvalLimit?: number` (default `500`, ten times Penumbra's internal default).
2. **Qualia**: `Viewport.tsx` passes `tapeEvalLimit: 500` when constructing `PenumbraPass`.
3. **Qualia**: `SceneManager.setPenumbraRenderer` calls `pass.setEvalMode('multi-tape')` after attach. This forces tape evaluation regardless of length — defensive against future heuristic changes in Penumbra.
4. **Penumbra version bump**: `@penumbra/three` 0.1.4 → 0.1.5 (additive — new option).

## Verification
- [ ] Skeleton renders as 12 distinct fused spheres + 23 capsule tubes (gloopy spaceframe)
- [ ] `skeletonBlend` slider visibly tightens/relaxes fusion
- [ ] `haloRadiusMultiplier` slider visibly scales the halo color regions
- [ ] No console warnings about atlas builds failing or tape compilation overruns

## Related
- Master research doc: `Qualia/docs/research/2026-05-02-debug-effort-edges-halo-gi.md` (Issue B)
- Earlier symptom-treatments now resolved at the root: Bugs 0002, 0005, 0006
- Penumbra v0.1.5 release: `@penumbra/three` adds `tapeEvalLimit` option

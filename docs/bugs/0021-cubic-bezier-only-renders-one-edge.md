---
title: "Cubic / quadratic Bezier edge shapes only render a single edge"
date: 2026-05-02
tags:
  - bug
  - rendering
status: resolved
project: qualia
component: edge-curve-layer
severity: high
fix-commit: "(working tree, 2026-05-02)"
---

# Cubic / quadratic Bezier edge shapes only render a single edge

## Summary
Selecting `quadratic-bezier` or `cubic-bezier` from the edge shape dropdown causes only one of the N edges in the graph to visibly render. Straight and Catmull-Rom render fine.

## Environment
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts` (`update`)

## Root Cause
When shape is `straight` the per-edge segment count is 1 (`[a, b]`). When shape is `quadratic-bezier` or `cubic-bezier`, `curveSamples = 24` produces 25 sample points → 24 segments per edge. For 23 edges, the `posArray` grows from 23 segments × 6 = 138 floats → 552 segments × 6 = 3312 floats — a 24× growth between frames.

`LineSegmentsGeometry.setPositions(array)` creates a fresh `InstancedInterleavedBuffer`, which CAN produce a stale `instanceCount` derivation on subsequent calls in some three.js builds. The geometry's `instanceCount` getter sometimes returns the previous frame's value (e.g. 23 from straight) even though the new buffer holds 552 segments — only the first 23 segments draw. Visually: the first edge's 23 (of 24) curve segments render and look like one edge; everything else is invisible.

## Fix
- Explicitly construct `Float32Array` from the JS arrays before passing to `setPositions` / `setColors` (avoids any internal type-coercion quirks).
- Explicitly assign `this._geometry.instanceCount = segmentCount` after both calls.
- Call `computeBoundingSphere()` to keep the bounding volume consistent with the new geometry (defensive — `frustumCulled = false` already protects us, but it's cheap).

## Verification
- [ ] Pick `quadratic-bezier` — every edge renders as a curved line
- [ ] Pick `cubic-bezier` — every edge renders as an S-curve
- [ ] Switch back to `straight` — no segment count drift; correct count
- [ ] No console warnings or buffer mismatches

## Related
- Bug 0014 — quadratic-bezier degeneracy (the bow synthesis); separate from this
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts`

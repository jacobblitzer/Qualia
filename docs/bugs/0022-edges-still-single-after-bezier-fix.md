---
title: "Edges still display single/inconsistent — Bug 0021 fix didn't generalize"
date: 2026-05-02
tags:
  - bug
  - rendering
status: open
project: qualia
component: edge-curve-layer
severity: high
fix-commit: ""
---

# Edges still display single/inconsistent — Bug 0021 fix didn't generalize

## Summary
After Bug 0021's `Float32Array` + `instanceCount` fix, the user still observes edges displaying inconsistently / "only one edge at a time" — even with shape='straight' where the fix should have applied to the simplest path.

## Environment
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts` (`update`)
- Three.js r170, `LineSegmentsGeometry` + `LineMaterial` from addons

## Symptoms
- Snapshot 20260502-124009: shape='straight', 23 active edges, but visible viewport shows few-to-no edge lines between nodes (most node pairs have no connecting line drawn).
- Bug 0021's Bezier-specific fix should also help straight (it lowered instanceCount as part of its work) but doesn't appear to.

## Likely causes (ranked by plausibility)
1. **Buffer staleness despite explicit `instanceCount`.** `LineSegmentsGeometry.setPositions` swaps the underlying `InstancedInterleavedBuffer` but the `instanceStart`/`instanceEnd` `InterleavedBufferAttribute`s may need explicit `needsUpdate = true` flags. Try after `setPositions`: `geometry.attributes.instanceStart.needsUpdate = true; geometry.attributes.instanceEnd.needsUpdate = true; geometry.attributes.instanceColorStart.needsUpdate = true; geometry.attributes.instanceColorEnd.needsUpdate = true;`
2. **`maxInstancedCount` vs `instanceCount` API drift.** Three.js r170 may use either name; setting one might not propagate. Try setting both: `geometry.instanceCount = N; (geometry as any).maxInstancedCount = N;`
3. **`computeBoundingSphere` returning NaN with degenerate geometry.** If any segment has zero length (NaN ratio in shader), the geometry's bounding sphere may compute as NaN, triggering culling or clipping despite `frustumCulled = false`.
4. **Premultiplied alpha + transparent + worldUnits:false interaction.** LineMaterial's screen-space line width with transparent alpha blending may have an edge case where the second-and-later instance is discarded when the first instance's alpha is opaque-enough to "consume" the depth slot.

## Diagnostic plan
1. Add a debug log in `EdgeCurveLayer.update` that emits once per second:
   - `posArray.length`
   - `segmentCount`
   - `geometry.instanceCount`
   - `geometry.attributes.instanceStart?.count`
   - `material.opacity`
2. Capture in next snapshot under `runtime.edgeDebug`.
3. If any number is wrong, identify which step in the chain corrupts it.

## Fix candidates
1. Explicit `needsUpdate` on all four interleaved attributes.
2. Set both `instanceCount` and `maxInstancedCount`.
3. Replace `LineSegments2 + LineSegmentsGeometry` with vanilla `THREE.LineSegments + BufferGeometry` if r170's instanced lines are unreliable here. Loses screen-space line width but gains predictable rendering.

## Related
- Bug 0021 (the fix that didn't fully take)
- Bug 0016, 0010 (earlier edge invisibility rounds)
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts`

---
title: "Snapshot reads computed material values, not override fields"
date: 2026-05-02
tags:
  - bug
  - debugging
status: resolved
project: qualia
component: snapshot
severity: low
fix-commit: "(working tree, 2026-05-02)"
---

# Snapshot reads computed material values, not override fields

## Summary
The debug snapshot's `viewer.edgeOpacity` reads from `LineMaterial.opacity` instead of `_edgeOpacityOverride`. During slider interaction the override is updated synchronously while the material lags by one render tick. Snapshot can show stale or contradictory values that mask the real Bug 0010.

Beyond that one field, the snapshot misses other interactive state worth capturing: `_isLightMode`, `_savedDarkState`, the active `_animFrame` id (whether the loop is alive), the actual edge segment count after Bezier sampling (vs. raw edge count).

## Fix
Update `gatherSettings()` to:
- Add `viewer.edgeOpacityOverride` reading the SceneManager's `_edgeOpacityOverride` (via a new public getter)
- Add `runtime.renderLoopAlive` (whether `_animFrame !== 0`)
- Add `runtime.lightMode` boolean
- Add `runtime.edgeSegments` — the post-sampling count from EdgeCurveLayer (not just the input edge count)
- Add `runtime.nodeBucketsActive` — for NodeAtomLayer, count of active shape buckets

These help diagnose lag (segments=many, mode=bounding-sphere → suspect Bug 0011), opacity drift, etc.

## Verification
- [ ] Snapshot includes the new override + runtime fields
- [ ] During slider drag, `edgeOpacityOverride` matches the slider position; `edgeOpacity` (from material) shows the post-render value
- [ ] Edge segment count grows when shape changes from straight → catmull-rom

## Related
- Bug 0010 — root cause of the drift the snapshot was hiding
- File: `Qualia/packages/ui/src/snapshot.ts`

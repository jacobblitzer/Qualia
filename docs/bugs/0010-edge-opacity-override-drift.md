---
title: "Edge opacity override drifts from material; snapshot reports stale value"
date: 2026-05-02
tags:
  - bug
  - rendering
  - ux
status: resolved
project: qualia
component: scene-manager + snapshot
severity: medium
fix-commit: "(working tree, 2026-05-02)"
---

# Edge opacity override drifts from material; snapshot reports stale value

## Summary
The Settings panel's `Opacity` slider for edges drives `_edgeOpacityOverride` on `SceneManager`. The actual `LineMaterial.opacity` lags by one render frame because `_syncVisuals` only re-applies the override during its next render tick. The debug snapshot reads `material.opacity` for `viewer.edgeOpacity` — so during interaction (or right after a slider change), the snapshot can show stale values that disagree with the slider's visible position. In the worst case, an override of 0 has been applied and edges are invisible while JSON reports 0.6.

## Environment
- File: `Qualia/packages/renderer/src/SceneManager.ts` (`applyViewerSettings`, `_syncVisuals`, `getViewerSettings`)
- File: `Qualia/packages/ui/src/snapshot.ts`

## Root Cause
`applyViewerSettings({ edgeOpacity: v })` updates `_edgeOpacityOverride` but does not re-render or re-apply the material immediately. The first chance the override has to take effect is the next `_render → _syncVisuals → edgeMesh.update`, which writes `material.opacity = override`. Until then:
- Material's `.opacity` is the previous frame's value
- The slider visually shows the new value
- Two writers (slider, frame loop) get out of sync briefly

`getViewerSettings` reads from material → snapshot disagrees with the override the user clearly set.

## Steps to Reproduce
1. Open Qualia, take a snapshot at default opacity 0.6 → JSON shows 0.6, edges visible.
2. Drag the Opacity slider rapidly to 0.0.
3. Take another snapshot quickly. JSON might show 0.6 (stale) or 0.0; visual UI may differ from JSON.

## Fix
1. **Synchronous re-sync on settings change.** `applyViewerSettings` should call `_syncVisuals()` immediately after updating any override, so the next render tick is correct AND the material picks up the new value within the same call stack.
2. **Snapshot reads override too.** Change `viewer.edgeOpacity` source from `material.opacity` to `_edgeOpacityOverride ?? defaultOpacity`. Also include the override field separately in the snapshot for transparency.

## Verification
- [ ] Slider Opacity changes → next render frame shows the new opacity
- [ ] Snapshot's `viewer.edgeOpacity` matches the slider's visible position at all times
- [ ] Edges no longer "disappear" due to override-drift

## Related
- Files: `SceneManager.ts`, `snapshot.ts`

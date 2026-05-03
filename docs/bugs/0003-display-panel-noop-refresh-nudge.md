---
title: "Display panel uses no-op `setNodeDisplayMode` to force re-resolve"
date: 2026-05-02
tags:
  - bug
  - ui
status: resolved
project: qualia
component: display-panel
severity: low
fix-commit: "(working tree, 2026-05-02)"
---

# Display panel uses no-op `setNodeDisplayMode` to force re-resolve

## Summary
When the user changes a `nodeType.sdfAtom` or `nodeType.displayMode` in the Display panel, the panel calls `renderer.setNodeDisplayMode(globalMode)` (passing the *current* global mode unchanged) as a side-effect to trigger `nodeMesh.update()`. This works by accident because `setNodeDisplayMode` always re-runs `update()`, but if a future optimization adds a "skip when value unchanged" check, the refresh stops happening silently.

## Environment
- File: `packages/ui/src/NodeDisplayPanel.tsx`

## Root Cause
The panel mutates the in-memory `nodeType` object directly (e.g. `t.sdfAtom = { shape }`), then nudges:

```ts
renderer.setNodeDisplayMode(globalMode);
```

This re-runs `nodeMesh.update(...)` as a side-effect of `setGlobalDisplayMode` triggering rebuild. The intent is "rebuild after data change," but the API used is "set display mode." The two are accidentally equivalent today.

## Steps to Reproduce
- Not user-visible. Code review concern: brittle to future refactors of `setNodeDisplayMode`.

## Fix
- Add `SceneManager.refreshNodeAtoms()` — explicit method that re-runs `nodeMesh.update(positions, nodes, nodeTypes, selectedIds, hovered)` without changing display mode.
- Pass-through on `QualiaRenderer`.
- `NodeDisplayPanel` calls `renderer.refreshNodeAtoms()` after every nodeType edit.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] Edit a nodeType's shape → InstancedMesh bucket updates as before
- [ ] Edit a nodeType's display mode override → overlay group updates
- [ ] No regression in node click/hover/select interactions

## Related
- Files changed: `packages/renderer/src/SceneManager.ts`, `packages/renderer/src/QualiaRenderer.ts`, `packages/ui/src/NodeDisplayPanel.tsx`

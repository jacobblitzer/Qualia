---
title: "Gumball drag amplifies overlay rebuild thrash"
date: 2026-05-02
tags:
  - bug
  - performance
status: resolved
project: qualia
component: scene-manager + node-atom-layer
severity: medium
fix-commit: "(resolved as side-effect of Bug 0011, 2026-05-02)"
---

# Gumball drag amplifies overlay rebuild thrash

## Summary
The Bug 0007 fix added `this.refreshNodeAtoms()` to `updateNodePosition` so dragging immediately reflects in the visible mesh. But `refreshNodeAtoms` runs the full `nodeMesh.update(...)`, which in non-mesh display modes hits Bug 0011's overlay rebuild path. Result: dragging in `bounding-sphere` mode fires 12 dispose+create overlay ops *per gumball drag tick* on top of the regular per-frame rebuild. Compound thrash → severe lag during drag.

## Fix
Resolved automatically by fixing Bug 0011 (cache overlays). Once `nodeMesh.update` is cheap regardless of display mode, the per-drag `refreshNodeAtoms` becomes lightweight. No additional change needed.

If Bug 0011's fix doesn't fully resolve drag perf, follow-up: switch `refreshNodeAtoms` to a "positions-only" code path that updates instance matrices / overlay transforms without re-running the full bucket-fill loop.

## Verification
- [ ] After Bug 0011's caching fix, drag a node in `bounding-sphere` mode — smooth at 60 fps
- [ ] No overlay leaks (count stable during prolonged drag)

## Related
- Bug 0007 — the fix that introduced the per-drag refresh call
- Bug 0011 — the underlying perf problem

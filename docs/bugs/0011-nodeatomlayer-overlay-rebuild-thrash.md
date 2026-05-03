---
title: "NodeAtomLayer rebuilds overlay objects every frame in non-mesh display modes"
date: 2026-05-02
tags:
  - bug
  - performance
  - rendering
status: resolved
project: qualia
component: node-atom-layer
severity: high
fix-commit: "(working tree, 2026-05-02)"
---

# NodeAtomLayer rebuilds overlay objects every frame in non-mesh display modes

## Summary
When `nodeMode` is `bounding-sphere`, `aabb`, or `point-cloud`, `NodeAtomLayer.update()` disposes all overlay group children and creates fresh `THREE.LineSegments` / `THREE.Points` objects for every node every frame. With 12 nodes at 60 Hz, that's **720 dispose+create operations per second**. This is the dominant lag source on the Three side — even with Penumbra disabled, the user feels 2-second click latency because GC pressure + object allocation churn + GPU buffer reallocation block the main thread.

## Environment
- File: `Qualia/packages/renderer/src/NodeAtomLayer.ts` (`update`)
- Reproduces on default demo with display mode set to bounding-sphere/aabb/point-cloud

## Root Cause
```ts
// Clear overlays — re-populated below if mode requires
for (const g of Object.values(this._overlayGroups)) {
  while (g.children.length) {
    const child = g.children[0];
    g.remove(child);
    disposeObject(child);     // dispose geometry + material
  }
}
// ... per-node:
this._overlayGroups.boundingSphere.add(buildBoundingSphereOverlay(pos, atom, color));
```

`buildBoundingSphereOverlay` creates fresh `IcosahedronGeometry`, `EdgesGeometry`, `LineBasicMaterial`, `LineSegments` each call. Same for AABB and point-cloud builders.

The cost compounds with Bug 0013 (gumball drag also fires `refreshNodeAtoms` per drag tick).

## Steps to Reproduce
1. Open Qualia at default demo.
2. Open the Display panel (D), switch global display mode to `bounding-sphere`.
3. Click any node — gumball appears with noticeable delay.
4. Drag a node — visible stutter.
5. (Penumbra can be disabled — lag persists.)

## Fix
- **Cache overlay objects keyed by node id.** First time a node is encountered in non-mesh mode, build its overlay; thereafter just update its position/transform.
- **Dispose only when:** display mode changes (rebuild is unavoidable for the new shape), node atom shape changes, or a node is removed from the graph.
- **Color-only updates:** bounding-sphere/aabb materials get color changes via `material.color.set(...)` — no rebuild needed.
- Position-only updates: `mesh.position.set(...)` per overlay.
- Track a `_overlayMode` field; if it differs from the new mode, dispose all caches (mode change is rare).

## Verification
- [ ] Node display mode = `bounding-sphere`, click latency < 100 ms
- [ ] Gumball drag in `bounding-sphere` mode is smooth
- [ ] Switching display modes clears old overlays + builds new ones once
- [ ] Adding/removing nodes triggers create/dispose only for the affected ids
- [ ] No memory leak after long sessions (overlay count == node count)

## Related
- Bug 0013 — gumball drag thrashes the same path; fixed by this bug's caching
- File: `Qualia/packages/renderer/src/NodeAtomLayer.ts`

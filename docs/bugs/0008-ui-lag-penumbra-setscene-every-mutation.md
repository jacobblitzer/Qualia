---
title: "UI lag — Penumbra setScene fires on every store mutation"
date: 2026-05-02
tags:
  - bug
  - performance
status: resolved
project: qualia
component: viewport-store-subscription
severity: high
fix-commit: "(working tree, 2026-05-02)"
---

# UI lag — Penumbra setScene fires on every store mutation

## Summary
40 fps on a 12-node demo. Click events take ~2 seconds to register the gumball appearance. Cause: `Viewport.tsx`'s store subscriber calls `sm.updateVisualGroups(...)` → `_pushPenumbraScene` → `pass.setScene` on EVERY store change. Penumbra's `setScene` rebuilds its atlas, which is expensive. With layout running, this fires once per frame.

## Environment
- File: `Qualia/packages/ui/src/Viewport.tsx:103`

## Root Cause
```ts
const unsubscribe = store.subscribe(() => {
  if (!attached) return;
  sm.updateVisualGroups(store.getActiveGroups());
});
```

`store.subscribe(listener)` is called for every state mutation including position updates from the layout solver. Each call rebuilds the entire SDFScene and triggers atlas rebuild on Penumbra. Atlas rebuild includes shader compilation paths in some cases.

## Steps to Reproduce
1. Open Qualia, default demo.
2. Note FPS counter (Perf panel → 40 fps).
3. Click any node. Time how long until gumball appears (~2 seconds).

## Fix
Throttle the subscription callback. Two strategies:

1. **Time-based throttle**: rate-limit to max 5 Hz (200 ms minimum gap between calls). Simple, effective, has a small "trailing" issue where the last update may be slightly stale.

2. **Rising-edge differentiation**: track `groups` version separately from `positions` version; only trigger Penumbra rebuild when groups/edges/topology actually changed. Position-only updates don't need full rebuild — they can use Penumbra's per-field-transform updates instead.

Going with **(1) time-throttle** for v1: simpler, addresses the immediate lag, leaves (2) as a future optimization. 200 ms throttle = 5 rebuilds/sec max = perceivable as smooth without overwhelming GPU.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] FPS at default demo: ~60 fps (was 40)
- [ ] Click latency: gumball appears <100 ms after click
- [ ] Drag lag: drag-induced layout updates don't pile up rebuilds

## Related
- Files changed: `Qualia/packages/ui/src/Viewport.tsx`
- Future optimization: per-field transform updates for position-only changes

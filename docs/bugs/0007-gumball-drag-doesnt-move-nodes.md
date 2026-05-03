---
title: "Gumball drag doesn't move nodes (esp. in superposition mode)"
date: 2026-05-02
tags:
  - bug
  - interaction
status: resolved
project: qualia
component: scene-manager
severity: high
fix-commit: "(working tree, 2026-05-02)"
---

# Gumball drag doesn't move nodes (esp. in superposition mode)

## Summary
The gumball widget renders and can be visually dragged, but the underlying node doesn't follow. Confirmed: when in "All (Superposition)" view (`activeContextId: null`), the drag silently does nothing. Same issue manifests in Penumbra Studio's gumball as well — common pattern.

## Environment
- File: `Qualia/packages/renderer/src/SceneManager.ts:921`

## Root Cause

```ts
updateNodePosition(nodeId, position): void {
  const contextId = this._store.state.activeContextId;
  if (!contextId) return;                  // ← bails on superposition
  const ctx = this._store.state.contexts.get(contextId);
  if (!ctx?.positions) return;
  ctx.positions[nodeId] = position;
}
```

Two issues:
1. **`activeContextId` null bailout** means superposition mode silently rejects drags. The user clicks, drags the gumball, releases — no error, no movement.
2. **Direct mutation of `ctx.positions`** doesn't notify subscribers. Even when there IS an active context, the change updates the data but not the version-tracked state listeners. The render loop reads from `_getCurrentPositions()` which goes through `EventStore.getActivePositions()` — that may or may not pick up the mutation depending on caching.

## Steps to Reproduce
1. Open Qualia, default demo (boots into "All (Superposition)").
2. Click a node — gumball appears.
3. Drag the gumball arrows.
4. Observe: gumball tracks the cursor but the node sphere/icon stays put.

## Fix
- **Superposition handling**: when `activeContextId` is null, iterate every context that has the node in its positions map and update each. Drag in superposition affects all underlying contexts uniformly (consistent with "show union" semantics).
- **Subscriber notification**: emit a state mutation that the store treats as a position update. Either bump a version counter that listeners watch, or call a `forcePositionUpdate(nodeId, pos)` helper on EventStore.
- **Per-frame position read**: ensure SceneManager's render loop reads the freshly-updated positions on the next tick.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] In active context: drag gumball → node moves; release → position persists
- [ ] In superposition: drag gumball → node moves in every underlying context's snapshot
- [ ] Gumball position re-anchors at the new node position after release
- [ ] Penumbra skeleton blob updates to match new node position

## Related
- Files changed: `Qualia/packages/renderer/src/SceneManager.ts`, possibly `Qualia/packages/core/src/EventStore.ts`

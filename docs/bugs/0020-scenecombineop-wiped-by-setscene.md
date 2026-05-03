---
title: "Smooth halo blend / blend radius reset on every setScene"
date: 2026-05-02
tags:
  - bug
  - rendering
  - penumbra
status: resolved
project: qualia
component: scene-manager
severity: medium
fix-commit: "(working tree, 2026-05-02)"
---

# Smooth halo blend / blend radius reset on every setScene

## Summary
The "Smooth halo blend" toggle and "Halo blend radius" slider take effect briefly when the user moves them, then visually revert to discrete halos a moment later. User reported "blend/blend radius are not consistently effective, but I did observe them working" — exactly the symptom of an effective change being silently overwritten.

## Environment
- File: `Qualia/packages/renderer/src/SceneManager.ts` (`_pushPenumbraScene`, `setPenumbraRenderer`, `setPerfSettings`)
- Penumbra side: `runtime/src/renderer-webgpu.ts:setSceneCombineOp` (line 2156) and `:setScene` (line 1316)

## Root Cause
`setSceneCombineOp` writes per-field combineOp/blendRadius into `this.fields[i]`. But `setScene` rebuilds the fields array from scratch (`this.fields = []` at line 1316) and re-pushes default `combineOp: 0, blendRadius: 0.5` for every field.

Qualia's flow:
1. `setPenumbraRenderer` — calls `setSceneCombineOp` once → applied to fields array (which is empty at that point — no effect)
2. `_pushPenumbraScene` — calls `setScene` → fields rebuilt with defaults
3. User toggles "Smooth halo blend" → `setPerfSettings` calls `setSceneCombineOp` → fields temporarily get the user's setting
4. Next store mutation (anything — drag, layout tick, group edit) → throttled `_pushPenumbraScene` fires → `setScene` re-rebuilds fields → user's setting wiped
5. Visually: blend mode "intermittently" works

## Fix
Move the `setSceneCombineOp` call to **after `pass.setScene` completes**, inside `_pushPenumbraScene`. Reads the current `_perf.smoothHaloBlend` / `_perf.haloBlendRadius` so it always re-applies the user's intent immediately after Penumbra's reset. Also remove the old at-attach call (now redundant).

## Verification
- [ ] Toggle "Smooth halo blend" — adjacent halos fuse, stay fused across drag/layout
- [ ] Drag "Halo blend radius" — fusion radius responds, stays at the slider value
- [ ] Toggle off — halos discretely separated, stay discrete

## Related
- Bug 0006 — original setSceneCombineOp introduction (atomic; wasn't yet exposed to user)
- Bug 0008 — throttled subscribe (the "throttled re-push" that wipes the user's setting)
- File: `Qualia/packages/renderer/src/SceneManager.ts`

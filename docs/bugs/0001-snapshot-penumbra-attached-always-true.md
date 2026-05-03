---
title: "Snapshot reports `penumbra.attached: true` regardless of actual state"
date: 2026-05-02
tags:
  - bug
status: resolved
project: qualia
component: snapshot
severity: low
fix-commit: "(working tree, 2026-05-02)"
---

# Snapshot reports `penumbra.attached: true` regardless of actual state

## Summary
The debug snapshot's `penumbra.attached` field is always `true` because the check is on a method's existence, not on whether a `PenumbraPass` instance is actually wired in.

## Environment
- OS: Windows 11
- Browser: Chrome 147
- Qualia version: 0.1.0
- File: `packages/ui/src/snapshot.ts`

## Root Cause
`gatherSettings()` does:

```ts
penumbra: {
  attached: !!(renderer as unknown as { getSceneManager?: () => unknown }).getSceneManager,
  ...
}
```

`QualiaRenderer.getSceneManager` is a real method on the class, so the cast resolves it as a function, and `!!` always returns `true`. The check has no relationship to whether the user's environment has a `PenumbraPass` attached or not.

## Steps to Reproduce
1. Open Qualia in a non-WebGPU browser (or with WebGPU disabled).
2. The console will log `[Penumbra] WebGPU unavailable; SDF backdrop disabled.` — `setPenumbraRenderer` is never called.
3. Take a snapshot.
4. `settings.json` shows `"penumbra": { "attached": true, ... }` despite no pass being attached.

## Fix
- Add `get hasPenumbra(): boolean` on `SceneManager` returning `this._penumbra !== null`.
- Pass-through on `QualiaRenderer.hasPenumbra`.
- `snapshot.ts` reads `renderer.hasPenumbra` instead of probing for method existence.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] Open in WebGPU browser → snapshot shows `attached: true`
- [ ] Open in non-WebGPU browser → snapshot shows `attached: false`
- [ ] Manual: take two snapshots, one with WebGPU and one without; confirm differing values

## Related
- Files changed: `packages/renderer/src/SceneManager.ts`, `packages/renderer/src/QualiaRenderer.ts`, `packages/ui/src/snapshot.ts`

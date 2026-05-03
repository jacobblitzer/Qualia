---
title: "Resolution scale corrupts SDF backdrop — small blob in corner + old content elsewhere"
date: 2026-05-02
tags:
  - bug
  - rendering
  - webgpu
status: resolved
project: qualia
component: penumbra-pass
severity: medium
fix-commit: "(Penumbra v0.1.3 + Qualia working tree, 2026-05-02)"
---

# Resolution scale corrupts SDF backdrop — small blob in corner + old content elsewhere

## Summary
With `penumbraResolutionScale < 1.0` the Penumbra SDF appears at small size in the upper-left of the viewport, with stale "echo" content visible elsewhere. The slider doesn't gracefully scale the rendered SDF; it produces a corrupted backdrop instead.

## Environment
- OS: Windows 11
- Browser: Chrome 147 (WebGPU enabled)
- Qualia version: 0.1.0
- File: `Penumbra/packages/three/src/PenumbraPass.ts`

## Root Cause
`PenumbraPass.resize(width, height)` mutates `canvas.width` / `canvas.height`. WebGPU re-establishes its swapchain to match. But the **`THREE.CanvasTexture` wrapping that canvas does not re-allocate its underlying GPU texture** — the previous-frame's larger GPU texture allocation persists, and Three only uploads the *new* (smaller) canvas pixels into the upper-left corner of that allocation. The rest of the GPU texture retains stale data from before the resize.

When the backdrop quad samples this texture in UV [0,1] across the full viewport, the result is the small new content stretched to a portion of the quad (proportional to scaledCanvasW / oldGpuTexW) and the rest is leftover pixels.

## Steps to Reproduce
1. Open Qualia in a WebGPU browser.
2. Open the Perf panel (`P`).
3. Drag the **Resolution** slider down to ~20%.
4. Observe: SDF blob appears small in upper-left corner; rest of viewport shows previous-frame remnants.

## Fix
- **`PenumbraPass.resize`**: after mutating canvas dimensions, dispose the existing `CanvasTexture` and create a new one wrapping the same canvas. The new texture forces a fresh GPU allocation matching the new dimensions.
- **`PenumbraPass`**: add an `onTextureReplaced(cb)` registration so consumers (Qualia's `SceneManager`) can update their backdrop material's `.map` reference. Without this, the material would still point at the disposed texture.
- **`SceneManager.setPenumbraRenderer`**: register a callback that swaps `_penumbraBackdrop.material.map` to the new texture and flags the material `needsUpdate`.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] Resolution 100% → identical visual to before
- [ ] Resolution 50% → SDF visibly chunkier but covers entire viewport (no upper-left clipping)
- [ ] Resolution 20% → very chunky/pixelated SDF, but still covers viewport
- [ ] Toggling resolution back to 100% → no leftover artifacts

## Related
- Files changed: `Penumbra/packages/three/src/PenumbraPass.ts`, `Qualia/packages/renderer/src/SceneManager.ts`
- Penumbra version bump (mandatory, since the adapter API gains `onTextureReplaced`)

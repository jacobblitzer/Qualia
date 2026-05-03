---
title: "Penumbra backdrop is opaque + halo slider doesn't reduce blob size"
date: 2026-05-02
tags:
  - bug
  - rendering
  - shaders
status: resolved
project: qualia
component: penumbra-pass + scene-combine
severity: high
fix-commit: "Penumbra v0.1.4 (shaders v0.1.3 miss=alpha0) + Qualia working tree, 2026-05-02"
---

# Penumbra backdrop is opaque + halo slider doesn't reduce blob size

## Summary
Two related bugs in the SDF backdrop:

1. **Opaque "miss" pixels.** The Penumbra fragment shader writes `vec4(bg, 1.0)` for ray-march misses. The CanvasTexture mirror'd onto the Three backdrop quad is therefore fully opaque everywhere, not just on the SDF surface. Result: the backdrop covers the entire viewport, washing out the underlying Three.js scene wherever the SDF doesn't render.

2. **Halo radius slider has no visible effect.** Skeleton (per-node spheres + per-edge capsules) and per-group halos are emitted as separate `SDFField` entries. Penumbra's renderer applies a scene-level `setSceneCombineOp` that defaults to smooth-union, fusing all fields into one continuous blob regardless of per-field params. Reducing halo radius shrinks the halo geometrically, but it gets smooth-unioned into the skeleton anyway, so the silhouette barely changes.

## Environment
- OS: Windows 11
- Browser: Chrome 147 (WebGPU enabled)
- Files: `Penumbra/packages/shaders/src/wgsl/main.wgsl`, `Penumbra/packages/shaders/src/wgsl/main-atlas.wgsl`, `Qualia/packages/renderer/src/SceneManager.ts`

## Root Cause

### Sub-bug A — opaque backdrop
`main.wgsl` ~line 567 (and the mirror in `main-atlas.wgsl`):
```wgsl
output.color = vec4f(u.bgColorR, u.bgColorG, u.bgColorB, 1.0);
```
With WebGPU canvas alphaMode='premultiplied', alpha=1.0 means the pixel is fully opaque. The Three backdrop material with `transparent: false` doesn't blend, so the texture covers the viewport.

### Sub-bug B — halo scene-fusion
`SceneManager.setPenumbraRenderer` doesn't call `pass.setSceneCombineOp(...)`. Penumbra defaults to `smoothUnion` with a non-trivial blend radius, fusing all `SDFField`s. The halo and skeleton fields lose their individual silhouettes.

## Steps to Reproduce
1. Open Qualia in a WebGPU browser.
2. Open Perf panel.
3. Drag halo radius from 0.7 → 0.0. Observe: blob shape barely changes.
4. Notice: the entire bright/grey blob is opaque; nodes inside it are partly hidden by its color.

## Fix
1. **WGSL miss output → alpha=0**. Change `vec4f(bg, 1.0)` → `vec4f(0.0, 0.0, 0.0, 0.0)` in both `main.wgsl` and `main-atlas.wgsl` for ray-march miss paths. Premultiplied-alpha + alpha=0 = fully transparent.
2. **Three backdrop material `transparent: true`**. Updates the alpha-blend pipeline so transparent miss areas reveal the main scene.
3. **`pass.setSceneCombineOp('min', 0)`** at attach time. Skeleton and halos remain separate fields; halo radius slider produces visible halos at distinct silhouettes.
4. **Penumbra version bump** required for (1).

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] SDF surface visible on top of scene; viewport outside the surface is clear (Three nodes + grid show through)
- [ ] Halo slider: 0.0 → halos invisible; 1.0 → halos prominent at member positions; varies linearly
- [ ] Skeleton blend slider effect remains independent

## Related
- Files changed: `Penumbra/packages/shaders/src/wgsl/main.wgsl`, `Penumbra/packages/shaders/src/wgsl/main-atlas.wgsl`, `Qualia/packages/renderer/src/SceneManager.ts`
- Penumbra version bump

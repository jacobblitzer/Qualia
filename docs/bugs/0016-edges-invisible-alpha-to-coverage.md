---
title: "Edges invisible — alphaToCoverage discards them without MSAA"
date: 2026-05-02
tags:
  - bug
  - rendering
status: resolved
project: qualia
component: edge-curve-layer
severity: high
fix-commit: "(working tree, 2026-05-02)"
---

# Edges invisible — alphaToCoverage discards them without MSAA

## Summary
Edges remain invisible even with `edgeOpacity: 0.6`, `edgeWidth: 4.5`, `edgesVisible: true`, and 23 active edges in the demo. Root cause: `EdgeCurveLayer`'s `LineMaterial` is constructed with `alphaToCoverage: true`. This feature requires MSAA to be active on the render target. When MSAA isn't reliably available (browser/driver-dependent, off in some configurations even with `antialias: true` requested), `alphaToCoverage` falls back to a fragment alpha-test cut, which can discard pixels at lower opacities.

## Environment
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts` (constructor)

## Root Cause
```ts
this._material = new LineMaterial({
  color: 0xffffff,
  linewidth: 3,
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  worldUnits: false,
  dashed: false,
  alphaToCoverage: true,   // ← MSAA-dependent; unreliable
});
```

`alphaToCoverage` was likely included for crisper anti-aliased line edges. But it's not a fit for our case where we want consistent rendering across browsers/configs. With it on, edges effectively get an alpha cut at ~0.5; partial-alpha pixels disappear.

`transparent: true, opacity: 0.6` already gives smooth alpha blending in regular rendering. Nothing else needs `alphaToCoverage`.

## Steps to Reproduce
1. Open Qualia at default demo, default settings.
2. Set display mode to anything (mesh, bounding-sphere, etc.).
3. Edges between nodes are not visible despite settings.

## Fix
Remove `alphaToCoverage: true` from the `LineMaterial` options. Standard alpha blending handles the opacity fade.

## Verification
- [ ] Edges visible at all opacity values 0.1–1.0
- [ ] Edges fade smoothly with opacity slider
- [ ] No edge flicker during pan/zoom

## Related
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts`

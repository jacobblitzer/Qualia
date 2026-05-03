---
title: "Halo blobs swamp the network skeleton — no per-node/edge detail visible"
date: 2026-05-02
tags:
  - bug
  - rendering
status: resolved
project: qualia
component: penumbra-network-compiler
severity: medium
fix-commit: "(working tree, 2026-05-02)"
---

# Halo blobs swamp the network skeleton — no per-node/edge detail visible

## Summary
With Penumbra rendering and groups present, the SDF backdrop appears as one giant uniform blob. Per-node sphere atoms and per-edge capsules in the skeleton are visible only as faint bumps, dominated by halo fields whose radius (`group.params.radius * 1.2`) overshoots the underlying skeleton geometry. ADR Qualia 0002's "graph topology as the primary visual" reading is undermined.

## Environment
- OS: Windows 11
- Browser: Chrome 147 (WebGPU enabled)
- Qualia version: 0.1.0
- Reproduces with the demo dataset (Reporting Structure / Social Network contexts in superposition)

## Root Cause
`PenumbraNetworkCompiler.buildHaloField()` uses:

```ts
radius: group.params.radius * opts.haloRadiusMultiplier
```

where `haloRadiusMultiplier` defaults to `1.2`. Demo groups have `params.radius` in the 4–8 range, so halos render as 5–10-unit-radius point-cloud SDF blobs. The skeleton (sphere radius 0.4 per node, capsule radius 0.2 per edge) is geometrically swallowed by these halos under smooth-union.

Two compounding issues:

1. The default multiplier is too aggressive. The halo's purpose per ADR 0002 is to **tint** the skeleton at member positions, not to **engulf** it. A multiplier of 1.2 ensures it engulfs.
2. There's no UI affordance to tune the multiplier, so a user seeing "uniform blob" can't easily diagnose-or-adjust.

## Steps to Reproduce
1. Open Qualia in a WebGPU browser.
2. Default demo dataset loads with Reporting Structure + Social Network contexts.
3. Stay on the "All (Superposition)" view.
4. The SDF backdrop is a single uniform sphere — no per-edge tubes, no per-node bumps.

## Fix
1. **Drop the default `haloRadiusMultiplier` from `1.2` to `0.7`.** Halos now sit *inside* the group radius, leaving the skeleton's per-node/per-edge structure visible at the silhouette.
2. **Add a `haloRadiusMultiplier` slider to `PerfPanel`** so users can tune it live (range 0.0–2.0).
3. Plumb the slider value through `PerfSettings` and into `compileGraphToScene` opts.

## Verification
- [ ] Build passes (0 errors, 0 warnings)
- [ ] Default demo: per-node and per-edge SDF detail visible
- [ ] Slider 0.0 → only skeleton renders (halos contribute nothing geometrically)
- [ ] Slider 2.0 → halos overwhelm (preserving the original behavior for users who wanted big colored regions)
- [ ] Snapshot before/after to compare

## Related
- ADR Qualia 0002 — Network-as-one-blob rendering model (this fix preserves the design intent)
- Files changed: `packages/renderer/src/PenumbraNetworkCompiler.ts`, `packages/renderer/src/SceneManager.ts`, `packages/ui/src/PerfPanel.tsx`

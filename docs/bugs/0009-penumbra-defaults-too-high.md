---
title: "Penumbra defaults too high — slow first paint"
date: 2026-05-02
tags:
  - bug
  - ux
status: resolved
project: qualia
component: perf-defaults
severity: low
fix-commit: "(working tree, 2026-05-02)"
---

# Penumbra defaults too high — slow first paint

## Summary
Default `penumbraResolutionScale: 1.0` and `penumbraRenderInterval: 1` make first paint slow — Penumbra ray-marches at full viewport resolution every frame on a fresh load. User wants Penumbra to start at lower settings so the UI feels snappy out of the box.

## Fix
- `penumbraResolutionScale` default 1.0 → **0.4**
- `penumbraRenderInterval` default 1 → **2** (every other frame)
- User can opt up via the Perf panel sliders at any time

These defaults trade visual fidelity for snappy interaction at boot. Anyone who needs full-quality SDF can set the slider to 1.0 and 1 frame, respectively.

## Verification
- [ ] On fresh load, the SDF backdrop is visibly chunkier than at 100% but the UI feels responsive
- [ ] Sliders default to 40% / every-2-frames in the Perf panel

## Related
- Files changed: `Qualia/packages/renderer/src/SceneManager.ts` (PerfSettings defaults)

---
title: "Edges residual diagnostic — pending verification post-Bug 0017"
date: 2026-05-02
tags:
  - bug
  - rendering
  - diagnostic
status: pending-verification
project: qualia
component: edge-curve-layer
severity: medium
fix-commit: ""
---

# Edges residual diagnostic — pending verification post-Bug 0017

## Summary
Edges have been chronically invisible. A series of plausible-cause fixes (override drift, alphaToCoverage, Bezier degeneracy, theme propagation) each delivered partial improvement but not full resolution. Per the master research doc's Issue E1 hypothesis, the root cause may be **the giant Penumbra bounding-sphere overlay was masking edges** — the ~80%-opacity grey sphere from Bug 0017 covered most of the viewport, blending edge colors into its tone and killing contrast.

This bug is parked **pending verification**. After Bug 0017 ships and the bounding-sphere fallback is gone, edges should reappear without further code change. If they don't, run the diagnostic experiments in the research doc (E2 buffer growth, E3 instanceCount staleness, E4 resolution staleness, E5 NaN colors).

## Verification path
1. Reload with Bug 0017 fixes active.
2. Visually confirm: skeleton renders as gloopy spaceframe, NOT bounding sphere.
3. Visually confirm: edges visible between nodes.
4. If yes → mark `status: resolved` (cause was E1 — Penumbra overlay masking).
5. If no → mark `status: open`, proceed with E2-E5 diagnostics:
   - E2: log `geometry.attributes.instanceStart.count` after each `setPositions`
   - E3: log `geometry.instanceCount` after each `setPositions`; force-set if stale
   - E4: log `material.resolution` periodically; verify `setResolution` fires on resize
   - E5: dump every emitted color in `colArray` once per second; check for zeros/NaN

## Related
- Master research doc: `Qualia/docs/research/2026-05-02-debug-effort-edges-halo-gi.md` (Issue E)
- Bug 0017 (the upstream cause if E1 is correct)

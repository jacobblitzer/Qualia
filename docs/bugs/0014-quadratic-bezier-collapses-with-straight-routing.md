---
title: "Quadratic-bezier edge shape collapses to straight w/ default routing"
date: 2026-05-02
tags:
  - bug
  - rendering
  - ux
status: resolved
project: qualia
component: edge-curve-layer
severity: low
fix-commit: "(working tree, 2026-05-02)"
---

# Quadratic-bezier edge shape collapses to straight w/ default routing

## Summary
A user picks `quadratic-bezier` from the edge shape dropdown and sees no visible curvature — edges look identical to `straight`. The combination of default `routing.mode='straight'` (returns `[a, b]` only) and the quadratic-bezier sampler's "synthesize control point as midpoint when only 2 waypoints" path makes the Bezier curve collapse onto the chord. The shape picker appears broken.

## Environment
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts` (`sampleQuadraticBezier`)

## Root Cause
```ts
const c = waypoints.length >= 3
  ? waypoints[Math.floor(waypoints.length / 2)]
  : ([(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5] as Vec3);
```

When the router returns 2 waypoints (default `straight` routing), the synthesized control point is the geometric midpoint of source/target. A Bezier with control = chord midpoint is just the straight line. The shape picker's effect is invisible to the user.

## Fix
Bow the synthesized control point perpendicular to the chord by `routeOptions.bow * chordLength`. Use the same `perpendicularFallback` helper that the repulsion router uses. Now picking `quadratic-bezier` produces a visible arc regardless of routing mode; the bow amount is shared with the routing slider.

For `cubic-bezier` with 2 waypoints, the existing fallback already does this (S-curve with perpendicular offsets). Just need parity in the quadratic case.

## Verification
- [ ] Pick `quadratic-bezier` with `routing: straight` and `bow > 0`: edges show single-arc curves
- [ ] Set `bow = 0`: edges flatten to straight (intuitive)
- [ ] Pick `quadratic-bezier` with `routing: repulsion`: bow direction comes from the router's anti-repulsion direction (existing behavior preserved when 3+ waypoints exist)

## Related
- File: `Qualia/packages/renderer/src/EdgeCurveLayer.ts`

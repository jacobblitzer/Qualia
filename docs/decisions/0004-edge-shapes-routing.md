---
title: "Edge shapes + routing"
date: 2026-05-02
tags:
  - decision
  - rendering
  - routing
status: accepted
project: qualia
component: renderer
---

# Edge shapes + routing

## Context and Problem Statement

Until this ADR, every Qualia edge was a single straight line segment. The expanded UI vision asked for:

1. **Six edge shapes** — straight, quadratic Bezier ("curvy"), cubic Bezier, Catmull-Rom polycurve, polyline, and tube SDF (rendered by Penumbra as part of the skeleton).
2. **Cascade resolution** — global default → `edgeType.shape` → `edge.shape`, mirroring the node atom cascade in ADR 0003.
3. **Edge routing that responds to the field** — multiple modes, including a v1 cheap "repulsion-only" routing and a v2 "field-gradient relaxation" routing on a Qualia-side proxy field. A future "true Penumbra SDF gradient" mode is left as a stub.
4. **Good boilerplate defaults** for the global controls (bow amount, waypoint count, iterations) so the UI looks clean without per-type tuning.

## Decision Outcome

### Data model

```ts
type EdgeShape =
  | 'straight'
  | 'quadratic-bezier'
  | 'cubic-bezier'
  | 'catmull-rom'
  | 'polyline'
  | 'tube-sdf';

type EdgeRoutingMode =
  | 'straight'
  | 'repulsion'             // α
  | 'field-gradient'        // β
  | 'penumbra-gradient';    // γ — stub, behaves as straight today

interface EdgeTypeDefinition {
  // ... existing
  shape?: EdgeShape;
}

interface Edge {
  // ... existing
  shape?: EdgeShape;
}
```

### Cascade resolver

`resolveEdgeShape(edge, edgeType, globalDefault)` walks `edge.shape → edgeType.shape → globalDefault`. Same shape as the node resolver.

### Routing — `EdgeRouter` module

`routeEdge(edge, positions, opts)` produces an array of waypoints (Vec3[]) for an edge under the active routing mode. Always includes source as `waypoints[0]` and target as `waypoints.at(-1)`.

| Mode | Algorithm | Cost | Notes |
|---|---|---|---|
| `straight` | `[a, b]` | O(1) | No routing |
| `repulsion` (α) | Find closest non-endpoint node, bow midpoint perpendicular to chord, away from that node. Returns 3 waypoints. | O(N) per edge | Stable, predictable, looks reasonable in dense graphs. Bow direction handles degenerate "all nodes co-planar" via a chord-perpendicular fallback. |
| `field-gradient` (β) | Initialize N waypoints linearly along chord. Iterate gradient descent on a sum-of-Gaussians proxy field built from non-endpoint node positions. Each iteration moves each interior waypoint away from the gradient + applies Laplacian smoothing to prevent zig-zag. Returns N+2 waypoints. | O(K · N · M) per edge (K iter, N nodes, M waypoints) | Edges visibly flow around dense node clusters into low-density channels. CPU-only, no Penumbra dependency. |
| `penumbra-gradient` (γ) | Stub — falls through to straight. `// TODO(adr-future)` for real Penumbra SDF gradient via shader readback. | — | Reserved interface slot; selecting it does no harm but does nothing useful. |

### Render — `EdgeCurveLayer`

`EdgeMesh` is replaced by `EdgeCurveLayer` (with a re-export shim for back-compat). The layer:

1. For each edge, resolves shape via the cascade.
2. Computes waypoints via the active routing mode.
3. Samples the waypoints into a polyline of segments per the resolved shape:
   - **straight** — 1 segment between source/target endpoints.
   - **polyline** — N segments through every waypoint (sharp elbows).
   - **quadratic-bezier** — sampled along a quadratic Bezier with the middle waypoint as the control point.
   - **cubic-bezier** — sampled along a cubic Bezier with two control points (1/3 and 2/3 along the waypoint array, or synthesized if too few waypoints).
   - **catmull-rom** — `THREE.CatmullRomCurve3` through all waypoints.
   - **tube-sdf** — emits no Three segments; the edge appears only in Penumbra's SDF skeleton (already a capsule per ADR 0002).
4. Pushes all segments into a single `LineSegments2` (one draw call regardless of edge count or shape diversity).

`curveSamples` (default 24) controls smoothness for Bezier/Catmull-Rom shapes.

### Defaults that look good without tuning

- Global shape: `'straight'` (current behavior is the default; opt-in to curves).
- Global routing: `'straight'` (no routing cost when not needed).
- `bow`: 0.2 — modest curvature when repulsion is enabled, clearly readable but not absurd.
- `waypointCount`: 6 — enough to bend smoothly around 1-2 obstacles.
- `fieldIterations`: 12 — visible relaxation, not so many that interactivity drags.
- `fieldSigma`: 1.0 — Gaussian width approximately equal to baseRadius.
- `fieldStep`: 0.1 (× sigma) — small enough to not overshoot.
- `curveSamples`: 24 — smooth Beziers without obvious facets.

### UI

The existing **Display panel** (added in Phase 1) gains three sections:

- **Edge shape**: dropdown for the global shape default
- **Edge routing**: dropdown for the routing mode + `bow` slider, plus `waypoint count`, `iterations`, and `sigma` sliders that appear only when `field-gradient` is selected (cleaner panel when not needed)
- **Per edge type — shape override**: one row per edge type with a shape dropdown that defaults to "(inherit global)"

Per-edge overrides live on `edge.shape` and are read by the resolver but UI surface is left for the properties panel (future).

### Consequences

#### Good
- Dense graphs become readable when curved edges flow around obstacles.
- Same per-type/per-edge cascade as nodes — UI semantics are consistent.
- Single draw call regardless of shape variety (LineSegments2 absorbs everything).
- Tube SDF integrates with existing Penumbra skeleton; no separate render path needed for it.
- Future SDF-gradient routing has a clean interface slot — adding γ later doesn't require API changes.

#### Bad
- Routing cost grows: `field-gradient` is O(K·N·M) per edge per recompute. Mitigated by recomputing only when positions/topology change, not every frame. For really dense graphs (~5000+ edges), the user can stay on `repulsion` or `straight`.
- Tube SDF and Three-rendered shapes can't be mixed at the visual level — a tube-sdf edge is invisible on the Three side. Acceptable: tube-sdf is for edges that should "fuse with the blob," and that blob comes from Penumbra. Distinct visual languages, intentionally.
- LineSegments2 is fixed-width per the material — variable per-segment width (e.g. `weight → thickness`) is not supported by the material. Future ADR if needed.
- Edge weight → routing intensity is not yet wired. Today routing options are global. Per-edge routing variation is a follow-up.

## Implementation Notes

- Files: `@qualia/core/src/edgeResolvers.ts` (new), `@qualia/renderer/src/EdgeRouter.ts` (new), `@qualia/renderer/src/EdgeCurveLayer.ts` (new), `@qualia/renderer/src/EdgeMesh.ts` (re-export shim).
- `SceneManager.setEdgeShape`, `getEdgeShape`, `setEdgeRouting`, `getEdgeRouting` plumbed through `QualiaRenderer`.
- `NodeDisplayPanel.tsx` extended with three edge sections (the panel is no longer node-only despite the file name; renaming is a future cleanup).
- Verified: `npm run typecheck` clean, `npm run build` clean.

## Related

- ADR Qualia 0001 — Penumbra as Qualia's rendering engine
- ADR Qualia 0002 — Network-as-one-blob rendering model
- ADR Qualia 0003 — Node SDF atoms + display modes (this ADR mirrors the same cascade pattern)
- Phase plan: `QUALIA-CLAUDE-CODE-PHASES.md` § Phase 4 (visual encoding UI — eventual home for per-edge weight → thickness)

---
title: "SDF rendering model: whole graph as one blob, groups as color halos"
date: 2026-05-01
tags:
  - decision
  - rendering
  - integration
status: accepted
project: qualia
component: renderer
---

# SDF rendering model: whole graph as one blob, groups as color halos

## Context and Problem Statement

The first cut of `compileGroupsToScene` (Phase 6, [ADR 0001](0001-penumbra-as-rendering-engine.md)) turned each `VisualGroup` into one `point-cloud` SDF field at member positions. Each group rendered as a fuzzy cluster of spheres, blob-per-group, with no representation of the connectivity between members.

The graph itself was invisible. Two members of a group separated by a long edge appeared as two disconnected blobs with a gap, even though the data says they're directly linked. Visual Groups were *region* annotations, not *network* visualizations.

Three readings were considered (the exchange that produced this decision is in conversation, summarized in `docs/features/penumbra-integration.md`):

1. **Strict-internal** — for each group, render its members + only edges between two group members. Each group is its own self-contained network. Inter-group edges hidden.
2. **Reaching-out** — for each group, render members + every edge incident on any member. Groups visually "reach into" connected non-members.
3. **Whole-graph + color halos** — render the entire active context's nodes and edges as a single neutral skeleton; per-group fields contribute color overlays at member positions, tinting regions of the skeleton.

## Considered Options

The three readings above. Option (3) is more ambitious than (1)/(2): it reframes groups as a *coloring/annotation* layer over a structural blob, rather than as the structural primitive themselves.

## Decision Outcome

Chosen option: **(3) whole-graph + color halos** because it makes the *graph* the primary visual subject. Groups become a way to highlight subsets of an underlying structure that's always present.

### How it's built

`compileGraphToScene(edges, groups, positions, opts?)` produces an `SDFScene` with:

```
Field "__qualia-skeleton"  — neutral color, always rendered
   geometry: smooth-union of:
     - one SDFPrimitive { shape: 'sphere', radius: opts.nodeRadius, transform: T(p) } per known position
     - one SDFPrimitive { shape: 'capsule', endpoints: edge.source, edge.target, radius: opts.edgeRadius } per edge
   blendRadius: opts.skeletonBlend

Field <group.id> per group  — group's color, only at member positions
   geometry: SDFPointCloud at member positions
   radius: group.params.radius * opts.haloRadiusMultiplier
   blendK: group.params.blendFactor
   transparency / noise / contourLines from group.params
```

Penumbra's scene-level smooth-union (`renderer.setSceneCombineOp('smoothUnion', k)`) fuses halos onto the skeleton; halo overlap (a node in two groups) blends colors automatically.

### Implications

- **Orphan nodes / inter-non-group edges still render** — they're part of the skeleton. They just stay neutral-colored.
- **A node belonging to no group** is just a neutral skeleton bump. The graph is always visible.
- **A node belonging to N groups** gets its halo color blended N-ways via Penumbra's smooth-min weighting. Free.
- **Disconnected components** become disconnected blobs. The visual reads as topology.
- **Groups are no longer the structural primitive** — they are an annotation layer. This frees them up for future encoding work (Phase 4): a group could carry analytic metrics that drive halo size, glow, contour lines, without needing to be the "blob."

### Consequences

- **Good:** Graph topology becomes legible at a glance. A reporting hierarchy looks like a tree; a peer network looks like a web. Switching contexts visibly reshapes the surface.
- **Good:** Groups as color overlays is closer to how users think about them — "these people are leadership," not "these people are a separate physical region."
- **Good:** Multi-group nodes blend naturally without special-case code.
- **Good:** `compileGraphToScene` signature is closed over `(edges, groups, positions)` — node identity not needed (positions map already keys by node id).
- **Bad:** Skeleton geometry size scales with O(nodes + edges). At ~5k edges the SDFGeometry tree gets large. Mitigation: Penumbra's atlas + tape pipeline already amortizes this cost; if it bites, switch to per-field transform updates instead of full-scene recompiles. Future ADR if it surfaces.
- **Bad:** A new tuning surface (`NetworkCompileOptions`: `nodeRadius`, `edgeRadius`, `skeletonBlend`, `haloRadiusMultiplier`) — must be exposed to the user eventually so they can tune the skeleton thickness for their graph density.
- **Bad:** Edges with one endpoint missing (transient state during drag, or referential integrity gap) are silently skipped. Acceptable.

### Defaults locked in (from the conversation that produced this ADR)

- **Edge weight → capsule radius**: not yet. Skeleton thickness is global. Edge-weight encoding lives in Phase 4 (Visual Encoding UI).
- **Drag updates**: per-frame full-scene recompile. Cheap until it isn't.
- **Disconnected members**: render as orphan halos with no skeleton beneath. Fine.
- **No group at all**: skeleton renders alone; the whole graph is a uniform neutral blob.

## Implementation Notes

- File: `Qualia/packages/renderer/src/PenumbraNetworkCompiler.ts` (replaces `PenumbraGroupCompiler.ts`).
- Public surface: `compileGraphToScene(edges, groups, positions, opts?)`, `NetworkCompileOptions`. Re-exported from `@qualia/renderer`.
- `SceneManager._pushPenumbraScene` now reads `this._store.getActiveEdges()` in addition to groups.
- `SDFPrimitive` capsule schema (per Penumbra core): `params: { ax, ay, az, bx, by, bz, radius }`. No transform needed — endpoints are world-space.
- `SDFPrimitive` sphere schema: `params: { radius }` plus a 4×4 column-major translation matrix in `transform`.
- Penumbra `setSceneCombineOp('smoothUnion', blendRadius)` is the right scene-level call for the skeleton-plus-halos model. Hosts (App.tsx) should set this once on the `PenumbraPass.raw` reference when the scene first lands.

## Related

- ADR 0001 — Penumbra as Qualia's rendering engine (this decision builds on it)
- Feature card: `docs/features/penumbra-integration.md`
- Compiler: `packages/renderer/src/PenumbraNetworkCompiler.ts`
- Wiring: `packages/renderer/src/SceneManager.ts` (`_pushPenumbraScene`)
- Penumbra primitives: `Penumbra/packages/core/src/types.ts` (`SDFPrimitive`, `SDFShape`, `SDFBoolean`)

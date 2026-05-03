---
title: "Node SDF atoms + display modes"
date: 2026-05-02
tags:
  - decision
  - rendering
  - data-model
status: accepted
project: qualia
component: renderer
---

# Node SDF atoms + display modes

## Context and Problem Statement

Until this ADR, every Qualia node rendered as a single instanced icosahedron mesh. The shape was hardcoded; the data model didn't carry geometry information; and the visible representation couldn't switch between rendering modes (mesh / point cloud / SDF blob / wireframe overlays).

The goal of this redesign:

1. Each node has an **intrinsic SDF atom** describing its geometry (sphere, box, capsule, ellipsoid, torus, roundBox).
2. Geometry is consistent between Three.js rendering (the visible mesh) and Penumbra rendering (the SDF skeleton blob).
3. The user can switch the **display mode** — how a given atom is drawn — globally with per-type and per-node overrides.

## Decision Outcome

### Data model

`NodeAtom` is a thin wrapper around Penumbra's primitive shape vocabulary, narrower than `SDFGeometry` (we don't need booleans, warps, or point-clouds at the node level — those are scene-graph concerns):

```ts
type NodeAtomShape = 'sphere' | 'box' | 'roundBox' | 'capsule' | 'ellipsoid' | 'torus';

interface NodeAtom {
  shape: NodeAtomShape;
  params?: Record<string, number>;
}
```

`NodeDisplayMode` enumerates the six representations Qualia surfaces:

```ts
type NodeDisplayMode =
  | 'mesh'             // Three.js triangle mesh (default)
  | 'tape'             // Penumbra ray-march only — no Three mesh
  | 'point-cloud'      // surface samples as Three.Points
  | 'aabb'             // wireframe AABB
  | 'bounding-sphere'  // wireframe bounding sphere
  | 'hidden';          // no Three rendering at all
```

Both fields exist on `NodeTypeDefinition` and `NodeCore`:

```ts
interface NodeTypeDefinition {
  // ... existing
  sdfAtom?: NodeAtom;
  displayMode?: NodeDisplayMode;
}

interface NodeCore {
  // ... existing
  sdfAtom?: NodeAtom;
  displayMode?: NodeDisplayMode;
}
```

### Resolver cascade

The effective atom and display mode for any given node walk a three-tier cascade:

| Level | Source | Used for |
|---|---|---|
| 1 — per-node | `node.sdfAtom` / `node.displayMode` | individual overrides ("this one node is a torus") |
| 2 — per-type | `nodeType.sdfAtom` / `nodeType.displayMode` | usual case ("all `system` nodes are boxes") |
| 3 — default | sphere(`baseRadius`) / `'mesh'` | every graph just works without configuration |

Implemented in `@qualia/core/nodeResolvers.ts` as `resolveNodeAtom(node, nodeType)` and `resolveNodeDisplayMode(node, nodeType, globalDefault)`.

### Render layer

`NodeMesh` is replaced by `NodeAtomLayer` (with a back-compat re-export of the old name). The new layer:

- Buckets nodes by resolved atom shape — one `THREE.InstancedMesh` per shape encountered, allocated lazily.
- Per-instance transform encodes position + per-axis scale derived from atom params.
- Auxiliary overlay `Group`s for non-mesh display modes (point cloud, AABB, bounding sphere).
- Display mode controls visibility: in `'mesh'` mode the InstancedMesh buckets are visible; in other modes they're invisible (still raycast targets) and the appropriate overlay group becomes visible.

`InteractionManager.raycastNode` raycasts against every bucket via `nodeMesh.raycastTargets`, then resolves the hit through `nodeMesh.resolveHit(mesh, instanceId)`.

### Penumbra alignment

`PenumbraNetworkCompiler.compileGraphToScene` accepts an optional `nodeData` argument. When supplied, each node's resolved atom contributes its actual SDF primitive (sphere/box/capsule/etc. with proper params) to the skeleton blob — the Penumbra-side geometry now matches the Three-side geometry. When omitted, the compiler falls back to the previous behavior (sphere of `nodeRadius`).

### UI

A new `NodeDisplayPanel` (toolbar button "Display", keyboard shortcut **D**) exposes:

- Global display-mode dropdown (one of the six modes)
- Per-type rows: shape selector + display-mode override (`(inherit global)` is the explicit unset state)
- Footer hint about per-node overrides being available via the properties panel

Per-node overrides are read by the resolver but UI affordances live in the existing properties panel (future iteration).

## Consequences

### Good
- Graph topology can express richer node semantics without an external schema. A v1 graph still renders as spheres — no migration needed.
- Penumbra and Three render the same shape per node. The SDF skeleton blob now follows the node geometry instead of being a uniform sphere skeleton.
- Display mode is genuinely useful for debugging — point-cloud + AABB modes make spatial layout legible; tape mode hands the entire graph to Penumbra; hidden mode lets the SDF blob stand alone.
- The cascade pattern matches the eventual property-schema work in Phase 2 of the phase plan, so the data-model habit is consistent.

### Bad
- N InstancedMeshes (one per shape) instead of one. Per-frame draw call count grows with shape diversity. Mitigated: most graphs use 1-2 shapes; lazy bucket allocation means unused shapes have no cost.
- `nodeMesh.mesh.material` no longer makes sense — the layer has multiple materials, one per bucket. Code paths that mutated the material directly (light mode, emissive intensity slider) now use `forEachMaterial(fn)` and `getPrimaryMaterial()`. Slight indirection, no functional change.
- Per-node `sdfAtom` overrides are recognized by the resolver but unsurfaced in the UI. The per-node properties panel needs an extension to expose them — listed as future work.
- Roundbox and ellipsoid don't have native Three geometries — roundBox uses BoxGeometry, ellipsoid uses sphere with non-uniform scale. Visual fidelity is acceptable; perfect roundbox could ship later via custom geometry.

## Implementation Notes

- File: `@qualia/core/src/nodeResolvers.ts` (new)
- File: `@qualia/renderer/src/NodeAtomLayer.ts` (new) — replaces `NodeMesh.ts`'s class
- File: `@qualia/renderer/src/NodeMesh.ts` — now a re-export shim for back-compat
- File: `@qualia/renderer/src/PenumbraNetworkCompiler.ts` — extended `compileGraphToScene` signature with optional `nodeData`
- File: `@qualia/renderer/src/SceneManager.ts` — `setNodeDisplayMode(mode)`, `getNodeDisplayMode()`, `forEachMaterial` adoption
- File: `@qualia/ui/src/NodeDisplayPanel.tsx` (new), wired in Viewport with toolbar button + `D` shortcut

Verified: `npm run typecheck` clean, `npm run build` clean (1024 KB / 269 KB gzip).

## Related

- ADR Qualia 0001 — Penumbra as Qualia's rendering engine
- ADR Qualia 0002 — Network-as-one-blob rendering model (skeleton uses each atom)
- Phase plan: `QUALIA-CLAUDE-CODE-PHASES.md` § Phase 2 (data model enrichment)
- Penumbra atom model: `Penumbra/docs/decisions/0001-atoms-with-optional-grouping.md`

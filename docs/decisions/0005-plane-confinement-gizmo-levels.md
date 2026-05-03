---
title: "Plane confinement, axis gizmo, persistent per-axis levels"
date: 2026-05-02
tags:
  - decision
  - layout
  - ui
status: accepted
project: qualia
component: renderer-and-ui
---

# Plane confinement, axis gizmo, persistent per-axis levels

## Context and Problem Statement

The user vision: confine the graph to a plane (or several parallel planes — "levels"), with a gizmo widget that lets the user pick the plane normal axis interactively. Levels are **persistent per-axis** — switching axes shows a different stratification. Layout planar mode and camera lock are independent toggles.

This is a meaningful redesign relative to the simpler "lock z=0" idea I originally proposed: the user pushed for a richer model with a clickable axis gizmo, level persistence, and visible plane geometry in-scene.

## Decision Outcome

### Data model — `@qualia/core`

```ts
interface PlaneAxis {
  id: string;             // "+y", "-x", or "voronoi:..." for custom normals
  normal: Vec3;           // unit-length world-space
  label?: string;
}

interface Level {
  id: string;
  name?: string;
  position: number;       // signed offset along axis.normal from origin
  capturedNodeIds: string[];
}

type LevelSet = Record<string, Level[]>;  // keyed by PlaneAxis.id

interface PlanarSettings {
  axis: PlaneAxis;
  livePlanePosition: number;  // gizmo scrubber
  levels: LevelSet;
  layoutPlanar: boolean;
  cameraLock: boolean;
  showPlane: boolean;
  pullStrength: number;       // 0..1 (1 = hard clamp)
}
```

`STANDARD_PLANE_AXES` exports the six cube-face normals (+/-X, +/-Y, +/-Z); custom voronoi-facet normals are reserved as a future extension (the `id` namespace `voronoi:...` is allocated but not produced yet).

`DEFAULT_PLANAR_SETTINGS` ships with everything off — no visible plane, no layout pull, no camera lock, +Y as the default axis.

### Render-side — `SceneManager`

- `getPlanarSettings()` / `setPlanarSettings(partial)` — the cascade entry point. Side-effects fire immediately: plane mesh is added/removed, camera locks/unlocks, level positions reapply.
- `captureLevel(bandWidth, name?)` — captures all nodes within `bandWidth` of `livePlanePosition` along `axis.normal` into a new `Level`. Skips already-captured nodes. Returns the new level id (or `null` if no nodes were near enough). Levels live on the active axis's stack — switching axes shows a different set.
- `uncaptureLevel(levelId)` — removes a level and frees its nodes.
- `_getCurrentPositions()` — extended to apply level constraints in-place when `layoutPlanar` is true. For each captured node, project its current position-along-normal toward the level's position by `pullStrength` (1.0 = hard clamp, anything less = soft pull).
- Plane visualization: a transparent `THREE.PlaneGeometry(40, 40)` mesh + `EdgesGeometry` outline, rotated so its +Z aligns with the active axis normal, translated to `livePlanePosition * normal`.
- Camera lock: when toggled on, save the current camera state, then position the camera looking down the axis normal (distance preserved). `up` is recomputed perpendicular to the normal so OrbitControls stays sane. Toggling off restores the saved state.

### UI — `OrientationGizmo` + `PlanePanel`

`OrientationGizmo` is a self-contained small Three.js widget (default 110×110 px):
- Renders a 3D cube with one Lambert material per face
- Hover highlights faces; click emits the corresponding axis
- Active axis face is tinted accent-green
- Six standard axes; voronoi/polyhedron variant deferred to future ADR

`PlanePanel` is a draggable, resizable floating panel that hosts:
- The OrientationGizmo + a hint
- Three independent toggles (planar layout, camera lock, show plane)
- A pull-strength slider (0 = no pull, 1 = hard clamp)
- A live-plane scrubber slider with a "+ Capture level here" button
- A levels list for the active axis (rename via name field, delete via × button, position + node-count badges)
- Drag the header to reposition; resize handle in bottom-right corner

Toolbar gains a "Plane" button and **L** keyboard shortcut.

### Independent toggles

- **`layoutPlanar`** controls whether captured-node positions are pulled toward levels. Without it, levels exist as data but don't constrain the layout.
- **`cameraLock`** is independent — you can have a 3D layout viewed from a top-down camera (data stays 3D, UI feels 2D), or a planar layout viewed from a free orbit camera (composition reading).
- **`showPlane`** is independent of both — you can hide the plane mesh while still having layout planarity active.

This composes cleanly: enabling `layoutPlanar` alone gives you stratification without changing the camera; adding `cameraLock` gives you the "floor plan" feel; `showPlane` is for visual debugging or aesthetic.

### Soft constraint, not hard clamp

`pullStrength` defaults to `1.0` (hard clamp — captured nodes snap to their level every frame). Reducing it gives a soft constraint where nodes can drift slightly off-level under other forces (force-directed layout, drag) but get pulled back. The user vision was specifically for soft constraints, so the slider is exposed prominently.

### Per-context override

`PlanarSettings` is currently held as a single instance on `SceneManager`. The ADR commits to **per-context override** as a follow-up: contexts will gain an optional `planarSettings?: PlanarSettings` field; the global default lives on the renderer. When switching contexts, the renderer applies the context's planar settings if present, else falls back to the global default. This is straightforward to wire when `Context` typing supports it; left for a follow-up commit to keep this phase focused.

## Consequences

### Good
- Stratification feels first-class: capture nodes at one z, slide the plane, capture more at another z. The "atoms in shells" or "floors in a building" mental model becomes a real tool.
- Per-axis levels mean switching axes is non-destructive — your XY notebook is still there when you come back from XZ.
- The three independent toggles cover the realistic combinations (planar viewer of 3D data, 2D data with 3D camera, just-show-the-plane debugging).
- Soft pull is real soft pull; not just a label.

### Bad
- Layout-engine integration is currently shallow — pulls happen in `_getCurrentPositions()` rather than as a step in the force-directed solver. This means user drag during planar mode can fight the pull every frame instead of cooperating with it. Future iteration should add a proper solver-step.
- Voronoi gizmo variant is documented but not implemented. Today only the six cube faces are pickable.
- Per-context overrides are designed for but not yet wired (single SceneManager-held settings instance).
- Plane mesh is a fixed 40×40 quad; doesn't auto-scale to the graph's extent. Visible enough but visually clamped on extra-large graphs.
- Camera lock recomputes `up` aggressively which may surprise users when toggling on while orbiting — there's no transition animation.

### Open questions (for future ADRs)
- True voronoi gizmo: how does the user define the polyhedron? Pre-baked icosahedron with named facets? Editable?
- Multi-axis level visualization: should non-active axes' levels show as ghosted plane outlines for spatial awareness?
- Layout solver integration — proper plane force, not post-hoc clamp.
- Per-context override wiring (mostly mechanical; just missing a context-switch listener).

## Implementation Notes

- Files added: `@qualia/core/src/types.ts` (PlanarSettings types + STANDARD_PLANE_AXES), `@qualia/ui/src/OrientationGizmo.tsx`, `@qualia/ui/src/PlanePanel.tsx`.
- Files modified: `@qualia/renderer/src/SceneManager.ts` (planar state, `captureLevel`, `uncaptureLevel`, plane mesh, camera lock, level enforcement in `_getCurrentPositions`), `@qualia/renderer/src/QualiaRenderer.ts` (pass-throughs), `@qualia/ui/src/{Viewport,ViewportToolbar}.tsx`, `styles.css`.
- Verified: `npm run typecheck` clean, `npm run build` clean (1046 KB / 275 KB gzip).

## Related

- ADR Qualia 0001 — Penumbra as Qualia's rendering engine
- ADR Qualia 0002 — Network-as-one-blob rendering model
- ADR Qualia 0003 — Node SDF atoms + display modes
- ADR Qualia 0004 — Edge shapes + routing
- Phase plan: `QUALIA-CLAUDE-CODE-PHASES.md` § Phase 3 (minimap + navigation polish — gizmo overlaps with this)

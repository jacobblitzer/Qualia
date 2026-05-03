---
title: "Qualia consumes Penumbra DisplayState as the source of truth"
date: 2026-05-03
tags:
  - decision
  - architecture
  - perf-panel
status: proposed
project: qualia
component: renderer + ui
related:
  - 0008-theme-system.md
  - 0009-atmospheric-mode-controls.md
external:
  - Penumbra ADR 0011 (display-state-model)
---

# Qualia consumes Penumbra DisplayState as the source of truth

## Context

`SceneManager._perf` currently shadows every Penumbra display knob
(particulate params, edge-soften settings, render mode, lighting, fog,
etc.) and dispatches each one via `setParticulateParams`,
`setEdgeSoftenSettings`, `setRenderMode`, `setLightingSettings`, … in
`setPerfSettings`. The shape of `PerfSettings` mirrors a flattened union
of every Penumbra setter's argument.

This duplicates state. Qualia Bug 0015 (sliders not mirrored to Penumbra)
is the canonical failure mode: a new perf-panel knob is added on the
Qualia side, but `setPerfSettings` forgets to dispatch it to Penumbra.
The slider does nothing visually. Typecheck doesn't catch it.

Penumbra ADR 0011 introduces a single `DisplayState` object as the
renderer's source of truth, with `setDisplayState(partial)` /
`getDisplayState()` / `loadDisplayPreset(name)` and a change-listener
hook. Qualia should adopt this surface.

## Decision

`SceneManager` stops shadowing Penumbra display state. Instead:

1. **Penumbra-controllable axes** (particulate, edge-soften, viz mode,
   overlays, render settings, environment) are removed from
   `PerfSettings`. The PerfPanel UI for these knobs becomes a thin layer
   over `_penumbra.setDisplayState({ … })` and `_penumbra.getDisplayState()`,
   subscribed to via `onDisplayChange`.

2. **Qualia-only axes** stay on `PerfSettings`:
   - `nodesVisible`, `edgesVisible`, `labelsVisible`, `gridVisible`
     (Three.js scene visibility).
   - `nodeOpacity`, `haloOpacity`, `haloRadiusMultiplier`, `skeletonBlend`
     (Qualia compositor params).
   - `smoothHaloBlend`, `haloBlendRadius`, `edgesInHalo`, `edgeHaloRadius`
     (Qualia network-as-blob compiler params).
   - `theme` (ADR 0008 — Qualia owns the theme; pushes to Penumbra via
     `setBackgroundColor` + `setLightingSettings`).
   - `penumbraRenderInterval`, `penumbraResolutionScale` (Qualia owns the
     dispatcher; the resolution scale is mirrored into Penumbra's
     `RenderState.resolutionScale`).

3. **Preset surface.** PerfPanel grows an "Apply Penumbra preset"
   dropdown reading the catalog. Qualia ships its own preset library
   under `Qualia/presets/` for theme + scene-specific overrides; these
   are applied AFTER the Penumbra preset (composition rule: Penumbra
   first, Qualia overrides on top, theme last).

## Consequences

- **Good:** Bug 0015 class becomes structurally impossible — there is no
  "Qualia state shadow" to drift from Penumbra state. The slider IS the
  Penumbra setter.
- **Good:** PerfPanel collapses by ~40% — most sliders move to a Penumbra
  preset picker. The remaining sliders are genuinely Qualia-specific.
- **Good:** Snapshot reproducibility improves — saved scene state is
  `{ qualiaPreset, penumbraPreset, themeName }` rather than a flat hash
  of every knob.
- **Bad:** Mid-season UI rewrite. Existing PerfPanel layout is preserved
  insofar as possible, but the tab structure follows Penumbra's
  `DisplayState` axes (Atom / Viz / Display / Overlays / Env / Render),
  matching Studio's tabs by design.
- **Bad:** Theme system (ADR 0008) needs a small refactor — themes are
  presets-of-presets (a Qualia preset that bundles Penumbra background
  + lighting overrides). Tracked as a follow-up; not blocking the main
  refactor.

## Implementation

Sequenced after Penumbra ADR 0011 phases 1–4 land:

1. Bump `@penumbra/three` reference to the version that exposes
   `setDisplayState` / `loadDisplayPreset`.
2. Refactor `SceneManager.setPerfSettings` — drop dispatch for
   Penumbra-controllable axes; add proxy via `_penumbra.setDisplayState`.
3. Refactor `PerfPanel.tsx` — split into Qualia-only sliders (top) and
   Penumbra preset picker (bottom). Apply preset / save preset / export
   JSON for committing back to Penumbra catalog.
4. Update `Qualia/CLAUDE.md` — note that Penumbra display state lives in
   Penumbra and is consumed via the new surface.

## Related

- Penumbra ADR 0011 — display-state-model (parent decision).
- ADR 0008 — theme system (interacts with `EnvironmentState` axis).
- Qualia Bug 0015 — class of failure that this prevents.

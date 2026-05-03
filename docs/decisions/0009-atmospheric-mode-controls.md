---
title: "Atmospheric mode controls in Qualia"
date: 2026-05-02
tags:
  - decision
  - ui
  - rendering
status: accepted
project: qualia
component: ui + renderer
---

# Atmospheric mode controls in Qualia

## Context and Problem Statement

Penumbra is gaining a new render mode (Penumbra ADR 0009) that produces atmospheric output — coarse-march SDF, fog accumulation, GPU particles drifting outward from the surface. The mode is controlled via four knobs on the renderer interface (`mode`, `mix`, particle params, fog params).

Qualia needs to expose these knobs in its UI so users can dial the halo from "polished surface blob" to "ambient mist + drifting embers" — the originally requested aesthetic that motivated the work. This ADR records where in Qualia's UI the controls live, what the defaults are, and how they integrate with the existing Display panel.

## Considered Options

1. **New "Atmosphere" panel** — separate floating panel, mutually exclusive with Display/Plane/Perf/Snapshot. Lots of room for sliders, dedicated home for atmospheric controls. But: another panel to discover, and atmospheric params are visually coupled to halo radius / blend / GI which already live in Display.

2. **Extend the existing Display panel** with an "Atmosphere" subsection — a collapsible group containing the mode mix slider + particle/fog density sliders + step count. Atmospheric controls live where halo + blend already live, so users discover them naturally when they're tuning the SDF look.

3. **Hide atmospheric controls behind the Cmd+K palette only** — typed access ("set atmosphere mix 0.6"), no GUI surface. Lowest friction to add but worst discoverability for a feature whose whole point is visual experimentation.

## Decision Outcome

**Final outcome (amended 2026-05-02 again):** V1 was sunset; the Penumbra-side implementation landed under a new design (Penumbra ADR 0010, **particulate** mode — supersedes the original "atmospheric" framing). Reasoning: V1's screen-space sparkle didn't parallax with the camera, which broke the fundamental visual contract. Particulate mode produces 3D points anchored to the SDF surface, atlas-seeded for camera independence, with optional pull-to-SDF for tight surface adherence.

The Qualia-side controls are now thin pass-through wrappers around the Penumbra API:
- Render mode radio (Surface / Particulate / Blend) → `pass.setRenderMode(...)`
- Particulate sliders (point size, brightness, scatter radius, volume mix, points per seed, brick coverage, pull strength, pull iterations, blend mix, shimmer toggle) → `pass.setParticulateParams(...)`

No Qualia-side compositing logic remains; the atmospheric look is produced entirely by Penumbra's particulate pipeline. The host's only job is exposing UI + plumbing values through `SceneManager.setPerfSettings`.

Chosen option: **Option 2 (extend Display panel).** Rationale:

- **Discoverability beats panel-hygiene here.** A user playing with halo radius will see "Atmosphere" right below it and try it — the visual exploration loop stays in one place.
- **No panel proliferation.** Display already holds the SDF look knobs (halo radius, blend, scene combine op, GI). Atmosphere is the same conceptual axis: how the SDF reads visually.
- **Cheap.** Just adds one collapsible group to the existing panel — no new mounting, no panel-state plumbing.

### UI surface

New "Atmosphere" group in Display panel:

```
┌─ Display ────────────────────────────────┐
│ Node display mode: [polyhedron ▾]        │
│ Edge shape:        [straight   ▾]        │
│ Halo radius:       ●────○─── 1.2         │
│ Halo blend:        ○────●──── 0.6        │
│ ─────────── Atmosphere ───────────       │
│ Mode:              ◉ Surface             │
│                    ◯ Atmosphere          │
│                    ◯ Blend               │
│ Mix (blend only):  ○──────●── 0.7        │
│ Coarse steps:      ●─○──────── 12        │
│ Particle density:  ○──●─────── 0.3       │
│ Fog density:       ──●──────── 0.5       │
└──────────────────────────────────────────┘
```

Three radio buttons for mode (matches Penumbra's enum). Mix slider becomes active only when mode = `Blend`. Coarse-step range 4–32, default 12. Particle density 0–1, default 0.3. Fog density 0–1, default 0.5.

### Defaults

Construction default: `mode='surface'` — Qualia behaves exactly as it does today until the user opts into atmospheric mode. No surprise visual change for existing graphs.

When the user picks `atmosphere` or `blend` for the first time in a session, Qualia calls `pass.setAtmosphericParams({ ... })` with the defaults from the table above. Subsequent toggles preserve the user's slider positions.

### Persistence

Atmospheric params are part of the per-graph viewer settings (already serialized into Qualia JSON). Loading a graph that was saved with `mode='blend'` and `mix=0.7` restores those settings. Snapshot debug bundles capture them too (so a screenshot of a foggy halo can be reproduced).

### Color sourcing

`fogColor` and `particleColor` default to theme-derived values:

- `fogColor` ← active theme's `penumbraAmbientGround` (a muted ground tone — for monument theme, the cool teal `#88aa9a` lifted to `[0.53, 0.67, 0.60]`).
- `particleColor` ← active theme's `penumbraLightColor` (the warm accent — for monument, the soft lavender `[0.71, 0.66, 0.83]`).

So the atmospheric look respects the theme automatically. A future "Atmosphere advanced" disclosure can expose explicit color pickers if users ask.

### Performance

Per Penumbra ADR 0009, atmospheric mode at default settings (12 coarse steps, 16k particles) is **cheaper** than surface mode (128 steps). No perf regression expected when atmospheric mode is the only mode active. `mode='blend'` runs both passes and is the slowest configuration — surface this in the perf HUD when it lands (Wave 3).

### Wiring

```
UI slider → store.setAtmosphericParams({...})
         → renderer.applyViewerSettings({...})
         → SceneManager.applyAtmosphericParams(...)
         → PenumbraPass.setAtmosphericParams(...)
         → PenumbraRenderer.setAtmosphericParams(...)
```

`SceneManager` keeps a copy of the params in its viewer-settings state; `applyTheme(...)` (ADR 0008) re-derives `fogColor` + `particleColor` from the active theme on theme change.

### Consequences

- **Good:** Atmospheric mode is one panel-disclosure away — discoverable and dial-able.
- **Good:** No new panel; existing Display panel layout grows by one collapsible group.
- **Good:** Theme-aware color defaults mean atmospheric mode looks coherent with the rest of the UI without per-mode color picking.
- **Good:** Per-graph persistence means atmospheric look survives import/export.
- **Bad:** Display panel grows a bit. Mitigated by the collapsible group (collapsed by default for first-time users; remembers state thereafter).
- **Bad:** Mix slider only meaningful in blend mode. UI must gray it out otherwise — small implementation polish needed.
- **Bad:** WebGL2 fallback can't run atmospheric mode (Penumbra ADR 0009 limitation). UI must detect WebGL2 and disable the radio buttons + show a tooltip. Currently unreachable since Qualia is WebGPU-only, but worth a one-line guard.

## Implementation Notes

- `@qualia/core/types`: extend `ViewerSettings` with `atmosphericMode: 'surface' | 'atmospheric' | 'blend'` + `atmosphericParams: AtmosphericParams`.
- `SceneManager`: add `applyAtmosphericParams(partial)` that pushes through to PenumbraPass.
- Display panel React component: add the Atmosphere group with radio + four sliders.
- Theme bridge: when `applyTheme(cfg)` runs, re-derive fog + particle colors from `cfg.penumbraAmbientGround` and `cfg.penumbraLightColor`.
- Snapshot capture: include atmospheric params in the debug bundle.
- Penumbra version bump: this requires Penumbra v0.1.7+ (the version that ships ADR 0009). Bump `package.json` after Penumbra tarballs are produced.

## Related

- Penumbra ADR: `Penumbra/docs/decisions/0009-atmospheric-render-mode.md` (the engine-side mode)
- Phase ADR: `0006-phase-3.5-ui-polish.md` (decision O)
- Theme system: `0008-theme-system.md` (color sourcing)
- Depth coupling: `0007-depth-aware-penumbra-composite.md` (atmospheric mode writes depth at first-density-step)

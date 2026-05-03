---
title: "No baseline GI; dark mode pitch black"
date: 2026-05-02
tags:
  - bug
  - lighting
status: resolved
project: qualia
component: scene-manager
severity: medium
fix-commit: "(working tree, 2026-05-02)"
---

# No baseline GI; dark mode pitch black

## Summary
Both light and dark modes lacked a non-user-controllable global illumination floor. With ambientIntensity slider at 0, the scene went pitch black regardless of theme. Three meshes were unlit, the Penumbra blob was at most barely-visible, edges and labels became unreadable. User-set sliders should layer ON TOP of a guaranteed minimum, not REPLACE it.

## Fix
1. **Three side**: New `_baselineHemi: THREE.HemisphereLight` added to `SceneManager`, always on, intensity 0.4–0.6 depending on theme. Sky/ground colors retuned per `setLightMode` for warmer-light / cooler-dark presence.
2. **Penumbra side**: `PerfSettings.giEnabled` now defaults to **true** with `giStrength: 0.5`. The SDF-AO pass added in feature 0028 always runs at moderate strength out of the box; users can disable via the Perf panel toggle if desired.

The baseline is layered: `_ambientLight` (user-controllable, can go to 0) + `_baselineHemi` (always on, never user-controllable) + `_dirLight` (user-controllable, theme-dependent). Even when the user sliders sit at zero, the hemisphere light keeps a minimum visibility floor.

## Verification
- [ ] Set ambient slider to 0 in dark mode → scene still readable (not black)
- [ ] Toggle to light mode → warmer baseline tone, scene still well-lit
- [ ] Penumbra blob in dark mode shows visible crevice darkening (GI/AO active)
- [ ] Take a snapshot in each theme — `viewer.ambientIntensity` may report 0 but visually scene is lit

## Related
- Master research doc: `Qualia/docs/research/2026-05-02-debug-effort-edges-halo-gi.md` (Issue G)
- Feature 0028 (Penumbra GI/AO) — baseline now uses it by default

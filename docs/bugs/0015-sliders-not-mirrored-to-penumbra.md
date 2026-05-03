---
title: "Theme toggle + ambient/fog sliders don't mirror to Penumbra"
date: 2026-05-02
tags:
  - bug
  - rendering
  - audit
status: resolved
project: qualia
component: scene-manager + app
severity: medium
fix-commit: "(working tree, 2026-05-02)"
---

# Theme toggle + ambient/fog sliders don't mirror to Penumbra

## Summary
A comprehensive audit of UI controls vs. their effective actions reveals three breakages in the "every slider is keyed to an action AND the action is supported by Penumbra" invariant:

| Control | Three side | Penumbra mirror | Status |
|---|---|---|---|
| Toolbar Light/Dark toggle | should flip Three colors via `setLightMode` | should update Penumbra background + lighting | **❌ neither — App state flips a CSS class only; renderer.setLightMode is never called** |
| Settings panel Ambient slider | `_ambientLight.intensity` updated | should call `pass.setLightingSettings({ ambientIntensity })` | **❌ Three only** |
| Settings panel Fog density slider | `scene.fog.density` updated | should call `pass.setFogSettings({ density })` | **❌ Three only** |

These together explain the user observation: "in light mode dark mode, ambient lighting/fog doesn't do anything" — light/dark literally never reaches the renderer, and ambient/fog don't affect the Penumbra blob (which is the dominant visual when enabled).

## Environment
- Files:
  - `Qualia/packages/ui/src/App.tsx` (theme state)
  - `Qualia/packages/ui/src/Toolbar.tsx` (Light/Dark button)
  - `Qualia/packages/renderer/src/SceneManager.ts` (`applyViewerSettings`, `setLightMode`)

## Root Cause
**Theme**: `App.toggleTheme` only calls `setTheme(...)` (React state). It does not call `renderer.setLightMode(...)`. The DOM gets a `.qualia-light` class but the renderer never knows.

**Ambient/Fog**: `SceneManager.applyViewerSettings` updates Three globals but never delegates to `this._penumbra?.setLightingSettings(...)` / `setFogSettings(...)`. Penumbra retains its construction-time defaults forever.

## Fix
1. **App** wires `toggleTheme` through `renderer?.setLightMode(newTheme === 'light')`. SceneManager.setLightMode already exists; expose it on QualiaRenderer if not already.
2. **SceneManager.setLightMode** additionally calls `this._penumbra?.setLightingSettings(...)` with light/dark sky/ground/ambient colors and `setBackgroundColor(...)` with the matching scene clear color.
3. **SceneManager.applyViewerSettings**:
   - `ambientIntensity`: also call `this._penumbra?.setLightingSettings({ ambientIntensity })`.
   - `fogDensity`: also call `this._penumbra?.setFogSettings({ density, enabled: density > 0 })`.

## Verification
- [ ] Click Light/Dark in toolbar → entire viewport flips theme (Three + Penumbra)
- [ ] Drag Ambient slider → both Three nodes AND Penumbra blob brighten/darken
- [ ] Drag Fog density slider → both Three scene AND Penumbra blob get fogged
- [ ] Take a snapshot at light mode → settings.json shows `theme: "light"` AND Penumbra's background reflects light theme

## Related
- Bug 0010 — same kind of wiring issue (overrides not propagating)
- Files: `Qualia/packages/ui/src/App.tsx`, `Qualia/packages/renderer/src/{SceneManager,QualiaRenderer}.ts`

---
title: "Theme system — config-driven themes (dark/light/monument)"
date: 2026-05-02
tags:
  - decision
  - ui
  - design-system
status: accepted
project: qualia
component: ui + scene-manager
---

# Theme system — config-driven themes (dark/light/monument)

## Context and Problem Statement

The current theme is a `boolean` (`isLight`) propagated through `setLightMode`. Adding a third theme (Monument Valley palette per Phase 3.5) means either:
- A second boolean (`isMonument`) — exponential blowup of conditionals
- A `'dark' | 'light' | 'monument'` string discriminant — better but still spreads palette knowledge across many files
- A first-class `ThemeConfig` object — palette + motion + panel-style centralized

## Decision Outcome

Chosen option: **first-class ThemeConfig object** indexed by a theme id. Replaces `isLight` boolean throughout the codebase.

### Schema

```ts
type ThemeId = 'dark' | 'light' | 'monument';

interface ThemeConfig {
  id: ThemeId;
  label: string;

  // Background + surface
  bgPrimary:   ColorHex;   // viewport clear color
  bgFog:       ColorHex;   // fog color (matches bg)
  bgPanel:     CssColor;   // panel surfaces (CSS, not Three)
  bgInset:     CssColor;   // inset surfaces (sliders, code blocks)

  // Foreground / text
  fgPrimary:   CssColor;   // primary text
  fgSecondary: CssColor;
  fgMuted:     CssColor;
  fgAccent:    CssColor;   // brand accent

  // Scene primitives
  gridColor:        ColorHex;
  ambientSky:       ColorHex;
  ambientGround:    ColorHex;
  baselineHemiSky:  ColorHex;
  baselineHemiGround: ColorHex;
  baselineHemiIntensity: number;

  dirLightColor:    ColorHex;
  dirLightIntensity: number;

  // Node materials
  nodeEmissive:        ColorHex;
  nodeEmissiveIntensity: number;
  nodeRoughness:       number;

  // Penumbra (mirrors Three for blob consistency)
  penumbraBackground:  [number, number, number];
  penumbraAmbientColor: [number, number, number];
  penumbraAmbientGroundColor: [number, number, number];
  penumbraAmbientIntensity: number;
  penumbraLightColor: [number, number, number];
  penumbraLightIntensity: number;

  // Motion (decision E from Phase 3.5)
  panelTransitionMs: number;
  panelEase: string;  // CSS cubic-bezier
}
```

Three configs:
- `dark` — current dark defaults, encapsulated
- `light` — current light defaults, encapsulated
- `monument` — MV2 cool-cream palette per Q2 (cool-cream bg #e8eef4, soft lavender accent #b6a8d4, muted teal-green secondary #88aa9a, cool slate shadows #5e6878, 200ms ease-out transitions)

### How it propagates

1. `App.tsx` holds `theme: ThemeId` state. Unchanged from today.
2. New `themes.ts` module exports `THEMES: Record<ThemeId, ThemeConfig>`.
3. CSS custom properties driven from the active config — root element gets `--bg-primary: #...`, `--fg-primary: #...`, etc. Set in a `useEffect` whenever `theme` changes. CSS uses `var(--bg-primary)` everywhere.
4. `SceneManager.applyTheme(config: ThemeConfig)` replaces today's `setLightMode(boolean)`. Sets renderer clearColor, fog color, ambient colors, baseline hemisphere, dir light, node materials, and pushes `setLightingSettings` + `setBackgroundColor` to Penumbra.
5. The `isLight` boolean is removed from public API; surviving call sites read the config's `id === 'light'` or specific fields.

### Migration

- `setLightMode(boolean)` → `applyTheme(config: ThemeConfig)`. Old method is kept as a thin wrapper for one minor version: `setLightMode(b)` → `applyTheme(b ? THEMES.light : THEMES.dark)`.
- The Toolbar Light/Dark button becomes a three-state cycle: dark → light → monument → dark. Cmd+K palette can pick any directly.

### Consequences

- **Good:** Adding a fourth theme later (e.g. high-contrast accessibility) is a 30-LOC config change, not a refactor.
- **Good:** CSS variables make every panel adopt the theme automatically — no per-component branching.
- **Good:** Penumbra's lighting is part of the theme, not retuned per-mode in `setLightMode` branches. Cleaner.
- **Bad:** ~150 LOC of one-time refactor across SceneManager, App, Toolbar, styles.css. Mitigated by the shape of the change (mostly mechanical).
- **Bad:** The current theme-toggle button becomes three-state; UI affordance is slightly less obvious. Mitigated by Cmd+K palette making theme an explicit picker too.

## Implementation Notes

- File: `Qualia/packages/ui/src/themes.ts` (new) — exports THEMES and ThemeConfig type
- File: `Qualia/packages/ui/src/App.tsx` — useEffect setting CSS vars from active theme
- File: `Qualia/packages/renderer/src/SceneManager.ts` — `applyTheme(config)` method, `setLightMode` legacy wrapper
- File: `Qualia/packages/ui/src/styles.css` — replace hardcoded colors with `var(--*)` references
- File: `Qualia/packages/ui/src/Toolbar.tsx` — three-state theme button

## Related

- Phase ADR: [`0006-phase-3.5-ui-polish.md`](0006-phase-3.5-ui-polish.md)
- Bug 0015 — earlier theme→Penumbra mirroring (this ADR formalizes the pattern)

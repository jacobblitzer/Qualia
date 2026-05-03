---
title: "Halo composited as 2D backdrop — nodes always render in front"
date: 2026-05-02
tags:
  - bug
  - rendering
  - integration
status: open
project: qualia
component: scene-manager + penumbra-pass
severity: medium
fix-commit: ""
---

# Halo composited as 2D backdrop — nodes always render in front

## Summary
The Penumbra SDF blob is composited as a fullscreen 2D quad in the Three scene with `depthTest: false, depthWrite: false`. Nodes (Three.js meshes) always draw on top of it regardless of their 3D position. User: "we should also see an indication that the halo blob is in front of the node meshes" — when a node is genuinely BEHIND the SDF surface in 3D space, it should be visually occluded.

This is the host-side counterpart to Penumbra Bug 0030 (no depth output).

## Environment
- File: `Qualia/packages/renderer/src/SceneManager.ts` (`setPenumbraRenderer`, `_render`)
- Penumbra: depth not exposed via PenumbraPass

## Root Cause
SceneManager renders the Penumbra texture as a fullscreen orthographic quad, depth-disabled. The actual SDF depth (computed inside Penumbra's ray-march) is discarded; only the color reaches Three. Three's main scene renders after with depth-test enabled, but nothing in the depth buffer reflects the SDF surface position — so all main-scene meshes pass depth and draw on top.

## Fix
Depends on Penumbra Bug 0030 first: Penumbra exports a depth texture. Then:
1. SceneManager's backdrop material becomes a custom `THREE.ShaderMaterial` that samples both color and depth from PenumbraPass.
2. Vertex shader writes depth via `gl_FragDepth` based on Penumbra's depth sample.
3. Three's standard depthTest then naturally occludes nodes that fall behind the SDF surface.

Alternative (no Penumbra change): render Penumbra in TWO passes — once behind nodes (as backdrop, current), once in front of nodes (with reduced opacity, drawing only "near" pixels). Cheap approximation; visually less accurate than true depth comp.

## Verification
- [ ] Drag a node into the halo blob — node visually disappears behind the SDF surface
- [ ] Drag back out — node reappears
- [ ] When camera orbits around halo, occlusion follows correctly

## Related
- Penumbra Bug 0030 (the upstream gap)
- Phase 3.5 plan: includes this as a structural change suitable for the polish phase

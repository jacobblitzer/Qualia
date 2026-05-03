---
title: "Depth-aware Penumbra composite"
date: 2026-05-02
tags:
  - decision
  - rendering
  - integration
status: accepted
project: qualia
component: scene-manager + penumbra-pass
---

# Depth-aware Penumbra composite

## Context and Problem Statement

The Penumbra SDF blob currently composites as a fullscreen 2D quad with `depthTest:false, depthWrite:false`. Three.js nodes always render in front of it regardless of 3D position. User reads it as "halo is a backdrop, not part of the scene."

Resolves Qualia Bug 0023 + Penumbra Bug 0030.

## Considered Options

1. **True depth composite** — Penumbra exports a depth texture (color + depth dual target); Qualia composites via custom ShaderMaterial that writes `gl_FragDepth`. Three's standard depth-test then occludes nodes correctly.
2. **Approximate two-pass** — render Penumbra twice: once as backdrop (current), once as foreground with reduced opacity for "near" pixels only. Cheap but inaccurate; visible artifacts at silhouette edges.
3. **Per-node Penumbra evaluation** — for each node, evaluate the SDF at its position; if inside the blob, hide/dim. Fast but doesn't work for partial occlusion.

## Decision Outcome

Chosen option: **(1) true depth composite**. The other options are cheap approximations that won't satisfy the user's "in front of nodes is part of the display" framing. (1) is bounded structural work: Penumbra adds a second render target, Qualia adds a custom shader material on the backdrop quad.

### Penumbra-side changes

1. WebGPU render pipeline gains a second color attachment of type `r32float` for depth. (Or pack into alpha of an `rgba16float` color target.)
2. `main.wgsl` and `main-atlas.wgsl` write `march.depth` (post-projection NDC) into the second target.
3. `PenumbraPass` exposes `pass.depthTexture: THREE.Texture` alongside `pass.texture`. Like color, it's a wrapped offscreen-canvas target.
4. Penumbra version bump: `@penumbra/three` 0.1.5 → 0.1.6 (+ runtime/shaders 0.1.3 → 0.1.4).

### Qualia-side changes

1. Custom `THREE.ShaderMaterial` for the backdrop quad replacing `MeshBasicMaterial`:
   - Samples both `pass.texture` (color) and `pass.depthTexture` (depth)
   - Vertex shader writes `gl_FragDepth = depthSample` (linearized to gl_DepthRange)
   - Fragment shader writes color with the host's halo opacity multiplier
2. The backdrop now participates in Three's depth buffer. Standard depth-test in subsequent draws occludes nodes that are behind the SDF surface.

### Coordinate-space alignment

Penumbra ray-marches in its own camera space; the depth it writes is in `[0, 1]` post-projection NDC matching `gl_FragCoord.z` semantics (assuming Penumbra and Three share `cameraToPenumbra`-converted matrices). If a small offset is needed (Penumbra's near plane vs Three's), it lands as a depth-bias uniform on the backdrop material.

### Consequences

- **Good:** halo becomes a 3D presence. Drag a node into the halo, it disappears behind. Camera orbit reveals proper occlusion.
- **Good:** Penumbra's `pass.depthTexture` is reusable by future hosts (Babylon adapter, native Rhino, headless CI screenshot tests).
- **Good:** Phase 4 valence orbits will look correct against the SDF blob automatically.
- **Bad:** extra render-target bandwidth on Penumbra side. Negligible for the resolutions Qualia uses (down-scaled to 40% by default).
- **Bad:** custom ShaderMaterial in Qualia adds ~80 LOC that needs to track Three's depth-write conventions across versions.
- **Bad:** Penumbra version bump (third in two days).

## Implementation Notes

- Penumbra: depth pre-existed in the WGSL fragment shader; just needs to be exported. Render-target setup change is bounded.
- Qualia: custom shader has standard Three.ShaderMaterial boilerplate. Test with a node that's clearly in front vs behind the halo from camera POV.
- Verification: drag a node "into" the SDF blob and confirm visual occlusion.

## Related

- Phase ADR: [`0006-phase-3.5-ui-polish.md`](0006-phase-3.5-ui-polish.md)
- Bugs: Qualia 0023, Penumbra 0030
- Files (Penumbra): `runtime/src/renderer-webgpu.ts`, `shaders/src/wgsl/main.wgsl`, `shaders/src/wgsl/main-atlas.wgsl`, `three/src/PenumbraPass.ts`
- Files (Qualia): `packages/renderer/src/SceneManager.ts` (backdrop material)

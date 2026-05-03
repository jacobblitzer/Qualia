---
type: repo
repo: Qualia
phase: 0
phase_name: "Phase 0 strip done; Phase 6 Penumbra integration in progress"
status: active
last_audit: 2026-05-01
test_count: null
component_count: null
peers: [Penumbra]
tags: [multiverse, repo]
---

# CLAUDE.md

## Project: Qualia — 3D Graph Editor

### Quick Reference
- **Build**: `npm run build` (Vite)
- **Dev**: `npm run dev` (Vite dev server)
- **Typecheck**: `npm run typecheck` (`tsc --noEmit`)
- **Status**: Phase 0 (SDF strip) complete. Phases 1-5 stubbed. Phase 6 (Penumbra integration) in progress.

### Before Any Work
Read `QUALIA-CLAUDE-CODE-PHASES.md` — phase order, scope, and acceptance criteria for Phases 0-6.

### Monorepo Packages
```
@qualia/core      → packages/core/src/      (types, Graph, EventStore, ContextManager, importExport)
@qualia/renderer  → packages/renderer/src/  (Three.js scene, NodeMesh, EdgeMesh, LabelLayer, SceneManager)
@qualia/ui        → packages/ui/src/        (React components, Sidebar, Viewport, SettingsManager)
```

### Penumbra Dependency

Qualia consumes [Penumbra](../Penumbra/) as its SDF rendering engine via the `@penumbra/three` host adapter. **Never depend on `@penumbra/runtime` or `@penumbra/core` directly** — use `@penumbra/three` only. See `docs/decisions/0001-penumbra-as-rendering-engine.md`.

#### Current install (Phase 1: local tarballs)

`package.json` declares `@penumbra/{core,runtime,shaders,three}` as `file:../Penumbra/dist-pkg/penumbra-*.tgz`. **Both repos must be checked out as siblings** (`Penumbra/` and `Qualia/` under the same parent). This is true under `C:\Repos\` already.

Current installed versions (as of 2026-05-02):
- `@penumbra/core` 0.1.2
- `@penumbra/runtime` 0.1.9 (+ particulate render mode, atlas-seeded)
- `@penumbra/shaders` 0.1.5
- `@penumbra/three` 0.1.11 (+ depth output, ADR 0007 / Bug 0030)

Recent Penumbra capabilities Qualia consumes:
- **Depth output** — `pass.depthTexture` (CanvasTexture wrapping 24-bit-packed NDC depth). Used by `PenumbraBackdropMaterial` for depth-aware composite (Bug 0023 fix).
- **Particulate render mode** (Penumbra ADR 0010) — `pass.setRenderMode('surface'|'particulate'|'blend')` + `pass.setParticulateParams(...)`. Atlas-seeded by default when the brick atlas is built; auto-falls-back to screen-pixel seeding otherwise. Wired through Qualia's Perf panel "Particulate (Penumbra)" section.

The tarballs in `Penumbra/dist-pkg/` are the only thing Qualia sees from Penumbra — Qualia does not read Penumbra source. To get a new Penumbra version into Qualia:

1. Penumbra produces new tarballs (see `Penumbra/dist-pkg/README.md`) and tags `v0.1.x`.
2. Bump the `0.1.0` references in this repo's `package.json` to match.
3. `npm install` — verify install resolves.
4. `npm run typecheck && npm run build` — verify Qualia compiles.
5. Manual smoke test (group rendering still works).
6. Commit + merge.

A failure at step 3 or 4 **does not break `main`** — the bump lives on a branch until verified.

#### Migration to GitHub Packages (Phase 2)

When Penumbra ships v1.0.0 OR a second non-Studio consumer (CPig, headless CI) needs Penumbra installs, the `file:` paths become semver ranges plus an `.npmrc`. See `Penumbra/docs/decisions/0006-penumbra-package-publication.md`. No Qualia source changes — only `package.json` + `.npmrc`.

### Documentation Structure
```
docs/
  bugs/           # One .md per bug
  debug-sessions/ # Investigation journals
  decisions/      # ADRs (MADR format)
  features/       # Feature status tracking
  research/       # Deep-dive reports
  templates/      # Canonical templates from MultiVerse
spec/             # (empty for now; populate when architectural specs accumulate)
QUALIA-CLAUDE-CODE-PHASES.md  # Phase plan, source of truth for scope
```

### Cross-Repo Change Protocol

When Qualia changes affect Penumbra's contract (adapter use, integration shape, version pin):

1. Update Qualia's CLAUDE.md "Penumbra Dependency" section.
2. If the change requires a Penumbra-side fix, file an issue or PR against Penumbra. **Do not edit Penumbra source from Qualia.**
3. Append a one-line entry to `C:\Repos\MultiVerse\BUILD_LOG.md`:
   ```
   YYYY-MM-DD | cross-repo | Qualia → Penumbra | one-line summary
   ```

### Auto-Journaling Rules

1. **After fixing a bug**: `docs/bugs/NNNN-short-name.md` with frontmatter (`status`, `severity`, `project: qualia`, `component`, `fix-commit`).
2. **After a debug session**: `docs/debug-sessions/YYYY-MM-DD-short-name.md`.
3. **After a significant decision**: `docs/decisions/NNNN-short-name.md` (MADR).
4. **After a research deep-dive**: `docs/research/YYYY-MM-DD-short-name.md`.
5. Use the canonical templates in `docs/templates/` (synced from `MultiVerse/templates/`).

### Commit Messages
Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`. Tag adapter-level changes with `feat(penumbra):` so cross-repo log entries cluster.

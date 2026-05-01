# QUALIA — Claude Code Phases
## Strip, Refactor, and Build a World-Class 3D Graph Editor

---

## UI INSPIRATION & DESIGN PHILOSOPHY

Before the phases: here's where Qualia's UI should draw from. The core problem is **multi-scale navigation** — the user needs to zoom from a 10,000-foot overview of their entire org graph down to a single node's metadata, and every zoom level needs to feel useful, not just bigger or smaller.

### Tools to Study

**Cosmograph** (cosmograph.app) — The gold standard for large graph visualization in a browser. GPU-accelerated force layout, handles 100K+ nodes at 60fps. What to steal: their **dynamic label system** — labels appear and disappear based on zoom level and node importance. At wide zoom, only high-importance nodes get labels. As you zoom in, more labels appear. This is semantic zoom done right for graphs. Also their histogram-based crossfiltering — select a range in a sidebar histogram, and the graph highlights matching nodes instantly.

**GraphXR** (Kineviz) — The best 3D graph navigation UI that exists today. Supports 2D, 3D, and VR modes. What to steal: their **property-driven visual encoding** — map any node/edge property to size, color, opacity via dropdowns. Their timeline scrubber for temporal data. Their "expansion" interaction — click a node, expand its neighbors, hide everything else. This is how you navigate a dense graph without getting lost.

**Kumu.io** — Purpose-built for stakeholder/systems mapping (Qualia's exact domain). What to steal: their **"perspectives" system** — different views of the same data, exactly like Qualia's contexts. Their SNA (Social Network Analysis) mode that auto-computes centrality and sizes nodes accordingly. Their decoration rules: "IF tag = leadership THEN size = large, color = red."

**Google Earth** — The king of multi-scale spatial navigation. What to steal: the **exponential zoom feel** — each scroll tick covers less ground as you zoom in, creating the sensation of "landing." The smooth transition between altitude levels. The way labels/features progressively appear (country names → city names → street names → building names). This is semantic zoom at planet scale.

**Figma's infinite canvas** — The benchmark for 2D spatial UIs. What to steal: **zoom-to-cursor** (zoom centers on where the mouse is, not screen center). The minimap. The way nested content (frames inside frames) is navigable at any scale. The keyboard shortcuts (Cmd+0 = zoom to fit, Cmd+1 = zoom to 100%, Z+click = zoom to point).

**yFiles LOD demo** — yWorks' level-of-detail demo for org charts. What to steal: their **discrete LOD tiers** — at full zoom, nodes show photo + name + title + department + email. One step out, photo + name + title. Another step, name only. Another, just a colored dot. The org chart remains navigable at every zoom level because the visual representation adapts.

**ExplorViz** — 3D software city visualization with semantic zoom research. What to steal: their **minimap as 2D top-down projection** alongside the 3D view. Their finding that discrete LOD levels (not continuous) are more usable — users prefer clear "snap" points.

### Qualia's UI Design Principles

1. **Semantic zoom is THE feature.** Not just geometric zoom (things get bigger). The visual representation of nodes should change based on camera distance: full detail cards → labeled spheres → colored dots → density clouds. This is what makes navigating a 1000-node graph feel manageable.

2. **The viewport is sacred.** 90%+ of the screen is the 3D canvas. Panels overlay or slide in from edges. Nothing permanently blocks the viewport except the absolute minimum (a thin toolbar, a thin status bar).

3. **Panels are contextual, not permanent.** The detail panel appears when you select something. The context switcher appears when you invoke it. Settings appear when you need them. Nothing is "always there" unless it needs to be.

4. **Property → Visual encoding is user-configurable.** The user picks which property drives node size, which drives color, which drives edge thickness. These mappings are saved per-context. This is how you get "the social network looks different from the reporting hierarchy" without hard-coding.

5. **The minimap is a 2D top-down projection.** Always visible in a corner. Shows the full graph extent, your current viewport as a rectangle, and allows click-to-navigate. This is essential for 3D graphs where you can get "lost" easily.

6. **Keyboard-driven navigation.** F = fit all. Double-click = zoom to node. 1-9 = switch context. Ctrl+Z = undo. / = search. Tab = cycle selection. These must work from day one.

---

## PHASE 0: STRIP (Prerequisite — Do This First)

**Goal:** Remove all SDF rendering code from Qualia. Leave clean integration hooks for Penumbra. The app should still run — showing nodes, edges, labels, and interaction — just without SDF fields.

**What Claude Code needs to know:** Qualia is a Vite + React + TypeScript monorepo at the GitHub repo. Three packages: `@qualia/core`, `@qualia/renderer`, `@qualia/ui`. The renderer currently has an SDF ray marching pass (SDFPass.ts, GLSL shaders, composite shader) that renders metaball fields behind the Three.js node/edge meshes. We're removing this because Penumbra (a separate SDF engine) will handle it later.

### Strip Tasks

**@qualia/core:**
- In `types.ts`: Keep `SDFFieldDef` and `SDFParams` types but rename them to `VisualGroup` and `VisualGroupParams`. Change `SDFFieldDef.sdf` to `VisualGroup.params`. Change the color format from `[number, number, number]` (0-255) to `[number, number, number]` (0-1) to match Penumbra's convention. Add `computedMetrics?: Record<string, number>` field for future visual encoding.
- In `Context` interface: Rename `fields: SDFFieldDef[]` to `groups: VisualGroup[]`.
- In `QualiaGraphJSON`: Update the context schema to use `groups` instead of `fields`. Add backward-compat: if `fields` is present, auto-migrate to `groups`.
- In `Graph.ts`: Rename `addField`/`updateField` to `addGroup`/`updateGroup`.
- In `reducers.ts`: Rename `FIELD_ADD`/`FIELD_UPDATE` events to `GROUP_ADD`/`GROUP_UPDATE`. Keep the same semantics.
- In `EventStore.ts`: Update convenience methods.
- In `importExport.ts`: Handle both `fields` (old) and `groups` (new) in JSON import.
- In demo JSON files (`simple-org.json`, `complex-system.json`): Migrate `fields` → `groups`. Convert colors from 0-255 to 0-1 range.

**@qualia/renderer:**
- **Delete:** `SDFPass.ts`, `shaders/sdf.vert.glsl`, `shaders/sdf.frag.glsl`, `shaders/composite.frag.glsl`, `displayModes.ts`.
- **SceneManager.ts:** Remove all SDF-related code:
  - Remove `SDFPass` import and instance
  - Remove composite pass (the `_sceneRT`, `_compositeScene`, `_compositeMaterial`, `_compositeCamera` — all of it)
  - Remove `_renderOrder` and `_blackTexture`
  - Remove all `sdfPass.*` calls from `applyViewerSettings`
  - Remove SDF-related settings: `sdfIntensity`, `opacityBoost`, `blendMode`, `fresnelStrength`, and all SDF effect settings (`noiseEnabled`, `contoursEnabled`, `warpEnabled`, `onionEnabled`, `interiorFogEnabled`, `colorBlendSharpness`, `noiseScale`, `noiseSpeed`, `contourSpacing`, `contourWidth`, `contourContrast`)
  - Simplify the render loop: just render the scene directly to screen (no intermediate render target, no composite)
  - Keep: camera, controls, lighting, grid, NodeMesh, EdgeMesh, LabelLayer, InteractionManager, Gumball, fog, ambient light
  - Add a stub method: `setPenumbraRenderer(renderer: any): void { /* future Penumbra integration */ }`
  - Add a stub method: `updateVisualGroups(groups: VisualGroup[]): void { /* future: push group data to Penumbra */ }`
- **QualiaRenderer.ts:** Remove SDF-related public API methods. Keep all interaction, camera, selection methods.
- **index.ts:** Remove SDFPass and displayModes exports. Add VisualGroup-related exports.

**@qualia/ui:**
- **Delete:** `SDFSettingsPanel.tsx` (or gut it to a stub "Groups" panel).
- **Sidebar.tsx:** Rename "Fields" section to "Groups". Show group labels and colors. Remove SDF-specific controls (radius, blend, transparency sliders). For now, just show the group as a colored label with a list of member nodes.
- **ViewportToolbar.tsx:** Remove SDF and FX buttons, or convert to stubs.
- **Toolbar.tsx:** Remove display mode buttons for now (will be rebuilt when Penumbra integrates). Keep: grid toggle, zoom all, fit, reset.
- **SettingsManager.ts:** Remove all SDF-related settings paths. Keep: camera, node, edge, label, grid, fog, ambient, theme settings.
- **App.tsx / Viewport.tsx:** Should still work — just rendering nodes + edges + labels in 3D with orbit controls.

### Exit Criteria
- App runs: `npm run dev` shows nodes, edges, labels in 3D
- Orbit, pan, zoom, click, select all still work
- No SDF fields visible (that's expected)
- No TypeScript errors
- No console errors
- Context switching still works (nodes rearrange, edges change)
- Undo/redo still works
- JSON import/export still works (with backward-compat `fields` → `groups` migration)

### What NOT to do
- Don't refactor the data model yet (that's Phase 2)
- Don't add Penumbra integration yet (that's future)
- Don't change the visual theme
- Don't touch LayoutEngine, analytics, DebugRecorder

---

## PHASE 1: SEMANTIC ZOOM (The Killer Feature)

**Goal:** Nodes change their visual representation based on camera distance. This is what turns Qualia from "yet another 3D graph" into a genuinely useful navigation tool.

**What Claude Code needs to know:** After Phase 0, Qualia renders nodes as instanced spheres (NodeMesh.ts using THREE.InstancedMesh with MeshStandardMaterial). Each node has a position, color, and size based on importance. Labels are CSS overlays (LabelLayer.ts). We need to add LOD (level of detail) to both nodes and labels.

### LOD Tiers

Define 4 discrete LOD levels based on screen-space size of the node (how big it appears in pixels, computed from world-space size and camera distance):

**LOD 0 — Dot** (< 6px screen size)
- Node renders as a simple colored dot (existing sphere at minimum scale)
- No label
- No selection highlight
- Used when zoomed very far out

**LOD 1 — Sphere + Label** (6-20px screen size)
- Node renders as colored sphere (current behavior)
- One-line label: just the node's `label` field
- Click to select
- This is the default "overview" level

**LOD 2 — Card** (20-60px screen size)
- Node renders as a colored sphere with a larger HTML overlay "card"
- Card shows: label (bold), subtitle, type badge, importance bar
- Hover shows edge connections as highlights
- This is the "working" level

**LOD 3 — Full Detail** (> 60px screen size)
- Node renders with full HTML detail panel docked to the node position
- Shows: label, subtitle, type, importance, all tags, notes preview, link icons, edge count
- This is the "inspecting" level — you're very close to one node

### Implementation

**NodeLOD system:**
- New file: `@qualia/renderer/NodeLOD.ts`
- Each frame, compute screen-space size for each node: `screenSize = (worldRadius * 2) / cameraDistance * viewportHeight / 2`
- Assign LOD level per node
- LOD 0-1: rendered by InstancedMesh (different scale/opacity per LOD)
- LOD 2-3: trigger HTML card overlays (like LabelLayer but richer)

**LabelLayer upgrade:**
- Currently shows/hides labels based on a simple importance threshold
- Replace with LOD-driven logic: LOD 0 = no label, LOD 1 = name only, LOD 2-3 = handled by card overlays
- Add importance-based priority: when many nodes are at LOD 1, only show labels for top N by importance (prevent label clutter)
- Use CSS transitions for label appear/disappear (fade, not pop)

**NodeCard component:**
- New React component: `@qualia/ui/NodeCard.tsx`
- Positioned in screen-space, anchored to node's projected position
- LOD 2: compact card (2-3 lines)
- LOD 3: full detail card (scrollable if needed)
- Cards use the existing dark theme CSS variables
- Cards should not overlap: implement basic collision avoidance (push cards apart if they'd overlap)

**Camera distance computation:**
- Use the existing camera position and node world position
- Compute per-node distance each frame (or throttle to every 2-3 frames for performance)
- Store LOD level per node in a typed array for fast access

### Exit Criteria
- Zoom in on a node: see it transition from dot → sphere+label → card → full detail
- Zoom out: see it collapse back
- Transitions are smooth (CSS fade on cards, scale interpolation on spheres)
- 100+ nodes at LOD 0 render at 60fps
- 20+ nodes at LOD 2 render at 60fps
- Label clutter is managed: at wide zoom, only important nodes show labels

---

## PHASE 2: DATA MODEL ENRICHMENT

**Goal:** Make nodes and edges genuinely rich data objects that can carry arbitrary metadata, computed properties, and typed schemas. This is the "pure functionality" core.

**What Claude Code needs to know:** Current node type is `NodeCore` with fixed fields (id, type, label, subtitle, importance, notes, tags, links, behavior, state, inbox, outbox). Edges have (id, source, target, type, weight, label, confidence, notes, behavior, state). We want these to be extensible with custom properties while keeping the fixed fields as first-class.

### New Types

```typescript
// Property schema definition (per node/edge type)
interface PropertySchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'url' | 'enum' | 'tags';
  required?: boolean;
  default?: unknown;
  // UI hints
  min?: number;           // for number
  max?: number;           // for number
  step?: number;          // for number
  options?: string[];     // for enum
  description?: string;
  // Visual encoding eligibility
  encodable?: boolean;    // can this drive node size/color/etc?
}

// Extended node type definition
interface NodeTypeDefinition {
  color: string;
  icon: string;
  baseRadius: number;
  properties?: PropertySchema[];  // NEW: custom property schemas
}

// Extended edge type definition  
interface EdgeTypeDefinition {
  color: string;
  dash: number[];
  defaultWeight: number;
  directional: boolean;
  properties?: PropertySchema[];  // NEW: custom property schemas
}

// NodeCore gets a custom properties bag
interface NodeCore {
  // ... existing fixed fields ...
  properties: Record<string, unknown>;  // NEW: custom properties
}

// Edge gets a custom properties bag
interface Edge {
  // ... existing fixed fields ...
  properties: Record<string, unknown>;  // NEW: custom properties
}

// Computed properties (auto-updated on graph changes)
interface ComputedProperty {
  key: string;
  label: string;
  compute: (nodeId: string, graph: Graph, contextId: string) => number;
  // Recompute trigger
  recomputeOn: ('node-change' | 'edge-change' | 'layout-change')[];
}

// Default computed properties
const BUILT_IN_COMPUTED: ComputedProperty[] = [
  { key: '_degree', label: 'Degree', compute: (id, g, ctx) => g.getNodeDegree(ctx, id), recomputeOn: ['edge-change'] },
  { key: '_inDegree', label: 'In-Degree', compute: ... },
  { key: '_outDegree', label: 'Out-Degree', compute: ... },
  { key: '_betweenness', label: 'Betweenness', compute: ... },
  { key: '_pageRank', label: 'PageRank', compute: ... },
  { key: '_clusterLabel', label: 'Cluster', compute: ... },
];
```

### Visual Encoding System

```typescript
// Per-context visual encoding: which property drives which visual channel
interface VisualEncoding {
  nodeSize?: string;        // property key (e.g. 'importance', '_degree', 'properties.revenue')
  nodeColor?: string;       // property key
  nodeOpacity?: string;     // property key  
  edgeThickness?: string;   // property key (e.g. 'weight', 'properties.messageCount')
  edgeColor?: string;       // property key
  edgeOpacity?: string;     // property key (e.g. 'confidence')
}

// Context gets this
interface Context {
  // ... existing fields ...
  encoding?: VisualEncoding;  // NEW: per-context visual mappings
}
```

The renderer reads the encoding config, resolves property values, normalizes them to 0-1, and maps to visual channels. This replaces the old `visualMapping` field (which had string keys but no resolution logic).

### Property Validation

When a node of type "person" is created, validate its `properties` against the `PropertySchema[]` defined in the `NodeTypeDefinition` for "person". Fill in defaults. Warn on missing required fields. This runs in the event reducer.

### JSON Schema Update

The `QualiaGraphJSON` format needs to carry the property schemas:

```json
{
  "meta": { "format": "qualia-v2", ... },
  "nodeTypes": {
    "person": {
      "color": "#4488ff",
      "icon": "circle",
      "baseRadius": 0.5,
      "properties": [
        { "key": "department", "label": "Department", "type": "enum", "options": ["Engineering", "Design", "Product", "Sales"], "encodable": true },
        { "key": "startDate", "label": "Start Date", "type": "date" },
        { "key": "email", "label": "Email", "type": "url" }
      ]
    }
  }
}
```

Backward compat: `qualia-v1` files without property schemas work fine — properties are unschematized.

### Exit Criteria
- Nodes and edges can carry arbitrary custom properties
- Property schemas validate on node creation
- Built-in computed properties (_degree, _pageRank, etc.) update automatically
- Visual encoding resolves properties to visual channels per-context
- Demo JSON files updated to v2 with property schemas and sample custom data
- JSON round-trip preserves all custom properties and schemas

---

## PHASE 3: MINIMAP + NAVIGATION POLISH

**Goal:** Add a 2D top-down minimap and polish all navigation interactions to feel professional.

### Minimap

- Renders in bottom-left corner of the viewport, ~150x150px, semi-transparent background
- Shows a 2D orthographic top-down projection (X-Z plane) of all node positions
- Each node is a colored dot, sized by importance
- Current camera viewport is shown as a rectangle (frustum projection onto the X-Z plane)
- Click-to-navigate: click a point on the minimap, camera smoothly flies there
- Drag the viewport rectangle to pan
- Groups/clusters are shown as colored regions (just convex hulls of member nodes, filled at low opacity)
- Toggle visibility with `M` key

### Navigation Polish

- **Zoom-to-cursor:** Scroll wheel zooms toward the mouse position in 3D space, not toward screen center. This requires projecting the mouse position to a 3D point and adjusting the orbit target.
- **Smooth fly-to:** Double-click a node → smooth animated camera flight (not instant teleport). Use eased interpolation over ~0.5s.
- **Fit-to-selection:** When nodes are selected, `F` fits the camera to frame just the selected nodes (not the whole graph).
- **Camera bookmarks:** Save/restore camera positions. Stored per-context. UI: small camera icon in the context switcher that saves current view.
- **Orbit center indicator:** Subtle crosshair or dot at the orbit center point. Fades after 1s of no input.

### Keyboard Shortcuts (Consolidate)

| Key | Action |
|-----|--------|
| `F` | Fit to selection (or fit all if nothing selected) |
| `A` | Fit all (zoom to show entire graph) |
| `M` | Toggle minimap |
| `G` | Toggle grid |
| `1`-`9` | Switch to context 1-9 |
| `0` | Superposition mode (all contexts blended) |
| `/` | Focus search |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Tab` | Cycle selection to next node |
| `Escape` | Clear selection |
| `Delete` | Delete selected node/edge |
| `N` | New node (at orbit center) |
| `E` | New edge (from last selected to next clicked) |

### Exit Criteria
- Minimap renders and updates in real time
- Click minimap to navigate works
- Zoom-to-cursor feels natural
- Double-click fly-to is smooth
- All keyboard shortcuts work
- Camera bookmarks save/restore per context

---

## PHASE 4: VISUAL ENCODING UI

**Goal:** Users can configure which properties drive visual channels (size, color, opacity) through the UI, per-context.

### Encoding Panel

When a context is active, the sidebar shows an "Encoding" section with dropdowns:

- **Node Size:** dropdown of all numeric properties (importance, _degree, _pageRank, custom numeric properties)
- **Node Color:** dropdown of all properties. Numeric → gradient (configurable two-color gradient). Enum/tags → categorical palette (auto-assigned).
- **Node Opacity:** dropdown of numeric properties
- **Edge Thickness:** dropdown of numeric edge properties (weight, confidence, custom)
- **Edge Color:** dropdown of edge properties
- **Edge Opacity:** dropdown of numeric edge properties

Each dropdown has a "None" option (use type defaults).

When an encoding is changed, the renderer immediately updates. The encoding is saved in the context's `encoding` field and persists in JSON export.

### Color Scales

- Numeric continuous: configurable two-color gradient (default: dark blue → bright green to match theme)
- Categorical: auto-assigned from a 12-color palette designed for dark backgrounds
- Boolean: two colors (true/false)

### Normalization

For numeric encodings, auto-compute min/max from the data and normalize to 0-1. Display the range in the UI. Allow manual range override (useful for consistent cross-context comparison).

### Exit Criteria
- Sidebar encoding dropdowns work
- Changing node size encoding immediately resizes nodes
- Changing node color encoding immediately recolors nodes
- Encoding is saved per-context
- JSON round-trip preserves encoding

---

## PHASE 5: NODE + EDGE EDITING

**Goal:** Full CRUD for nodes and edges directly in the 3D viewport.

### Node Creation
- Press `N`: creates a new node at the orbit center
- A creation dialog appears: type (dropdown from nodeTypes), label (text input), custom properties (generated from schema)
- Or: AI-assisted creation — type a description, Claude generates the node properties (future, just leave the hook)

### Edge Creation
- Select a node → press `E` → click another node → edge is created
- A creation dialog appears: type (dropdown from edgeTypes), weight, label, custom properties
- Visual feedback during creation: a dashed line follows the mouse from source to target candidate

### Inline Editing
- Double-click a node → detail panel goes into edit mode
- All properties become editable fields (text inputs, sliders, dropdowns based on schema)
- Changes dispatch `NODE_UPDATE` events (undoable)
- Esc or click away to exit edit mode

### Deletion
- Select node/edge → Delete key
- Confirmation for nodes (since it removes all connected edges)
- No confirmation for edges

### Multi-select Operations
- Shift+click to add to selection
- Box select (drag on background while holding a modifier key)
- Multi-select enables: bulk delete, bulk tag editing, bulk group assignment

### Exit Criteria
- Can create nodes and edges from the viewport
- Can edit all properties inline
- Can delete nodes and edges
- Can multi-select and bulk edit
- All operations are undoable

---

## PHASE 6: PENUMBRA INTEGRATION HOOKS (Preserve For Future)

**This phase is NOT for building now.** It's the documentation of what the clean integration surface looks like, so nothing in Phases 0-5 accidentally closes off the path.

### What Penumbra Needs From Qualia

1. **Group definitions:** For each VisualGroup in the active context, Penumbra needs: member node positions (as a point cloud), color, and computed visual metrics (blend factor, noise, transparency, etc.).

2. **Per-frame updates:** When nodes are dragged or layout is running, Penumbra needs updated positions.

3. **Context transitions:** When switching contexts, Penumbra needs interpolated group data (blended between old and new state).

4. **Camera sync:** Penumbra's ray marcher needs the same camera matrices as the Three.js scene.

### What Qualia Needs From Penumbra

1. **A render target texture:** Penumbra renders SDF fields to an offscreen texture. Qualia composites this behind the node/edge meshes.

2. **Hit testing (optional):** Can the user click on an SDF surface? If so, Penumbra needs to report which field was hit.

### The Integration Surface

```typescript
// In @qualia/renderer, the stub from Phase 0:
interface PenumbraIntegration {
  setGroups(groups: PenumbraGroupData[]): void;
  updatePositions(groupId: string, positions: Float32Array): void;
  setCamera(worldMatrix: Float32Array, projInverse: Float32Array): void;
  render(): THREE.Texture;  // returns the SDF render target
  dispose(): void;
}

interface PenumbraGroupData {
  id: string;
  positions: Float32Array;  // xyz xyz xyz ... (member node positions)
  color: [number, number, number];  // 0-1 RGB
  blendFactor: number;     // from visual encoding
  transparency: number;    // from visual encoding
  noise: number;           // from visual encoding
  // ... other Penumbra params computed by visual encoding
}
```

### Visual Encoding → Penumbra Bridge

The visual encoding system from Phase 2 computes metrics per-group. These map directly to Penumbra's `SDFMaterial` and `SDFEffects` types:

| Qualia Computed Metric | Penumbra Field |
|----------------------|----------------|
| `avgEdgeConfidence` | `material.transparency` (inverted) |
| `groupInstability` | `effects.noiseAmount` |
| `sharedNodeRatio` (between groups) | `geometry.params.blendRadius` (on smooth union) |
| `boundaryTension` | `effects.fresnelStrength` |
| `edgeDensity` | `effects.interiorFog` |
| `historicalDepth` | `effects.onionLayers` |

This table is the SDF visual vocabulary from the original research brief, preserved as a data-driven mapping. When Penumbra is ready, flip the switch.

---

## PRIORITY ORDER

| Priority | Phase | Effort | Can Run Unsupervised? |
|----------|-------|--------|-----------------------|
| **1** | Phase 0: Strip | ~45 min | Yes — mechanical refactor, TypeScript compiler catches issues |
| **2** | Phase 2: Data Model | ~60 min | Yes — pure TypeScript, no rendering, testable with unit tests |
| **3** | Phase 1: Semantic Zoom | ~90 min | Mostly — may need a screenshot review for LOD thresholds |
| **4** | Phase 3: Minimap + Nav | ~60 min | Mostly — may need feel-check on zoom-to-cursor |
| **5** | Phase 5: Node/Edge Editing | ~60 min | Yes — event system handles the data side, UI is straightforward |
| **6** | Phase 4: Visual Encoding UI | ~45 min | Yes — wiring dropdowns to existing encoding system |

Phase 6 is documentation, not implementation. Include it as comments/stubs throughout Phases 0-5.

**Total estimated Claude Code time: ~6 hours of autonomous work.**

Start with Phase 0 (strip), then Phase 2 (data model), then Phase 1 (semantic zoom). That gives you the architectural foundation, the data richness, and the killer UX feature — in that order.

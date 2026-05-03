# FIELD MAP: Research Brief
## 3D SDF-Rendered Graph Topology for Organizational Sensemaking

---

## 1. THE PHILOSOPHY: WHY ORGANIZATIONS ARE GRAPHS, NOT TREES

### The Cynefin Problem

Dave Snowden's Cynefin framework (1999, IBM) identifies five domains of organizational reality: **Clear**, **Complicated**, **Complex**, **Chaotic**, and **Confused**. The critical insight is that most organizations *think* they operate in the Complicated domain (where expert analysis reveals cause-and-effect), but actually live in the **Complex** domain — where cause and effect can only be understood in retrospect, and where "safe-to-fail probes" replace "fail-safe design."

Your frustration with your workplace — "people start tracking efforts, forget them, restart" — is a textbook symptom of Complex-domain behavior. Traditional org charts are built for the Clear and Complicated domains. They assume hierarchy is real, that reporting lines reflect actual influence, and that departments have clean boundaries. **None of this is true in practice.** What you actually need is a tool for **sensemaking** — not for documenting the org chart, but for *discovering* the org chart as it actually functions.

This is why a graph is the correct primitive. And this is why SDFs — with their inherent ambiguity, their soft boundaries, their ability to blend and overlap — are a philosophically correct rendering choice. An org chart lies. An SDF field tells you where the actual gravity is.

### What Existing Tools Get Wrong

**Rigid hierarchy tools** (Monday, Asana, org chart software) assume clean boundaries exist. They don't.

**Free-form tools** (Miro, FigJam) have no semantics. You can draw anything, but nothing *means* anything to the system. There's no computed layout, no automated inference, no way to ask "who is actually central here?"

**Graph databases** (Neo4j, with Bloom or GraphXR for visualization) are incredibly powerful but require a commitment to learning Cypher queries and data modeling. They're overkill for exploration and underkill for visual sensemaking.

**Personal knowledge management** (Obsidian, Roam, LogSeq) are note-first, graph-second. Their graph views are beautiful but cosmetic — you can't drag nodes into meaningful spatial arrangements, apply force models, or define typed relationships with visual weight.

**Network analysis tools** (Kumu, Gephi, InfraNodus) get closest. Kumu in particular was *designed* for stakeholder mapping and systems thinking. But none of them use SDFs. They all render as circles and lines on a flat plane, which means:
- Overlapping groups are awkward (Venn-style, or color-coded halos)
- Density of connection isn't *felt*, only counted
- The viewer's eye isn't drawn to gravitational centers — you have to cognitively compute centrality yourself

### What SDF-Based Rendering Fixes

SDFs solve a visual-cognition problem that no existing tool addresses: **the feeling of proximity and influence as a continuous field, not a discrete label.**

When two departments share a lot of people and work closely together, a node-and-edge diagram shows you crossing lines. An SDF field *merges those departments into a single blob*, with a visible gradient showing where one ends and the other begins. When departments drift apart, the blob separates into two. This is **automatic visual sensemaking** — the rendering itself tells you something about the data that you didn't have to query for.

---

## 2. THE SDF VISUAL VOCABULARY: What Properties Can Encode Data

This is where the real magic lives. SDFs aren't just blob renderers — they're a rich visual encoding system. Here's the full vocabulary of what an SDF field can express, mapped to organizational data:

### Surface Properties (via Ray Marching in GLSL)

| SDF Visual Property | What It Encodes | How It Works |
|---|---|---|
| **Field radius / influence** | Scope of authority/reach | Larger radius = more organizational influence. A C-suite exec's field covers more space than an IC. |
| **Smooth-min blending factor (k)** | Strength of collaboration | Inigo Quilez's `opSmoothUnion(d1, d2, k)` controls how readily two fields merge. High k = tight collaboration, the fields blend like water drops. Low k = they remain separate even when close. |
| **Transparency / alpha** | Confidence / data quality | Solid fields = well-documented, high-confidence information. Ghostly transparent fields = rumors, informal connections, "I think they report to..." |
| **Surface texture / noise** | Stability / turbulence | Apply Perlin noise to the SDF surface. Smooth = stable team/process. Noisy/turbulent = team in flux, reorg incoming, contested territory. |
| **Isosurface contour lines** | Levels of engagement | Draw multiple iso-levels (like a topographic map). Tight contour lines = steep gradient = hard boundary. Wide spacing = gentle influence that fades gradually. |
| **Color** | Type / domain / department | The obvious one. But in SDF, colors *blend* where fields overlap, showing you cross-functional zones. |
| **Fresnel glow at edges** | Boundary tension | Where two fields almost-but-don't-quite merge, a Fresnel-like glow shows organizational friction — departments that *should* be collaborating but aren't. |
| **Interior density / fog** | Information density | Volumetric fog inside a field shows how much "stuff" (projects, processes, communications) lives within that context. Dense fog = busy, overloaded team. |
| **Surface displacement** | Edge irregularity | Smooth sphere = well-defined team. Displaced/bumpy surface = team with unclear boundaries, people who are half-in-half-out. |
| **Onion layers** | Historical depth | Quilez's `abs(sdf) - thickness` operation creates concentric shells. Each layer can represent a time period — showing how a department has grown or contracted over time. |
| **Curl / twist** | Process flow direction | Apply domain warping (twisting the coordinate space) to show the direction of information or work flow through a context. |
| **Fractal subdivision** | Hierarchical nesting | Recursive SDF operations can show teams-within-teams-within-divisions, with the fractal depth corresponding to org hierarchy depth. |

### Edge / Connection Properties

| Visual Property | What It Encodes |
|---|---|
| **Thickness** | Importance / frequency of interaction |
| **Opacity** | Confidence in the connection's existence |
| **Dash pattern** | Type (reports-to, collaborates-with, depends-on, blocks) |
| **Curvature** | Indirectness (straight = direct report; curved = goes-through-intermediary) |
| **Particle flow along edge** | Direction and volume of work/information flow |
| **Color** | Relationship category |
| **Pulsing / animation** | Recency / activity (connections that are active right now vs. dormant) |

### Node Properties

| Visual Property | What It Encodes |
|---|---|
| **Size** | Importance / influence / seniority |
| **Shape** | Type (person, team, tool, process, meeting) |
| **Glow radius** | Reach / how many connections |
| **Ring / halo** | Status (active, on leave, new hire, departing) |
| **Internal icon** | Quick type identification |
| **Label size** | Proportional to importance (or user-set) |
| **Z-position (depth in 3D)** | Temporal layer, or hierarchy level |

---

## 3. KEY PRECEDENT SYSTEMS

### 3d-force-graph (vasturiano)

**What:** Open-source WebGL component for 3D force-directed graphs. Uses Three.js and d3-force-3d physics.
**Why it matters:** This is the de facto standard for 3D graph visualization in the browser. Has VR and AR variants. The JSON format is dead simple:

```json
{
  "nodes": [{ "id": "alice", "name": "Alice", "val": 10 }],
  "links": [{ "source": "alice", "target": "bob" }]
}
```

**What to steal:** The simplicity of the JSON input format. The force-directed layout engine (d3-force-3d). The fact that it runs everywhere.
**What it lacks:** No SDF rendering. No concept of "fields" or "contexts." Nodes are just spheres. No progressive disclosure.

### Kumu.io

**What:** Web-based stakeholder/systems mapping tool. Purpose-built for organizational complexity.
**Why it matters:** Kumu understands that relationships have types, weights, and directions. It computes centrality, betweenness, and other network metrics. It has a "SNA" (Social Network Analysis) mode.
**What to steal:** The idea of "perspectives" — different views of the same underlying data. Stakeholder mapping templates. The integration of network science metrics into the visual display.
**What it lacks:** 2D only. No SDF. No 3D. No offline mode. No self-hosting.

### Obsidian Canvas / Graph View

**What:** The graph view in Obsidian renders your vault as a force-directed 2D graph. Canvas files are a freeform spatial arrangement.
**Why it matters:** Massive user base. The `.canvas` JSON format is well-documented and simple. Obsidian is local-first, privacy-first.
**What to steal:** The `.canvas` format for import/export interop. The idea of "every node can link to a deeper document." The local-first philosophy.
**What it lacks:** Graph view is cosmetic, not analytical. Canvas has no computed layout. No typed relationships. No SDF.

### Gephi

**What:** Open-source desktop app for network analysis and visualization. The academic standard.
**Why it matters:** Supports massive graphs (millions of nodes). Has every layout algorithm (ForceAtlas2, Fruchterman-Reingold, Yifan Hu, etc.). Computes every metric (PageRank, modularity, betweenness centrality).
**What to steal:** The layout algorithms. The analytics. The GEXF export format.
**What it lacks:** Ugly. Steep learning curve. Desktop-only Java app. No real-time collaboration. No SDF.

### Neo4j + Bloom / GraphXR

**What:** The world's most popular graph database, with visual exploration tools.
**Why it matters:** If you ever need to scale to thousands or millions of nodes, you need a real graph database behind the scenes. Neo4j's Cypher query language is powerful. GraphXR does 3D visualization.
**What to steal:** The property graph model (nodes and edges both have typed key-value properties). Cypher as a query language for power users. GraphXR's 3D layout approach.
**What it lacks:** Heavy infrastructure. Not a quick sketch tool. SDF would need to be built on top.

### yFiles Metaball Rendering

**What:** yWorks (a commercial graph visualization library) has a metaball rendering demo that uses WebGL fragment shaders to draw SDF-based context fields around grouped nodes.
**Why it matters:** **This is the closest existing precedent to what you want.** It proves the concept works for diagrams — using signed distance fields to show grouping context without rigid boundaries. Nodes can belong to multiple metaball groups, and the blobs blend where groups overlap.
**What to steal:** The core rendering approach. The proof that SDF+graph works.
**What it lacks:** 2D only. Commercial/proprietary. Not a full organizational mapping tool.

### Shadertoy / Inigo Quilez's SDF Library

**What:** Quilez has published the definitive reference for SDF primitives, boolean operations, smooth blending, domain warping, and ray marching.
**Why it matters:** This is the mathematical foundation for everything. His `opSmoothUnion` (smooth-min) function is literally the formula for how organizational contexts merge visually. His domain warping techniques (twist, bend, cheap bend) are how you'd add "turbulence" or "flow" to context fields.
**Key functions:**
- `opSmoothUnion(d1, d2, k)` — merge two fields with blending factor k
- `opSmoothSubtraction(d1, d2, k)` — carve one field out of another
- `opSmoothIntersection(d1, d2, k)` — show only where two fields overlap
- `opOnion(sdf, thickness)` — create concentric shells
- `opCheapBend(p)` — warp space to show flow
**What to steal:** Everything. This is the shader bible.

---

## 4. ARCHITECTURE: Core + UI Layers

You said you want this to run on Mac/Linux/Windows/Browser. Here's the architecture that makes that possible:

### The Core (Platform-Agnostic)

```
┌─────────────────────────────────────────────┐
│              FIELD MAP CORE                  │
│                                             │
│  ┌───────────┐  ┌────────────┐  ┌────────┐ │
│  │  Graph     │  │  Layout    │  │ SDF    │ │
│  │  Engine    │  │  Engine    │  │ Kernel │ │
│  │           │  │           │  │        │ │
│  │ Nodes     │  │ Force-    │  │ Field  │ │
│  │ Edges     │  │ directed  │  │ defs   │ │
│  │ Contexts  │  │ Hierarchy │  │ Blend  │ │
│  │ Properties│  │ Circular  │  │ ops    │ │
│  │ Types     │  │ Manual    │  │ Iso    │ │
│  │ Queries   │  │ Clustered │  │ levels │ │
│  └───────────┘  └────────────┘  └────────┘ │
│                                             │
│  ┌───────────┐  ┌────────────┐  ┌────────┐ │
│  │  Import/  │  │  Analytics │  │ JSON   │ │
│  │  Export   │  │            │  │ Schema │ │
│  │           │  │ Centrality │  │        │ │
│  │ JSON      │  │ Modularity │  │ v1 API │ │
│  │ .canvas   │  │ Betweeness │  │ Types  │ │
│  │ GEXF      │  │ PageRank   │  │ Valid. │ │
│  │ GraphML   │  │ Clustering │  │        │ │
│  │ CSV       │  │            │  │        │ │
│  └───────────┘  └────────────┘  └────────┘ │
│                                             │
│          Written in TypeScript              │
│        Runs in Node.js or Browser           │
└─────────────────────────────────────────────┘
```

The core is **pure TypeScript** with zero rendering dependencies. It manages the graph data model, runs layout algorithms (port d3-force-3d), computes analytics, and defines the SDF field parameters. It imports and exports to every format. It validates JSON schemas. It knows nothing about pixels.

### The Renderer (WebGL/WebGPU)

```
┌─────────────────────────────────────────────┐
│            RENDERER (Three.js)              │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │       Ray Marching SDF Shader       │    │
│  │                                     │    │
│  │  • Full-screen quad                 │    │
│  │  • Upload node positions as texture │    │
│  │  • Smooth-union all fields per px   │    │
│  │  • Compute normals via gradient     │    │
│  │  • PBR lighting on SDF surface      │    │
│  │  • Transparency / fog / contours    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │       Standard Mesh Layer           │    │
│  │                                     │    │
│  │  • Node spheres/icons (instanced)   │    │
│  │  • Edge lines (BufferGeometry)      │    │
│  │  • Labels (SDF text rendering!)     │    │
│  │  • Particle flow on edges           │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │       Interaction Layer             │    │
│  │                                     │    │
│  │  • Orbit camera controls            │    │
│  │  • Node picking (raycasting)        │    │
│  │  • Drag to reposition               │    │
│  │  • Multi-select (lasso / box)       │    │
│  │  • Context menu                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│      Runs in any browser (WebGL 2)          │
│      WebGPU path for future performance     │
└─────────────────────────────────────────────┘
```

The key insight from the research: **the SDF fields should be ray-marched in a fragment shader on a full-screen quad**, while nodes and edges are rendered as standard Three.js meshes on top. This is exactly the approach used in the Codrops/Three.js metaball tutorials and the yFiles metaball demo. Node positions are uploaded to the GPU as a DataTexture (a flat array of vec3/vec4), and the shader evaluates the combined SDF field per-pixel.

For labels, use Valve's SDF text rendering technique (MSDF atlases) — this gives you resolution-independent text that looks crisp at any zoom level, which is critical for a graph that can hold thousands of nodes.

### The UI Layer (Swappable)

```
┌──────────────────────┐  ┌──────────────────────┐
│   Browser UI (React) │  │   Desktop (Electron   │
│                      │  │   or Tauri)           │
│  • Sidebar panels    │  │                       │
│  • Property editors  │  │  • Same React UI      │
│  • Search / filter   │  │  • File system access │
│  • JSON paste input  │  │  • Obsidian vault     │
│  • Export dialogs    │  │    integration         │
│  • Settings tiers    │  │  • Drag-drop .json    │
│                      │  │  • System tray        │
└──────────────────────┘  └──────────────────────┘

┌──────────────────────┐  ┌──────────────────────┐
│   CLI (Node.js)      │  │   Plugin/Embed       │
│                      │  │                       │
│  • Headless render   │  │  • Obsidian plugin    │
│  • JSON in → PNG out │  │  • VS Code extension  │
│  • Batch analytics   │  │  • Notion embed       │
│  • CI/CD pipeline    │  │  • <iframe> embed     │
│  • AI-generated JSON │  │  • React component    │
└──────────────────────┘  └──────────────────────┘
```

---

## 5. PROGRESSIVE DISCLOSURE: Tiered Settings Granularity

Nielsen Norman Group's research confirms: progressive disclosure works best at 2 levels, tolerable at 3, and breaks past that. Here's the tier model:

### Tier 0: Instant Use (No Settings)

Drop a JSON file in. See a 3D graph with SDF fields. Orbit. Click nodes. Done.

Default behaviors: force-directed layout auto-runs, SDF fields auto-generate from node `group` properties, edges render with default thickness proportional to `weight`, colors auto-assign from node `type`.

### Tier 1: Quick Customize (The Sidebar)

Visible in a collapsible sidebar. Available to anyone who clicks the settings icon.

- Node types and their colors/icons
- Edge types and their line styles
- Which fields are visible
- Layout algorithm choice (force / hierarchy / manual)
- Search and filter
- Basic analytics (who is most connected?)

### Tier 2: Power User (The Properties Panel)

Accessible by double-clicking any element, or opening "Advanced Settings."

- Per-node properties (name, subtitle, notes, external links)
- Per-edge properties (weight, type, label, direction)
- Per-field properties (SDF radius, blend factor, color, transparency, noise)
- Layout parameters (force strength, link distance, gravity)
- Import/export format selection
- JSON schema validation

### Tier 3: God Mode (The Console)

Accessible via a keyboard shortcut (backtick or F12).

- Raw JSON editor for the entire graph state
- Cypher-like query language for filtering
- Custom shader parameter overrides
- Analytics dashboard (centrality, modularity, clustering coefficients)
- Batch operations ("set all edges of type X to weight Y")
- Plugin/extension API
- Direct SDF parameter editing (field functions, isosurface thresholds, domain warping parameters)

---

## 6. THE JSON SCHEMA: AI-Friendly Input

The key to making this AI-feedable is a dead-simple JSON schema. Here's the proposed v1:

```json
{
  "meta": {
    "format": "fieldmap-v1",
    "title": "2008 Financial Crisis — Key Actors",
    "description": "Generated by Claude",
    "created": "2026-03-28T00:00:00Z"
  },

  "nodeTypes": {
    "institution": { "color": "#ff6b9d", "icon": "bank", "baseRadius": 1.0 },
    "person": { "color": "#4ff0c1", "icon": "user", "baseRadius": 0.7 },
    "instrument": { "color": "#ffd166", "icon": "document", "baseRadius": 0.5 },
    "regulator": { "color": "#60a5fa", "icon": "shield", "baseRadius": 0.8 }
  },

  "edgeTypes": {
    "controls": { "color": "#ff6b9d", "dash": [], "defaultWeight": 1.0 },
    "trades_with": { "color": "#ffd166", "dash": [6, 4], "defaultWeight": 0.5 },
    "regulates": { "color": "#60a5fa", "dash": [3, 3], "defaultWeight": 0.8 },
    "lobbies": { "color": "#a78bfa", "dash": [2, 4], "defaultWeight": 0.3 }
  },

  "nodes": [
    {
      "id": "goldman",
      "type": "institution",
      "label": "Goldman Sachs",
      "subtitle": "Investment Bank",
      "importance": 0.95,
      "notes": "Key player in CDO creation and trading",
      "links": {
        "wikipedia": "https://en.wikipedia.org/wiki/Goldman_Sachs"
      },
      "tags": ["wall-street", "too-big-to-fail"],
      "position": null
    },
    {
      "id": "paulson",
      "type": "person",
      "label": "Hank Paulson",
      "subtitle": "Treasury Secretary (2006-2009)",
      "importance": 0.9,
      "notes": "Former Goldman CEO, orchestrated TARP",
      "tags": ["government", "wall-street"]
    }
  ],

  "edges": [
    {
      "id": "e1",
      "source": "goldman",
      "target": "paulson",
      "type": "controls",
      "weight": 0.8,
      "label": "Former CEO",
      "directional": true,
      "confidence": 1.0,
      "notes": "Left Goldman in 2006 to become Treasury Secretary"
    }
  ],

  "fields": [
    {
      "id": "f1",
      "label": "Wall Street",
      "nodeIds": ["goldman", "lehman", "bear_stearns", "merrill"],
      "color": [255, 107, 157],
      "sdf": {
        "radius": 150,
        "blendFactor": 0.6,
        "transparency": 0.3,
        "noise": 0.1,
        "contourLines": false
      }
    },
    {
      "id": "f2",
      "label": "Regulators",
      "nodeIds": ["sec", "fed", "treasury", "paulson"],
      "color": [96, 165, 250],
      "sdf": {
        "radius": 120,
        "blendFactor": 0.3,
        "transparency": 0.5,
        "noise": 0.4,
        "contourLines": true
      }
    }
  ],

  "layout": {
    "algorithm": "force-directed",
    "params": {
      "chargeStrength": -100,
      "linkDistance": 50,
      "gravity": 0.1
    }
  }
}
```

Notice: `importance`, `weight`, `confidence`, and `noise` are all 0-1 floats. This is intentional — it makes it trivial for an AI to generate these values. Ask Claude "map the 2008 financial crisis" and it can produce a valid JSON file immediately.

The `position` field is nullable — if null, the layout engine positions the node. If set, it's a manual override. This lets AI generate the *data* while the layout engine handles the *spatial arrangement*, but also lets humans pin important nodes where they want them.

---

## 7. INTEGRATION PHILOSOPHY: Links, Not Locks

The tool should never try to *replace* Obsidian, Miro, Monday, Figma, or Neo4j. Instead:

**Every node can have a `links` object** with URLs to external tools. Click a link, it opens in the external tool. The graph is the *map*, not the *territory*.

**Import/Export is the integration layer:**
- `.json` (native format, round-trips perfectly)
- `.canvas` (Obsidian Canvas — nodes become text cards, edges become arrows)
- `.gexf` / `.graphml` (Gephi, yEd, other network tools)
- `.csv` (edge list format — works with everything)
- Clipboard paste (paste a JSON blob, get a graph)
- URL fetch (point at a JSON URL, auto-refresh)

**For deeper integration (future):**
- Obsidian plugin that reads vault links and generates a fieldmap JSON
- Monday.com API connector that pulls board structure
- Figma plugin that embeds fieldmap as a widget
- MCP server that lets Claude read and write the graph in real-time

---

## 8. IMPLEMENTATION PRIORITIES

For Claude Code to build this, here's the suggested phasing:

### Phase 1: The Core (Week 1)
- TypeScript graph data model with JSON schema validation
- d3-force-3d layout engine integration
- Import/export: JSON, CSV, .canvas
- Node/edge/field CRUD operations
- Basic analytics (degree centrality, connected components)

### Phase 2: The 3D Renderer (Week 2)
- Three.js scene with orbit controls
- Instanced node rendering (spheres with icons)
- Edge rendering (BufferGeometry lines with thickness)
- Full-screen quad SDF ray marching shader
- Node positions → DataTexture → GPU pipeline
- Smooth-union field blending
- MSDF text labels

### Phase 3: The UI (Week 3)
- React sidebar with Tier 0-2 settings
- Node/edge selection and property editing
- Context menu (right-click)
- Search and filter
- Drag-and-drop JSON import
- Keyboard shortcuts

### Phase 4: Polish & Integration (Week 4)
- Tier 3 console / JSON editor
- Additional export formats (GEXF, GraphML)
- SDF visual properties (noise, contour lines, transparency)
- Edge particles and animation
- Performance optimization for 1000+ nodes
- Electron/Tauri desktop wrapper

---

## 9. REFERENCES & FURTHER READING

**SDF Mathematics:**
- Inigo Quilez — Distance Functions reference: iquilezles.org/articles/distfunctions/
- Inigo Quilez — Smooth Minimum (smooth blending): iquilezles.org/articles/smin/
- Codrops — Interactive Metaballs with Three.js and GLSL (2025)
- 4rknova.com — "Ray marching a blob" (Three.js + PBR + shadows)
- Michael Walczyk — Ray Marching tutorial (michaelwalczyk.com)

**Graph Visualization:**
- vasturiano/3d-force-graph — GitHub (the standard 3D graph component)
- vasturiano/d3-force-3d — GitHub (3D force-directed physics)
- yWorks Metaball Rendering Demo (SDF + graph, 2D, commercial)
- Gephi — gephi.org (network analysis)
- Kumu — kumu.io (stakeholder/systems mapping)

**Organizational Theory:**
- Snowden & Boone — "A Leader's Framework for Decision Making" (HBR, 2007)
- Cynefin Framework — thecynefin.co
- Estuarine Mapping — applied complexity strategy

**Progressive Disclosure:**
- Nielsen Norman Group — "Progressive Disclosure" (nngroup.com)
- Enterprise progressive disclosure: 3-tier model (essential / common / advanced)

**File Formats for Interop:**
- Obsidian Canvas spec: `.canvas` JSON format
- GEXF (Graph Exchange XML Format): gexf.net
- GraphML: graphml.graphdrawing.org

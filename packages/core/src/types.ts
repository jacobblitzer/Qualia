// ============================================================================
// Qualia Core Type Definitions
// ============================================================================

// --- SDF Atom + Display ---

/**
 * Geometry shape for a node's SDF atom. Mirrors Penumbra's SDFShape
 * (a subset — we don't need every primitive Penumbra supports for nodes).
 */
export type NodeAtomShape = 'sphere' | 'box' | 'roundBox' | 'capsule' | 'ellipsoid' | 'torus';

/**
 * A node's intrinsic geometry. Per ADR Qualia 0003, every node has an
 * implicit SDF atom; missing fields default to sphere of radius=baseRadius.
 *
 * The shape's parameter shape mirrors Penumbra's SDFPrimitive:
 *   - sphere: { radius }
 *   - box: { halfX, halfY, halfZ }
 *   - roundBox: { halfX, halfY, halfZ, round }
 *   - capsule: { ay, by, radius }   (axis-aligned along Y; height = (by - ay))
 *   - ellipsoid: { rx, ry, rz }
 *   - torus: { radiusMajor, radiusMinor }
 */
export interface NodeAtom {
  shape: NodeAtomShape;
  params?: Record<string, number>;
}

/**
 * How to draw a node. The same atom geometry can be displayed in multiple
 * representations — Penumbra atoms cache these natively (tape/atlas/mesh/
 * point-sample/AABB/bounding-sphere). Qualia exposes them via this enum.
 *
 *   - 'mesh':           triangle-mesh approximation as Three.Mesh (default)
 *   - 'tape':           rendered by Penumbra's ray-marcher only — no Three mesh
 *   - 'point-cloud':    sampled surface points as Three.Points
 *   - 'aabb':           wireframe axis-aligned bounding box
 *   - 'bounding-sphere':wireframe sphere at the atom's bounding radius
 *   - 'hidden':         no Three rendering at all (still picked up by SDF skeleton)
 */
export type NodeDisplayMode =
  | 'mesh'
  | 'tape'
  | 'point-cloud'
  | 'aabb'
  | 'bounding-sphere'
  | 'hidden';

// --- Node Types & Edge Types Registries ---

export interface NodeTypeDefinition {
  color: string;
  icon: string;
  baseRadius: number;
  /** Default SDF atom for nodes of this type. If unset, nodes get a sphere of radius=baseRadius. */
  sdfAtom?: NodeAtom;
  /** Default display mode for nodes of this type. If unset, falls back to the global default. */
  displayMode?: NodeDisplayMode;
}

export interface EdgeTypeDefinition {
  color: string;
  dash: number[];
  defaultWeight: number;
  directional: boolean;
  /** Default visual shape for edges of this type. Falls back to global default. */
  shape?: EdgeShape;
}

/**
 * Visual shape used to draw an edge.
 *
 *   straight        — single line segment, source → target
 *   quadratic-bezier— one control point bowed perpendicular to the chord
 *   cubic-bezier    — two control points, S-shape possible
 *   catmull-rom     — smooth spline through waypoints (from routing)
 *   polyline        — linear segments through waypoints (from routing)
 *   tube-sdf        — rendered only by Penumbra as a smooth-unioned capsule
 *                     in the SDF skeleton; no Three-side line is drawn
 */
export type EdgeShape =
  | 'straight'
  | 'quadratic-bezier'
  | 'cubic-bezier'
  | 'catmull-rom'
  | 'polyline'
  | 'tube-sdf';

/**
 * How edge waypoints (control points / spline knots) are computed.
 *
 *   straight            — no waypoints; source-to-target only
 *   repulsion           — (α) midpoint bowed away from nearest non-endpoint node
 *   field-gradient      — (β) waypoints settle into low-density channels by
 *                         gradient descent on a sum-of-Gaussian-blobs proxy field
 *   penumbra-gradient   — (γ) stub. True Penumbra SDF gradient via shader readback.
 *                         Throws if invoked.
 */
export type EdgeRoutingMode =
  | 'straight'
  | 'repulsion'
  | 'field-gradient'
  | 'penumbra-gradient';

// --- Core Node ---

export interface AgentBehavior {
  type: string;
  params: Record<string, unknown>;
}

export interface NodeCore {
  id: string;
  type: string;
  label: string;
  subtitle?: string;
  importance?: number;    // 0-1, affects rendered size
  notes?: string;
  tags?: string[];
  links?: Record<string, string>;  // external URLs keyed by tool name
  // Per-node overrides — when set, these win over nodeType defaults.
  // See ADR Qualia 0003 for the resolver cascade.
  sdfAtom?: NodeAtom;
  displayMode?: NodeDisplayMode;
  // Agent scaffolding — always present, default to null/empty
  behavior: AgentBehavior | null;
  state: Record<string, unknown>;
  inbox: unknown[];
  outbox: unknown[];
}

// --- Edge ---

export interface Edge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight?: number;       // 0-1
  label?: string;
  confidence?: number;   // 0-1, affects opacity
  notes?: string;
  /** Per-edge shape override. When set, wins over edgeType.shape and global default. */
  shape?: EdgeShape;
  // Agent scaffolding
  behavior: AgentBehavior | null;
  state: Record<string, unknown>;
}

// --- Visual Group (formerly SDF Field) ---

export interface VisualGroupParams {
  radius: number;
  blendFactor: number;    // 0-1, smooth-min k
  transparency: number;   // 0-1
  noise?: number;         // 0-1, surface turbulence
  contourLines?: boolean;
}

export interface VisualGroup {
  id: string;
  label: string;
  nodeIds: string[];
  color: [number, number, number];  // RGB 0-1 (Penumbra convention)
  params: VisualGroupParams;
  computedMetrics?: Record<string, number>;
}

/** @deprecated Use VisualGroupParams */
export type SDFParams = VisualGroupParams;
/** @deprecated Use VisualGroup */
export type SDFFieldDef = VisualGroup;

// --- Context ---

export interface LayoutConfig {
  algorithm: 'force-directed' | 'hierarchy' | 'manual';
  params?: Record<string, number>;
}

export interface VisualMapping {
  nodeSize?: string;
  nodeColor?: string;
  edgeThickness?: string;
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export interface Context {
  id: string;
  label: string;
  description?: string;
  edges: Edge[];
  groups: VisualGroup[];
  layout: LayoutConfig;
  visualMapping?: VisualMapping;
  camera?: CameraState;
  positions?: Record<string, [number, number, number]>;
}

// --- Full Graph JSON Schema (Qualia v1) ---

export interface QualiaGraphJSON {
  meta: {
    format: 'qualia-v1';
    title: string;
    description?: string;
    created: string;
  };

  nodeTypes: Record<string, NodeTypeDefinition>;
  edgeTypes: Record<string, EdgeTypeDefinition>;

  nodes: Array<{
    id: string;
    type: string;
    label: string;
    subtitle?: string;
    importance?: number;
    notes?: string;
    tags?: string[];
    links?: Record<string, string>;
    behavior?: AgentBehavior | null;
    state?: Record<string, unknown>;
  }>;

  contexts: Array<{
    id: string;
    label: string;
    description?: string;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      weight?: number;
      label?: string;
      confidence?: number;
      notes?: string;
      behavior?: AgentBehavior | null;
      state?: Record<string, unknown>;
    }>;
    groups?: Array<{
      id: string;
      label: string;
      nodeIds: string[];
      color: [number, number, number];
      params: {
        radius: number;
        blendFactor: number;
        transparency: number;
        noise?: number;
        contourLines?: boolean;
      };
    }>;
    // Backward compat: old format used "fields" with "sdf" sub-object
    fields?: Array<{
      id: string;
      label: string;
      nodeIds: string[];
      color: [number, number, number];
      sdf: {
        radius: number;
        blendFactor: number;
        transparency: number;
        noise?: number;
        contourLines?: boolean;
      };
    }>;
    layout: LayoutConfig;
    visualMapping?: VisualMapping;
    camera?: CameraState;
    positions?: Record<string, [number, number, number]>;
  }>;

  // Backward compatibility: top-level edges/fields/groups auto-wrap into default context
  edges?: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    weight?: number;
    label?: string;
  }>;

  groups?: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    color: [number, number, number];
    params?: {
      radius?: number;
      blendFactor?: number;
      transparency?: number;
    };
  }>;

  fields?: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    color: [number, number, number];
    sdf?: {
      radius?: number;
      blendFactor?: number;
      transparency?: number;
    };
  }>;
}

// --- Events ---

export type QualiaEvent =
  | { type: 'NODE_ADD'; payload: { id: string; type: string; label: string; [key: string]: unknown } }
  | { type: 'NODE_UPDATE'; payload: { id: string; updates: Partial<NodeCore> } }
  | { type: 'NODE_REMOVE'; payload: { id: string } }
  | { type: 'EDGE_ADD'; payload: { id: string; source: string; target: string; type: string; contextId: string; [key: string]: unknown } }
  | { type: 'EDGE_UPDATE'; payload: { id: string; contextId: string; updates: Partial<Edge> } }
  | { type: 'EDGE_REMOVE'; payload: { id: string; contextId: string } }
  | { type: 'CONTEXT_ADD'; payload: Context }
  | { type: 'CONTEXT_SWITCH'; payload: { contextId: string | null } }
  | { type: 'CONTEXT_UPDATE'; payload: { id: string; updates: Partial<Context> } }
  | { type: 'GROUP_ADD'; payload: { contextId: string; group: VisualGroup } }
  | { type: 'GROUP_UPDATE'; payload: { contextId: string; groupId: string; updates: Partial<VisualGroup> } }
  // Backward compat aliases for old event logs
  | { type: 'FIELD_ADD'; payload: { contextId: string; field: VisualGroup } }
  | { type: 'FIELD_UPDATE'; payload: { contextId: string; fieldId: string; updates: Partial<VisualGroup> } }
  | { type: 'LAYOUT_RUN'; payload: { contextId: string } }
  | { type: 'GRAPH_LOAD'; payload: QualiaGraphJSON }
  | { type: 'GRAPH_CLEAR'; payload: Record<string, never> }
  | { type: 'SELECTION_SET'; payload: { nodeIds: string[]; edgeIds?: string[] } }
  | { type: 'SELECTION_CLEAR'; payload: Record<string, never> }
  // Agent scaffolding — handlers are no-ops
  | { type: 'AGENT_TICK'; payload: { nodeId: string; message?: unknown } }
  | { type: 'AGENT_SEND'; payload: { from: string; to: string; edgeId: string; message: unknown } };

export interface TimestampedEvent {
  event: QualiaEvent;
  timestamp: number;
  inverse?: QualiaEvent[];
}

// --- Application State ---

export interface QualiaState {
  nodes: Map<string, NodeCore>;
  nodeTypes: Record<string, NodeTypeDefinition>;
  edgeTypes: Record<string, EdgeTypeDefinition>;
  contexts: Map<string, Context>;
  activeContextId: string | null;
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
}

// --- Layout types ---

export interface LayoutWorkerMessage {
  type: 'init' | 'tick' | 'stop';
  contextId?: string;
  nodes?: Array<{ id: string; x?: number; y?: number; z?: number; importance: number }>;
  edges?: Array<{ source: string; target: string; weight: number }>;
  config?: LayoutConfig;
}

export interface LayoutWorkerResult {
  type: 'positions' | 'settled';
  contextId: string;
  positions: Record<string, [number, number, number]>;
}

// --- Vec3 utility ---

export type Vec3 = [number, number, number];

// --- Plane confinement + levels (ADR Qualia 0005) ---

/**
 * A plane normal axis. Can be one of the six standard axes (positive or
 * negative X/Y/Z) or a custom unit vector picked from the gizmo's voronoi
 * polyhedron. Stored as a normalized Vec3 + a stable identifier used to
 * key the per-axis level set.
 */
export interface PlaneAxis {
  /** Stable id used to look up levels for this axis. Examples: "+y", "-x", "voronoi:0.71,0.0,0.71". */
  id: string;
  /** Unit-length world-space normal. */
  normal: Vec3;
  /** Human-readable label (optional). */
  label?: string;
}

/**
 * A captured "level" — a parallel slice along the plane normal at a fixed
 * offset, pinning the listed nodes to that slice's position.
 */
export interface Level {
  /** Stable id (uuid or generated). */
  id: string;
  /** Display name (e.g. "Floor 1"). */
  name?: string;
  /** Signed offset along the axis normal from world origin. */
  position: number;
  /** Node ids whose position-along-normal is pulled to `position`. */
  capturedNodeIds: string[];
}

/**
 * The per-axis stack of captured levels. Each axis (cube face / voronoi
 * facet) has its own notebook; switching axes swaps which levels are active.
 *
 * Keyed by `PlaneAxis.id`.
 */
export type LevelSet = Record<string, Level[]>;

/**
 * Planar confinement settings for a context (or global default).
 *
 * `livePlanePosition` is the gizmo's current draggable plane offset along
 * `axis.normal` — what you'd capture if you pressed "Capture level" right
 * now. It does NOT pull nodes by itself; only `Level`s in the current
 * axis's stack pull nodes.
 */
export interface PlanarSettings {
  /** Active axis (which "notebook" of levels is current). */
  axis: PlaneAxis;
  /** Gizmo-driven scrub position along the axis. */
  livePlanePosition: number;
  /** Per-axis level sets. */
  levels: LevelSet;
  /** Independent toggle: layout solver pulls captured nodes toward their levels. */
  layoutPlanar: boolean;
  /** Independent toggle: camera locks to look down the active axis normal. */
  cameraLock: boolean;
  /** Whether the plane mesh is rendered in-scene. Default true when planar mode is active. */
  showPlane: boolean;
  /** Pull strength toward level (0=no pull, 1=hard clamp). Default 1.0 (hard clamp). */
  pullStrength: number;
}

export const STANDARD_PLANE_AXES: PlaneAxis[] = [
  { id: '+x', normal: [1, 0, 0],  label: '+X' },
  { id: '-x', normal: [-1, 0, 0], label: '−X' },
  { id: '+y', normal: [0, 1, 0],  label: '+Y' },
  { id: '-y', normal: [0, -1, 0], label: '−Y' },
  { id: '+z', normal: [0, 0, 1],  label: '+Z' },
  { id: '-z', normal: [0, 0, -1], label: '−Z' },
];

export const DEFAULT_PLANAR_SETTINGS: PlanarSettings = {
  axis: STANDARD_PLANE_AXES[2], // +Y
  livePlanePosition: 0,
  levels: {},
  layoutPlanar: false,
  cameraLock: false,
  showPlane: false,
  pullStrength: 1.0,
};

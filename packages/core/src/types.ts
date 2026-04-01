// ============================================================================
// Qualia Core Type Definitions
// ============================================================================

// --- Node Types & Edge Types Registries ---

export interface NodeTypeDefinition {
  color: string;
  icon: string;
  baseRadius: number;
}

export interface EdgeTypeDefinition {
  color: string;
  dash: number[];
  defaultWeight: number;
  directional: boolean;
}

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

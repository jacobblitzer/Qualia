import type {
  NodeCore, Edge, Context, SDFFieldDef, LayoutConfig,
  NodeTypeDefinition, EdgeTypeDefinition, QualiaGraphJSON, AgentBehavior,
} from './types';

/**
 * Core graph data structure. Holds nodes (universal), contexts (each with own edges/fields),
 * and type registries. Mutations are called by reducers only.
 */
export class Graph {
  nodes = new Map<string, NodeCore>();
  contexts = new Map<string, Context>();
  nodeTypes: Record<string, NodeTypeDefinition> = {};
  edgeTypes: Record<string, EdgeTypeDefinition> = {};

  // --- Node operations ---

  addNode(partial: { id: string; type: string; label: string; [key: string]: unknown }): NodeCore {
    const node: NodeCore = {
      id: partial.id,
      type: partial.type,
      label: partial.label,
      subtitle: partial.subtitle as string | undefined,
      importance: (partial.importance as number | undefined) ?? 0.5,
      notes: partial.notes as string | undefined,
      tags: (partial.tags as string[] | undefined) ?? [],
      links: (partial.links as Record<string, string> | undefined) ?? {},
      behavior: (partial.behavior as AgentBehavior | null) ?? null,
      state: (partial.state as Record<string, unknown>) ?? {},
      inbox: [],
      outbox: [],
    };
    this.nodes.set(node.id, node);
    return node;
  }

  updateNode(id: string, updates: Partial<NodeCore>): void {
    const node = this.nodes.get(id);
    if (!node) return;
    Object.assign(node, updates);
    node.id = id; // never allow id change
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    // Remove from all context edges and fields
    for (const ctx of this.contexts.values()) {
      ctx.edges = ctx.edges.filter(e => e.source !== id && e.target !== id);
      for (const field of ctx.fields) {
        field.nodeIds = field.nodeIds.filter(nid => nid !== id);
      }
    }
  }

  // --- Context operations ---

  addContext(ctx: Context): void {
    this.contexts.set(ctx.id, ctx);
  }

  updateContext(id: string, updates: Partial<Context>): void {
    const ctx = this.contexts.get(id);
    if (!ctx) return;
    Object.assign(ctx, updates);
    ctx.id = id; // never allow id change
  }

  removeContext(id: string): void {
    this.contexts.delete(id);
  }

  // --- Edge operations (within a context) ---

  addEdge(contextId: string, edge: { id: string; source: string; target: string; type: string; [key: string]: unknown }): Edge {
    const ctx = this.contexts.get(contextId);
    if (!ctx) throw new Error(`Context ${contextId} not found`);
    const fullEdge: Edge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: (edge.weight as number | undefined) ?? 1,
      label: edge.label as string | undefined,
      confidence: (edge.confidence as number | undefined) ?? 1,
      notes: edge.notes as string | undefined,
      behavior: (edge.behavior as AgentBehavior | null) ?? null,
      state: (edge.state as Record<string, unknown>) ?? {},
    };
    ctx.edges.push(fullEdge);
    return fullEdge;
  }

  updateEdge(contextId: string, edgeId: string, updates: Partial<Edge>): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    const edge = ctx.edges.find(e => e.id === edgeId);
    if (!edge) return;
    Object.assign(edge, updates);
    edge.id = edgeId; // never allow id change
  }

  removeEdge(contextId: string, edgeId: string): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    ctx.edges = ctx.edges.filter(e => e.id !== edgeId);
  }

  // --- Field operations ---

  addField(contextId: string, field: SDFFieldDef): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    ctx.fields.push(field);
  }

  updateField(contextId: string, fieldId: string, updates: Partial<SDFFieldDef>): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    const field = ctx.fields.find(f => f.id === fieldId);
    if (!field) return;
    Object.assign(field, updates);
    field.id = fieldId;
  }

  // --- Layout positions ---

  setPositions(contextId: string, positions: Record<string, [number, number, number]>): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    ctx.positions = { ...ctx.positions, ...positions };
  }

  // --- Queries ---

  getContextEdges(contextId: string): Edge[] {
    return this.contexts.get(contextId)?.edges ?? [];
  }

  getContextFields(contextId: string): SDFFieldDef[] {
    return this.contexts.get(contextId)?.fields ?? [];
  }

  getNodeNeighbors(contextId: string, nodeId: string): string[] {
    const edges = this.getContextEdges(contextId);
    const neighbors = new Set<string>();
    for (const e of edges) {
      if (e.source === nodeId) neighbors.add(e.target);
      if (e.target === nodeId) neighbors.add(e.source);
    }
    return [...neighbors];
  }

  getNodeDegree(contextId: string, nodeId: string): number {
    const edges = this.getContextEdges(contextId);
    let deg = 0;
    for (const e of edges) {
      if (e.source === nodeId || e.target === nodeId) deg++;
    }
    return deg;
  }

  // --- Serialization ---

  clear(): void {
    this.nodes.clear();
    this.contexts.clear();
    this.nodeTypes = {};
    this.edgeTypes = {};
  }

  /**
   * Load from QualiaGraphJSON. Handles backward-compat auto-wrapping:
   * if contexts is empty but top-level edges/fields exist, wrap into "default" context.
   */
  loadFromJSON(json: QualiaGraphJSON): void {
    this.clear();

    this.nodeTypes = json.nodeTypes ?? {};
    this.edgeTypes = json.edgeTypes ?? {};

    // Load nodes
    for (const n of json.nodes) {
      this.addNode(n);
    }

    // Load contexts
    if (json.contexts && json.contexts.length > 0) {
      for (const ctxJson of json.contexts) {
        const ctx: Context = {
          id: ctxJson.id,
          label: ctxJson.label,
          description: ctxJson.description,
          edges: (ctxJson.edges ?? []).map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: e.type,
            weight: e.weight,
            label: e.label,
            confidence: e.confidence,
            notes: e.notes,
            behavior: e.behavior ?? null,
            state: e.state ?? {},
          })),
          fields: (ctxJson.fields ?? []).map(f => ({
            id: f.id,
            label: f.label,
            nodeIds: f.nodeIds,
            color: f.color,
            sdf: {
              radius: f.sdf.radius,
              blendFactor: f.sdf.blendFactor,
              transparency: f.sdf.transparency,
              noise: f.sdf.noise,
              contourLines: f.sdf.contourLines,
            },
          })),
          layout: ctxJson.layout,
          visualMapping: ctxJson.visualMapping,
          camera: ctxJson.camera,
          positions: ctxJson.positions,
        };
        this.contexts.set(ctx.id, ctx);
      }
    } else if (json.edges || json.fields) {
      // Backward compat: auto-wrap top-level edges/fields into a "default" context
      const defaultCtx: Context = {
        id: 'default',
        label: 'Default',
        edges: (json.edges ?? []).map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
          weight: e.weight,
          behavior: null,
          state: {},
        })),
        fields: (json.fields ?? []).map(f => ({
          id: f.id,
          label: f.label,
          nodeIds: f.nodeIds,
          color: f.color,
          sdf: {
            radius: f.sdf?.radius ?? 5,
            blendFactor: f.sdf?.blendFactor ?? 0.5,
            transparency: f.sdf?.transparency ?? 0.3,
          },
        })),
        layout: { algorithm: 'force-directed' },
      };
      this.contexts.set('default', defaultCtx);
    }
  }
}

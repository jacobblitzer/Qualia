import type {
  NodeCore, Edge, Context, VisualGroup, LayoutConfig,
  NodeTypeDefinition, EdgeTypeDefinition, QualiaGraphJSON, AgentBehavior,
} from './types';

/**
 * Core graph data structure. Holds nodes (universal), contexts (each with own edges/groups),
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
    // Remove from all context edges and groups
    for (const ctx of this.contexts.values()) {
      ctx.edges = ctx.edges.filter(e => e.source !== id && e.target !== id);
      for (const group of ctx.groups) {
        group.nodeIds = group.nodeIds.filter(nid => nid !== id);
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

  // --- Group operations ---

  addGroup(contextId: string, group: VisualGroup): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    ctx.groups.push(group);
  }

  updateGroup(contextId: string, groupId: string, updates: Partial<VisualGroup>): void {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return;
    const group = ctx.groups.find(g => g.id === groupId);
    if (!group) return;
    Object.assign(group, updates);
    group.id = groupId;
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

  getContextGroups(contextId: string): VisualGroup[] {
    return this.contexts.get(contextId)?.groups ?? [];
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
   * Migrate a color from 0-255 range to 0-1 range if needed.
   */
  private static _migrateColor(color: [number, number, number]): [number, number, number] {
    if (color.some(c => c > 1)) {
      return [color[0] / 255, color[1] / 255, color[2] / 255];
    }
    return color;
  }

  /**
   * Load from QualiaGraphJSON. Handles backward-compat auto-wrapping:
   * if contexts is empty but top-level edges/fields/groups exist, wrap into "default" context.
   * Also migrates old "fields"+"sdf" format to "groups"+"params".
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
        // Migrate groups: prefer "groups", fall back to "fields" (old format)
        let groups: VisualGroup[];
        if (ctxJson.groups && ctxJson.groups.length > 0) {
          groups = ctxJson.groups.map(g => ({
            id: g.id,
            label: g.label,
            nodeIds: g.nodeIds,
            color: Graph._migrateColor(g.color),
            params: g.params,
          }));
        } else if (ctxJson.fields && ctxJson.fields.length > 0) {
          groups = ctxJson.fields.map(f => ({
            id: f.id,
            label: f.label,
            nodeIds: f.nodeIds,
            color: Graph._migrateColor(f.color),
            params: {
              radius: f.sdf.radius,
              blendFactor: f.sdf.blendFactor,
              transparency: f.sdf.transparency,
              noise: f.sdf.noise,
              contourLines: f.sdf.contourLines,
            },
          }));
        } else {
          groups = [];
        }

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
          groups,
          layout: ctxJson.layout,
          visualMapping: ctxJson.visualMapping,
          camera: ctxJson.camera,
          positions: ctxJson.positions,
        };
        this.contexts.set(ctx.id, ctx);
      }
    } else if (json.edges || json.fields || json.groups) {
      // Backward compat: auto-wrap top-level edges/fields/groups into a "default" context
      let groups: VisualGroup[];
      if (json.groups && json.groups.length > 0) {
        groups = json.groups.map(g => ({
          id: g.id,
          label: g.label,
          nodeIds: g.nodeIds,
          color: Graph._migrateColor(g.color),
          params: {
            radius: g.params?.radius ?? 5,
            blendFactor: g.params?.blendFactor ?? 0.5,
            transparency: g.params?.transparency ?? 0.3,
          },
        }));
      } else if (json.fields && json.fields.length > 0) {
        groups = json.fields.map(f => ({
          id: f.id,
          label: f.label,
          nodeIds: f.nodeIds,
          color: Graph._migrateColor(f.color),
          params: {
            radius: f.sdf?.radius ?? 5,
            blendFactor: f.sdf?.blendFactor ?? 0.5,
            transparency: f.sdf?.transparency ?? 0.3,
          },
        }));
      } else {
        groups = [];
      }

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
        groups,
        layout: { algorithm: 'force-directed' },
      };
      this.contexts.set('default', defaultCtx);
    }
  }
}

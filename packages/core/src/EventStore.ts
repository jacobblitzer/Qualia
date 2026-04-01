import type { QualiaEvent, TimestampedEvent, QualiaState, QualiaGraphJSON, NodeCore, Edge, Context, VisualGroup } from './types';
import { Graph } from './Graph';
import { applyEvent, computeInverse } from './reducers';

type Listener = () => void;
type EventListener = (event: TimestampedEvent) => void;
type LayoutListener = (contextId: string, positions: Record<string, [number, number, number]>) => void;

/**
 * Central event-sourced state manager. All mutations flow through dispatch().
 * Provides undo/redo, event logging, and subscription.
 */
export class EventStore {
  readonly graph = new Graph();
  readonly state: QualiaState;

  private _log: TimestampedEvent[] = [];
  private _undoStack: TimestampedEvent[] = [];
  private _redoStack: TimestampedEvent[] = [];
  private _listeners = new Set<Listener>();
  private _eventListeners = new Set<EventListener>();
  private _layoutListeners = new Set<LayoutListener>();

  constructor() {
    this.state = {
      nodes: this.graph.nodes,
      nodeTypes: {},
      edgeTypes: {},
      contexts: this.graph.contexts,
      activeContextId: null,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
    };
  }

  // --- Event Log ---

  get eventLog(): readonly TimestampedEvent[] { return this._log; }
  get canUndo(): boolean { return this._undoStack.length > 0; }
  get canRedo(): boolean { return this._redoStack.length > 0; }

  // --- Dispatch ---

  dispatch(event: QualiaEvent): void {
    // Compute inverse before applying (needs pre-mutation state)
    const inverse = computeInverse(this.graph, this.state, event);

    // Apply
    applyEvent(this.graph, event, this.state);

    // Record
    const stamped: TimestampedEvent = {
      event,
      timestamp: Date.now(),
      inverse,
    };
    this._log.push(stamped);

    // Undo/redo management
    if (inverse) {
      this._undoStack.push(stamped);
    }
    this._redoStack.length = 0;

    // Notify
    this._notifyStateChanged();
    this._notifyEvent(stamped);
  }

  // --- Undo / Redo ---

  undo(): void {
    const entry = this._undoStack.pop();
    if (!entry?.inverse) return;
    for (const inv of entry.inverse) {
      applyEvent(this.graph, inv, this.state);
    }
    this._redoStack.push(entry);
    this._notifyStateChanged();
  }

  redo(): void {
    const entry = this._redoStack.pop();
    if (!entry) return;
    applyEvent(this.graph, entry.event, this.state);
    this._undoStack.push(entry);
    this._notifyStateChanged();
  }

  // --- Subscriptions ---

  subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  onEvent(listener: EventListener): () => void {
    this._eventListeners.add(listener);
    return () => { this._eventListeners.delete(listener); };
  }

  onLayoutUpdate(listener: LayoutListener): () => void {
    this._layoutListeners.add(listener);
    return () => { this._layoutListeners.delete(listener); };
  }

  /**
   * Called by LayoutEngine when positions update. Bypasses the event system
   * and React re-renders for performance — goes directly to renderer.
   */
  applyLayoutPositions(contextId: string, positions: Record<string, [number, number, number]>): void {
    this.graph.setPositions(contextId, positions);
    for (const l of this._layoutListeners) l(contextId, positions);
  }

  private _notifyStateChanged(): void {
    for (const l of this._listeners) l();
  }

  private _notifyEvent(event: TimestampedEvent): void {
    for (const l of this._eventListeners) l(event);
  }

  // --- Convenience API ---

  addNode(data: { id: string; type: string; label: string; [key: string]: unknown }): void {
    this.dispatch({ type: 'NODE_ADD', payload: data });
  }

  removeNode(id: string): void {
    this.dispatch({ type: 'NODE_REMOVE', payload: { id } });
  }

  updateNode(id: string, updates: Partial<NodeCore>): void {
    this.dispatch({ type: 'NODE_UPDATE', payload: { id, updates } });
  }

  addEdge(contextId: string, edge: { id: string; source: string; target: string; type: string; [key: string]: unknown }): void {
    this.dispatch({ type: 'EDGE_ADD', payload: { ...edge, contextId } });
  }

  removeEdge(contextId: string, edgeId: string): void {
    this.dispatch({ type: 'EDGE_REMOVE', payload: { id: edgeId, contextId } });
  }

  switchContext(contextId: string | null): void {
    this.dispatch({ type: 'CONTEXT_SWITCH', payload: { contextId } });
  }

  loadGraph(json: QualiaGraphJSON): void {
    this.dispatch({ type: 'GRAPH_LOAD', payload: json });
  }

  clearGraph(): void {
    this.dispatch({ type: 'GRAPH_CLEAR', payload: {} });
  }

  selectNodes(nodeIds: string[]): void {
    this.dispatch({ type: 'SELECTION_SET', payload: { nodeIds } });
  }

  selectEdge(edgeId: string): void {
    this.dispatch({ type: 'SELECTION_SET', payload: { nodeIds: [], edgeIds: [edgeId] } });
  }

  clearSelection(): void {
    this.dispatch({ type: 'SELECTION_CLEAR', payload: {} });
  }

  // --- Getters ---

  get activeContext(): Context | undefined {
    if (!this.state.activeContextId) return undefined;
    return this.state.contexts.get(this.state.activeContextId);
  }

  get activeContextId(): string | null {
    return this.state.activeContextId;
  }

  /**
   * Get node positions for the active context, or blended positions for superposition.
   */
  getActivePositions(): Record<string, [number, number, number]> {
    if (this.state.activeContextId) {
      const ctx = this.state.contexts.get(this.state.activeContextId);
      return ctx?.positions ?? {};
    }
    // Superposition: average positions across all contexts
    return this._getSuperpositionPositions();
  }

  private _getSuperpositionPositions(): Record<string, [number, number, number]> {
    const sums: Record<string, { x: number; y: number; z: number; count: number }> = {};
    for (const ctx of this.state.contexts.values()) {
      if (!ctx.positions) continue;
      for (const [nodeId, [x, y, z]] of Object.entries(ctx.positions)) {
        if (!sums[nodeId]) sums[nodeId] = { x: 0, y: 0, z: 0, count: 0 };
        sums[nodeId].x += x;
        sums[nodeId].y += y;
        sums[nodeId].z += z;
        sums[nodeId].count++;
      }
    }
    const result: Record<string, [number, number, number]> = {};
    for (const [nodeId, s] of Object.entries(sums)) {
      result[nodeId] = [s.x / s.count, s.y / s.count, s.z / s.count];
    }
    return result;
  }

  /**
   * Get all edges for active context, or all edges in superposition.
   */
  getActiveEdges(): Edge[] {
    if (this.state.activeContextId) {
      return this.graph.getContextEdges(this.state.activeContextId);
    }
    // Superposition: all edges from all contexts
    const all: Edge[] = [];
    for (const ctx of this.state.contexts.values()) {
      all.push(...ctx.edges);
    }
    return all;
  }

  /**
   * Get all visual groups for active context.
   */
  getActiveGroups(): VisualGroup[] {
    if (this.state.activeContextId) {
      return this.graph.getContextGroups(this.state.activeContextId);
    }
    // Superposition: all groups from all contexts
    const all: VisualGroup[] = [];
    for (const ctx of this.state.contexts.values()) {
      all.push(...ctx.groups);
    }
    return all;
  }
}

import type { QualiaEvent, QualiaState, NodeCore, Edge, Context } from './types';
import type { Graph } from './Graph';

/**
 * Apply a QualiaEvent to the graph. Returns void — mutates graph in place.
 */
export function applyEvent(graph: Graph, event: QualiaEvent, state: QualiaState): void {
  switch (event.type) {
    case 'NODE_ADD':
      graph.addNode(event.payload);
      break;

    case 'NODE_UPDATE': {
      graph.updateNode(event.payload.id, event.payload.updates);
      break;
    }

    case 'NODE_REMOVE':
      graph.removeNode(event.payload.id);
      state.selectedNodeIds.delete(event.payload.id);
      break;

    case 'EDGE_ADD':
      graph.addEdge(event.payload.contextId, event.payload);
      break;

    case 'EDGE_UPDATE':
      graph.updateEdge(event.payload.contextId, event.payload.id, event.payload.updates);
      break;

    case 'EDGE_REMOVE':
      graph.removeEdge(event.payload.contextId, event.payload.id);
      state.selectedEdgeIds.delete(event.payload.id);
      break;

    case 'CONTEXT_ADD':
      graph.addContext(event.payload);
      break;

    case 'CONTEXT_SWITCH':
      state.activeContextId = event.payload.contextId;
      break;

    case 'CONTEXT_UPDATE':
      graph.updateContext(event.payload.id, event.payload.updates);
      break;

    case 'GROUP_ADD':
      graph.addGroup(event.payload.contextId, event.payload.group);
      break;

    case 'GROUP_UPDATE':
      graph.updateGroup(event.payload.contextId, event.payload.groupId, event.payload.updates);
      break;

    // Backward compat: old FIELD_ADD/FIELD_UPDATE from saved event logs
    case 'FIELD_ADD':
      graph.addGroup(event.payload.contextId, event.payload.field);
      break;

    case 'FIELD_UPDATE':
      graph.updateGroup(event.payload.contextId, event.payload.fieldId, event.payload.updates);
      break;

    case 'LAYOUT_RUN':
      // Layout is handled by LayoutEngine, not the reducer
      break;

    case 'GRAPH_LOAD':
      graph.loadFromJSON(event.payload);
      state.activeContextId = null;
      state.selectedNodeIds.clear();
      state.selectedEdgeIds.clear();
      state.nodeTypes = graph.nodeTypes;
      state.edgeTypes = graph.edgeTypes;
      break;

    case 'GRAPH_CLEAR':
      graph.clear();
      state.activeContextId = null;
      state.selectedNodeIds.clear();
      state.selectedEdgeIds.clear();
      break;

    case 'SELECTION_SET':
      state.selectedNodeIds = new Set(event.payload.nodeIds);
      state.selectedEdgeIds = new Set(event.payload.edgeIds ?? []);
      break;

    case 'SELECTION_CLEAR':
      state.selectedNodeIds.clear();
      state.selectedEdgeIds.clear();
      break;

    // Agent scaffolding — no-ops
    case 'AGENT_TICK':
    case 'AGENT_SEND':
      break;
  }

  // Sync nodes map from graph to state
  state.nodes = graph.nodes;
  state.contexts = graph.contexts;
}

/**
 * Compute inverse events for undo. Returns undefined for events
 * that cannot be undone (GRAPH_LOAD, GRAPH_CLEAR).
 */
export function computeInverse(graph: Graph, state: QualiaState, event: QualiaEvent): QualiaEvent[] | undefined {
  switch (event.type) {
    case 'NODE_ADD':
      return [{ type: 'NODE_REMOVE', payload: { id: event.payload.id } }];

    case 'NODE_REMOVE': {
      const node = graph.nodes.get(event.payload.id);
      if (!node) return undefined;
      // Snapshot node data and all edges referencing it
      const inverses: QualiaEvent[] = [];
      inverses.push({
        type: 'NODE_ADD',
        payload: { ...node },
      });
      // Re-add edges from all contexts
      for (const [ctxId, ctx] of graph.contexts) {
        for (const edge of ctx.edges) {
          if (edge.source === event.payload.id || edge.target === event.payload.id) {
            inverses.push({
              type: 'EDGE_ADD',
              payload: { ...edge, contextId: ctxId },
            });
          }
        }
      }
      return inverses;
    }

    case 'NODE_UPDATE': {
      const node = graph.nodes.get(event.payload.id);
      if (!node) return undefined;
      const oldValues: Partial<NodeCore> = {};
      for (const key of Object.keys(event.payload.updates) as (keyof NodeCore)[]) {
        (oldValues as Record<string, unknown>)[key] = node[key];
      }
      return [{ type: 'NODE_UPDATE', payload: { id: event.payload.id, updates: oldValues } }];
    }

    case 'EDGE_ADD':
      return [{
        type: 'EDGE_REMOVE',
        payload: { id: event.payload.id, contextId: event.payload.contextId },
      }];

    case 'EDGE_REMOVE': {
      const ctx = graph.contexts.get(event.payload.contextId);
      if (!ctx) return undefined;
      const edge = ctx.edges.find(e => e.id === event.payload.id);
      if (!edge) return undefined;
      return [{
        type: 'EDGE_ADD',
        payload: { ...edge, contextId: event.payload.contextId },
      }];
    }

    case 'CONTEXT_SWITCH': {
      const prev = state.activeContextId;
      return [{ type: 'CONTEXT_SWITCH', payload: { contextId: prev } }];
    }

    case 'SELECTION_SET': {
      return [{
        type: 'SELECTION_SET',
        payload: {
          nodeIds: [...state.selectedNodeIds],
          edgeIds: [...state.selectedEdgeIds],
        },
      }];
    }

    case 'SELECTION_CLEAR': {
      if (state.selectedNodeIds.size === 0 && state.selectedEdgeIds.size === 0) {
        return undefined; // Nothing to undo
      }
      return [{
        type: 'SELECTION_SET',
        payload: {
          nodeIds: [...state.selectedNodeIds],
          edgeIds: [...state.selectedEdgeIds],
        },
      }];
    }

    // Non-undoable events
    case 'GRAPH_LOAD':
    case 'GRAPH_CLEAR':
    case 'LAYOUT_RUN':
    case 'AGENT_TICK':
    case 'AGENT_SEND':
    case 'GROUP_ADD':
    case 'GROUP_UPDATE':
    case 'FIELD_ADD':
    case 'FIELD_UPDATE':
      return undefined;

    default:
      return undefined;
  }
}

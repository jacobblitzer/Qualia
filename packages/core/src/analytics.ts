import type { Context, Edge } from './types';
import type { Graph } from './Graph';

/**
 * Compute degree centrality for all nodes in a context.
 * Returns normalized values (0-1).
 */
export function degreeCentrality(graph: Graph, contextId: string): Map<string, number> {
  const ctx = graph.contexts.get(contextId);
  if (!ctx) return new Map();

  const degrees = new Map<string, number>();
  for (const nodeId of graph.nodes.keys()) {
    degrees.set(nodeId, 0);
  }

  for (const edge of ctx.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }

  // Normalize
  const maxDeg = Math.max(1, graph.nodes.size - 1);
  const result = new Map<string, number>();
  for (const [id, deg] of degrees) {
    result.set(id, deg / maxDeg);
  }
  return result;
}

/**
 * Find connected components in a context's edge graph.
 * Returns an array of node ID sets, one per component.
 */
export function connectedComponents(graph: Graph, contextId: string): string[][] {
  const ctx = graph.contexts.get(contextId);
  if (!ctx) return [];

  // Build adjacency list from context edges
  const adj = new Map<string, Set<string>>();
  for (const nodeId of graph.nodes.keys()) {
    adj.set(nodeId, new Set());
  }
  for (const edge of ctx.edges) {
    adj.get(edge.source)?.add(edge.target);
    adj.get(edge.target)?.add(edge.source);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;
    const component: string[] = [];
    const queue = [nodeId];
    visited.add(nodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}

// --- Stubs for future analytics ---

/**
 * Betweenness centrality. TODO: implement.
 */
export function betweennessCentrality(_graph: Graph, _contextId: string): Map<string, number> {
  return new Map();
}

/**
 * PageRank. TODO: implement.
 */
export function pageRank(_graph: Graph, _contextId: string): Map<string, number> {
  return new Map();
}

/**
 * Modularity-based community detection. TODO: implement.
 */
export function modularityDetection(_graph: Graph, _contextId: string): string[][] {
  return [];
}

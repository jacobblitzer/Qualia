import type { LayoutConfig, LayoutWorkerMessage, LayoutWorkerResult, NodeCore, Edge } from './types';

type PositionCallback = (contextId: string, positions: Record<string, [number, number, number]>) => void;

/**
 * Layout engine that runs d3-force-3d in a Web Worker.
 * Supports force-directed, hierarchy, and manual layouts.
 */
export class LayoutEngine {
  private _worker: Worker | null = null;
  private _onPositions: PositionCallback | null = null;

  onPositions(callback: PositionCallback): void {
    this._onPositions = callback;
  }

  /**
   * Start a force-directed layout for a context.
   */
  start(
    contextId: string,
    nodes: NodeCore[],
    edges: Edge[],
    config: LayoutConfig,
    existingPositions?: Record<string, [number, number, number]>,
  ): void {
    // For manual layout, just use existing positions — no computation
    if (config.algorithm === 'manual') {
      if (existingPositions && this._onPositions) {
        this._onPositions(contextId, existingPositions);
      }
      return;
    }

    // For hierarchy, run a simple tree layout synchronously
    if (config.algorithm === 'hierarchy') {
      const positions = this._hierarchyLayout(nodes, edges, config.params);
      if (this._onPositions) {
        this._onPositions(contextId, positions);
      }
      return;
    }

    // Force-directed: run in Web Worker
    this.stop();
    try {
      this._worker = new Worker(
        new URL('./layout.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      // Fallback: run simple force layout synchronously
      const positions = this._fallbackForceLayout(nodes, edges, existingPositions);
      if (this._onPositions) {
        this._onPositions(contextId, positions);
      }
      return;
    }

    this._worker.onmessage = (e: MessageEvent<LayoutWorkerResult>) => {
      this._onPositions?.(e.data.contextId, e.data.positions);
    };

    const nodeMsg = nodes.map(n => {
      const pos = existingPositions?.[n.id];
      return {
        id: n.id,
        x: pos?.[0],
        y: pos?.[1],
        z: pos?.[2],
        importance: n.importance ?? 0.5,
      };
    });

    const edgeMsg = edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: e.weight ?? 1,
    }));

    this._worker.postMessage({
      type: 'init',
      contextId,
      nodes: nodeMsg,
      edges: edgeMsg,
      config,
    } satisfies LayoutWorkerMessage);
  }

  stop(): void {
    if (this._worker) {
      this._worker.postMessage({ type: 'stop' });
      this._worker.terminate();
      this._worker = null;
    }
  }

  /**
   * Simple hierarchical (tree) layout. Uses BFS from root nodes.
   */
  private _hierarchyLayout(
    nodes: NodeCore[],
    edges: Edge[],
    params?: Record<string, number>,
  ): Record<string, [number, number, number]> {
    const levelSpacing = params?.levelSpacing ?? 15;
    const siblingSpacing = params?.siblingSpacing ?? 10;

    // Build adjacency (directed: source → target)
    const children = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of edges) {
      if (!children.has(e.source)) children.set(e.source, []);
      children.get(e.source)!.push(e.target);
      hasParent.add(e.target);
    }

    // Find roots (nodes with no incoming edges)
    const roots = nodes.filter(n => !hasParent.has(n.id));
    if (roots.length === 0 && nodes.length > 0) {
      roots.push(nodes[0]); // Fallback
    }

    const positions: Record<string, [number, number, number]> = {};
    const visited = new Set<string>();
    let xOffset = 0;

    const layoutTree = (nodeId: string, depth: number, x: number): number => {
      if (visited.has(nodeId)) return x;
      visited.add(nodeId);

      const kids = children.get(nodeId) ?? [];
      if (kids.length === 0) {
        positions[nodeId] = [x, -depth * levelSpacing, 0];
        return x + siblingSpacing;
      }

      let startX = x;
      for (const kid of kids) {
        x = layoutTree(kid, depth + 1, x);
      }
      const midX = (startX + x - siblingSpacing) / 2;
      positions[nodeId] = [midX, -depth * levelSpacing, 0];
      return x;
    };

    for (const root of roots) {
      xOffset = layoutTree(root.id, 0, xOffset);
      xOffset += siblingSpacing * 2;
    }

    // Place any remaining unvisited nodes
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        positions[n.id] = [xOffset, 0, 0];
        xOffset += siblingSpacing;
      }
    }

    return positions;
  }

  /**
   * Fallback force layout for when Web Worker isn't available.
   * Simple spring-electric simulation.
   */
  private _fallbackForceLayout(
    nodes: NodeCore[],
    edges: Edge[],
    existing?: Record<string, [number, number, number]>,
  ): Record<string, [number, number, number]> {
    const positions: Record<string, [number, number, number]> = {};
    const velocities: Record<string, [number, number, number]> = {};

    // Initialize
    for (const n of nodes) {
      if (existing?.[n.id]) {
        positions[n.id] = [...existing[n.id]];
      } else {
        positions[n.id] = [
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
        ];
      }
      velocities[n.id] = [0, 0, 0];
    }

    // Run 100 iterations of spring-electric
    for (let iter = 0; iter < 100; iter++) {
      const alpha = 1 - iter / 100;

      // Repulsion (all pairs)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions[nodes[i].id];
          const b = positions[nodes[j].id];
          const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
          const force = -30 * alpha / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = (dz / dist) * force;
          velocities[nodes[i].id][0] -= fx;
          velocities[nodes[i].id][1] -= fy;
          velocities[nodes[i].id][2] -= fz;
          velocities[nodes[j].id][0] += fx;
          velocities[nodes[j].id][1] += fy;
          velocities[nodes[j].id][2] += fz;
        }
      }

      // Attraction (edges)
      for (const e of edges) {
        const a = positions[e.source];
        const b = positions[e.target];
        if (!a || !b) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        const force = (dist - 15) * 0.1 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        velocities[e.source][0] += fx;
        velocities[e.source][1] += fy;
        velocities[e.source][2] += fz;
        velocities[e.target][0] -= fx;
        velocities[e.target][1] -= fy;
        velocities[e.target][2] -= fz;
      }

      // Center gravity
      for (const n of nodes) {
        const p = positions[n.id];
        const v = velocities[n.id];
        v[0] -= p[0] * 0.01 * alpha;
        v[1] -= p[1] * 0.01 * alpha;
        v[2] -= p[2] * 0.01 * alpha;
      }

      // Apply velocities with damping
      for (const n of nodes) {
        const p = positions[n.id];
        const v = velocities[n.id];
        p[0] += v[0] * 0.5;
        p[1] += v[1] * 0.5;
        p[2] += v[2] * 0.5;
        v[0] *= 0.6;
        v[1] *= 0.6;
        v[2] *= 0.6;
      }
    }

    return positions;
  }
}

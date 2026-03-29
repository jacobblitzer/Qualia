/// <reference lib="webworker" />

import type { LayoutWorkerMessage, LayoutWorkerResult } from './types';

// Dynamic import of d3-force-3d (the worker must be self-contained)
// @ts-expect-error - d3-force-3d may not have type declarations
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d';

interface SimNode {
  id: string;
  x: number;
  y: number;
  z: number;
  importance: number;
}

let simulation: ReturnType<typeof forceSimulation> | null = null;
let currentContextId: string = '';
let currentNodes: SimNode[] = [];

self.onmessage = (e: MessageEvent<LayoutWorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init': {
      if (simulation) simulation.stop();

      currentContextId = msg.contextId ?? '';
      currentNodes = (msg.nodes ?? []).map(n => ({
        id: n.id,
        x: n.x ?? (Math.random() - 0.5) * 40,
        y: n.y ?? (Math.random() - 0.5) * 40,
        z: n.z ?? (Math.random() - 0.5) * 40,
        importance: n.importance,
      }));

      const links = (msg.edges ?? []).map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }));

      const params = msg.config?.params ?? {};
      const chargeStrength = params.chargeStrength ?? -30;
      const linkDistance = params.linkDistance ?? 20;

      simulation = forceSimulation(currentNodes, 3)
        .force('charge', forceManyBody().strength(chargeStrength))
        .force('link', forceLink(links).id((d: SimNode) => d.id).distance(linkDistance))
        .force('center', forceCenter(0, 0, 0).strength(0.5))
        .alphaDecay(0.02)
        .velocityDecay(0.4)
        .on('tick', () => {
          emitPositions('positions');
        })
        .on('end', () => {
          emitPositions('settled');
        });

      break;
    }

    case 'stop': {
      if (simulation) {
        simulation.stop();
        simulation = null;
      }
      break;
    }
  }
};

function emitPositions(type: 'positions' | 'settled'): void {
  const positions: Record<string, [number, number, number]> = {};
  for (const n of currentNodes) {
    positions[n.id] = [n.x, n.y, n.z];
  }
  self.postMessage({
    type,
    contextId: currentContextId,
    positions,
  } satisfies LayoutWorkerResult);
}

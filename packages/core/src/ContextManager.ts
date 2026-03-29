import type { Context, Vec3 } from './types';

/**
 * Helper utilities for context management.
 * Most context state lives in Graph.contexts and EventStore.state.
 * This provides derived computations.
 */

export function blendPositions(
  contexts: Map<string, Context>,
): Record<string, [number, number, number]> {
  const sums: Record<string, { x: number; y: number; z: number; count: number }> = {};

  for (const ctx of contexts.values()) {
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

export function lerpPositions(
  from: Record<string, [number, number, number]>,
  to: Record<string, [number, number, number]>,
  t: number,
): Record<string, [number, number, number]> {
  const result: Record<string, [number, number, number]> = {};
  const allIds = new Set([...Object.keys(from), ...Object.keys(to)]);

  for (const id of allIds) {
    const f = from[id] ?? [0, 0, 0] as Vec3;
    const toPos = to[id] ?? [0, 0, 0] as Vec3;
    result[id] = [
      f[0] + (toPos[0] - f[0]) * t,
      f[1] + (toPos[1] - f[1]) * t,
      f[2] + (toPos[2] - f[2]) * t,
    ];
  }
  return result;
}

/**
 * Get the list of context IDs sorted by label.
 */
export function sortedContextIds(contexts: Map<string, Context>): string[] {
  return [...contexts.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label))
    .map(([id]) => id);
}

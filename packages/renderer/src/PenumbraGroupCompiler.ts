import type { SDFScene, SDFEffects, SDFMaterial } from '@penumbra/core';
import type { VisualGroup } from '@qualia/core';

/**
 * Convert Qualia VisualGroups into a Penumbra SDFScene.
 *
 * Each group becomes one SDF field: a point-cloud geometry whose positions
 * are the group's member nodes. The blob "thickness" comes from
 * `params.radius`, the blend smoothness from `params.blendFactor`.
 *
 * This conversion lives in Qualia, not in @penumbra/three. Penumbra renders
 * whatever scene it's given — translating graph concepts (groups, nodes,
 * encoded metrics) into SDF concepts (fields, point-clouds, materials) is
 * Qualia's job. See Qualia/docs/decisions/0001-penumbra-as-rendering-engine.md.
 */
export function compileGroupsToScene(
  groups: VisualGroup[],
  nodePositions: Record<string, [number, number, number]>,
): SDFScene {
  const fields = groups.map((group) => {
    const positions = packGroupPositions(group, nodePositions);

    const material: SDFMaterial = {
      color: group.color,
      transparency: group.params.transparency,
      roughness: 0.5,
      metalness: 0,
      emissive: 0,
    };

    const effects: SDFEffects = {
      noise: group.params.noise ?? 0,
      noiseScale: 0.5,
      noiseSpeed: 0,
      contourLines: group.params.contourLines ?? false,
      contourSpacing: 1.0,
      contourWidth: 0.05,
      onionLayers: 0,
      onionThickness: 0.1,
      fresnelStrength: 0,
      interiorFog: 0,
      glow: 0,
      domainWarp: 0,
      warpDirection: [0, 0, 0],
    };

    return {
      id: group.id,
      label: group.label,
      visible: positions.length > 0,
      geometry: {
        type: 'point-cloud' as const,
        positions: new Float32Array(positions),
        radius: group.params.radius,
        blendK: group.params.blendFactor,
      },
      material,
      effects,
    };
  });

  return {
    fields,
    settings: {},
  };
}

function packGroupPositions(
  group: VisualGroup,
  nodePositions: Record<string, [number, number, number]>,
): number[] {
  const out: number[] = [];
  for (const id of group.nodeIds) {
    const p = nodePositions[id];
    if (!p) continue;
    out.push(p[0], p[1], p[2]);
  }
  return out;
}

/**
 * Helper: turn a Map<id, [x,y,z]> from SceneManager's positional state into
 * the per-group Float32Array Penumbra expects via `updatePositions`.
 *
 * Used by SceneManager when nodes drag — recompiling the entire scene each
 * frame is unnecessary; only positions change.
 */
export function packPositions(
  group: VisualGroup,
  nodePositions: Record<string, [number, number, number]>,
): Float32Array {
  return new Float32Array(packGroupPositions(group, nodePositions));
}


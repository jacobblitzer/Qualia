import type {
  SDFScene,
  SDFField,
  SDFGeometry,
  SDFEffects,
  SDFMaterial,
} from '@penumbra/core';
import type { VisualGroup, Edge } from '@qualia/core';

/**
 * Compile a graph (nodes + edges + groups) into a Penumbra SDFScene.
 *
 * The scene is a "whole-graph-as-one-blob, groups-as-color-overlays" model:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Skeleton field                                               │
 *   │   smooth-union of:                                           │
 *   │     - one sphere primitive per node (radius from network)    │
 *   │     - one capsule primitive per edge (between endpoints)     │
 *   │   color: SKELETON_COLOR (neutral)                            │
 *   └──────────────────────────────────────────────────────────────┘
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Halo field per group                                         │
 *   │   point-cloud of group's member positions                    │
 *   │   slightly larger radius than skeleton                       │
 *   │   color: group.color, transparency / noise from group.params │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Penumbra's scene-level smooth-union (`renderer.setSceneCombineOp('smoothUnion', k)`)
 * fuses the halos onto the skeleton; where halos overlap each other (a node in
 * multiple groups), Penumbra's color blending mixes them naturally.
 *
 * This conversion lives in Qualia, not Penumbra. Penumbra renders whatever
 * scene it's given — translating graph topology into SDF primitives is
 * Qualia's responsibility per `docs/decisions/0001-penumbra-as-rendering-engine.md`.
 */
export interface NetworkCompileOptions {
  /** Skeleton sphere radius for nodes, in world units. Default 0.4. */
  nodeRadius?: number;
  /** Skeleton capsule radius for edges, in world units. Default 0.2. */
  edgeRadius?: number;
  /** Smooth-union blend radius across the skeleton. Default 0.3. */
  skeletonBlend?: number;
  /** Multiplier applied to the group's params.radius for halo blob size. Default 1.2. */
  haloRadiusMultiplier?: number;
}

const DEFAULT_OPTS: Required<NetworkCompileOptions> = {
  nodeRadius: 0.4,
  edgeRadius: 0.2,
  skeletonBlend: 0.3,
  haloRadiusMultiplier: 1.2,
};

const SKELETON_ID = '__qualia-skeleton';
const SKELETON_COLOR: [number, number, number] = [0.4, 0.45, 0.55];

const NEUTRAL_EFFECTS: SDFEffects = {
  noise: 0,
  noiseScale: 0.5,
  noiseSpeed: 0,
  contourLines: false,
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

/**
 * Build the SDFScene for the active context.
 *
 * @param edges - edges of the active context (every edge becomes a capsule)
 * @param groups - groups of the active context (each becomes a halo field)
 * @param positions - current node positions (transitioning or settled)
 * @param opts - tuning knobs (radii, blend factor)
 */
export function compileGraphToScene(
  edges: Edge[],
  groups: VisualGroup[],
  positions: Record<string, [number, number, number]>,
  opts: NetworkCompileOptions = {},
): SDFScene {
  const o = { ...DEFAULT_OPTS, ...opts };

  const fields: SDFField[] = [];

  const skeleton = buildSkeletonField(edges, positions, o);
  if (skeleton) fields.push(skeleton);

  for (const group of groups) {
    const halo = buildHaloField(group, positions, o);
    if (halo) fields.push(halo);
  }

  return { fields, settings: {} };
}

function buildSkeletonField(
  edges: Edge[],
  positions: Record<string, [number, number, number]>,
  opts: Required<NetworkCompileOptions>,
): SDFField | null {
  const children: SDFGeometry[] = [];

  // One sphere per known node position
  for (const id in positions) {
    const p = positions[id];
    children.push({
      type: 'primitive',
      shape: 'sphere',
      params: { radius: opts.nodeRadius },
      transform: translationMat4(p[0], p[1], p[2]),
    });
  }

  // One capsule per edge whose endpoints both have positions
  for (const edge of edges) {
    const a = positions[edge.source];
    const b = positions[edge.target];
    if (!a || !b) continue;
    children.push({
      type: 'primitive',
      shape: 'capsule',
      params: {
        ax: a[0], ay: a[1], az: a[2],
        bx: b[0], by: b[1], bz: b[2],
        radius: opts.edgeRadius,
      },
    });
  }

  if (children.length === 0) return null;

  const geometry: SDFGeometry =
    children.length === 1
      ? children[0]
      : {
          type: 'boolean',
          op: 'smooth-union',
          blendRadius: opts.skeletonBlend,
          children,
        };

  const material: SDFMaterial = {
    color: SKELETON_COLOR,
    transparency: 0.1,
    roughness: 0.5,
    metalness: 0,
    emissive: 0,
  };

  return {
    id: SKELETON_ID,
    label: 'Network skeleton',
    visible: true,
    geometry,
    material,
    effects: NEUTRAL_EFFECTS,
  };
}

function buildHaloField(
  group: VisualGroup,
  positions: Record<string, [number, number, number]>,
  opts: Required<NetworkCompileOptions>,
): SDFField | null {
  const packed: number[] = [];
  for (const id of group.nodeIds) {
    const p = positions[id];
    if (!p) continue;
    packed.push(p[0], p[1], p[2]);
  }
  if (packed.length === 0) return null;

  const material: SDFMaterial = {
    color: group.color,
    transparency: group.params.transparency,
    roughness: 0.5,
    metalness: 0,
    emissive: 0,
  };

  const effects: SDFEffects = {
    ...NEUTRAL_EFFECTS,
    noise: group.params.noise ?? 0,
    contourLines: group.params.contourLines ?? false,
  };

  return {
    id: group.id,
    label: group.label,
    visible: true,
    geometry: {
      type: 'point-cloud',
      positions: new Float32Array(packed),
      radius: group.params.radius * opts.haloRadiusMultiplier,
      blendK: group.params.blendFactor,
    },
    material,
    effects,
  };
}

/** Column-major mat4 translation. */
function translationMat4(x: number, y: number, z: number): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

import type {
  SDFScene,
  SDFField,
  SDFGeometry,
  SDFEffects,
  SDFMaterial,
} from '@penumbra/core';
import type { VisualGroup, Edge, NodeCore, NodeTypeDefinition, NodeAtom } from '@qualia/core';
import { resolveNodeAtom } from '@qualia/core';

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
  /** Include sphere primitives for each node in the skeleton. Default true. */
  includeSkeletonNodes?: boolean;
  /** Include capsule primitives for each edge in the skeleton. Default true. */
  includeSkeletonEdges?: boolean;
  /** Include per-group halo point-cloud fields. Default true. */
  includeHalos?: boolean;
  /** When true, each group's halo field also includes capsules along edges
   *  whose endpoints are both members of the group. Off by default. */
  edgesInHalo?: boolean;
  /** Capsule radius for edges-in-halo. Default 0.4. */
  edgeHaloRadius?: number;
}

const DEFAULT_OPTS: Required<NetworkCompileOptions> = {
  nodeRadius: 0.4,
  edgeRadius: 0.2,
  skeletonBlend: 0.3,
  // 0.7 instead of 1.2 (Bug 0002): halos sit *inside* the group radius,
  // tinting at member positions without engulfing the underlying skeleton.
  haloRadiusMultiplier: 0.7,
  includeSkeletonNodes: true,
  includeSkeletonEdges: true,
  includeHalos: true,
  edgesInHalo: false,
  edgeHaloRadius: 0.4,
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
 * @param nodeData - optional per-node atom data. If omitted, falls back to a
 *                  generic sphere of radius `opts.nodeRadius` for every node.
 *                  When provided, each node contributes its resolved
 *                  SDFAtom (sphere/box/capsule/etc.) to the skeleton —
 *                  matching what NodeAtomLayer renders on the Three side.
 */
export function compileGraphToScene(
  edges: Edge[],
  groups: VisualGroup[],
  positions: Record<string, [number, number, number]>,
  opts: NetworkCompileOptions = {},
  nodeData?: {
    nodes: Map<string, NodeCore>;
    nodeTypes: Record<string, NodeTypeDefinition>;
  },
): SDFScene {
  const o = { ...DEFAULT_OPTS, ...opts };

  const fields: SDFField[] = [];

  if (o.includeSkeletonNodes || o.includeSkeletonEdges) {
    const skeleton = buildSkeletonField(edges, positions, o, nodeData);
    if (skeleton) fields.push(skeleton);
  }

  if (o.includeHalos) {
    for (const group of groups) {
      const halo = buildHaloField(group, edges, positions, o);
      if (halo) fields.push(halo);
    }
  }

  return { fields, settings: {} };
}

function buildSkeletonField(
  edges: Edge[],
  positions: Record<string, [number, number, number]>,
  opts: Required<NetworkCompileOptions>,
  nodeData?: {
    nodes: Map<string, NodeCore>;
    nodeTypes: Record<string, NodeTypeDefinition>;
  },
): SDFField | null {
  const children: SDFGeometry[] = [];

  // One primitive per known node position. Default sphere when no per-node
  // atom data is supplied; otherwise honor the resolved atom shape.
  if (opts.includeSkeletonNodes) {
    for (const id in positions) {
      const p = positions[id];
      let geom: SDFGeometry;
      if (nodeData) {
        const node = nodeData.nodes.get(id);
        if (!node) continue;
        const atom = resolveNodeAtom(node, nodeData.nodeTypes[node.type]);
        geom = atomToSdfGeometry(atom, p, opts.nodeRadius);
      } else {
        geom = {
          type: 'primitive',
          shape: 'sphere',
          params: { radius: opts.nodeRadius },
          transform: translationMat4(p[0], p[1], p[2]),
        };
      }
      children.push(geom);
    }
  }

  // One capsule per edge whose endpoints both have positions
  if (opts.includeSkeletonEdges) {
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
  edges: Edge[],
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

  const haloRadius = group.params.radius * opts.haloRadiusMultiplier;
  const pointCloud: SDFGeometry = {
    type: 'point-cloud',
    positions: new Float32Array(packed),
    radius: haloRadius,
    blendK: group.params.blendFactor,
  };

  // Edges-in-halo (Bug 0020): include capsules for edges whose endpoints
  // are both in this group's nodeIds. Smooth-unioned with the point-cloud
  // so the halo shape becomes a network of fused tubes + member bumps.
  let geometry: SDFGeometry = pointCloud;
  if (opts.edgesInHalo) {
    const memberSet = new Set(group.nodeIds);
    const capsules: SDFGeometry[] = [];
    for (const edge of edges) {
      if (!memberSet.has(edge.source) || !memberSet.has(edge.target)) continue;
      const a = positions[edge.source];
      const b = positions[edge.target];
      if (!a || !b) continue;
      capsules.push({
        type: 'primitive',
        shape: 'capsule',
        params: {
          ax: a[0], ay: a[1], az: a[2],
          bx: b[0], by: b[1], bz: b[2],
          radius: opts.edgeHaloRadius,
        },
      });
    }
    if (capsules.length > 0) {
      geometry = {
        type: 'boolean',
        op: 'smooth-union',
        blendRadius: group.params.blendFactor,
        children: [pointCloud, ...capsules],
      };
    }
  }

  return {
    id: group.id,
    label: group.label,
    visible: true,
    geometry,
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

/**
 * Convert a resolved Qualia NodeAtom + world position into a Penumbra
 * SDFGeometry primitive. Mirrors NodeAtomLayer's geometry choices on the
 * Three side so the skeleton blob and the visible mesh agree on shape.
 */
function atomToSdfGeometry(
  atom: NodeAtom,
  pos: [number, number, number],
  fallbackRadius: number,
): SDFGeometry {
  const p = atom.params ?? {};
  const t = translationMat4(pos[0], pos[1], pos[2]);
  switch (atom.shape) {
    case 'sphere':
      return {
        type: 'primitive',
        shape: 'sphere',
        params: { radius: p.radius ?? fallbackRadius },
        transform: t,
      };
    case 'box':
      return {
        type: 'primitive',
        shape: 'box',
        params: {
          halfX: p.halfX ?? fallbackRadius,
          halfY: p.halfY ?? fallbackRadius,
          halfZ: p.halfZ ?? fallbackRadius,
        },
        transform: t,
      };
    case 'roundBox':
      return {
        type: 'primitive',
        shape: 'roundBox',
        params: {
          halfX: p.halfX ?? fallbackRadius,
          halfY: p.halfY ?? fallbackRadius,
          halfZ: p.halfZ ?? fallbackRadius,
          round: p.round ?? fallbackRadius * 0.2,
        },
        transform: t,
      };
    case 'capsule': {
      // Penumbra's capsule takes endpoint coords directly (ax,ay,az / bx,by,bz)
      // in world space. We translate the local capsule axis to the world
      // position. ay/by are local extents along Y.
      const ay = p.ay ?? -fallbackRadius;
      const by = p.by ?? fallbackRadius;
      return {
        type: 'primitive',
        shape: 'capsule',
        params: {
          ax: pos[0], ay: pos[1] + ay, az: pos[2],
          bx: pos[0], by: pos[1] + by, bz: pos[2],
          radius: p.radius ?? fallbackRadius * 0.6,
        },
      };
    }
    case 'ellipsoid':
      return {
        type: 'primitive',
        shape: 'ellipsoid',
        params: {
          rx: p.rx ?? fallbackRadius,
          ry: p.ry ?? fallbackRadius * 0.7,
          rz: p.rz ?? fallbackRadius,
        },
        transform: t,
      };
    case 'torus':
      return {
        type: 'primitive',
        shape: 'torus',
        params: {
          radiusMajor: p.radiusMajor ?? fallbackRadius,
          radiusMinor: p.radiusMinor ?? fallbackRadius * 0.3,
        },
        transform: t,
      };
  }
}

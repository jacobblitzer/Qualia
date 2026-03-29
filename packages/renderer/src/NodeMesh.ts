import * as THREE from 'three';
import type { NodeCore, NodeTypeDefinition } from '@qualia/core';

const MAX_INSTANCES = 8192;

/**
 * Instanced mesh for all graph nodes. Single draw call.
 */
export class NodeMesh {
  readonly mesh: THREE.InstancedMesh;
  private _nodeIndexMap = new Map<string, number>();
  private _indexNodeMap = new Map<number, string>();
  private _dummy = new THREE.Object3D();
  private _colors: Float32Array;

  get count(): number { return this.mesh.count; }

  constructor() {
    const geometry = new THREE.IcosahedronGeometry(0.5, 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.15,
      emissive: 0x224466,
      emissiveIntensity: 0.4,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;

    this._colors = new Float32Array(MAX_INSTANCES * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this._colors, 3);
    (this.mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
  }

  /**
   * Rebuild all node instances from positions + node data.
   */
  update(
    positions: Record<string, [number, number, number]>,
    nodes: Map<string, NodeCore>,
    nodeTypes: Record<string, NodeTypeDefinition>,
    selectedIds: Set<string>,
    hoveredId: string | null,
  ): void {
    this._nodeIndexMap.clear();
    this._indexNodeMap.clear();
    let idx = 0;

    for (const [nodeId, pos] of Object.entries(positions)) {
      if (idx >= MAX_INSTANCES) break;
      const node = nodes.get(nodeId);
      if (!node) continue;

      this._nodeIndexMap.set(nodeId, idx);
      this._indexNodeMap.set(idx, nodeId);

      // Scale based on importance
      const importance = node.importance ?? 0.5;
      const baseRadius = nodeTypes[node.type]?.baseRadius ?? 0.5;
      const scale = baseRadius * (1.5 + importance * 2.5);
      const isSelected = selectedIds.has(nodeId);
      const isHovered = hoveredId === nodeId;

      this._dummy.position.set(pos[0], pos[1], pos[2]);
      this._dummy.scale.setScalar(isSelected ? scale * 1.3 : isHovered ? scale * 1.15 : scale);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(idx, this._dummy.matrix);

      // Color from type definition
      const typeColor = nodeTypes[node.type]?.color ?? '#4488ff';
      const color = new THREE.Color(typeColor);
      if (isSelected) {
        color.lerp(new THREE.Color('#4ff0c1'), 0.4);
      } else if (isHovered) {
        color.lerp(new THREE.Color('#ffffff'), 0.2);
      }
      this._colors[idx * 3] = color.r;
      this._colors[idx * 3 + 1] = color.g;
      this._colors[idx * 3 + 2] = color.b;

      idx++;
    }

    this.mesh.count = idx;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      (this.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  /**
   * Get node ID from instance index (for raycasting).
   */
  getNodeIdAtIndex(index: number): string | undefined {
    return this._indexNodeMap.get(index);
  }

  /**
   * Get instance index from node ID.
   */
  getIndexForNode(nodeId: string): number | undefined {
    return this._nodeIndexMap.get(nodeId);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

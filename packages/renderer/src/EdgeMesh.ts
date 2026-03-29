import * as THREE from 'three';
import type { Edge, EdgeTypeDefinition } from '@qualia/core';

const MAX_EDGES = 32768;

/**
 * Line segments for all edges. Single draw call.
 */
export class EdgeMesh {
  readonly lineSegments: THREE.LineSegments;
  private _positionAttr: THREE.BufferAttribute;
  private _colorAttr: THREE.BufferAttribute;
  private _count = 0;

  get count(): number { return this._count; }

  constructor() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_EDGES * 2 * 3);
    const colors = new Float32Array(MAX_EDGES * 2 * 3);

    this._positionAttr = new THREE.BufferAttribute(positions, 3);
    this._positionAttr.setUsage(THREE.DynamicDrawUsage);
    this._colorAttr = new THREE.BufferAttribute(colors, 3);
    this._colorAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('position', this._positionAttr);
    geometry.setAttribute('color', this._colorAttr);

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      linewidth: 1,
    });

    this.lineSegments = new THREE.LineSegments(geometry, material);
    this.lineSegments.frustumCulled = false;
  }

  /**
   * Update edge geometry from edge data + node positions.
   */
  update(
    edges: Edge[],
    positions: Record<string, [number, number, number]>,
    edgeTypes: Record<string, EdgeTypeDefinition>,
    opacity: number = 0.6,
  ): void {
    const posArr = this._positionAttr.array as Float32Array;
    const colArr = this._colorAttr.array as Float32Array;

    (this.lineSegments.material as THREE.LineBasicMaterial).opacity = opacity;

    let count = 0;
    for (const edge of edges) {
      if (count >= MAX_EDGES) break;
      const sp = positions[edge.source];
      const tp = positions[edge.target];
      if (!sp || !tp) continue;

      const i = count * 6;
      posArr[i] = sp[0]; posArr[i + 1] = sp[1]; posArr[i + 2] = sp[2];
      posArr[i + 3] = tp[0]; posArr[i + 4] = tp[1]; posArr[i + 5] = tp[2];

      const typeColor = edgeTypes[edge.type]?.color ?? '#336699';
      const color = new THREE.Color(typeColor);
      const confidence = edge.confidence ?? 1;
      color.multiplyScalar(confidence);

      colArr[i] = color.r; colArr[i + 1] = color.g; colArr[i + 2] = color.b;
      colArr[i + 3] = color.r; colArr[i + 4] = color.g; colArr[i + 5] = color.b;

      count++;
    }

    this._count = count;
    this._positionAttr.needsUpdate = true;
    this._colorAttr.needsUpdate = true;
    this.lineSegments.geometry.setDrawRange(0, count * 2);
  }

  dispose(): void {
    this.lineSegments.geometry.dispose();
    (this.lineSegments.material as THREE.Material).dispose();
  }
}

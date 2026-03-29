import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import type { Edge, EdgeTypeDefinition } from '@qualia/core';

/**
 * Fat anti-aliased line segments for all edges using Line2.
 * Single draw call with GPU-accelerated thick lines.
 */
export class EdgeMesh {
  readonly lineSegments: LineSegments2;
  private _geometry: LineSegmentsGeometry;
  private _material: LineMaterial;
  private _count = 0;

  get count(): number { return this._count; }

  constructor() {
    this._geometry = new LineSegmentsGeometry();

    this._material = new LineMaterial({
      color: 0xffffff,
      linewidth: 2,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      worldUnits: false,
      dashed: false,
      alphaToCoverage: true,
    });
    // Set initial resolution (will be updated on resize)
    this._material.resolution.set(window.innerWidth, window.innerHeight);

    this.lineSegments = new LineSegments2(this._geometry, this._material);
    this.lineSegments.frustumCulled = false;
  }

  /**
   * Update edge geometry from edge data + node positions.
   * selectedNodeIds highlights edges connected to selected nodes.
   */
  update(
    edges: Edge[],
    positions: Record<string, [number, number, number]>,
    edgeTypes: Record<string, EdgeTypeDefinition>,
    opacity: number = 0.6,
    selectedNodeIds?: Set<string>,
    selectedEdgeIds?: Set<string>,
  ): void {
    const posArray: number[] = [];
    const colArray: number[] = [];

    let count = 0;
    for (const edge of edges) {
      const sp = positions[edge.source];
      const tp = positions[edge.target];
      if (!sp || !tp) continue;

      const isSelected = selectedEdgeIds && selectedEdgeIds.has(edge.id);
      const isConnected = selectedNodeIds
        && (selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target));

      const typeColor = edgeTypes[edge.type]?.color ?? '#336699';
      const color = new THREE.Color(typeColor);
      const confidence = edge.confidence ?? 1;
      color.multiplyScalar(confidence);

      if (isSelected) {
        color.set('#4ff0c1');
        color.multiplyScalar(2.0);
      } else if (isConnected) {
        color.lerp(new THREE.Color('#4ff0c1'), 0.5);
        color.multiplyScalar(1.8);
      }

      posArray.push(sp[0], sp[1], sp[2], tp[0], tp[1], tp[2]);
      colArray.push(color.r, color.g, color.b, color.r, color.g, color.b);
      count++;
    }

    this._count = count;
    this._material.opacity = opacity;

    if (count > 0) {
      this._geometry.setPositions(posArray);
      this._geometry.setColors(colArray);
    } else {
      // Empty geometry — set degenerate data to avoid errors
      this._geometry.setPositions([0, 0, 0, 0, 0, 0]);
      this._geometry.setColors([0, 0, 0, 0, 0, 0]);
    }
  }

  setLineWidth(width: number): void {
    this._material.linewidth = width;
  }

  getLineWidth(): number {
    return this._material.linewidth;
  }

  /**
   * Must be called on resize so LineMaterial can compute correct pixel widths.
   */
  setResolution(width: number, height: number): void {
    this._material.resolution.set(width, height);
  }

  dispose(): void {
    this._geometry.dispose();
    this._material.dispose();
  }
}

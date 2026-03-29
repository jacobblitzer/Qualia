import * as THREE from 'three';
import type { NodeCore } from '@qualia/core';

interface LabelElement {
  div: HTMLDivElement;
  nodeId: string;
}

/**
 * HTML overlay labels that track 3D node positions.
 */
export class LabelLayer {
  private _container: HTMLDivElement;
  private _labels = new Map<string, LabelElement>();
  private _tempVec = new THREE.Vector3();

  constructor(parentContainer: HTMLElement) {
    this._container = document.createElement('div');
    this._container.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 10;
    `;
    parentContainer.appendChild(this._container);
  }

  /**
   * Update labels to match current nodes and positions.
   */
  update(
    positions: Record<string, [number, number, number]>,
    nodes: Map<string, NodeCore>,
    camera: THREE.PerspectiveCamera,
    selectedIds: Set<string>,
    hoveredId: string | null,
    containerWidth: number,
    containerHeight: number,
  ): void {
    const visibleIds = new Set<string>();

    for (const [nodeId, pos] of Object.entries(positions)) {
      const node = nodes.get(nodeId);
      if (!node) continue;

      // Project to screen
      this._tempVec.set(pos[0], pos[1], pos[2]);
      this._tempVec.project(camera);

      // Skip if behind camera
      if (this._tempVec.z > 1) continue;

      const x = (this._tempVec.x * 0.5 + 0.5) * containerWidth;
      const y = (-this._tempVec.y * 0.5 + 0.5) * containerHeight;

      // Only show labels for selected/hovered nodes, or if zoomed in close
      const distToCamera = camera.position.distanceTo(new THREE.Vector3(pos[0], pos[1], pos[2]));
      const isSelected = selectedIds.has(nodeId);
      const isHovered = hoveredId === nodeId;
      const showLabel = isSelected || isHovered || distToCamera < 30;

      if (!showLabel) continue;

      visibleIds.add(nodeId);

      let label = this._labels.get(nodeId);
      if (!label) {
        const div = document.createElement('div');
        div.style.cssText = `
          position: absolute;
          color: #d0d6e0;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 11px;
          white-space: nowrap;
          transform: translate(-50%, -100%);
          padding: 2px 6px;
          border-radius: 3px;
          background: rgba(10, 12, 16, 0.7);
          pointer-events: none;
          transition: opacity 0.15s;
        `;
        this._container.appendChild(div);
        label = { div, nodeId };
        this._labels.set(nodeId, label);
      }

      label.div.textContent = node.label;
      label.div.style.left = `${x}px`;
      label.div.style.top = `${y - 8}px`;
      label.div.style.opacity = isSelected ? '1' : isHovered ? '0.9' : '0.6';

      if (isSelected) {
        label.div.style.color = '#4ff0c1';
        label.div.style.fontWeight = '600';
      } else {
        label.div.style.color = '#d0d6e0';
        label.div.style.fontWeight = '400';
      }
    }

    // Remove labels for nodes no longer visible
    for (const [nodeId, label] of this._labels) {
      if (!visibleIds.has(nodeId)) {
        label.div.remove();
        this._labels.delete(nodeId);
      }
    }
  }

  dispose(): void {
    this._container.remove();
    this._labels.clear();
  }
}

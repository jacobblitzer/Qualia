import * as THREE from 'three';
import type { NodeCore } from '@qualia/core';

interface LabelElement {
  div: HTMLDivElement;
  nodeId: string;
}

/**
 * HTML overlay labels that track 3D node positions.
 * Labels are clickable — they're the primary selection target.
 */
export class LabelLayer {
  private _container: HTMLDivElement;
  private _labels = new Map<string, LabelElement>();
  private _tempVec = new THREE.Vector3();

  // Callbacks
  private _onLabelClick: ((nodeId: string) => void) | null = null;
  private _onLabelHover: ((nodeId: string | null) => void) | null = null;

  // Visibility controls
  private _visible = true;
  private _baseOpacity = 1.0;

  constructor(parentContainer: HTMLElement) {
    this._container = document.createElement('div');
    this._container.style.cssText = `
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 20;
    `;
    parentContainer.appendChild(this._container);
  }

  onLabelClick(cb: (nodeId: string) => void): void { this._onLabelClick = cb; }
  onLabelHover(cb: (nodeId: string | null) => void): void { this._onLabelHover = cb; }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._container.style.display = visible ? '' : 'none';
  }

  setBaseOpacity(opacity: number): void {
    this._baseOpacity = opacity;
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
    if (!this._visible) return;

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

      const distToCamera = camera.position.distanceTo(new THREE.Vector3(pos[0], pos[1], pos[2]));
      const isSelected = selectedIds.has(nodeId);
      const isHovered = hoveredId === nodeId;

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
          pointer-events: auto;
          cursor: pointer;
          user-select: none;
          transition: opacity 0.15s;
        `;
        // Click handler — select the node
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          this._onLabelClick?.(nodeId);
        });
        div.addEventListener('mouseenter', () => {
          this._onLabelHover?.(nodeId);
        });
        div.addEventListener('mouseleave', () => {
          this._onLabelHover?.(null);
        });
        this._container.appendChild(div);
        label = { div, nodeId };
        this._labels.set(nodeId, label);
      }

      // Distance-based font size and opacity
      const fontSize = Math.max(8, Math.min(14, 24 - distToCamera * 0.2));
      const distOpacity = Math.max(0.4, 1.0 - distToCamera * 0.005);
      const opacity = (isSelected ? 1 : isHovered ? 0.95 : distOpacity) * this._baseOpacity;

      // Show subtitle for selected/hovered nodes
      if ((isSelected || isHovered) && node.subtitle) {
        label.div.innerHTML = `${node.label}<br><span style="font-size:${fontSize - 2}px;color:#8890a4">${node.subtitle}</span>`;
      } else {
        label.div.textContent = node.label;
      }
      label.div.style.left = `${x}px`;
      label.div.style.top = `${y - 8}px`;
      label.div.style.opacity = String(opacity);
      label.div.style.fontSize = `${fontSize}px`;

      if (isSelected) {
        label.div.style.color = '#4ff0c1';
        label.div.style.fontWeight = '600';
        label.div.style.textShadow = '0 0 6px rgba(79, 240, 193, 0.4)';
      } else if (isHovered) {
        label.div.style.color = '#e0e6f0';
        label.div.style.fontWeight = '400';
        label.div.style.textShadow = 'none';
      } else {
        label.div.style.color = '#d0d6e0';
        label.div.style.fontWeight = '400';
        label.div.style.textShadow = 'none';
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

import type { EventStore, QualiaState } from '@qualia/core';
import { SceneManager } from './SceneManager';

type NodeCallback = (nodeId: string) => void;
type EdgeCallback = (edgeId: string) => void;

/**
 * Public API for the Qualia renderer. Matches the spec interface.
 * This is the entry point for the UI layer.
 */
export class QualiaRenderer {
  private _scene: SceneManager;
  private _container: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _resizeObserver: ResizeObserver;

  constructor(container: HTMLElement, store: EventStore) {
    this._container = container;

    // Create canvas
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
    container.appendChild(this._canvas);

    // Create scene
    this._scene = new SceneManager(container, this._canvas, store);
    this._scene.start();

    // Auto-resize
    this._resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this._scene.resize(width, height);
        }
      }
    });
    this._resizeObserver.observe(container);
  }

  // --- Context transition ---

  transitionTo(contextId: string | null, duration?: number): void {
    this._scene.transitionTo(contextId, duration);
  }

  // --- Interaction callbacks ---

  onNodeClick(callback: NodeCallback): void {
    this._scene.interaction.onNodeClick((id) => {
      if (id) callback(id);
    });
  }

  onNodeHover(callback: (nodeId: string | null) => void): void {
    this._scene.interaction.onNodeHover(callback);
  }

  onEdgeClick(callback: EdgeCallback): void {
    this._scene.interaction.onEdgeClick((id) => {
      if (id) callback(id);
    });
  }

  onBackgroundClick(callback: () => void): void {
    this._scene.interaction.onBackgroundClick(callback);
  }

  // --- Selection ---

  setSelectedNodes(nodeIds: Set<string>): void {
    // Selection state is managed by EventStore, renderer reads from state
  }

  setSelectedEdge(edgeId: string | null): void {
    // Same — renderer reads from store state
  }

  // --- Camera ---

  focusNode(nodeId: string, duration?: number): void {
    this._scene.focusNode(nodeId, duration);
  }

  resetCamera(duration?: number): void {
    this._scene.controls.target.set(0, 0, 0);
    this._scene.camera.position.set(0, 10, 50);
  }

  // --- Lifecycle ---

  resize(): void {
    const { width, height } = this._container.getBoundingClientRect();
    this._scene.resize(width, height);
  }

  dispose(): void {
    this._resizeObserver.disconnect();
    this._scene.dispose();
    this._canvas.remove();
  }
}

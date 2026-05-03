import type { EventStore } from '@qualia/core';
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

  onNodeDblClick(callback: NodeCallback): void {
    this._scene.interaction.onNodeDblClick((id) => {
      if (id) callback(id);
    });
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
    this._scene.resetCamera(duration);
  }

  fitToView(duration?: number): void {
    this._scene.fitToView(duration);
  }

  toggleGrid(): void {
    this._scene.toggleGrid();
  }

  get gridVisible(): boolean {
    return this._scene.gridVisible;
  }

  applyViewerSettings(settings: Parameters<SceneManager['applyViewerSettings']>[0]): void {
    this._scene.applyViewerSettings(settings);
  }

  getViewerSettings(): ReturnType<SceneManager['getViewerSettings']> {
    return this._scene.getViewerSettings();
  }

  // --- Performance / functionality toggles ---

  getPerfSettings(): ReturnType<SceneManager['getPerfSettings']> {
    return this._scene.getPerfSettings();
  }

  setPerfSettings(partial: Parameters<SceneManager['setPerfSettings']>[0]): void {
    this._scene.setPerfSettings(partial);
  }

  // --- Node display mode (ADR Qualia 0003) ---

  setNodeDisplayMode(mode: import('@qualia/core').NodeDisplayMode): void {
    this._scene.setNodeDisplayMode(mode);
  }

  getNodeDisplayMode(): import('@qualia/core').NodeDisplayMode {
    return this._scene.getNodeDisplayMode();
  }

  /** True if a PenumbraPass is currently attached and rendering. (Bug 0001) */
  get hasPenumbra(): boolean {
    return this._scene.hasPenumbra;
  }

  /** Force a node-atom rebuild (used when nodeType mutations bypass setNodeDisplayMode). Bug 0003. */
  refreshNodeAtoms(): void {
    this._scene.refreshNodeAtoms();
  }

  /** Bug 0010: raw edge opacity override (null when no override active). */
  getEdgeOpacityOverride(): number | null {
    return this._scene.getEdgeOpacityOverride();
  }

  /** Bug 0015: theme toggle. Updates Three colors/materials AND mirrors to Penumbra. */
  setLightMode(isLight: boolean): void {
    this._scene.setLightMode(isLight);
  }

  isLightMode(): boolean {
    return this._scene.isLightMode;
  }

  /** ADR 0008: apply a full ThemeConfig (replaces setLightMode). */
  applyTheme(theme: Parameters<SceneManager['applyTheme']>[0]): void {
    this._scene.applyTheme(theme);
  }

  // --- Edge display (ADR Qualia 0004) ---

  setEdgeShape(shape: import('@qualia/core').EdgeShape): void {
    this._scene.setEdgeShape(shape);
  }

  getEdgeShape(): import('@qualia/core').EdgeShape {
    return this._scene.getEdgeShape();
  }

  setEdgeRouting(opts: Parameters<SceneManager['setEdgeRouting']>[0]): void {
    this._scene.setEdgeRouting(opts);
  }

  getEdgeRouting(): ReturnType<SceneManager['getEdgeRouting']> {
    return this._scene.getEdgeRouting();
  }

  // --- Planar confinement (ADR Qualia 0005) ---

  getPlanarSettings(): ReturnType<SceneManager['getPlanarSettings']> {
    return this._scene.getPlanarSettings();
  }

  setPlanarSettings(partial: Parameters<SceneManager['setPlanarSettings']>[0]): void {
    this._scene.setPlanarSettings(partial);
  }

  captureLevel(bandWidth?: number, name?: string): string | null {
    return this._scene.captureLevel(bandWidth, name);
  }

  uncaptureLevel(levelId: string): void {
    this._scene.uncaptureLevel(levelId);
  }

  // --- Visibility ---

  setLabelsVisible(visible: boolean): void {
    this._scene.setLabelsVisible(visible);
  }

  setLabelOpacity(opacity: number): void {
    this._scene.setLabelOpacity(opacity);
  }

  setNodeMeshVisible(visible: boolean): void {
    this._scene.setNodeMeshVisible(visible);
  }

  setEdgesVisible(visible: boolean): void {
    this._scene.setEdgesVisible(visible);
  }

  // --- Gumball ---

  showGumball(nodeId: string, position: [number, number, number]): void {
    this._scene.interaction.showGumball(nodeId, position);
  }

  hideGumball(): void {
    this._scene.interaction.hideGumball();
  }

  onNodeDrag(callback: (nodeId: string, position: [number, number, number]) => void): void {
    this._scene.interaction.gumball.onDrag(callback);
  }

  // --- Debug ---

  getDebugStats() {
    return this._scene.getDebugStats();
  }

  getCanvas(): HTMLCanvasElement {
    return this._canvas;
  }

  getSceneManager(): SceneManager {
    return this._scene;
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

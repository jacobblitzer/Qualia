import * as THREE from 'three';
import type { NodeMesh } from './NodeMesh';
import type { Edge } from '@qualia/core';
import { Gumball } from './Gumball';

type NodeCallback = (nodeId: string | null) => void;
type EdgeCallback = (edgeId: string | null) => void;

/**
 * Handles pointer interaction: hover + click on nodes, edges, and background.
 * Uses pointerdown/pointermove/pointerup to avoid OrbitControls eating click events.
 * Left-click only for selection. Double-click to focus node.
 * Integrates Gumball for node dragging.
 */
export class InteractionManager {
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _hoveredNodeId: string | null = null;

  // Drag detection: distinguish click from orbit/pan drag
  private _pointerDownPos: { x: number; y: number } | null = null;
  private _isDrag = false;

  // Callbacks
  private _nodeClickCb: NodeCallback | null = null;
  private _nodeHoverCb: NodeCallback | null = null;
  private _nodeDblClickCb: NodeCallback | null = null;
  private _edgeClickCb: EdgeCallback | null = null;
  private _bgClickCb: (() => void) | null = null;

  // Data accessors for edge selection
  private _getEdges: (() => Edge[]) | null = null;
  private _getPositions: (() => Record<string, [number, number, number]>) | null = null;

  // Gumball
  readonly gumball: Gumball;
  private _controlsEnabledCb: ((enabled: boolean) => void) | null = null;

  constructor(
    private _camera: THREE.PerspectiveCamera,
    private _nodeMesh: NodeMesh,
    private _canvas: HTMLCanvasElement,
  ) {
    this.gumball = new Gumball();

    this._canvas.addEventListener('pointerdown', this._onPointerDown);
    this._canvas.addEventListener('pointermove', this._onPointerMove);
    this._canvas.addEventListener('pointerup', this._onPointerUp);
    this._canvas.addEventListener('dblclick', this._onDblClick);
  }

  setDataAccessors(
    getEdges: () => Edge[],
    getPositions: () => Record<string, [number, number, number]>,
  ): void {
    this._getEdges = getEdges;
    this._getPositions = getPositions;
  }

  onNodeClick(cb: NodeCallback): void { this._nodeClickCb = cb; }
  onNodeHover(cb: NodeCallback): void { this._nodeHoverCb = cb; }
  onNodeDblClick(cb: NodeCallback): void { this._nodeDblClickCb = cb; }
  onEdgeClick(cb: EdgeCallback): void { this._edgeClickCb = cb; }
  onBackgroundClick(cb: () => void): void { this._bgClickCb = cb; }
  onControlsEnabled(cb: (enabled: boolean) => void): void { this._controlsEnabledCb = cb; }

  /**
   * Show gumball on a node. Called when a node is selected.
   */
  showGumball(nodeId: string, position: [number, number, number]): void {
    this.gumball.attach(nodeId, position);
  }

  /**
   * Hide gumball. Called when selection is cleared.
   */
  hideGumball(): void {
    this.gumball.detach();
  }

  /**
   * Update gumball scale (call each frame).
   */
  updateGumball(): void {
    this.gumball.updateScale(this._camera);
  }

  get hoveredNodeId(): string | null { return this._hoveredNodeId; }

  /** Called by LabelLayer when a label is clicked. */
  simulateNodeClick(nodeId: string): void {
    this._nodeClickCb?.(nodeId);
  }

  /** Called by LabelLayer when a label is hovered. */
  simulateNodeHover(nodeId: string | null): void {
    this._hoveredNodeId = nodeId;
    this._nodeHoverCb?.(nodeId);
    this._canvas.style.cursor = nodeId ? 'pointer' : 'default';
  }

  private _updateMouse(e: MouseEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _raycastNode(): string | null {
    this._raycaster.setFromCamera(this._mouse, this._camera);
    // Raycast against every shape bucket. NodeAtomLayer.resolveHit maps
    // (mesh, instanceId) → nodeId across all buckets.
    const targets = this._nodeMesh.raycastTargets;
    const hits = this._raycaster.intersectObjects(targets, false);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      const hitMesh = hits[0].object as import('three').InstancedMesh;
      const id = this._nodeMesh.resolveHit(hitMesh, hits[0].instanceId);
      if (id) return id;
    }
    return null;
  }

  /**
   * Find nearest edge to pointer via screen-space proximity.
   */
  private _findNearestEdge(e: PointerEvent): string | null {
    if (!this._getEdges || !this._getPositions) {
      console.warn('[InteractionManager] _findNearestEdge: no data accessors set');
      return null;
    }

    const edges = this._getEdges();
    const positions = this._getPositions();
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const threshold = 15; // pixels — generous for thin lines

    let bestDist = threshold;
    let bestId: string | null = null;

    for (const edge of edges) {
      const sp = positions[edge.source];
      const tp = positions[edge.target];
      if (!sp || !tp) continue;

      const sa = this._projectToScreen(sp, rect.width, rect.height);
      const ta = this._projectToScreen(tp, rect.width, rect.height);
      if (!sa || !ta) continue;

      const dist = this._pointToSegmentDist(mx, my, sa.x, sa.y, ta.x, ta.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = edge.id;
      }
    }

    if (bestId) {
      console.log(`[Edge Select] hit: ${bestId} (${bestDist.toFixed(1)}px)`);
    }

    return bestId;
  }

  private _projectToScreen(
    pos: [number, number, number],
    w: number,
    h: number,
  ): { x: number; y: number } | null {
    const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
    v.project(this._camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
    };
  }

  private _pointToSegmentDist(
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
  ): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  private _onPointerDown = (e: PointerEvent): void => {
    // Check gumball first (left button only)
    if (e.button === 0 && this.gumball.pointerDown(e, this._camera, this._canvas)) {
      this._controlsEnabledCb?.(false);
      return;
    }

    this._pointerDownPos = { x: e.clientX, y: e.clientY };
    this._isDrag = false;
  };

  private _onPointerMove = (e: PointerEvent): void => {
    // Gumball drag
    if (this.gumball.isDragging) {
      this.gumball.pointerMove(e, this._camera, this._canvas);
      return;
    }

    // Track drag distance
    if (this._pointerDownPos) {
      const dx = e.clientX - this._pointerDownPos.x;
      const dy = e.clientY - this._pointerDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        this._isDrag = true;
      }
    }

    // Hover detection
    this._updateMouse(e);
    const nodeId = this._raycastNode();
    if (nodeId !== this._hoveredNodeId) {
      this._hoveredNodeId = nodeId;
      this._nodeHoverCb?.(nodeId);
      this._canvas.style.cursor = nodeId ? 'pointer' : 'default';
    }
  };

  private _onPointerUp = (e: PointerEvent): void => {
    // Gumball drag end
    if (this.gumball.isDragging) {
      this.gumball.pointerUp();
      this._controlsEnabledCb?.(true);
      return;
    }

    // Only process left button, and only if it wasn't a drag
    if (e.button !== 0 || this._isDrag) {
      this._pointerDownPos = null;
      return;
    }
    this._pointerDownPos = null;

    this._updateMouse(e);
    const nodeId = this._raycastNode();
    if (nodeId) {
      this._nodeClickCb?.(nodeId);
      return;
    }

    // Try edge selection
    const edgeId = this._findNearestEdge(e);
    if (edgeId) {
      this._edgeClickCb?.(edgeId);
      return;
    }

    this._bgClickCb?.();
  };

  private _onDblClick = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this._updateMouse(e);
    const nodeId = this._raycastNode();
    if (nodeId) {
      this._nodeDblClickCb?.(nodeId);
    }
  };

  dispose(): void {
    this._canvas.removeEventListener('pointerdown', this._onPointerDown);
    this._canvas.removeEventListener('pointermove', this._onPointerMove);
    this._canvas.removeEventListener('pointerup', this._onPointerUp);
    this._canvas.removeEventListener('dblclick', this._onDblClick);
    this.gumball.dispose();
  }
}

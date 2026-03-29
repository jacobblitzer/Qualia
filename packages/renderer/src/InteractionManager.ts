import * as THREE from 'three';
import type { NodeMesh } from './NodeMesh';

type NodeCallback = (nodeId: string | null) => void;
type EdgeCallback = (edgeId: string | null) => void;

/**
 * Handles mouse interaction: hover + click on nodes and background.
 */
export class InteractionManager {
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();
  private _hoveredNodeId: string | null = null;

  private _nodeClickCb: NodeCallback | null = null;
  private _nodeHoverCb: NodeCallback | null = null;
  private _edgeClickCb: EdgeCallback | null = null;
  private _bgClickCb: (() => void) | null = null;

  constructor(
    private _camera: THREE.PerspectiveCamera,
    private _nodeMesh: NodeMesh,
    private _canvas: HTMLCanvasElement,
  ) {
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('click', this._onClick);
  }

  onNodeClick(cb: NodeCallback): void { this._nodeClickCb = cb; }
  onNodeHover(cb: NodeCallback): void { this._nodeHoverCb = cb; }
  onEdgeClick(cb: EdgeCallback): void { this._edgeClickCb = cb; }
  onBackgroundClick(cb: () => void): void { this._bgClickCb = cb; }

  get hoveredNodeId(): string | null { return this._hoveredNodeId; }

  private _updateMouse(e: MouseEvent): void {
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _raycastNode(): string | null {
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const hits = this._raycaster.intersectObject(this._nodeMesh.mesh);
    if (hits.length > 0 && hits[0].instanceId !== undefined) {
      return this._nodeMesh.getNodeIdAtIndex(hits[0].instanceId) ?? null;
    }
    return null;
  }

  private _onMouseMove = (e: MouseEvent): void => {
    this._updateMouse(e);
    const nodeId = this._raycastNode();
    if (nodeId !== this._hoveredNodeId) {
      this._hoveredNodeId = nodeId;
      this._nodeHoverCb?.(nodeId);
      this._canvas.style.cursor = nodeId ? 'pointer' : 'default';
    }
  };

  private _onClick = (e: MouseEvent): void => {
    this._updateMouse(e);
    const nodeId = this._raycastNode();
    if (nodeId) {
      this._nodeClickCb?.(nodeId);
    } else {
      this._bgClickCb?.();
    }
  };

  dispose(): void {
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('click', this._onClick);
  }
}

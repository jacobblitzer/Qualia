import * as THREE from 'three';

type DragCallback = (nodeId: string, position: [number, number, number]) => void;
type DragStartCallback = () => void;
type DragEndCallback = (nodeId: string, position: [number, number, number]) => void;

/**
 * 3D gumball widget for dragging selected nodes.
 * Shows axis arrows (X=red, Y=green, Z=blue), plane handles (XY, XZ, YZ),
 * and a center sphere for free drag (camera-perpendicular plane).
 * All rendered with depthTest:false so always visible.
 */
export class Gumball {
  readonly group = new THREE.Group();
  private _nodeId: string | null = null;
  private _position = new THREE.Vector3();

  // Interaction state
  private _dragging = false;
  private _dragAxis: 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'free' | null = null;
  private _dragStart = new THREE.Vector3();
  private _dragPlane = new THREE.Plane();
  private _raycaster = new THREE.Raycaster();
  private _mouse = new THREE.Vector2();

  // Parts
  private _xArrow: THREE.Group;
  private _yArrow: THREE.Group;
  private _zArrow: THREE.Group;
  private _xyHandle: THREE.Mesh;
  private _xzHandle: THREE.Mesh;
  private _yzHandle: THREE.Mesh;
  private _centerSphere: THREE.Mesh;

  // Hit targets (invisible, larger for easier picking)
  private _hitTargets: THREE.Mesh[] = [];
  private _hitMap = new Map<THREE.Object3D, 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'free'>();

  // Callbacks
  private _onDrag: DragCallback | null = null;
  private _onDragStart: DragStartCallback | null = null;
  private _onDragEnd: DragEndCallback | null = null;

  // Scale factor relative to camera distance
  private _scale = 1;

  constructor() {
    this.group.renderOrder = 999;

    // Build visual elements
    this._xArrow = this._createArrow(0xff4444, new THREE.Vector3(1, 0, 0));
    this._yArrow = this._createArrow(0x44ff44, new THREE.Vector3(0, 1, 0));
    this._zArrow = this._createArrow(0x4488ff, new THREE.Vector3(0, 0, 1));
    this.group.add(this._xArrow, this._yArrow, this._zArrow);

    this._xyHandle = this._createPlaneHandle(0xffff44, new THREE.Vector3(1, 1, 0));
    this._xzHandle = this._createPlaneHandle(0xff88ff, new THREE.Vector3(1, 0, 1));
    this._yzHandle = this._createPlaneHandle(0x44ffff, new THREE.Vector3(0, 1, 1));
    this.group.add(this._xyHandle, this._xzHandle, this._yzHandle);

    this._centerSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    this._centerSphere.renderOrder = 1000;
    this.group.add(this._centerSphere);

    // Build hit targets
    this._buildHitTargets();

    this.group.visible = false;
  }

  onDrag(cb: DragCallback): void { this._onDrag = cb; }
  onDragStart(cb: DragStartCallback): void { this._onDragStart = cb; }
  onDragEnd(cb: DragEndCallback): void { this._onDragEnd = cb; }

  get isDragging(): boolean { return this._dragging; }
  get nodeId(): string | null { return this._nodeId; }

  /**
   * Show gumball at the given node position.
   */
  attach(nodeId: string, position: [number, number, number]): void {
    this._nodeId = nodeId;
    this._position.set(position[0], position[1], position[2]);
    this.group.position.copy(this._position);
    this.group.visible = true;
  }

  /**
   * Hide the gumball.
   */
  detach(): void {
    this._nodeId = null;
    this._dragging = false;
    this._dragAxis = null;
    this.group.visible = false;
  }

  /**
   * Update gumball scale based on camera distance (constant screen size).
   */
  updateScale(camera: THREE.PerspectiveCamera): void {
    if (!this.group.visible) return;
    const dist = camera.position.distanceTo(this._position);
    this._scale = dist * 0.06;
    this.group.scale.setScalar(this._scale);
  }

  /**
   * Check if pointer intersects gumball handles.
   * Returns true if a drag started.
   */
  pointerDown(
    e: PointerEvent,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ): boolean {
    if (!this.group.visible || !this._nodeId) return false;

    this._updateMouse(e, canvas);
    this._raycaster.setFromCamera(this._mouse, camera);
    const hits = this._raycaster.intersectObjects(this._hitTargets);

    if (hits.length === 0) return false;

    const axis = this._hitMap.get(hits[0].object);
    if (!axis) return false;

    this._dragging = true;
    this._dragAxis = axis;
    this._dragStart.copy(this._position);

    // Set up drag plane
    this._setupDragPlane(camera);
    this._onDragStart?.();
    return true;
  }

  /**
   * Update position during drag. Returns true if actively dragging.
   */
  pointerMove(
    e: PointerEvent,
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ): boolean {
    if (!this._dragging || !this._nodeId) return false;

    this._updateMouse(e, canvas);
    this._raycaster.setFromCamera(this._mouse, camera);

    const intersect = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(this._dragPlane, intersect)) return true;

    const delta = intersect.sub(this._dragStart);
    const newPos = this._dragStart.clone();

    switch (this._dragAxis) {
      case 'x': newPos.x += delta.x; break;
      case 'y': newPos.y += delta.y; break;
      case 'z': newPos.z += delta.z; break;
      case 'xy': newPos.x += delta.x; newPos.y += delta.y; break;
      case 'xz': newPos.x += delta.x; newPos.z += delta.z; break;
      case 'yz': newPos.y += delta.y; newPos.z += delta.z; break;
      case 'free': newPos.add(delta); break;
    }

    this._position.copy(newPos);
    this.group.position.copy(newPos);
    this._onDrag?.(this._nodeId, [newPos.x, newPos.y, newPos.z]);
    return true;
  }

  /**
   * End drag. Returns true if was dragging.
   */
  pointerUp(): boolean {
    if (!this._dragging || !this._nodeId) return false;
    this._dragging = false;
    this._onDragEnd?.(this._nodeId, [this._position.x, this._position.y, this._position.z]);
    this._dragAxis = null;
    return true;
  }

  private _updateMouse(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private _setupDragPlane(camera: THREE.PerspectiveCamera): void {
    const camDir = camera.getWorldDirection(new THREE.Vector3());

    switch (this._dragAxis) {
      case 'x': {
        // Plane perpendicular to the axis that's most perpendicular to camera
        const useXY = Math.abs(camDir.z) > Math.abs(camDir.y);
        const normal = useXY ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        this._dragPlane.setFromNormalAndCoplanarPoint(normal, this._position);
        break;
      }
      case 'y': {
        const useXY = Math.abs(camDir.z) > Math.abs(camDir.x);
        const normal = useXY ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        this._dragPlane.setFromNormalAndCoplanarPoint(normal, this._position);
        break;
      }
      case 'z': {
        const useXZ = Math.abs(camDir.y) > Math.abs(camDir.x);
        const normal = useXZ ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        this._dragPlane.setFromNormalAndCoplanarPoint(normal, this._position);
        break;
      }
      case 'xy':
        this._dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), this._position);
        break;
      case 'xz':
        this._dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), this._position);
        break;
      case 'yz':
        this._dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), this._position);
        break;
      case 'free':
        this._dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), this._position);
        break;
    }

    // Compute initial intersection to use as reference
    this._raycaster.ray.intersectPlane(this._dragPlane, this._dragStart);
  }

  private _createArrow(color: number, direction: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    const length = 1.5;
    const coneLen = 0.25;
    const shaftLen = length - coneLen;

    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.02, 0.02, shaftLen, 6);
    shaftGeo.translate(0, shaftLen / 2, 0);
    const shaftMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.renderOrder = 999;
    group.add(shaft);

    // Cone
    const coneGeo = new THREE.ConeGeometry(0.07, coneLen, 8);
    coneGeo.translate(0, shaftLen + coneLen / 2, 0);
    const coneMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.renderOrder = 999;
    group.add(cone);

    // Rotate group to point along direction
    if (direction.x === 1) group.rotation.z = -Math.PI / 2;
    else if (direction.z === 1) group.rotation.x = Math.PI / 2;
    // Y is default (up)

    return group;
  }

  private _createPlaneHandle(color: number, _axes: THREE.Vector3): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(0.35, 0.35);
    const mat = new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 999;

    // Position and orient based on axes
    const offset = 0.5;
    if (_axes.z === 0) {
      // XY plane
      mesh.position.set(offset, offset, 0);
    } else if (_axes.y === 0) {
      // XZ plane
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(offset, 0, offset);
    } else {
      // YZ plane
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(0, offset, offset);
    }

    return mesh;
  }

  private _buildHitTargets(): void {
    // Axis hit cylinders (larger than visual)
    const axes: Array<['x' | 'y' | 'z', THREE.Vector3]> = [
      ['x', new THREE.Vector3(1, 0, 0)],
      ['y', new THREE.Vector3(0, 1, 0)],
      ['z', new THREE.Vector3(0, 0, 1)],
    ];

    for (const [axis, dir] of axes) {
      const geo = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6);
      geo.translate(0, 0.75, 0);
      const mat = new THREE.MeshBasicMaterial({ visible: false });
      const mesh = new THREE.Mesh(geo, mat);
      if (dir.x === 1) mesh.rotation.z = -Math.PI / 2;
      else if (dir.z === 1) mesh.rotation.x = Math.PI / 2;
      this.group.add(mesh);
      this._hitTargets.push(mesh);
      this._hitMap.set(mesh, axis);
    }

    // Plane hit targets (larger squares)
    const planes: Array<['xy' | 'xz' | 'yz', THREE.Vector3, THREE.Euler]> = [
      ['xy', new THREE.Vector3(0.5, 0.5, 0), new THREE.Euler(0, 0, 0)],
      ['xz', new THREE.Vector3(0.5, 0, 0.5), new THREE.Euler(-Math.PI / 2, 0, 0)],
      ['yz', new THREE.Vector3(0, 0.5, 0.5), new THREE.Euler(0, Math.PI / 2, 0)],
    ];

    for (const [axis, pos, rot] of planes) {
      const geo = new THREE.PlaneGeometry(0.45, 0.45);
      const mat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.rotation.copy(rot);
      this.group.add(mesh);
      this._hitTargets.push(mesh);
      this._hitMap.set(mesh, axis);
    }

    // Center sphere hit target
    const centerGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const centerMat = new THREE.MeshBasicMaterial({ visible: false });
    const centerHit = new THREE.Mesh(centerGeo, centerMat);
    this.group.add(centerHit);
    this._hitTargets.push(centerHit);
    this._hitMap.set(centerHit, 'free');
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }
}

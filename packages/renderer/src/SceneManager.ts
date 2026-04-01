import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EventStore, VisualGroup } from '@qualia/core';
import { NodeMesh } from './NodeMesh';
import { EdgeMesh } from './EdgeMesh';
import { LabelLayer } from './LabelLayer';
import { ContextTransition } from './ContextTransition';
import { InteractionManager } from './InteractionManager';

/**
 * Orchestrates the entire Three.js scene: nodes, edges, labels,
 * context transitions, interaction, and the render loop.
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly nodeMesh: NodeMesh;
  readonly edgeMesh: EdgeMesh;
  readonly labelLayer: LabelLayer;
  readonly transition: ContextTransition;
  readonly interaction: InteractionManager;

  private _clock = new THREE.Clock();
  private _animFrame = 0;
  private _store: EventStore;
  private _container: HTMLElement;

  // Lighting (class properties for settings panel access)
  private _ambientLight: THREE.AmbientLight;
  private _dirLight: THREE.DirectionalLight;
  private _accentLight: THREE.PointLight;
  private _fillLight: THREE.PointLight;
  private _grid: THREE.GridHelper;

  // Rhino-style controls keyboard state
  private _shiftDown = false;
  private _keyDownHandler: (e: KeyboardEvent) => void;
  private _keyUpHandler: (e: KeyboardEvent) => void;

  // Override flags: when set, _syncVisuals won't clobber these values
  private _edgeOpacityOverride: number | null = null;

  // Light mode
  private _isLightMode = false;

  // Store dark-mode defaults for restoration
  private _darkDefaults = {
    clearColor: 0x0a0c10,
    fogColor: 0x0a0c10,
    gridColor: 0x111122,
    ambientColor: 0x556688,
    ambientIntensity: 0.8,
    dirColor: 0xaabbcc,
    dirIntensity: 0.6,
    emissive: 0x224466,
    emissiveIntensity: 0.4,
    roughness: 0.3,
  };

  // Saved state before entering light mode (for restore)
  private _savedDarkState: {
    ambientIntensity: number;
    dirIntensity: number;
    emissiveIntensity: number;
    roughness: number;
    fogDensity: number;
  } | null = null;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, store: EventStore) {
    this._store = store;
    this._container = container;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setClearColor(0x0a0c10, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.001);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 10, 50);

    // Controls — Rhino-style: right-click orbit, shift+right pan, scroll zoom
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 1.2;
    this.controls.mouseButtons = {
      LEFT: -1 as THREE.MOUSE,           // left-click reserved for selection
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    // Shift key swaps right-click between orbit and pan
    this._keyDownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        this._shiftDown = true;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      }
    };
    this._keyUpHandler = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        this._shiftDown = false;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      }
    };
    window.addEventListener('keydown', this._keyDownHandler);
    window.addEventListener('keyup', this._keyUpHandler);

    // Lighting
    this._ambientLight = new THREE.AmbientLight(0x556688, 0.8);
    this.scene.add(this._ambientLight);
    this._dirLight = new THREE.DirectionalLight(0xaabbcc, 0.6);
    this._dirLight.position.set(15, 25, 20);
    this.scene.add(this._dirLight);
    this._accentLight = new THREE.PointLight(0x4ff0c1, 0.5, 200);
    this._accentLight.position.set(-10, 15, -10);
    this.scene.add(this._accentLight);
    this._fillLight = new THREE.PointLight(0x6644aa, 0.3, 200);
    this._fillLight.position.set(20, -10, 20);
    this.scene.add(this._fillLight);

    // Grid
    this._grid = new THREE.GridHelper(400, 80, 0x111122, 0x111122);
    (this._grid.material as THREE.Material).transparent = true;
    (this._grid.material as THREE.Material).opacity = 0.15;
    this._grid.position.y = -5;
    this.scene.add(this._grid);

    // Sub-systems
    this.nodeMesh = new NodeMesh();
    this.scene.add(this.nodeMesh.mesh);

    this.edgeMesh = new EdgeMesh();
    this.scene.add(this.edgeMesh.lineSegments);

    this.labelLayer = new LabelLayer(container);
    this.transition = new ContextTransition();
    this.interaction = new InteractionManager(this.camera, this.nodeMesh, canvas);
    this.interaction.setDataAccessors(
      () => store.getActiveEdges(),
      () => this._getCurrentPositions(),
    );

    // Wire label clicks/hovers to the same callbacks as node interaction
    this.labelLayer.onLabelClick((nodeId) => {
      this.interaction.simulateNodeClick(nodeId);
    });
    this.labelLayer.onLabelHover((nodeId) => {
      this.interaction.simulateNodeHover(nodeId);
    });

    // Add gumball to scene
    this.scene.add(this.interaction.gumball.group);

    // Wire gumball drag to update node position
    this.interaction.gumball.onDrag((nodeId, position) => {
      this.updateNodePosition(nodeId, position);
    });

    // Wire controls enable/disable for gumball dragging
    this.interaction.onControlsEnabled((enabled) => {
      this.controls.enabled = enabled;
    });
  }

  /**
   * Start the render loop.
   */
  start(): void {
    this._clock.start();
    this._render();
  }

  /**
   * Stop the render loop.
   */
  stop(): void {
    cancelAnimationFrame(this._animFrame);
  }

  private _render = (): void => {
    const dt = this._clock.getDelta();
    const time = this._clock.getElapsedTime();

    this.controls.update();
    this.transition.update(dt);
    this.interaction.updateGumball();
    this._syncVisuals();

    const width = this._container.clientWidth;
    const height = this._container.clientHeight;

    // Direct render to screen
    this.renderer.render(this.scene, this.camera);

    // Labels
    this.labelLayer.update(
      this._getCurrentPositions(),
      this._store.state.nodes,
      this.camera,
      this._store.state.selectedNodeIds,
      this.interaction.hoveredNodeId,
      width,
      height,
    );

    this._animFrame = requestAnimationFrame(this._render);
  };

  private _syncVisuals(): void {
    const positions = this._getCurrentPositions();
    const store = this._store;

    // Nodes
    this.nodeMesh.update(
      positions,
      store.state.nodes,
      store.state.nodeTypes,
      store.state.selectedNodeIds,
      this.interaction.hoveredNodeId,
    );

    // Edges
    const edges = store.getActiveEdges();
    const edgeOpacity = this._edgeOpacityOverride
      ?? (this.transition.isActive ? this.transition.edgeOpacity : 0.6);
    this.edgeMesh.update(edges, positions, store.state.edgeTypes, edgeOpacity, store.state.selectedNodeIds, store.state.selectedEdgeIds);
  }

  private _getCurrentPositions(): Record<string, [number, number, number]> {
    if (this.transition.isActive) {
      return this.transition.positions;
    }
    return this._store.getActivePositions();
  }

  /**
   * Trigger a context transition animation.
   */
  transitionTo(contextId: string | null, duration: number = 0.8): void {
    const fromPositions = this._getCurrentPositions();
    this._store.switchContext(contextId);
    const toPositions = this._store.getActivePositions();

    if (Object.keys(toPositions).length === 0) {
      console.warn(`[SceneManager] Context "${contextId}" has no positions — skipping transition`);
      return;
    }

    this.transition.start(
      fromPositions,
      toPositions,
      duration,
      contextId === null,
    );

    // After transition completes, fit to view
    setTimeout(() => {
      this.fitToView(0.4);
    }, (duration + 0.1) * 1000);
  }

  /**
   * Fit the camera to frame all visible nodes with padding.
   */
  fitToView(duration: number = 0.6): void {
    const positions = this._store.getActivePositions();
    const posArray = Object.values(positions);
    if (posArray.length === 0) return;

    // Compute bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of posArray) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    // Center and radius
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

    // Compute camera distance to frame the bounding sphere
    const fov = this.camera.fov * Math.PI / 180;
    const aspect = this.camera.aspect;
    const effectiveFov = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * aspect));
    const sinHalfFov = Math.sin(effectiveFov / 2);
    const distance = sinHalfFov > 0 ? (radius / sinHalfFov) * 1.3 : radius * 3;

    // Place camera at a 30deg elevation, 45deg azimuth looking at center
    const elevation = Math.PI / 6;
    const azimuth = Math.PI / 4;
    const targetPos = new THREE.Vector3(
      cx + distance * Math.cos(elevation) * Math.sin(azimuth),
      cy + distance * Math.sin(elevation),
      cz + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    const targetLookAt = new THREE.Vector3(cx, cy, cz);

    if (duration <= 0) {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(targetLookAt);
      this.controls.update();
      return;
    }

    // Animate with cubic ease-out
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = this._clock.getElapsedTime();

    const animate = () => {
      const elapsed = this._clock.getElapsedTime() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.controls.update();

      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /**
   * Focus camera on a specific node.
   */
  focusNode(nodeId: string, duration: number = 0.5): void {
    const positions = this._store.getActivePositions();
    const pos = positions[nodeId];
    if (!pos) return;
    const target = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.controls.target.copy(target);
  }

  /**
   * Reset camera to default position.
   */
  resetCamera(duration: number = 0.6): void {
    const targetPos = new THREE.Vector3(0, 10, 50);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    if (duration <= 0) {
      this.camera.position.copy(targetPos);
      this.controls.target.copy(targetLookAt);
      this.controls.update();
      return;
    }

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = this._clock.getElapsedTime();

    const animate = () => {
      const elapsed = this._clock.getElapsedTime() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.controls.update();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /**
   * Toggle grid visibility.
   */
  toggleGrid(): void {
    this._grid.visible = !this._grid.visible;
  }

  get gridVisible(): boolean { return this._grid.visible; }

  setControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  setLabelsVisible(visible: boolean): void {
    this.labelLayer.setVisible(visible);
  }

  setLabelOpacity(opacity: number): void {
    this.labelLayer.setBaseOpacity(opacity);
  }

  setNodeMeshVisible(visible: boolean): void {
    this.nodeMesh.mesh.visible = visible;
  }

  setEdgesVisible(visible: boolean): void {
    this.edgeMesh.lineSegments.visible = visible;
  }

  setLightMode(isLight: boolean): void {
    const nodeMat = this.nodeMesh.mesh.material as THREE.MeshStandardMaterial;

    if (isLight && !this._isLightMode) {
      // Save current state before switching to light
      this._savedDarkState = {
        ambientIntensity: this._ambientLight.intensity,
        dirIntensity: this._dirLight.intensity,
        emissiveIntensity: nodeMat.emissiveIntensity,
        roughness: nodeMat.roughness,
        fogDensity: (this.scene.fog as THREE.FogExp2).density,
      };
    }

    this._isLightMode = isLight;
    this.labelLayer.setLightMode(isLight);
    this.edgeMesh.setLightMode(isLight);

    if (isLight) {
      this.renderer.setClearColor(0xe8eaf0, 1);
      const fogDensity = (this.scene.fog as THREE.FogExp2).density;
      this.scene.fog = new THREE.FogExp2(0xe8eaf0, fogDensity);
      (this._grid.material as unknown as { color: THREE.Color }).color.set(0xc0c4d0);
      this._ambientLight.color.set(0x888899);
      this._ambientLight.intensity = 1.5;
      this._dirLight.color.set(0xffffff);
      this._dirLight.intensity = 1.0;
      nodeMat.emissive.set(0x112233);
      nodeMat.emissiveIntensity = 0.1;
      nodeMat.roughness = 0.5;
    } else {
      this.renderer.setClearColor(this._darkDefaults.clearColor, 1);
      const fogDensity = this._savedDarkState?.fogDensity ?? (this.scene.fog as THREE.FogExp2).density;
      this.scene.fog = new THREE.FogExp2(this._darkDefaults.fogColor, fogDensity);
      (this._grid.material as unknown as { color: THREE.Color }).color.set(this._darkDefaults.gridColor);
      this._ambientLight.color.set(this._darkDefaults.ambientColor);
      this._ambientLight.intensity = this._savedDarkState?.ambientIntensity ?? this._darkDefaults.ambientIntensity;
      this._dirLight.color.set(this._darkDefaults.dirColor);
      this._dirLight.intensity = this._savedDarkState?.dirIntensity ?? this._darkDefaults.dirIntensity;
      nodeMat.emissive.set(this._darkDefaults.emissive);
      nodeMat.emissiveIntensity = this._savedDarkState?.emissiveIntensity ?? this._darkDefaults.emissiveIntensity;
      nodeMat.roughness = this._savedDarkState?.roughness ?? this._darkDefaults.roughness;
      this._savedDarkState = null;
    }
  }

  get isLightMode(): boolean { return this._isLightMode; }

  /**
   * Apply viewer settings from the settings panel.
   */
  applyViewerSettings(settings: {
    theme?: 'dark' | 'light';
    nodeScale?: number;
    emissiveIntensity?: number;
    edgeOpacity?: number;
    edgeWidth?: number;
    ambientIntensity?: number;
    fogDensity?: number;
    fov?: number;
    farPlane?: number;
  }): void {
    if (settings.theme !== undefined) {
      this.setLightMode(settings.theme === 'light');
    }
    if (settings.nodeScale !== undefined) {
      this.nodeMesh.setScaleMultiplier(settings.nodeScale);
    }
    if (settings.emissiveIntensity !== undefined) {
      const mat = this.nodeMesh.mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = settings.emissiveIntensity;
    }
    if (settings.edgeOpacity !== undefined) {
      this._edgeOpacityOverride = settings.edgeOpacity;
    }
    if (settings.edgeWidth !== undefined) {
      this.edgeMesh.setLineWidth(settings.edgeWidth);
    }
    if (settings.ambientIntensity !== undefined) {
      this._ambientLight.intensity = settings.ambientIntensity;
    }
    if (settings.fogDensity !== undefined) {
      (this.scene.fog as THREE.FogExp2).density = settings.fogDensity;
    }
    if (settings.fov !== undefined) {
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
    }
    if (settings.farPlane !== undefined) {
      this.camera.far = settings.farPlane;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Get current viewer settings for the settings panel.
   */
  getViewerSettings() {
    return {
      nodeScale: this.nodeMesh.getScaleMultiplier(),
      emissiveIntensity: (this.nodeMesh.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity,
      edgeOpacity: (this.edgeMesh.lineSegments.material as THREE.Material & { opacity: number }).opacity,
      edgeWidth: this.edgeMesh.getLineWidth(),
      ambientIntensity: this._ambientLight.intensity,
      fogDensity: (this.scene.fog as THREE.FogExp2).density,
      fov: this.camera.fov,
      farPlane: this.camera.far,
      gridVisible: this._grid.visible,
      theme: this._isLightMode ? 'light' as const : 'dark' as const,
    };
  }

  /**
   * Update a node's position (called by gumball drag).
   */
  updateNodePosition(nodeId: string, position: [number, number, number]): void {
    const contextId = this._store.state.activeContextId;
    if (!contextId) return;
    const ctx = this._store.state.contexts.get(contextId);
    if (!ctx?.positions) return;
    ctx.positions[nodeId] = position;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.edgeMesh.setResolution(width, height);
  }

  /**
   * Collect renderer stats for debug overlay.
   */
  getDebugStats() {
    const info = this.renderer.info;
    const cam = this.camera;
    const tgt = this.controls.target;
    const memMB = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      ? (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / (1024 * 1024)
      : 0;

    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      memoryMB: Math.round(memMB * 10) / 10,
      nodeCount: this.nodeMesh.count,
      edgeCount: this.edgeMesh.count,
      groupCount: this._store.getActiveGroups().length,
      cameraPosition: [cam.position.x, cam.position.y, cam.position.z] as [number, number, number],
      cameraTarget: [tgt.x, tgt.y, tgt.z] as [number, number, number],
      activeContextId: this._store.state.activeContextId,
    };
  }

  /** Future: integrate Penumbra SDF renderer */
  setPenumbraRenderer(_renderer: unknown): void {
    // Stub — Penumbra integration will be added later
  }

  /** Future: push visual group data to Penumbra */
  updateVisualGroups(_groups: VisualGroup[]): void {
    // Stub — will create/update Penumbra fields from group data
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('keydown', this._keyDownHandler);
    window.removeEventListener('keyup', this._keyUpHandler);
    this.nodeMesh.dispose();
    this.edgeMesh.dispose();
    this.labelLayer.dispose();
    this.interaction.dispose();
    this.renderer.dispose();
  }
}

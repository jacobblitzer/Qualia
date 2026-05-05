import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EventStore, VisualGroup, PlanarSettings, Level, PlaneAxis } from '@qualia/core';
import { DEFAULT_PLANAR_SETTINGS } from '@qualia/core';
import { PenumbraPass } from '@penumbra/three';
import { NodeAtomLayer as NodeMesh } from './NodeAtomLayer';
import { EdgeCurveLayer as EdgeMesh } from './EdgeCurveLayer';
import type { RouteOptions } from './EdgeRouter';
import { LabelLayer } from './LabelLayer';
import { ContextTransition } from './ContextTransition';
import { InteractionManager } from './InteractionManager';
import { compileGraphToScene } from './PenumbraNetworkCompiler';
import { createPenumbraBackdropMaterial } from './PenumbraBackdropMaterial';

/**
 * Performance / functionality toggles. Each flag turns one piece of the
 * render pipeline on or off so the user can isolate slowness.
 *
 * Defaults: everything on, full quality.
 */
export interface PerfSettings {
  /** Master switch for the Penumbra SDF backdrop. When false, the render
   *  loop skips Penumbra entirely (the pass stays alive but is silent). */
  penumbraEnabled: boolean;
  /** Include sphere primitives at every node in the SDF skeleton. */
  skeletonNodesEnabled: boolean;
  /** Include capsule primitives along every edge in the SDF skeleton.
   *  This is usually the most expensive — many capsules + smooth-union. */
  skeletonEdgesEnabled: boolean;
  /** Include per-group halo point-cloud fields. */
  halosEnabled: boolean;
  /** Three.js node InstancedMesh visibility. */
  nodesVisible: boolean;
  /** Three.js edge LineSegments2 visibility. */
  edgesVisible: boolean;
  /** CSS label overlay visibility. */
  labelsVisible: boolean;
  /** Background grid helper visibility. */
  gridVisible: boolean;
  /** Render Penumbra every N frames (1 = every frame, 4 = every 4th). */
  penumbraRenderInterval: number;
  /** Penumbra render resolution as a fraction of the viewport. 1.0 = full. */
  penumbraResolutionScale: number;
  /**
   * Multiplier applied to each group's `params.radius` when computing the
   * halo SDF point-cloud radius. <1 = halos sit inside the group radius
   * (skeleton silhouette dominates); >1 = halos extend beyond and engulf
   * skeleton detail. Default 0.7. See Bug 0002.
   */
  haloRadiusMultiplier: number;
  /**
   * Smooth-union blend radius for the SDF skeleton. Smaller = sharper,
   * more visible per-node/per-edge primitives; larger = nodes/edges fuse
   * into one continuous mass. Default 0.15. See Bug 0005.
   */
  skeletonBlend: number;
  /** Global illumination (SDF-based AO) enabled. Default false. */
  giEnabled: boolean;
  /** GI strength multiplier (0 = no effect, 1 = default occlusion, 2+ = exaggerated). */
  giStrength: number;
  /** Three node mesh opacity. <1 lets the plane/grid show through nodes. Default 0.7. */
  nodeOpacity: number;
  /** Penumbra backdrop opacity. <1 lets the plane/grid show through the SDF blob. Default 0.85. */
  haloOpacity: number;
  /** When true, halo fields smooth-union with each other instead of staying discrete.
   *  Allows neighbouring groups' halos to flow into one another. Default false. */
  smoothHaloBlend: boolean;
  /** Smooth-union blend radius applied at the scene level when smoothHaloBlend
   *  is enabled. Default 0.5. */
  haloBlendRadius: number;
  /** When true, each group's halo also includes capsules along edges between
   *  its member nodes (in addition to the point-cloud at member positions). */
  edgesInHalo: boolean;
  /** Capsule radius for edges-in-halo. Default 0.4. */
  edgeHaloRadius: number;

  // ─── Particulate mode (Penumbra ADR 0010) ────────────────────────
  /** Penumbra render mode: 'surface' | 'particulate' | 'blend'. Default 'surface'. */
  renderMode: 'surface' | 'particulate' | 'blend';
  /** Coarse-march step count (4-32). Default 12. */
  particulateCoarseSteps: number;
  /** Coarse render resolution as a fraction of viewport (0.25-1.0). Default 0.5. */
  particulateCoarseScale: number;
  /** Points scattered per coarse seed (8-512). Default 64. */
  particulatePointsPerSeed: number;
  /** Scatter jitter radius in world units. Default 0.3. */
  particulateScatterRadius: number;
  /** Surface ↔ volume mix (0=surface only, 1=volume only). Default 0.2. */
  particulateVolumeMix: number;
  /** Point billboard size in pixels. Default 4. */
  particulatePointSize: number;
  /** Surface↔particulate mix for blend mode (0=surface, 1=particulate). Default 0.5. */
  particulateMix: number;
  /** Output brightness multiplier. Default 1.5. */
  particulateBrightness: number;
  /** Animate seed pixel selection per-frame ("fizz"). Default false. */
  particulateShimmer: boolean;
  /** Cloud-noise strength (0 = lattice, 1 = wispy cloud). Default 0.5. */
  particulateCloudNoise: number;
  /** Cloud-noise spatial scale. Default 1.5. */
  particulateCloudNoiseScale: number;
  /** fbm displacement amplitude in scene units (independent of scatterRadius). Default 0.5. */
  particulateCloudAmplitude: number;
  /** Sub-seeds per atlas brick (1-16). Multiplies cloud density. Default 1. */
  particulateSeedSubdivision: number;
  /** Particle softness — 0 sharp / 1 wide soft puff. Default 0.5. */
  particulateSoftness: number;

  // ─── Edge softening (Penumbra post pass) — both default 0 (off) ──────
  /** Bilateral-blur strength on the Penumbra offscreen color (0 = off, 1 = full). */
  edgeSoftenBilateralStrength: number;
  /** Bloom (halo glow) strength on the Penumbra mask (0 = off, ~0.6 = strong). */
  edgeSoftenBloomStrength: number;
  /** Cardinal-tap pixel radius for bilateral kernel. Default 1.5. */
  edgeSoftenBilateralRadius: number;
  /** Pixel radius of the bloom kernel. Default 6. */
  edgeSoftenBloomRadius: number;
}

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
  // Bug 0019: always-on hemisphere baseline. NOT user-controllable. Guarantees
  // the scene reads as "dimly lit" even when the ambient slider is at zero,
  // so neither dark nor light mode goes pitch black. The user-controllable
  // ambient light layers on top of this.
  private _baselineHemi: THREE.HemisphereLight;
  private _grid: THREE.GridHelper;

  // Rhino-style controls keyboard state
  private _shiftDown = false;
  private _keyDownHandler: (e: KeyboardEvent) => void;
  private _keyUpHandler: (e: KeyboardEvent) => void;

  // Override flags: when set, _syncVisuals won't clobber these values
  private _edgeOpacityOverride: number | null = null;

  // Plane confinement + levels (ADR Qualia 0005)
  private _planarSettings: PlanarSettings = { ...DEFAULT_PLANAR_SETTINGS };
  private _planeMesh: THREE.Mesh | null = null;
  private _planeOutline: THREE.LineSegments | null = null;
  private _savedCamera: { position: THREE.Vector3; up: THREE.Vector3; target: THREE.Vector3 } | null = null;

  // Penumbra SDF integration (Phase 6) — null until enabled by host.
  private _penumbra: PenumbraPass | null = null;
  private _penumbraBackdrop: THREE.Mesh | null = null;
  private _penumbraScene: THREE.Scene | null = null;
  private _penumbraCamera: THREE.OrthographicCamera | null = null;
  private _penumbraFrameCounter = 0;
  private _perf: PerfSettings = {
    penumbraEnabled: true,
    skeletonNodesEnabled: true,
    skeletonEdgesEnabled: true,
    halosEnabled: true,
    nodesVisible: true,
    edgesVisible: true,
    labelsVisible: true,
    gridVisible: true,
    // Lower defaults for snappy first paint (Bug 0009). Users can opt up via the perf panel.
    penumbraRenderInterval: 2,
    penumbraResolutionScale: 0.4,
    haloRadiusMultiplier: 0.7,
    skeletonBlend: 0.15,
    // Bug 0019: enable Penumbra GI/AO by default at moderate strength so the
    // SDF blob has visible crevice darkening even before the user touches a
    // slider. User can still toggle off via the Perf panel.
    giEnabled: true,
    giStrength: 0.5,
    // Translucency: nodes + halo overlay a visible plane/grid by default
    nodeOpacity: 0.7,
    haloOpacity: 0.85,
    // Halos discrete by default (Bug 0006); user can opt into smooth fusion
    smoothHaloBlend: false,
    haloBlendRadius: 0.5,
    // Edges-in-halo off by default; per-group edge tubes are an opt-in look
    edgesInHalo: false,
    edgeHaloRadius: 0.4,
    // Particulate mode off by default (renderMode=surface); user opts in via Perf panel
    renderMode: 'surface',
    particulateCoarseSteps: 12,
    particulateCoarseScale: 0.5,
    particulatePointsPerSeed: 128,
    particulateScatterRadius: 0.08,
    particulateVolumeMix: 0.0,
    particulatePointSize: 2,
    particulateMix: 0.5,
    particulateBrightness: 2.5,
    particulateShimmer: false,
    particulateCloudNoise: 0.5,
    particulateCloudNoiseScale: 1.5,
    particulateCloudAmplitude: 0.5,
    particulateSeedSubdivision: 1,
    particulateSoftness: 0.5,
    // Edge softening — off by default. Live-updated via setPerfSettings →
    // PenumbraPass.setEdgeSoftenSettings.
    edgeSoftenBilateralStrength: 0,
    edgeSoftenBloomStrength: 0,
    edgeSoftenBilateralRadius: 1.5,
    edgeSoftenBloomRadius: 6,
  };

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

    // Bug 0019: baseline hemisphere — always on, sky/ground tones, mid-low
    // intensity. Survives any user slider at zero. Theme-dependent: warmer
    // sky in light mode, cooler in dark.
    this._baselineHemi = new THREE.HemisphereLight(0x88aacc, 0x223344, 0.4);
    this.scene.add(this._baselineHemi);
    this._dirLight = new THREE.DirectionalLight(0xaabbcc, 0.6);
    this._dirLight.position.set(15, 25, 20);
    this.scene.add(this._dirLight);
    this._accentLight = new THREE.PointLight(0x4ff0c1, 0.5, 200);
    this._accentLight.position.set(-10, 15, -10);
    this.scene.add(this._accentLight);
    this._fillLight = new THREE.PointLight(0x6644aa, 0.3, 200);
    this._fillLight.position.set(20, -10, 20);
    this.scene.add(this._fillLight);

    // Grid — Bug 0020: visible at all times under translucent nodes/halo.
    // depthTest off + low renderOrder makes the grid the first thing drawn,
    // so transparent layers above (Penumbra backdrop, nodes at <1 opacity)
    // composite over a guaranteed-visible plane. Bumped opacity from 0.15
    // → 0.35 so it reads through the halo overlay.
    this._grid = new THREE.GridHelper(400, 80, 0x111122, 0x111122);
    const gridMat = this._grid.material as THREE.Material & { color: THREE.Color };
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    gridMat.depthTest = false;
    gridMat.depthWrite = false;
    this._grid.renderOrder = -1000;
    this._grid.position.y = -5;
    this.scene.add(this._grid);

    // Sub-systems
    this.nodeMesh = new NodeMesh();
    this.scene.add(this.nodeMesh.group);

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

    // Render Penumbra SDF backdrop first (if enabled). The result lands on
    // pass.texture, which the backdrop quad samples. Three's main render
    // then draws nodes/edges on top — depth compositing is "background
    // behind opaque foreground" only; SDF cannot occlude meshes in v1.
    // See @penumbra/three README for the depth-handoff caveat.
    const penumbraActive =
      this._perf.penumbraEnabled &&
      this._penumbra &&
      this._penumbraScene &&
      this._penumbraCamera;
    if (penumbraActive) {
      // Frame-throttle: only re-render Penumbra every N frames. The
      // backdrop quad continues sampling whatever was last produced.
      if (this._penumbraFrameCounter % Math.max(1, this._perf.penumbraRenderInterval) === 0) {
        this.camera.updateMatrixWorld();
        this.camera.updateProjectionMatrix();
        this._penumbra!.render(this.camera);
      }
      this._penumbraFrameCounter++;

      // ADR 0007: depth-aware composite. Halo is a translucent overlay,
      // not an occluder. Render order:
      //   1. Main scene first (opaque) — populates color + depth.
      //   2. Backdrop on top with depthTest=true (uses gl_FragDepth =
      //      Penumbra's SDF surface depth) and depthWrite=false. Halo
      //      sits behind closer nodes (they occlude it) and composites
      //      translucently over farther nodes (they show through its alpha).
      const autoClear = this.renderer.autoClear;
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = false;
      this.renderer.autoClearDepth = false;
      this.renderer.render(this._penumbraScene!, this._penumbraCamera!);
      this.renderer.autoClearDepth = true;
      this.renderer.autoClear = autoClear;
    } else {
      this.renderer.render(this.scene, this.camera);
    }

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
    let positions: Record<string, [number, number, number]>;
    if (this.transition.isActive) {
      positions = { ...this.transition.positions };
    } else {
      positions = { ...this._store.getActivePositions() };
    }
    // Apply level constraints (planar mode) — captured nodes get their
    // position-along-axis-normal pulled toward the level's offset.
    if (this._planarSettings.layoutPlanar) {
      const axis = this._planarSettings.axis;
      const set = this._planarSettings.levels[axis.id] ?? [];
      const k = this._planarSettings.pullStrength;
      for (const level of set) {
        for (const id of level.capturedNodeIds) {
          const p = positions[id];
          if (!p) continue;
          const cur = dotVec3(p, axis.normal);
          const delta = (level.position - cur) * k;
          positions[id] = [
            p[0] + axis.normal[0] * delta,
            p[1] + axis.normal[1] * delta,
            p[2] + axis.normal[2] * delta,
          ];
        }
      }
    }
    return positions;
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
    this.nodeMesh.setBucketsVisible(visible);
  }

  /**
   * Set the global node display mode. Per-type and per-node overrides on the
   * node data still apply via the resolver cascade. See ADR Qualia 0003.
   */
  setNodeDisplayMode(mode: import('@qualia/core').NodeDisplayMode): void {
    this.nodeMesh.setGlobalDisplayMode(mode);
    // Re-run update to rebuild overlays for the new mode
    this.nodeMesh.update(
      this._getCurrentPositions(),
      this._store.state.nodes,
      this._store.state.nodeTypes,
      this._store.state.selectedNodeIds,
      this.interaction.hoveredNodeId,
    );
  }

  getNodeDisplayMode(): import('@qualia/core').NodeDisplayMode {
    return this.nodeMesh.getGlobalDisplayMode();
  }

  /** True if a PenumbraPass is attached and rendering the SDF backdrop. */
  get hasPenumbra(): boolean {
    return this._penumbra !== null;
  }

  /**
   * Re-run the node atom layer's update with current store state. Used by
   * UI panels that mutate nodeType.sdfAtom / nodeType.displayMode and need
   * the visual to reflect the change without piggy-backing on
   * setNodeDisplayMode. Bug 0003.
   */
  refreshNodeAtoms(): void {
    this.nodeMesh.update(
      this._getCurrentPositions(),
      this._store.state.nodes,
      this._store.state.nodeTypes,
      this._store.state.selectedNodeIds,
      this.interaction.hoveredNodeId,
    );
  }

  // ─── Edge display (ADR Qualia 0004) ───────────────────────────────────

  setEdgeShape(shape: import('@qualia/core').EdgeShape): void {
    this.edgeMesh.globalShape = shape;
  }

  getEdgeShape(): import('@qualia/core').EdgeShape {
    return this.edgeMesh.globalShape;
  }

  setEdgeRouting(opts: Partial<RouteOptions>): void {
    this.edgeMesh.routeOptions = { ...this.edgeMesh.routeOptions, ...opts };
  }

  getEdgeRouting(): RouteOptions {
    return { ...this.edgeMesh.routeOptions };
  }

  // ─── Planar confinement (ADR Qualia 0005) ─────────────────────────────

  getPlanarSettings(): PlanarSettings {
    return { ...this._planarSettings, levels: cloneLevels(this._planarSettings.levels) };
  }

  setPlanarSettings(partial: Partial<PlanarSettings>): void {
    const prev = this._planarSettings;
    const next: PlanarSettings = { ...prev, ...partial };
    this._planarSettings = next;

    // Plane visibility
    if (next.showPlane) {
      this._ensurePlaneMesh();
      this._updatePlaneTransform();
    } else {
      this._removePlaneMesh();
    }

    // Camera lock
    if (partial.cameraLock !== undefined && partial.cameraLock !== prev.cameraLock) {
      if (next.cameraLock) this._lockCameraToAxis(next.axis);
      else this._unlockCamera();
    } else if (next.cameraLock && partial.axis) {
      // axis changed while locked — relock
      this._lockCameraToAxis(next.axis);
    }
  }

  /**
   * Capture nodes within `bandWidth` of the current `livePlanePosition` into
   * a new Level on the active axis. Returns the new level's id, or null if
   * no nodes were near enough to capture.
   */
  captureLevel(bandWidth = 1.0, name?: string): string | null {
    const axis = this._planarSettings.axis;
    const target = this._planarSettings.livePlanePosition;
    const positions = this._getCurrentPositions();
    const captured: string[] = [];
    for (const [id, p] of Object.entries(positions)) {
      const dist = dotVec3(p, axis.normal);
      if (Math.abs(dist - target) <= bandWidth) {
        // Don't capture if already in a level on this axis
        if (this._isCapturedOnAxis(id, axis.id)) continue;
        captured.push(id);
      }
    }
    if (captured.length === 0) return null;
    const level: Level = {
      id: `level-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name ?? `Level @ ${target.toFixed(2)}`,
      position: target,
      capturedNodeIds: captured,
    };
    const set = this._planarSettings.levels[axis.id] ?? [];
    this._planarSettings.levels = {
      ...this._planarSettings.levels,
      [axis.id]: [...set, level],
    };
    return level.id;
  }

  /** Remove a level. Captured nodes go back to free movement. */
  uncaptureLevel(levelId: string): void {
    const axis = this._planarSettings.axis;
    const set = this._planarSettings.levels[axis.id] ?? [];
    const next = set.filter((l) => l.id !== levelId);
    this._planarSettings.levels = {
      ...this._planarSettings.levels,
      [axis.id]: next,
    };
  }

  /** Apply level constraints to a positions map in-place. Honors pullStrength
   *  (1.0 = hard clamp; <1.0 = soft pull from current position). */
  applyLevelsToPositions(positions: Record<string, [number, number, number]>): void {
    if (!this._planarSettings.layoutPlanar) return;
    const axis = this._planarSettings.axis;
    const set = this._planarSettings.levels[axis.id] ?? [];
    const k = this._planarSettings.pullStrength;
    for (const level of set) {
      for (const id of level.capturedNodeIds) {
        const p = positions[id];
        if (!p) continue;
        const cur = dotVec3(p, axis.normal);
        const delta = (level.position - cur) * k;
        positions[id] = [
          p[0] + axis.normal[0] * delta,
          p[1] + axis.normal[1] * delta,
          p[2] + axis.normal[2] * delta,
        ];
      }
    }
  }

  private _isCapturedOnAxis(nodeId: string, axisId: string): boolean {
    const set = this._planarSettings.levels[axisId] ?? [];
    for (const l of set) {
      if (l.capturedNodeIds.includes(nodeId)) return true;
    }
    return false;
  }

  private _ensurePlaneMesh(): void {
    if (this._planeMesh) return;
    const geom = new THREE.PlaneGeometry(40, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6688aa,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._planeMesh = new THREE.Mesh(geom, mat);
    this.scene.add(this._planeMesh);

    const edgesGeom = new THREE.EdgesGeometry(geom);
    const edgesMat = new THREE.LineBasicMaterial({
      color: 0x88aacc,
      transparent: true,
      opacity: 0.4,
    });
    this._planeOutline = new THREE.LineSegments(edgesGeom, edgesMat);
    this.scene.add(this._planeOutline);
  }

  private _removePlaneMesh(): void {
    if (this._planeMesh) {
      this.scene.remove(this._planeMesh);
      (this._planeMesh.geometry as THREE.BufferGeometry).dispose();
      (this._planeMesh.material as THREE.Material).dispose();
      this._planeMesh = null;
    }
    if (this._planeOutline) {
      this.scene.remove(this._planeOutline);
      (this._planeOutline.geometry as THREE.BufferGeometry).dispose();
      (this._planeOutline.material as THREE.Material).dispose();
      this._planeOutline = null;
    }
  }

  /** Position + orient the plane to match the active axis + livePlanePosition. */
  private _updatePlaneTransform(): void {
    if (!this._planeMesh) return;
    const axis = this._planarSettings.axis;
    const offset = this._planarSettings.livePlanePosition;

    // Plane mesh defaults to Z-normal in Three. Rotate so its +Z aligns with
    // the requested axis normal.
    const target = new THREE.Vector3(axis.normal[0], axis.normal[1], axis.normal[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), target);
    this._planeMesh.quaternion.copy(q);
    this._planeMesh.position.set(target.x * offset, target.y * offset, target.z * offset);

    if (this._planeOutline) {
      this._planeOutline.quaternion.copy(q);
      this._planeOutline.position.copy(this._planeMesh.position);
    }
  }

  private _lockCameraToAxis(axis: PlaneAxis): void {
    if (!this._savedCamera) {
      this._savedCamera = {
        position: this.camera.position.clone(),
        up: this.camera.up.clone(),
        target: this.controls.target.clone(),
      };
    }
    const tgt = this.controls.target;
    const dist = this.camera.position.distanceTo(tgt);
    const n = new THREE.Vector3(axis.normal[0], axis.normal[1], axis.normal[2]).normalize();
    this.camera.position.copy(tgt).addScaledVector(n, dist);
    // Pick a stable up vector that's perpendicular to the normal
    const candidate = Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(n, candidate).normalize();
    const up = new THREE.Vector3().crossVectors(right, n).normalize();
    this.camera.up.copy(up);
    this.camera.lookAt(tgt);
  }

  private _unlockCamera(): void {
    if (!this._savedCamera) return;
    this.camera.position.copy(this._savedCamera.position);
    this.camera.up.copy(this._savedCamera.up);
    this.controls.target.copy(this._savedCamera.target);
    this.camera.lookAt(this.controls.target);
    this._savedCamera = null;
  }

  setEdgesVisible(visible: boolean): void {
    this.edgeMesh.lineSegments.visible = visible;
  }

  /**
   * Apply a full ThemeConfig (ADR Qualia 0008). Replaces the old
   * `setLightMode(boolean)` boolean toggle with a parameterized config
   * carrying palette + Penumbra mirror + motion. `setLightMode` is kept
   * below as a thin legacy wrapper.
   *
   * Theme is the canonical place for: scene clear color, fog, grid color,
   * ambient + dir + baseline-hemi lights, node materials' emissive/roughness,
   * and Penumbra background + lighting + intensity.
   *
   * The theme's CSS variables are NOT applied here — that's App.tsx's
   * responsibility (DOM concern, separated from renderer concerns).
   */
  applyTheme(theme: import('@qualia/core').ThemeConfig): void {
    this._isLightMode = theme.id === 'light';

    // Three scene
    this.renderer.setClearColor(theme.bgPrimary, 1);
    this.scene.fog = new THREE.FogExp2(theme.bgFog, theme.fogDensity);
    (this._grid.material as unknown as { color: THREE.Color }).color.set(theme.gridColor);

    this._ambientLight.color.set(theme.ambientLightColor);
    this._ambientLight.intensity = theme.ambientLightIntensity;

    this._baselineHemi.color.set(theme.baselineHemiSky);
    this._baselineHemi.groundColor.set(theme.baselineHemiGround);
    this._baselineHemi.intensity = theme.baselineHemiIntensity;

    this._dirLight.color.set(theme.dirLightColor);
    this._dirLight.intensity = theme.dirLightIntensity;

    this.nodeMesh.forEachMaterial((m) => {
      m.emissive.set(theme.nodeEmissive);
      m.emissiveIntensity = theme.nodeEmissiveIntensity;
      m.roughness = theme.nodeRoughness;
    });

    this.labelLayer.setLightMode(theme.id === 'light');
    this.edgeMesh.setLightMode(theme.id === 'light');

    // Penumbra mirror
    if (this._penumbra) {
      this._penumbra.setBackgroundColor(theme.penumbraBg);
      this._penumbra.setLightingSettings({
        ambientColor: theme.penumbraAmbientSky,
        ambientGroundColor: theme.penumbraAmbientGround,
        ambientIntensity: theme.penumbraAmbientIntensity,
        color: theme.penumbraLightColor,
        intensity: theme.penumbraLightIntensity,
      });
    }

  }

  /** @deprecated Use applyTheme(THEMES.dark | THEMES.light). Kept for back-compat. */
  setLightMode(isLight: boolean): void {
    const nodeMat = this.nodeMesh.getPrimaryMaterial();
    if (!nodeMat) return;

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
      // Bug 0019: warmer baseline hemisphere in light mode
      this._baselineHemi.color.set(0xfff8e8);
      this._baselineHemi.groundColor.set(0xc8ccd0);
      this._baselineHemi.intensity = 0.5;
      this.nodeMesh.forEachMaterial((m) => {
        m.emissive.set(0x112233);
        m.emissiveIntensity = 0.1;
        m.roughness = 0.5;
      });
    } else {
      this.renderer.setClearColor(this._darkDefaults.clearColor, 1);
      const fogDensity = this._savedDarkState?.fogDensity ?? (this.scene.fog as THREE.FogExp2).density;
      this.scene.fog = new THREE.FogExp2(this._darkDefaults.fogColor, fogDensity);
      (this._grid.material as unknown as { color: THREE.Color }).color.set(this._darkDefaults.gridColor);
      this._ambientLight.color.set(this._darkDefaults.ambientColor);
      this._ambientLight.intensity = this._savedDarkState?.ambientIntensity ?? this._darkDefaults.ambientIntensity;
      this._dirLight.color.set(this._darkDefaults.dirColor);
      this._dirLight.intensity = this._savedDarkState?.dirIntensity ?? this._darkDefaults.dirIntensity;
      const restoreEmissive = this._savedDarkState?.emissiveIntensity ?? this._darkDefaults.emissiveIntensity;
      const restoreRoughness = this._savedDarkState?.roughness ?? this._darkDefaults.roughness;
      this.nodeMesh.forEachMaterial((m) => {
        m.emissive.set(this._darkDefaults.emissive);
        m.emissiveIntensity = restoreEmissive;
        m.roughness = restoreRoughness;
      });
      // Bug 0019: cooler baseline hemisphere in dark mode. Higher intensity
      // than light mode because dark scenes need MORE baseline to be readable.
      this._baselineHemi.color.set(0x88aacc);
      this._baselineHemi.groundColor.set(0x1a2030);
      this._baselineHemi.intensity = 0.6;
      this._savedDarkState = null;
    }

    // Bug 0015: mirror theme to Penumbra. Match background + ambient/sky/ground
    // colors so the SDF blob's surface tint matches the rest of the scene.
    if (this._penumbra) {
      if (isLight) {
        this._penumbra.setBackgroundColor([0.91, 0.92, 0.94]);
        this._penumbra.setLightingSettings({
          ambientColor: [0.7, 0.72, 0.78],
          ambientGroundColor: [0.55, 0.56, 0.6],
          ambientIntensity: 1.5,
          color: [1.0, 1.0, 1.0],
          intensity: 1.0,
        });
      } else {
        this._penumbra.setBackgroundColor([
          ((this._darkDefaults.clearColor >> 16) & 0xff) / 255,
          ((this._darkDefaults.clearColor >> 8) & 0xff) / 255,
          (this._darkDefaults.clearColor & 0xff) / 255,
        ]);
        this._penumbra.setLightingSettings({
          ambientColor: [0.2, 0.25, 0.35],
          ambientGroundColor: [0.1, 0.08, 0.05],
          ambientIntensity: this._ambientLight.intensity,
          color: [1.0, 0.95, 0.9],
          intensity: 1.5,
        });
      }
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
      const v = settings.emissiveIntensity;
      this.nodeMesh.forEachMaterial((m) => { m.emissiveIntensity = v; });
    }
    if (settings.edgeOpacity !== undefined) {
      this._edgeOpacityOverride = settings.edgeOpacity;
    }
    if (settings.edgeWidth !== undefined) {
      this.edgeMesh.setLineWidth(settings.edgeWidth);
    }
    if (settings.ambientIntensity !== undefined) {
      this._ambientLight.intensity = settings.ambientIntensity;
      // Bug 0015: mirror to Penumbra so the SDF blob's ambient matches
      this._penumbra?.setLightingSettings({ ambientIntensity: settings.ambientIntensity });
    }
    if (settings.fogDensity !== undefined) {
      (this.scene.fog as THREE.FogExp2).density = settings.fogDensity;
      // Bug 0015: mirror to Penumbra fog
      this._penumbra?.setFogSettings({
        density: settings.fogDensity,
        enabled: settings.fogDensity > 0,
      });
    }
    if (settings.fov !== undefined) {
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
    }
    if (settings.farPlane !== undefined) {
      this.camera.far = settings.farPlane;
      this.camera.updateProjectionMatrix();
    }

    // Bug 0010: re-sync visuals immediately so override changes (notably
    // edge opacity) propagate to materials within the same call stack
    // instead of waiting for the next render frame.
    if (settings.edgeOpacity !== undefined || settings.emissiveIntensity !== undefined) {
      this._syncVisuals();
    }
  }

  /** Bug 0010: expose the raw override so the snapshot doesn't have to read
   *  the lagging material value. Returns null when no override is active. */
  getEdgeOpacityOverride(): number | null {
    return this._edgeOpacityOverride;
  }

  /**
   * Get current viewer settings for the settings panel.
   */
  getViewerSettings() {
    return {
      nodeScale: this.nodeMesh.getScaleMultiplier(),
      emissiveIntensity: this.nodeMesh.getPrimaryMaterial()?.emissiveIntensity ?? 0.4,
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
   *
   * In an active context, mutates that context's positions map.
   * In superposition mode (`activeContextId === null`), applies the new
   * position to every context that already has the node — keeps the
   * union view consistent across underlying contexts (Bug 0007).
   *
   * After the mutation, immediately re-bakes the dependent visual
   * subsystems (NodeAtomLayer + EdgeMesh) so the change is visible
   * within the same frame, without waiting for the next layout tick.
   */
  updateNodePosition(nodeId: string, position: [number, number, number]): void {
    const contextId = this._store.state.activeContextId;
    if (contextId) {
      const ctx = this._store.state.contexts.get(contextId);
      if (ctx?.positions) ctx.positions[nodeId] = [...position];
    } else {
      // Superposition: write to every context that has this node positioned
      let touched = 0;
      for (const ctx of this._store.state.contexts.values()) {
        if (ctx.positions && nodeId in ctx.positions) {
          ctx.positions[nodeId] = [...position];
          touched++;
        }
      }
      if (touched === 0) {
        // No context owns a position for this node — write into the first
        // context as a fallback so the drag has somewhere to go.
        const first = this._store.state.contexts.values().next().value;
        if (first) {
          if (!first.positions) first.positions = {};
          first.positions[nodeId] = [...position];
        }
      }
    }

    // Push the new position into the visual layers immediately so the
    // next render frame draws the moved node.
    this.refreshNodeAtoms();
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

  /**
   * Attach a Penumbra SDF renderer. Once attached, the render loop draws
   * Penumbra's output as a fullscreen backdrop behind the Three.js scene.
   *
   * Pass `null` to detach (renderer falls back to direct Three render).
   *
   * Awaits PenumbraPass.ready() so the GPU device + WebGPU pipeline are
   * live before any `updateVisualGroups()` call goes through.
   */
  async setPenumbraRenderer(pass: PenumbraPass | null): Promise<void> {
    // Tear down any existing backdrop machinery first.
    if (this._penumbraBackdrop) {
      const mat = this._penumbraBackdrop.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
      this._penumbraBackdrop.geometry.dispose();
      this._penumbraBackdrop = null;
    }
    this._penumbraScene = null;
    this._penumbraCamera = null;
    this._penumbra = null;

    if (!pass) return;

    await pass.ready();
    this._penumbra = pass;

    // Fullscreen quad in its own scene with an orthographic camera. Sampling
    // pass.texture maps Penumbra's output 1:1 to the viewport.
    //
    // Bug 0023 / ADR 0007: depth-aware composite. The backdrop material
    // samples Penumbra's depth canvas (RGB-packed 24-bit NDC depth) and
    // writes gl_FragDepth so Three meshes correctly z-comp against the
    // SDF surface. Backdrop is drawn AT the very back of the main scene
    // with depthTest=true / depthWrite=true; the legacy two-scene render
    // (autoClear backdrop pre-pass) is no longer needed.
    const backdropScene = new THREE.Scene();
    const backdropCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const backdropGeom = new THREE.PlaneGeometry(2, 2);
    const backdropMat = createPenumbraBackdropMaterial({
      colorTex: pass.texture,
      depthTex: pass.depthTexture,
      haloOpacity: this._perf.haloOpacity,
    });
    const backdropMesh = new THREE.Mesh(backdropGeom, backdropMat);
    backdropScene.add(backdropMesh);

    this._penumbraScene = backdropScene;
    this._penumbraCamera = backdropCamera;
    this._penumbraBackdrop = backdropMesh;

    // Bug 0004: PenumbraPass.resize disposes + recreates its CanvasTexture.
    // We must update the backdrop material's uniforms, otherwise we'd
    // hold a stale (disposed) texture handle.
    pass.onTextureReplaced((tex) => {
      backdropMat.uniforms.uColorTex.value = tex;
      backdropMat.uniformsNeedUpdate = true;
    });
    pass.onDepthTextureReplaced((tex) => {
      backdropMat.uniforms.uDepthTex.value = tex;
      backdropMat.uniformsNeedUpdate = true;
    });

    // Push current GI / lighting state to the new pass.
    pass.setLightingSettings({
      giEnabled: this._perf.giEnabled,
      giStrength: this._perf.giStrength,
    });

    // Scene-combine. min keeps fields discrete (Bug 0006); smoothUnion lets
    // neighbouring halos flow into each other when the user opts in.
    if (this._perf.smoothHaloBlend) {
      pass.setSceneCombineOp('smoothUnion', this._perf.haloBlendRadius);
    } else {
      pass.setSceneCombineOp('min', 0);
    }

    // Bug 0017: force tape evaluation across all fields. The skeleton's
    // smooth-union of 12 spheres + 23 capsules compiles to a tape too long
    // for Penumbra's default `tapeEvalLimit: 50`, which would flip it to
    // atlas mode and render via a bounding-sphere companion until the atlas
    // bake completes (often never visible to the user). atomMode='tape'
    // tells Penumbra "evaluate all fields' actual tapes regardless of
    // length" — the network silhouette appears as a gloopy spaceframe
    // instead of a uniform sphere. Combined with PenumbraPass's now-bumped
    // `tapeEvalLimit: 500` (Viewport.tsx) this is belt-and-suspenders.
    //
    // Wave 3 Phase 5f (Qualia ADR-0011 alignment audit, 2026-05-05) —
    // migrated from `pass.setEvalMode('multi-tape')` to the
    // DisplayState-aligned `setDisplayState({ atomMode: 'tape' })`.
    // 'multi-tape' was a WebGL2 fallback shader mode; on WebGPU
    // (Qualia's only backend) Penumbra coerced it to 'tape' anyway.
    // The new call is explicit + DisplayState-aligned + matches what
    // ADR 0013 B0 prescribes.
    pass.setDisplayState({ atomMode: 'tape' });

    // Resize the pass to match the current canvas, scaled by the perf flag.
    const scale = this._perf.penumbraResolutionScale;
    pass.resize(
      Math.max(1, Math.floor(this.renderer.domElement.width * scale)),
      Math.max(1, Math.floor(this.renderer.domElement.height * scale)),
    );

    // Push current visual groups, if any.
    const groups = this._store.getActiveGroups();
    if (groups.length > 0) await this._pushPenumbraScene(groups);
  }

  /**
   * Recompile Visual Groups → SDFScene and push to Penumbra. Called by the
   * host (App / Sidebar) when groups change. Safe to call before
   * `setPenumbraRenderer` — becomes a no-op until a pass is attached.
   */
  async updateVisualGroups(groups: VisualGroup[]): Promise<void> {
    if (!this._penumbra) return;
    await this._pushPenumbraScene(groups);
  }

  private async _pushPenumbraScene(groups: VisualGroup[]): Promise<void> {
    if (!this._penumbra) return;
    const edges = this._store.getActiveEdges();
    const scene = compileGraphToScene(
      edges,
      groups,
      this._getCurrentPositions(),
      {
        includeSkeletonNodes: this._perf.skeletonNodesEnabled,
        includeSkeletonEdges: this._perf.skeletonEdgesEnabled,
        includeHalos: this._perf.halosEnabled,
        haloRadiusMultiplier: this._perf.haloRadiusMultiplier,
        skeletonBlend: this._perf.skeletonBlend,
        edgesInHalo: this._perf.edgesInHalo,
        edgeHaloRadius: this._perf.edgeHaloRadius,
      },
      {
        nodes: this._store.state.nodes,
        nodeTypes: this._store.state.nodeTypes,
      },
    );
    await this._penumbra.setScene(scene);
    // Bug 0020: setScene rebuilds Penumbra's `fields` array with default
    // combineOp/blendRadius. Re-apply the user's halo blend choice every
    // time setScene completes — otherwise the slider only "works" for one
    // frame before the next throttled re-push wipes it.
    if (this._perf.smoothHaloBlend) {
      this._penumbra.setSceneCombineOp('smoothUnion', this._perf.haloBlendRadius);
    } else {
      this._penumbra.setSceneCombineOp('min', 0);
    }
  }

  /** Read the current performance/functionality toggles (immutable copy). */
  getPerfSettings(): PerfSettings {
    return { ...this._perf };
  }

  // ─── Penumbra DisplayState bridge (ADR 0010 / Penumbra ADR 0011) ───────
  // Qualia consumes Penumbra's DisplayState as the source of truth for
  // Penumbra-controllable display knobs. Per-knob setters in this class
  // (setRenderMode via setPerfSettings → particulate dispatch, etc.)
  // route through Penumbra's DisplayState internally; these methods
  // expose the preset surface for direct use by PerfPanel.

  /** List the names of shipped Penumbra presets, for UI dropdowns. */
  listPenumbraPresets(): readonly string[] {
    if (!this._penumbra) return [];
    const list = (this._penumbra as { listDisplayPresets?: () => readonly string[] }).listDisplayPresets;
    return typeof list === 'function' ? list.call(this._penumbra) : [];
  }

  /** Apply a named Penumbra preset. No-op if the preset is unknown. */
  loadPenumbraPreset(name: string): void {
    if (!this._penumbra) return;
    const fn = (this._penumbra as { loadDisplayPreset?: (n: string) => void }).loadDisplayPreset;
    if (typeof fn === 'function') {
      fn.call(this._penumbra, name);
    } else {
      console.warn('[Qualia] PenumbraPass.loadDisplayPreset missing — bump @penumbra/three');
    }
  }

  /** Snapshot of the current Penumbra display state, or null if unavailable. */
  getPenumbraDisplayState(): unknown | null {
    if (!this._penumbra) return null;
    const fn = (this._penumbra as { getDisplayState?: () => unknown }).getDisplayState;
    return typeof fn === 'function' ? fn.call(this._penumbra) : null;
  }

  /**
   * Subscribe to Penumbra DisplayState changes (Phase 5f — Qualia
   * ADR-0011 alignment). The listener fires on every Penumbra-side
   * change including external preset application via
   * `loadPenumbraPreset`, `setDisplayState` calls from RunCommand
   * test paths, or any future programmatic mutation. Lets Qualia UI
   * mirror Penumbra state instead of going stale after a preset
   * load.
   *
   * Returns an unsubscribe function. Returns a no-op unsubscribe
   * when the pass isn't attached or the runtime doesn't expose
   * `onDisplayChange` yet (older `@penumbra/three` tarballs).
   *
   * Usage pattern: PerfPanel calls this on mount and re-reads
   * `getPenumbraDisplayState()` each fire to refresh UI.
   */
  onPenumbraDisplayChange(listener: (state: unknown) => void): () => void {
    if (!this._penumbra) return () => {};
    const subscribe = (this._penumbra as {
      onDisplayChange?: (cb: (state: unknown) => void) => () => void;
    }).onDisplayChange;
    if (typeof subscribe !== 'function') return () => {};
    return subscribe.call(this._penumbra, listener);
  }

  /**
   * Export the current Penumbra atlas as a triangulated mesh (Wavefront
   * OBJ or binary STL). Wraps `PenumbraPass.exportMesh` (shipped in
   * @penumbra/three v0.1.14+ — Wave 3 Phase 5e). Returns null when
   * the pass isn't attached, the runtime doesn't expose `exportMesh`
   * yet, or the scene is in tape-only mode (no atlas → nothing to
   * export). Caller should treat null as "not ready" and surface a
   * UI prompt.
   */
  exportPenumbraMesh(format: 'obj' | 'stl'): {
    data: string | ArrayBuffer;
    mimeType: string;
    suggestedExtension: 'obj' | 'stl';
    vertexCount: number;
    triangleCount: number;
    brickCount: number;
    elapsedMs: number;
  } | null {
    if (!this._penumbra) return null;
    const fn = (this._penumbra as {
      exportMesh?: (format: 'obj' | 'stl') => {
        data: string | ArrayBuffer;
        mimeType: string;
        suggestedExtension: 'obj' | 'stl';
        vertexCount: number;
        triangleCount: number;
        brickCount: number;
        elapsedMs: number;
      } | null;
    }).exportMesh;
    if (typeof fn !== 'function') return null;
    return fn.call(this._penumbra, format);
  }

  /**
   * Update one or more perf toggles. Side-effects fire immediately:
   * subsystem visibility updates, Penumbra resolution rescales, and
   * any flag affecting compileGraphToScene triggers a scene re-push.
   */
  setPerfSettings(partial: Partial<PerfSettings>): void {
    const prev = this._perf;
    const next = { ...prev, ...partial };
    this._perf = next;

    // Three-side visibility (cheap; just toggles `.visible`)
    if (partial.nodesVisible !== undefined) {
      this.nodeMesh.setBucketsVisible(next.nodesVisible);
    }
    if (partial.edgesVisible !== undefined) {
      this.edgeMesh.lineSegments.visible = next.edgesVisible;
    }
    if (partial.labelsVisible !== undefined) {
      this.labelLayer.setVisible(next.labelsVisible);
    }
    if (partial.gridVisible !== undefined) {
      this._grid.visible = next.gridVisible;
    }

    // Penumbra resolution scale — resize the offscreen canvas. Lower scale
    // means fewer fragment shader invocations per frame; CanvasTexture's
    // linear filter handles upscaling at composite time.
    if (this._penumbra && partial.penumbraResolutionScale !== undefined) {
      const w = Math.max(1, Math.floor(this._container.clientWidth * next.penumbraResolutionScale));
      const h = Math.max(1, Math.floor(this._container.clientHeight * next.penumbraResolutionScale));
      this._penumbra.resize(w, h);
    }

    // Any flag that filters compileGraphToScene's output requires a re-push
    if (
      partial.skeletonNodesEnabled !== undefined ||
      partial.skeletonEdgesEnabled !== undefined ||
      partial.halosEnabled !== undefined ||
      partial.haloRadiusMultiplier !== undefined ||
      partial.skeletonBlend !== undefined ||
      partial.edgesInHalo !== undefined ||
      partial.edgeHaloRadius !== undefined
    ) {
      void this._pushPenumbraScene(this._store.getActiveGroups());
    }

    // Node opacity — applied to every shape bucket's MeshStandardMaterial
    if (partial.nodeOpacity !== undefined) {
      const o = next.nodeOpacity;
      this.nodeMesh.forEachMaterial((m) => {
        m.opacity = o;
        m.transparent = o < 1;
        m.depthWrite = o >= 1;
      });
    }

    // Halo opacity — applied to the backdrop quad's ShaderMaterial uniform
    // (the haloOpacity multiplier baked into the depth-aware composite).
    if (partial.haloOpacity !== undefined && this._penumbraBackdrop) {
      const mat = this._penumbraBackdrop.material as THREE.ShaderMaterial;
      mat.uniforms.uHaloOpacity.value = next.haloOpacity;
      mat.uniformsNeedUpdate = true;
    }

    // Particulate mode (Penumbra ADR 0010) — render mode + params pass-through.
    if (this._penumbra && partial.renderMode !== undefined) {
      this._penumbra.setRenderMode(next.renderMode);
    }
    if (this._penumbra && (
      partial.particulateCoarseSteps !== undefined ||
      partial.particulateCoarseScale !== undefined ||
      partial.particulatePointsPerSeed !== undefined ||
      partial.particulateScatterRadius !== undefined ||
      partial.particulateVolumeMix !== undefined ||
      partial.particulatePointSize !== undefined ||
      partial.particulateMix !== undefined ||
      partial.particulateBrightness !== undefined ||
      partial.particulateShimmer !== undefined ||
      partial.particulateCloudNoise !== undefined ||
      partial.particulateCloudNoiseScale !== undefined ||
      partial.particulateCloudAmplitude !== undefined ||
      partial.particulateSeedSubdivision !== undefined ||
      partial.particulateSoftness !== undefined
    )) {
      const p: Record<string, number | boolean> = {};
      if (partial.particulateCoarseSteps !== undefined) p.coarseSteps = next.particulateCoarseSteps;
      if (partial.particulateCoarseScale !== undefined) p.coarseScale = next.particulateCoarseScale;
      if (partial.particulatePointsPerSeed !== undefined) p.pointsPerSeed = next.particulatePointsPerSeed;
      if (partial.particulateScatterRadius !== undefined) p.scatterRadius = next.particulateScatterRadius;
      if (partial.particulateVolumeMix !== undefined) p.volumeMix = next.particulateVolumeMix;
      if (partial.particulatePointSize !== undefined) p.pointSize = next.particulatePointSize;
      if (partial.particulateMix !== undefined) p.mix = next.particulateMix;
      if (partial.particulateBrightness !== undefined) p.brightness = next.particulateBrightness;
      if (partial.particulateShimmer !== undefined) p.shimmer = next.particulateShimmer;
      if (partial.particulateCloudNoise !== undefined) p.cloudNoise = next.particulateCloudNoise;
      if (partial.particulateCloudNoiseScale !== undefined) p.cloudNoiseScale = next.particulateCloudNoiseScale;
      if (partial.particulateCloudAmplitude !== undefined) p.cloudAmplitude = next.particulateCloudAmplitude;
      if (partial.particulateSeedSubdivision !== undefined) p.seedSubdivision = next.particulateSeedSubdivision;
      if (partial.particulateSoftness !== undefined) p.softness = next.particulateSoftness;
      this._penumbra.setParticulateParams(p);
    }

    // Halo blend mode — applies via Penumbra's scene-combine op
    if (this._penumbra && (partial.smoothHaloBlend !== undefined || partial.haloBlendRadius !== undefined)) {
      if (next.smoothHaloBlend) {
        this._penumbra.setSceneCombineOp('smoothUnion', next.haloBlendRadius);
      } else {
        this._penumbra.setSceneCombineOp('min', 0);
      }
    }

    // GI is a uniform-only update — push to Penumbra via setLightingSettings
    if (this._penumbra && (partial.giEnabled !== undefined || partial.giStrength !== undefined)) {
      this._penumbra.setLightingSettings({
        giEnabled: next.giEnabled,
        giStrength: next.giStrength,
      });
    }

    // Edge softening — pass-through to Penumbra's post pass.
    if (this._penumbra && (
      partial.edgeSoftenBilateralStrength !== undefined ||
      partial.edgeSoftenBloomStrength !== undefined ||
      partial.edgeSoftenBilateralRadius !== undefined ||
      partial.edgeSoftenBloomRadius !== undefined
    )) {
      const s: Record<string, number> = {};
      if (partial.edgeSoftenBilateralStrength !== undefined) s.bilateralStrength = next.edgeSoftenBilateralStrength;
      if (partial.edgeSoftenBloomStrength !== undefined) s.bloomStrength = next.edgeSoftenBloomStrength;
      if (partial.edgeSoftenBilateralRadius !== undefined) s.bilateralRadius = next.edgeSoftenBilateralRadius;
      if (partial.edgeSoftenBloomRadius !== undefined) s.bloomRadius = next.edgeSoftenBloomRadius;
      if (typeof this._penumbra.setEdgeSoftenSettings === 'function') {
        this._penumbra.setEdgeSoftenSettings(s);
      } else {
        console.warn('[Qualia] PenumbraPass.setEdgeSoftenSettings missing — bump @penumbra/three');
      }
    }
  }

  dispose(): void {
    this.stop();
    window.removeEventListener('keydown', this._keyDownHandler);
    window.removeEventListener('keyup', this._keyUpHandler);
    this.nodeMesh.dispose();
    this.edgeMesh.dispose();
    this.labelLayer.dispose();
    this.interaction.dispose();
    if (this._penumbra) {
      this._penumbra.dispose();
      this._penumbra = null;
    }
    if (this._penumbraBackdrop) {
      const mat = this._penumbraBackdrop.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
      this._penumbraBackdrop.geometry.dispose();
      this._penumbraBackdrop = null;
    }
    this._removePlaneMesh();
    this.renderer.dispose();
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dotVec3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cloneLevels(levels: import('@qualia/core').LevelSet): import('@qualia/core').LevelSet {
  const out: import('@qualia/core').LevelSet = {};
  for (const [k, ls] of Object.entries(levels)) {
    out[k] = ls.map((l) => ({ ...l, capturedNodeIds: [...l.capturedNodeIds] }));
  }
  return out;
}

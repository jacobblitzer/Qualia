import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EventStore } from '@qualia/core';
import { NodeMesh } from './NodeMesh';
import { EdgeMesh } from './EdgeMesh';
import { LabelLayer } from './LabelLayer';
import { SDFPass } from './SDFPass';
import { ContextTransition } from './ContextTransition';
import { InteractionManager } from './InteractionManager';
import compositeFragShader from './shaders/composite.frag.glsl';

/**
 * Orchestrates the entire Three.js scene: nodes, edges, SDF fields,
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
  readonly sdfPass: SDFPass;
  readonly transition: ContextTransition;
  readonly interaction: InteractionManager;

  private _clock = new THREE.Clock();
  private _animFrame = 0;
  private _store: EventStore;
  private _container: HTMLElement;

  // Composite pass (SDF + scene)
  private _sceneRT: THREE.WebGLRenderTarget;
  private _compositeScene: THREE.Scene;
  private _compositeMaterial: THREE.ShaderMaterial;
  private _compositeCamera: THREE.OrthographicCamera;

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
    });
    this.renderer.setClearColor(0x0a0c10, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.003);

    // Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 500);
    this.camera.position.set(0, 10, 50);

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 1.2;

    // Lighting
    const ambient = new THREE.AmbientLight(0x334466, 0.6);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0x8899bb, 0.4);
    dir.position.set(15, 25, 20);
    this.scene.add(dir);
    const point = new THREE.PointLight(0x4ff0c1, 0.3, 100);
    point.position.set(-10, 15, -10);
    this.scene.add(point);

    // Grid (very faint)
    const grid = new THREE.GridHelper(200, 50, 0x111122, 0x111122);
    grid.material.transparent = true;
    grid.material.opacity = 0.08;
    grid.position.y = -20;
    this.scene.add(grid);

    // Sub-systems
    this.nodeMesh = new NodeMesh();
    this.scene.add(this.nodeMesh.mesh);

    this.edgeMesh = new EdgeMesh();
    this.scene.add(this.edgeMesh.lineSegments);

    this.labelLayer = new LabelLayer(container);
    this.sdfPass = new SDFPass(this.renderer, width, height);
    this.transition = new ContextTransition();
    this.interaction = new InteractionManager(this.camera, this.nodeMesh, canvas);

    // Scene render target (for composite pass)
    this._sceneRT = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    // Composite pass
    this._compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._compositeScene = new THREE.Scene();
    this._compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: compositeFragShader,
      uniforms: {
        uSceneTexture: { value: this._sceneRT.texture },
        uSDFTexture: { value: null as THREE.Texture | null },
      },
      depthTest: false,
    });
    this._compositeScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this._compositeMaterial,
    ));
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
    this._syncVisuals();

    const width = this._container.clientWidth;
    const height = this._container.clientHeight;

    // 1. Render scene to RT
    this.renderer.setRenderTarget(this._sceneRT);
    this.renderer.render(this.scene, this.camera);

    // 2. Render SDF pass
    const sdfTex = this.sdfPass.render(this.camera, time);
    this._compositeMaterial.uniforms.uSDFTexture.value = sdfTex;

    // 3. Composite
    this.renderer.setRenderTarget(null);
    this.renderer.render(this._compositeScene, this._compositeCamera);

    // 4. Labels
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
    const edgeOpacity = this.transition.isActive ? this.transition.edgeOpacity : 0.6;
    this.edgeMesh.update(edges, positions, store.state.edgeTypes, edgeOpacity);

    // SDF
    const fields = store.getActiveFields();
    this.sdfPass.updateNodes(positions, fields);
    this.sdfPass.updateFields(fields);
    if (this.transition.isActive) {
      this.sdfPass.setIntensity(this.transition.fieldIntensity);
    } else {
      this.sdfPass.setIntensity(store.state.activeContextId === null ? 0.2 : 0.7);
    }
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
    this.transition.start(
      fromPositions,
      toPositions,
      duration,
      contextId === null,
    );
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

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this._sceneRT.setSize(width, height);
    this.sdfPass.resize(width, height);
  }

  dispose(): void {
    this.stop();
    this.nodeMesh.dispose();
    this.edgeMesh.dispose();
    this.labelLayer.dispose();
    this.sdfPass.dispose();
    this.interaction.dispose();
    this._sceneRT.dispose();
    this._compositeMaterial.dispose();
    this.renderer.dispose();
  }
}

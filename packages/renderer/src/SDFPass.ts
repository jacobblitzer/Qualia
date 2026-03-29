import * as THREE from 'three';
import type { SDFFieldDef } from '@qualia/core';
import sdfVertShader from './shaders/sdf.vert.glsl';
import sdfFragShader from './shaders/sdf.frag.glsl';

const MAX_FIELDS = 8;
const TEX_SIZE = 64; // 64x64 = 4096 max nodes in SDF

/**
 * SDF ray marching pass. Renders at 1/4 resolution to a render target.
 */
export class SDFPass {
  private _material: THREE.ShaderMaterial;
  private _mesh: THREE.Mesh;
  private _scene: THREE.Scene;
  private _orthoCamera: THREE.OrthographicCamera;
  private _renderTarget: THREE.WebGLRenderTarget;
  private _nodeTexture: THREE.DataTexture;
  private _resDivisor = 4;
  private _resMultiplier = 0.25; // 0.25 = 1/4 res (matches divisor 4)

  get texture(): THREE.Texture {
    return this._renderTarget.texture;
  }

  constructor(private _renderer: THREE.WebGLRenderer, width: number, height: number) {
    this._orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._scene = new THREE.Scene();

    // Render target at 1/4 resolution (default)
    const rtW = Math.max(1, Math.round(width * this._resMultiplier));
    const rtH = Math.max(1, Math.round(height * this._resMultiplier));
    this._renderTarget = new THREE.WebGLRenderTarget(rtW, rtH, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Node position data texture
    const data = new Float32Array(TEX_SIZE * TEX_SIZE * 4);
    this._nodeTexture = new THREE.DataTexture(
      data, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat, THREE.FloatType,
    );
    this._nodeTexture.needsUpdate = true;

    // Create field color + param uniform arrays
    const fieldColors = [];
    const fieldParams = [];
    for (let i = 0; i < MAX_FIELDS; i++) {
      fieldColors.push(new THREE.Vector4(0, 0, 0, 1));
      fieldParams.push(new THREE.Vector4(5, 0.5, 0, 0)); // radius, blend, noise, contour
    }

    this._material = new THREE.ShaderMaterial({
      vertexShader: sdfVertShader,
      fragmentShader: sdfFragShader,
      uniforms: {
        uCameraWorldMatrix: { value: new THREE.Matrix4() },
        uCameraProjectionMatrixInverse: { value: new THREE.Matrix4() },
        uTime: { value: 0 },
        uGlobalIntensity: { value: 0.7 },
        uNodePositions: { value: this._nodeTexture },
        uNodeCount: { value: 0 },
        uNodeTexSize: { value: new THREE.Vector2(TEX_SIZE, TEX_SIZE) },
        uFieldColors: { value: fieldColors },
        uFieldParams: { value: fieldParams },
        uFieldCount: { value: 0 },
        uResolution: { value: new THREE.Vector2(rtW, rtH) },
        uOpacityBoost: { value: 0.0 },
        uFresnelStrength: { value: 1.0 },
        uLightMode: { value: 0.0 },
        uFogDensity: { value: 0.001 },
        uFogColor: { value: new THREE.Vector3(0.039, 0.047, 0.063) }, // #0a0c10
        uAmbientBoost: { value: 0.0 },
        uGlobalNoiseOverride: { value: -1.0 },
        uGlobalContourOverride: { value: -1.0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this._mesh = new THREE.Mesh(geometry, this._material);
    this._scene.add(this._mesh);
  }

  /**
   * Upload node positions to the data texture.
   * Each node gets a texel: (x, y, z, fieldIndex).
   * fieldIndex is -1 if the node belongs to no field.
   */
  updateNodes(
    positions: Record<string, [number, number, number]>,
    fields: SDFFieldDef[],
  ): void {
    // Build field membership lookup
    const fieldIndexOf = new Map<string, number>();
    fields.forEach((f, idx) => {
      for (const nodeId of f.nodeIds) {
        fieldIndexOf.set(nodeId, idx);
      }
    });

    const data = this._nodeTexture.image.data as unknown as Float32Array;
    let count = 0;

    for (const [nodeId, pos] of Object.entries(positions)) {
      if (count >= TEX_SIZE * TEX_SIZE) break;
      const fieldIdx = fieldIndexOf.get(nodeId) ?? -1;
      if (fieldIdx === -1) continue; // Only upload nodes that belong to a field

      data[count * 4] = pos[0];
      data[count * 4 + 1] = pos[1];
      data[count * 4 + 2] = pos[2];
      data[count * 4 + 3] = fieldIdx;
      count++;
    }

    this._material.uniforms.uNodeCount.value = count;
    this._nodeTexture.needsUpdate = true;
  }

  /**
   * Update per-field visual parameters.
   */
  updateFields(fields: SDFFieldDef[]): void {
    const fieldCount = Math.min(fields.length, MAX_FIELDS);
    this._material.uniforms.uFieldCount.value = fieldCount;

    const colors = this._material.uniforms.uFieldColors.value as THREE.Vector4[];
    const params = this._material.uniforms.uFieldParams.value as THREE.Vector4[];

    for (let i = 0; i < fieldCount; i++) {
      const f = fields[i];
      colors[i].set(
        f.color[0] / 255,
        f.color[1] / 255,
        f.color[2] / 255,
        f.sdf.transparency,
      );
      params[i].set(
        f.sdf.radius,
        f.sdf.blendFactor,
        f.sdf.noise ?? 0,
        f.sdf.contourLines ? 1 : 0,
      );
    }
  }

  /**
   * Set global field visibility (0-1).
   */
  setIntensity(intensity: number): void {
    this._material.uniforms.uGlobalIntensity.value = intensity;
  }

  /**
   * Render the SDF pass to its render target. Returns the texture.
   */
  render(camera: THREE.PerspectiveCamera, time: number): THREE.Texture {
    this._material.uniforms.uCameraWorldMatrix.value.copy(camera.matrixWorld);
    this._material.uniforms.uCameraProjectionMatrixInverse.value.copy(
      camera.projectionMatrixInverse,
    );
    this._material.uniforms.uTime.value = time;

    this._renderer.setRenderTarget(this._renderTarget);
    this._renderer.render(this._scene, this._orthoCamera);
    this._renderer.setRenderTarget(null);

    return this._renderTarget.texture;
  }

  resize(width: number, height: number): void {
    const rtW = Math.max(1, Math.round(width * this._resMultiplier));
    const rtH = Math.max(1, Math.round(height * this._resMultiplier));
    this._renderTarget.setSize(rtW, rtH);
    this._material.uniforms.uResolution.value.set(rtW, rtH);
  }

  getNodeCount(): number {
    return this._material.uniforms.uNodeCount.value as number;
  }

  getFieldCount(): number {
    return this._material.uniforms.uFieldCount.value as number;
  }

  getResolution(): [number, number] {
    const v = this._material.uniforms.uResolution.value as THREE.Vector2;
    return [v.x, v.y];
  }

  getIntensity(): number {
    return this._material.uniforms.uGlobalIntensity.value as number;
  }

  setOpacityBoost(boost: number): void {
    this._material.uniforms.uOpacityBoost.value = Math.max(0, Math.min(1, boost));
  }

  getOpacityBoost(): number {
    return this._material.uniforms.uOpacityBoost.value as number;
  }

  setFresnelStrength(strength: number): void {
    this._material.uniforms.uFresnelStrength.value = Math.max(0, Math.min(3, strength));
  }

  getFresnelStrength(): number {
    return this._material.uniforms.uFresnelStrength.value as number;
  }

  setLightMode(isLight: boolean): void {
    this._material.uniforms.uLightMode.value = isLight ? 1.0 : 0.0;
  }

  setResDivisor(divisor: number): void {
    this._resDivisor = Math.max(1, Math.round(divisor));
    this._resMultiplier = 1.0 / this._resDivisor;
  }

  getResDivisor(): number {
    return this._resDivisor;
  }

  setResMultiplier(multiplier: number): void {
    this._resMultiplier = Math.max(0.125, Math.min(2.0, multiplier));
    this._resDivisor = Math.round(1.0 / this._resMultiplier);
  }

  getResMultiplier(): number {
    return this._resMultiplier;
  }

  setFogDensity(density: number): void {
    this._material.uniforms.uFogDensity.value = density;
  }

  setFogColor(color: THREE.Color): void {
    (this._material.uniforms.uFogColor.value as THREE.Vector3).set(color.r, color.g, color.b);
  }

  setAmbientBoost(boost: number): void {
    this._material.uniforms.uAmbientBoost.value = boost;
  }

  setGlobalNoiseOverride(value: number): void {
    this._material.uniforms.uGlobalNoiseOverride.value = value;
  }

  setGlobalContourOverride(value: number): void {
    this._material.uniforms.uGlobalContourOverride.value = value;
  }

  dispose(): void {
    this._material.dispose();
    this._renderTarget.dispose();
    this._nodeTexture.dispose();
    this._mesh.geometry.dispose();
  }
}

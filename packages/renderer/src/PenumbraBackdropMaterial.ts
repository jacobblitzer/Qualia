import * as THREE from 'three';

/**
 * Custom ShaderMaterial for the Penumbra backdrop quad. Samples both the
 * SDF color texture AND the depth-encoded texture (RGB-packed 24-bit NDC
 * depth), then writes `gl_FragDepth` so that Three meshes can correctly
 * occlude / be occluded by the SDF surface.
 *
 * Resolves Qualia Bug 0023 + Penumbra Bug 0030.
 *
 * V1 atmospheric (screen-space sparkle/fog) was sunset 2026-05-02 in favor
 * of Penumbra-side particulate mode (ADR Penumbra 0010 / Qualia 0009 amend.):
 * coarse march → 3D point cloud rendered in world space, anchored to the
 * SDF surface. The new mode is configured via PenumbraPass.setRenderMode +
 * setParticulateParams; this material stays as a plain depth-aware
 * composite.
 */
export interface PenumbraBackdropUniforms {
  colorTex: THREE.Texture;
  depthTex: THREE.Texture;
  haloOpacity: number;
}

export function createPenumbraBackdropMaterial(
  init: PenumbraBackdropUniforms,
): THREE.ShaderMaterial {
  // GLSL 3.00 (WebGL2). gl_FragDepth requires ES 3.00 — without
  // glslVersion=GLSL3 the depth write is silently dropped and the backdrop
  // quad's geometric NDC depth (near plane) occludes the entire scene.
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      uColorTex: { value: init.colorTex },
      uDepthTex: { value: init.depthTex },
      uHaloOpacity: { value: init.haloOpacity },
    },
    vertexShader: /* glsl */ `
      out vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uColorTex;
      uniform sampler2D uDepthTex;
      uniform float uHaloOpacity;
      in vec2 vUv;
      out vec4 outColor;

      float unpackDepth(vec4 rgba) {
        const float rW = 65536.0 / 16777215.0;
        const float gW =   256.0 / 16777215.0;
        const float bW =     1.0 / 16777215.0;
        return rgba.r * rW * 255.0 + rgba.g * gW * 255.0 + rgba.b * bW * 255.0;
      }

      void main() {
        vec4 color = texture(uColorTex, vUv);
        vec4 depthRGBA = texture(uDepthTex, vUv);

        if (depthRGBA.a < 0.5) {
          gl_FragDepth = 1.0;
        } else {
          gl_FragDepth = clamp(unpackDepth(depthRGBA), 0.0, 1.0);
        }

        outColor = vec4(color.rgb * uHaloOpacity, color.a * uHaloOpacity);
      }
    `,
    transparent: true,
    premultipliedAlpha: true,
    // The halo is a translucent atmospheric overlay, not an opaque
    // occluder. depthTest=true uses gl_FragDepth (Penumbra's surface
    // depth) so closer nodes correctly occlude the halo. depthWrite=false
    // means the halo never writes into the depth buffer — distant nodes
    // already drawn before the backdrop pass remain visible through the
    // halo's alpha, giving the soft "see-through-the-haze" look.
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

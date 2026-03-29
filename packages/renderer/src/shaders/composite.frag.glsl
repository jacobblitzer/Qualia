// Composites the SDF render onto the main scene.
// Supports additive (glow) and alpha blend (opaque) modes.

precision highp float;

varying vec2 vUv;
uniform sampler2D uSceneTexture;
uniform sampler2D uSDFTexture;
uniform float uBlendMode; // 0.0 = additive (glow), 1.0 = alpha blend (opaque)

void main() {
    vec4 scene = texture2D(uSceneTexture, vUv);
    vec4 sdf = texture2D(uSDFTexture, vUv);

    // Smoothly interpolate between additive and alpha blend
    vec3 additive = scene.rgb + sdf.rgb * sdf.a;
    vec3 alphaBlend = mix(scene.rgb, sdf.rgb, sdf.a);
    vec3 color = mix(additive, alphaBlend, uBlendMode);

    gl_FragColor = vec4(color, 1.0);
}

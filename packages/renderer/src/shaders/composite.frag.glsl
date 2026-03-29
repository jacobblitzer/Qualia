// Composites the SDF render (at 1/4 resolution) onto the main scene.
// Uses additive blending for the bioluminescent glow effect.

precision highp float;

varying vec2 vUv;
uniform sampler2D uSceneTexture;
uniform sampler2D uSDFTexture;

void main() {
    vec4 scene = texture2D(uSceneTexture, vUv);
    vec4 sdf = texture2D(uSDFTexture, vUv);

    // Additive blend: SDF glow adds light on top of scene
    vec3 color = scene.rgb + sdf.rgb * sdf.a;

    gl_FragColor = vec4(color, 1.0);
}

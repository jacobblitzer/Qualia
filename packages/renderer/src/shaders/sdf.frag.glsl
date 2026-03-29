// ============================================================================
// Qualia SDF Ray Marching Fragment Shader
// ============================================================================
// Renders bioluminescent metaball fields around node groups.
// Each "field" is a set of nodes whose spherical contributions are blended
// with smooth-min (Quilez polynomial) to create organic metaball shapes.
// ============================================================================

precision highp float;

varying vec2 vUv;

// Camera
uniform mat4 uCameraWorldMatrix;
uniform mat4 uCameraProjectionMatrixInverse;

// Time
uniform float uTime;

// Global field intensity (0 = hidden, 1 = full)
uniform float uGlobalIntensity;

// Node positions: DataTexture where each texel = (x, y, z, fieldIndex)
// fieldIndex encodes which field the node belongs to (0-7, or -1 for none)
uniform sampler2D uNodePositions;
uniform float uNodeCount;
uniform vec2 uNodeTexSize;

// Per-field parameters (up to 8 fields)
// fieldColors[i].rgb = color, fieldColors[i].a = transparency
uniform vec4 uFieldColors[8];
// fieldParams[i].x = radius, fieldParams[i].y = blendFactor (k), fieldParams[i].z = noise, fieldParams[i].w = contourLines (0/1)
uniform vec4 uFieldParams[8];
uniform int uFieldCount;

// Resolution of this render target
uniform vec2 uResolution;

// Constants
const int MAX_STEPS = 64;
const float MAX_DIST = 500.0;
const float EPSILON = 0.02;
const float NORMAL_EPS = 0.005;

// ---- SDF Primitives ----

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

// ---- SDF Operations ----

// Quilez polynomial smooth minimum
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// ---- Data Texture Access ----

vec4 getNodeData(float index) {
    float u = (mod(index, uNodeTexSize.x) + 0.5) / uNodeTexSize.x;
    float v = (floor(index / uNodeTexSize.x) + 0.5) / uNodeTexSize.y;
    return texture2D(uNodePositions, vec2(u, v));
}

// ---- Scene SDF ----
// Evaluates a specific field's SDF at point p.
// Returns (distance, fieldIndex) packed as vec2.

float fieldSDF(vec3 p, int fieldIdx) {
    float d = MAX_DIST;
    float radius = uFieldParams[fieldIdx].x;
    float k = uFieldParams[fieldIdx].y;

    for (float i = 0.0; i < 256.0; i += 1.0) {
        if (i >= uNodeCount) break;
        vec4 nodeData = getNodeData(i);
        int nodeField = int(nodeData.w + 0.5);
        if (nodeField != fieldIdx) continue;

        float nodeDist = sdSphere(p - nodeData.xyz, radius);
        d = smin(d, nodeDist, k);
    }
    return d;
}

// Combined scene: evaluate all fields, return closest
// Also outputs the field color via the out parameter
float sceneSDF(vec3 p, out vec3 hitColor, out float hitAlpha) {
    float minDist = MAX_DIST;
    hitColor = vec3(0.0);
    hitAlpha = 0.0;

    for (int f = 0; f < 8; f++) {
        if (f >= uFieldCount) break;
        float d = fieldSDF(p, f);

        if (d < minDist) {
            minDist = d;
            hitColor = uFieldColors[f].rgb;
            hitAlpha = 1.0 - uFieldColors[f].a; // transparency → opacity
        }
    }
    return minDist;
}

// Simplified SDF for glow (no color tracking)
float sceneSDFSimple(vec3 p) {
    float minDist = MAX_DIST;
    for (int f = 0; f < 8; f++) {
        if (f >= uFieldCount) break;
        float d = fieldSDF(p, f);
        minDist = min(minDist, d);
    }
    return minDist;
}

// ---- Normal Estimation ----

vec3 estimateNormal(vec3 p) {
    vec3 col;
    float a;
    return normalize(vec3(
        sceneSDF(p + vec3(NORMAL_EPS, 0.0, 0.0), col, a) - sceneSDF(p - vec3(NORMAL_EPS, 0.0, 0.0), col, a),
        sceneSDF(p + vec3(0.0, NORMAL_EPS, 0.0), col, a) - sceneSDF(p - vec3(0.0, NORMAL_EPS, 0.0), col, a),
        sceneSDF(p + vec3(0.0, 0.0, NORMAL_EPS), col, a) - sceneSDF(p - vec3(0.0, 0.0, NORMAL_EPS), col, a)
    ));
}

// ---- Ray Marching ----

void main() {
    if (uGlobalIntensity < 0.01 || uFieldCount == 0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Reconstruct ray from camera
    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 rayClip = vec4(ndc, -1.0, 1.0);
    vec4 rayView = uCameraProjectionMatrixInverse * rayClip;
    rayView = vec4(rayView.xy, -1.0, 0.0);

    vec3 rd = normalize((uCameraWorldMatrix * rayView).xyz);
    vec3 ro = (uCameraWorldMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

    // March
    float depth = 0.0;
    float glowAccum = 0.0;
    vec3 glowColor = vec3(0.0);
    bool hit = false;
    vec3 hitColor = vec3(0.0);
    float hitAlpha = 0.0;
    vec3 hitPoint = vec3(0.0);

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * depth;
        vec3 col;
        float alpha;
        float dist = sceneSDF(p, col, alpha);

        // Accumulate glow (inverse-square falloff)
        float glowContrib = 1.0 / (1.0 + dist * dist * 5.0);
        glowAccum += glowContrib;
        glowColor += col * glowContrib;

        if (dist < EPSILON) {
            hit = true;
            hitColor = col;
            hitAlpha = alpha;
            hitPoint = p;
            break;
        }

        depth += dist;
        if (depth >= MAX_DIST) break;
    }

    // Normalize glow
    glowAccum /= float(MAX_STEPS);
    if (glowAccum > 0.001) {
        glowColor /= (glowAccum * float(MAX_STEPS));
    } else {
        glowColor = vec3(0.0);
    }

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    if (hit) {
        vec3 normal = estimateNormal(hitPoint);

        // Fresnel rim effect (stronger glow at glancing angles)
        float fresnel = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);

        // Contour lines (check fieldParams for the closest field)
        // Simple contour: modulate brightness based on distance bands
        float contour = 1.0;
        // (contour lines left for future refinement)

        // Bioluminescent surface shading
        color = hitColor * (0.3 + fresnel * 0.7) * contour;
        alpha = hitAlpha * (0.3 + fresnel * 0.6);
    }

    // Add volumetric glow regardless of surface hit
    color += glowColor * glowAccum * 3.0;
    alpha = max(alpha, glowAccum * 0.8);

    // Subtle pulsing
    float pulse = 0.92 + 0.08 * sin(uTime * 0.7);
    color *= pulse;

    gl_FragColor = vec4(color, alpha * uGlobalIntensity);
}

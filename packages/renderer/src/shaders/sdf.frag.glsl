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

// Opacity / visual controls
uniform float uOpacityBoost;     // 0 = default glow, 1 = solid opaque surfaces
uniform float uFresnelStrength;  // 0 = no rim, 1 = default, 2+ = extreme
uniform float uLightMode;        // 0 = dark theme, 1 = light theme

// Fog and ambient (mirrors scene fog so SDF fields match)
uniform float uFogDensity;      // 0 = no fog, same scale as FogExp2
uniform vec3 uFogColor;         // matches scene background color
uniform float uAmbientBoost;    // 0 = default, positive = brighter SDF

// Global effect overrides (-1 = use per-field, 0+ = override all)
uniform float uGlobalNoiseOverride;   // -1 = per-field, 0-1 = global noise amount
uniform float uGlobalContourOverride; // -1 = per-field, 0 = off, 1 = on

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

// ---- 3D Noise (Inigo Quilez value noise) ----

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    return mix(
        mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
        f.z
    );
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise3D(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// ---- Data Texture Access ----

vec4 getNodeData(float index) {
    float u = (mod(index, uNodeTexSize.x) + 0.5) / uNodeTexSize.x;
    float v = (floor(index / uNodeTexSize.x) + 0.5) / uNodeTexSize.y;
    return texture2D(uNodePositions, vec2(u, v));
}

// ---- Scene SDF ----

float fieldSDF(vec3 p, int fieldIdx) {
    float d = MAX_DIST;
    float radius = uFieldParams[fieldIdx].x;
    float k = uFieldParams[fieldIdx].y;
    float noiseAmount = uGlobalNoiseOverride >= 0.0 ? uGlobalNoiseOverride : uFieldParams[fieldIdx].z;

    for (float i = 0.0; i < 256.0; i += 1.0) {
        if (i >= uNodeCount) break;
        vec4 nodeData = getNodeData(i);
        int nodeField = int(nodeData.w + 0.5);
        if (nodeField != fieldIdx) continue;

        float nodeDist = sdSphere(p - nodeData.xyz, radius);
        d = smin(d, nodeDist, k);
    }

    // Surface noise displacement
    if (noiseAmount > 0.001) {
        float n = fbm(p * 0.15 + uTime * 0.05) * 2.0 - 1.0;
        d += n * noiseAmount * radius * 0.4;
    }

    return d;
}

// Combined scene: evaluate all fields, return closest
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
            hitAlpha = 1.0 - uFieldColors[f].a; // transparency -> opacity
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

        // Fresnel rim effect — strength controllable
        float fresnelPow = 2.0 + uFresnelStrength;
        float fresnel = pow(1.0 - max(dot(normal, -rd), 0.0), fresnelPow);

        // Contour lines — find which field we hit
        float contour = 1.0;
        int hitFieldIdx = -1;
        float minFieldDist = MAX_DIST;
        for (int f = 0; f < 8; f++) {
            if (f >= uFieldCount) break;
            float fd = fieldSDF(hitPoint, f);
            if (fd < minFieldDist) {
                minFieldDist = fd;
                hitFieldIdx = f;
            }
        }

        bool showContours = uGlobalContourOverride >= 0.0
            ? (uGlobalContourOverride > 0.5)
            : (hitFieldIdx >= 0 && uFieldParams[hitFieldIdx].w > 0.5);
        if (hitFieldIdx >= 0 && showContours) {
            float contourSpacing = uFieldParams[hitFieldIdx].x * 0.3;
            float contourWidth = 0.15;
            float contourDist = mod(length(hitPoint) + uTime * 0.3, contourSpacing);
            float contourLine = smoothstep(contourWidth, contourWidth + 0.05, contourDist) *
                               (1.0 - smoothstep(contourSpacing - contourWidth - 0.05, contourSpacing - contourWidth, contourDist));
            contour = mix(0.4, 1.0, contourLine);
        }

        // Surface shading — boost base when going opaque
        float baseShade = mix(0.3, 0.8, uOpacityBoost);
        float fresnelShade = mix(0.7, 0.2, uOpacityBoost);
        color = hitColor * (baseShade + fresnel * fresnelShade) * contour;

        // Alpha — allow full opacity when boost is high
        float baseAlpha = mix(0.3, 1.0, uOpacityBoost);
        float fresnelAlpha = mix(0.6, 0.0, uOpacityBoost);
        alpha = hitAlpha * (baseAlpha + fresnel * fresnelAlpha);
    }

    // Volumetric glow — reduce when going opaque
    float glowStrength = mix(3.0, 0.5, uOpacityBoost);
    color += glowColor * glowAccum * glowStrength;
    float glowAlphaStrength = mix(0.8, 0.2, uOpacityBoost);
    alpha = max(alpha, glowAccum * glowAlphaStrength);

    // Subtle pulsing
    float pulse = 0.92 + 0.08 * sin(uTime * 0.7);
    color *= pulse;

    // Apply fog to SDF output (matches scene fog behavior)
    if (uFogDensity > 0.0) {
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
        color = mix(color, uFogColor, fogFactor);
        alpha *= (1.0 - fogFactor);
    }

    // Apply ambient boost (brightens SDF surface uniformly)
    if (uAmbientBoost > 0.0) {
        color *= (1.0 + uAmbientBoost * 0.5);
    }

    // Light mode: boost saturation and darken for contrast on light backgrounds
    if (uLightMode > 0.5) {
        color = pow(color, vec3(0.7));
        color *= 1.3;
    }

    gl_FragColor = vec4(color, alpha * uGlobalIntensity);
}

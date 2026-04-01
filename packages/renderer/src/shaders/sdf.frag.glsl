// ============================================================================
// Qualia SDF Ray Marching Fragment Shader
// ============================================================================
precision highp float;

varying vec2 vUv;

uniform mat4 uCameraWorldMatrix;
uniform mat4 uCameraProjectionMatrixInverse;
uniform float uTime;
uniform float uGlobalIntensity;

uniform sampler2D uNodePositions;
uniform float uNodeCount;
uniform vec2 uNodeTexSize;

uniform vec4 uFieldColors[8];
uniform vec4 uFieldParams[8];
uniform int uFieldCount;
uniform vec2 uResolution;

uniform float uOpacityBoost;
uniform float uFresnelStrength;
uniform float uLightMode;

uniform float uSpecularStrength;
uniform float uRoughness;
uniform float uMetalness;

uniform float uFogDensity;
uniform vec3 uFogColor;
uniform float uAmbientBoost;

uniform float uGlobalNoiseOverride;
uniform float uGlobalContourOverride;

uniform float uWarpEnabled;
uniform float uWarpAmount;
uniform float uWarpScale;
uniform float uWarpSpeed;

uniform float uOnionEnabled;
uniform float uOnionLayers;
uniform float uOnionThickness;
uniform float uOnionGap;

uniform float uInteriorFogEnabled;
uniform float uInteriorFogDensity;

uniform float uColorBlendSharpness;

uniform float uNoiseScale;
uniform float uNoiseSpeed;
uniform float uContourSpacing;
uniform float uContourWidth;
uniform float uContourContrast;

const int MAX_STEPS = 64;
const float MAX_DIST = 500.0;
const float EPSILON = 0.02;
const float NORMAL_EPS = 0.005;

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
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

vec4 getNodeData(float index) {
    float u = (mod(index, uNodeTexSize.x) + 0.5) / uNodeTexSize.x;
    float v = (floor(index / uNodeTexSize.x) + 0.5) / uNodeTexSize.y;
    return texture2D(uNodePositions, vec2(u, v));
}

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
        float nScale = uNoiseScale > 0.0 ? uNoiseScale : 0.15;
        float nSpeed = uNoiseSpeed > 0.0 ? uNoiseSpeed : 0.05;
        float n = fbm(p * nScale + uTime * nSpeed) * 2.0 - 1.0;
        d += n * noiseAmount * radius * 0.4;
    }

    return d;
}

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
            hitAlpha = 1.0 - uFieldColors[f].a;
        }
    }

    // Onion layers
    if (uOnionEnabled > 0.5 && minDist < MAX_DIST * 0.5) {
        float period = uOnionThickness + uOnionGap;
        float maxShellDist = period * uOnionLayers;
        if (minDist < maxShellDist) {
            minDist = abs(mod(minDist + period * 0.5, period) - period * 0.5) - uOnionThickness * 0.5;
        }
    }

    return minDist;
}

float sceneSDFSimple(vec3 p) {
    float minDist = MAX_DIST;
    for (int f = 0; f < 8; f++) {
        if (f >= uFieldCount) break;
        float d = fieldSDF(p, f);
        minDist = min(minDist, d);
    }
    return minDist;
}

vec3 estimateNormal(vec3 p) {
    vec3 col;
    float a;
    return normalize(vec3(
        sceneSDF(p + vec3(NORMAL_EPS, 0.0, 0.0), col, a) - sceneSDF(p - vec3(NORMAL_EPS, 0.0, 0.0), col, a),
        sceneSDF(p + vec3(0.0, NORMAL_EPS, 0.0), col, a) - sceneSDF(p - vec3(0.0, NORMAL_EPS, 0.0), col, a),
        sceneSDF(p + vec3(0.0, 0.0, NORMAL_EPS), col, a) - sceneSDF(p - vec3(0.0, 0.0, NORMAL_EPS), col, a)
    ));
}

void main() {
    if (uGlobalIntensity < 0.01 || uFieldCount == 0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    vec2 ndc = vUv * 2.0 - 1.0;
    vec4 rayClip = vec4(ndc, -1.0, 1.0);
    vec4 rayView = uCameraProjectionMatrixInverse * rayClip;
    rayView = vec4(rayView.xy, -1.0, 0.0);

    vec3 rd = normalize((uCameraWorldMatrix * rayView).xyz);
    vec3 ro = (uCameraWorldMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

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
        vec3 viewDir = -rd;

        float NdotV = max(dot(normal, viewDir), 0.0);
        float fresnelPow = 2.0 + uFresnelStrength;
        float fresnel = pow(1.0 - NdotV, fresnelPow);

        // Contour lines
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
            float cSpacing = uContourSpacing > 0.0 ? uContourSpacing : uFieldParams[hitFieldIdx].x * 0.3;
            float cWidth = uContourWidth > 0.0 ? uContourWidth : 0.15;
            float contourDist = mod(length(hitPoint) + uTime * 0.3, cSpacing);
            float contourLine = smoothstep(cWidth, cWidth + 0.05, contourDist) *
                               (1.0 - smoothstep(cSpacing - cWidth - 0.05, cSpacing - cWidth, contourDist));
            float darkLevel = mix(0.4, 0.1, uContourContrast);
            contour = mix(darkLevel, 1.0, contourLine);
        }

        // Shading
        float baseShade = mix(0.3, 0.8, uOpacityBoost);
        float fresnelShade = mix(0.7, 0.2, uOpacityBoost);

        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float NdotL = max(dot(normal, lightDir), 0.0);
        float diffuse = mix(0.5, 1.0, NdotL);

        color = hitColor * diffuse * (baseShade + fresnel * fresnelShade) * contour;

        // Specular highlight (only when enabled)
        if (uSpecularStrength > 0.01) {
            vec3 halfDir = normalize(lightDir + viewDir);
            float NdotH = max(dot(normal, halfDir), 0.0);
            float shininess = mix(256.0, 4.0, uRoughness);
            float spec = pow(NdotH, shininess) * uSpecularStrength;
            vec3 specColor = mix(vec3(1.0), hitColor, uMetalness);
            color += specColor * spec * NdotL;
        }

        float baseAlpha = mix(0.3, 1.0, uOpacityBoost);
        float fresnelAlpha = mix(0.6, 0.0, uOpacityBoost);
        alpha = hitAlpha * (baseAlpha + fresnel * fresnelAlpha);
    }

    // Volumetric glow
    float glowStrength = mix(3.0, 0.5, uOpacityBoost);
    color += glowColor * glowAccum * glowStrength;
    float glowAlphaStrength = mix(0.8, 0.2, uOpacityBoost);
    alpha = max(alpha, glowAccum * glowAlphaStrength);

    float pulse = 0.92 + 0.08 * sin(uTime * 0.7);
    color *= pulse;

    if (uFogDensity > 0.0) {
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
        color = mix(color, uFogColor, fogFactor);
        alpha *= (1.0 - fogFactor);
    }

    if (uAmbientBoost > 0.0) {
        color *= (1.0 + uAmbientBoost * 0.5);
    }

    if (uLightMode > 0.5) {
        color = pow(color, vec3(0.7));
        color *= 1.3;
    }

    gl_FragColor = vec4(color, alpha * uGlobalIntensity);
}

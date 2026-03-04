const canvas = document.getElementById('c');
const regl = createREGL({
  canvas,
  pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
});

let params = {
  seed: 0,
  threshold: 0.3,
  freq: 0.3,
  octaves: 3,
  gain: 0.8,
  lacunarity: 2.0,
  maxSteps: 200,
  maxDist: 80.0,
  stepSize: 0.08,
  startPos: [0, 0, 0],
  safeRadius: 0
};

new URLSearchParams(location.search).forEach((v, k) => {
  if (k in params) params[k] = Number(v);
});

let camPos = [0, 0, -5];
let camFwd = [0, 0, 1];
let camRight = [1, 0, 0];
let camUp = [0, 1, 0];

const draw = regl({
  vert: `
  precision highp float;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0.0, 1.0);
  }`,

  frag: `
  precision highp float;
  varying vec2 vUv;

  uniform vec2  uRes;
  uniform vec3  uSeedVec;
  uniform float uThreshold;
  uniform float uFreq;
  uniform int   uOctaves;
  uniform float uGain;
  uniform float uLacunarity;
  uniform int   uMaxSteps;
  uniform float uMaxDist;
  uniform float uStep;
  uniform vec3  uCamPos;
  uniform vec3  uCamFwd;
  uniform vec3  uCamRight;
  uniform vec3  uCamUp;
  uniform vec3  uStartPos;
  uniform float uSafeRadius;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + uSeedVec);
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float valueNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float n000 = hash31(i + vec3(0,0,0));
    float n100 = hash31(i + vec3(1,0,0));
    float n010 = hash31(i + vec3(0,1,0));
    float n110 = hash31(i + vec3(1,1,0));
    float n001 = hash31(i + vec3(0,0,1));
    float n101 = hash31(i + vec3(1,0,1));
    float n011 = hash31(i + vec3(0,1,1));
    float n111 = hash31(i + vec3(1,1,1));
    vec3 u = f*f*(3.0-2.0*f);
    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
  }

  float fbm(vec3 p) {
    float amp = 0.5;
    float f = uFreq;
    float sum = 0.0;
    for (int o = 0; o < 8; ++o) {
      if (o >= uOctaves) break;
      sum += amp * valueNoise(p * f);
      f *= uLacunarity;
      amp *= uGain;
    }
    return sum;
  }

  float field(vec3 p) {
    float n = uThreshold - fbm(p);
    if (uSafeRadius > 0.0) {
      float d = length(p - uStartPos);
      float safe = 1.0 - smoothstep(0.0, uSafeRadius, d);
      n -= safe * 2.0;
    }
    return n;
  }

  vec3 grad(vec3 p) {
    float e = 0.002;
    float c = field(p);
    return normalize(vec3(
      field(p + vec3(e,0,0)) - c,
      field(p + vec3(0,e,0)) - c,
      field(p + vec3(0,0,e)) - c
    ));
  }

  void main() {
    float asp = uRes.x / uRes.y;
    vec2 uv = (vUv*2.0 - 1.0);
    uv.x *= asp;

    vec3 ro = uCamPos;
    vec3 rd = normalize(uCamRight * uv.x + uCamUp * uv.y + uCamFwd * 1.6);

    float t = 0.0;
    float prevVal = field(ro);
    float hitT = -1.0;
    for (int i=0; i<512; ++i) {
      if (i >= uMaxSteps) break;
      vec3 p = ro + rd * t;
      float val = field(p);
      if (val * prevVal < 0.0) {
        float a = t - uStep, b = t;
        for (int j=0; j<4; ++j) {
          float m = 0.5*(a+b);
          float mv = field(ro + rd*m);
          if (mv * val < 0.0) { a = m; } else { b = m; }
        }
        hitT = 0.5*(a+b);
        break;
      }
      prevVal = val;
      t += uStep;
      if (t > uMaxDist) break;
    }

    vec3 col = vec3(0.0);
    if (hitT > 0.0) {
      vec3 p = ro + rd * hitT;
      vec3 n = grad(p);

      vec3 ld1 = normalize(vec3(0.6, 0.7, 0.5));
      vec3 ld2 = normalize(vec3(-0.4, 0.3, 0.8));
      vec3 ld3 = normalize(vec3(0.2, -0.8, 0.4));

      float diff1 = clamp(dot(n, ld1), 0.0, 1.0);
      float diff2 = clamp(dot(n, ld2), 0.0, 1.0) * 0.3;
      float diff3 = clamp(dot(n, ld3), 0.0, 1.0) * 0.2;

      float ao = clamp(0.4 - 0.6 * field(p + n*0.3), 0.0, 1.0);

      vec3 rock = vec3(0.45, 0.42, 0.38);
      vec3 lightCol1 = vec3(1.0, 0.95, 0.8);
      vec3 lightCol2 = vec3(0.8, 0.9, 1.0);
      vec3 lightCol3 = vec3(0.9, 0.85, 0.7);

      vec3 totalLight = lightCol1 * diff1 + lightCol2 * diff2 + lightCol3 * diff3;
      col = rock * (0.2 + 0.8 * totalLight) * ao;

      float sss = clamp(0.1 + 0.3 * (1.0 - abs(dot(n, rd))), 0.0, 1.0);
      col += vec3(0.1, 0.08, 0.06) * sss;
    } else {
      float fogFactor = 1.0 / uMaxDist;
      float v = exp(-fogFactor * t);
      vec3 fogColor = mix(vec3(0.1,0.15,0.2), vec3(0.0,0.0,0.0), v);
      float distanceRatio = t / uMaxDist;
      vec3 distanceColor = vec3(0.2 * distanceRatio, 0.1 * distanceRatio, 0.05 * distanceRatio);
      col = fogColor + distanceColor;
    }

    col = col / (1.0 + col);
    gl_FragColor = vec4(pow(col, vec3(0.95)), 1.0);
  }`,

  attributes: {
    position: [-1, -1, 3, -1, -1, 3],
  },
  uniforms: {
    uRes: ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
    uSeedVec: () => {
      const s = params.seed | 0;
      const x = ((s * 16807) % 2147483647) / 2147483647;
      const y = ((s * 48271) % 2147483647) / 2147483647;
      const z = ((s * 69621) % 2147483647) / 2147483647;
      return [x, y, z];
    },
    uThreshold: () => params.threshold,
    uFreq: () => params.freq,
    uOctaves: () => params.octaves,
    uGain: () => params.gain,
    uLacunarity: () => params.lacunarity,
    uMaxSteps: () => params.maxSteps,
    uMaxDist: () => params.maxDist,
    uStep: () => params.stepSize,
    uCamPos: () => camPos,
    uCamFwd: () => camFwd,
    uCamRight: () => camRight,
    uCamUp: () => camUp,
    uStartPos: () => params.startPos,
    uSafeRadius: () => params.safeRadius,
  },
  count: 3
});

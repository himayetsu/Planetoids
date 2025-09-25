const canvas = document.getElementById('c');
const regl = createREGL({canvas});

//starting params
let params = {
  seed: 0,          
  threshold: 0.3,       // surface iso threshold; higher = more open space
  freq: 0.3,            // base noise frequency
  octaves: 3,           // fbm octaves
  gain: 0.8,            // fbm amplitude falloff
  lacunarity: 2.0,      // fbm frequency growth
  camDist: 3.0,         // camera distance from origin
  maxSteps: 1024,       // ray steps
  maxDist: 200.0,       // max march distance
  stepSize: 0.01        // base step size
};

// simple UI via URL: ?seed=42&threshold=0.12 etc.
new URLSearchParams(location.search).forEach((v,k)=>{
  if (k in params) params[k] = Number(v);
});

// Debug: log the initial maxDist value
console.log('cave-generator.js loaded, params.maxDist:', params.maxDist);

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

  uniform float uTime;
  uniform vec2  uRes;
  uniform vec3  uSeedVec;     // derived from seed
  uniform float uThreshold;
  uniform float uFreq;
  uniform float uCamDist;
  uniform int   uOctaves;
  uniform float uGain;
  uniform float uLacunarity;
  uniform int   uMaxSteps;
  uniform float uMaxDist;
  uniform float uStep;
  uniform float uCamAngle;
  uniform float uCamPitch;
  uniform vec3 uCamPos;

  // Hash helpers (seeded)
  float hash31(vec3 p) {
    // seed-injected hash: tweak constants to taste
    p = fract(p * 0.3183099 + uSeedVec);
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  // Trilinear value noise (seeded)
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
    vec3 u = f*f*(3.0-2.0*f); // smoothstep
    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);
    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);
    return mix(nxy0, nxy1, u.z);
  }

  // fBm
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

  // Signed field: positive in "rock", negative in "air" (or vice versa).
  // Here we subtract threshold to form caves where fbm < threshold
  float field(vec3 p) {
    // slight time wobble to show it's dynamic; remove uTime if you want static
    float n = fbm(p + vec3(0.0, 0.0, 0.15*uTime));
    return n - uThreshold;
  }

  // Numeric gradient for normal
  vec3 grad(vec3 p) {
    float e = 0.002;
    float c = field(p);
    return normalize(vec3(
      field(p + vec3(e,0,0)) - c,
      field(p + vec3(0,e,0)) - c,
      field(p + vec3(0,0,e)) - c
    ));
  }

  // Basic camera
  mat3 lookAt(vec3 ro, vec3 ta) {
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(vec3(0.0,1.0,0.0), ww));
    vec3 vv = cross(ww, uu);
    return mat3(uu, vv, ww);
  }

  void main() {
    // Camera setup
    float asp = uRes.x / uRes.y;
    vec2 uv = (vUv*2.0 - 1.0);
    uv.x *= asp;

    // Dynamic camera position with WASD movement
    vec3 ro = uCamPos;
    
    // Calculate look direction with proper pitch rotation
    vec3 forward = vec3(sin(uCamAngle), 0.0, cos(uCamAngle));
    vec3 right = vec3(cos(uCamAngle), 0.0, -sin(uCamAngle));
    vec3 up = vec3(0.0, 1.0, 0.0);
    
    // Apply pitch rotation
    float cosPitch = cos(uCamPitch);
    float sinPitch = sin(uCamPitch);
    forward = normalize(vec3(forward.x * cosPitch, sinPitch, forward.z * cosPitch));
    
    vec3 ta = ro + forward;
    mat3 cam = lookAt(ro, ta);
    vec3 rd = normalize(cam * normalize(vec3(uv, 1.6)));

    // Ray-march with fixed steps + zero-crossing refine
    float t = 0.0;
    float prevVal = field(ro);
    float hitT = -1.0;
    for (int i=0; i<512; ++i) {
      if (i >= uMaxSteps) break;
      vec3 p = ro + rd * t;
      float val = field(p);
      if (val * prevVal < 0.0) { // crossed the isosurface
        // single bisection refine
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
      
      // Enhanced lighting with multiple light sources
      vec3 ld1 = normalize(vec3(0.6, 0.7, 0.5));  // main light
      vec3 ld2 = normalize(vec3(-0.4, 0.3, 0.8)); // secondary light
      vec3 ld3 = normalize(vec3(0.2, -0.8, 0.4));  // fill light
      
      float diff1 = clamp(dot(n, ld1), 0.0, 1.0);
      float diff2 = clamp(dot(n, ld2), 0.0, 1.0) * 0.3;
      float diff3 = clamp(dot(n, ld3), 0.0, 1.0) * 0.2;
      
      // Ambient occlusion
      float ao = clamp(0.4 + 0.6 * field(p + n*0.3), 0.0, 1.0);
      
      // Rock color with slight variation
      vec3 rock = vec3(0.45, 0.42, 0.38);
      vec3 lightCol1 = vec3(1.0, 0.95, 0.8);   // warm main light
      vec3 lightCol2 = vec3(0.8, 0.9, 1.0);    // cool secondary
      vec3 lightCol3 = vec3(0.9, 0.85, 0.7);    // warm fill
      
      vec3 totalLight = lightCol1 * diff1 + lightCol2 * diff2 + lightCol3 * diff3;
      col = rock * (0.2 + 0.8 * totalLight) * ao;
      
      // Add some subsurface scattering effect
      float sss = clamp(0.1 + 0.3 * (1.0 - abs(dot(n, rd))), 0.0, 1.0);
      col += vec3(0.1, 0.08, 0.06) * sss;
    } else {
      // Enhanced background with depth fog - make it more visible
      float fogFactor = 1.0 / uMaxDist; // Fog density based on max distance
      float v = exp(-fogFactor * t);
      vec3 fogColor = mix(vec3(0.1,0.15,0.2), vec3(0.0,0.0,0.0), v);
      
      // Add distance-based color to make view distance more obvious
      float distanceRatio = t / uMaxDist;
      vec3 distanceColor = vec3(0.2 * distanceRatio, 0.1 * distanceRatio, 0.05 * distanceRatio);
      col = fogColor + distanceColor;
    }

    // subtle tonemap
    col = col / (1.0 + col);
    gl_FragColor = vec4(pow(col, vec3(0.95)), 1.0);
  }`,

  attributes: {
    position: [
      -1, -1,
       3, -1,
      -1,  3
    ],
  },
  uniforms: {
    uTime: ({time}) => time,
    uRes:  ({viewportWidth, viewportHeight}) => [viewportWidth, viewportHeight],
    uSeedVec: () => {
      // deterministic vector from integer seed
      const s = params.seed|0;
      const x = ((s * 16807) % 2147483647) / 2147483647;
      const y = ((s * 48271) % 2147483647) / 2147483647;
      const z = ((s * 69621) % 2147483647) / 2147483647;
      return [x, y, z];
    },
    uThreshold: () => params.threshold,
    uFreq: () => params.freq,
    uCamDist: () => params.camDist,
    uOctaves: () => params.octaves,
    uGain: () => params.gain,
    uLacunarity: () => params.lacunarity,
    uMaxSteps: () => params.maxSteps,
    uMaxDist: () => params.maxDist,
    uStep: () => params.stepSize,
    uCamAngle: () => cameraAngle,
    uCamPitch: () => cameraPitch,
    uCamPos: () => [cameraX, cameraY, cameraZ]
  },
  count: 3
});

regl.frame(() => {
  updateCamera(); // Update camera position based on WASD keys
  
  // Debug: occasionally log camera position
  if (Math.random() < 0.001) {
    console.log('Camera at:', cameraX, cameraY, cameraZ, 'Angle:', cameraAngle, 'Pitch:', cameraPitch);
  }
  
  regl.clear({color: [0,0,0,1], depth: 1});
  draw();
});

//dev helpers in console:
window.__cave = params; // tweak live: __cave.seed=999; __cave.threshold=0.1;

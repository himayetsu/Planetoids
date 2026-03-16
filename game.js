// ============================================================
//  PLANETOIDS — Game Engine
// ============================================================

// ===================== VECTOR / MATRIX MATH =====================

const V3 = {
  add:   (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  sub:   (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
  scale: (v, s) => [v[0]*s, v[1]*s, v[2]*s],
  dot:   (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
  cross: (a, b) => [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0]
  ],
  len:   (v) => Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]),
  normalize: (v) => {
    const l = V3.len(v);
    return l > 1e-6 ? [v[0]/l, v[1]/l, v[2]/l] : [0, 0, 1];
  },
  lerp: (a, b, t) => [
    a[0]+(b[0]-a[0])*t,
    a[1]+(b[1]-a[1])*t,
    a[2]+(b[2]-a[2])*t
  ],
  dist: (a, b) => V3.len(V3.sub(a, b)),
};

function rotateAroundAxis(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = V3.dot(axis, v);
  const cr = V3.cross(axis, v);
  return [
    v[0]*c + cr[0]*s + axis[0]*d*(1-c),
    v[1]*c + cr[1]*s + axis[1]*d*(1-c),
    v[2]*c + cr[2]*s + axis[2]*d*(1-c)
  ];
}

function mat4Perspective(fov, aspect, near, far) {
  const f = 1.0 / Math.tan(fov * 0.5);
  const nf = 1.0 / (near - far);
  const out = new Float32Array(16);
  out[0]  = f / aspect;
  out[5]  = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function mat4View(pos, fwd, right, up) {
  return new Float32Array([
    right[0], up[0], -fwd[0], 0,
    right[1], up[1], -fwd[1], 0,
    right[2], up[2], -fwd[2], 0,
    -V3.dot(right, pos), -V3.dot(up, pos), V3.dot(fwd, pos), 1
  ]);
}

function mat4Mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k];
      o[c*4+r] = s;
    }
  return o;
}

// ===================== NOISE PORT (JS, for collision) =====================

let seedVec = [0, 0, 0];

function updateSeedVec() {
  const s = params.seed | 0;
  seedVec[0] = ((s * 16807) % 2147483647) / 2147483647;
  seedVec[1] = ((s * 48271) % 2147483647) / 2147483647;
  seedVec[2] = ((s * 69621) % 2147483647) / 2147483647;
}

function fract(x) { return x - Math.floor(x); }

function hash31(px, py, pz) {
  let x = fract(px * 0.3183099 + seedVec[0]);
  let y = fract(py * 0.3183099 + seedVec[1]);
  let z = fract(pz * 0.3183099 + seedVec[2]);
  const d = x*(y+19.19) + y*(z+19.19) + z*(x+19.19);
  x += d; y += d; z += d;
  return fract((x + y) * z);
}

function valueNoise(px, py, pz) {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy), uz = fz*fz*(3-2*fz);
  const n000 = hash31(ix,   iy,   iz);
  const n100 = hash31(ix+1, iy,   iz);
  const n010 = hash31(ix,   iy+1, iz);
  const n110 = hash31(ix+1, iy+1, iz);
  const n001 = hash31(ix,   iy,   iz+1);
  const n101 = hash31(ix+1, iy,   iz+1);
  const n011 = hash31(ix,   iy+1, iz+1);
  const n111 = hash31(ix+1, iy+1, iz+1);
  const nx00 = n000 + (n100-n000)*ux;
  const nx10 = n010 + (n110-n010)*ux;
  const nx01 = n001 + (n101-n001)*ux;
  const nx11 = n011 + (n111-n011)*ux;
  const nxy0 = nx00 + (nx10-nx00)*uy;
  const nxy1 = nx01 + (nx11-nx01)*uy;
  return nxy0 + (nxy1-nxy0)*uz;
}

function fbmJS(px, py, pz) {
  let amp = 0.5, freq = params.freq, sum = 0;
  for (let o = 0; o < params.octaves; o++) {
    sum += amp * valueNoise(px*freq, py*freq, pz*freq);
    freq *= params.lacunarity;
    amp *= params.gain;
  }
  return sum;
}

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fieldJS(x, y, z) {
  let n = params.threshold - fbmJS(x, y, z);
  if (params.safeRadius > 0) {
    const dx = x - params.startPos[0];
    const dy = y - params.startPos[1];
    const dz = z - params.startPos[2];
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
    const safe = 1 - smoothstepJS(0, params.safeRadius, d);
    n -= safe * 2.0;
  }
  return n;
}

// ===================== GAME STATE =====================

const GS = { MENU: 0, PLAYING: 1, DEAD: 2 };
let gameState = GS.MENU;
let fpCamera = false;
let score = 0;
let highScore = parseInt(localStorage.getItem('planetoidHigh') || '0');
let startPos = [0, 0, 0];
let lastDisplayedScore = -1;

// ===================== SHIP =====================

const ship = {
  pos:     [0, 0, 0],
  forward: [0, 0, 1],
  up:      [0, 1, 0],
  right:   [1, 0, 0],
  speed:      0,
  baseSpeed:  7,
  maxSpeed:   25,
  minSpeed:   3,
  turnRate:   1.8,
  visualRoll: 0,
};

// Ship wireframe model (local space, nose at +Z)
const SHIP_VERTS = [
  [ 0,     0,     0.4 ],   // 0  nose
  [-0.25,  0,    -0.2 ],   // 1  left wing
  [ 0.25,  0,    -0.2 ],   // 2  right wing
  [ 0,     0.09,  0   ],   // 3  cockpit
  [ 0,     0.04, -0.3 ],   // 4  tail
];
const SHIP_EDGES = [0,1, 0,2, 0,3, 1,2, 1,3, 2,3, 1,4, 2,4, 3,4];

const shipPosBuf  = regl.buffer(new Float32Array(SHIP_VERTS.flat()));
const shipEdgeBuf = regl.elements({ primitive: 'lines', data: new Uint16Array(SHIP_EDGES) });

// Engine flame (dynamic)
const flamePosBuf  = regl.buffer({ type: 'float32', length: 9 * 4, usage: 'dynamic' });
const flameEdgeBuf = regl.elements({ primitive: 'lines', data: new Uint16Array([0,1, 1,2]) });

// Generic line-drawing command
const drawLineCmd = regl({
  vert: `
    precision highp float;
    attribute vec3 position;
    uniform mat4 uMVP;
    void main() { gl_Position = uMVP * vec4(position, 1.0); }`,
  frag: `
    precision highp float;
    uniform vec3 uColor;
    void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  attributes: { position: regl.prop('positions') },
  elements:  regl.prop('elements'),
  uniforms: {
    uMVP:   regl.prop('mvp'),
    uColor: regl.prop('color'),
  },
  depth: { enable: false },
});

// ===================== INPUT =====================

const keys = {};
let mouseNX = 0.5, mouseNY = 0.5;

canvas.addEventListener('mousemove', (e) => {
  if (gameState !== GS.PLAYING) return;
  mouseNX = e.clientX / window.innerWidth;
  mouseNY = e.clientY / window.innerHeight;
  const ch = document.getElementById('crosshair');
  ch.style.left = e.clientX + 'px';
  ch.style.top  = e.clientY + 'px';
});

document.addEventListener('keydown', (e) => {
  if (document.activeElement.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys[k] = true;

  if (k === ' ') {
    e.preventDefault();
    if (gameState === GS.MENU || gameState === GS.DEAD) startGame();
  }
  if (k === 'c' && gameState === GS.PLAYING) fpCamera = !fpCamera;
  if (gameState === GS.PLAYING && ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) {
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ===================== FIND SAFE SPAWN =====================

function findStartPosition() {
  updateSeedVec();
  if (fieldJS(0, 0, 0) < -0.05) return [0, 0, 0];
  for (let r = 0.5; r < 50; r += 0.5) {
    for (let a = 0; a < 8; a++) {
      for (let b = 0; b < 4; b++) {
        const theta = a * Math.PI / 4;
        const phi   = (b - 1.5) * Math.PI / 4;
        const x = Math.cos(theta) * Math.cos(phi) * r;
        const y = Math.sin(phi) * r;
        const z = Math.sin(theta) * Math.cos(phi) * r;
        if (fieldJS(x, y, z) < -0.05) return [x, y, z];
      }
    }
  }
  return [0, 0, 0];
}

function findBestDirection(pos) {
  const dirs = [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]];
  let best = [0, 0, 1], bestD = 0;
  for (const dir of dirs) {
    let d = 0;
    for (let t = 0.2; t < 4; t += 0.2) {
      const p = V3.add(pos, V3.scale(dir, t));
      if (fieldJS(p[0], p[1], p[2]) > 0) break;
      d = t;
    }
    if (d > bestD) { bestD = d; best = dir; }
  }
  return best;
}

// ===================== GAME FLOW =====================

function startGame() {
  params.seed = Math.floor(Math.random() * 9999) + 1;
  updateSeedVec();

  params.safeRadius = 0;
  startPos          = findStartPosition();
  params.startPos   = [...startPos];
  params.safeRadius = 5.0;

  const fwd      = findBestDirection(startPos);
  ship.pos       = [...startPos];
  ship.forward   = [...fwd];
  ship.up        = [0, 1, 0];
  // handle case when forward is near vertical
  if (Math.abs(V3.dot(ship.forward, ship.up)) > 0.95) ship.up = [0, 0, 1];
  ship.right     = V3.normalize(V3.cross(ship.up, ship.forward));
  ship.up        = V3.normalize(V3.cross(ship.forward, ship.right));
  ship.speed     = ship.baseSpeed;
  ship.visualRoll = 0;
  fpCamera = false;

  smoothCamUp = [0, 1, 0];
  camPos    = V3.add(ship.pos, V3.add(V3.scale(ship.forward, -2), V3.scale(ship.up, 0.5)));
  camTarget = V3.add(ship.pos, V3.scale(ship.forward, 4));
  computeCamBasis();

  score = 0;
  lastDisplayedScore = -1;
  mouseNX = 0.5;
  mouseNY = 0.5;
  gameState = GS.PLAYING;

  document.getElementById('startScreen').style.display    = 'none';
  document.getElementById('gameOverScreen').style.display = 'none';
  document.getElementById('liveScore').style.display      = 'block';
  const ch = document.getElementById('crosshair');
  ch.style.display = 'block';
  ch.style.left = (window.innerWidth / 2) + 'px';
  ch.style.top  = (window.innerHeight / 2) + 'px';
  document.getElementById('seedDisplay').textContent       = params.seed;
  canvas.style.cursor = 'none';
}

function endGame() {
  gameState = GS.DEAD;

  if (score > highScore) {
    highScore = Math.floor(score);
    localStorage.setItem('planetoidHigh', highScore.toString());
  }

  const flash = document.getElementById('deathFlash');
  flash.style.opacity = '1';
  setTimeout(() => { flash.style.opacity = '0'; }, 250);

  document.getElementById('finalScore').textContent   = Math.floor(score);
  document.getElementById('goHighScore').textContent   = Math.floor(highScore);
  document.getElementById('gameOverScreen').style.display = 'flex';
  document.getElementById('liveScore').style.display      = 'none';
  document.getElementById('crosshair').style.display      = 'none';
  canvas.style.cursor = '';
}

// ===================== SHIP UPDATE =====================

let camTarget = [0, 0, 5];

function updateShip(dt) {
  // --- throttle ---
  if (keys['w'] || keys['arrowup'])
    ship.speed = Math.min(ship.speed + 1.8 * dt, ship.maxSpeed);
  else if (keys['s'] || keys['arrowdown'])
    ship.speed = Math.max(ship.speed - 1.8 * dt, ship.minSpeed);
  else
    ship.speed += (ship.baseSpeed - ship.speed) * 2.0 * dt;

  // --- mouse aim → target direction ---
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const mx = (mouseNX * 2 - 1) * aspect * 0.4;
  const my = -(mouseNY * 2 - 1) * 0.4;
  const targetLocal = V3.normalize([mx, my, 1.6]);
  const targetWorld = V3.normalize(V3.add(
    V3.add(V3.scale(camRight, targetLocal[0]), V3.scale(camUp, targetLocal[1])),
    V3.scale(camFwd, targetLocal[2])
  ));

  // --- rotate ship toward target ---
  const dot = Math.max(-1, Math.min(1, V3.dot(ship.forward, targetWorld)));
  const angle = Math.acos(dot);

  const mouseDistFromCenter = Math.sqrt(
    Math.pow((mouseNX - 0.5) * 2, 2) + Math.pow((mouseNY - 0.5) * 2, 2)
  );
  const turnScale = Math.min(1, mouseDistFromCenter);

  if (angle > 0.002) {
    const maxAngle = ship.turnRate * turnScale * dt;
    const rotAngle = Math.min(angle, maxAngle);
    const rawAxis = V3.cross(ship.forward, targetWorld);
    if (V3.len(rawAxis) > 1e-6) {
      const axis = V3.normalize(rawAxis);
      ship.forward = V3.normalize(rotateAroundAxis(ship.forward, axis, rotAngle));
      ship.up      = V3.normalize(rotateAroundAxis(ship.up, axis, rotAngle));
      ship.right   = V3.normalize(V3.cross(ship.up, ship.forward));
      ship.up      = V3.normalize(V3.cross(ship.forward, ship.right));

      const yawComp = V3.dot(V3.cross(ship.forward, targetWorld), ship.up);
      ship.visualRoll += (-yawComp * 2.5 - ship.visualRoll) * 4 * dt;
    }
  } else {
    ship.visualRoll *= (1 - 4 * dt);
  }

  // --- move forward ---
  ship.pos = V3.add(ship.pos, V3.scale(ship.forward, ship.speed * dt));

  // --- self-right: drift ship.up back toward world up to prevent permanent tilt ---
  const worldUp = [0, 1, 0];
  const upTarget = V3.sub(worldUp, V3.scale(ship.forward, V3.dot(worldUp, ship.forward)));
  if (V3.len(upTarget) > 0.01) {
    ship.up    = V3.normalize(V3.lerp(ship.up, V3.normalize(upTarget), 3.0 * dt));
    ship.right = V3.normalize(V3.cross(ship.up, ship.forward));
    ship.up    = V3.normalize(V3.cross(ship.forward, ship.right));
  }

  // --- score ---
  score = V3.dist(ship.pos, startPos) * 10;
}

// ===================== COLLISION =====================

function checkCollision() {
  const r = 0.12;
  const probes = [
    ship.pos,
    V3.add(ship.pos, V3.scale(ship.forward, r * 1.5)),
    V3.add(ship.pos, V3.scale(ship.forward, -r)),
    V3.add(ship.pos, V3.scale(ship.right, r)),
    V3.add(ship.pos, V3.scale(ship.right, -r)),
    V3.add(ship.pos, V3.scale(ship.up, r * 0.6)),
    V3.add(ship.pos, V3.scale(ship.up, -r * 0.4)),
  ];
  for (const p of probes) {
    if (fieldJS(p[0], p[1], p[2]) > -0.01) return true;
  }
  return false;
}

// ===================== CAMERA =====================

function updateCameraChase(dt) {
  if (fpCamera) {
    camPos    = V3.add(ship.pos, V3.scale(ship.forward, 0.35));
    camTarget = V3.add(camPos, V3.scale(ship.forward, 5));
    computeCamBasis();
    return;
  }

  const t = 1 - Math.exp(-8 * dt);
  const desired = V3.add(ship.pos,
    V3.add(V3.scale(ship.forward, -1.5), V3.scale(ship.up, 0.4)));
  camPos = V3.lerp(camPos, desired, t);

  const lookAhead = V3.add(ship.pos, V3.scale(ship.forward, 4));
  camTarget = V3.lerp(camTarget, lookAhead, t);

  computeCamBasis();
}

function updateCameraMenu(time) {
  const t = time * 0.12;
  camPos = [Math.sin(t) * 4, 1.2 + Math.sin(t * 0.6) * 0.4, Math.cos(t) * 4];
  camTarget = [0, 0, 0];
  computeCamBasis();
}

let smoothCamUp = [0, 1, 0];

function computeCamBasis() {
  camFwd = V3.normalize(V3.sub(camTarget, camPos));

  const d = V3.dot(smoothCamUp, camFwd);
  let upPerp = V3.sub(smoothCamUp, V3.scale(camFwd, d));

  if (V3.len(upPerp) < 0.001) {
    const fb = [0, 0, 1];
    upPerp = V3.sub(fb, V3.scale(camFwd, V3.dot(fb, camFwd)));
  }

  camUp    = V3.normalize(upPerp);
  camRight = V3.normalize(V3.cross(camUp, camFwd));

  smoothCamUp = V3.normalize(V3.lerp(camUp, [0, 1, 0], 0.03));
}

// ===================== SHIP RENDERING =====================

function renderShip(vw, vh) {
  let r = [...ship.right], u = [...ship.up];
  if (Math.abs(ship.visualRoll) > 0.001) {
    r = rotateAroundAxis(r, ship.forward, ship.visualRoll * 0.6);
    u = rotateAroundAxis(u, ship.forward, ship.visualRoll * 0.6);
  }
  const model = new Float32Array([
    r[0], r[1], r[2], 0,
    u[0], u[1], u[2], 0,
    ship.forward[0], ship.forward[1], ship.forward[2], 0,
    ship.pos[0], ship.pos[1], ship.pos[2], 1
  ]);

  const proj = mat4Perspective(Math.PI / 3, vw / vh, 0.01, 200);
  const view = mat4View(camPos, camFwd, camRight, camUp);
  const mvp  = mat4Mul(proj, mat4Mul(view, model));

  drawLineCmd({ positions: shipPosBuf, elements: shipEdgeBuf, mvp, color: [0.0, 0.92, 0.7] });

  // engine flame
  if (ship.speed > ship.minSpeed + 0.05) {
    const fl = 0.1 + (ship.speed / ship.maxSpeed) * 0.2 + Math.random() * 0.08;
    flamePosBuf.subdata(new Float32Array([
      -0.04, 0, -0.32,
       0,    0, -0.32 - fl,
       0.04, 0, -0.32
    ]));
    const brightness = 0.6 + Math.random() * 0.3;
    drawLineCmd({ positions: flamePosBuf, elements: flameEdgeBuf, mvp, color: [1.0, brightness, 0.1] });
  }
}

// ===================== SETTINGS PANEL =====================

function toggleSettings() {
  document.getElementById('settingsPanel').classList.toggle('open');
  document.getElementById('settingsIcon').classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const panel = document.getElementById('settingsPanel');
  const icon  = document.getElementById('settingsIcon');
  if (panel.classList.contains('open') && !panel.contains(e.target) && !icon.contains(e.target)) {
    panel.classList.remove('open');
    icon.classList.remove('open');
  }
});

// ===================== MAIN LOOP =====================

let lastTime = performance.now();

regl.frame(({time, viewportWidth, viewportHeight}) => {
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.05);
  lastTime  = now;

  switch (gameState) {
    case GS.MENU:
      updateCameraMenu(time);
      break;
    case GS.PLAYING:
      updateShip(dt);
      updateCameraChase(dt);
      if (checkCollision()) endGame();
      break;
    case GS.DEAD:
      break;
  }

  regl.clear({ color: [0, 0, 0, 1], depth: 1 });
  draw();

  if (gameState === GS.PLAYING) {
    if (!fpCamera) renderShip(viewportWidth, viewportHeight);

    const s = Math.floor(score);
    if (s !== lastDisplayedScore) {
      lastDisplayedScore = s;
      document.getElementById('scoreValue').textContent = s + ' m';
    }
  }
});

// ===================== INIT =====================

document.getElementById('menuHighScore').textContent = highScore;

document.getElementById('viewDist').addEventListener('input', (e) => {
  params.maxDist  = parseFloat(e.target.value);
  params.stepSize = params.maxDist / 1000;
  params.maxSteps = Math.min(512, Math.max(64, Math.floor(params.maxDist * 2)));
  document.getElementById('viewDistValue').textContent = params.maxDist.toFixed(0);
});

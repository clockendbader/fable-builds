/*
 * renderer.js — a small WebGL2 renderer written for this project (no libraries).
 * One vertex format for everything solid (heart, valve leaflets, chordae, conduction tubes),
 * one deformation function in the vertex shader driven by the chamber volumes of the simulation.
 */
(function (root) {
  'use strict';

  /* ---------- matrices (column-major) ---------- */
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
    return m;
  }
  function lookAt(e, c, up) {
    var z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(z[0], z[1], z[2]); z = [z[0] / l, z[1] / l, z[2] / l];
    var x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]];
    l = Math.hypot(x[0], x[1], x[2]); x = [x[0] / l, x[1] / l, x[2] / l];
    var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    var m = new Float32Array(16);
    m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
    m[12] = -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]); m[13] = -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]); m[14] = -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]); m[15] = 1;
    return { m: m, x: x, y: y, z: z };
  }
  function mul4(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }

  /* ---------- shaders ---------- */
  var DEFORM = [
    'uniform vec3 uLvB, uLvU, uLaC, uRaC;',
    'uniform float uLvL, uLvSc, uLvA, uLvUp, uLvDown;',
    'uniform float uLamLV, uRvSq, uLamLA, uLamRA, uLong;',
    'vec3 deform(vec3 p, vec4 w, float lg) {',
    '  float s = clamp(dot(p - uLvB, uLvU), 0.0, uLvL);',
    '  vec3 rv = p - (uLvB + uLvU * s); float r = length(rv);',
    '  float tt = (s - uLvSc) / (s < uLvSc ? uLvUp : uLvDown);',
    '  float Ri2 = uLvA * uLvA * max(0.0, 1.0 - tt * tt), r2 = r * r;',
    '  float rn = r2 >= Ri2 ? sqrt(max(r2 - (1.0 - uLamLV * uLamLV) * Ri2, 1e-6)) : r * uLamLV;',
    '  vec3 dir = r > 1e-4 ? rv / r : vec3(0.0);',
    '  vec3 q = p + dir * ((rn - r) * w.x);',
    '  q -= dir * (uRvSq * w.y);',
    '  q += (uLaC - p) * ((1.0 - uLamLA) * w.z);',
    '  q += (uRaC - p) * ((1.0 - uLamRA) * w.w);',
    '  q += uLvU * (uLong * lg);',
    '  return q;',
    '}'
  ].join('\n');

  var VS = [
    '#version 300 es', 'precision highp float;',
    'layout(location=0) in vec3 aPos; layout(location=1) in vec3 aPos2; layout(location=2) in vec3 aNrm;',
    'layout(location=3) in vec4 aW; layout(location=4) in vec4 aMisc; layout(location=5) in vec3 aLat;',
    'uniform mat4 uVP; uniform float uOpen; uniform vec3 uPal[24];', DEFORM,
    'out vec3 vRest; out vec3 vWorld; out vec3 vNrm; out vec3 vLat; flat out float vPart; out float vEndo; flat out float vKind; out vec3 vCol;',
    'void main() {',
    '  vec3 p = mix(aPos, aPos2, uOpen);',
    '  vRest = p; vNrm = aNrm; vLat = aLat; vPart = aMisc.y; vEndo = aMisc.z; vKind = aMisc.w; vCol = uPal[int(aMisc.y + 0.5)];',
    '  vec3 q = deform(p, aW, aMisc.x);',
    '  vWorld = q; gl_Position = uVP * vec4(q, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es', 'precision highp float;',
    'in vec3 vRest; in vec3 vWorld; in vec3 vNrm; in vec3 vLat; flat in float vPart; in float vEndo; flat in float vKind; in vec3 vCol;',
    'uniform vec3 uEye, uLight;',
    'uniform vec4 uClip; uniform float uClipOn; uniform int uMode;',     // 0 solid, 1 ghost, 2 pick
    'uniform float uHighlight, uHover, uElec, uTA, uTV, uVKind, uQT, uAVd, uBlock, uAF, uTime, uStenosis, uDim;',
    'out vec4 o;',
    'float hash(vec3 p) { return fract(sin(dot(p, vec3(17.31, 41.77, 29.13))) * 9173.37); }',
    'float vnoise(vec3 p) {',
    '  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y);',
    '  float b = mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y);',
    '  return mix(a, b, f.z);',
    '}',
    'float front(float x, float w) { float z = x / w; return exp(-z * z); }',
    'float plateau(float x, float e) { return smoothstep(0.0, 0.012, x) * (1.0 - smoothstep(e - 0.11, e, x)); }',
    'void main() {',
    '  if (uClipOn > 0.5 && dot(vRest, uClip.xyz) > uClip.w) discard;',
    '  int part = int(vPart + 0.5);',
    '  if (uMode == 2) { o = vec4(float(part) / 255.0, 0.0, 0.0, 1.0); return; }',
    '  vec3 base = vCol;',
    '  vec3 V = normalize(uEye - vWorld);',
    '  vec3 N = normalize(vNrm);',
    '  bool back = !gl_FrontFacing;',
    '  bool cutFace = false;',
    '  float glow = 0.0; vec3 glowCol = vec3(1.0, 0.86, 0.30);',
    '  if (vKind > 0.5 && vKind < 1.5) {',                                       // valve leaflet: flat, two-sided
    '    N = normalize(cross(dFdx(vWorld), dFdy(vWorld))); if (dot(N, V) < 0.0) N = -N;',
    '    if (part == 13 && uStenosis > 0.5) {',                                 // calcified aortic cusps
    '      float c = vnoise(vRest * 9.0); base = mix(vec3(0.80, 0.74, 0.52), vec3(0.97, 0.95, 0.86), smoothstep(0.35, 0.7, c));',
    '      N = normalize(N + 0.5 * (vec3(vnoise(vRest * 14.0), vnoise(vRest * 14.0 + 3.1), vnoise(vRest * 14.0 + 7.7)) - 0.5));',
    '    }',
    '  } else if (vKind > 1.5) {',                                               // conduction system
    '    float typ = vLat.x, s = vLat.y, x, g = 0.0; vec3 dim = vec3(0.46, 0.40, 0.16);',
    '    if (typ < 0.5) { g = uAF > 0.5 ? 0.0 : front(uTA - 0.02, 0.035) + 0.5 * exp(-max(uTA, 0.0) / 0.10) * step(0.0, uTA); }',
    '    else if (typ < 1.5) {',
    '      if (uBlock > 0.5) { x = uTA - 0.04 - s * 0.10; g = front(x, 0.022) * (1.0 - s) * (1.0 - s) * 1.3; glowCol = mix(glowCol, vec3(1.0, 0.25, 0.2), s); dim = mix(dim, vec3(0.5, 0.16, 0.14), s); }',
      '      else { float tin = uTV + uAVd + 0.035; x = tin - s * uAVd; g = front(x, 0.020);',
    '        if (tin > 0.0 && tin < uAVd) g = max(g, 0.30 * step(s * uAVd, tin));',
    '        if (uAF > 0.5) g = max(g, 0.28 * vnoise(vec3(uTime * 23.0, s * 3.0, 1.0))); }',
    '    } else if (uVKind < 0.5) {',
    '      if (typ < 2.5) x = uTV + 0.035 - s * 0.010; else if (typ < 3.5) x = uTV + 0.025 - s * 0.022; else x = uTV + 0.004 - s * 0.030;',
    '      g = front(x, 0.011) + 0.55 * step(0.0, x) * exp(-x / 0.06);',
    '    }',
    '    g = clamp(g, 0.0, 1.4);',
    '    vec3 c = mix(dim, glowCol, clamp(g, 0.0, 1.0)) * (0.55 + 0.45 * max(dot(N, V), 0.0)) + glowCol * g * 0.6;',
    '    if (uHighlight == vPart) c += vec3(0.25, 0.25, 0.1);',
    '    o = vec4(c, uMode == 3 ? 0.30 : 1.0); return;',
    '  } else {',                                                               // heart wall
    '    if (back) { cutFace = true; N = normalize(uClip.xyz); if (dot(N, V) < 0.0) N = -N; }',
    '    float fib = vnoise(vRest * vec3(5.0, 13.0, 5.0)) * 0.6 + vnoise(vRest * 23.0) * 0.4;',
    '    if (cutFace) {',
    '      bool muscle = part == 1 || part == 2 || part == 5 || part == 20;',
    '      base = muscle ? mix(vec3(0.50, 0.13, 0.12), vec3(0.66, 0.22, 0.19), fib) : mix(base, vec3(0.93, 0.80, 0.74), 0.55);',
    '    } else if (vEndo > 0.5) {',
    '      base = mix(base, vec3(0.93, 0.68, 0.64), 0.42) * (0.93 + 0.14 * fib);',
    '    } else {',
    '      base *= 0.90 + 0.20 * fib;',
    '      if (part >= 1 && part <= 5) base = mix(base, vec3(0.86, 0.72, 0.42), 0.10 * smoothstep(0.55, 0.85, vnoise(vRest * 1.1 + 4.0)));',   // a little surface fat
    '    }',
    '    if (uElec > 0.5) {',
    '      if (vLat.x >= 0.0) {',
    '        if (uAF > 0.5) { float c1 = vnoise(vRest * 1.6 + vec3(uTime * 9.0, -uTime * 7.0, uTime * 5.0)); glow = smoothstep(0.52, 0.72, c1) * 0.9; }',
    '        else { float xa = uTA - vLat.x; glow = front(xa, 0.014) + 0.30 * plateau(xa, 0.20); }',
    '      }',
    '      float lv = uVKind < 0.5 ? vLat.y : vLat.z;',
    '      if (lv >= 0.0) { float xv = uTV - lv; glow = front(xv, uVKind < 0.5 ? 0.012 : 0.018) + 0.30 * plateau(xv, uQT); }',
    '    }',
    '  }',
    '  if (uMode == 1) {',                                                      // ghost shell
    '    float f = pow(1.0 - abs(dot(N, V)), 2.2);',
    '    vec3 c = mix(base, vec3(0.75, 0.82, 1.0), 0.35);',
    '    float a = 0.035 + 0.30 * f + glow * 0.10;',
    '    if (uHighlight == vPart) a += 0.10;',
    '    o = vec4(c * a + glowCol * glow * 0.10, 1.0); return;',
    '  }',
    '  vec3 L = normalize(uLight);',
    '  float nl = dot(N, L), wrap = max((nl + 0.38) / 1.38, 0.0);',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N, H), 0.0), cutFace ? 18.0 : 52.0) * (cutFace ? 0.10 : 0.42);',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
    '  vec3 col = base * (0.20 + 0.86 * wrap) + base * vec3(0.30, 0.06, 0.04) * (1.0 - wrap) * 0.35;',
    '  col += spec * vec3(1.0, 0.95, 0.9) + fres * vec3(0.55, 0.62, 0.85) * 0.16;',
    '  col = mix(col, col * 0.45, uDim * (uHighlight == vPart ? 0.0 : 1.0));',
    '  col = mix(col, col * 0.75 + glowCol * 0.55, clamp(glow, 0.0, 1.0) * 0.8);',
    '  if (uHighlight == vPart) col = mix(col, vec3(1.0, 0.95, 0.75), 0.22) + 0.05;',
    '  else if (uHover == vPart) col += 0.06;',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var PVS = [
    '#version 300 es', 'precision highp float;',
    'layout(location=0) in vec3 aPos; layout(location=1) in vec4 aW; layout(location=2) in vec3 aExtra;',   // long, oxygen, size
    'uniform mat4 uVP; uniform float uPx;', DEFORM,
    'out float vOxy; out vec3 vRest;',
    'void main() {',
    '  vRest = aPos; vOxy = aExtra.y;',
    '  vec3 q = deform(aPos, aW, aExtra.x);',
    '  gl_Position = uVP * vec4(q, 1.0);',
    '  gl_PointSize = aExtra.z * uPx / gl_Position.w;',
    '}'
  ].join('\n');
  var PFS = [
    '#version 300 es', 'precision highp float;',
    'in float vOxy; in vec3 vRest; uniform vec4 uClip; uniform float uClipOn; uniform vec3 uOxyCol, uDeoxyCol; out vec4 o;',
    'void main() {',
    '  if (uClipOn > 0.5 && dot(vRest, uClip.xyz) > uClip.w) discard;',
    '  vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard;',
    '  float z = sqrt(1.0 - r2); vec3 n = vec3(c.x, -c.y, z);',
    '  float d = max(dot(n, normalize(vec3(0.35, 0.55, 0.75))), 0.0);',
    '  vec3 base = mix(uDeoxyCol, uOxyCol, vOxy);',
    '  vec3 col = base * (0.35 + 0.75 * d) + pow(d, 24.0) * 0.5;',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n'));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i), name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u };
  }

  var PAL = (function () {
    var P = [];
    for (var i = 0; i < 24; i++) P.push([0.7, 0.3, 0.3]);
    P[1] = [0.74, 0.27, 0.24]; P[2] = [0.70, 0.29, 0.27]; P[3] = [0.78, 0.38, 0.35]; P[4] = [0.74, 0.37, 0.36]; P[5] = [0.72, 0.27, 0.25];
    P[6] = [0.86, 0.25, 0.20]; P[7] = [0.27, 0.46, 0.84]; P[8] = [0.24, 0.39, 0.78]; P[9] = [0.24, 0.39, 0.78]; P[10] = [0.88, 0.33, 0.29];
    P[11] = [0.95, 0.90, 0.80]; P[12] = [0.95, 0.90, 0.80]; P[13] = [0.96, 0.91, 0.82]; P[14] = [0.95, 0.90, 0.80];
    P[15] = [1, 0.85, 0.3]; P[16] = [1, 0.85, 0.3]; P[17] = [1, 0.85, 0.3]; P[18] = [1, 0.85, 0.3]; P[19] = [1, 0.85, 0.3];
    P[20] = [0.84, 0.50, 0.44]; P[21] = [0.90, 0.20, 0.15];
    return new Float32Array([].concat.apply([], P));
  })();

  function HeartRenderer(canvas, geo, opts) {
    var gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: !!(opts && opts.keepBuffer) });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.canvas = canvas; this.geo = geo;
    this.main = program(gl, VS, FS);
    this.pprog = program(gl, PVS, PFS);
    this.meshes = {};
    this.meshes.heart = this._mesh(geo.heart);
    var v = geo.valves;
    this.meshes.mv = this._mesh(v.mv); this.meshes.tv = this._mesh(v.tv); this.meshes.av = this._mesh(v.av); this.meshes.pv = this._mesh(v.pv);
    this.meshes.mvChordae = this._mesh(v.mvChordae); this.meshes.tvChordae = this._mesh(v.tvChordae);
    this.meshes.conduction = this._mesh(geo.conduction);
    // particles
    this.pMax = 2600; this.pData = new Float32Array(this.pMax * 10); this.pCount = 0;
    this.pVao = gl.createVertexArray(); gl.bindVertexArray(this.pVao);
    this.pBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf); gl.bufferData(gl.ARRAY_BUFFER, this.pData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 28);
    gl.bindVertexArray(null);
    this.cam = { yaw: -0.18, pitch: 0.06, dist: 41, target: [-0.2, -0.5, -0.6], fov: 30 * Math.PI / 180 };
    this.view = { mode: 'whole', cutZ: -0.25, blood: true, elec: false };
    this.state = { lamLV: 1, rvSq: 0, lamLA: 1, lamRA: 1, long: 0, mv: 0, tv: 0, av: 0, pv: 0, elec: { tA: 9, tV: 9, kind: 0, qt: 0.36, avDelay: 0.085, block: false, af: false }, stenosis: false, time: 0 };
    this.highlight = -1; this.hover = -1; this.dim = 0;
    this.pick = { fbo: null, w: 0, h: 0 };
    this.resize();
  }

  HeartRenderer.prototype._mesh = function (m) {
    var gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    function attr(loc, data, size) {
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    attr(0, m.pos, 3); attr(1, m.pos2, 3); attr(2, m.nrm, 3); attr(3, m.w, 4); attr(4, m.misc, 4); attr(5, m.lat, 3);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao: vao, n: m.idx.length };
  };

  HeartRenderer.prototype.resize = function () {
    var c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(c.clientWidth * dpr)), h = Math.max(2, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.dpr = dpr;
  };

  HeartRenderer.prototype._camera = function () {
    var c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    var eye = [c.target[0] + c.dist * cp * sy, c.target[1] + c.dist * sp, c.target[2] + c.dist * cp * cy];
    var v = lookAt(eye, c.target, [0, 1, 0]);
    var aspect = this.canvas.width / this.canvas.height;
    // keep the whole heart in frame on narrow canvases
    var fov = c.fov; if (aspect < 0.9) fov = 2 * Math.atan(Math.tan(c.fov / 2) * 0.9 / aspect);
    var p = perspective(fov, aspect, 4, 160);
    this.vp = mul4(p, v.m); this.eye = eye; this.camAxes = v; this.fovUsed = fov;
    // light: up and to the viewer's left of the camera
    this.light = [v.z[0] * 0.75 - v.x[0] * 0.45 + v.y[0] * 0.55, v.z[1] * 0.75 - v.x[1] * 0.45 + v.y[1] * 0.55, v.z[2] * 0.75 - v.x[2] * 0.45 + v.y[2] * 0.55];
  };

  HeartRenderer.prototype._deformUniforms = function (u) {
    var gl = this.gl, d = this.geo.deform, s = this.state;
    gl.uniform3fv(u.uLvB, d.B); gl.uniform3fv(u.uLvU, d.U); gl.uniform3fv(u.uLaC, d.laC); gl.uniform3fv(u.uRaC, d.raC);
    gl.uniform1f(u.uLvL, d.L); gl.uniform1f(u.uLvSc, d.sc); gl.uniform1f(u.uLvA, d.a); gl.uniform1f(u.uLvUp, d.up); gl.uniform1f(u.uLvDown, d.down);
    gl.uniform1f(u.uLamLV, s.lamLV); gl.uniform1f(u.uRvSq, s.rvSq); gl.uniform1f(u.uLamLA, s.lamLA); gl.uniform1f(u.uLamRA, s.lamRA); gl.uniform1f(u.uLong, s.long);
  };

  HeartRenderer.prototype._drawScene = function (mode) {
    var gl = this.gl, u = this.main.u, s = this.state, view = this.view, M = this.meshes, self = this;
    gl.useProgram(this.main.p);
    gl.uniformMatrix4fv(u.uVP, false, this.vp);
    gl.uniform3fv(u.uEye, this.eye); gl.uniform3fv(u.uLight, this.light); gl.uniform3fv(u.uPal, PAL);
    this._deformUniforms(u);
    var cut = view.mode === 'cut';
    gl.uniform4f(u.uClip, 0, 0, 1, view.cutZ); gl.uniform1f(u.uClipOn, cut ? 1 : 0);
    gl.uniform1f(u.uHighlight, mode === 2 ? -1 : this.highlight); gl.uniform1f(u.uHover, mode === 2 ? -1 : this.hover);
    gl.uniform1f(u.uDim, mode === 2 ? 0 : this.dim);
    var e = s.elec;
    gl.uniform1f(u.uElec, view.elec ? 1 : 0); gl.uniform1f(u.uTA, e.tA); gl.uniform1f(u.uTV, e.tV); gl.uniform1f(u.uVKind, e.kind);
    gl.uniform1f(u.uQT, e.qt); gl.uniform1f(u.uAVd, e.avDelay); gl.uniform1f(u.uBlock, e.block ? 1 : 0); gl.uniform1f(u.uAF, e.af ? 1 : 0);
    gl.uniform1f(u.uTime, s.time); gl.uniform1f(u.uStenosis, s.stenosis ? 1 : 0);
    function draw(m, open) { gl.uniform1f(u.uOpen, open || 0); gl.bindVertexArray(m.vao); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0); }
    function inner() {
      draw(M.mv, s.mv); draw(M.tv, s.tv); draw(M.av, s.av); draw(M.pv, s.pv);
      draw(M.mvChordae, s.mv); draw(M.tvChordae, s.tv);
      if (view.elec) draw(M.conduction, 0);
    }
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    var ghost = view.mode === 'ghost';
    if (mode === 2) {            // picking
      gl.uniform1i(u.uMode, 2);
      draw(M.heart, 0);
      if (ghost) gl.clear(gl.DEPTH_BUFFER_BIT);     // let the inner parts be picked through the glass
      inner();
      return;
    }
    gl.uniform1i(u.uMode, 0);
    if (!ghost) draw(M.heart, 0);
    inner();
    if (view.blood && (ghost || cut)) this._drawParticles(cut);
    gl.useProgram(this.main.p);
    if (ghost) {
      gl.uniform1i(u.uMode, 1); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      draw(M.heart, 0);
      gl.depthMask(true); gl.disable(gl.BLEND);
    } else if (view.elec) {
      // conduction system showing faintly through the wall
      gl.uniform1i(u.uMode, 3); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.disable(gl.DEPTH_TEST);
      gl.uniform1f(u.uClipOn, 0);
      draw(M.conduction, 0);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  };

  HeartRenderer.prototype._drawParticles = function (cut) {
    var gl = this.gl, u = this.pprog.u;
    if (!this.pCount) return;
    gl.useProgram(this.pprog.p);
    gl.uniformMatrix4fv(u.uVP, false, this.vp);
    this._deformUniforms(u);
    gl.uniform4f(u.uClip, 0, 0, 1, this.view.cutZ); gl.uniform1f(u.uClipOn, cut ? 1 : 0);
    gl.uniform1f(u.uPx, this.canvas.height / (2 * Math.tan(this.fovUsed / 2)));
    gl.uniform3f(u.uOxyCol, 0.93, 0.20, 0.18); gl.uniform3f(u.uDeoxyCol, 0.22, 0.42, 0.92);
    gl.bindVertexArray(this.pVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pData.subarray(0, this.pCount * 10));
    gl.drawArrays(gl.POINTS, 0, this.pCount);
    gl.bindVertexArray(null);
  };

  HeartRenderer.prototype.render = function () {
    var gl = this.gl;
    this.resize(); this._camera();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.043, 0.055, 0.082, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this._drawScene(0);
  };

  /* Which part is under this canvas pixel (CSS pixels)? Returns a part id or 0. */
  HeartRenderer.prototype.pickAt = function (cx, cy) {
    var gl = this.gl, c = this.canvas, pk = this.pick;
    if (!pk.fbo || pk.w !== c.width || pk.h !== c.height) {
      if (pk.fbo) { gl.deleteFramebuffer(pk.fbo); gl.deleteTexture(pk.tex); gl.deleteRenderbuffer(pk.rb); }
      pk.fbo = gl.createFramebuffer(); pk.tex = gl.createTexture(); pk.rb = gl.createRenderbuffer(); pk.w = c.width; pk.h = c.height;
      gl.bindTexture(gl.TEXTURE_2D, pk.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, pk.w, pk.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindRenderbuffer(gl.RENDERBUFFER, pk.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, pk.w, pk.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pk.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pk.tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pk.rb);
    }
    this._camera();
    gl.bindFramebuffer(gl.FRAMEBUFFER, pk.fbo);
    gl.viewport(0, 0, pk.w, pk.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this._drawScene(2);
    var px = new Uint8Array(4);
    gl.readPixels(Math.round(cx * this.dpr), pk.h - 1 - Math.round(cy * this.dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px[0];
  };

  /* project a model point to CSS pixels: [x, y, inFront] */
  HeartRenderer.prototype.project = function (p) {
    var m = this.vp, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w * 0.5 + 0.5) * this.canvas.clientWidth, (1 - (y / w * 0.5 + 0.5)) * this.canvas.clientHeight, w > 0];
  };

  HeartRenderer.prototype.orbit = function (dx, dy) {
    this.cam.yaw -= dx * 0.008; this.cam.pitch = Math.max(-1.45, Math.min(1.45, this.cam.pitch + dy * 0.008));
  };
  HeartRenderer.prototype.zoom = function (f) { this.cam.dist = Math.max(12, Math.min(90, this.cam.dist * f)); };
  HeartRenderer.prototype.pan = function (dx, dy) {
    var a = this.camAxes, k = this.cam.dist * 0.0011, t = this.cam.target;
    for (var i = 0; i < 3; i++) t[i] += (-a.x[i] * dx + a.y[i] * dy) * k;
  };
  HeartRenderer.prototype.resetView = function () { this.cam.yaw = -0.18; this.cam.pitch = 0.06; this.cam.dist = 41; this.cam.target = [-0.2, -0.5, -0.6]; };

  root.HeartRenderer = HeartRenderer;
})(typeof self !== 'undefined' ? self : this);

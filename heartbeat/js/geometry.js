/*
 * geometry.js — the heart, built from code.
 *
 * Every shape here is defined by a few numbers (ellipsoids, capsules, swept tubes) combined as
 * signed-distance fields, then turned into triangles with a surface-nets mesher written for this
 * project. No external models, images or libraries.
 *
 * Axes (cm): x = viewer's right (patient's left), y = up, z = toward the viewer (anterior).
 * The layout is the opened-out textbook one, so a single frontal cut shows all four chambers
 * and all four valves. That simplification is listed in the app's "What this model simplifies".
 */
(function (root) {
  'use strict';

  var PART = {
    LV: 1, RV: 2, LA: 3, RA: 4, SEPTUM: 5, AORTA: 6, PA: 7, SVC: 8, IVC: 9, PVEINS: 10,
    MITRAL: 11, TRICUSPID: 12, AORTIC: 13, PULMONARY: 14,
    SA: 15, AVN: 16, HIS: 17, BRANCH: 18, PURKINJE: 19, PAPILLARY: 20, CORONARY: 21
  };

  /* ---------- small vector helpers ---------- */
  function v3(x, y, z) { return [x, y, z]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function perp(n, hint) { var h = sub(hint, mul(n, dot(hint, n))); return norm(h); }

  function smin(a, b, k) { var h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  /* deterministic random numbers for the Purkinje network */
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- primitives ---------- */

  // axis-aligned ellipsoid, first-order distance
  function Ell(c, r) { this.c = c; this.r = r; this.rmin = Math.min(r[0], r[1], r[2]); }
  Ell.prototype.d = function (x, y, z) {
    var c = this.c, r = this.r;
    var px = x - c[0], py = y - c[1], pz = z - c[2];
    var ax = px / r[0], ay = py / r[1], az = pz / r[2];
    var k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    if (k0 < 1e-5) return -this.rmin;
    ax /= r[0]; ay /= r[1]; az /= r[2];
    var k1 = Math.sqrt(ax * ax + ay * ay + az * az);
    return k0 * (k0 - 1) / k1;
  };

  // body of revolution about an axis: half-ellipsoid "up" toward the base, longer one "down" to the apex
  function Egg(c, u, a, up, down) { this.c = c; this.u = u; this.a = a; this.up = up; this.down = down; }
  Egg.prototype.d = function (x, y, z) {
    var c = this.c, u = this.u;
    var px = x - c[0], py = y - c[1], pz = z - c[2];
    var s = px * u[0] + py * u[1] + pz * u[2];
    var rx = px - s * u[0], ry = py - s * u[1], rz = pz - s * u[2];
    var r = Math.sqrt(rx * rx + ry * ry + rz * rz);
    var h = s > 0 ? this.down : this.up, a = this.a;
    var k0 = Math.sqrt(r * r / (a * a) + s * s / (h * h));
    if (k0 < 1e-5) return -Math.min(a, h);
    var k1 = Math.sqrt(r * r / (a * a * a * a) + s * s / (h * h * h * h));
    return k0 * (k0 - 1) / k1;
  };

  function Cap(a, b, ra, rb) {
    this.a = a; this.ra = ra; this.rb = rb === undefined ? ra : rb;
    this.ab = sub(b, a); this.l2 = dot(this.ab, this.ab) || 1e-9;
  }
  Cap.prototype.d = function (x, y, z) {
    var a = this.a, ab = this.ab;
    var px = x - a[0], py = y - a[1], pz = z - a[2];
    var h = (px * ab[0] + py * ab[1] + pz * ab[2]) / this.l2;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    var dx = px - ab[0] * h, dy = py - ab[1] * h, dz = pz - ab[2] * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (this.ra + (this.rb - this.ra) * h);
  };

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t, o = [];
    for (var i = 0; i < 4; i++) {
      o.push(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
    }
    return o;
  }
  /* pts: [x,y,z,r]. Returns a smooth resampled polyline of [x,y,z,r]. */
  function resample(pts, step) {
    var out = [], n = pts.length;
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
      var d = len(sub(p2, p1)), k = Math.max(1, Math.round(d / step));
      for (var j = 0; j < k; j++) out.push(catmull(p0, p1, p2, p3, j / k));
    }
    out.push(pts[n - 1].slice());
    return out;
  }

  // swept tube; d() is the distance to the lumen surface (negative inside the lumen)
  function Tube(pts, step) {
    var P = this.pts = resample(pts, step || 0.5), n = P.length - 1;
    this.n = n;
    var S = this.S = new Float32Array(n * 9);
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], rmax = 0;
    for (var i = 0; i < n; i++) {
      var a = P[i], b = P[i + 1], o = i * 9;
      S[o] = a[0]; S[o + 1] = a[1]; S[o + 2] = a[2];
      S[o + 3] = b[0] - a[0]; S[o + 4] = b[1] - a[1]; S[o + 5] = b[2] - a[2];
      S[o + 6] = S[o + 3] * S[o + 3] + S[o + 4] * S[o + 4] + S[o + 5] * S[o + 5] || 1e-9;
      S[o + 7] = a[3]; S[o + 8] = b[3] - a[3];
      for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k], b[k]); hi[k] = Math.max(hi[k], a[k], b[k]); }
      rmax = Math.max(rmax, a[3], b[3]);
    }
    this.lo = lo; this.hi = hi; this.rmax = rmax;
  }
  Tube.prototype.d = function (x, y, z) {
    var lo = this.lo, hi = this.hi, m = this.rmax + 1.6;
    // far away: a cheap lower bound is enough
    var ex = Math.max(lo[0] - x, 0, x - hi[0]), ey = Math.max(lo[1] - y, 0, y - hi[1]), ez = Math.max(lo[2] - z, 0, z - hi[2]);
    var e2 = ex * ex + ey * ey + ez * ez;
    if (e2 > m * m) return Math.sqrt(e2) - this.rmax;
    var S = this.S, best = 1e9;
    for (var i = 0, n = this.n; i < n; i++) {
      var o = i * 9;
      var px = x - S[o], py = y - S[o + 1], pz = z - S[o + 2];
      var h = (px * S[o + 3] + py * S[o + 4] + pz * S[o + 5]) / S[o + 6];
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      var dx = px - S[o + 3] * h, dy = py - S[o + 4] * h, dz = pz - S[o + 5] * h;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz) - (S[o + 7] + S[o + 8] * h);
      if (d < best) best = d;
    }
    return best;
  };

  /* ---------- anatomy, in numbers ---------- */

  // left ventricle: axis from the base point to the apex of the cavity
  var LV_B = v3(1.9, 0.8, -0.3);
  var LV_U = norm(v3(-0.80, -7.0, 0.45));
  var LV_L = 7.7;                 // cavity length along the axis
  var LV_SC = 1.5;                // widest level (distance from the base point)
  var LV_A = 2.40;                // cavity radius there
  var LV_UP = LV_SC, LV_DOWN = LV_L - LV_SC;
  var LV_WALL = 1.0;
  var LV_C = add(LV_B, mul(LV_U, LV_SC));
  var lvCavEgg = new Egg(LV_C, LV_U, LV_A, LV_UP, LV_DOWN);
  var lvOutEgg = new Egg(LV_C, LV_U, LV_A + LV_WALL, LV_UP + 0.45, LV_DOWN + 0.6);
  var LV_E1 = perp(LV_U, v3(1, 0, 0));          // toward the free (lateral) wall
  var LV_E2 = cross(LV_E1, LV_U);                // roughly +z (anterior)
  if (LV_E2[2] < 0) LV_E2 = mul(LV_E2, -1);

  function lvAxis(s) { return add(LV_B, mul(LV_U, s)); }
  function lvRi(s) { var t = (s - LV_SC) / (s < LV_SC ? LV_UP : LV_DOWN); return t * t >= 1 ? 0 : LV_A * Math.sqrt(1 - t * t); }
  function lvRo(s) {
    var up = LV_UP + 0.45, down = LV_DOWN + 0.6, t = (s - LV_SC) / (s < LV_SC ? up : down);
    return t * t >= 1 ? 0 : (LV_A + LV_WALL) * Math.sqrt(1 - t * t);
  }
  function lvDir(phiDeg) { var p = phiDeg * Math.PI / 180; return add(mul(LV_E1, Math.cos(p)), mul(LV_E2, Math.sin(p))); }

  // valves: centre, flow direction, radius
  var AV = { c: v3(0.55, 1.75, -0.40), n: null, R: 1.02, part: PART.AORTIC };
  var PV = { c: v3(-1.95, 1.95, 0.00), n: null, R: 0.95, part: PART.PULMONARY };
  var MV = { c: v3(3.15, 1.00, -0.50), n: norm(v3(-0.22, -1, 0.05)), R: 1.22, part: PART.MITRAL };
  var TV = { c: v3(-3.70, 0.80, -0.20), n: norm(v3(0.30, -1, 0.10)), R: 1.40, part: PART.TRICUSPID };

  // great vessels [x, y, z, lumen radius]
  var aortaPts = [
    [0.55, 1.75, -0.40, 1.00], [0.42, 2.35, -0.50, 1.17], [0.28, 3.05, -0.62, 1.04], [0.10, 4.3, -0.85, 1.00],
    [0.05, 5.5, -1.05, 1.00], [0.55, 6.55, -1.45, 0.98], [1.75, 7.0, -2.05, 0.95], [2.95, 6.55, -2.75, 0.92],
    [3.45, 5.5, -3.15, 0.88], [3.55, 4.2, -3.35, 0.86]
  ];
  var ptPts = [
    [-1.95, 1.95, 0.00, 0.95], [-1.82, 2.6, 0.55, 1.02], [-1.40, 3.3, 1.15, 0.95], [-0.50, 4.05, 1.52, 0.93],
    [0.75, 4.6, 1.38, 0.92], [1.75, 4.95, 0.45, 0.88], [2.2, 5.1, -0.30, 0.80]
  ];
  var lpaPts = [[1.9, 5.0, 0.0, 0.74], [2.9, 5.2, -0.75, 0.70], [4.2, 5.25, -1.3, 0.66], [5.9, 5.15, -1.7, 0.64]];
  var rpaPts = [[1.9, 5.0, 0.0, 0.74], [1.45, 5.15, -1.5, 0.70], [0.3, 5.1, -2.75, 0.68], [-1.6, 5.0, -3.0, 0.66], [-3.9, 4.9, -2.95, 0.64], [-7.2, 4.8, -2.9, 0.62]];
  var svcPts = [[-3.85, 3.6, -0.6, 0.86], [-3.85, 4.8, -0.6, 0.84], [-3.8, 6.4, -0.6, 0.80], [-3.8, 8.6, -0.6, 0.80]];
  var ivcPts = [[-4.1, 1.7, -1.3, 0.92], [-4.5, 0.5, -1.9, 0.90], [-4.95, -1.2, -2.55, 0.88], [-5.1, -3.2, -2.8, 0.88], [-5.1, -5.6, -2.8, 0.88]];
  var pvPts = [
    [[1.1, 3.35, -2.15, 0.48], [-1.2, 3.5, -3.05, 0.46], [-3.6, 3.6, -3.3, 0.45], [-7.2, 3.6, -3.3, 0.45]],     // right superior
    [[1.2, 2.3, -2.25, 0.48], [-1.2, 2.25, -3.1, 0.46], [-3.6, 2.2, -3.35, 0.45], [-7.2, 2.2, -3.35, 0.45]],   // right inferior
    [[4.3, 3.4, -1.4, 0.48], [5.2, 3.65, -1.7, 0.46], [6.4, 3.8, -1.8, 0.45]],                                 // left superior
    [[4.3, 2.4, -1.6, 0.48], [5.2, 2.3, -1.9, 0.46], [6.4, 2.25, -2.0, 0.45]]                                  // left inferior
  ];
  var branchPts = [   // brachiocephalic, left common carotid, left subclavian
    [[0.75, 6.9, -1.55, 0.52], [0.55, 7.9, -1.5, 0.5], [0.45, 9.2, -1.45, 0.5]],
    [[1.75, 7.3, -2.05, 0.40], [1.8, 8.2, -2.05, 0.38], [1.85, 9.2, -2.05, 0.38]],
    [[2.7, 7.0, -2.6, 0.44], [2.95, 8.0, -2.65, 0.42], [3.1, 9.2, -2.7, 0.42]]
  ];

  AV.n = norm(sub(aortaPts[1], aortaPts[0]));
  PV.n = norm(sub(ptPts[1], ptPts[0]));

  var aorta = new Tube(aortaPts, 0.45), ptrunk = new Tube(ptPts, 0.45), lpa = new Tube(lpaPts, 0.5), rpa = new Tube(rpaPts, 0.5);
  var svc = new Tube(svcPts, 0.7), ivc = new Tube(ivcPts, 0.6);
  var pveins = pvPts.map(function (p) { return new Tube(p, 0.6); });
  var branches = branchPts.map(function (p) { return new Tube(p, 0.6); });

  // chambers
  var rvEll = new Ell(v3(-1.95, -2.35, 0.30), v3(3.0, 3.3, 2.5));
  var rvot = new Cap(v3(-2.05, -0.9, 0.25), PV.c, 1.05, 0.95);
  var laEll = new Ell(v3(2.6, 2.85, -0.9), v3(2.5, 1.6, 1.9));
  var laa = new Ell(v3(4.2, 3.4, 0.85), v3(0.95, 0.72, 0.8));
  var raEll = new Ell(v3(-3.85, 2.95, -0.5), v3(1.9, 1.95, 2.0));
  var raa = new Ell(v3(-2.75, 3.75, 1.25), v3(1.15, 0.8, 0.75));
  var lvot = new Cap(v3(1.35, -0.9, -0.3), AV.c, 1.05, 0.98);
  var mvNeck = new Cap(sub(MV.c, mul(MV.n, 0.75)), add(MV.c, mul(MV.n, 0.9)), MV.R);
  var tvNeck = new Cap(sub(TV.c, mul(TV.n, 0.75)), add(TV.c, mul(TV.n, 0.9)), TV.R);

  // papillary muscles and the moderator band (solid, standing in the cavities)
  var PAP = {
    lvA: { base: add(lvAxis(5.5), mul(lvDir(-28), lvRi(5.5) * 1.05)), tip: add(lvAxis(3.3), mul(lvDir(-28), lvRi(3.3) * 0.50)) },
    lvP: { base: add(lvAxis(5.5), mul(lvDir(-118), lvRi(5.5) * 1.05)), tip: add(lvAxis(3.3), mul(lvDir(-118), lvRi(3.3) * 0.50)) },
    rvA: { base: v3(-4.55, -3.4, -0.25), tip: v3(-3.75, -1.65, -0.3) },
    rvP: { base: v3(-3.3, -3.9, -1.75), tip: v3(-3.2, -1.9, -1.0) }
  };
  var papCaps = [
    new Cap(PAP.lvA.base, PAP.lvA.tip, 0.55, 0.26), new Cap(PAP.lvP.base, PAP.lvP.tip, 0.55, 0.26),
    new Cap(PAP.rvA.base, PAP.rvA.tip, 0.42, 0.22), new Cap(PAP.rvP.base, PAP.rvP.tip, 0.36, 0.2)
  ];
  var MOD_A = v3(-1.85, -3.55, -0.25), MOD_B = v3(-4.35, -3.2, -0.25);
  var modBand = new Cap(MOD_A, MOD_B, 0.24, 0.22);

  // flat ends of the vessels: [point on the cut, outward direction, radius of the removed blob]
  var cutters = [
    [v3(-3.8, 7.7, -0.6), v3(0, 1, 0), 1.9], [v3(-5.1, -4.9, -2.8), v3(0, -1, 0), 1.9],
    [v3(3.42, 5.6, -3.1), norm(v3(0.05, -1, -0.12)), 1.3],
    [v3(5.35, 5.2, -1.6), norm(v3(1, -0.05, -0.2)), 1.5], [v3(-6.4, 4.82, -2.92), v3(-1, 0, 0), 1.2],
    [v3(-6.4, 3.6, -3.3), v3(-1, 0, 0), 1.0], [v3(-6.4, 2.2, -3.35), v3(-1, 0, 0), 1.0],
    [v3(5.75, 3.72, -1.75), v3(1, 0, 0), 0.95], [v3(5.75, 2.28, -1.95), v3(1, 0, 0), 0.95],
    [v3(0.5, 8.5, -1.47), v3(0, 1, 0), 1.2], [v3(1.82, 8.5, -2.05), v3(0, 1, 0), 1.1], [v3(3.0, 8.5, -2.67), v3(0, 1, 0), 1.1]
  ];

  var coronaries = [];   // filled in build(): Tubes lying on the surface

  /* ---------- the field ---------- */
  var F = {};            // components of the last evaluation
  var WALL = { rv: 0.45, atr: 0.30, ao: 0.27, pa: 0.26, vein: 0.22, pv: 0.25, br: 0.20 };

  function trab(x, y, z) {
    var n = Math.sin(5.1 * x + 1.7 * y) * Math.sin(4.3 * y - 2.2 * z + 1.0) * Math.sin(4.9 * z + 1.3 * x + 2.0);
    return n > 0 ? n : 0;
  }

  function evalAll(x, y, z) {
    var lvEgg = lvCavEgg.d(x, y, z), lvOut = lvOutEgg.d(x, y, z), dLvot = lvot.d(x, y, z);
    var sAx = (x - LV_B[0]) * LV_U[0] + (y - LV_B[1]) * LV_U[1] + (z - LV_B[2]) * LV_U[2];
    var lvC = smin(lvEgg, dLvot, 0.35);
    var rvE = rvEll.d(x, y, z), dRvot = rvot.d(x, y, z);
    var rvRaw = smin(rvE, dRvot, 0.6);
    var aoD = aorta.d(x, y, z), brD = Math.min(branches[0].d(x, y, z), branches[1].d(x, y, z), branches[2].d(x, y, z));
    var ptD = Math.max(ptrunk.d(x, y, z), -(aoD - 0.34)), lpaD = Math.max(lpa.d(x, y, z), -(aoD - 0.34)), rpaD = rpa.d(x, y, z);
    var svcD = svc.d(x, y, z), ivcD = ivc.d(x, y, z);
    var pvR = Math.min(pveins[0].d(x, y, z), pveins[1].d(x, y, z)), pvL = Math.min(pveins[2].d(x, y, z), pveins[3].d(x, y, z));
    var laE = smin(laEll.d(x, y, z), laa.d(x, y, z), 0.35);
    var raE = smin(raEll.d(x, y, z), raa.d(x, y, z), 0.35);
    var dMv = mvNeck.d(x, y, z), dTv = tvNeck.d(x, y, z);

    // cavities: each keeps a wall's distance from its neighbours
    var rvC = smax(rvRaw, -lvOut, 0.3);
    rvC = Math.max(rvC, -(dLvot - 0.45), -(aoD - 0.32));
    var laC = Math.max(laE, -(lvC - 0.4), -(aoD - 0.3), -(ptD - 0.28), -(raE - 0.38), -(lpaD - 0.26));
    var raC = Math.max(raE, -(rvRaw - 0.4), -(aoD - 0.3), -(ptD - 0.28));
    var ivcC = Math.max(ivcD, -(rvRaw - 0.6));
    var pvRC = Math.max(pvR, -(raE - 0.4), -(svcD - 0.3), -(aoD - 0.36));
    var rpaC = Math.max(rpaD, -(aoD - 0.3), -(svcD - 0.3), -(raE - 0.4), -(laE - 0.36));
    var paD = Math.min(ptD, lpaD, rpaC);
    var pvD = Math.min(pvRC, pvL);

    // trabeculae: ridges in the apical two thirds of the ventricles, smooth outflow tracts
    var tr = trab(x, y, z);
    var wL = sstep(1.8, 3.6, sAx), wR = sstep(-0.6, -2.2, y) * sstep(1.2, 0.3, -dRvot - 0.2 + 1.0);
    var lvCt = lvC + 0.11 * tr * wL, rvCt = rvC + 0.15 * tr * sstep(-0.3, -1.8, y);

    var blood = Math.min(lvCt, rvCt, laC, raC, dMv, dTv, aoD, brD, paD, svcD, ivcC, pvD);

    var k = 0.28;
    var tissue = smin(lvOut, rvRaw - WALL.rv, k);
    tissue = smin(tissue, laE - WALL.atr, k);
    tissue = smin(tissue, raE - WALL.atr, k);
    tissue = smin(tissue, dLvot - 0.42, k);
    tissue = smin(tissue, Math.min(dMv, dTv) - 0.36, k);
    tissue = smin(tissue, aoD - WALL.ao, 0.2);
    tissue = smin(tissue, brD - WALL.br, 0.12);
    tissue = smin(tissue, paD - WALL.pa, 0.2);
    tissue = smin(tissue, svcD - WALL.vein, 0.2);
    tissue = smin(tissue, ivcC - WALL.vein, 0.2);
    tissue = smin(tissue, pvD - WALL.pv, 0.15);
    var cor = 1e9;
    for (var i = 0; i < coronaries.length; i++) { var cd = coronaries[i].d(x, y, z); if (cd < cor) cor = cd; }
    if (cor < 1) tissue = smin(tissue, cor, 0.1);

    var solid = Math.max(tissue, -blood);
    var pap = Math.min(papCaps[0].d(x, y, z), papCaps[1].d(x, y, z), papCaps[2].d(x, y, z), papCaps[3].d(x, y, z), modBand.d(x, y, z));
    if (pap < 0.5) solid = smin(solid, pap, 0.18);
    for (var c = 0; c < cutters.length; c++) {
      var cu = cutters[c], q = cu[0], n = cu[1];
      var dx = x - q[0], dy = y - q[1], dz = z - q[2];
      var cut = Math.max(-(dx * n[0] + dy * n[1] + dz * n[2]), Math.sqrt(dx * dx + dy * dy + dz * dz) - cu[2]);
      if (-cut > solid) solid = -cut;
    }

    F.lvC = lvC; F.lvOut = lvOut; F.rvC = rvC; F.rvRaw = rvRaw; F.rvE = rvE; F.laE = laE; F.raE = raE; F.laC = laC; F.raC = raC;
    F.ao = Math.min(aoD, brD + 0.1); F.pa = paD; F.svc = svcD; F.ivc = ivcC; F.pv = pvD; F.blood = blood; F.tissue = tissue;
    F.pap = pap; F.cor = cor; F.s = sAx; F.lvot = dLvot; F.mv = dMv; F.tv = dTv; F.lvCt = lvCt; F.rvCt = rvCt;
    return solid;
  }

  function rvCavSmooth(x, y, z) {
    var rvRaw = smin(rvEll.d(x, y, z), rvot.d(x, y, z), 0.6);
    return smax(rvRaw, -lvOutEgg.d(x, y, z), 0.3);
  }
  function lvCavSmooth(x, y, z) { return smin(lvCavEgg.d(x, y, z), lvot.d(x, y, z), 0.35); }

  function grad(fn, p, h) {
    h = h || 0.04;
    return [
      fn(p[0] + h, p[1], p[2]) - fn(p[0] - h, p[1], p[2]),
      fn(p[0], p[1] + h, p[2]) - fn(p[0], p[1] - h, p[2]),
      fn(p[0], p[1], p[2] + h) - fn(p[0], p[1], p[2] - h)
    ];
  }
  /* Move p onto the zero surface of fn, then `inset` cm toward negative values. */
  function snap(fn, p, inset) {
    var q = p.slice(), g;
    for (var i = 0; i < 6; i++) {
      var d = fn(q[0], q[1], q[2]);
      g = grad(fn, q); var l = len(g) / 0.08 || 1;
      g = mul(g, 1 / (len(g) || 1));
      q = sub(q, mul(g, d / Math.max(l, 0.3)));
    }
    g = norm(grad(fn, q));
    return sub(q, mul(g, inset || 0));
  }

  /* ---------- deformation weights (how much each point follows each chamber) ---------- */
  function weightsAt(x, y, z, out) {
    out = out || [0, 0, 0, 0, 0];
    var lvOut = lvOutEgg.d(x, y, z);
    var rvRaw = smin(rvEll.d(x, y, z), rvot.d(x, y, z), 0.6);
    var laE = smin(laEll.d(x, y, z), laa.d(x, y, z), 0.35), raE = smin(raEll.d(x, y, z), raa.d(x, y, z), 0.35);
    out[0] = 1 - sstep(0.0, 1.3, lvOut);
    // length of right-ventricular cavity between the septum and this point, along the ray from the LV axis
    var px = x - LV_B[0], py = y - LV_B[1], pz = z - LV_B[2];
    var sRaw = px * LV_U[0] + py * LV_U[1] + pz * LV_U[2], s = clamp(sRaw, 0, LV_L);
    var ax = LV_B[0] + LV_U[0] * s, ay = LV_B[1] + LV_U[1] * s, az = LV_B[2] + LV_U[2] * s;
    var loc = 1 - sstep(0.15, 1.3, rvRaw - WALL.rv), tRv = 0;
    if (loc > 0) {
      var dx = x - ax, dy = y - ay, dz = z - az, L = Math.sqrt(dx * dx + dy * dy + dz * dz), N = 18;
      for (var i = 0; i < N; i++) {
        var f = (i + 0.5) / N;
        var c = rvCavSmooth(ax + dx * f, ay + dy * f, az + dz * f);
        tRv += clamp(0.5 - c / 0.25, 0, 1);
      }
      tRv = tRv / N * L * loc;
    }
    out[1] = tRv;
    out[2] = 1 - sstep(-0.1, 1.0, laE - WALL.atr);
    out[3] = 1 - sstep(-0.1, 1.0, raE - WALL.atr);
    // base-to-apex pull: full at the valve plane, none at the apex, fading upward into the atria and roots
    var sn = sRaw / LV_L;
    var g = sn >= 0 ? clamp(1 - sn, 0, 1) : sstep(-0.42, 0, sn);
    var body = Math.min(lvOut, rvRaw - WALL.rv, laE - WALL.atr, raE - WALL.atr, aorta.d(x, y, z) - WALL.ao, ptrunk.d(x, y, z) - WALL.pa);
    out[4] = g * (1 - sstep(0.3, 1.5, body));
    return out;
  }

  /* JS twin of the vertex-shader deformation (used for labels and checks). st = renderer state. */
  function deformPoint(p, w, st) {
    var d = sub(p, LV_B), s = clamp(dot(d, LV_U), 0, LV_L);
    var ax = add(LV_B, mul(LV_U, s)), rv = sub(p, ax), r = len(rv);
    var Ri = lvRi(s), Ri2 = Ri * Ri, r2 = r * r, lam = st.lamLV;
    var rn = r2 >= Ri2 ? Math.sqrt(Math.max(r2 - (1 - lam * lam) * Ri2, 1e-6)) : r * lam;
    var dir = r > 1e-4 ? mul(rv, 1 / r) : [0, 0, 0];
    var q = add(p, mul(dir, (rn - r) * w[0]));
    q = sub(q, mul(dir, st.rvSqueeze * w[1]));
    q = add(q, mul(sub(laEll.c, p), (1 - st.lamLA) * w[2]));
    q = add(q, mul(sub(raEll.c, p), (1 - st.lamRA) * w[3]));
    q = add(q, mul(LV_U, st.longPull * w[4]));
    return q;
  }

  /* ---------- surface nets ---------- */
  var GRID = { lo: v3(-7.0, -8.3, -4.75), hi: v3(6.3, 9.0, 4.3), h: 0.125 };

  function Mesher() {
    var g = GRID;
    this.nx = Math.ceil((g.hi[0] - g.lo[0]) / g.h); this.ny = Math.ceil((g.hi[1] - g.lo[1]) / g.h); this.nz = Math.ceil((g.hi[2] - g.lo[2]) / g.h);
    this.vals = new Float32Array((this.nx + 1) * (this.ny + 1) * (this.nz + 1));
    this.k = 0;
  }
  /* sample a few z-slabs; returns progress 0..1 */
  Mesher.prototype.sampleSome = function (budgetMs) {
    var g = GRID, nx = this.nx, ny = this.ny, nz = this.nz, vals = this.vals, t0 = Date.now();
    var sx = nx + 1, sxy = sx * (ny + 1);
    while (this.k <= nz) {
      var k = this.k, z = g.lo[2] + k * g.h;
      for (var j = 0; j <= ny; j++) {
        var y = g.lo[1] + j * g.h, o = k * sxy + j * sx;
        for (var i = 0; i <= nx; i++) vals[o + i] = evalAll(g.lo[0] + i * g.h, y, z);
      }
      this.k++;
      if (Date.now() - t0 > budgetMs) break;
    }
    return this.k / (nz + 1);
  };
  Mesher.prototype.extract = function () {
    var g = GRID, nx = this.nx, ny = this.ny, nz = this.nz, vals = this.vals, h = g.h;
    var sx = nx + 1, sxy = sx * (ny + 1);
    var cellIdx = new Int32Array(nx * ny * nz).fill(-1);
    var pos = [], idx = [];
    var co = [0, 1, sx, sx + 1, sxy, sxy + 1, sxy + sx, sxy + sx + 1];
    var cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
    var edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    var v = new Float32Array(8), i, j, k, e;
    for (k = 0; k < nz; k++) for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      var o = k * sxy + j * sx + i, mask = 0;
      for (e = 0; e < 8; e++) { v[e] = vals[o + co[e]]; if (v[e] < 0) mask |= 1 << e; }
      if (mask === 0 || mask === 255) continue;
      var px = 0, py = 0, pz = 0, n = 0;
      for (e = 0; e < 12; e++) {
        var a = edges[e][0], b = edges[e][1];
        if ((v[a] < 0) === (v[b] < 0)) continue;
        var t = v[a] / (v[a] - v[b]);
        px += cx[a] + (cx[b] - cx[a]) * t; py += cy[a] + (cy[b] - cy[a]) * t; pz += cz[a] + (cz[b] - cz[a]) * t; n++;
      }
      cellIdx[(k * ny + j) * nx + i] = pos.length / 3;
      pos.push(g.lo[0] + (i + px / n) * h, g.lo[1] + (j + py / n) * h, g.lo[2] + (k + pz / n) * h);
    }
    function cell(i, j, k) { return cellIdx[(k * ny + j) * nx + i]; }
    function quad(a, b, c, d, flip) {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
    }
    for (k = 1; k < nz; k++) for (j = 1; j < ny; j++) for (i = 1; i < nx; i++) {
      var o2 = k * sxy + j * sx + i, s0 = vals[o2] < 0;
      if (s0 !== (vals[o2 + 1] < 0)) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !s0);
      if (s0 !== (vals[o2 + sx] < 0)) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !s0);
      if (s0 !== (vals[o2 + sxy] < 0)) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !s0);
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
  };

  /* ---------- per-vertex data ---------- */
  var SA_POS = null, ESC_FOCUS = null;

  function partAt(p) {
    evalAll(p[0], p[1], p[2]);
    if (F.pap < 0.07) return PART.PAPILLARY;
    if (F.cor < 0.07 && F.blood > 0.3) return PART.CORONARY;
    var best = PART.LV, bs = Math.min(F.lvOut, F.lvot - 0.42, F.mv - 0.3 + (p[1] > MV.c[1] ? 9 : 0));
    function tryPart(id, sc) { if (sc < bs) { bs = sc; best = id; } }
    tryPart(PART.RV, Math.min(F.rvRaw - WALL.rv, F.tv - 0.3 + (p[1] > TV.c[1] ? 9 : 0)));
    tryPart(PART.LA, F.laE - WALL.atr);
    tryPart(PART.RA, F.raE - WALL.atr);
    tryPart(PART.AORTA, F.ao - WALL.ao - (F.s < -0.12 * 7.7 ? 0.25 : 0));
    tryPart(PART.PA, F.pa - WALL.pa - 0.1);
    tryPart(PART.SVC, F.svc - WALL.vein - (p[1] > 4.7 ? 0.3 : -0.2));
    tryPart(PART.IVC, F.ivc - WALL.vein - (p[1] < 0.9 ? 0.3 : -0.2));
    tryPart(PART.PVEINS, F.pv - WALL.pv - ((p[0] < -0.2 || p[0] > 4.9) ? 0.3 : -0.25));
    if ((best === PART.LV || best === PART.RV) && F.rvE < 0.4 && F.lvOut < 0.25 && F.s > 0.2 && F.lvot > 0.2) best = PART.SEPTUM;
    return best;
  }

  function buildVertexData(mesh, onProgress) {
    var n = mesh.pos.length / 3;
    var nrm = new Float32Array(n * 3), w = new Float32Array(n * 4), misc = new Float32Array(n * 4), lat = new Float32Array(n * 3);
    var ww = [0, 0, 0, 0, 0], h = 0.05;
    var maxA = 0, maxE = 0, i, p;
    for (i = 0; i < n; i++) {
      var x = mesh.pos[i * 3], y = mesh.pos[i * 3 + 1], z = mesh.pos[i * 3 + 2];
      var gx = evalAll(x + h, y, z) - evalAll(x - h, y, z), gy = evalAll(x, y + h, z) - evalAll(x, y - h, z), gz = evalAll(x, y, z + h) - evalAll(x, y, z - h);
      var gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      nrm[i * 3] = gx / gl; nrm[i * 3 + 1] = gy / gl; nrm[i * 3 + 2] = gz / gl;
      p = [x, y, z];
      var part = partAt(p);            // leaves F for this point
      var endo = F.blood < 0.09 && F.pap > 0.02 ? 1 : 0;
      weightsAt(x, y, z, ww);
      w[i * 4] = ww[0]; w[i * 4 + 1] = ww[1]; w[i * 4 + 2] = ww[2]; w[i * 4 + 3] = ww[3];
      misc[i * 4] = ww[4]; misc[i * 4 + 1] = part; misc[i * 4 + 2] = endo; misc[i * 4 + 3] = 0;
      // electrical activation delays (s). <0 means "this tissue is not part of that wave".
      var la = -1, lv = -1, le = -1;
      if (part === PART.LA || part === PART.RA) {
        la = len(sub(p, SA_POS)); if (la > maxA) maxA = la;
      } else if (part === PART.LV || part === PART.RV || part === PART.SEPTUM || part === PART.PAPILLARY) {
        var sn = clamp(F.s / LV_L, 0, 1.05);
        var cavD = Math.min(Math.abs(F.lvCt), Math.abs(F.rvCt)), outD = Math.abs(F.tissue);
        var depth = cavD / (cavD + outD + 1e-4);                    // 0 at the endocardium, 1 at the epicardium
        if (part === PART.SEPTUM) lv = 0.004 + 0.030 * Math.abs(sn - 0.45) / 0.55 + 0.012 * Math.min(depth, 1 - depth) * 2;
        else lv = 0.016 + 0.038 * (1 - sn) + 0.024 * depth;
        le = len(sub(p, ESC_FOCUS)); if (le > maxE) maxE = le;
      }
      lat[i * 3] = la; lat[i * 3 + 1] = lv; lat[i * 3 + 2] = le;
    }
    for (i = 0; i < n; i++) {
      if (lat[i * 3] >= 0) lat[i * 3] = 0.008 + 0.085 * lat[i * 3] / maxA;         // atria finish within about 90 ms
      if (lat[i * 3 + 2] >= 0) lat[i * 3 + 2] = 0.005 + 0.150 * lat[i * 3 + 2] / maxE; // slow muscle-to-muscle spread
    }
    mesh.pos2 = mesh.pos; mesh.nrm = nrm; mesh.w = w; mesh.misc = misc; mesh.lat = lat;
    mesh.maxA = maxA; mesh.maxE = maxE;
  }

  /* ---------- generic mesh builder for valves, chordae and conduction tubes ---------- */
  function MB() { this.pos = []; this.pos2 = []; this.nrm = []; this.w = []; this.misc = []; this.lat = []; this.idx = []; this.n = 0; }
  MB.prototype.v = function (p, p2, nrm, part, lat, kind) {
    var ww = weightsAt(p[0], p[1], p[2]);
    this.pos.push(p[0], p[1], p[2]); this.pos2.push(p2[0], p2[1], p2[2]); this.nrm.push(nrm[0], nrm[1], nrm[2]);
    this.w.push(ww[0], ww[1], ww[2], ww[3]); this.misc.push(ww[4], part, 0, kind || 0);
    lat = lat || [-1, -1, -1]; this.lat.push(lat[0], lat[1], lat[2]);
    return this.n++;
  };
  MB.prototype.done = function () {
    return {
      pos: new Float32Array(this.pos), pos2: new Float32Array(this.pos2), nrm: new Float32Array(this.nrm), w: new Float32Array(this.w),
      misc: new Float32Array(this.misc), lat: new Float32Array(this.lat), idx: new Uint32Array(this.idx)
    };
  };
  /* a (u,v) patch given closed and open position functions */
  MB.prototype.patch = function (fc, fo, nu, nv, part) {
    var base = this.n, i, j, e = 0.01;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var a = i / nu, b = j / nv, p = fc(a, b), p2 = fo(a, b);
      var du = sub(fc(Math.min(a + e, 1), b), fc(Math.max(a - e, 0), b)), dv = sub(fc(a, Math.min(b + e, 1)), fc(a, Math.max(b - e, 0)));
      var nn = cross(du, dv); if (len(nn) < 1e-9) nn = [0, 1, 0];
      this.v(p, p2, norm(nn), part, null, 1);
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var q = base + j * (nu + 1) + i;
      this.idx.push(q, q + 1, q + nu + 2, q, q + nu + 2, q + nu + 1);
    }
  };
  /* tube along a polyline; pts2 optional second pose; latFn(i) gives the activation attribute */
  MB.prototype.tube = function (pts, pts2, radius, sides, part, latFn, kind) {
    var n = pts.length, base = this.n, i, j, prevN = null;
    pts2 = pts2 || pts;
    for (i = 0; i < n; i++) {
      var t = norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]));
      var nn = prevN ? perp(t, prevN) : perp(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
      prevN = nn; var bb = cross(t, nn);
      var r = typeof radius === 'function' ? radius(i / (n - 1)) : radius;
      for (j = 0; j < sides; j++) {
        var ang = 2 * Math.PI * j / sides, d = add(mul(nn, Math.cos(ang)), mul(bb, Math.sin(ang)));
        this.v(add(pts[i], mul(d, r)), add(pts2[i], mul(d, r)), d, part, latFn ? latFn(i / (n - 1)) : null, kind || 0);
      }
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < sides; j++) {
      var a = base + i * sides + j, b = base + i * sides + (j + 1) % sides, c = a + sides, d2 = b + sides;
      this.idx.push(a, c, b, b, c, d2);
    }
  };
  MB.prototype.blob = function (c, r, part, lat, kind) {
    var nu = 12, nv = 8, base = this.n, i, j;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var th = Math.PI * j / nv, ph = 2 * Math.PI * i / nu;
      var d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      var p = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
      this.v(p, p, d, part, lat, kind || 0);
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var q = base + j * (nu + 1) + i;
      this.idx.push(q, q + nu + 1, q + 1, q + 1, q + nu + 1, q + nu + 2);
    }
  };

  /* ---------- valves ---------- */
  function semilunar(V, rot) {
    var mb = new MB(), n = V.n, e1 = perp(n, [1, 0, 0.2]), e2 = cross(n, e1), R = V.R * 1.04, H = V.R * 0.92;
    function ring(th, r, hgt) { return add(add(V.c, mul(add(mul(e1, Math.cos(th)), mul(e2, Math.sin(th))), r)), mul(n, hgt)); }
    for (var c = 0; c < 3; c++) (function (c) {
      var t0 = (rot + c * 120) * Math.PI / 180, t1 = t0 + 2 * Math.PI / 3;
      function attach(a) { return ring(t0 + (t1 - t0) * a, R, H * Math.pow(Math.abs(2 * a - 1), 1.6)); }
      function freeC(a) {
        var gap = 0.02 * R;
        return a < 0.5 ? ring(t0 + 0.06, Math.max(gap, R * (1 - 2 * a)), H * (1 - 0.28 * 2 * a))
          : ring(t1 - 0.06, Math.max(gap, R * (2 * a - 1)), H * (1 - 0.28 * (2 - 2 * a)));
      }
      function freeO(a) { return ring(t0 + (t1 - t0) * a, R * 0.87, H * 1.08); }
      function fc(a, b) { var p = mix(attach(a), freeC(a), b); return sub(p, mul(n, 0.20 * R * Math.sin(Math.PI * b) * Math.sin(Math.PI * a))); }
      function fo(a, b) { return mix(attach(a), freeO(a), Math.pow(b, 0.8)); }
      mb.patch(fc, fo, 14, 7, V.part);
    })(c);
    return mb.done();
  }

  function atrioventricular(V, toward, spans, chordTargets, mitral) {
    var mb = new MB(), n = V.n, a1 = perp(n, toward), a2 = cross(n, a1), R = V.R, chords = [];
    function ann(th) { return add(V.c, mul(add(mul(a1, Math.cos(th)), mul(a2, Math.sin(th))), R)); }
    function radial(th) { return add(mul(a1, Math.cos(th)), mul(a2, Math.sin(th))); }
    var K1 = -65 * Math.PI / 180, K2 = 65 * Math.PI / 180;
    function bez(t) {
      var A = ann(K1), B = add(V.c, mul(a1, -0.74 * R)), C = ann(K2), u = 1 - t;
      var p = add(add(mul(A, u * u), mul(B, 2 * u * t)), mul(C, t * t));
      return add(p, mul(n, 0.24 * R * Math.sin(Math.PI * t)));
    }
    var cc = add(add(V.c, mul(n, 0.26 * R)), mul(a1, 0.08 * R));
    spans.forEach(function (sp, li) {
      var t0 = sp[0] * Math.PI / 180, t1 = sp[1] * Math.PI / 180;
      function th(a) { return t0 + (t1 - t0) * a; }
      function freeC(a) {
        if (mitral) return li === 0 ? bez(a) : bez(1 - a);
        var s = a < 0.5 ? sstep(0, 1, 2 * a) : sstep(0, 1, 2 - 2 * a);
        return mix(ann(a < 0.5 ? t0 : t1), cc, s);
      }
      function fc(a, b) {
        var p = mix(ann(th(a)), freeC(a), b);
        return sub(p, mul(n, 0.07 * R * Math.sin(Math.PI * b) * Math.sin(Math.PI * a)));
      }
      function fo(a, b) {
        var L = len(sub(freeC(a), ann(th(a)))) * 0.93, g = Math.sqrt(Math.sin(Math.PI * a));
        var inw = Math.min(0.30 * R * g, L * 0.5), down = Math.sqrt(Math.max(L * L - inw * inw, 0));
        return add(sub(ann(th(a)), mul(radial(th(a)), inw * b)), mul(n, down * b));
      }
      mb.patch(fc, fo, 16, 8, V.part);
      // chordae from the free edge to the papillary tips
      [0.2, 0.36, 0.5, 0.64, 0.8].forEach(function (a) {
        var ec = fc(a, 1), eo = fo(a, 1), best = null, bd = 1e9;
        chordTargets.forEach(function (tp) { var d = len(sub(tp, ec)); if (d < bd) { bd = d; best = tp; } });
        chords.push([ec, eo, best]);
      });
    });
    var cm = new MB();
    chords.forEach(function (c) {
      var N = 4, pc = [], po = [];
      for (var i = 0; i <= N; i++) { pc.push(mix(c[0], c[2], i / N)); po.push(mix(c[1], c[2], i / N)); }
      cm.tube(pc, po, 0.035, 4, PART.PAPILLARY, null, 0);
    });
    return { leaflets: mb.done(), chordae: cm.done() };
  }

  /* ---------- conduction system ---------- */
  function buildConduction() {
    var mb = new MB(), rnd = makeRng(7), out = {};
    function outer(x, y, z) { evalAll(x, y, z); return F.tissue; }
    function raCav(x, y, z) { evalAll(x, y, z); return F.raC; }
    function lvCav(x, y, z) { evalAll(x, y, z); return F.lvCt; }
    function rvCav(x, y, z) { evalAll(x, y, z); return F.rvCt; }

    // SA node: under the outer surface where the superior vena cava meets the right atrium
    var sa = snap(outer, v3(-5.3, 4.35, 0.55), -0.02);
    out.sa = sa;
    mb.blob(sa, [0.2, 0.42, 0.2], PART.SA, [0, 0, 0], 2);

    // AV node: floor of the right atrium, at the bottom of the atrial septum next to the tricuspid ring
    var avn0 = snap(raCav, v3(-2.25, 1.75, -1.0), 0.05), avn1 = snap(raCav, v3(-1.95, 1.25, -0.75), 0.03);
    out.avn = mix(avn0, avn1, 0.5);
    var avPts = []; for (var i = 0; i <= 6; i++) avPts.push(mix(avn0, avn1, i / 6));
    mb.tube(avPts, null, function (t) { return 0.13 + 0.10 * Math.sin(Math.PI * t); }, 7, PART.AVN, function (t) { return [1, t, 0]; }, 2);

    // bundle of His: through the fibrous ring to the crest of the muscular septum
    var crest = v3(-0.72, 0.05, -0.35);
    var hisPts = resample([avn1.concat(0), [-1.4, 0.85, -0.55, 0], crest.concat(0)], 0.25).map(function (p) { return p.slice(0, 3); });
    out.his = hisPts[Math.floor(hisPts.length / 2)];
    mb.tube(hisPts, null, 0.10, 6, PART.HIS, function (t) { return [2, t, 0]; }, 2);

    // left bundle branch: fans down the left side of the septum in two fascicles
    function lvSeptal(s, phi) { return snap(lvCav, add(lvAxis(s), mul(lvDir(phi), lvRi(s) * 0.98)), 0.06); }
    function rvSeptal(s, off) { return snap(rvCav, add(add(lvAxis(s), mul(lvDir(180), lvRo(s) * 1.02)), mul(LV_E2, off)), 0.06); }
    var purk = [];
    function fascicle(phi0, phi1) {
      var pts = [crest];
      for (var s = 1.5; s <= 6.6; s += 0.45) pts.push(lvSeptal(s, phi0 + (phi1 - phi0) * (s - 1.5) / 5.1));
      mb.tube(pts, null, 0.075, 5, PART.BRANCH, function (t) { return [3, t, 0]; }, 2);
      purk.push({ p: pts[pts.length - 1], fn: lvCav, dir: norm(sub(pts[pts.length - 1], pts[pts.length - 3])), t: 0, gen: 0 });
      purk.push({ p: pts[Math.floor(pts.length * 0.6)], fn: lvCav, dir: norm(add(mul(LV_U, 0.5), mul(LV_E2, phi1 > 180 ? -1 : 1))), t: 0.1, gen: 0 });
      return pts;
    }
    var fa = fascicle(172, 140), fp = fascicle(188, 222);
    out.lbb = fa[4];
    // right bundle branch: down the right side of the septum, then across the moderator band
    var rb = [crest, v3(-1.25, -0.35, -0.3)];
    for (var s2 = 1.6; s2 <= 4.2; s2 += 0.45) rb.push(rvSeptal(s2, -0.1));
    var m0 = rb[rb.length - 1];
    for (var k = 1; k <= 5; k++) rb.push(add(mix(MOD_A, MOD_B, k / 5), [0, 0.2, 0.15]));
    mb.tube(rb, null, 0.07, 5, PART.BRANCH, function (t) { return [3, t, 0]; }, 2);
    out.rbb = rb[4];
    purk.push({ p: rb[rb.length - 1], fn: rvCav, dir: v3(-0.2, -1, 0), t: 0.05, gen: 0 });
    purk.push({ p: rb[rb.length - 1], fn: rvCav, dir: v3(-0.3, 1, -0.4), t: 0.05, gen: 0 });
    purk.push({ p: m0, fn: rvCav, dir: v3(0.1, -1, 0.3), t: 0.0, gen: 0 });
    purk.push({ p: m0, fn: rvCav, dir: v3(0, -0.6, -1), t: 0.0, gen: 0 });

    // Purkinje fibres: a branching net over the inner surface of both ventricles
    var strands = [], guard = 0;
    while (purk.length && guard++ < 150) {
      var st = purk.shift(), p = st.p, d = norm(st.dir), pts = [p], tt = st.t;
      var steps = 7 + Math.floor(rnd() * 7);
      for (var q = 0; q < steps; q++) {
        d = norm(add(d, [(rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7 + 0.10, (rnd() - 0.5) * 0.7]));   // slight drift toward the base
        var np = snap(st.fn, add(p, mul(d, 0.42)), 0.05);
        if (np[1] > 0.35 || len(sub(np, p)) < 0.15) break;       // stay below the valve plane
        d = norm(sub(np, p)); p = np; pts.push(p); tt += 0.035;
        if (st.gen < 3 && rnd() < 0.24) {
          var side = norm(cross(d, norm(grad(st.fn, p))));
          purk.push({ p: p, fn: st.fn, dir: add(mul(d, 0.6), mul(side, rnd() < 0.5 ? 1 : -1)), t: tt, gen: st.gen + 1 });
        }
      }
      if (pts.length > 2) strands.push({ pts: pts, t0: st.t, t1: tt });
    }
    var tmax = 0; strands.forEach(function (s) { tmax = Math.max(tmax, s.t1); });
    strands.forEach(function (s) {
      mb.tube(s.pts, null, 0.034, 4, PART.PURKINJE, function (t) { return [4, (s.t0 + (s.t1 - s.t0) * t) / tmax, 0]; }, 2);
    });
    out.purkinje = strands.length ? strands[Math.floor(strands.length * 0.5)].pts[2] : fa[fa.length - 1];
    out.strands = strands.length;
    out.mesh = mb.done();
    return out;
  }

  /* ---------- coronary arteries: drop guide points onto the front surface ---------- */
  function buildCoronaries() {
    function outer0(x, y, z) { evalAll(x, y, z); return F.tissue; }
    function drop(x, y) {
      for (var z = 4.4; z > -3; z -= 0.05) if (outer0(x, y, z) < 0) return [x, y, z + 0.03];
      return null;
    }
    var guides = [
      { r: [0.20, 0.13], pts: [[-0.55, 1.15], [-1.0, 0.3], [-1.35, -1.0], [-1.4, -2.4], [-1.1, -3.8], [-0.5, -5.1], [0.25, -6.3], [0.8, -7.2]] },   // anterior interventricular (LAD)
      { r: [0.19, 0.14], pts: [[-2.55, 1.2], [-3.4, 0.95], [-4.4, 0.6], [-5.05, 0.05]] },                                                    // right coronary
      { r: [0.13, 0.09], pts: [[-4.4, 0.6], [-4.35, -0.8], [-4.0, -2.4], [-3.5, -3.8]] },                                                    // right marginal
      { r: [0.18, 0.13], pts: [[1.9, 1.4], [3.0, 1.15], [4.2, 0.85], [5.0, 0.3]] },                                                          // circumflex
      { r: [0.13, 0.09], pts: [[4.2, 0.85], [4.6, -0.6], [4.6, -2.2], [4.2, -3.8]] },                                                        // obtuse marginal
      { r: [0.12, 0.08], pts: [[-1.0, 0.3], [0.2, -0.9], [1.3, -2.4], [1.9, -3.9]] }                                                         // diagonal
    ];
    var tubes = [];
    guides.forEach(function (g) {
      var dense = resample(g.pts.map(function (p) { return [p[0], p[1], 0, 0]; }), 0.3), pts = [];
      dense.forEach(function (p, i) {
        var q = drop(p[0], p[1]);
        if (q) pts.push([q[0], q[1], q[2], g.r[0] + (g.r[1] - g.r[0]) * i / (dense.length - 1)]);
      });
      // drop points that jump in depth (the guide crossed a groove)
      var keep = [pts[0]];
      for (var i = 1; i < pts.length; i++) if (Math.abs(pts[i][2] - keep[keep.length - 1][2]) < 0.6) keep.push(pts[i]);
      if (keep.length > 2) tubes.push(new Tube(keep, 0.3));
    });
    return tubes;
  }

  /* ---------- blood lanes (guides for the particles) ---------- */
  function lane(pts) { return resample(pts, 0.35); }
  function buildLanes() {
    var mvIn = add(MV.c, mul(MV.n, -0.2)), tvIn = add(TV.c, mul(TV.n, -0.2));
    var L = {};
    // conduits: [x,y,z, usable radius]
    L.svc = lane([[-3.8, 7.6, -0.6, 0.6], [-3.8, 6.0, -0.6, 0.6], [-3.85, 4.5, -0.6, 0.62]]);
    L.ivc = lane([[-5.1, -4.8, -2.8, 0.66], [-5.05, -2.6, -2.75, 0.66], [-4.7, -0.3, -2.2, 0.66], [-4.3, 1.1, -1.6, 0.66]]);
    L.raS = lane([[-3.85, 4.5, -0.6, 0.62], [-3.9, 3.3, -0.55, 1.15], [-3.85, 2.1, -0.4, 1.05], TV.c.concat(0.95)]);
    L.raI = lane([[-4.3, 1.1, -1.6, 0.66], [-4.2, 2.3, -1.1, 1.0], [-3.9, 2.3, -0.5, 1.0], TV.c.concat(0.95)]);
    L.rv = lane([TV.c.concat(0.95), [-3.45, -0.9, -0.05, 1.05], [-3.2, -2.7, 0.15, 1.0], [-2.75, -4.1, 0.3, 0.7], [-2.35, -3.1, 0.45, 0.8],
      [-2.25, -1.5, 0.35, 0.75], [-2.05, 0.3, 0.2, 0.7], PV.c.concat(0.66)]);
    L.pt = lane([PV.c.concat(0.66), [-1.82, 2.6, 0.55, 0.72], [-1.40, 3.3, 1.15, 0.68], [-0.50, 4.05, 1.52, 0.66], [0.75, 4.6, 1.38, 0.64], [1.75, 4.95, 0.45, 0.6]]);
    L.lpa = lane([[1.75, 4.95, 0.45, 0.55], [2.9, 5.2, -0.75, 0.48], [4.2, 5.25, -1.3, 0.46], [5.3, 5.2, -1.58, 0.44]]);
    L.rpa = lane([[1.75, 4.95, 0.45, 0.55], [1.45, 5.15, -1.5, 0.48], [0.3, 5.1, -2.75, 0.46], [-1.6, 5.0, -3.0, 0.45], [-3.9, 4.9, -2.95, 0.44], [-6.35, 4.82, -2.92, 0.43]]);
    L.pvein = [
      lane([[-6.35, 3.6, -3.3, 0.3], [-3.6, 3.6, -3.3, 0.3], [-1.2, 3.5, -3.0, 0.3], [0.9, 3.35, -2.2, 0.32]]),
      lane([[-6.35, 2.2, -3.35, 0.3], [-3.6, 2.2, -3.35, 0.3], [-1.2, 2.25, -3.05, 0.3], [0.8, 2.3, -2.2, 0.32]]),
      lane([[5.7, 3.72, -1.75, 0.3], [5.2, 3.65, -1.7, 0.3], [4.5, 3.45, -1.45, 0.32]]),
      lane([[5.7, 2.28, -1.95, 0.3], [5.2, 2.3, -1.9, 0.3], [4.5, 2.4, -1.65, 0.32]])
    ];
    L.la = [
      lane([[0.7, 3.35, -2.1, 0.32], [1.9, 3.1, -1.4, 0.9], [2.9, 2.4, -0.8, 0.9], mvIn.concat(0.85)]),
      lane([[0.8, 2.3, -2.2, 0.32], [1.9, 2.5, -1.4, 0.85], [2.9, 2.1, -0.8, 0.85], mvIn.concat(0.85)]),
      lane([[4.5, 3.45, -1.45, 0.32], [3.6, 3.1, -1.1, 0.85], [3.3, 2.3, -0.7, 0.85], mvIn.concat(0.85)]),
      lane([[4.5, 2.4, -1.65, 0.32], [3.7, 2.4, -1.1, 0.8], [3.4, 1.9, -0.7, 0.8], mvIn.concat(0.85)])
    ];
    var a = function (s, phi, f, r) { return add(lvAxis(s), mul(lvDir(phi), lvRi(s) * f)).concat(r); };
    L.lv = lane([MV.c.concat(0.85), a(1.6, 0, 0.45, 1.0), a(3.4, 0, 0.35, 1.05), a(5.4, 0, 0.15, 0.8), a(6.4, 180, 0.05, 0.5),
      a(5.2, 180, 0.3, 0.8), a(3.2, 180, 0.42, 0.9), a(1.2, 180, 0.42, 0.8), [1.0, 0.5, -0.33, 0.72], AV.c.concat(0.7)]);
    L.aorta = lane(aortaPts.slice(0, 8).map(function (p) { return [p[0], p[1], p[2], p[3] * 0.68]; }).concat([[3.42, 5.7, -3.08, 0.58]]));
    L.branch = branchPts.map(function (b) { return lane([[b[0][0], b[0][1] - 0.5, b[0][2], 0.3], [b[1][0], b[1][1], b[1][2], 0.27], [b[2][0], 8.4, b[2][2], 0.26]]); });
    return L;
  }

  /* ---------- label anchors ---------- */
  function buildAnchors(cond) {
    var A = {};
    A[PART.LV] = [3.4, -3.2, 2.2]; A[PART.RV] = [-3.0, -2.6, 2.0]; A[PART.LA] = [3.4, 3.0, -0.4]; A[PART.RA] = [-4.6, 2.6, 0.9];
    A[PART.SEPTUM] = [-0.75, -2.6, 0.2]; A[PART.AORTA] = [1.0, 7.2, -1.2]; A[PART.PA] = [0.6, 4.6, 1.9];
    A[PART.SVC] = [-3.8, 6.6, 0.2]; A[PART.IVC] = [-5.1, -3.6, -2.0]; A[PART.PVEINS] = [5.4, 3.1, -2.0];
    A[PART.MITRAL] = MV.c.slice(); A[PART.TRICUSPID] = TV.c.slice(); A[PART.AORTIC] = add(AV.c, mul(AV.n, 0.5)); A[PART.PULMONARY] = add(PV.c, mul(PV.n, 0.5));
    A[PART.SA] = cond.sa; A[PART.AVN] = cond.avn; A[PART.HIS] = cond.his; A[PART.BRANCH] = cond.lbb; A[PART.PURKINJE] = cond.purkinje;
    A[PART.PAPILLARY] = PAP.lvA.tip.slice(); A[PART.CORONARY] = [-1.35, -1.6, 2.9];
    return A;
  }

  /* ---------- build everything (in slices, so the page can show progress) ---------- */
  function build(onProgress, onDone) {
    var t0 = Date.now();
    coronaries = [];
    coronaries = buildCoronaries();
    function outer(x, y, z) { evalAll(x, y, z); return F.tissue; }
    SA_POS = snap(outer, v3(-5.3, 4.35, 0.55), -0.02);
    ESC_FOCUS = add(lvAxis(5.6), mul(lvDir(-10), lvRi(5.6) + 0.5));   // an escape pacemaker low in the left ventricle
    var mesher = new Mesher();
    function slice() {
      var pr = mesher.sampleSome(45);
      if (onProgress) onProgress(pr * 0.7);
      if (pr < 1) { setTimeout(slice, 0); return; }
      var mesh = mesher.extract();
      mesher = null;
      if (onProgress) onProgress(0.78);
      setTimeout(function () {
        buildVertexData(mesh);
        if (onProgress) onProgress(0.92);
        setTimeout(function () {
          var out = finish(mesh);
          out.buildMs = Date.now() - t0;
          if (onProgress) onProgress(1);
          onDone(out);
        }, 0);
      }, 0);
    }
    slice();
  }
  function buildSync() {
    coronaries = []; coronaries = buildCoronaries();
    function outer(x, y, z) { evalAll(x, y, z); return F.tissue; }
    SA_POS = snap(outer, v3(-5.3, 4.35, 0.55), -0.02);
    ESC_FOCUS = add(lvAxis(5.6), mul(lvDir(-10), lvRi(5.6) + 0.5));
    var m = new Mesher(); while (m.sampleSome(1e9) < 1) { /* all at once */ }
    var mesh = m.extract(); buildVertexData(mesh);
    return finish(mesh);
  }
  function finish(mesh) {
    var mvPaps = [PAP.lvA.tip, PAP.lvP.tip], tvPaps = [PAP.rvA.tip, PAP.rvP.tip, v3(-2.15, -1.2, -0.5)];
    var mitral = atrioventricular(MV, sub(AV.c, MV.c), [[-65, 65], [65, 295]], mvPaps, true);
    var tricuspid = atrioventricular(TV, v3(1, 0, 0), [[-60, 60], [60, 180], [180, 300]], tvPaps, false);
    var cond = buildConduction();
    return {
      PART: PART, heart: mesh,
      valves: {
        mv: mitral.leaflets, tv: tricuspid.leaflets, av: semilunar(AV, 30), pv: semilunar(PV, 90),
        mvChordae: mitral.chordae, tvChordae: tricuspid.chordae
      },
      conduction: cond.mesh, lanes: buildLanes(), anchors: buildAnchors(cond),
      strands: cond.strands,
      deform: { B: LV_B, U: LV_U, L: LV_L, sc: LV_SC, a: LV_A, up: LV_UP, down: LV_DOWN, laC: laEll.c, raC: raEll.c },
      valveInfo: { MV: MV, TV: TV, AV: AV, PV: PV },
      bounds: { lo: GRID.lo, hi: GRID.hi }
    };
  }

  root.HeartGeo = {
    PART: PART, build: build, buildSync: buildSync, weightsAt: weightsAt, deformPoint: deformPoint, evalAll: evalAll, F: F,
    lvAxis: lvAxis, lvRi: lvRi, GRID: GRID
  };
})(typeof self !== 'undefined' ? self : this);

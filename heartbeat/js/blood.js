/*
 * blood.js — blood drawn as particles, each standing for a fixed volume.
 *
 * Particles are carried by the flows of the simulation, not by a scripted animation:
 *   in a vessel:   df/dt = Q / V_vessel
 *   in a chamber:  df/dt = (Q_in (1 - f) + Q_out f) / V_chamber     (plug flow, volume-conserving)
 * where f in [0,1] is how far the particle has travelled through that compartment. A particle
 * can only leave a ventricle while its outlet valve is passing flow, and the share that leaves
 * in one beat equals the ejection fraction.
 */
(function (root) {
  'use strict';

  function prepLane(pts) {
    var n = pts.length, cum = [0], i;
    for (i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    var total = cum[n - 1], N = [], B = [], prev = null;
    for (i = 0; i < n; i++) {
      var a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)];
      var t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / l, t[1] / l, t[2] / l];
      var h = prev || (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
      var d = h[0] * t[0] + h[1] * t[1] + h[2] * t[2];
      var nn = [h[0] - t[0] * d, h[1] - t[1] * d, h[2] - t[2] * d]; l = Math.hypot(nn[0], nn[1], nn[2]) || 1; nn = [nn[0] / l, nn[1] / l, nn[2] / l];
      prev = nn; N.push(nn); B.push([t[1] * nn[2] - t[2] * nn[1], t[2] * nn[0] - t[0] * nn[2], t[0] * nn[1] - t[1] * nn[0]]);
    }
    var vol = 0;
    for (i = 1; i < n; i++) { var r = 0.5 * (pts[i][3] + pts[i - 1][3]) * 1.45; vol += Math.PI * r * r * (cum[i] - cum[i - 1]); }
    return { pts: pts, cum: cum, total: total, N: N, B: B, vol: vol };
  }

  function Blood(geo, renderer, density) {
    this.geo = geo; this.r = renderer; this.rho = density || 1.6;
    var L = geo.lanes, P = prepLane;
    var self = this;
    // node: lanes, kind (0 vessel, 1 chamber), oxygen, flow getters, where particles go next
    this.nodes = [
      { name: 'svc', lanes: [P(L.svc)], oxy: 0, q: function (s) { return 0.35 * s.q.ven; }, next: function () { return [2, 0]; }, spawn: 0.35, src: 'ven' },
      { name: 'ivc', lanes: [P(L.ivc)], oxy: 0, q: function (s) { return 0.65 * s.q.ven; }, next: function () { return [2, 1]; }, spawn: 0.65, src: 'ven' },
      { name: 'ra', lanes: [P(L.raS), P(L.raI)], oxy: 0, chamber: 'ra', qin: function (s) { return s.q.ven; }, qout: function (s) { return s.q.tv; }, next: function () { return [3, 0]; } },
      { name: 'rv', lanes: [P(L.rv)], oxy: 0, chamber: 'rv', qin: function (s) { return s.q.tv; }, qout: function (s) { return s.q.pv; }, next: function () { return [4, 0]; } },
      { name: 'pt', lanes: [P(L.pt)], oxy: 0, q: function (s) { return s.q.pv; }, next: function (p) { return [p.a > 0 ? 5 : 6, 0]; } },
      { name: 'lpa', lanes: [P(L.lpa)], oxy: 0, q: function (s) { return 0.5 * s.q.pv; }, next: null },
      { name: 'rpa', lanes: [P(L.rpa)], oxy: 0, q: function (s) { return 0.5 * s.q.pv; }, next: null }
    ];
    for (var i = 0; i < 4; i++) (function (i) {
      self.nodes.push({ name: 'pv' + i, lanes: [P(L.pvein[i])], oxy: 1, q: function (s) { return 0.25 * s.q.pven; }, next: function () { return [11, i]; }, spawn: 0.25, src: 'pven' });
    })(i);
    this.nodes.push({ name: 'la', lanes: L.la.map(P), oxy: 1, chamber: 'la', qin: function (s) { return s.q.pven; }, qout: function (s) { return s.q.mv; }, next: function () { return [12, 0]; } });
    this.nodes.push({ name: 'lv', lanes: [P(L.lv)], oxy: 1, chamber: 'lv', qin: function (s) { return s.q.mv; }, qout: function (s) { return s.q.av; }, next: function () { return [13, 0]; } });
    this.nodes.push({ name: 'aorta', lanes: [P(L.aorta)], oxy: 1, q: function (s) { return s.q.av; }, next: null });
    for (i = 0; i < 3; i++) this.nodes.push({ name: 'br' + i, lanes: [P(L.branch[i])], oxy: 1, q: function (s) { return 0.12 * s.q.av; }, next: null });
    this.branchAt = [0.50, 0.60, 0.70];
    this.parts = [];
    this.spawnAcc = {};
    this.ww = [0, 0, 0, 0, 0];
    this.rand = (function () { var a = 99; return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
  }

  Blood.prototype._new = function (node, lane, f) {
    var ang = this.rand() * 6.2832, rad = Math.sqrt(this.rand());
    return { node: node, lane: lane, f: f, a: Math.cos(ang) * rad, b: Math.sin(ang) * rad, spin: (this.rand() - 0.5) * 1.2, br: this.rand() };
  };

  /* fill every compartment at the density that matches its current volume */
  Blood.prototype.reset = function (sim) {
    this.parts = []; this.spawnAcc = {};
    for (var n = 0; n < this.nodes.length; n++) {
      var nd = this.nodes[n];
      for (var l = 0; l < nd.lanes.length; l++) {
        var vol = nd.chamber ? sim.s[nd.chamber] / nd.lanes.length : nd.lanes[l].vol;
        var count = Math.round(vol * this.rho);
        for (var k = 0; k < count; k++) this.parts.push(this._new(n, l, this.rand()));
      }
    }
  };

  Blood.prototype.update = function (sim, dt) {
    var nodes = this.nodes, parts = this.parts, rho = this.rho, i, nd;
    if (dt > 0) {
      // per-node rate terms
      for (i = 0; i < nodes.length; i++) {
        nd = nodes[i];
        if (nd.chamber) { var V = Math.max(sim.s[nd.chamber], 15); nd._a = nd.qin(sim) / V; nd._b = nd.qout(sim) / V; }
        else nd._a = nd.q(sim) / nd.lanes[0].vol;
        if (nd.spawn) {
          var key = nd.name, acc = (this.spawnAcc[key] || 0) + Math.max(0, nd.q(sim)) * dt * rho;
          while (acc >= 1 && parts.length < this.r.pMax) { parts.push(this._new(i, 0, this.rand() * 0.02)); acc -= 1; }
          this.spawnAcc[key] = acc % 1;
        }
      }
      for (i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; nd = nodes[p.node];
        var f0 = p.f;
        if (nd.chamber) p.f += (nd._a * (1 - p.f) + nd._b * p.f) * dt; else p.f += nd._a * dt;
        var ang = p.spin * dt; if (ang) { var ca = Math.cos(ang), sa = Math.sin(ang), a = p.a * ca - p.b * sa; p.b = p.a * sa + p.b * ca; p.a = a; }
        if (p.node === 13) {       // some aortic blood turns up into the three arch branches
          for (var b = 0; b < 3; b++) if (f0 < this.branchAt[b] && p.f >= this.branchAt[b] && p.br > b * 0.09 && p.br < b * 0.09 + 0.09) { p.node = 14 + b; p.lane = 0; p.f = 0; }
        }
        if (p.f >= 1) {
          if (!nd.next) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
          var nx = nd.next(p); p.node = nx[0]; p.lane = nx[1]; p.f = Math.min(0.2, (p.f - 1) * 0.5);
        } else if (p.f < 0) {
          if (nd.spawn) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }   // pushed back out of view
          p.f = 0;
        }
      }
    }
    // write the vertex buffer
    var data = this.r.pData, W = this.geo && root.HeartGeo.weightsAt, ww = this.ww, n = Math.min(parts.length, this.r.pMax), o = 0;
    for (i = 0; i < n; i++) {
      var q = parts[i]; nd = nodes[q.node];
      var ln = nd.lanes[q.lane], d = q.f * ln.total, cum = ln.cum, lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
      var t = (d - cum[lo]) / ((cum[hi] - cum[lo]) || 1), A = ln.pts[lo], B = ln.pts[hi], Na = ln.N[lo], Ba = ln.B[lo];
      var r = A[3] + (B[3] - A[3]) * t;
      var x = A[0] + (B[0] - A[0]) * t + (Na[0] * q.a + Ba[0] * q.b) * r;
      var y = A[1] + (B[1] - A[1]) * t + (Na[1] * q.a + Ba[1] * q.b) * r;
      var z = A[2] + (B[2] - A[2]) * t + (Na[2] * q.a + Ba[2] * q.b) * r;
      W(x, y, z, ww);
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = ww[0]; data[o + 4] = ww[1]; data[o + 5] = ww[2]; data[o + 6] = ww[3];
      data[o + 7] = ww[4]; data[o + 8] = nd.oxy; data[o + 9] = 0.30;
      o += 10;
    }
    this.r.pCount = n;
  };

  Blood.prototype.countIn = function (name) {
    var idx = -1, c = 0;
    for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].name === name) idx = i;
    for (i = 0; i < this.parts.length; i++) if (this.parts[i].node === idx) c++;
    return c;
  };

  root.Blood = Blood;
})(typeof self !== 'undefined' ? self : this);

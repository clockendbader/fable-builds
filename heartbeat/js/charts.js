/*
 * charts.js — the strip chart: ECG, left-side pressures, left-ventricle volume and heart sounds,
 * stacked on one shared time axis so that waves, valve events and sounds line up vertically.
 * Everything is read from the simulation's sample buffer; nothing is pre-drawn.
 */
(function (root) {
  'use strict';

  var PHASE_COL = ['#6f9bff', '#f2bf4a', '#ff6464', '#ff9c78', '#c08cf0', '#45cbbd', '#66758f'];
  var COL = { ecg: '#74e7a4', lv: '#ff6b6b', ao: '#ffb655', la: '#7aa6ff', vol: '#c9a0f5', grid: 'rgba(255,255,255,0.055)', grid2: 'rgba(255,255,255,0.11)', text: '#9aa6bb', bright: '#e8edf6', snd: '#e8edf6' };
  var N = 2400;

  function Charts(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.win = 3.2; this.pmax = 140;
    this.x = new Float32Array(N); this.e = new Float32Array(N); this.p1 = new Float32Array(N); this.p2 = new Float32Array(N);
    this.p3 = new Float32Array(N); this.v = new Float32Array(N); this.ph = new Uint8Array(N); this.tt = new Float64Array(N);
    this.rows = null;
  }
  Charts.PHASE_COL = PHASE_COL;

  Charts.prototype.resize = function () {
    var c = this.c, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(50, Math.round(c.clientWidth)), h = Math.max(50, Math.round(c.clientHeight));
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.w = w; this.h = h; this.dpr = dpr;
  };

  Charts.prototype.draw = function (sim, L) {
    this.resize();
    var ctx = this.ctx, w = this.w, h = this.h, self = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var gutter = 40, right = 10, x0 = gutter, pw = w - gutter - right;
    var now = sim.t, t0 = now - this.win, win = this.win;
    function X(t) { return x0 + (t - t0) / win * pw; }

    // rows
    var small = h < 300, top = 4, bottom = 18, gap = small ? 4 : 9, H = h - top - bottom - gap * 3;
    var hE = H * (small ? 0.28 : 0.27), hP = H * (small ? 0.36 : 0.37), hV = H * (small ? 0.19 : 0.21), hS = H * (small ? 0.17 : 0.15);
    var hd = small ? 14 : 17;   // title strip above each plot
    var rE = { y: top, h: hE }, rP = { y: rE.y + hE + gap, h: hP }, rV = { y: rP.y + hP + gap, h: hV }, rS = { y: rV.y + hV + gap, h: hS };
    [rE, rP, rV, rS].forEach(function (r) { r.y += hd; r.h -= hd; });
    this.rows = { ecg: rE, p: rP, v: rV, s: rS, x0: x0, pw: pw };

    // gather samples
    var n = 0, x = this.x, e = this.e, p1 = this.p1, p2 = this.p2, p3 = this.p3, v = this.v, ph = this.ph, tt = this.tt, bf = sim.buf, pm = 0;
    sim.eachSample(t0, function (i) {
      if (n >= N) return;
      tt[n] = bf.t[i]; x[n] = X(bf.t[i]); e[n] = bf.ecg[i]; p1[n] = bf.plv[i]; p2[n] = bf.pao[i]; p3[n] = bf.pla[i]; v[n] = bf.vlv[i]; ph[n] = bf.phase[i];
      if (bf.plv[i] > pm) pm = bf.plv[i];
      n++;
    });
    var target = Math.max(140, Math.ceil((pm + 14) / 20) * 20);
    this.pmax += (target - this.pmax) * 0.12; if (Math.abs(target - this.pmax) < 0.5) this.pmax = target;
    var pmax = this.pmax;
    function sampleAt(t) { var lo = 0, hi = n - 1; if (n === 0) return -1; while (lo < hi) { var m = (lo + hi) >> 1; if (tt[m] < t) lo = m + 1; else hi = m; } return lo; }

    var eLo = -0.62, eHi = 1.95;
    function YE(val) { return rE.y + rE.h * (1 - (val - eLo) / (eHi - eLo)); }
    function YP(val) { return rP.y + rP.h * (1 - val / pmax); }
    var vLo = 0, vHi = 165;
    function YV(val) { return rV.y + rV.h * (1 - (val - vLo) / (vHi - vLo)); }

    // row backgrounds
    ctx.fillStyle = 'rgba(255,255,255,0.022)';
    [rE, rP, rV, rS].forEach(function (r) { ctx.fillRect(x0, r.y, pw, r.h); });

    // phase bands behind pressure and volume, with a solid ribbon on top of the pressure row
    if (n > 1) {
      var s0 = 0;
      for (var i = 1; i <= n; i++) {
        if (i === n || ph[i] !== ph[s0]) {
          var xa = x[s0], xb = i === n ? x[n - 1] : x[i];
          ctx.fillStyle = PHASE_COL[ph[s0]]; ctx.globalAlpha = 0.13;
          ctx.fillRect(xa, rP.y, xb - xa, rP.h); ctx.fillRect(xa, rV.y, xb - xa, rV.h);
          ctx.globalAlpha = 0.95; ctx.fillRect(xa, rP.y, Math.max(1, xb - xa), 3);
          ctx.globalAlpha = 1; s0 = i;
        }
      }
    }

    // time grid: 0.2 s light, 1 s stronger (ECG paper convention)
    ctx.lineWidth = 1;
    var g0 = Math.ceil(t0 / 0.2) * 0.2;
    for (var g = g0; g <= now; g += 0.2) {
      var gx = Math.round(X(g)) + 0.5, major = Math.abs(g / 1 - Math.round(g / 1)) < 0.01;
      ctx.strokeStyle = major ? COL.grid2 : COL.grid;
      ctx.beginPath();
      [rE, rP, rV, rS].forEach(function (r) { ctx.moveTo(gx, r.y); ctx.lineTo(gx, r.y + r.h); });
      ctx.stroke();
    }
    ctx.strokeStyle = COL.grid;
    [0, 0.5, 1.0, 1.5].forEach(function (mv) { var y = Math.round(YE(mv)) + 0.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + pw, y); ctx.stroke(); });
    ctx.font = '10.5px ' + L.font; ctx.fillStyle = COL.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.direction = 'ltr';
    for (var pv = 0; pv <= pmax; pv += pmax > 170 ? 50 : 40) {
      var y = Math.round(YP(pv)) + 0.5;
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + pw, y); ctx.stroke();
      ctx.fillText(String(pv), x0 - 6, y);
    }
    [50, 100, 150].forEach(function (vv) {
      var y = Math.round(YV(vv)) + 0.5;
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + pw, y); ctx.stroke();
      ctx.fillText(String(vv), x0 - 6, y);
    });
    // 1 mV calibration bar
    ctx.strokeStyle = COL.text; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 - 10, YE(0)); ctx.lineTo(x0 - 10, YE(1)); ctx.stroke();
    ctx.save(); ctx.translate(x0 - 22, YE(0.5)); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(L.mV, 0, 0); ctx.restore();
    // unit captions
    ctx.save(); ctx.translate(9, rP.y + rP.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(L.mmHg, 0, 0); ctx.restore();
    ctx.save(); ctx.translate(9, rV.y + rV.h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(L.mL, 0, 0); ctx.restore();

    function line(arr, Y, col, lw) {
      if (n < 2) return;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath();
      ctx.moveTo(x[0], Y(arr[0]));
      for (var i = 1; i < n; i++) ctx.lineTo(x[i], Y(arr[i]));
      ctx.stroke();
    }
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, pw, h); ctx.clip();

    // valve events: dashed lines through pressure and volume
    var marks = sim.marks, beats = 0, m, i2;
    for (i2 = 0; i2 < marks.length; i2++) if (marks[i2].type === 'QRS' && marks[i2].t >= t0 && marks[i2].t <= now) beats++;
    var showTags = beats <= 6;
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    for (i2 = 0; i2 < marks.length; i2++) {
      m = marks[i2];
      if (m.t < t0 || m.t > now) continue;
      if (m.type === 'MC' || m.type === 'AO' || m.type === 'AC' || m.type === 'MO') {
        var mx = Math.round(X(m.t)) + 0.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.30)';
        ctx.beginPath(); ctx.moveTo(mx, rP.y); ctx.lineTo(mx, rV.y + rV.h); ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    line(p3, YP, COL.la, 1.6); line(p2, YP, COL.ao, 1.8); line(p1, YP, COL.lv, 2.2);
    line(v, YV, COL.vol, 2.2);
    line(e, YE, COL.ecg, 1.9);

    // labels on the ECG and at valve events
    ctx.font = '600 11px ' + L.font; ctx.textBaseline = 'alphabetic';
    for (i2 = 0; i2 < marks.length; i2++) {
      m = marks[i2];
      if (m.t < t0 || m.t > now) continue;
      var mx2 = X(m.t), k;
      if (m.type === 'P' && now >= m.t + 0.046 && beats <= 9) {
        ctx.fillStyle = COL.ecg; ctx.textAlign = 'center';
        ctx.fillText('P', X(m.t + 0.046), YE(sim.ecgAt(m.t + 0.046)) - 7);
      } else if (m.type === 'QRS' && now >= m.t + 0.04 && beats <= 9) {
        ctx.fillStyle = COL.ecg; ctx.textAlign = 'left';
        var esc = m.v === 1, tp = m.t + (esc ? 0.058 : 0.04);
        ctx.fillText('QRS', X(tp) + 5, Math.max(rE.y + 10, YE(sim.ecgAt(tp)) + 9));
      } else if (m.type === 'T' && beats <= 9) {
        var tv = sim.ecgAt(m.t);
        ctx.fillStyle = COL.ecg; ctx.textAlign = 'center';
        ctx.fillText('T', mx2, tv >= 0 ? YE(tv) - 7 : Math.min(YE(tv) + 15, rE.y + rE.h - 2));
      } else if (showTags && (m.type === 'MC' || m.type === 'AO' || m.type === 'AC' || m.type === 'MO')) {
        k = sampleAt(m.t);
        if (k >= 0) {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx2, YP(p1[k]), 3, 0, 6.3); ctx.fill();
          ctx.fillStyle = COL.bright; ctx.textAlign = (m.type === 'MC' || m.type === 'AC') ? 'right' : 'left';
          var dx = (m.type === 'MC' || m.type === 'AC') ? -5 : 5;
          var ty = (m.type === 'AO' || m.type === 'AC') ? Math.max(rP.y + 15, YP(p1[k]) - 7) : Math.min(rP.y + rP.h - 4, YP(p1[k]) - 8);
          ctx.fillText(m.type, mx2 + dx, ty);
        }
      }
    }

    // heart sounds: S1 at mitral/tricuspid closure, S2 at aortic/pulmonary closure
    var mid = rS.y + rS.h * 0.44, amp = rS.h * 0.36, lastAO = null;
    function burst(t, dur, a, col, lw) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      var steps = 26, cyc = dur > 0.1 ? 5 : 4.5;
      for (var s = 0; s <= steps; s++) {
        var u = s / steps, tm = t + u * dur, envl = Math.sin(Math.PI * Math.pow(u, 0.7)) * Math.exp(-2.2 * u);
        var yy = mid + a * amp * 1.9 * envl * Math.sin(2 * Math.PI * cyc * u);
        if (s === 0) ctx.moveTo(X(tm), yy); else ctx.lineTo(X(tm), yy);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = COL.grid2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + pw, mid); ctx.stroke();
    for (i2 = 0; i2 < marks.length; i2++) {
      m = marks[i2];
      if (m.t < t0 - 0.5 || m.t > now) continue;
      if (m.type === 'AO') lastAO = m.t;
      if (m.type === 'TC') burst(m.t, 0.11, 0.55 * (m.v || 1), 'rgba(232,237,246,0.55)', 1.2);
      if (m.type === 'PC') burst(m.t, 0.07, 0.5, 'rgba(232,237,246,0.55)', 1.2);
      if (m.type === 'MC') { burst(m.t, 0.13, m.v || 1, COL.snd, 1.6); if (beats <= 9) { ctx.fillStyle = COL.bright; ctx.textAlign = 'center'; ctx.fillText(L.s1, X(m.t + 0.05), rS.y + rS.h - 1); } }
      if (m.type === 'AC') {
        burst(m.t, 0.075, L.stenosis ? 0.4 : 0.9, COL.snd, 1.6);
        if (beats <= 9) { ctx.fillStyle = COL.bright; ctx.textAlign = 'center'; ctx.fillText(L.s2, X(m.t + 0.035), rS.y + rS.h - 1); }
        if (L.stenosis && lastAO !== null && lastAO < m.t) {   // ejection murmur: grows, then fades (diamond shape)
          var xa2 = X(lastAO + 0.015), xb2 = X(m.t - 0.01), xm = xa2 + (xb2 - xa2) * 0.55;
          ctx.fillStyle = 'rgba(255,182,85,0.30)'; ctx.strokeStyle = 'rgba(255,182,85,0.9)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(xa2, mid); ctx.lineTo(xm, mid - amp * 0.8); ctx.lineTo(xb2, mid); ctx.lineTo(xm, mid + amp * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    }
    // a murmur still in progress
    if (L.stenosis && sim.valve.av.open && lastAO !== null) {
      var xa3 = X(lastAO + 0.015), xn = X(now), grow = Math.min(1, (now - lastAO) / 0.17);
      ctx.fillStyle = 'rgba(255,182,85,0.30)'; ctx.beginPath(); ctx.moveTo(xa3, mid); ctx.lineTo(xn, mid - amp * 0.8 * grow); ctx.lineTo(xn, mid + amp * 0.8 * grow); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // "now" dots at the right edge
    if (n > 1) {
      var xr = x[n - 1];
      [[YE(e[n - 1]), COL.ecg], [YP(p1[n - 1]), COL.lv], [YP(p2[n - 1]), COL.ao], [YP(p3[n - 1]), COL.la], [YV(v[n - 1]), COL.vol]].forEach(function (d) {
        ctx.fillStyle = d[1]; ctx.beginPath(); ctx.arc(xr, d[0], 3.2, 0, 6.3); ctx.fill();
      });
    }

    // row titles and legend (always left-to-right positions; the text itself may be Arabic)
    ctx.font = '600 11px ' + L.font; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    function title(r, txt, col, sub) {
      ctx.direction = L.rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left';
      var wd = ctx.measureText(txt).width;
      ctx.fillStyle = col; ctx.fillText(txt, x0 + 2, r.y - 15);
      if (sub) { ctx.fillStyle = COL.text; ctx.font = '10.5px ' + L.font; ctx.fillText(sub, x0 + 2 + wd + 8, r.y - 14.5); ctx.font = '600 11px ' + L.font; }
    }
    title(rE, L.ecg, COL.ecg, L.ecgNote);
    title(rV, L.volume, COL.vol);
    title(rS, L.sounds, COL.bright);
    // pressure legend
    var lx = x0 + 2, ly = rP.y - 15;
    ctx.fillStyle = COL.bright; ctx.direction = L.rtl ? 'rtl' : 'ltr';
    ctx.fillText(L.pressure, lx, ly); lx += ctx.measureText(L.pressure).width + 14;
    [[L.lv, COL.lv], [L.ao, COL.ao], [L.la, COL.la]].forEach(function (it) {
      var wd = ctx.measureText(it[0]).width;
      ctx.fillStyle = it[1]; ctx.fillRect(lx, ly + 5, 10, 3);
      ctx.direction = L.rtl ? 'rtl' : 'ltr'; ctx.textAlign = 'left';
      ctx.fillText(it[0], lx + 14, ly);
      lx += wd + 26;
    });
    ctx.direction = 'ltr';
    // time scale
    ctx.fillStyle = COL.text; ctx.font = '10.5px ' + L.font; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    var sx = x0 + pw - 6, sw = pw / win;
    ctx.strokeStyle = COL.text; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx - sw, h - 7); ctx.lineTo(sx, h - 7); ctx.moveTo(sx - sw, h - 10); ctx.lineTo(sx - sw, h - 4); ctx.moveTo(sx, h - 10); ctx.lineTo(sx, h - 4); ctx.stroke();
    ctx.fillText(L.sec, sx - sw - 6, h - 3);
  };

  root.Charts = Charts;
})(typeof self !== 'undefined' ? self : this);

/*
 * physio.js — the single clock of the model.
 *
 * A closed-loop, lumped-parameter circulation:
 *   LV -> aortic valve -> systemic arteries -> systemic veins -> RA -> tricuspid -> RV
 *      -> pulmonary valve -> pulmonary arteries -> pulmonary veins -> LA -> mitral -> LV
 * Each chamber is a time-varying elastance. Valves open and close from the pressures,
 * nothing about valve timing is scripted. A conduction timeline (SA node, AV delay,
 * ventricular activation) starts the contractions and also draws the ECG.
 *
 * Units: time s, volume mL, pressure mmHg, flow mL/s.
 * Written from scratch for this project. Works in the browser and in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeartSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DT = 0.0002;        // integration step (s)
  var SAMPLE_EVERY = 10;  // one chart sample every 2 ms
  var BUF = 8192;         // ring buffer length (16 s of samples)

  var PHASES = ['atrial', 'ivc', 'ejRapid', 'ejReduced', 'ivr', 'fillRapid', 'diastasis'];

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function gauss(x, mu, sig) { var z = (x - mu) / sig; return Math.exp(-0.5 * z * z); }
  function smooth01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- parameters ---------- */

  function makeParams(cond) {
    var p = {
      // chambers: P = E(t) * (V - V0)
      lv: { Emax: 2.75, Emin: 0.082, V0: 10 },
      rv: { Emax: 0.62, Emin: 0.042, V0: 10 },
      la: { Emax: 0.40, Emin: 0.17, V0: 8 },
      ra: { Emax: 0.26, Emin: 0.075, V0: 8 },
      // vessels (stressed volume / compliance)
      Csa: 1.32, Csv: 80, Cpa: 4.2, Cpv: 12,
      Rsys: 1.05, Rven: 0.022, Rpul: 0.075, Rpven: 0.012,
      RcS: 0.035, RcP: 0.018,          // characteristic impedance of the arterial roots
      // valves: effective area (cm2) for the Bernoulli loss, a small viscous term, inertance
      mv: { A: 5.0, R: 0.0020 },
      tv: { A: 7.0, R: 0.0015 },
      av: { A: 4.0, R: 0.0020, L: 0.00045, qClose: 35, maxOpen: 1 },
      pv: { A: 3.8, R: 0.0020, L: 0.00042, qClose: 25, maxOpen: 1 },
      Vtot: 1010,                      // total stressed blood volume
      // timing
      qtc: 0.40,                       // QT = qtc * sqrt(RR)  (Bazett)
      T1: 0.318, Trel: 0.122,          // time to peak elastance and relaxation time at RR = 0.8 s
      riseExp: 1.25,
      sysStretch: 1.0,
      emdV: 0.045,                     // QRS onset -> start of ventricular contraction
      rvDelay: 0.008, rvStretch: 1.012,
      emdRA: 0.070, emdLA: 0.090,      // P onset -> start of atrial contraction
      aRise: 0.105, aFall: 0.125,
      atrialKick: 1,
      // ECG shape
      ecg: { r: 1.05, q: -0.07, s: -0.20, t: 0.27, st: 0 },
      escapeRate: 36
    };
    if (cond === 'af') {
      p.atrialKick = 0;                // atria quiver, no organised contraction
    }
    if (cond === 'as') {
      // Severe valvular stenosis with a thickened (hypertrophied), stiffer left ventricle.
      p.av.A = 0.72;
      p.av.maxOpen = 0.30;
      p.lv.Emax = 4.6;
      p.lv.Emin = 0.125;
      p.la.Emax = 0.52;
      p.sysStretch = 1.07;
      p.ecg = { r: 1.65, q: -0.07, s: -0.22, t: -0.20, st: -0.07 };
    }
    return p;
  }

  function prInterval(rr) { return 0.10 + 0.075 * Math.sqrt(clamp(rr, 0.3, 1.6)); }

  /* ---------- simulation object ---------- */

  function HeartSim(opts) {
    opts = opts || {};
    this.hr = opts.hr || 75;
    this.condition = opts.condition || 'normal';
    this.seed = opts.seed || 20261112;
    this.buf = {
      t: new Float64Array(BUF), ecg: new Float32Array(BUF),
      plv: new Float32Array(BUF), pao: new Float32Array(BUF), pla: new Float32Array(BUF),
      vlv: new Float32Array(BUF), phase: new Uint8Array(BUF),
      prv: new Float32Array(BUF), ppa: new Float32Array(BUF), pra: new Float32Array(BUF)
    };
    this._init();
  }

  HeartSim.DT = DT;
  HeartSim.PHASES = PHASES;
  HeartSim.BUF = BUF;
  HeartSim.prInterval = prInterval;

  HeartSim.prototype._init = function () {
    var p = this.p = makeParams(this.condition);
    this.rand = makeRng(this.seed);
    this.t = 0;
    this.stepCount = 0;
    var s = this.s = { lv: 110, rv: 115, la: 52, ra: 48, sa: p.Csa * 90, pa: p.Cpa * 15, pv: p.Cpv * 9.5, sv: 0 };
    s.sv = p.Vtot - (s.lv + s.rv + s.la + s.ra + s.sa + s.pa + s.pv);
    this.q = { mv: 0, tv: 0, av: 0, pv: 0, sys: 0, ven: 0, pul: 0, pven: 0 };
    this.P = { lv: 8, rv: 4, la: 8, ra: 4, ao: 90, sa: 90, pa: 15, sv: 5, pv: 9 };
    this.act = { lv: 0, rv: 0, la: 0, ra: 0 };
    this.valve = {
      mv: { open: false, o: 0 }, tv: { open: false, o: 0 },
      av: { open: false, o: 0 }, pv: { open: false, o: 0 }
    };
    this.aBeats = [];
    this.vBeats = [];
    this.vQueue = [];
    this.nextSA = 0.02;
    this.lastVt = -0.6;
    this.beat = null;        // current ventricular beat
    this.prevBeat = null;
    this.fill = { qPeak: 0, rapidDone: true, t0: -1 };
    this.phase = 6;
    this.events = [];
    this.marks = [];         // chart markers {t, type}
    this.silent = false;
    this.head = 0;
    this.count = 0;
    this.metrics = null;
    this.acc = { pmax: -1e9, pmin: 1e9, lvmax: -1e9, gsum: 0, gmax: 0, gn: 0, laSum: 0, laN: 0 };
    this.lastAC = null;
    this.lastMC = null;
    this.blocked = 0;
  };

  HeartSim.prototype.setHR = function (hr) { this.hr = clamp(hr, 30, 220); };

  HeartSim.prototype.setCondition = function (cond, warm) {
    this.condition = cond;
    this._init();
    this.warmup(warm === undefined ? 14 : warm);
  };

  HeartSim.prototype.warmup = function (seconds) {
    this.silent = true;
    var n = Math.round(seconds / DT);
    for (var i = 0; i < n; i++) this._step();
    this.silent = false;
    this.events.length = 0;
  };

  HeartSim.prototype.advance = function (seconds) {
    var n = Math.max(0, Math.round(seconds / DT));
    for (var i = 0; i < n; i++) this._step();
    return n * DT;
  };

  /* Advance until the phase changes (or maxSeconds passes). Returns elapsed time. */
  HeartSim.prototype.advanceToNextPhase = function (maxSeconds) {
    var ph = this.phase, n = Math.round((maxSeconds || 3) / DT), i = 0;
    while (i < n && this.phase === ph) { this._step(); i++; }
    return i * DT;
  };

  HeartSim.prototype._emit = function (type, t, v) {
    this.marks.push({ type: type, t: t, v: v });
    if (this.marks.length > 400) this.marks.splice(0, 100);
    if (!this.silent) this.events.push({ type: type, t: t, v: v });
  };

  /* ---------- rhythm ---------- */

  HeartSim.prototype._afRR = function () {
    var mean = 60 / this.hr;
    var u1 = Math.max(1e-9, this.rand()), u2 = this.rand();
    var g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0.27, mean * clamp(1 + 0.27 * g, 0.5, 1.8));
  };

  HeartSim.prototype._rhythm = function (t) {
    var c = this.condition, p = this.p;
    if (c !== 'af') {
      if (t >= this.nextSA) {
        var rr = 60 / this.hr;
        var a = { t: this.nextSA, rr: rr, conducted: c !== 'chb' };
        this.aBeats.push(a);
        if (this.aBeats.length > 8) this.aBeats.shift();
        if (a.conducted) this.vQueue.push({ t: a.t + prInterval(rr), kind: 'n', pr: prInterval(rr) });
        this.nextSA += rr;
        this._emit('P', a.t, a.conducted ? 1 : 0);
      }
    }
    if (this.vQueue.length === 0) {
      if (c === 'af') {
        // the ventricle cannot be re-excited until it has repolarised (end of its T wave)
        var lastB = this.vBeats.length ? this.vBeats[this.vBeats.length - 1] : null;
        var refr = lastB ? lastB.qt + 0.05 : 0.3;
        // an interval that had to wait for repolarisation is paid back by the next ones, so the
        // average rate stays at the value set on the slider
        var draw = this._afRR() - (this._afDebt || 0), used = Math.max(refr, draw);
        this._afDebt = used - draw;
        this.vQueue.push({ t: Math.max(t + 0.16, this.lastVt + used), kind: 'n', pr: 0.16 });
      }
      else if (c === 'chb') this.vQueue.push({ t: Math.max(t + 0.16, this.lastVt + 60 / p.escapeRate), kind: 'e', pr: 0 });
    }
    while (this.vQueue.length && t >= this.vQueue[0].t) this._fireV(this.vQueue.shift());
  };

  HeartSim.prototype._fireV = function (ev) {
    var p = this.p;
    var rr = this.vBeats.length ? ev.t - this.lastVt : 60 / this.hr;
    var rrc = clamp(rr, 0.3, 1.5);
    var sc = Math.sqrt(rrc / 0.8);
    var esc = ev.kind === 'e';
    var T1 = p.T1 * sc * p.sysStretch * (esc ? 1.08 : 1);   // an escape beat spreads slowly, so it contracts more slowly
    var b = {
      t: ev.t, kind: ev.kind, rr: rr, pr: ev.pr,
      qt: p.qtc * Math.sqrt(rrc) + (esc ? 0.06 : 0),
      qrs: esc ? 0.17 : 0.09,
      mechOn: ev.t + (esc ? 0.06 : p.emdV),
      T1: T1, T2: T1 + p.Trel * sc,
      mc: false, tc: false, ao: false, ac: false, pc: false, mo: false, peaked: false,
      tMC: null, tAO: null, tAC: null, tMO: null, oOn: null, oOnT: null,
      edv: null, esv: null, plvMax: -1e9
    };
    this.vBeats.push(b);
    if (this.vBeats.length > 8) this.vBeats.shift();
    this.lastVt = ev.t;
    this._emit('QRS', ev.t, esc ? 1 : 0);
    // chart label for the T wave, placed at its peak (drawn once time reaches it)
    var kq = b.qt / 0.358;
    this.marks.push({ type: 'T', t: ev.t + b.qt - 2.6 * (esc ? 0.040 : 0.030) * kq, v: 0 });
  };

  /* Ventricular activation 0..1 at time t (delay and stretch let the RV differ slightly). */
  HeartSim.prototype._vact = function (t, delay, stretch) {
    var e = 0, vb = this.vBeats, p = this.p;
    for (var i = vb.length - 1; i >= 0 && i >= vb.length - 2; i--) {
      var b = vb[i], tau = t - b.mechOn - delay;
      if (tau <= 0) continue;
      var T1 = b.T1 * stretch, T2 = b.T2 * stretch, v;
      if (tau < T1) v = Math.pow(Math.sin(0.5 * Math.PI * tau / T1), p.riseExp);
      else if (tau < T2) v = 0.5 * (1 + Math.cos(Math.PI * (tau - T1) / (T2 - T1)));
      else v = 0;
      if (v > e) e = v;
    }
    return e;
  };

  HeartSim.prototype._aact = function (t, emd) {
    var p = this.p;
    if (!p.atrialKick) return 0;
    var e = 0, ab = this.aBeats;
    for (var i = ab.length - 1; i >= 0 && i >= ab.length - 2; i--) {
      var a = ab[i], sc = clamp(Math.sqrt(a.rr / 0.8), 0.72, 1.1);
      var tau = t - a.t - emd, r = p.aRise * sc, f = p.aFall * sc, v;
      if (tau <= 0) continue;
      if (tau < r) { v = Math.sin(0.5 * Math.PI * tau / r); v *= v; }
      else if (tau < r + f) v = 0.5 * (1 + Math.cos(Math.PI * (tau - r) / f));
      else v = 0;
      if (v > e) e = v;
    }
    return e * p.atrialKick;
  };

  /* True while the left atrium is in the squeezing part of its contraction. */
  HeartSim.prototype._atrialSqueezing = function (t) {
    var p = this.p;
    if (!p.atrialKick || !this.aBeats.length) return false;
    var a = this.aBeats[this.aBeats.length - 1];
    var sc = clamp(Math.sqrt(a.rr / 0.8), 0.72, 1.1);
    var tau = t - a.t - p.emdLA;
    if (tau <= 0) return false;
    // a conducted beat: the atrial phase lasts until the ventricle it triggered starts to contract
    if (a.conducted) return t < a.t + prInterval(a.rr) + p.emdV + 0.02;
    return tau < (p.aRise + 0.10 * p.aFall) * sc;
  };

  function avFlow(dP, v) {
    if (dP <= 0) return 0;
    var B = 4 / (v.A * v.A * 1e4);
    return (-v.R + Math.sqrt(v.R * v.R + 4 * B * dP)) / (2 * B);
  }

  /* ---------- one integration step ---------- */

  HeartSim.prototype._step = function () {
    var p = this.p, s = this.s, q = this.q, P = this.P, t = this.t, vv = this.valve;
    this._rhythm(t);

    var eLV = this._vact(t, 0, 1), eRV = this._vact(t, p.rvDelay, p.rvStretch);
    var eLA = this._aact(t, p.emdLA), eRA = this._aact(t, p.emdRA);
    this.act.lv = eLV; this.act.rv = eRV; this.act.la = eLA; this.act.ra = eRA;

    var Plv = (p.lv.Emin + (p.lv.Emax - p.lv.Emin) * eLV) * (s.lv - p.lv.V0);
    var Prv = (p.rv.Emin + (p.rv.Emax - p.rv.Emin) * eRV) * (s.rv - p.rv.V0);
    var Pla = (p.la.Emin + (p.la.Emax - p.la.Emin) * eLA) * (s.la - p.la.V0);
    var Pra = (p.ra.Emin + (p.ra.Emax - p.ra.Emin) * eRA) * (s.ra - p.ra.V0);
    var Psa = s.sa / p.Csa, Psv = s.sv / p.Csv, Ppa = s.pa / p.Cpa, Ppv = s.pv / p.Cpv;

    var qsys = (Psa - Psv) / p.Rsys;
    var qven = (Psv - Pra) / p.Rven;
    var qpul = (Ppa - Ppv) / p.Rpul;
    var qpven = (Ppv - Pla) / p.Rpven;

    var wasMV = q.mv > 0, wasTV = q.tv > 0;
    // an inlet valve cannot open while the outlet valve of the same ventricle is still open
    var qmv = vv.av.open ? 0 : avFlow(Pla - Plv, p.mv);
    var qtv = vv.pv.open ? 0 : avFlow(Pra - Prv, p.tv);

    // semilunar valves carry inertia: flow outlasts the pressure crossover, then a brief backflow shuts them
    var avClosed = false, avOpened = false, pvClosed = false, pvOpened = false;
    var av = vv.av, pv = vv.pv, B;
    if (!av.open && Plv > Psa) { av.open = true; avOpened = true; q.av = 0; }
    if (av.open) {
      B = 4 / (p.av.A * p.av.A * 1e4);
      q.av += DT * (Plv - Psa - (p.av.R + p.RcS) * q.av - B * q.av * Math.abs(q.av)) / p.av.L;
      if (q.av < -p.av.qClose * (p.av.A < 1.5 ? 0.3 : 1)) { q.av = 0; av.open = false; avClosed = true; }
    }
    if (!pv.open && Prv > Ppa) { pv.open = true; pvOpened = true; q.pv = 0; }
    if (pv.open) {
      B = 4 / (p.pv.A * p.pv.A * 1e4);
      q.pv += DT * (Prv - Ppa - (p.pv.R + p.RcP) * q.pv - B * q.pv * Math.abs(q.pv)) / p.pv.L;
      if (q.pv < -p.pv.qClose) { q.pv = 0; pv.open = false; pvClosed = true; }
    }
    var qav = q.av, qpv = q.pv;
    var Pao = Psa + p.RcS * qav, Ppar = Ppa + p.RcP * qpv;

    q.mv = qmv; q.tv = qtv; q.sys = qsys; q.ven = qven; q.pul = qpul; q.pven = qpven;
    P.lv = Plv; P.rv = Prv; P.la = Pla; P.ra = Pra; P.ao = Pao; P.sa = Psa; P.pa = Ppar; P.sv = Psv; P.pv = Ppv;

    /* ----- events and phase ----- */
    var b = null, vb = this.vBeats;
    if (vb.length) {
      b = vb[vb.length - 1];
      if (t < b.mechOn && vb.length > 1) b = vb[vb.length - 2];   // electrical start seen, muscle not yet
      else if (t < b.mechOn) b = null;
    }
    if (b && b !== this.beat) {
      // a new beat has started to contract: note how wide the AV valves stood open
      b.oOn = vv.mv.o; b.oOnT = vv.tv.o;
      this.prevBeat = this.beat;
      this.beat = b;
    }
    var mvOpen = qmv > 0, tvOpen = qtv > 0;
    vv.mv.open = mvOpen; vv.tv.open = tvOpen;
    var acc = this.acc;

    if (b) {
      var tau = t - b.mechOn;
      if (!b.mc && !mvOpen && eLV > 0.004 && tau < b.T1) {
        b.mc = true; b.tMC = t; b.edv = s.lv;
        this._finishBeatMetrics(b, t);
        this._emit('MC', t, clamp(0.25 + 0.9 * (b.oOn || 0), 0.25, 1.15));
      }
      if (!b.tc && !tvOpen && eRV > 0.004 && (t - b.mechOn - p.rvDelay) < b.T1) {
        b.tc = true;
        this._emit('TC', t, clamp(0.25 + 0.9 * (b.oOnT || 0), 0.25, 1.15));
      }
      if (avOpened && !b.ao) { b.ao = true; b.tAO = t; this._emit('AO', t); }
      if (avClosed && !b.ac) {
        b.ac = true; b.tAC = t; b.esv = s.lv;
        this.lastAC = t;
        this._emit('AC', t, 1);
      }
      if (pvOpened) this._emit('PO', t);
      if (pvClosed && !b.pc) { b.pc = true; this._emit('PC', t, 1); }
      if (av.open) {
        if (Plv > b.plvMax) b.plvMax = Plv;
        else if (!b.peaked && Plv < b.plvMax - 1.0) { b.peaked = true; this._emit('PEAK', t); }
        var g = Plv - Pao;
        acc.gsum += g; acc.gn++; if (g > acc.gmax) acc.gmax = g;
      }
      if (!b.mo && mvOpen && !wasMV && (b.ac || tau > b.T1)) {
        b.mo = true; b.tMO = t;
        this.fill = { qPeak: 0, rapidDone: false, t0: t };
        this._emit('MO', t);
      }
      if (!wasTV && tvOpen && (b.pc || tau > b.T1) && !b.to) { b.to = true; this._emit('TO', t); }
    }
    if (Pao > acc.pmax) acc.pmax = Pao;
    if (Pao < acc.pmin) acc.pmin = Pao;
    if (Plv > acc.lvmax) acc.lvmax = Plv;
    acc.laSum += Pla; acc.laN++;

    var fill = this.fill;
    if (mvOpen) {
      if (qmv > fill.qPeak) fill.qPeak = qmv;
      else if (!fill.rapidDone && qmv < 0.3 * fill.qPeak && t - fill.t0 > 0.04) fill.rapidDone = true;
    }

    var ph;
    if (av.open) ph = b && b.peaked ? 3 : 2;
    else if (mvOpen) {
      if (this._atrialSqueezing(t)) ph = 0;
      else ph = fill.rapidDone ? 6 : 5;
    } else if (b && (t - b.mechOn) < b.T1 && !b.ac && eLV > 0.004) ph = 1;
    else if (b && !b.mo && (b.ac || (t - b.mechOn) >= b.T1) && (t - b.mechOn) < b.T2 + 0.25) ph = 4;
    else ph = this._atrialSqueezing(t) ? 0 : 6;
    if (ph !== this.phase) {
      this.phase = ph;
      this._emit('PHASE', t, ph);
    }

    /* ----- leaflet positions (for drawing and for sound loudness) ----- */
    var tgt, o;
    tgt = mvOpen ? clamp(0.28 + 0.72 * Math.sqrt(qmv / 330), 0, 1) : 0;
    o = vv.mv.o; vv.mv.o = o + (tgt - o) * DT / (tgt > o ? 0.014 : 0.010);
    tgt = tvOpen ? clamp(0.28 + 0.72 * Math.sqrt(qtv / 330), 0, 1) : 0;
    o = vv.tv.o; vv.tv.o = o + (tgt - o) * DT / (tgt > o ? 0.014 : 0.010);
    tgt = av.open ? p.av.maxOpen * clamp(0.45 + 0.55 * Math.sqrt(Math.max(qav, 0) / (p.av.A < 1.5 ? 120 : 260)), 0, 1) : 0;
    o = av.o; av.o = o + (tgt - o) * DT / (tgt > o ? 0.012 : 0.008);
    tgt = pv.open ? p.pv.maxOpen * clamp(0.45 + 0.55 * Math.sqrt(Math.max(qpv, 0) / 260), 0, 1) : 0;
    o = pv.o; pv.o = o + (tgt - o) * DT / (tgt > o ? 0.012 : 0.008);

    /* ----- integrate volumes ----- */
    s.lv += (qmv - qav) * DT;
    s.la += (qpven - qmv) * DT;
    s.sa += (qav - qsys) * DT;
    s.sv += (qsys - qven) * DT;
    s.ra += (qven - qtv) * DT;
    s.rv += (qtv - qpv) * DT;
    s.pa += (qpv - qpul) * DT;
    s.pv += (qpul - qpven) * DT;

    /* ----- record ----- */
    if (this.stepCount % SAMPLE_EVERY === 0) {
      var h = this.head, bf = this.buf;
      bf.t[h] = t; bf.ecg[h] = this.ecgAt(t);
      bf.plv[h] = Plv; bf.pao[h] = Pao; bf.pla[h] = Pla; bf.vlv[h] = s.lv; bf.phase[h] = ph;
      bf.prv[h] = Prv; bf.ppa[h] = Ppar; bf.pra[h] = Pra;
      this.head = (h + 1) % BUF;
      if (this.count < BUF) this.count++;
    }
    this.stepCount++;
    this.t = t + DT;
  };

  /* Called at each mitral closure: closes the books on the beat that just ended. */
  HeartSim.prototype._finishBeatMetrics = function (b, t) {
    var prev = this.prevBeat, acc = this.acc;
    if (this.lastMC !== null && prev && prev.tMC !== null) {
      var m = { tEnd: t };
      m.cycle = t - prev.tMC;
      m.rate = 60 / m.cycle;
      m.ejected = !!prev.ac;
      m.systole = prev.ac ? prev.tAC - prev.tMC : null;
      m.diastole = prev.ac ? t - prev.tAC : null;
      m.edv = prev.edv; m.esv = prev.esv;
      m.sv = prev.ac ? prev.edv - prev.esv : 0;
      m.ef = prev.edv ? m.sv / prev.edv : 0;
      m.pSys = acc.pmax; m.pDia = acc.pmin; m.lvPeak = acc.lvmax;
      m.gradPeak = acc.gmax; m.gradMean = acc.gn ? acc.gsum / acc.gn : 0;
      m.laMean = acc.laN ? acc.laSum / acc.laN : 0;
      m.pep = prev.ao ? prev.tAO - prev.t : null;
      m.lvet = prev.ac && prev.ao ? prev.tAC - prev.tAO : null;
      m.qs2 = prev.ac ? prev.tAC - prev.t : null;
      m.qS1 = prev.tMC - prev.t;
      m.ivc = prev.ao ? prev.tAO - prev.tMC : null;
      m.ivr = prev.mo && prev.ac ? prev.tMO - prev.tAC : null;
      m.qt = prev.qt; m.kind = prev.kind;
      this.metrics = m;
      if (!this.history) this.history = [];
      this.history.push(m);
      if (this.history.length > 24) this.history.shift();
      this._emit('BEAT', t, m);
    }
    this.lastMC = t;
    acc.pmax = -1e9; acc.pmin = 1e9; acc.lvmax = -1e9; acc.gsum = 0; acc.gmax = 0; acc.gn = 0; acc.laSum = 0; acc.laN = 0;
  };

  /* ---------- ECG (one schematic lead, built from the conduction events) ---------- */

  HeartSim.prototype.ecgAt = function (t) {
    var y = 0, i, x, p = this.p, e = p.ecg;
    var ab = this.aBeats, vb = this.vBeats;
    for (i = ab.length - 1; i >= 0; i--) {
      x = t - ab[i].t;
      if (x < 0) continue;
      if (x > 0.2) break;
      y += 0.14 * gauss(x, 0.046, 0.019);
    }
    for (i = vb.length - 1; i >= 0; i--) {
      var b = vb[i];
      x = t - b.t;
      if (x < 0) continue;
      if (x > 0.9) break;
      var k = b.qt / 0.358, sR, sL, tp;
      if (b.kind === 'e') {
        // ventricular escape beat: wide complex, T wave opposite to the main deflection
        y += 0.95 * gauss(x, 0.058, 0.024) - 0.16 * gauss(x, 0.098, 0.012) - 0.50 * gauss(x, 0.132, 0.024);
        sR = 0.040 * k; sL = 0.075 * k; tp = b.qt - 2.6 * sR;
        y += -0.07 * smooth01((x - 0.17) / 0.03) * (1 - smooth01((x - tp + sL) / (sL * 1.2)));
        y += -0.32 * (x < tp ? gauss(x, tp, sL) : gauss(x, tp, sR));
      } else {
        y += e.q * gauss(x, 0.014, 0.006) + e.r * gauss(x, 0.040, 0.010) + e.s * gauss(x, 0.066, 0.009);
        sR = 0.030 * k; sL = 0.055 * k; tp = b.qt - 2.6 * sR;
        if (e.st) y += e.st * smooth01((x - 0.085) / 0.03) * (1 - smooth01((x - tp) / (2 * sR)));
        y += e.t * (x < tp ? gauss(x, tp, sL) : gauss(x, tp, sR));
      }
    }
    if (this.condition === 'af') {
      // fibrillatory baseline: no P waves, fine irregular waves
      y += 0.034 * Math.sin(2 * Math.PI * 6.7 * t + 1.3 * Math.sin(2 * Math.PI * 0.9 * t)) +
           0.024 * Math.sin(2 * Math.PI * 8.9 * t + 2.1 * Math.sin(2 * Math.PI * 0.53 * t) + 1.0) +
           0.014 * Math.sin(2 * Math.PI * 11.3 * t + 1.7 * Math.sin(2 * Math.PI * 0.71 * t) + 2.2);
    }
    return y;
  };

  /* ---------- views for the renderer ---------- */

  /* Electrical timeline as seen "now": seconds since the last atrial start, and time relative
     to the ventricular activation that matters (negative while the impulse is still in the
     AV node / His bundle on its way down). */
  HeartSim.prototype.electrical = function () {
    var t = this.t, ab = this.aBeats, vb = this.vBeats;
    var out = { tA: 9, tV: 9, kind: 0, qt: 0.36, avDelay: 0.085, pr: 0.16, qrs: 0.09, block: this.condition === 'chb', af: this.condition === 'af' };
    if (ab.length) out.tA = t - ab[ab.length - 1].t;
    var next = this.vQueue.length ? this.vQueue[0] : null;
    var lead = next ? Math.max(0.05, (next.pr || 0.16) - 0.04) : 0;
    if (next && next.kind === 'n' && t >= next.t - lead) {
      out.tV = t - next.t; out.kind = 0; out.pr = next.pr || 0.16;
      out.qt = this.p.qtc * Math.sqrt(clamp(next.t - this.lastVt, 0.3, 1.5));
    } else if (vb.length) {
      var b = vb[vb.length - 1];
      out.tV = t - b.t; out.kind = b.kind === 'e' ? 1 : 0; out.qt = b.qt; out.pr = b.pr || 0.16; out.qrs = b.qrs;
    }
    out.avDelay = Math.max(0.03, out.pr - 0.04 - 0.035);
    return out;
  };

  /* Chart samples from t0 to now, oldest first. fn(index) is called for each sample. */
  HeartSim.prototype.eachSample = function (t0, fn) {
    var bf = this.buf, n = this.count, h = this.head;
    var start = (h - n + BUF) % BUF, lo = 0, hi = n - 1, mid;
    if (!n) return;
    while (lo < hi) {  // first sample with t >= t0
      mid = (lo + hi) >> 1;
      if (bf.t[(start + mid) % BUF] < t0) lo = mid + 1; else hi = mid;
    }
    for (var i = lo; i < n; i++) fn((start + i) % BUF);
  };

  return HeartSim;
});

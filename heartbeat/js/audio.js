/*
 * audio.js — heart sounds made in code with the Web Audio API. No recordings.
 * Each valve gets its own short thump, played at the instant the simulation closes that valve:
 *   mitral + tricuspid closure  -> first heart sound  (S1, lower and longer: "lub")
 *   aortic + pulmonary closure  -> second heart sound (S2, higher and shorter: "dub")
 * In aortic stenosis a band of noise follows the flow through the narrowed valve (the murmur).
 */
(function (root) {
  'use strict';

  function HeartAudio() { this.ctx = null; this.on = false; this.log = []; }

  HeartAudio.prototype.enable = function (useCtx) {
    if (!this.ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC && !useCtx) return false;
      var ctx = this.ctx = useCtx || new AC();
      this.master = ctx.createGain(); this.master.gain.value = 1.5;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.12;
      this.master.connect(comp); comp.connect(ctx.destination);
      // noise source, shared
      var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), seed = 12345;
      for (var i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
      this.noiseBuf = buf;
      // murmur chain: noise -> band-pass -> gain
      var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 290; bp.Q.value = 0.9;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 130;
      this.murmurGain = ctx.createGain(); this.murmurGain.gain.value = 0;
      src.connect(bp); bp.connect(hp); hp.connect(this.murmurGain); this.murmurGain.connect(this.master);
      src.start();
    }
    if (this.ctx.state === 'suspended' && !useCtx) { var pr = this.ctx.resume(); if (pr && pr.catch) pr.catch(function () { /* stays silent until a click */ }); }
    this.on = true;
    return true;
  };
  HeartAudio.prototype.disable = function () { this.on = false; if (this.murmurGain) this.murmurGain.gain.value = 0; };

  /* one damped thump: two low partials that fall slightly in pitch, plus a little filtered noise */
  HeartAudio.prototype._thump = function (f1, f2, dur, gain) {
    var ctx = this.ctx, t = ctx.currentTime + 0.004, self = this;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.007);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    [[f1, 1.0, 'sine'], [f2, 0.6, 'sine'], [f1 * 2.9, 0.30, 'triangle'], [f2 * 2.6, 0.12, 'sine']].forEach(function (p) {
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = p[2];
      o.frequency.setValueAtTime(p[0] * 1.35, t);
      o.frequency.exponentialRampToValueAtTime(p[0], t + 0.035);
      og.gain.value = p[1];
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.02);
    });
    var n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f2 * 2.2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.005); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
    n.connect(lp); lp.connect(ng); ng.connect(this.master);
    n.start(t, Math.random() * 1.5, dur);
    return self;
  };

  /* type: 'MC' mitral, 'TC' tricuspid, 'AC' aortic, 'PC' pulmonary; v = loudness 0..1.2 */
  HeartAudio.prototype.valve = function (type, v, simTime) {
    this.log.push({ type: type, t: simTime, played: this.on });
    if (this.log.length > 200) this.log.shift();
    if (!this.on || !this.ctx) return;
    v = v === undefined ? 1 : v;
    if (type === 'MC') this._thump(58, 104, 0.14, 0.85 * v);
    else if (type === 'TC') this._thump(50, 92, 0.12, 0.45 * v);
    else if (type === 'AC') this._thump(92, 168, 0.080, 0.80 * v);
    else if (type === 'PC') this._thump(82, 150, 0.075, 0.42 * v);
  };

  /* level 0..1, updated every frame while blood is crossing the narrowed aortic valve */
  HeartAudio.prototype.murmur = function (level) {
    if (!this.ctx || !this.murmurGain) return;
    var g = this.on ? Math.max(0, Math.min(1, level)) * 0.5 : 0;
    this.murmurGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.012);
  };

  root.HeartAudio = HeartAudio;
})(typeof self !== 'undefined' ? self : this);

/*
 * app.js — wires the simulation, the 3D view, the charts, the sound and the interface together.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Q = new URLSearchParams(location.search);
  var T = I18N.t, H = I18N.html;

  var S = {
    lang: Q.get('lang') || stored('hb-lang') || ((navigator.language || 'en').slice(0, 2) === 'ar' ? 'ar' : 'en'),
    cond: Q.get('cond') || 'normal',
    hr: +(Q.get('hr') || 75),
    speed: +(Q.get('speed') || 1),
    playing: Q.get('paused') !== '1',
    stepping: false, stepFrom: -1,
    view: Q.get('view') || 'whole',
    blood: Q.get('blood') !== '0', elec: Q.get('elec') === '1', labels: Q.get('labels') === '1',
    selected: 0, sound: false, condOpen: Q.get('details') === '1'
  };
  var sim, R, blood, charts, audio = new HeartAudio(), geo, ref = null;
  var PHASE_COL = Charts.PHASE_COL;
  var SPEEDS = [[1, '1×'], [0.5, '½×'], [0.25, '¼×'], [0.1, '⅒×']];
  var CONDS = ['normal', 'af', 'chb', 'as'];
  var LABELS_ANAT = [1, 2, 3, 4, 6, 7, 8, 9, 10], LABELS_INNER = [5, 11, 12, 13, 14], LABELS_ELEC = [15, 16, 17, 18, 19];
  var CUT_ANCHOR = { 1: [2.0, -3.4, -0.3], 2: [-3.2, -1.6, -0.3], 3: [3.1, 3.0, -0.6], 4: [-3.9, 2.7, -0.6], 5: [-0.75, -2.4, -0.25] };
  var labelEls = {}, lastPhase = -1, lastChain = '', lastChips = '', beatFlash = 0;

  function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  /* ---------- text ---------- */
  function applyLang() {
    I18N.setLang(S.lang);
    document.documentElement.lang = S.lang; document.documentElement.dir = I18N.rtl() ? 'rtl' : 'ltr';
    document.title = I18N.plain('title');
    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = H(els[i].getAttribute('data-t'));
    $('langText').textContent = S.lang === 'ar' ? 'English' : 'العربية';
    splitItems($('hint')); splitItems(document.querySelector('.disclaimer .keys'));
    $('btnPrompt').title = I18N.plain('promptTitle'); $('btnSimplify').title = I18N.plain('simplifies');
    $('copyText').textContent = I18N.plain('copy');
    updateTheme();
    // condition tabs
    $('conds').innerHTML = CONDS.map(function (c) { return '<button data-c="' + c + '" aria-pressed="' + (c === S.cond) + '">' + H('condShort.' + c) + '</button>'; }).join('');
    $('viewSeg').innerHTML = ['whole', 'cut', 'ghost'].map(function (v) { return '<button data-v="' + v + '" aria-pressed="' + (v === S.view) + '">' + H('view.' + v) + '</button>'; }).join('');
    $('layerSeg').innerHTML = ['blood', 'elec', 'labels'].map(function (v) { return '<button data-l="' + v + '" aria-pressed="' + (!!S[v]) + '">' + H('layers.' + v) + '</button>'; }).join('');
    $('speedSeg').innerHTML = SPEEDS.map(function (s) { return '<button data-s="' + s[0] + '" aria-pressed="' + (s[0] === S.speed) + '">' + s[1] + '</button>'; }).join('');
    $('ribbon').innerHTML = PHASE_COL.map(function (c, i) { return '<i style="background:' + c + '" title="' + I18N.plain('phases.' + i + '.name', true) + '"></i>'; }).join('');
    var p = T('path');
    $('chain').innerHTML = ['sa', 'atria', 'avn', 'his', 'purk', 'vent'].map(function (k, i) {
      return (i ? '<span class="arrow">→</span>' : '') + '<span class="node" data-k="' + k + '">' + I18N.markup(p[k]) + '</span>';
    }).join('');
    var c = T('chart');
    $('chartKey').innerHTML = '<b>MC</b> ' + I18N.markup(c.MC) + ' (S1) · <b>AO</b> ' + I18N.markup(c.AO) + ' · <b>AC</b> ' + I18N.markup(c.AC) + ' (S2) · <b>MO</b> ' + I18N.markup(c.MO) + '<br>' + H('mouseOverChart');
    // dialog
    $('dlgBody').innerHTML = '<p class="intro">' + H('simplifyIntro') + '</p><dl>' + T('simplifyList').map(function (it) { return '<dt>' + I18N.markup(it[0]) + '</dt><dd>' + I18N.markup(it[1]) + '</dd>'; }).join('') + '</dl>';
    lastPhase = -1; lastChain = ''; lastChips = '';
    glideAll(true);
    updateButtons(); updateRateLabel(); updateCondCard(); updateInfo(); buildLabels(); updateVitals(); updateTiming();
  }
  function updateButtons() {
    var playing = S.playing && !S.stepping;
    $('btnPlay').innerHTML = icon(playing ? 'pause' : 'play') + '<span>' + I18N.plain(playing ? 'pause' : 'play') + '</span>';
    $('btnPlay').setAttribute('aria-label', I18N.plain(playing ? 'pause' : 'play'));
    $('btnStep').innerHTML = icon('step', 'flip') + '<span>' + I18N.plain('step') + '</span>';
    $('btnSound').innerHTML = icon(S.sound ? 'sound' : 'mute') + '<span>' + I18N.plain(S.sound ? 'soundOn' : 'soundOff') + '</span>';
    $('btnSound').setAttribute('aria-pressed', S.sound);
  }
  function updateRateLabel() {
    $('rateLabel').innerHTML = H('rate.' + S.cond);
    $('rateOut').innerHTML = S.hr + ' <small>' + H('bpm') + '</small>';
    $('rate').value = S.hr; fillRange($('rate'));
  }
  function updateCondCard() {
    var el = $('condCard');
    if (S.cond === 'normal') { el.hidden = true; return; }
    var c = T('condCard.' + S.cond), lb = T('condCard.labels');
    el.hidden = false;
    el.classList.toggle('open', !!S.condOpen);
    el.innerHTML = '<h2>' + H('conditions.' + S.cond) + '</h2><p class="what">' + I18N.markup(c.what) + '</p>' +
      '<button class="more" id="condMore" aria-expanded="' + (!!S.condOpen) + '">' + H(S.condOpen ? 'hideChanges' : 'whatChanges') + '</button><dl>' +
      ['motion', 'flow', 'ecg', 'sound'].map(function (k) { return '<dt>' + I18N.markup(lb[k]) + '</dt><dd>' + I18N.markup(c[k]) + '</dd>'; }).join('') + '</dl>';
    $('condMore').addEventListener('click', function () { S.condOpen = !S.condOpen; updateCondCard(); });
  }
  function updateInfo() {
    var el = $('info');
    if (!S.selected) { el.hidden = true; if (R) R.highlight = -1; return; }
    var p = T('parts.' + S.selected);
    el.hidden = false; $('infoName').innerHTML = I18N.markup(p[0]); $('infoText').innerHTML = I18N.markup(p[1]);
    if (R) R.highlight = S.selected;
    for (var k in labelEls) labelEls[k].classList.toggle('sel', +k === S.selected);
  }
  function select(id) { S.selected = id && T('parts.' + id) && typeof T('parts.' + id) !== 'string' ? id : 0; updateInfo(); }

  /* ---------- labels over the 3D view ---------- */
  function buildLabels() {
    var box = $('labels'); box.innerHTML = ''; labelEls = {};
    LABELS_ANAT.concat(LABELS_INNER, LABELS_ELEC).forEach(function (id) {
      var ln = document.createElement('i'); ln.className = 'lead'; box.appendChild(ln);
      var b = document.createElement('button');
      b.className = 'lbl' + (id >= 15 ? ' elec' : ''); b.innerHTML = I18N.markup(T('parts.' + id)[0]); b.dataset.part = id;
      b.addEventListener('click', function () { select(id); });
      box.appendChild(b); labelEls[id] = b; b._ln = ln; b._w = 0;
    });
  }
  function placeLabels() {
    if (!R || !geo) return;
    var list = [], k, i, j;
    for (k in labelEls) {
      var id = +k, el = labelEls[k], show = S.labels;
      if (LABELS_INNER.indexOf(id) >= 0) show = show && S.view !== 'whole';
      if (id >= 15) show = S.elec && (S.labels || id === S.selected);
      else if (S.elec && id > 4) show = false;          // with the electrical layer on, keep to chambers + conduction
      var p = show ? R.project((S.view !== 'whole' && CUT_ANCHOR[id]) || geo.anchors[id]) : null;
      if (!p || !p[2]) { el.style.display = 'none'; el._ln.style.display = 'none'; continue; }
      el.style.display = '';
      if (!el._w) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
      list.push({ el: el, ax: p[0], ay: p[1], x: p[0], y: p[1], w: el._w, h: el._h });
    }
    // push overlapping labels apart; a thin line ties each label back to its part
    for (var it = 0; it < 8; it++) for (i = 0; i < list.length; i++) for (j = i + 1; j < list.length; j++) {
      var A = list[i], B = list[j];
      var ox = (A.w + B.w) / 2 + 6 - Math.abs(A.x - B.x), oy = (A.h + B.h) / 2 + 4 - Math.abs(A.y - B.y);
      if (ox > 0 && oy > 0) { var d = oy / 2 + 0.5, up = A.y < B.y || (A.y === B.y && i < j) ? -1 : 1; A.y += up * d; B.y -= up * d; }
    }
    for (i = 0; i < list.length; i++) {
      var L = list[i], ln = L.el._ln, dx = L.x - L.ax, dy = L.y - L.ay, dist = Math.hypot(dx, dy);
      L.el.style.left = L.x.toFixed(1) + 'px'; L.el.style.top = L.y.toFixed(1) + 'px';
      if (dist > 9) {
        ln.style.display = ''; ln.style.left = L.ax.toFixed(1) + 'px'; ln.style.top = L.ay.toFixed(1) + 'px';
        ln.style.width = dist.toFixed(1) + 'px'; ln.style.transform = 'rotate(' + Math.atan2(dy, dx).toFixed(3) + 'rad)';
      } else ln.style.display = 'none';
    }
  }

  /* ---------- simulation -> picture ---------- */
  function applyState(dtReal) {
    var s = sim.s, st = R.state;
    var c = clamp((120 - s.lv) / 70, -0.3, 1.25);
    st.long = 1.1 * c;
    var l = 1 - st.long / geo.deform.L;
    st.lamLV = Math.sqrt(clamp((s.lv / 120) / l, 0.2, 1.3));
    st.rvSq = 0.75 * (1 - clamp((s.rv / 112) / l, 0.3, 1.2));
    st.lamLA = Math.cbrt(s.la / 66); st.lamRA = Math.cbrt(s.ra / 68);
    if (S.cond === 'af') {     // quivering atria: small fast irregular movements, no organised squeeze
      var t = sim.t;
      st.lamLA += 0.012 * Math.sin(41 * t) * Math.sin(13.3 * t + 1) + 0.006 * Math.sin(67 * t + 2);
      st.lamRA += 0.012 * Math.sin(37 * t + 1.7) * Math.sin(11.1 * t) + 0.006 * Math.sin(59 * t);
    }
    st.mv = sim.valve.mv.o; st.tv = sim.valve.tv.o; st.av = sim.valve.av.o; st.pv = sim.valve.pv.o;
    st.elec = sim.electrical(); st.time = sim.t; st.stenosis = S.cond === 'as';
    R.view.mode = S.view; R.view.blood = S.blood; R.view.elec = S.elec;
    if (document.body.classList.contains('elec-on') !== S.elec) document.body.classList.toggle('elec-on', S.elec);
  }

  /* ---------- panel updates ---------- */
  function updatePhase() {
    var ph = sim.phase, v = sim.valve;
    var chips = (v.mv.open ? 1 : 0) + '' + (v.tv.open ? 1 : 0) + (v.av.open ? 1 : 0) + (v.pv.open ? 1 : 0);
    if (chips !== lastChips) {
      lastChips = chips;
      var names = T('valveNames');
      $('valveChips').innerHTML = ['mv', 'tv', 'av', 'pv'].map(function (k) {
        return '<span class="chip' + (v[k].open ? ' open' : '') + '"><i></i>' + I18N.markup(names[k]) + ' <b>' + I18N.plain(v[k].open ? 'open' : 'closed') + '</b></span>';
      }).join('');
    }
    if (ph === lastPhase) return;
    lastPhase = ph;
    var p = T('phases.' + ph);
    $('phaseCount').textContent = I18N.plain('phaseNow') + ' ' + (ph + 1) + ' / 7';
    $('phaseName').innerHTML = I18N.markup(p.name) + (S.lang === 'en' ? ' <small>' + p.also + '</small>' : '');
    $('phaseText').innerHTML = I18N.markup(p.text);
    $('phaseCard').style.setProperty('--ph', PHASE_COL[ph]);
    var rb = $('ribbon').children;
    for (var i = 0; i < rb.length; i++) rb[i].classList.toggle('on', i === ph);
  }

  function updateSignal() {
    var e = sim.electrical(), on = {}, note = 'rest', cls = {};
    var tA = e.tA, tV = e.tV;
    if (S.cond === 'af') { on.atria = 1; cls.atria = 'chaos'; note = 'chaos'; }
    else if (tA >= 0 && tA < 0.03) on.sa = 1;
    else if (tA >= 0.03 && tA < 0.06) on.atria = 1;
    if (S.cond === 'chb') {
      if (tA >= 0.04 && tA < 0.20) { on.avn = 1; cls.avn = 'blocked'; note = 'block'; }
      if (tV >= 0 && tV < e.qrs + 0.03) { on.vent = 1; note = 'escape'; }
      else if (tV >= e.qrs + 0.03 && tV < e.qt && !on.avn) note = tV < 0.43 * e.qt ? 'plateau' : 'recover';
    } else {
      var tin = tV + e.avDelay + 0.035;      // time since the impulse entered the AV node
      if (tin >= 0 && tV < -0.035) { on.avn = 1; note = 'delay'; }
      else if (tV >= -0.035 && tV < -0.004) on.his = 1;
      else if (tV >= -0.004 && tV < 0.03) on.purk = 1;
      if (tV >= 0.012 && tV < e.qrs + 0.02) on.vent = 1;
      if (tV >= e.qrs + 0.02 && tV < e.qt && S.cond !== 'af') note = tV < 0.43 * e.qt ? 'plateau' : 'recover';
      if (S.cond !== 'af' && !on.avn && (on.sa || on.atria || on.his || on.purk || on.vent)) note = '';
    }
    var key = Object.keys(on).join(',') + '|' + note + '|' + S.lang;
    if (key === lastChain) return;
    lastChain = key;
    var nodes = $('chain').querySelectorAll('.node');
    for (var i = 0; i < nodes.length; i++) {
      var k = nodes[i].dataset.k;
      nodes[i].className = 'node' + (on[k] ? ' ' + (cls[k] || 'on') : '');
    }
    $('signalNote').textContent = note ? I18N.plain('pathNote.' + note) : ' ';
  }

  function vital(k, v, unit) { return '<div class="vital"><div class="k">' + k + '</div><div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div></div>'; }
  function updateVitals() {
    if (!sim) return;
    var V = T('vitals'), h = (sim.history || []).slice(-6), m = sim.metrics, out = [];
    if (!m || !h.length) { $('vitals').innerHTML = ''; return; }
    var rate = 0, sv = 0, n = 0;
    h.forEach(function (b) { rate += b.cycle; sv += b.sv; n++; });
    rate = 60 / (rate / n); sv = sv / n;
    var ejected = h.filter(function (b) { return b.ejected; });
    var ef = ejected.length ? ejected.reduce(function (a, b) { return a + b.ef; }, 0) / ejected.length : 0;
    out.push(vital(I18N.markup(V.rate), Math.round(rate), I18N.markup(V.perMin)));
    if (S.cond === 'chb') out.push(vital(I18N.markup(V.atrialRate), S.hr, I18N.markup(V.perMin)));
    out.push(vital(I18N.markup(V.bp), Math.round(m.pSys) + '/' + Math.round(m.pDia), I18N.markup(V.mmHg)));
    out.push(vital(I18N.markup(V.sv), Math.round(sv), I18N.markup(V.mL)));
    if (S.cond === 'as') {
      out.push(vital(I18N.markup(V.lvPeak), Math.round(m.lvPeak), I18N.markup(V.mmHg)));
      out.push(vital(I18N.markup(V.grad), Math.round(m.gradMean), I18N.markup(V.mmHg)));
    } else {
      if (S.cond !== 'chb') out.push(vital(I18N.markup(V.ef), Math.round(ef * 100), '%'));
      out.push(vital(I18N.markup(V.co), (sv * rate / 1000).toFixed(1), I18N.markup(V.lmin)));
    }
    $('vitals').innerHTML = out.join('');
  }

  function updateTiming() {
    if (!sim) return;
    var Tm = T('timing'), m = sim.metrics, el = $('timing');
    var h = (sim.history || []).filter(function (b) { return b.ejected && b.systole; }).slice(-(S.cond === 'af' ? 6 : 2));
    if (!h.length || !ref) { el.innerHTML = ''; return; }
    var sys = h.reduce(function (a, b) { return a + b.systole; }, 0) / h.length, dia = h.reduce(function (a, b) { return a + b.diastole; }, 0) / h.length;
    var scale = 1.25;      // seconds across the full track
    function row(name, also, val, refv, cls) {
      var d = Math.round((val / refv - 1) * 100), big = Math.abs(d) >= 25;
      return '<span class="name">' + I18N.markup(name) + (S.lang === 'en' ? ' <small>' + also + '</small>' : ' <small>' + I18N.markup(also) + '</small>') + '</span>' +
        '<span class="track"><i class="fill ' + cls + '" style="width:' + clamp(val / scale * 100, 0, 100).toFixed(1) + '%"></i><i class="ref" style="left:' + clamp(refv / scale * 100, 0, 100).toFixed(1) + '%"></i></span>' +
        '<span class="ms">' + Math.round(val * 1000) + ' ' + I18N.plain('timing.ms') + '</span>' +
        '<span class="delta' + (big ? ' big' : '') + '">' + (d > 0 ? '+' : '') + d + '%</span>';
    }
    el.innerHTML = row(Tm.sys, Tm.sysAlso, sys, ref.systole, 'sys') + row(Tm.dia, Tm.diaAlso, dia, ref.diastole, 'dia') +
      '<span class="cap">' + I18N.markup(Tm.note) + ' <span dir="ltr">│</span> ' + I18N.markup(Tm.versus) + '</span>';
  }

  /* ---------- interface helpers (look only) ---------- */
  function icon(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function splitItems(el) {
    if (!el) return;
    var parts = el.innerHTML.split(' · ');
    if (parts.length > 1) el.innerHTML = parts.map(function (x) { return '<span>' + x + '</span>'; }).join('');
  }
  function fillRange(el) { el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100).toFixed(1) + '%'); }
  // a pill that glides under the selected button of a group
  function glide(host, instant) {
    if (!host) return;
    var g = host.querySelector('.glide');
    if (!g) { g = document.createElement('span'); g.className = 'glide'; g.setAttribute('aria-hidden', 'true'); host.insertBefore(g, host.firstChild); instant = true; }
    var b = host.querySelector('button[aria-pressed="true"]');
    if (!b || !b.offsetWidth) { g.style.opacity = 0; return; }
    if (instant) host.classList.remove('glide-ready');
    g.style.opacity = 1; g.style.left = b.offsetLeft + 'px'; g.style.top = b.offsetTop + 'px';
    g.style.width = b.offsetWidth + 'px'; g.style.height = b.offsetHeight + 'px';
    if (instant) requestAnimationFrame(function () { requestAnimationFrame(function () { host.classList.add('glide-ready'); }); });
  }
  function glideAll(instant) { ['conds', 'viewSeg', 'speedSeg'].forEach(function (id) { glide($(id), instant); }); }
  function theme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function updateTheme() {
    var dark = theme() === 'dark', lab = I18N.plain(dark ? 'themeLight' : 'themeDark');
    $('btnTheme').innerHTML = icon(dark ? 'sun' : 'moon');
    $('btnTheme').setAttribute('aria-label', lab); $('btnTheme').title = lab;
  }
  function toggleTheme() {
    var t = theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t); store('hb-theme', t); updateTheme();
  }
  function copyPrompt() {
    var text = $('promptText').textContent, done = function () {
      $('btnCopy').classList.add('done');
      $('btnCopy').querySelector('use').setAttribute('href', '#i-check');
      $('copyText').textContent = I18N.plain('copied');
      clearTimeout(copyPrompt.t);
      copyPrompt.t = setTimeout(function () {
        $('btnCopy').classList.remove('done');
        $('btnCopy').querySelector('use').setAttribute('href', '#i-copy');
        $('copyText').textContent = I18N.plain('copy');
      }, 1800);
    };
    function fallback() {
      var r = document.createRange(); r.selectNodeContents($('promptText'));
      var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      try { if (document.execCommand('copy')) done(); } catch (e) { /* the text stays selected for a manual copy */ }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ---------- controls ---------- */
  function setCondition(c) {
    if (CONDS.indexOf(c) < 0) return;
    S.cond = c;
    sim.setHR(S.hr); sim.setCondition(c, 16);
    sim.advance(3.4);                // pre-fill the chart with this rhythm
    sim.events.length = 0;
    blood.reset(sim);
    var b = $('conds').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', b[i].dataset.c === c);
    glide($('conds'));
    lastPhase = -1; lastChain = ''; lastChips = '';
    updateRateLabel(); updateCondCard(); updateVitals(); updateTiming();
  }
  function setView(v) {
    S.view = v; $('cutWrap').hidden = v !== 'cut';
    var b = $('viewSeg').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', b[i].dataset.v === v);
    glide($('viewSeg'));
  }
  function toggleLayer(k) {
    S[k] = !S[k];
    if (k === 'blood' && S.blood && S.view === 'whole') setView('ghost');   // blood is inside: make it visible
    setView(S.view);
    var b = $('layerSeg').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', !!S[b[i].dataset.l]);
  }
  function setSpeed(v) {
    S.speed = v; var b = $('speedSeg').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', +b[i].dataset.s === v);
    glide($('speedSeg'));
  }
  function togglePlay() { if (S.stepping) { S.stepping = false; S.playing = false; } else S.playing = !S.playing; updateButtons(); }
  function stepPhase() { S.stepping = true; S.playing = true; S.stepFrom = sim.phase; updateButtons(); }
  function toggleSound() { if (S.sound) { audio.disable(); S.sound = false; } else S.sound = audio.enable(); updateButtons(); }
  function cutFromSlider() { fillRange($('cutZ')); R.view.cutZ = 3.4 - (+$('cutZ').value / 100) * 6.3; }

  function bindUI() {
    $('conds').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setCondition(b.dataset.c); });
    $('viewSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setView(b.dataset.v); });
    $('layerSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) toggleLayer(b.dataset.l); });
    $('speedSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setSpeed(+b.dataset.s); });
    $('btnPlay').addEventListener('click', togglePlay);
    $('btnStep').addEventListener('click', stepPhase);
    $('btnSound').addEventListener('click', toggleSound);
    $('btnLang').addEventListener('click', function () { S.lang = S.lang === 'ar' ? 'en' : 'ar'; store('hb-lang', S.lang); applyLang(); setView(S.view); });
    $('btnSimplify').addEventListener('click', function () { $('dlg').showModal(); });
    $('btnPrompt').addEventListener('click', function () { $('dlgPrompt').showModal(); });
    $('promptClose').addEventListener('click', function () { $('dlgPrompt').close(); });
    $('dlgPrompt').addEventListener('click', function (e) { if (e.target === $('dlgPrompt')) $('dlgPrompt').close(); });
    $('btnCopy').addEventListener('click', copyPrompt);
    $('btnTheme').addEventListener('click', toggleTheme);
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme); } catch (e) { /* old Safari */ } }
    window.addEventListener('resize', function () { glideAll(true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { glideAll(true); });
    $('dlgClose').addEventListener('click', function () { $('dlg').close(); });
    $('dlg').addEventListener('click', function (e) { if (e.target === $('dlg')) $('dlg').close(); });
    $('infoClose').addEventListener('click', function () { select(0); });
    $('rate').addEventListener('input', function () { S.hr = +this.value; sim.setHR(S.hr); updateRateLabel(); });
    $('cutZ').addEventListener('input', cutFromSlider);
    document.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' || $('dlg').open || $('dlgPrompt').open) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); stepPhase(); }
      else if (e.key >= '1' && e.key <= '4') setCondition(CONDS[+e.key - 1]);
    });

    // camera and picking
    var cv = $('gl'), pts = {}, moved = 0, lastPinch = 0, lastHover = 0;
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); pts[e.pointerId] = [e.clientX, e.clientY]; moved = 0; cv.classList.add('dragging');
      $('hint').classList.add('gone');
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId], ids = Object.keys(pts);
      if (!p) {      // hovering: show which part is under the pointer
        var now = performance.now();
        if (now - lastHover > 90) { lastHover = now; var r = cv.getBoundingClientRect(); var id = R.pickAt(e.clientX - r.left, e.clientY - r.top); R.hover = id || -1; cv.classList.toggle('pointing', !!id); }
        return;
      }
      var dx = e.clientX - p[0], dy = e.clientY - p[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (ids.length === 2) {
        pts[e.pointerId] = [e.clientX, e.clientY];
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (lastPinch) R.zoom(lastPinch / d);
        lastPinch = d; return;
      }
      if (e.shiftKey || e.buttons === 2) R.pan(dx, dy); else R.orbit(dx, -dy * -1);
      pts[e.pointerId] = [e.clientX, e.clientY];
    });
    function up(e) {
      if (pts[e.pointerId] && moved < 5) { var r = cv.getBoundingClientRect(); select(R.pickAt(e.clientX - r.left, e.clientY - r.top)); }
      delete pts[e.pointerId]; lastPinch = 0; cv.classList.remove('dragging');
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); R.zoom(Math.exp(e.deltaY * 0.0012)); $('hint').classList.add('gone'); }, { passive: false });
    cv.addEventListener('dblclick', function () { R.resetView(); });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---------- main loop ---------- */
  var lastT = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    var elapsed = 0;
    if (S.playing) {
      if (S.stepping) {
        elapsed = sim.advanceToNextPhase(dt * Math.min(S.speed, 0.5));
        if (sim.phase !== S.stepFrom) { S.stepping = false; S.playing = false; updateButtons(); }
      } else elapsed = sim.advance(dt * S.speed);
    }
    // events from the simulation: sounds and per-beat read-outs
    var ev = sim.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'MC' || e.type === 'TC' || e.type === 'PC') audio.valve(e.type, e.v, e.t);
      else if (e.type === 'AC') audio.valve('AC', S.cond === 'as' ? 0.35 : 1, e.t);
      else if (e.type === 'BEAT') { updateVitals(); updateTiming(); }
      else if (e.type === 'QRS') beatFlash = now;
    }
    ev.length = 0;
    audio.murmur(S.cond === 'as' && S.playing ? Math.pow(clamp(sim.q.av / 260, 0, 1), 1.3) : 0);
    $('beatDot').classList.toggle('on', now - beatFlash < 110);

    blood.update(sim, elapsed);
    applyState(dt);
    R.render();
    placeLabels();
    updatePhase(); updateSignal();
    charts.draw(sim, chartStrings());
    requestAnimationFrame(frame);
  }
  var csCache = null, csKey = '';
  function chartStrings() {
    var key = S.lang + S.cond;
    if (key === csKey) return csCache;
    var c = T('chart'), L = {};
    for (var k in c) L[k] = I18N.strip(c[k], true);
    L.s1 = 'S1'; L.s2 = 'S2'; L.rtl = I18N.rtl(); L.stenosis = S.cond === 'as';
    L.font = I18N.rtl() ? '"Alyamama", system-ui, -apple-system, "Geeza Pro", sans-serif' : '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    csKey = key; csCache = L; return L;
  }

  /* ---------- start ---------- */
  function start(g) {
    geo = g;
    R = new HeartRenderer($('gl'), geo, { keepBuffer: Q.get('test') === '1' });
    sim = new HeartSim({ condition: 'normal', hr: 75 });
    // reference beat at 75/min in the normal heart, for the timing comparison
    sim.warmup(16); sim.advance(2.5); ref = { systole: sim.metrics.systole, diastole: sim.metrics.diastole };
    sim = new HeartSim({ condition: S.cond, hr: S.hr });
    sim.warmup(16); sim.advance(3.4); sim.events.length = 0;
    blood = new Blood(geo, R); blood.reset(sim);
    charts = new Charts($('chart'));
    bindUI(); applyLang(); setView(S.view); cutFromSlider(); setSpeed(S.speed);
    if (Q.get('sel')) select(+Q.get('sel'));
    $('loading').classList.add('done');
    setTimeout(function () { $('hint').classList.add('gone'); }, 12000);
    window.HB = { renderNow: function () { blood.update(sim, 0); applyState(0); R.render(); placeLabels(); updatePhase(); updateSignal(); charts.draw(sim, chartStrings()); }, updateButtons: updateButtons, sim: function () { return sim; }, R: R, S: S, blood: blood, audio: audio, charts: charts, geo: geo, setCondition: setCondition, setView: setView, select: select, stepPhase: stepPhase, toggleLayer: toggleLayer, ref: ref };
    requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
  }

  I18N.setLang(S.lang);
  document.documentElement.lang = S.lang; document.documentElement.dir = I18N.rtl() ? 'rtl' : 'ltr';
  var pre = document.querySelectorAll('[data-t]');
  for (var i = 0; i < pre.length; i++) pre[i].innerHTML = H(pre[i].getAttribute('data-t'));
  setTimeout(function () {
    try {
      HeartGeo.build(function (p) { $('loadBar').style.width = Math.round(p * 100) + '%'; }, start);
    } catch (err) { document.querySelector('.load-box p').textContent = String(err && err.message || err); }
  }, 30);
})();

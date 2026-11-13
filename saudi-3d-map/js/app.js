/* Saudi Arabia in 3D — map, markers, panels, search, language. */
(function () {
  'use strict';

  var PLACES = window.PLACES || [];
  var BORDER = window.SA_BORDER;
  var I18N = window.I18N;
  var TYPES = ['city', 'heritage', 'nature', 'modern'];
  var TYPE_COLOR = { city: '#ffd166', heritage: '#ff8f66', nature: '#55d992', modern: '#62caff' };
  var SA_BOUNDS = [[34.4, 16.2], [55.8, 32.3]];
  var HOME_PITCH = 20;
  var ORBIT_DEG_PER_SEC = 2.6;           // one full circle in about 2 min 20 s
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var qs = new URLSearchParams(location.search);
  var $ = function (id) { return document.getElementById(id); };
  var body = document.body;
  var byId = {};
  PLACES.forEach(function (p, i) { p.index = i; byId[p.id] = p; });

  function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function store(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* private window */ } }

  var state = {
    lang: (qs.get('lang') || stored('sa3d-lang') || 'en') === 'ar' ? 'ar' : 'en',
    filter: 'all',
    query: '',
    selected: null,
    orbit: false,
    wantOrbit: true,
    relief: 'auto',
    photo: 0,
    introDone: false
  };
  var T = function () { return I18N[state.lang]; };
  var isRtl = function () { return state.lang === 'ar'; };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function km(a, b) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (b[1] - a[1]) * r, dLng = (b[0] - a[0]) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  /* Makes Arabic search forgiving: no diacritics, one form of alef, ya and ta marbuta. */
  function norm(s) {
    return String(s).toLowerCase()
      .replace(/[ً-ْٰـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[’'`\-·]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* ------------------------------------------------------------------ */
  /* Stars behind the globe                                              */
  /* ------------------------------------------------------------------ */
  function drawStars() {
    var c = $('stars'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = c.width = Math.round(innerWidth * dpr), h = c.height = Math.round(innerHeight * dpr);
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, '#0a1422'); grad.addColorStop(1, '#03060b');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    var seed = 20261112;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    var n = Math.round(w * h / 2600);
    for (var i = 0; i < n; i++) {
      var r = rnd(), size = (r > 0.985 ? 1.5 : r > 0.9 ? 1.0 : 0.6) * dpr;
      g.globalAlpha = 0.25 + rnd() * 0.75;
      g.fillStyle = rnd() > 0.85 ? '#ffe9c4' : rnd() > 0.5 ? '#dbe8ff' : '#ffffff';
      g.beginPath(); g.arc(rnd() * w, rnd() * h, size, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ */
  /* Terrain tiles with the sea floor flattened to sea level             */
  /* ------------------------------------------------------------------ */
  var demCache = new Map();
  function fetchRetry(url, tries) {
    return fetch(url).then(function (res) {
      if (!res.ok && res.status >= 500 && tries > 0) throw new Error('retry');
      return res;
    }).catch(function (err) {
      if (tries <= 0) throw err;
      return new Promise(function (go) { setTimeout(go, 500); }).then(function () { return fetchRetry(url, tries - 1); });
    });
  }
  function flattenSea(url) {
    return fetchRetry(url, 2).then(function (res) {
      if (!res.ok) throw new Error('Terrain tile ' + res.status);
      return res.blob();
    }).then(function (blob) {
      return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    }).then(function (bmp) {
      var w = bmp.width, h = bmp.height, canvas, ctx;
      if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
      else { canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; }
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      var img = ctx.getImageData(0, 0, w, h), d = img.data;
      /* terrarium: height = R*256 + G + B/256 - 32768, so R < 128 is below sea level */
      for (var i = 0; i < d.length; i += 4) {
        if (d[i] < 128) { d[i] = 128; d[i + 1] = 0; d[i + 2] = 0; }
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return createImageBitmap(img);
    });
  }
  maplibregl.addProtocol('seadem', function (params, abortController) {
    var url = params.url.replace('seadem://', 'https://');
    var hit = demCache.get(url);
    if (!hit) {
      hit = flattenSea(url);
      demCache.set(url, hit);
      hit.catch(function () { demCache.delete(url); });
      if (demCache.size > 160) demCache.delete(demCache.keys().next().value);
    }
    /* each consumer gets its own bitmap, MapLibre may close the one it receives */
    return hit.then(function (bmp) { return createImageBitmap(bmp); }).then(function (copy) { return { data: copy }; });
  });

  /* ------------------------------------------------------------------ */
  /* Map                                                                 */
  /* ------------------------------------------------------------------ */
  var DEM_TILES = ['seadem://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
  var worldRing = [[-30, -35], [120, -35], [120, 72], [-30, 72], [-30, -35]];
  var maskGeom = {
    type: 'Polygon',
    coordinates: [worldRing].concat(BORDER.coordinates.map(function (poly) { return poly[0]; }))
  };

  function reliefFor(zoom) {
    if (state.relief === 'true') return 1;
    var t = clamp((zoom - 5) / 5.5, 0, 1);
    t = t * t * (3 - 2 * t);
    return 4 + (1.5 - 4) * t;
  }

  var style = {
    version: 8,
    transition: { duration: 0, delay: 0 },
    projection: { type: ['interpolate', ['linear'], ['zoom'], 5.6, 'vertical-perspective', 7, 'mercator'] },
    sources: {
      sat: {
        type: 'raster',
        tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg'],
        tileSize: 256, maxzoom: 14
      },
      dem: { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 12 },
      shade: { type: 'raster-dem', tiles: DEM_TILES, encoding: 'terrarium', tileSize: 256, maxzoom: 12 },
      mask: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: maskGeom } },
      border: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: BORDER } }
    },
    layers: [
      { id: 'ground', type: 'background', paint: { 'background-color': '#0a1826' } },
      { id: 'sat', type: 'raster', source: 'sat',
        paint: {
          /* the 2016 mosaic is very bright and yellow over sand, so close views are toned down */
          'raster-saturation': ['interpolate', ['linear'], ['zoom'], 5, -0.24, 9, -0.44],
          'raster-contrast': ['interpolate', ['linear'], ['zoom'], 5, 0.12, 9, 0.32],
          'raster-brightness-max': ['interpolate', ['linear'], ['zoom'], 5, 0.93, 9, 0.83],
          'raster-hue-rotate': ['interpolate', ['linear'], ['zoom'], 5, 0, 9, -7],
          'raster-fade-duration': qs.get('fade') ? +qs.get('fade') : 350
        } },
      { id: 'shade', type: 'hillshade', source: 'shade',
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.55, 8, 0.5, 12, 0.62],
          'hillshade-shadow-color': '#140e06', 'hillshade-highlight-color': '#fff4dc', 'hillshade-accent-color': '#3a2a14',
          'hillshade-illumination-direction': 315
        } },
      { id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#02060c', 'fill-opacity': 0, 'fill-antialias': false } },
      { id: 'border-glow', type: 'line', source: 'border', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffe7a8', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 5, 6, 10, 10, 14], 'line-blur': 8, 'line-opacity': 0 } },
      { id: 'border-line', type: 'line', source: 'border', layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#fffaf0', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 6, 1.6, 10, 2], 'line-opacity': 0 } }
    ],
    terrain: { source: 'dem', exaggeration: 4 },
    sky: {
      'sky-color': '#6fa5e2', 'horizon-color': '#dbe7f2', 'fog-color': '#dcdcd6',
      'sky-horizon-blend': 0.5, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.8,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4.6, 0.85, 6.6, 0]
    }
  };
  var MASK_OPACITY = ['interpolate', ['linear'], ['zoom'], 2.6, 0, 3.6, 0.5, 6.5, 0.42, 9.5, 0];
  /* the 1:10m border is too coarse to sit on a coastline up close, so it fades out there */
  var GLOW_OPACITY = ['interpolate', ['linear'], ['zoom'], 3, 0.5, 7, 0.4, 9.5, 0];
  var LINE_OPACITY = ['interpolate', ['linear'], ['zoom'], 3, 0.95, 7.5, 0.8, 10, 0];

  var skipIntro = qs.get('intro') === '0' || REDUCED || location.hash.length > 1;
  var map;
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: style,
      center: skipIntro ? [45.1, 24.2] : [12, 8],
      zoom: skipIntro ? 4.6 : 1.35,
      bearing: skipIntro ? 0 : -18,
      pitch: 0,
      minZoom: 1.2, maxZoom: 14.6, maxPitch: 80,
      attributionControl: false,
      fadeDuration: 250,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: qs.get('pdb') === '1' }
    });
  } catch (err) {
    var f = $('fatal'); f.hidden = false;
    f.textContent = 'This browser could not start WebGL, which the 3D map needs. Try a current Chrome, Edge, Safari or Firefox.';
    body.classList.remove('booting');
    return;
  }
  window.__map = map;

  var nav = new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true });
  $('nav-slot').appendChild(nav.onAdd(map));

  var mapErrors = [];
  /* A tile that fails on a network blip is asked for again, twice at most, so the demo never keeps a hole. */
  map.on('error', function (e) {
    mapErrors.push(e && e.error ? String(e.error.message || e.error) : 'error');
    var tile = e && e.tile, id = e && e.sourceId;
    if (!tile || !id || !tile.tileID) return;
    tile.__retries = (tile.__retries || 0) + 1;
    if (tile.__retries > 2) return;
    setTimeout(function () {
      try {
        var managers = map.style && (map.style.tileManagers || map.style.sourceCaches);
        var tm = managers && managers[id];
        if (tm && typeof tm._reloadTile === 'function' && tile.state === 'errored') tm._reloadTile(tile.tileID.key, 'loading');
      } catch (err) { /* leave the tile as it is */ }
    }, 900 * tile.__retries);
  });
  map.on('idle', function () { window.__idle = true; });
  map.on('movestart', function () { window.__idle = false; });

  /* relief follows the zoom level */
  var curRelief = 4;
  function applyRelief(force) {
    var target = reliefFor(map.getZoom());
    if (!force && Math.abs(target - curRelief) < 0.05) return;
    curRelief = target;
    var t = map.terrain;
    if (t && typeof t.exaggeration === 'number') { t.exaggeration = target; map.triggerRepaint(); }
    else { try { map.setTerrain({ source: 'dem', exaggeration: target }); } catch (e) { /* style not ready */ } }
  }
  map.on('zoom', function () { applyRelief(false); });

  /* ------------------------------------------------------------------ */
  /* Camera helpers                                                      */
  /* ------------------------------------------------------------------ */
  function cssPx(name) { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0; }
  function isNarrow() { return innerWidth <= 860; }
  function uiPadding(withDetail) {
    var pad = { top: 0, bottom: 0, left: 0, right: 0 };
    if (isNarrow()) { if (withDetail) pad.bottom = Math.round(innerHeight * 0.5); return pad; }
    var gap = cssPx('--gap');
    var side = body.classList.contains('side-closed') ? 0 : $('sidebar').offsetWidth + gap;
    var det = withDetail ? $('detail').offsetWidth + gap : 0;
    if (isRtl()) { pad.right = side; pad.left = det; } else { pad.left = side; pad.right = det; }
    return pad;
  }
  /* Border points used to frame the whole Kingdom, islands included. */
  var framePts = [];
  BORDER.coordinates.forEach(function (poly) {
    var ring = poly[0], stepN = Math.max(1, Math.floor(ring.length / 60));
    for (var i = 0; i < ring.length; i += stepN) framePts.push(ring[i]);
  });
  /* Finds the camera that fits the Kingdom into the free part of the screen, with the tilt taken into account. */
  function homeCamera() {
    var pad = uiPadding(false);
    var box = { l: pad.left + 64, r: innerWidth - pad.right - 84, t: 104, b: innerHeight - 112 };
    if (isNarrow()) { box.t = 76; box.b = innerHeight - 60; box.l = 16; box.r = innerWidth - 16; }
    var cam = { center: [45.1, 24.0], zoom: 4.6, pitch: HOME_PITCH, bearing: 0 };
    try {
      var tr = map.transform.clone();
      tr.setBearing(0); tr.setPitch(HOME_PITCH);
      if (tr.setPadding) tr.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      for (var it = 0; it < 7; it++) {
        tr.setCenter(new maplibregl.LngLat(cam.center[0], cam.center[1])); tr.setZoom(cam.zoom);
        var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (var i = 0; i < framePts.length; i++) {
          var q = tr.locationToScreenPoint(new maplibregl.LngLat(framePts[i][0], framePts[i][1]));
          if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
        }
        var scale = Math.min((box.r - box.l) / (x1 - x0), (box.b - box.t) / (y1 - y0));
        var want = { x: (box.l + box.r) / 2, y: (box.t + box.b) / 2 };
        var have = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
        var c = tr.screenPointToLocation(new maplibregl.Point(innerWidth / 2 + (have.x - want.x), innerHeight / 2 + (have.y - want.y)));
        if (!c || !isFinite(c.lng) || !isFinite(c.lat) || !isFinite(scale)) throw new Error('fit');
        cam.center = [c.lng, c.lat];
        cam.zoom = clamp(cam.zoom + Math.log2(scale), 2.5, 7);
      }
    } catch (e) {
      cam = { center: [45.1, 24.0], zoom: Math.log2(Math.min(innerWidth, innerHeight * 1.25) / 512 * 360 / 24), pitch: 0, bearing: 0 };
    }
    cam.padding = { top: 0, bottom: 0, left: 0, right: 0 };
    return cam;
  }

  /* ------------------------------------------------------------------ */
  /* Markers                                                             */
  /* ------------------------------------------------------------------ */
  var markers = {};
  function buildMarkers() {
    PLACES.forEach(function (p) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'mk mk-' + p.type;
      el.dataset.id = p.id;
      el.innerHTML = '<span class="mk-in"><span class="mk-dot"></span><span class="mk-label"></span></span>';
      el.addEventListener('click', function (e) { e.stopPropagation(); select(p.id); });
      var m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
      markers[p.id] = { place: p, el: el, label: el.querySelector('.mk-label'), marker: m, w: 80, side: '' };
    });
    labelMarkers();
  }
  function labelMarkers() {
    PLACES.forEach(function (p) {
      var m = markers[p.id]; if (!m) return;
      m.label.textContent = p.name[state.lang];
      m.el.setAttribute('aria-label', p.name[state.lang]);
    });
    measureLabels();
  }
  function measureLabels() {
    PLACES.forEach(function (p) { var m = markers[p.id]; if (m) m.w = m.label.offsetWidth || m.w; });
    scheduleDeclutter();
  }

  /* Labels never overlap: more important places win, the rest show on hover or when you zoom in. */
  var declutterQueued = false;
  function scheduleDeclutter() {
    if (declutterQueued) return;
    declutterQueued = true;
    requestAnimationFrame(function () { declutterQueued = false; declutter(); });
  }
  function hits(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  function labelRect(x, y, w, side) {
    var h = 24, g = 15;
    if (side === 'e') return [x + g, y - h / 2, x + g + w, y + h / 2];
    if (side === 'w') return [x - g - w, y - h / 2, x - g, y + h / 2];
    if (side === 'n') return [x - w / 2, y - g - h, x + w / 2, y - g];
    return [x - w / 2, y + g, x + w / 2, y + g + h];
  }
  function declutter() {
    var W = innerWidth, H = innerHeight;
    var order = PLACES.filter(function (p) { return visibleByFilter(p); }).map(function (p) {
      var pt = map.project([p.lng, p.lat]);
      return { p: p, m: markers[p.id], x: pt.x, y: pt.y };
    }).sort(function (a, b) {
      var sa = a.p.id === state.selected ? 0 : 1, sb = b.p.id === state.selected ? 0 : 1;
      return sa - sb || a.p.priority - b.p.priority || a.p.index - b.p.index;
    });
    var dots = [], labels = [];
    var sides = isRtl() ? ['w', 'e', 'n', 's'] : ['e', 'w', 'n', 's'];
    var majors = [];
    order.forEach(function (o) {
      var on = o.x > -40 && o.x < W + 40 && o.y > -40 && o.y < H + 40;
      var minor = false;
      if (on) {
        for (var i = 0; i < dots.length; i++) {
          var dx = dots[i][0] - o.x, dy = dots[i][1] - o.y;
          if (dx * dx + dy * dy < 17 * 17) { minor = true; break; }
        }
      }
      o.on = on; o.minor = minor;
      if (on && !minor) { dots.push([o.x, o.y]); majors.push(o); }
    });
    var dotRects = majors.map(function (o) { return [o.x - 10, o.y - 10, o.x + 10, o.y + 10]; });
    order.forEach(function (o) {
      var m = o.m, side = '';
      if (o.on && !o.minor) {
        var tryOrder = m.side ? [m.side].concat(sides.filter(function (s) { return s !== m.side; })) : sides;
        for (var s = 0; s < tryOrder.length && !side; s++) {
          var r = labelRect(o.x, o.y, m.w, tryOrder[s]), ok = true;
          for (var i = 0; i < labels.length && ok; i++) if (hits(r, labels[i])) ok = false;
          for (var j = 0; j < majors.length && ok; j++) if (majors[j] !== o && hits(r, dotRects[j])) ok = false;
          if (ok) { side = tryOrder[s]; labels.push(r); }
        }
      }
      m.side = side;
      var cl = m.el.classList;
      cl.toggle('minor', !!o.minor);
      cl.toggle('nolabel', !side);
      cl.toggle('lb-w', side === 'w'); cl.toggle('lb-n', side === 'n'); cl.toggle('lb-s', side === 's');
    });
  }
  map.on('move', scheduleDeclutter);
  window.addEventListener('resize', function () { drawStars(); scheduleDeclutter(); });

  function visibleByFilter(p) { return state.filter === 'all' || p.type === state.filter || p.id === state.selected; }
  function syncMarkers() {
    PLACES.forEach(function (p) {
      var m = markers[p.id]; if (!m) return;
      m.el.classList.toggle('filtered', !visibleByFilter(p));
      m.el.classList.toggle('sel', p.id === state.selected);
    });
    scheduleDeclutter();
  }

  /* ------------------------------------------------------------------ */
  /* Sidebar: search, filter chips, list                                 */
  /* ------------------------------------------------------------------ */
  function matches(p) {
    if (state.filter !== 'all' && p.type !== state.filter) return false;
    if (!state.query) return true;
    var hay = norm([p.name.en, p.name.ar, p.sub.en, p.sub.ar, p.region.en, p.region.ar,
      I18N.en.typeOne[p.type], I18N.ar.typeOne[p.type], I18N.en[p.type], I18N.ar[p.type],
      p.unesco ? 'UNESCO World Heritage اليونسكو يونسكو تراث عالمي ' + p.unesco : ''].join(' | '));
    return norm(state.query).split(' ').every(function (w) { return hay.indexOf(w) !== -1; });
  }
  function currentList() { return PLACES.filter(matches); }

  function renderChips() {
    var t = T(), html = '';
    var counts = { all: PLACES.length };
    TYPES.forEach(function (k) { counts[k] = PLACES.filter(function (p) { return p.type === k; }).length; });
    ['all'].concat(TYPES).forEach(function (k) {
      html += '<button type="button" class="chip" data-filter="' + k + '" aria-pressed="' + (state.filter === k) + '"' +
        (k === 'all' ? '' : ' style="--c:' + TYPE_COLOR[k] + '"') + '>' +
        (k === 'all' ? '' : '<i></i>') + esc(t[k]) + ' <b>' + counts[k] + '</b></button>';
    });
    $('chips').innerHTML = html;
  }
  function renderList() {
    var t = T(), items = currentList(), html = '';
    items.forEach(function (p) {
      html += '<li><button type="button" class="item" data-id="' + p.id + '" style="--c:' + TYPE_COLOR[p.type] + '"' +
        (p.id === state.selected ? ' aria-current="true"' : '') + '>' +
        '<span class="item-dot"></span><span class="item-text"><span class="item-name">' + esc(p.name[state.lang]) +
        '</span><span class="item-sub">' + esc(t.typeOne[p.type]) + ' · ' + esc(p.region[state.lang]) + '</span></span>' +
        (p.unesco ? '<span class="item-unesco">UNESCO</span>' : '') + '</button></li>';
    });
    if (!items.length) html = '<li class="list-empty">' + esc(t.none) + '</li>';
    $('list').innerHTML = html;
    $('count').textContent = t.count(items.length);
    $('search-clear').hidden = !state.query;
  }
  function scrollListToSelected() {
    var el = $('list').querySelector('[aria-current="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  $('chips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]'); if (!b) return;
    state.filter = b.dataset.filter;
    renderChips(); renderList(); syncMarkers();
  });
  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-id]'); if (b) select(b.dataset.id);
  });
  $('search').addEventListener('input', function (e) { state.query = e.target.value; renderList(); });
  $('search').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var first = currentList()[0]; if (first) { select(first.id); e.target.blur(); } }
    if (e.key === 'Escape') { e.stopPropagation(); if (state.query) { clearSearch(); } else e.target.blur(); }
  });
  function clearSearch() { state.query = ''; $('search').value = ''; renderList(); }
  $('search-clear').addEventListener('click', function () { clearSearch(); $('search').focus(); });
  $('side-toggle').addEventListener('click', function () {
    body.classList.toggle('side-closed');
    labelSideToggle();
    setTimeout(function () {
      if (state.selected) map.easeTo({ padding: uiPadding(true), duration: 700 });
    }, 50);
  });
  function labelSideToggle() {
    var closed = body.classList.contains('side-closed');
    $('side-toggle').setAttribute('aria-label', closed ? T().showList : T().hideList);
    $('side-toggle').title = closed ? T().showList : T().hideList;
  }

  /* ------------------------------------------------------------------ */
  /* Place panel                                                         */
  /* ------------------------------------------------------------------ */
  var imgA = new Image(), imgB = new Image(), frontImg = imgA, slideTimer = null;
  var photoErrors = window.__photoErrors = [];
  [imgA, imgB].forEach(function (im) { im.decoding = 'async'; im.alt = ''; $('photo-open').insertBefore(im, $('photo-open').firstChild); });

  function creditHtml(ph) {
    var t = T();
    var lic = ph.licenceUrl
      ? '<a href="' + esc(ph.licenceUrl) + '" target="_blank" rel="noopener license">' + esc(ph.licence) + '</a>'
      : esc(ph.licence);
    return esc(t.photo) + ': <bdi>' + esc(ph.author) + '</bdi> · ' + lic +
      ' · <a href="' + esc(ph.page) + '" target="_blank" rel="noopener">Wikimedia Commons</a>';
  }
  function showPhoto(i, instant) {
    var p = byId[state.selected]; if (!p) return;
    var n = p.photos.length;
    state.photo = ((i % n) + n) % n;
    var ph = p.photos[state.photo];
    var back = frontImg === imgA ? imgB : imgA;
    var token = back.dataset.token = String(Math.random());
    back.onload = function () {
      if (back.dataset.token !== token) return;
      back.classList.add('on'); frontImg.classList.remove('on'); frontImg = back;
    };
    back.onerror = function () { photoErrors.push(ph.file); };
    back.alt = ph[state.lang];
    back.src = ph.file;
    if (instant && back.complete && back.naturalWidth) back.onload();
    $('photo-caption').textContent = ph[state.lang];
    $('photo-credit').innerHTML = creditHtml(ph);
    var dots = '';
    for (var k = 0; k < n; k++) dots += '<button type="button" data-photo="' + k + '" aria-label="' + (k + 1) + '"' + (k === state.photo ? ' aria-current="true"' : '') + '></button>';
    $('photo-dots').innerHTML = n > 1 ? dots : '';
    $('photo-prev').hidden = $('photo-next').hidden = n < 2;
    if (n > 1) { var pre = new Image(); pre.src = p.photos[(state.photo + 1) % n].file; }
    restartSlides();
  }
  function restartSlides() {
    clearInterval(slideTimer);
    if (REDUCED) return;
    slideTimer = setInterval(function () {
      if (!state.selected || !$('lightbox').hidden || $('detail').matches(':hover') || document.hidden) return;
      showPhoto(state.photo + 1);
    }, 6500);
  }
  $('photo-prev').addEventListener('click', function () { showPhoto(state.photo - 1); });
  $('photo-next').addEventListener('click', function () { showPhoto(state.photo + 1); });
  $('photo-dots').addEventListener('click', function (e) {
    var b = e.target.closest('[data-photo]'); if (b) showPhoto(+b.dataset.photo);
  });

  function renderDetail() {
    var p = byId[state.selected]; if (!p) return;
    var t = T(), c = TYPE_COLOR[p.type];
    $('detail').style.setProperty('--c', c);
    $('d-badges').innerHTML =
      '<span class="badge" style="--c:' + c + '"><i></i>' + esc(t.typeOne[p.type]) + '</span>' +
      (p.unesco ? '<span class="badge unesco">' + esc(t.unesco(p.unesco)) + '</span>' : '') +
      '<span class="badge region">' + esc(p.region[state.lang]) + '</span>';
    $('d-name').textContent = p.name[state.lang];
    $('d-sub').textContent = p.sub[state.lang];
    $('d-facts').innerHTML = p.facts[state.lang].map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
    $('d-coords').textContent = t.lat(p.lat) + (isRtl() ? '، ' : ', ') + t.lng(p.lng);
    var a = $('d-source');
    a.textContent = t.source;
    a.href = 'https://' + state.lang + '.wikipedia.org/wiki/' + encodeURIComponent(p.wiki[state.lang].replace(/ /g, '_'));
    $('detail-close').setAttribute('aria-label', t.close); $('detail-close').title = t.close;
    labelOrbit();
  }
  function labelOrbit() {
    var t = T(), b = $('btn-orbit');
    b.classList.toggle('paused', !state.orbit);
    $('orbit-label').textContent = state.orbit ? t.orbitPause : t.orbitPlay;
  }

  /* ------------------------------------------------------------------ */
  /* Selecting a place, circling it, going home                          */
  /* ------------------------------------------------------------------ */
  var flight = 0, orbitRaf = 0;

  function stopOrbit() {
    state.orbit = false;
    cancelAnimationFrame(orbitRaf);
    labelOrbit();
  }
  function startOrbit() {
    if (REDUCED || !state.selected) return;
    cancelAnimationFrame(orbitRaf);
    state.orbit = true; labelOrbit();
    var last = performance.now();
    (function frame(now) {
      if (!state.orbit) return;
      var dt = Math.min(80, now - last); last = now;
      map.setBearing(map.getBearing() + ORBIT_DEG_PER_SEC * dt / 1000);
      orbitRaf = requestAnimationFrame(frame);
    })(last);
  }
  /* any touch of the map by the person stops the circling and cancels a pending one */
  ['mousedown', 'touchstart', 'wheel'].forEach(function (ev) {
    map.on(ev, function () { flight++; if (state.orbit) stopOrbit(); });
  });
  $('btn-orbit').addEventListener('click', function () {
    if (state.orbit) { state.wantOrbit = false; stopOrbit(); }
    else { state.wantOrbit = true; startOrbit(); }
  });

  function select(id, opts) {
    var p = byId[id]; if (!p) return;
    opts = opts || {};
    if (!state.introDone) finishIntro(true);
    state.selected = id;
    state.wantOrbit = true;
    body.classList.add('has-detail');
    body.classList.remove('show-hint');
    if (isNarrow() && !body.classList.contains('side-closed')) { body.classList.add('side-closed'); labelSideToggle(); }
    renderDetail(); showPhoto(0, true);
    $('detail').querySelector('.d-scroll').scrollTop = 0;
    renderList(); syncMarkers(); scrollListToSelected();
    try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// in some browsers */ }
    stopOrbit();
    var token = ++flight;
    var target = { center: [p.lng, p.lat], zoom: p.cam.zoom, pitch: p.cam.pitch, bearing: p.cam.bearing, padding: uiPadding(true) };
    var c = map.getCenter(), d = km([c.lng, c.lat], [p.lng, p.lat]);
    var arrive = function () { if (token === flight && state.selected === id && state.wantOrbit) startOrbit(); };
    if (opts.instant || REDUCED) { map.jumpTo(target); arrive(); return; }
    target.duration = clamp(2800 + d * 2.4, 2800, 7400);
    target.curve = 1.45; target.essential = true;
    map.flyTo(target);
    map.once('moveend', arrive);
  }

  function home(opts) {
    opts = opts || {};
    if (!state.introDone) { finishIntro(true); return; }
    flight++; stopOrbit();
    state.selected = null;
    body.classList.remove('has-detail');
    clearInterval(slideTimer);
    renderList(); syncMarkers();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    var cam = homeCamera();
    if (opts.instant || REDUCED) { map.jumpTo(cam); return; }
    cam.duration = opts.duration || 3600; cam.curve = 1.3; cam.essential = true;
    map.flyTo(cam);
  }
  function step(dir) {
    var list = currentList();
    if (!list.length) list = PLACES;
    var i = list.findIndex(function (p) { return p.id === state.selected; });
    var next = list[((i === -1 ? (dir > 0 ? -1 : 0) : i) + dir + list.length) % list.length];
    select(next.id);
  }
  $('btn-home').addEventListener('click', function () { home(); });
  $('detail-close').addEventListener('click', function () { home(); });
  $('place-prev').addEventListener('click', function () { step(-1); });
  $('place-next').addEventListener('click', function () { step(1); });

  /* ------------------------------------------------------------------ */
  /* Lightbox                                                            */
  /* ------------------------------------------------------------------ */
  var lbImg = null;
  function openLightbox() {
    var p = byId[state.selected]; if (!p) return;
    if (!lbImg) { lbImg = new Image(); lbImg.id = 'lb-img'; $('lb-figure').insertBefore(lbImg, $('lb-figure').firstChild); }
    $('lightbox').hidden = false;
    fillLightbox();
  }
  function fillLightbox() {
    var p = byId[state.selected]; if (!p) return;
    var ph = p.photos[state.photo];
    lbImg.src = ph.file; lbImg.alt = ph[state.lang];
    $('lb-caption').textContent = p.name[state.lang] + ' · ' + ph[state.lang];
    $('lb-credit').innerHTML = creditHtml(ph);
    $('lb-prev').hidden = $('lb-next').hidden = p.photos.length < 2;
  }
  function closeLightbox() { $('lightbox').hidden = true; }
  $('photo-open').addEventListener('click', openLightbox);
  $('lb-close').addEventListener('click', closeLightbox);
  $('lb-prev').addEventListener('click', function () { showPhoto(state.photo - 1); fillLightbox(); });
  $('lb-next').addEventListener('click', function () { showPhoto(state.photo + 1); fillLightbox(); });
  $('lightbox').addEventListener('click', function (e) { if (e.target === $('lightbox') || e.target.tagName === 'FIGURE') closeLightbox(); });

  /* ------------------------------------------------------------------ */
  /* Credits                                                             */
  /* ------------------------------------------------------------------ */
  function renderCredits() {
    var c = T().creditsHtml, html = '';
    html += '<h2>' + esc(c.heading) + '</h2><p>' + esc(c.intro) + '</p>';
    html += '<h3>' + esc(c.mapHead) + '</h3><ul>' + c.map.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>';
    html += '<h3>' + esc(c.factsHead) + '</h3><p>' + esc(c.facts) + '</p>';
    html += '<h3>' + esc(c.moveHead) + '</h3><p>' + esc(c.move) + '</p>';
    html += '<h3>' + esc(c.photosHead) + '</h3><p>' + esc(c.photos) + '</p><ul class="photo-credits">';
    PLACES.forEach(function (p) {
      p.photos.forEach(function (ph) {
        html += '<li><img loading="lazy" src="' + esc(ph.file.replace('photos/', 'photos/thumbs/')) + '" alt="" width="52" height="38"><div><b>' + esc(p.name[state.lang]) + '</b> · ' +
          esc(ph[state.lang]) + '<br><span>' + creditHtml(ph) + '</span></div></li>';
      });
    });
    html += '</ul>';
    $('credits-body').innerHTML = html;
  }
  function openCredits() { renderCredits(); $('credits').hidden = false; $('credits-body').scrollTop = 0; }
  function closeCredits() { $('credits').hidden = true; $('credits-body').innerHTML = ''; }
  $('btn-credits').addEventListener('click', openCredits);
  $('credits-close').addEventListener('click', closeCredits);
  $('credits').addEventListener('click', function (e) { if (e.target === $('credits')) closeCredits(); });
  $('attribution').addEventListener('click', function (e) { if (e.target.closest('[data-open-credits]')) openCredits(); });

  /* ------------------------------------------------------------------ */
  /* Relief button                                                       */
  /* ------------------------------------------------------------------ */
  function labelRelief() { $('relief-label').textContent = state.relief === 'auto' ? T().reliefAuto : T().reliefTrue; }
  $('btn-relief').addEventListener('click', function () {
    state.relief = state.relief === 'auto' ? 'true' : 'auto';
    labelRelief(); applyRelief(true);
  });

  /* ------------------------------------------------------------------ */
  /* Language                                                            */
  /* ------------------------------------------------------------------ */
  function setLang(lang, first) {
    state.lang = lang === 'ar' ? 'ar' : 'en';
    store('sa3d-lang', state.lang);
    var t = T(), html = document.documentElement;
    html.lang = state.lang; html.dir = isRtl() ? 'rtl' : 'ltr';
    document.title = isRtl() ? 'المملكة العربية السعودية · خريطة ثلاثية الأبعاد' : 'Saudi Arabia in 3D';
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t[el.dataset.i18n]; });
    $('search').placeholder = t.search; $('search').setAttribute('aria-label', t.search);
    $('lang-en').setAttribute('aria-pressed', String(!isRtl()));
    $('lang-ar').setAttribute('aria-pressed', String(isRtl()));
    $('btn-credits').setAttribute('aria-label', t.credits); $('btn-credits').title = t.credits;
    $('attribution').innerHTML = t.attribution;
    $('photo-prev').setAttribute('aria-label', t.prev); $('photo-next').setAttribute('aria-label', t.next);
    $('lb-prev').setAttribute('aria-label', t.prev); $('lb-next').setAttribute('aria-label', t.next);
    $('lb-close').setAttribute('aria-label', t.close); $('credits-close').setAttribute('aria-label', t.close);
    labelSideToggle(); labelRelief();
    renderChips(); renderList();
    if (state.selected) { renderDetail(); showPhoto(state.photo, true); }
    if (!$('credits').hidden) renderCredits();
    if (!$('lightbox').hidden) fillLightbox();
    labelMarkers();
    if (!first) {
      /* panels swap sides, so the camera re-centres on the free part of the screen */
      setTimeout(function () {
        if (state.selected) map.easeTo({ padding: uiPadding(true), duration: 700 });
        else if (state.introDone) { var cam = homeCamera(); cam.duration = 900; map.easeTo(cam); }
      }, 60);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLabels);
  }
  $('lang-en').addEventListener('click', function () { setLang('en'); });
  $('lang-ar').addEventListener('click', function () { setLang('ar'); });

  /* ------------------------------------------------------------------ */
  /* Keyboard                                                            */
  /* ------------------------------------------------------------------ */
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test((e.target.tagName || ''));
    if (e.key === 'Escape') {
      if (!$('lightbox').hidden) return closeLightbox();
      if (!$('credits').hidden) return closeCredits();
      if (!state.introDone) return finishIntro(true);
      if (state.selected) return home();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!state.introDone) { finishIntro(true); return; }
    if (e.key === '/') { e.preventDefault(); $('search').focus(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var fwd = (e.key === 'ArrowRight') !== isRtl();
      if (!$('lightbox').hidden) { showPhoto(state.photo + (fwd ? 1 : -1)); fillLightbox(); e.preventDefault(); return; }
      if (state.selected && document.activeElement && !document.activeElement.closest('.maplibregl-canvas-container')) {
        step(fwd ? 1 : -1); e.preventDefault();
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Opening sequence                                                    */
  /* ------------------------------------------------------------------ */
  var introTimers = [];
  /* The border and the dimming are drawn onto the 3D ground, which only redraws when the style changes,
     so the fade is stepped by hand instead of using a paint transition. */
  function scaled(expr, k) {
    return expr.map(function (v, i) { return i >= 4 && i % 2 === 0 ? +(v * k).toFixed(3) : v; });
  }
  var borderShown = 0, borderTimer = null;
  function setBorder(k) {
    borderShown = k;
    if (!map.getLayer('border-line')) return;
    map.setPaintProperty('border-glow', 'line-opacity', scaled(GLOW_OPACITY, k));
    map.setPaintProperty('border-line', 'line-opacity', scaled(LINE_OPACITY, k));
    map.setPaintProperty('mask', 'fill-opacity', scaled(MASK_OPACITY, k));
  }
  function showBorder(ms) {
    clearInterval(borderTimer);
    if (ms < 200 || borderShown >= 1) { setBorder(1); return; }
    var steps = 10, i = Math.round(borderShown * steps);
    borderTimer = setInterval(function () {
      i++; setBorder(Math.min(1, i / steps));
      if (i >= steps) clearInterval(borderTimer);
    }, ms / steps);
  }
  function popMarkers() {
    var order = PLACES.slice().sort(function (a, b) { return a.priority - b.priority || b.lat - a.lat; });
    order.forEach(function (p, i) {
      var el = markers[p.id].el, inner = el.querySelector('.mk-in');
      el.style.setProperty('--d', (i * 55) + 'ms');
      el.classList.add('pop');
      inner.addEventListener('animationend', function () { el.classList.remove('pop'); }, { once: true });
    });
  }
  function finishIntro(skipped) {
    if (state.introDone) return;
    state.introDone = true;
    introTimers.forEach(clearTimeout);
    if (skipped) { map.stop(); map.jumpTo(homeCamera()); }
    showBorder(skipped ? 0 : 900);
    popMarkers();
    body.classList.remove('booting', 'intro-out');
    body.classList.add('show-hint');
    setTimeout(function () { body.classList.remove('show-hint'); }, 11000);
    applyRelief(true);
    scheduleDeclutter();
  }
  function runIntro() {
    if (state.introDone) return;
    body.classList.add('intro-out');
    var cam = homeCamera();
    cam.duration = 5600; cam.curve = 1.2; cam.essential = true;
    cam.easing = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    map.flyTo(cam);
    introTimers.push(setTimeout(function () { showBorder(1500); }, 3000));
    introTimers.push(setTimeout(function () { finishIntro(false); }, 4900));
  }
  window.addEventListener('pointerdown', function (e) {
    if (state.introDone) return;
    e.stopPropagation(); e.preventDefault();
    finishIntro(true);
  }, true);

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */
  drawStars();
  if (isNarrow()) body.classList.add('side-closed');
  setLang(state.lang, true);
  buildMarkers();

  map.on('load', function () {
    applyRelief(true);
    if (skipIntro) {
      map.jumpTo(homeCamera());
      finishIntro(false);
      var id = decodeURIComponent(location.hash.slice(1));
      if (byId[id]) setTimeout(function () { select(id, { instant: qs.get('instant') === '1' }); }, 400);
      return;
    }
    /* let the first imagery arrive, then fly in; never wait longer than 3 s */
    var started = false;
    var go = function () { if (started) return; started = true; setTimeout(runIntro, 250); };
    map.once('idle', go);
    setTimeout(go, 1600);
  });

  /* a quiet notice if the tile servers cannot be reached */
  setTimeout(function () {
    if (!map.areTilesLoaded() && mapErrors.length > 6 && !map.isMoving()) {
      console.warn('Map tiles are slow or failing to load. Check the internet connection.');
    }
  }, 15000);

  window.__app = {
    map: map, state: state, places: PLACES, select: select, home: home, setLang: setLang, step: step,
    markers: markers, errors: mapErrors, homeCamera: homeCamera, relief: function () { return curRelief; }
  };
})();

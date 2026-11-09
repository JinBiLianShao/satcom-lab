/* =====================================================================
 * satcom-lab · js/viz.js
 * 手写 3D 引擎 + 8 个参数驱动的实时绘制器
 *
 * 零外部依赖：所有图形由 Canvas 2D API 现场计算绘制，不引 three.js、
 * 不贴静态图片、不发网络请求。全局名 window.SatViz。
 *
 * 依赖（按 index.html 顺序先加载）：window.SatPhysics
 * ===================================================================== */
(function (root) {
  'use strict';

  var P = root.SatPhysics || (typeof globalThis !== 'undefined' ? globalThis.SatPhysics : null);

  /* ------------------------------------------------------------------ *
   * 0. 通用小工具
   * ------------------------------------------------------------------ */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function rgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function fmt(v, n) {
    if (!isFinite(v)) { return '—'; }
    if (n === undefined) { n = Math.abs(v) >= 100 ? 1 : 2; }
    return v.toFixed(n);
  }
  function num(v, dflt) {
    var x = parseFloat(v);
    return isFinite(x) ? x : (dflt === undefined ? 0 : dflt);
  }

  /* 深色背景 + 网格 + 坐标轴：所有 2D 图表共用 */
  function chartFrame(ctx, w, h, opt) {
    opt = opt || {};
    var pad = opt.pad || { l: 58, r: 18, t: 26, b: 38 };
    ctx.clearRect(0, 0, w, h);
    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0d1526');
    bg.addColorStop(1, '#080e1c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    var x0 = pad.l, x1 = w - pad.r, y0 = pad.t, y1 = h - pad.b;
    ctx.strokeStyle = rgba('#35d0d8', 0.10);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= 5; i++) {
      var yy = lerp(y0, y1, i / 5);
      ctx.moveTo(x0, yy); ctx.lineTo(x1, yy);
    }
    for (var j = 0; j <= 6; j++) {
      var xx = lerp(x0, x1, j / 6);
      ctx.moveTo(xx, y0); ctx.lineTo(xx, y1);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba('#8fa3bf', 0.55);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1);
    ctx.stroke();
    if (opt.title) {
      ctx.fillStyle = '#cfe0f5';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(opt.title, x0, 6);
    }
    if (opt.xLabel) {
      ctx.fillStyle = '#8fa3bf';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(opt.xLabel, x1, h - 4);
    }
    if (opt.yLabel) {
      ctx.save();
      ctx.translate(12, y0 + 4);
      ctx.fillStyle = '#8fa3bf';
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(opt.yLabel, 0, 0);
      ctx.restore();
    }
    return { x0: x0, x1: x1, y0: y0, y1: y1, pad: pad, w: w, h: h };
  }

  function axisTicks(ctx, fr, xs, ys, fmtX, fmtY) {
    ctx.fillStyle = '#8fa3bf';
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var i = 0; i < xs.length; i++) {
      var t = xs[i];
      ctx.fillText(fmtX ? fmtX(t.v) : String(t.v), lerp(fr.x0, fr.x1, t.p), fr.y1 + 5);
      ctx.strokeStyle = rgba('#8fa3bf', 0.25);
      ctx.beginPath();
      ctx.moveTo(lerp(fr.x0, fr.x1, t.p), fr.y1);
      ctx.lineTo(lerp(fr.x0, fr.x1, t.p), fr.y1 + 3);
      ctx.stroke();
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var j = 0; j < ys.length; j++) {
      var s = ys[j];
      ctx.fillText(fmtY ? fmtY(s.v) : String(s.v), fr.x0 - 6, lerp(fr.y1, fr.y0, s.p));
    }
  }

  function legend(ctx, w, h, items) {
    if (!items || !items.length) { return; }
    var x = 12, y = h - 20;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var i = 0; i < items.length; i++) {
      ctx.fillStyle = items[i].color;
      ctx.fillRect(x, y - 5, 10, 10);
      ctx.fillStyle = '#aebbcf';
      var t = items[i].text;
      ctx.fillText(t, x + 14, y);
      x += 20 + ctx.measureText(t).width + 12;
      if (x > w - 90) { x = 12; y -= 16; }
    }
  }

  function marker(ctx, x, y, label, color) {
    color = color || '#ff9e4f';
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    if (label) {
      ctx.fillStyle = color;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(label, x + 9, y - 4);
    }
  }

  /* ------------------------------------------------------------------ *
   * 1. 手写 3D 引擎
   *
   * 世界坐标：地心为原点，Z 轴指向北极，X/Y 在赤道面。
   * 相机固定看向 -Z 方向（视点在 +Z 远处），物体先按 yaw 绕 Z 旋转、
   * 再按 pitch 绕 X 旋转，然后透视除法投影到画布。
   * ------------------------------------------------------------------ */
  function Scene3D() {
    this.yaw = -0.55;
    this.pitch = -0.42;
    this.dist = 3.1;              // 以「地球半径 = 1」为单位
    this.fov = 1.05;
    this.playing = true;
    this.phase = 0;
    this.radius = 1;             // 地球半径（场景单位）
    this.orbits = [
      { h: 600, inc: 53, color: '#35d0d8', label: 'LEO 600 km', count: 4 },
      { h: 20200, inc: 55, color: '#7c9cff', label: 'MEO 20200 km', count: 2 },
      { h: 35786, inc: 0, color: '#ff9e4f', label: 'GEO 35786 km', count: 3 }
    ];
    this.selected = 0;
    this.minElev = 10;
    this.sun = (function () {
      var v = [0.75, 0.35, 0.56], n = Math.hypot(v[0], v[1], v[2]);
      return [v[0] / n, v[1] / n, v[2] / n];
    })();
    this.stars = (function () {
      var s = [], seed = 20261105;
      function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
      for (var i = 0; i < 110; i++) { s.push({ x: rnd(), y: rnd(), a: 0.15 + rnd() * 0.65, r: rnd() < 0.85 ? 0.7 : 1.4 }); }
      return s;
    })();
    // 简化大陆轮廓（经纬度顶点，仅示意，不做真实地图）
    this.land = [
      [[-168, 66], [-140, 70], [-125, 60], [-110, 55], [-95, 50], [-82, 45], [-70, 47], [-60, 52], [-55, 60], [-80, 72], [-110, 73], [-140, 70]],
      [[-82, 25], [-97, 18], [-105, 20], [-112, 30], [-100, 40], [-85, 45], [-70, 44], [-60, 30], [-75, 12], [-82, 8]],
      [[-81, 8], [-70, 12], [-60, 5], [-50, -5], [-35, -8], [-38, -22], [-50, -32], [-58, -40], [-70, -52], [-75, -35], [-80, -10]],
      [[-10, 36], [0, 44], [10, 45], [28, 41], [40, 37], [35, 30], [25, 31], [15, 38], [5, 43], [-5, 43]],
      [[-17, 15], [-10, 5], [5, 5], [12, -5], [25, -10], [40, -15], [35, -30], [18, -35], [10, -20], [-5, -5], [-15, 10]],
      [[30, 60], [60, 65], [90, 70], [120, 60], [140, 50], [130, 35], [110, 25], [95, 20], [80, 30], [60, 40], [45, 50]],
      [[112, -12], [130, -12], [145, -20], [150, -32], [140, -38], [125, -34], [115, -25]],
      [[-180, -78], [-120, -75], [-60, -72], [0, -70], [60, -72], [120, -76], [180, -78], [180, -90], [-180, -90]]
    ];

    /* ---- 真实感升级：全部程序化生成，零外部贴图 ---- */
    var self0 = this;
    function seeded(seed) {
      var s = seed >>> 0;
      return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }
    // 特性 1：大气层辉光参数
    this.atmosphere = { color: [90, 178, 255], thickness: 0.16, intensity: 0.85 };
    // 特性 2：星空分层（远景星 + 银河带 + 少量带光芒的亮星）
    this.galaxy = (function () {
      var rnd = seeded(77021), g = [], i;
      for (i = 0; i < 420; i++) {
        var t = rnd() * TAU, spread = (rnd() - 0.5) * 0.32;
        g.push({ x: 0.5 + Math.cos(t) * (0.15 + rnd() * 0.5),
                 y: 0.5 + Math.sin(t) * 0.09 + spread,
                 a: 0.05 + rnd() * 0.28, r: rnd() < 0.9 ? 0.6 : 1.2 });
      }
      return g;
    })();
    this.brightStars = (function () {
      var rnd = seeded(31337), b = [];
      for (var i = 0; i < 12; i++) { b.push({ x: rnd(), y: rnd() * 0.9, s: 1.2 + rnd() * 1.6 }); }
      return b;
    })();
    // 特性 3：程序化云层（球面 blob，独立于地面缓慢漂移）
    this.clouds = (function () {
      var rnd = seeded(20261109), c = [];
      for (var i = 0; i < 130; i++) {
        c.push({ lon: rnd() * 360 - 180, lat: (rnd() - 0.5) * 150,
                 r: 4 + rnd() * 11, a: 0.14 + rnd() * 0.3, drift: 0.6 + rnd() * 1.4 });
      }
      return c;
    })();
    // 特性 4：夜侧城市灯光（沿大陆中低纬的暖色点簇）
    this.cityLights = (function () {
      var rnd = seeded(884422), l = [], k, m, p;
      for (k = 0; k < self0.land.length; k++) {
        var poly = self0.land[k];
        for (m = 0; m < poly.length; m++) {
          p = poly[m];
          if (Math.abs(p[1]) > 62) { continue; }   // 极区无人烟
          var cnt = 2 + Math.floor(rnd() * 3);
          for (var q = 0; q < cnt; q++) {
            l.push({ lon: p[0] + (rnd() - 0.5) * 24, lat: p[1] + (rnd() - 0.5) * 16,
                     a: 0.35 + rnd() * 0.5, r: 0.6 + rnd() * 0.9 });
          }
        }
      }
      return l;
    })();
    // 特性 5：地形色板（按纬度带 + 噪声决定海洋/陆地/沙漠/极地色）
    // 基色按「白天满光照」标定，配合 _light 抬底后夜间自然变暗但不至于全黑。
    this.terrain = {
      deepOcean: [22, 68, 128], ocean: [30, 96, 168], shallow: [46, 138, 196],
      land: [72, 138, 88], grass: [92, 158, 96], desert: [196, 172, 112],
      ice: [226, 240, 250], forest: [52, 116, 78]
    };
    // 特性 6：可清点的特性清单（供浏览器核验）
    this.features = ['atmosphere', 'dayNight', 'nightLights', 'terrain', 'clouds',
                     'starfieldLayers', 'fineGrid', 'sphereShading', 'flow'];

    /* ---- 动态通讯流程：5 阶段，信号包沿 地面站→上行→卫星→下行→地面站 循环 ---- */
    this.flow = {
      playing: true,
      phase: 0,                       // 0..1 循环
      speed: 0.12,                    // 每秒循环比例
      stages: [
        { id: 'source', label: '信源编码', desc: '地面站把语音/数据变成比特流并做 FEC' },
        { id: 'uplink', label: '上行链路', desc: '调制上变频，经高功放与天线发向卫星' },
        { id: 'transpond', label: '星上转发', desc: '转发器低噪放、变频、功放（透明/处理）' },
        { id: 'downlink', label: '下行链路', desc: '信号下传，穿过大气与可能的雨衰' },
        { id: 'deliver', label: '译码送达', desc: '收端低噪放、下变频、解调译码到信宿' }
      ],
      stageCount: 5
    };
    // 两个地面站（单位球表面经纬度），构成一次完整的星地通信
    this.stations = [
      { name: 'A 站（发）', lon: -74, lat: 40 },
      { name: 'B 站（收）', lon: 116, lat: 39 }
    ];
  }

  /* 程序化 2D 值噪声（用于地形/云的色块，零依赖） */
  Scene3D.prototype._noise2 = function (x, y) {
    var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  Scene3D.prototype._fbm = function (x, y) {
    var v = 0, a = 0.5, i;
    for (i = 0; i < 3; i++) { v += a * this._noise2(x, y); x *= 2.1; y *= 2.1; a *= 0.5; }
    return v;
  };

  /* 地形着色：返回某经纬度处的地表基色 [r,g,b]（不含光照） */
  Scene3D.prototype._terrainColor = function (lon, lat) {
    var T = this.terrain;
    var n = this._fbm((lon + 180) * 0.06, (lat + 90) * 0.09);
    var latA = Math.abs(lat);
    if (latA > 74) { return T.ice; }                       // 极冠
    // 用大陆轮廓近似判断海陆：统计落在哪个多边形附近（简化：用噪声阈值分块）
    var landMass = this._isLand(lon, lat);
    if (!landMass) {
      var deep = n < 0.4;
      return deep ? T.deepOcean : (n < 0.68 ? T.ocean : T.shallow);
    }
    if (latA < 26 && n > 0.58) { return T.desert; }       // 副热带干旱带
    if (latA > 55) { return T.forest; }                  // 高纬针叶林
    return n > 0.55 ? T.grass : T.land;
  };
  /* 简化海陆判定：点是否落在任一大陆多边形的经纬度包围盒内（教学示意） */
  Scene3D.prototype._isLand = function (lon, lat) {
    var i, j, poly, inside, minLon, maxLon, minLat, maxLat, n;
    for (i = 0; i < this.land.length; i++) {
      poly = this.land[i];
      minLon = maxLon = poly[0][0]; minLat = maxLat = poly[0][1];
      for (j = 1; j < poly.length; j++) {
        minLon = Math.min(minLon, poly[j][0]); maxLon = Math.max(maxLon, poly[j][0]);
        minLat = Math.min(minLat, poly[j][1]); maxLat = Math.max(maxLat, poly[j][1]);
      }
      if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) { continue; }
      inside = false; n = poly.length;
      for (j = 0; j < n; j++) {
        var a = poly[j], b = poly[(j + 1) % n];
        if (((a[1] > lat) !== (b[1] > lat)) &&
            (lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1] || 1e-6) + a[0])) { inside = !inside; }
      }
      if (inside) { return true; }
    }
    return false;
  };

  Scene3D.prototype.rotate = function (dxPx, dyPx) {
    this.yaw += dxPx * 0.006;
    this.pitch = clamp(this.pitch + dyPx * 0.006, rad(-85), rad(85));
  };
  Scene3D.prototype.zoomBy = function (factor) {
    this.dist = clamp(this.dist / factor, 1.55, 8);
  };
  Scene3D.prototype.setView = function (name) {
    var v = { front: [-0.55, -0.18], top: [0, -1.48], geo: [-0.55, -0.02], polar: [0.6, -1.25] };
    var p = v[name] || v.front;
    this.yaw = p[0]; this.pitch = clamp(p[1], rad(-85), rad(85));
  };
  Scene3D.prototype.setPlaying = function (b) { this.playing = !!b; };
  Scene3D.prototype.setOrbits = function (defs) { if (defs && defs.length) { this.orbits = defs; } };
  Scene3D.prototype.setMinElev = function (e) { this.minElev = num(e, 10); };
  Scene3D.prototype.setSelected = function (i) { this.selected = i; };

  /* ---- 动态通讯流程控制 ---- */
  Scene3D.prototype.setFlowPlaying = function (b) { this.flow.playing = !!b; };
  Scene3D.prototype.advanceFlow = function (dtSec) {
    if (this.flow.playing) {
      this.flow.phase = (this.flow.phase + dtSec * this.flow.speed) % 1;
    }
  };
  Scene3D.prototype.flowStageIndex = function () {
    return Math.min(this.flow.stageCount - 1, Math.floor(this.flow.phase * this.flow.stageCount));
  };
  Scene3D.prototype.flowStage = function () {
    return this.flow.stages[this.flowStageIndex()];
  };
  /* 地面站 → 单位球表面三维点 */
  Scene3D.prototype.stationPoint = function (st, r, w, h) {
    var p = spherePoint(st.lon, st.lat, r || this.radius);
    return this.project(p, w || this._lw || 800, h || this._lh || 520);
  };
  /* 链路折线：A 站 → 卫星 → B 站（世界坐标），供信号包插值 */
  Scene3D.prototype.flowPath = function (satWorld) {
    var a = spherePoint(this.stations[0].lon, this.stations[0].lat, this.radius * 1.01);
    var b = spherePoint(this.stations[1].lon, this.stations[1].lat, this.radius * 1.01);
    return [a, satWorld, b];
  };
  /* 沿折线按 t∈[0,1] 取点（前 0.5 段 A→星，后 0.5 段 星→B） */
  Scene3D.prototype._lerp3 = function (p, q, t) {
    return [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  };
  Scene3D.prototype.flowPointAt = function (path, t) {
    if (t < 0.5) { return this._lerp3(path[0], path[1], t / 0.5); }
    return this._lerp3(path[1], path[2], (t - 0.5) / 0.5);
  };

  /* 旋转矩阵（手写欧拉变换）：先绕 Z（yaw），再绕 X（pitch） */
  Scene3D.prototype._rot = function (p) {
    var cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var x1 = p[0] * cy - p[1] * sy;
    var y1 = p[0] * sy + p[1] * cy;
    var z1 = p[2];
    return [x1, y1 * cp - z1 * sp, y1 * sp + z1 * cp];
  };

  /* 透视投影：返回画布像素坐标 + 深度 + 缩放比 */
  Scene3D.prototype.project = function (p3, w, h) {
    var q = this._rot(p3);
    var f = Math.min(w, h) * 0.5 / Math.tan(this.fov / 2);
    var zc = this.dist - q[2];            // 相机在 +Z，看向 -Z
    var visible = zc > 0.08;
    var s = f / Math.max(zc, 0.08);
    return { x: w / 2 + q[0] * s, y: h / 2 - q[1] * s, z: zc, scale: s, visible: visible, q: q };
  };

  /* 球面经纬度 → 单位球三维点 */
  function spherePoint(lonDeg, latDeg, r) {
    var lo = rad(lonDeg), la = rad(latDeg);
    return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
  }

  /* 轨道倾角旋转：把赤道面轨道点绕 X 轴倾转 inc */
  function orbitPoint(r, t, incDeg) {
    var x = r * Math.cos(t), y = r * Math.sin(t);
    var ci = Math.cos(rad(incDeg)), si = Math.sin(rad(incDeg));
    return [x, y * ci, y * si];
  }

  Scene3D.prototype._sats = function (tSec) {
    var out = [], self = this, idx = 0;
    var GEOperiod = 86164;   // 动画里把 GEO 画成缓慢移动，便于观察
    this.orbits.forEach(function (o, oi) {
      var r = (P.C.RE + o.h) / P.C.RE;
      var Tsec = P.orbitalPeriodSec(o.h);
      var omega = TAU / (Tsec / 60);   // 动画加速：1 分钟轨道周期 → 1 秒
      for (var k = 0; k < (o.count || 1); k++) {
        var t = (tSec * omega) + (TAU * k / (o.count || 1)) + oi * 0.7;
        out.push({ p: orbitPoint(r, t, o.inc), oi: oi, idx: idx, r: r, t: t, o: o,
                   periodMin: Tsec / 60, angSpeed: omega });
        idx++;
      }
    });
    return out;
  };

  /* Lambert 光照：面法向 · 太阳方向 */
  Scene3D.prototype._light = function (normalWorld) {
    var d = normalWorld[0] * this.sun[0] + normalWorld[1] * this.sun[1] + normalWorld[2] * this.sun[2];
    // 夜面留 0.42 的环境光（让城市灯光/地球轮廓仍可读），昼面到 1.0
    return 0.42 + 0.58 * clamp(d, 0, 1);
  };

  Scene3D.prototype.render = function (ctx, w, h, tSec, flowTSec) {
    if (this.playing) { this.phase = tSec; }
    var t = this.phase;
    var self = this;
    // 通讯流程相位推进：用独立时基 flowTSec（未传则回退 tSec），由 flow.playing 控制
    var ft = (flowTSec === undefined) ? tSec : flowTSec;
    if (this._lastFlowT === undefined) { this._lastFlowT = ft; }
    var fdt = Math.max(0, Math.min(ft - this._lastFlowT, 0.2));
    this._lastFlowT = ft;
    this.advanceFlow(fdt);   // advanceFlow 内部判断 flow.playing

    /* 背景 + 星空分层（远景星 / 银河带 / 亮星光芒）—— 特性「星空分层」 */
    var bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
    bg.addColorStop(0, '#0d1a30'); bg.addColorStop(0.6, '#070f20'); bg.addColorStop(1, '#03060e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // 银河带（低亮度密集点）
    for (var gi = 0; gi < this.galaxy.length; gi++) {
      var gx = this.galaxy[gi];
      ctx.fillStyle = 'rgba(150,180,255,' + gx.a + ')';
      ctx.beginPath(); ctx.arc(gx.x * w, gx.y * h, gx.r, 0, TAU); ctx.fill();
    }
    // 常规星点
    for (var si = 0; si < this.stars.length; si++) {
      var st = this.stars[si];
      ctx.fillStyle = 'rgba(210,230,255,' + st.a + ')';
      ctx.beginPath(); ctx.arc(st.x * w, st.y * h, st.r, 0, TAU); ctx.fill();
    }
    // 亮星十字光芒
    for (var bi = 0; bi < this.brightStars.length; bi++) {
      var bs = this.brightStars[bi], bx = bs.x * w, by = bs.y * h, s = bs.s;
      var sg = ctx.createRadialGradient(bx, by, 0, bx, by, s * 5);
      sg.addColorStop(0, 'rgba(255,255,255,0.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(bx, by, s * 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(220,235,255,0.5)'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(bx - s * 4, by); ctx.lineTo(bx + s * 4, by);
      ctx.moveTo(bx, by - s * 4); ctx.lineTo(bx, by + s * 4); ctx.stroke();
    }

    var R = this.radius;
    var camDir = [0, 0, 1];   // 相机方向（世界坐标近似，用于背面剔除）

    /* ---- 地球：按经纬度切四边形，地形色 + 昼夜光照 + 球面明暗（真实感核心） ---- */
    var faces = [];
    var nLat = 26, nLon = 52;      // 更细网格
    var i, j, lo, la;
    for (i = 0; i < nLat; i++) {
      var la0 = -90 + 180 * i / nLat, la1 = -90 + 180 * (i + 1) / nLat;
      for (j = 0; j < nLon; j++) {
        var lo0 = -180 + 360 * j / nLon, lo1 = -180 + 360 * (j + 1) / nLon;
        var pts = [spherePoint(lo0, la0, R), spherePoint(lo1, la0, R),
                   spherePoint(lo1, la1, R), spherePoint(lo0, la1, R)];
        var m = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2];
        var nl = Math.hypot(m[0], m[1], m[2]) || 1;
        var normal = [m[0] / nl, m[1] / nl, m[2] / nl];
        var qr = this._rot(normal);
        if (qr[2] > 0.12) { continue; }        // 背面剔除
        var pr = pts.map(function (p) { return self.project(p, w, h); });
        var zavg = (pr[0].z + pr[1].z + pr[2].z + pr[3].z) / 4;
        var lit = this._light(normal);         // Lambert 昼夜
        var col = this._terrainColor((lo0 + lo1) / 2, (la0 + la1) / 2);  // 地形色
        // 球面边缘暗化：法向 z 越接近 0（越靠边）越暗，但下限抬高避免整体发黑
        var rim = clamp(-qr[2] * 0.9 + 0.55, 0.6, 1);
        faces.push({ pr: pr, z: zavg, lit: lit, col: col, rim: rim,
                     lat: (la0 + la1) / 2, lon: (lo0 + lo1) / 2, normal: normal });
      }
    }
    faces.sort(function (a, b) { return b.z - a.z; });
    for (i = 0; i < faces.length; i++) {
      var f = faces[i];
      ctx.beginPath();
      ctx.moveTo(f.pr[0].x, f.pr[0].y);
      for (j = 1; j < 4; j++) { ctx.lineTo(f.pr[j].x, f.pr[j].y); }
      ctx.closePath();
      var k = f.lit * f.rim;
      ctx.fillStyle = 'rgb(' + Math.round(f.col[0] * k) + ',' + Math.round(f.col[1] * k) + ',' + Math.round(f.col[2] * k) + ')';
      ctx.fill();
    }

    /* ---- 大气辉光：以地心投影为圆心画内外两圈渐变（特性「大气」） ---- */
    var center = this.project([0, 0, 0], w, h);
    // 用地球可见半径估算：取赤道上一点到中心的投影距离
    var eq = this.project(spherePoint(0, 0, R), w, h);
    var RePx = Math.max(20, Math.hypot(eq.x - center.x, eq.y - center.y));
    var atmo = this.atmosphere;
    var ag = ctx.createRadialGradient(center.x, center.y, RePx * 0.86,
                                      center.x, center.y, RePx * (1 + atmo.thickness));
    ag.addColorStop(0, 'rgba(' + atmo.color.join(',') + ',0)');
    ag.addColorStop(0.72, 'rgba(' + atmo.color.join(',') + ',' + (0.10 * atmo.intensity) + ')');
    ag.addColorStop(0.90, 'rgba(' + atmo.color.join(',') + ',' + (0.34 * atmo.intensity) + ')');
    ag.addColorStop(1, 'rgba(' + atmo.color.join(',') + ',0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(center.x, center.y, RePx * (1 + atmo.thickness), 0, TAU); ctx.fill();
    // 大气内缘亮环
    ctx.strokeStyle = 'rgba(' + atmo.color.join(',') + ',' + (0.5 * atmo.intensity) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(center.x, center.y, RePx * 1.005, 0, TAU); ctx.stroke();

    /* ---- 球面高光（太阳方向的镜面亮斑，特性「球面明暗」） ---- */
    var sunP = this.project([this.sun[0] * R, this.sun[1] * R, this.sun[2] * R], w, h);
    var hl = ctx.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, RePx * 0.55);
    hl.addColorStop(0, 'rgba(255,252,235,0.22)');
    hl.addColorStop(1, 'rgba(255,252,235,0)');
    ctx.fillStyle = hl;
    ctx.beginPath(); ctx.arc(sunP.x, sunP.y, RePx * 0.55, 0, TAU); ctx.fill();

    /* ---- 夜侧城市灯光（特性「夜面灯光」）：只在背光面可见 ---- */
    for (i = 0; i < this.cityLights.length; i++) {
      var cl = this.cityLights[i];
      var cp = spherePoint(cl.lon, cl.lat, R * 1.006);
      var cn = cp[0] * this.sun[0] + cp[1] * this.sun[1] + cp[2] * this.sun[2];
      if (cn > -0.05) { continue; }              // 只在夜面
      var cq = this._rot(cp);
      if (cq[2] > 0.1) { continue; }            // 只在可见面
      var cpp = this.project(cp, w, h);
      ctx.fillStyle = 'rgba(255,196,96,' + cl.a + ')';
      ctx.beginPath(); ctx.arc(cpp.x, cpp.y, cl.r, 0, TAU); ctx.fill();
    }

    /* ---- 云层（特性「云」）：独立缓慢漂移的半透明球面 blob ---- */
    var cloudShift = t * 1.2;
    for (i = 0; i < this.clouds.length; i++) {
      var cd = this.clouds[i];
      var clon = cd.lon + cloudShift * cd.drift;
      var ccp = spherePoint(clon, cd.lat, R * 1.012);
      var cqn = this._rot(ccp);
      if (cqn[2] > 0.1) { continue; }
      var cpr = this.project(ccp, w, h);
      var clit = this._light([ccp[0] / R, ccp[1] / R, ccp[2] / R]);
      var cr = clamp(cpr.scale * cd.r / 400, 2, 22);
      var cg = ctx.createRadialGradient(cpr.x, cpr.y, 0, cpr.x, cpr.y, cr);
      cg.addColorStop(0, 'rgba(240,248,255,' + (cd.a * clit) + ')');
      cg.addColorStop(1, 'rgba(240,248,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cpr.x, cpr.y, cr, 0, TAU); ctx.fill();
    }

    /* ---- 简化大陆轮廓（画在正面可见的经纬度点上） ---- */
    ctx.lineWidth = 1.2;
    for (i = 0; i < this.land.length; i++) {
      var poly = this.land[i];
      ctx.beginPath();
      var started = false;
      for (j = 0; j < poly.length; j++) {
        var sp = spherePoint(poly[j][0], poly[j][1], R * 1.004);
        var nr = this._rot(sp);
        var pp = this.project(sp, w, h);
        // 只连可见半球上的点
        if (nr[2] < 0.15) {
          if (!started) { ctx.moveTo(pp.x, pp.y); started = true; }
          else { ctx.lineTo(pp.x, pp.y); }
        } else { started = false; }
      }
      ctx.strokeStyle = rgba('#5fe0b0', 0.55);
      ctx.stroke();
    }

    /* ---- 细经纬网（每 10°，赤道/本初子午线加粗，特性「细网格」） ---- */
    for (var lat = -80; lat <= 80; lat += 10) {
      ctx.beginPath(); var s1 = false;
      for (var lo = -180; lo <= 180; lo += 3) {
        var gp = spherePoint(lo, lat, R * 1.003), gq = this._rot(gp), gpr = this.project(gp, w, h);
        if (gq[2] < 0.16) { if (!s1) { ctx.moveTo(gpr.x, gpr.y); s1 = true; } else { ctx.lineTo(gpr.x, gpr.y); } }
        else { s1 = false; }
      }
      var isMajor = (lat === 0);
      ctx.strokeStyle = rgba('#8fe6f0', isMajor ? 0.42 : (lat % 30 === 0 ? 0.16 : 0.07));
      ctx.lineWidth = isMajor ? 1.4 : 0.6;
      ctx.stroke();
    }
    for (var lon = -180; lon < 180; lon += 10) {
      ctx.beginPath(); var s2 = false;
      for (var la = -90; la <= 90; la += 3) {
        var mp = spherePoint(lon, la, R * 1.003), mq = this._rot(mp), mpr = this.project(mp, w, h);
        if (mq[2] < 0.16) { if (!s2) { ctx.moveTo(mpr.x, mpr.y); s2 = true; } else { ctx.lineTo(mpr.x, mpr.y); } }
        else { s2 = false; }
      }
      var major = (lon === 0 || lon % 30 === 0);
      ctx.strokeStyle = rgba('#8fe6f0', major ? 0.15 : 0.06);
      ctx.lineWidth = major ? 0.8 : 0.5;
      ctx.stroke();
    }

    /* ---- 轨道环、卫星、覆盖锥、波束：与地球面片一起按深度分层 ---- */
    var sats = this._sats(t);
    var primitives = [];

    // 轨道环（采样成线段，按深度排序）
    for (var oi = 0; oi < this.orbits.length; oi++) {
      var orb = this.orbits[oi];
      var orr = (P.C.RE + orb.h) / P.C.RE;
      var seg = 96;
      for (var k = 0; k < seg; k++) {
        var a0 = TAU * k / seg, a1 = TAU * (k + 1) / seg;
        var pA = orbitPoint(orr, a0, orb.inc), pB = orbitPoint(orr, a1, orb.inc);
        var qA = this.project(pA, w, h), qB = this.project(pB, w, h);
        primitives.push({ z: (qA.z + qB.z) / 2, kind: 'orbit', qA: qA, qB: qB, color: orb.color });
      }
    }

    // 卫星 + 覆盖锥 + 地面覆盖圈 + 星地波束
    var sel = sats[this.selected % sats.length];
    for (var m = 0; m < sats.length; m++) {
      var s = sats[m];
      var ps = this.project(s.p, w, h);
      primitives.push({ z: ps.z, kind: 'sat', p: ps, color: s.o.color, sel: s.idx === sel.idx, oi: s.oi });

      // 覆盖锥：从卫星向地心方向张一个锥，锥半角由最小仰角几何给出
      var cone = this._cone(s.p, R);
      if (cone) {
        primitives.push({ z: ps.z + 0.02, kind: 'cone', pts: cone.pts, color: s.o.color,
                          foot: cone.foot, ground: cone.ground });
      }
      if (s.idx === sel.idx) {
        // 星地波束：卫星 → 星下点（地球表面）
        var n = Math.hypot(s.p[0], s.p[1], s.p[2]) || 1;
        var sub = [s.p[0] / n * R, s.p[1] / n * R, s.p[2] / n * R];
        primitives.push({ z: ps.z - 0.01, kind: 'beam', a: ps,
                          b: this.project(sub, w, h), color: '#ffd166' });
      }
    }
    primitives.sort(function (a, b) { return b.z - a.z; });

    for (var pi = 0; pi < primitives.length; pi++) {
      var g2 = primitives[pi];
      if (g2.kind === 'orbit') {
        if (!g2.qA.visible || !g2.qB.visible) { continue; }
        ctx.strokeStyle = rgba(g2.color, 0.55);
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(g2.qA.x, g2.qA.y); ctx.lineTo(g2.qB.x, g2.qB.y); ctx.stroke();
      } else if (g2.kind === 'cone') {
        ctx.beginPath();
        ctx.moveTo(g2.pts[0].x, g2.pts[0].y);
        for (var ci = 1; ci < g2.pts.length; ci++) { ctx.lineTo(g2.pts[ci].x, g2.pts[ci].y); }
        ctx.closePath();
        ctx.fillStyle = rgba(g2.color, 0.07);
        ctx.fill();
        ctx.strokeStyle = rgba(g2.color, 0.32);
        ctx.lineWidth = 1; ctx.stroke();
        // 地面覆盖圈
        if (g2.ground && g2.ground.length) {
          ctx.beginPath(); var gs = false;
          for (var gi = 0; gi < g2.ground.length; gi++) {
            var q = g2.ground[gi];
            if (q.visible) { if (!gs) { ctx.moveTo(q.x, q.y); gs = true; } else { ctx.lineTo(q.x, q.y); } }
            else { gs = false; }
          }
          ctx.strokeStyle = rgba(g2.color, 0.45); ctx.lineWidth = 1.2; ctx.stroke();
        }
      } else if (g2.kind === 'beam') {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = rgba(g2.color, 0.9); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(g2.a.x, g2.a.y); ctx.lineTo(g2.b.x, g2.b.y); ctx.stroke();
        ctx.setLineDash([]);
      } else if (g2.kind === 'sat') {
        var p = g2.p;
        if (!p.visible) { continue; }
        var rr = clamp(p.scale * 0.012, 3.2, 9);
        if (g2.sel) {
          ctx.strokeStyle = rgba('#ffd166', 0.8); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr + 5, 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = g2.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x - rr * 0.3, p.y - rr * 0.3, rr * 0.35, 0, TAU); ctx.fill();
      }
    }

    /* ---- 动态通讯流程（特性「通讯流动」）：A 站 → 卫星 → B 站 ---- */
    this._drawFlow(ctx, w, h, t, sats, sel, R);

    /* ---- 图例（3D 场景自带，app.js 也会用 meta.legend 再显示一层） ---- */
    var lx = 12, ly = 16;
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (var li = 0; li < this.orbits.length; li++) {
      var ob = this.orbits[li];
      ctx.fillStyle = ob.color; ctx.fillRect(lx, ly - 4, 9, 9);
      ctx.fillStyle = '#cfe0f5'; ctx.fillText(ob.label, lx + 14, ly);
      ly += 16;
    }
    ctx.fillStyle = '#8fa3bf';
    ctx.fillText('拖拽旋转 · 滚轮缩放 · 虚线为选中卫星的星地波束', lx, ly + 4);
  };

  /* 动态通讯流程绘制：地面站 → 上行 → 星上转发 → 下行 → 收端
   * 信号包沿折线循环流动，当前阶段用高亮箭头串与文字标出。 */
  Scene3D.prototype._drawFlow = function (ctx, w, h, t, sats, sel, R) {
    var flow = this.flow;
    var satW = sel ? sel.p : [0, 0, 1.5];
    var path = this.flowPath(satW);
    var a = this.stationPoint(this.stations[0], R, w, h);
    var b = this.stationPoint(this.stations[1], R, w, h);
    var sat = this.project(satW, w, h);
    var stageIdx = this.flowStageIndex();

    // 链路折线（虚线底，分上行/下行两段，当前阶段高亮）
    var segColors = ['#ffd166', '#7cff9e', '#35d0d8', '#ff9e4f', '#ff7ba8'];
    var upColor = (stageIdx === 1) ? '#7cff9e' : rgba('#7cff9e', 0.35);
    var downColor = (stageIdx === 3) ? '#ff9e4f' : rgba('#ff9e4f', 0.35);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = (stageIdx === 1) ? 2.4 : 1.4;
    ctx.strokeStyle = upColor;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(sat.x, sat.y); ctx.stroke();
    ctx.lineWidth = (stageIdx === 3) ? 2.4 : 1.4;
    ctx.strokeStyle = downColor;
    ctx.beginPath(); ctx.moveTo(sat.x, sat.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);

    // 地面站标记
    var stationsPts = [[a, this.stations[0]], [b, this.stations[1]]];
    for (var s = 0; s < stationsPts.length; s++) {
      var sp = stationsPts[s][0], stn = stationsPts[s][1];
      if (!sp.visible) { continue; }
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 3.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#ffd166', 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, 7, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffe6a8'; ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(stn.name, sp.x, sp.y - 9);
    }

    // 星上转发阶段的脉冲光环
    if (stageIdx === 2 && sat.visible) {
      var pulse = 8 + 5 * Math.sin(t * 6);
      ctx.strokeStyle = rgba('#35d0d8', 0.85); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sat.x, sat.y, pulse + 6, 0, TAU); ctx.stroke();
    }

    // 信号包：沿折线运动，多个包间隔分布（体现"持续业务流"）
    var pk, pp, tt, glow, col;
    for (var k = 0; k < 3; k++) {
      tt = (flow.phase + k / 3) % 1;
      pk = this.flowPointAt(path, tt);
      pp = this.project(pk, w, h);
      if (!pp.visible) { continue; }
      col = tt < 0.5 ? '#7cff9e' : '#ff9e4f';
      glow = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, 9);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.4, col);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(pp.x, pp.y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pp.x, pp.y, 2.2, 0, TAU); ctx.fill();
    }

    // 阶段指示条（画布底部，5 段，当前段高亮）
    var barW = Math.min(360, w - 40), barX = (w - barW) / 2, barY = h - 30, segW = barW / flow.stageCount;
    for (var q = 0; q < flow.stageCount; q++) {
      var sx = barX + q * segW;
      ctx.fillStyle = (q === stageIdx) ? segColors[q] : rgba(segColors[q], 0.22);
      ctx.fillRect(sx + 1, barY, segW - 2, 4);
      ctx.fillStyle = (q === stageIdx) ? '#e6edf7' : '#64748b';
      ctx.font = (q === stageIdx ? '600 ' : '') + '10px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(flow.stages[q].label, sx + segW / 2, barY + 7);
    }
  };

  /* 覆盖锥几何：从卫星出发，按最小仰角求地面覆盖半角，画锥面 + 地面圈 */
  Scene3D.prototype._cone = function (sat, R) {
    var n = Math.hypot(sat[0], sat[1], sat[2]) || 1;
    var r = n;                              // 单位地球半径下的轨道半径
    var hKm = (r - 1) * P.C.RE;
    if (hKm < 100) { return null; }
    var alpha = P.footprintCentralAngle(hKm, this.minElev);  // 地心张角 [rad]
    if (!isFinite(alpha) || alpha <= 0) { return null; }
    var dir = [sat[0] / n, sat[1] / n, sat[2] / n];
    // 构造与 dir 垂直的两个基向量
    var up = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    var e1 = [dir[1] * up[2] - dir[2] * up[1], dir[2] * up[0] - dir[0] * up[2], dir[0] * up[1] - dir[1] * up[0]];
    var e1n = Math.hypot(e1[0], e1[1], e1[2]) || 1; e1 = [e1[0] / e1n, e1[1] / e1n, e1[2] / e1n];
    var e2 = [dir[1] * e1[2] - dir[2] * e1[1], dir[2] * e1[0] - dir[0] * e1[2], dir[0] * e1[1] - dir[1] * e1[0]];
    // 地面覆盖圈半径（单位球弧长）
    var footRadius = Math.sin(alpha);
    var footZ = Math.cos(alpha);
    var ground = [], conePts = [], K = 28;
    for (var i = 0; i <= K; i++) {
      var a = TAU * i / K;
      var g = [dir[0] * footZ + (e1[0] * Math.cos(a) + e2[0] * Math.sin(a)) * footRadius,
               dir[1] * footZ + (e1[1] * Math.cos(a) + e2[1] * Math.sin(a)) * footRadius,
               dir[2] * footZ + (e1[2] * Math.cos(a) + e2[2] * Math.sin(a)) * footRadius];
      ground.push(g);
      // 锥面边缘点：卫星到覆盖圈边界的中点附近（收一点，避免盖住地球）
      conePts.push([lerp(sat[0], g[0], 0.86), lerp(sat[1], g[1], 0.86), lerp(sat[2], g[2], 0.86)]);
    }
    var w = this._lw || 800, h = this._lh || 520;
    return {
      pts: [this.project(sat, w, h)].concat(conePts.map(function (p) { return this.project(p, w, h); }, this)),
      ground: ground.map(function (p) { return this.project(p, w, h); }, this),
      footRadius: footRadius
    };
  };

  /* 让 render 时缓存画布尺寸，供 _cone 投影用 */
  var _origRender = Scene3D.prototype.render;
  Scene3D.prototype.render = function (ctx, w, h, tSec, flowTSec) {
    this._lw = w; this._lh = h;
    return _origRender.call(this, ctx, w, h, tSec, flowTSec);
  };

  /* ------------------------------------------------------------------ *
   * 2. 各绘制器共用的 2D 曲线工具
   * ------------------------------------------------------------------ */
  function plot(ctx, fr, xs, ys, opts) {
    opts = opts || {};
    if (!ys.length) { return; }
    var lo = opts.yMin, hi = opts.yMax;
    if (lo === undefined || hi === undefined) {
      lo = Math.min.apply(null, ys); hi = Math.max.apply(null, ys);
      var padY = (hi - lo) * 0.15 || 1; lo -= padY; hi += padY;
    }
    var X = function (i) { return lerp(fr.x0, fr.x1, i / (ys.length - 1)); };
    var Y = function (v) { return lerp(fr.y1, fr.y0, clamp((v - lo) / (hi - lo || 1), 0, 1)); };
    if (opts.fill) {
      ctx.beginPath(); ctx.moveTo(X(0), fr.y1);
      for (var f = 0; f < ys.length; f++) { ctx.lineTo(X(f), Y(ys[f])); }
      ctx.lineTo(X(ys.length - 1), fr.y1); ctx.closePath();
      ctx.fillStyle = rgba(opts.color || '#35d0d8', 0.10); ctx.fill();
    }
    ctx.beginPath();
    for (var i = 0; i < ys.length; i++) {
      var px = X(i), py = Y(ys[i]);
      if (i === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
    }
    ctx.strokeStyle = opts.color || '#35d0d8';
    ctx.lineWidth = opts.width || 2;
    ctx.setLineDash(opts.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
    return { X: X, Y: Y, lo: lo, hi: hi };
  }

  function emptyMeta(readouts, leg, hitboxes) {
    return { hitboxes: hitboxes || [], legend: leg || [], readouts: readouts || [] };
  }

  /* ------------------------------------------------------------------ *
   * 3. 八个绘制器（在下方 drawers 对象中登记）
   *    先写 2D 类，再写 3D 类；system 需要 lessons 数据。
   * ------------------------------------------------------------------ */
  var drawers = {};

  /* --- 3) 星地链路预算 ------------------------------------------------ */
  drawers.link = function (canvas, ctx, params, state, w, h) {
    var fr = chartFrame(ctx, w, h, { title: '链路预算：余量随发射功率 / 频率 / 码速率变化', xLabel: '发射功率 Pt (dBW)', yLabel: 'Eb/N₀ 与余量 (dB)' });
    var f = num(params.freq, 12.5), D = num(params.dish, 1.2), rb = num(params.rate, 8) * 1e6;
    var gt = P.antennaGain(D, f, 0.6);
    var fs = P.fspl(f, P.slantRange(35786, 40));
    var xs = [], ebs = [], margins = [], threshold = 5;
    for (var pt = 0; pt <= 40; pt += 0.5) {
      xs.push(pt);
      var e = P.eirp(pt, gt, 2);
      var c = P.cn0(e, fs, 1.5, P.gOverT(gt, 150));
      var eb = P.ebn0(c, rb);
      ebs.push(eb); margins.push(eb - threshold);
    }
    var sc = plot(ctx, fr, xs, ebs, { color: '#35d0d8', fill: true });
    plot(ctx, fr, xs, margins, { color: '#ff9e4f', dash: [5, 4] });
    // 零余量门限线
    var zeroY = sc.Y(threshold);
    ctx.strokeStyle = rgba('#ff6b6b', 0.6); ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(fr.x0, zeroY); ctx.lineTo(fr.x1, zeroY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff6b6b'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
    ctx.fillText('门限 ' + threshold + ' dB', fr.x1 - 4, zeroY - 4);
    var cur = clamp((num(params.pt, 20) - 0) / 40, 0, 1);
    marker(ctx, lerp(fr.x0, fr.x1, cur), sc.Y(P.ebn0(P.cn0(P.eirp(num(params.pt, 20), gt, 2), fs, 1.5, P.gOverT(gt, 150)), rb)),
           'Pt=' + fmt(num(params.pt, 20), 0) + ' dBW', '#ffd166');
    axisTicks(ctx, fr, [{ v: 0, p: 0 }, { v: 10, p: .25 }, { v: 20, p: .5 }, { v: 30, p: .75 }, { v: 40, p: 1 }],
              [{ v: fmt(sc.lo, 0), p: 0 }, { v: fmt((sc.lo + sc.hi) / 2, 0), p: .5 }, { v: fmt(sc.hi, 0), p: 1 }]);
    legend(ctx, w, h, [{ color: '#35d0d8', text: 'Eb/N₀' }, { color: '#ff9e4f', text: '链路余量' }]);
    var eb = P.ebn0(P.cn0(P.eirp(num(params.pt, 20), gt, 2), fs, 1.5, P.gOverT(gt, 150)), rb);
    return emptyMeta([
      { label: 'EIRP', value: fmt(P.eirp(num(params.pt, 20), gt, 2), 1), unit: 'dBW' },
      { label: 'FSPL', value: fmt(fs, 1), unit: 'dB' },
      { label: 'C/N₀', value: fmt(P.cn0(P.eirp(num(params.pt, 20), gt, 2), fs, 1.5, P.gOverT(gt, 150)), 1), unit: 'dB-Hz' },
      { label: 'Eb/N₀', value: fmt(eb, 1), unit: 'dB' },
      { label: '链路余量', value: fmt(eb - threshold, 1), unit: 'dB' }
    ], [{ color: '#35d0d8', text: 'Eb/N₀' }, { color: '#ff9e4f', text: '余量' }]);
  };

  /* --- 4) 天线波束与方向图 -------------------------------------------- */
  drawers.beam = function (canvas, ctx, params, state, w, h) {
    var fr = chartFrame(ctx, w, h, { title: '抛物面天线归一化方向图（极坐标）', xLabel: '离轴角 (°)', yLabel: '相对增益 (dB)' });
    var f = num(params.freq, 12.5), D = num(params.dish, 1.2), eff = num(params.eff, 0.6);
    var lam = P.wavelength(f), theta = P.beamwidth(D, f), G = P.antennaGain(D, f, eff);
    var xs = [], ys = [];
    for (var a = -30; a <= 30; a += 0.25) {
      xs.push(a);
      // 用 Airy 型方向图近似：主瓣 sinc² + 旁瓣包络
      var u = Math.PI * (D / lam) * Math.sin(rad(a));
      var s = Math.abs(u) < 1e-6 ? 1 : Math.sin(u) / u;
      var lin = s * s;
      var dbv = 10 * Math.log10(Math.max(lin, 1e-5));
      ys.push(clamp(dbv, -40, 0));
    }
    var sc = plot(ctx, fr, xs, ys, { color: '#35d0d8', fill: true, yMin: -40, yMax: 0 });
    // 标 -3dB 与波束宽度
    var half = theta / 2;
    var hx = lerp(fr.x0, fr.x1, (half + 30) / 60);
    ctx.strokeStyle = rgba('#ff9e4f', 0.7); ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(hx, fr.y0); ctx.lineTo(hx, fr.y1); ctx.stroke();
    ctx.setLineDash([]);
    var minus3 = sc.Y(-3);
    ctx.strokeStyle = rgba('#ff9e4f', 0.45);
    ctx.beginPath(); ctx.moveTo(fr.x0, minus3); ctx.lineTo(fr.x1, minus3); ctx.stroke();
    marker(ctx, lerp(fr.x0, fr.x1, 0.5), sc.Y(0), '主瓣 0 dB', '#ffd166');
    axisTicks(ctx, fr, [{ v: -30, p: 0 }, { v: -15, p: .25 }, { v: 0, p: .5 }, { v: 15, p: .75 }, { v: 30, p: 1 }],
              [{ v: '0', p: 1 }, { v: '-20', p: .5 }, { v: '-40', p: 0 }]);
    legend(ctx, w, h, [{ color: '#35d0d8', text: '归一化方向图' }, { color: '#ff9e4f', text: '半功率点 ±' + fmt(half, 2) + '°' }]);
    return emptyMeta([
      { label: '波长 λ', value: fmt(lam, 4), unit: 'm' },
      { label: '增益 G', value: fmt(G, 1), unit: 'dBi' },
      { label: '波束宽度 θ', value: fmt(theta, 2), unit: '°' },
      { label: '口径 D', value: fmt(D, 2), unit: 'm' }
    ]);
  };

  /* --- 5) 多普勒频移 -------------------------------------------------- */
  drawers.doppler = function (canvas, ctx, params, state, w, h) {
    var fr = chartFrame(ctx, w, h, { title: '一次 LEO 过境的多普勒 S 曲线', xLabel: '过境时间（归一化）', yLabel: '频移 (kHz)' });
    var hKm = num(params.alt, 600), f = num(params.carrier, 2), elev = num(params.elev, 10);
    var fmax = P.maxDopplerLEO(hKm, f);
    var xs = [], ys = [], N = 160;
    for (var i = 0; i <= N; i++) {
      var u = i / N;                 // 0→1 一次过境
      xs.push(u);
      // 视线径向速度 ∝ 过境相位，S 形：接近正、远离负
      var v = Math.cos(Math.PI * u) * (1 - Math.pow(2 * u - 1, 2) * 0.15);
      ys.push(fmax * v);
    }
    var sc = plot(ctx, fr, xs, ys, { color: '#35d0d8', fill: true });
    // GEO 对照：几乎为 0
    var geo = hKm > 20000 ? fmax : P.maxDopplerLEO(35786, f);
    plot(ctx, fr, xs, xs.map(function () { return geo * 0.02; }), { color: '#ff9e4f', dash: [5, 4] });
    var mx = Math.max(fmax, 1);
    var cur = clamp((elev - 0) / 90, 0, 1);
    marker(ctx, lerp(fr.x0, fr.x1, cur), sc.Y(fmax * Math.cos(Math.PI * cur)), '仰角 ' + fmt(elev, 0) + '°', '#ffd166');
    axisTicks(ctx, fr, [{ v: '入境', p: 0 }, { v: '过顶', p: .5 }, { v: '出境', p: 1 }],
              [{ v: '+' + fmt(mx, 1), p: 1 }, { v: '0', p: .5 }, { v: '−' + fmt(mx, 1), p: 0 }]);
    legend(ctx, w, h, [{ color: '#35d0d8', text: 'LEO ' + fmt(hKm, 0) + ' km @ ' + fmt(f, 1) + ' GHz' }, { color: '#ff9e4f', text: 'GEO（近乎 0）' }]);
    return emptyMeta([
      { label: '轨道速度', value: fmt(P.orbitalVelocity(hKm), 2), unit: 'km/s' },
      { label: '最大频移', value: '±' + fmt(fmax, 2), unit: 'kHz' },
      { label: '轨道周期', value: fmt(P.orbitalPeriod(hKm), 1), unit: 'min' },
      { label: '载频', value: fmt(f, 2), unit: 'GHz' }
    ]);
  };

  /* --- 6) 传播损耗与雨衰 ---------------------------------------------- */
  drawers.loss = function (canvas, ctx, params, state, w, h) {
    var fr = chartFrame(ctx, w, h, { title: '自由空间损耗 FSPL 随频率变化 + 附加损耗分解', xLabel: '频率 (GHz)', yLabel: '损耗 (dB)' });
    var elev = num(params.elev, 40), rr = num(params.rain, 10), fcur = num(params.freq, 12.5);
    var d = P.slantRange(35786, elev);
    var xs = [], fs = [], total = [];
    for (var f = 1; f <= 40; f += 0.25) {
      xs.push(f);
      var v = P.fspl(f, d); fs.push(v);
      total.push(v + P.rainAttenuation(f, rr, 5) + 0.5);
    }
    var sc = plot(ctx, fr, xs, fs, { color: '#35d0d8', fill: true });
    plot(ctx, fr, xs, total, { color: '#ff9e4f', dash: [5, 3] });
    var ci = clamp((fcur - 1) / 39, 0, 1);
    var fv = P.fspl(fcur, d);
    marker(ctx, lerp(fr.x0, fr.x1, ci), sc.Y(fv), fmt(fcur, 1) + ' GHz → ' + fmt(fv, 1) + ' dB', '#ffd166');
    axisTicks(ctx, fr, [{ v: '1', p: 0 }, { v: '10', p: .23 }, { v: '20', p: .49 }, { v: '30', p: .74 }, { v: '40', p: 1 }],
              [{ v: fmt(sc.lo, 0), p: 0 }, { v: fmt((sc.lo + sc.hi) / 2, 0), p: .5 }, { v: fmt(sc.hi, 0), p: 1 }]);
    // 右下角柱状：FSPL / 雨衰 / 大气
    var rain = P.rainAttenuation(fcur, rr, 5);
    var bars = [{ t: 'FSPL', v: fv, c: '#35d0d8' }, { t: '雨衰', v: rain, c: '#ff9e4f' }, { t: '大气', v: 0.5, c: '#7c9cff' }];
    var bx = fr.x1 - 150, by = fr.y0 + 12, bw = 26, gap = 14, maxV = fv;
    for (var b = 0; b < bars.length; b++) {
      var bh = clamp(bars[b].v / maxV * 70, 2, 70);
      ctx.fillStyle = rgba(bars[b].c, 0.85);
      ctx.fillRect(bx + b * (bw + gap), by + 70 - bh, bw, bh);
      ctx.fillStyle = '#aebbcf'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(bars[b].t, bx + b * (bw + gap) + bw / 2, by + 84);
      ctx.fillText(fmt(bars[b].v, 1), bx + b * (bw + gap) + bw / 2, by + 96);
    }
    legend(ctx, w, h, [{ color: '#35d0d8', text: 'FSPL' }, { color: '#ff9e4f', text: '+雨衰+大气' }]);
    return emptyMeta([
      { label: '斜距', value: fmt(d, 0), unit: 'km' },
      { label: 'FSPL', value: fmt(fv, 1), unit: 'dB' },
      { label: '雨衰', value: fmt(rain, 2), unit: 'dB' },
      { label: '降雨率', value: fmt(rr, 0), unit: 'mm/h' }
    ]);
  };

  /* --- 7) 调制与编码 -------------------------------------------------- */
  drawers.mod = function (canvas, ctx, params, state, w, h) {
    var fr = chartFrame(ctx, w, h, { title: '香农容量 vs Eb/N₀（不同调制阶数）', xLabel: 'Eb/N₀ (dB)', yLabel: '频谱效率 (bps/Hz)' });
    var m = num(params.morder, 2), rate = num(params.rate, 0.5), ebCur = num(params.ebn0, 8);
    var orders = [2, 3, 4], colors = ['#35d0d8', '#7c9cff', '#ff9e4f'], names = ['QPSK', '8PSK', '16QAM'];
    var xs = [];
    for (var e = -2; e <= 20; e += 0.25) { xs.push(e); }
    var sc;
    for (var oi = 0; oi < orders.length; oi++) {
      var M = Math.pow(2, orders[oi]);
      var ys = xs.map(function (eb) {
        var cap = P.shannonCapacity(1, eb);        // B=1Hz
        return Math.min(cap, Math.log2(M) * rate); // 受调制阶数与码率限制
      });
      sc = plot(ctx, fr, xs, ys, { color: colors[oi], width: orders[oi] === m ? 2.6 : 1.2 });
    }
    var ci = clamp((ebCur + 2) / 22, 0, 1);
    var M2 = Math.pow(2, m);
    var capAt = Math.min(P.shannonCapacity(1, ebCur), Math.log2(M2) * rate);
    marker(ctx, lerp(fr.x0, fr.x1, ci), sc.Y(capAt), '当前 ' + fmt(ebCur, 1) + ' dB', '#ffd166');
    axisTicks(ctx, fr, [{ v: '−2', p: 0 }, { v: '5', p: .318 }, { v: '10', p: .545 }, { v: '15', p: .773 }, { v: '20', p: 1 }],
              [{ v: '0', p: 0 }, { v: fmt(sc.hi / 2, 1), p: .5 }, { v: fmt(sc.hi, 1), p: 1 }]);
    // 左下角星座图示意
    var cx = fr.x0 + 46, cy = fr.y0 + 54, cr = 30;
    ctx.strokeStyle = rgba('#8fa3bf', 0.3); ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
    var bits = Math.pow(2, m), pts = Math.min(bits, 16);
    for (var pi2 = 0; pi2 < pts; pi2++) {
      var a2 = TAU * pi2 / pts + Math.PI / 4;
      ctx.fillStyle = '#35d0d8';
      ctx.beginPath(); ctx.arc(cx + cr * 0.72 * Math.cos(a2), cy + cr * 0.72 * Math.sin(a2), 2.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#8fa3bf'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(names[clamp(m - 2, 0, 2)] + ' 星座', cx, cy + cr + 14);
    legend(ctx, w, h, [{ color: '#35d0d8', text: 'QPSK' }, { color: '#7c9cff', text: '8PSK' }, { color: '#ff9e4f', text: '16QAM' }]);
    return emptyMeta([
      { label: '调制', value: names[clamp(m - 2, 0, 2)], unit: '' },
      { label: '码率', value: fmt(rate, 2), unit: '' },
      { label: '香农限', value: fmt(P.shannonCapacity(1, ebCur), 2), unit: 'bps/Hz' },
      { label: '可达效率', value: fmt(capAt, 2), unit: 'bps/Hz' }
    ]);
  };

  /* --- 8) 传播时延与多址 --------------------------------------------- */
  drawers.delay = function (canvas, ctx, params, state, w, h) {
    var fr = chartFrame(ctx, w, h, { title: '单程 / 双跳时延：GEO 与 LEO 对比', xLabel: '轨道高度 (km)', yLabel: '时延 (ms)' });
    var elev = num(params.elev, 40), hops = num(params.hops, 2);
    // 当前工作点：用户拖的轨道高度（归一化后短名为 alt）
    var hCur = clamp(num(params.alt, 35786), 200, 35786);
    var heights = [600, 1200, 20200, 35786];
    var xs = [], one = [], two = [];
    for (var hh = 200; hh <= 35786; hh += 200) {
      xs.push(hh);
      var d = P.slantRange(hh, elev);
      one.push(P.propDelay(d, 1));
      two.push(P.propDelay(d, hops));
    }
    var sc = plot(ctx, fr, xs, one, { color: '#35d0d8', fill: true });
    plot(ctx, fr, xs, two, { color: '#ff9e4f', dash: [5, 4] });
    for (var k = 0; k < heights.length; k++) {
      var hp = clamp((heights[k] - 200) / (35786 - 200), 0, 1);
      var dd = P.slantRange(heights[k], elev);
      marker(ctx, lerp(fr.x0, fr.x1, hp), sc.Y(P.propDelay(dd, 1)), fmt(heights[k], 0) + ' km', '#ffd166');
    }
    // 当前工作点竖线：随 hKm 滑块移动，读数也跟着变
    var cp = clamp((hCur - 200) / (35786 - 200), 0, 1);
    var cx = lerp(fr.x0, fr.x1, cp);
    var dCur = P.slantRange(hCur, elev);
    ctx.strokeStyle = rgba('#5fe0b0', 0.85); ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, fr.y0); ctx.lineTo(cx, fr.y1); ctx.stroke();
    ctx.setLineDash([]);
    marker(ctx, cx, sc.Y(P.propDelay(dCur, hops)), fmt(hCur, 0) + ' km · ' + fmt(P.propDelay(dCur, hops), 1) + ' ms', '#5fe0b0');
    axisTicks(ctx, fr, [{ v: '200', p: 0 }, { v: '9k', p: .25 }, { v: '18k', p: .5 }, { v: '27k', p: .75 }, { v: '35.8k', p: 1 }],
              [{ v: '0', p: 0 }, { v: fmt(sc.hi / 2, 0), p: .5 }, { v: fmt(sc.hi, 0), p: 1 }]);
    // 底部 TDMA 时隙示意
    var sy = fr.y1 - 22, sx0 = fr.x0 + 10, sw = (fr.x1 - fr.x0 - 20) / 6;
    var slotColors = ['#35d0d8', '#7c9cff', '#ff9e4f', '#5fe0b0', '#ff6b9d', '#ffd166'];
    for (var s = 0; s < 6; s++) {
      ctx.fillStyle = rgba(slotColors[s], 0.28);
      ctx.fillRect(sx0 + s * sw, sy, sw - 2, 14);
      ctx.strokeStyle = rgba(slotColors[s], 0.7); ctx.strokeRect(sx0 + s * sw, sy, sw - 2, 14);
      ctx.fillStyle = '#cfe0f5'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('U' + (s + 1), sx0 + s * sw + (sw - 2) / 2, sy + 10);
    }
    legend(ctx, w, h, [{ color: '#35d0d8', text: '单程' }, { color: '#ff9e4f', text: fmt(hops, 0) + ' 跳' }, { color: '#7c9cff', text: 'TDMA 时隙' }]);
    var dGeo = P.slantRange(35786, elev);
    return emptyMeta([
      { label: '当前高度', value: fmt(hCur, 0), unit: 'km' },
      { label: '当前单程', value: fmt(P.propDelay(dCur, 1), 1), unit: 'ms' },
      { label: '当前 ' + fmt(hops, 0) + ' 跳', value: fmt(P.propDelay(dCur, hops), 1), unit: 'ms' },
      { label: 'GEO 单程', value: fmt(P.propDelay(dGeo, 1), 1), unit: 'ms' },
      { label: '仰角', value: fmt(elev, 0), unit: '°' }
    ]);
  };

  /* --- 2) 3D 轨道与星座 ----------------------------------------------- */
  drawers.scene3d = function (canvas, ctx, params, state, w, h) {
    var scene = state.scene;
    if (!scene) { return emptyMeta(); }
    var hKm = num(params.alt, 600), inc = num(params.inc, 53), elev = num(params.minelev, 10);
    // 参数驱动：用户设定的轨道成为主轨道，另两条作对照
    scene.setOrbits([
      { h: hKm, inc: inc, color: '#35d0d8', label: '设定轨 ' + fmt(hKm, 0) + ' km', count: 4 },
      { h: 20200, inc: 55, color: '#7c9cff', label: 'MEO 20200 km', count: 2 },
      { h: 35786, inc: 0, color: '#ff9e4f', label: 'GEO 35786 km', count: 3 }
    ]);
    scene.setMinElev(elev);
    scene.render(ctx, w, h, state.tSec, state.flowTSec);
    // 叠加 2D 标注层
    ctx.fillStyle = rgba('#0a0e1a', 0.72);
    ctx.fillRect(w - 210, h - 92, 198, 78);
    ctx.strokeStyle = rgba('#35d0d8', 0.35); ctx.strokeRect(w - 210, h - 92, 198, 78);
    ctx.fillStyle = '#cfe0f5'; ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('轨道高度 ' + fmt(hKm, 0) + ' km  倾角 ' + fmt(inc, 0) + '°', w - 200, h - 84);
    ctx.fillText('周期 ' + fmt(P.orbitalPeriod(hKm), 1) + ' min', w - 200, h - 66);
    ctx.fillText('速度 ' + fmt(P.orbitalVelocity(hKm), 2) + ' km/s', w - 200, h - 48);
    ctx.fillText('最小仰角 ' + fmt(elev, 0) + '°', w - 200, h - 30);
    return emptyMeta([
      { label: '轨道高度', value: fmt(hKm, 0), unit: 'km' },
      { label: '倾角', value: fmt(inc, 0), unit: '°' },
      { label: '周期', value: fmt(P.orbitalPeriod(hKm), 1), unit: 'min' },
      { label: '速度', value: fmt(P.orbitalVelocity(hKm), 2), unit: 'km/s' },
      { label: '覆盖半径', value: fmt(P.footprintRadius(hKm, elev), 0), unit: 'km' }
    ], [{ color: '#35d0d8', text: '设定轨' }, { color: '#7c9cff', text: 'MEO' }, { color: '#ff9e4f', text: 'GEO' }]);
  };

  /* --- 1) 全系统框架（3D 背景 + 可点击端到端信号链） ------------------- */
  drawers.system = function (canvas, ctx, params, state, w, h) {
    var scene = state.scene;
    if (scene) { scene.render(ctx, w, h, state.tSec, state.flowTSec); }
    else { chartFrame(ctx, w, h, { title: '全系统框架' }); }
    // 半透明遮罩，让前景框图可读
    ctx.fillStyle = 'rgba(5, 9, 18, 0.62)';
    ctx.fillRect(0, 0, w, h);

    var lessons = root.SatLessons || (typeof globalThis !== 'undefined' ? globalThis.SatLessons : null);
    var blocks = (lessons && lessons[0] && lessons[0].blocks) ? lessons[0].blocks : [];
    var band = num(params.band, 12), ma = num(params.ma, 1);
    var bandName = band < 8 ? 'C' : (band < 18 ? 'Ku' : 'Ka');
    var maName = ['FDMA', 'TDMA', 'CDMA'][clamp(Math.round(ma) - 1, 0, 2)];

    /* 标题带 */
    ctx.fillStyle = '#cfe0f5'; ctx.font = '600 14px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('一次卫星通信的端到端信号流', 16, 12);
    ctx.fillStyle = '#8fa3bf'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('当前选择：' + bandName + ' 频段 · ' + maName + ' 多址 · 点击任一环节查看作用与参数', 16, 32);

    /* ---- 动态通讯流程指示（系统全景页可见，与 3D 页共用 flow 状态） ---- */
    if (scene && scene.flow) {
      var fl = scene.flow, sIdx = scene.flowStageIndex();
      var fx = 16, fy = 50, fw = w - 32, fh = 9;
      // 进度底槽
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(fx, fy, fw, fh);
      // 已流动部分
      var prog = fl.phase * fw;
      var fg = ctx.createLinearGradient(fx, 0, fx + fw, 0);
      fg.addColorStop(0, '#35d0d8'); fg.addColorStop(0.5, '#7cff9e'); fg.addColorStop(1, '#ff9e4f');
      ctx.fillStyle = fg;
      ctx.fillRect(fx, fy, prog, fh);
      // 流动光点（信号包）
      var pkX = fx + prog;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(clamp(pkX, fx + 2, fx + fw - 2), fy + fh / 2, 4, 0, TAU); ctx.fill();
      // 当前阶段文字
      ctx.fillStyle = '#ffe6a8'; ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('▶ ' + fl.stages[sIdx].label + '：' + fl.stages[sIdx].desc, fx + fw - 6, fy + fh + 11);
      ctx.textAlign = 'left';
    }

    /* 三段落分区底色（下移，给顶部动态流程条留空间） */
    var segY = 80, segH = 26;
    var segs = [{ k: 'ground', t: '地面段（发端）', c: '#35d0d8', w: 0.30 },
                { k: 'space', t: '空间段（上行 / 卫星转发 / 下行）', c: '#ff9e4f', w: 0.40 },
                { k: 'control', t: '控制段（TT&C / 网管）', c: '#7c9cff', w: 0.30 }];
    var sx = 16, total = w - 32;
    for (var s = 0; s < segs.length; s++) {
      var sw = total * segs[s].w;
      ctx.fillStyle = rgba(segs[s].c, 0.12); ctx.fillRect(sx, segY, sw - 4, segH);
      ctx.strokeStyle = rgba(segs[s].c, 0.5); ctx.strokeRect(sx, segY, sw - 4, segH);
      ctx.fillStyle = segs[s].c; ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(segs[s].t, sx + (sw - 4) / 2, segY + segH / 2);
      sx += sw;
    }

    /* 主链环节：按 seg 分组排成网格，箭头串起来 */
    var main = blocks.filter(function (b) { return b.seg !== 'control'; });
    var ctrl = blocks.filter(function (b) { return b.seg === 'control'; });
    hitboxes.length = 0;
    var pad = 16, gapX = 8, gapY = 12;
    var cols = Math.min(6, main.length);
    var rows = Math.ceil(main.length / cols);
    var bw = (w - pad * 2 - gapX * (cols - 1)) / cols;
    var bh = clamp((h - 150 - gapY * (rows - 1)) / Math.max(rows, 1), 40, 58);
    var y0 = segY + segH + 20;
    ctx.font = '10px system-ui, sans-serif';
    for (var i = 0; i < main.length; i++) {
      var b = main[i];
      var r = Math.floor(i / cols), c = i % cols;
      var x = pad + c * (bw + gapX), y = y0 + r * (bh + gapY);
      var isSel = state.selectedBlock === b.id;
      var isHov = state.hoverBlock === b.id;
      var col = b.seg === 'space' ? '#ff9e4f' : (b.seg === 'ground' ? '#35d0d8' : '#7c9cff');
      ctx.fillStyle = isSel ? rgba(col, 0.35) : rgba(col, isHov ? 0.20 : 0.10);
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = isSel ? col : rgba(col, 0.55);
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = '#e6edf7'; ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.name.length > 9 ? b.name.slice(0, 9) : b.name, x + bw / 2, y + bh / 2 - 6);
      ctx.fillStyle = '#8fa3bf'; ctx.font = '9px monospace';
      ctx.fillText('#' + (i + 1) + ' · ' + (b.seg === 'space' ? '空间' : '地面'), x + bw / 2, y + bh / 2 + 10);
      hitboxes.push({ id: b.id, x: x, y: y, w: bw, h: bh });
      // 箭头（同行指向下一格，行末指向下行首）
      if (i < main.length - 1) {
        var nr = Math.floor((i + 1) / cols), nc = (i + 1) % cols;
        ctx.strokeStyle = rgba('#ffd166', 0.6); ctx.lineWidth = 1.3;
        ctx.beginPath();
        if (nr === r) {
          ctx.moveTo(x + bw + 1, y + bh / 2);
          ctx.lineTo(x + bw + gapX - 1, y + bh / 2);
        } else {
          ctx.moveTo(x + bw / 2, y + bh + 1);
          ctx.lineTo(x + bw / 2, y + bh + gapY - 1);
        }
        ctx.stroke();
        // 小箭头
        var ax = nr === r ? x + bw + gapX - 3 : x + bw / 2;
        var ay = nr === r ? y + bh / 2 : y + bh + gapY - 3;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        if (nr === r) { ctx.moveTo(ax + 4, ay); ctx.lineTo(ax - 2, ay - 3); ctx.lineTo(ax - 2, ay + 3); }
        else { ctx.moveTo(ax, ay + 4); ctx.lineTo(ax - 3, ay - 2); ctx.lineTo(ax + 3, ay - 2); }
        ctx.closePath(); ctx.fill();
      }
    }

    /* 控制段环节：挂在底部 */
    var cy = Math.min(y0 + rows * (bh + gapY) + 8, h - 54);
    ctx.fillStyle = '#8fa3bf'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('旁挂（不计入主链）：', pad, cy - 12);
    for (var ci2 = 0; ci2 < ctrl.length; ci2++) {
      var cb = ctrl[ci2];
      var cbx = pad + ci2 * 150, cby = cy, cbw = 140, cbh = 30;
      var isSel2 = state.selectedBlock === cb.id;
      ctx.fillStyle = isSel2 ? rgba('#7c9cff', 0.35) : rgba('#7c9cff', 0.10);
      ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.strokeStyle = rgba('#7c9cff', isSel2 ? 0.95 : 0.55); ctx.lineWidth = isSel2 ? 2 : 1;
      ctx.strokeRect(cbx, cby, cbw, cbh);
      ctx.fillStyle = '#e6edf7'; ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cb.name, cbx + cbw / 2, cby + cbh / 2);
      hitboxes.push({ id: cb.id, x: cbx, y: cby, w: cbw, h: cbh });
    }

    /* 频段 / 多址标注带 */
    ctx.fillStyle = rgba('#5fe0b0', 0.12); ctx.fillRect(pad, h - 26, w - pad * 2, 20);
    ctx.fillStyle = '#5fe0b0'; ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('频段 ' + bandName + '（上行 ' + fmt(band + 2, 1) + ' / 下行 ' + fmt(band, 1) + ' GHz 成对）  ·  ' +
                 maName + ' 多址作用于上行多站共享  ·  透明转发器只做放大变频，不改变基带', pad + 8, h - 16);

    return emptyMeta([
      { label: '环节总数', value: String(blocks.length), unit: '个' },
      { label: '主链环节', value: String(main.length), unit: '个' },
      { label: '频段', value: bandName, unit: '' },
      { label: '多址', value: maName, unit: '' }
    ], [{ color: '#35d0d8', text: '地面段' }, { color: '#ff9e4f', text: '空间段' }, { color: '#7c9cff', text: '控制段' }],
       hitboxes.slice());
  };

  /* 全局 hitboxes（system 绘制器每次重算，app.js 用 meta.hitboxes） */
  var hitboxes = [];

  /* ------------------------------------------------------------------ *
   * 4. 分发入口
   * ------------------------------------------------------------------ */

  /* 参数名归一化：content/lessons.js 用语义化长名（hKm / incDeg / ptDBW …），
     绘制器内部用短名（alt / inc / pt …）。契约第 3 节的「参数 key 映射表」是权威。
     在 draw 入口统一转换，保证滑块拖动的真实数值能进入公式，而不是全落缺省值。 */
  var PARAM_MAP = {
    system:  { band: 'band', ma: 'ma' },
    scene3d: { hKm: 'alt', incDeg: 'inc', minElevDeg: 'minelev' },
    link:    { ptDBW: 'pt', dishM: 'dish', freqGHz: 'freq', rbMbps: 'rate' },
    beam:    { dishM: 'dish', freqGHz: 'freq', eff: 'eff' },
    doppler: { hKm: 'alt', fGHz: 'carrier', elevDeg: 'elev' },
    loss:    { fGHz: 'freq', elevDeg: 'elev', rainRate: 'rain' },
    mod:     { modOrder: 'morder', codeRate: 'rate', ebn0DB: 'ebn0' },
    delay:   { hKm: 'alt', elevDeg: 'elev', hops: 'hops' }
  };
  function normalizeParams(vizName, params) {
    var map = PARAM_MAP[vizName];
    if (!map) { return params; }
    var out = {}, k;
    for (k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) { out[k] = params[k]; } }
    for (k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k) && params[k] !== undefined) { out[map[k]] = params[k]; }
    }
    return out;
  }

  function draw(canvas, ctx, vizName, params, state) {
    params = params || {}; state = state || {};
    // app.js 用 ctx 变换做 DPR 适配，这里按逻辑像素（CSS 像素）绘制
    var w = canvas._logicalW || canvas.width, h = canvas._logicalH || canvas.height;
    if (!w || !h) { return emptyMeta(); }
    var fn = drawers[vizName];
    if (!fn) {
      chartFrame(ctx, w, h, { title: '未知绘制器' });
      ctx.fillStyle = '#ff6b6b'; ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('未知绘制器：' + vizName + '（请检查 lessons.js 的 viz 字段）', w / 2, h / 2);
      return emptyMeta();
    }
    try {
      return fn(canvas, ctx, normalizeParams(vizName, params), state, w, h) || emptyMeta();
    } catch (e) {
      ctx.fillStyle = 'rgba(10,14,26,0.9)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff6b6b'; ctx.font = '12px monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('绘制器 ' + vizName + ' 出错：' + (e && e.message ? e.message : e), 12, 12);
      return emptyMeta();
    }
  }

  var api = { Scene3D: Scene3D, draw: draw, drawers: drawers, _util: { chartFrame: chartFrame, rgba: rgba, fmt: fmt } };
  root.SatViz = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }

})(typeof globalThis !== 'undefined' ? globalThis : this);

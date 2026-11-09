/* =====================================================================
 * satcom-lab · js/app.js
 * 应用控制层：唯一接触 document / 事件的地方。
 * 七类逻辑：导航生成、参数绑定、rAF 循环、3D 交互、小测判分、系统环节点击、术语速查面板。
 * 依赖（按顺序先加载）：SatPhysics / SatLessons / SatGlossary / SatViz
 * ===================================================================== */
(function (root) {
  'use strict';

  var L = root.SatLessons;
  var V = root.SatViz;
  var P = root.SatPhysics;
  var G = root.SatGlossary;

  var $ = function (id) { return document.getElementById(id); };

  var App = {
    lessons: [],
    current: 0,
    params: {},
    scene: null,
    state: { scene: null, tSec: 0, flowTSec: 0, selectedBlock: null, hoverBlock: null },
    meta: { hitboxes: [], legend: [], readouts: [] },
    score: { correct: 0, total: 0 },
    playing: true,
    flowPlaying: true,
    lastTs: 0,
    canvas: null,
    ctx: null,
    quizAnswered: {},
    needsResize: true
  };

  /* ---------------- 1. 导航生成 ---------------- */
  function buildNav() {
    var nav = $('nav');
    nav.innerHTML = '';
    App.lessons.forEach(function (les, i) {
      var a = document.createElement('button');
      a.type = 'button';
      a.className = 'nav-item' + (i === 0 ? ' active' : '');
      a.setAttribute('data-index', String(i));
      a.innerHTML = '<span class="nav-icon">' + (les.icon || '•') + '</span>' +
                    '<span class="nav-label">' + esc(les.title) + '</span>';
      a.addEventListener('click', function () { select(i); });
      nav.appendChild(a);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- 模块切换 ---------------- */
  function select(i) {
    App.current = i;
    App.quizAnswered = {};
    var les = App.lessons[i];
    // 导航高亮
    var items = document.querySelectorAll('.nav-item');
    for (var k = 0; k < items.length; k++) {
      items[k].classList.toggle('active', k === i);
    }
    $('module-title').textContent = les.title || '';
    $('module-subtitle').textContent = les.subtitle || '';
    $('module-lead').innerHTML = les.lead || '';

    // 重置参数
    App.params = {};
    (les.params || []).forEach(function (p) { App.params[p.key] = p.value; });

    // 3D 画布提示 / 工具栏
    var is3d = !!(les.use3d);
    $('viz-hint').textContent = is3d ? '拖拽旋转 · 滚轮缩放 · 点击环节看详情' : '参数驱动实时曲线';
    buildToolbar(is3d);
    App.state.scene = is3d ? App.scene : null;
    App.state.selectedBlock = null;
    App.state.hoverBlock = null;
    $('block-detail').innerHTML = '';
    $('block-detail').style.display = 'none';

    buildParams(les);
    buildFormulas(les);
    buildSections(les);
    buildQuiz(les);
    updateScoreChip();
    App.needsResize = true;
  }

  /* ---------------- 2. 参数绑定 ---------------- */
  function buildParams(les) {
    var box = $('param-panel');
    box.innerHTML = '';
    (les.params || []).forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'param-row';
      var lab = document.createElement('label');
      lab.textContent = p.label;
      var val = document.createElement('span');
      val.className = 'param-value';
      val.textContent = fmtParam(p.value, p.step) + (p.unit ? ' ' + p.unit : '');
      var input = document.createElement('input');
      input.type = 'range';
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);
      input.value = String(p.value);
      input.setAttribute('data-key', p.key);
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        App.params[p.key] = v;
        val.textContent = fmtParam(v, p.step) + (p.unit ? ' ' + p.unit : '');
        // 参数驱动 3D：最小仰角直接改场景（其余由 viz 每帧读取）
        if (App.scene && (p.key === 'minElevDeg' || p.key === 'minelev')) { App.scene.setMinElev(v); }
        App.needsResize = false;   // 不重置画布，只重绘
      });
      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(val);
      box.appendChild(row);
    });
  }

  function fmtParam(v, step) {
    var s = String(step);
    var dec = (s.indexOf('.') >= 0) ? s.split('.')[1].length : 0;
    return Number(v).toFixed(Math.min(dec, 3));
  }

  /* ---------------- 3D 工具栏（4. 3D 交互的控件） ---------------- */
  function buildToolbar(is3d) {
    var bar = $('toolbar');
    bar.innerHTML = '';
    if (!is3d) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    var defs = [
      { id: 'play', label: App.playing ? '⏸ 暂停' : '▶ 播放' },
      { id: 'front', label: '正视图' },
      { id: 'top', label: '极视图' },
      { id: 'geo', label: '赤道视图' },
      { id: 'polar', label: '极轨视图' },
      { id: 'next', label: '切换卫星' },
      { id: 'flow', label: App.flowPlaying ? '⏸ 通讯流程' : '▶ 通讯流程' }
    ];
    defs.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = d.label;
      b.setAttribute('data-act', d.id);
      if (d.id === 'play' || d.id === 'flow') { b.classList.add('active'); }
      b.addEventListener('click', function () { onToolbar(d.id, b); });
      bar.appendChild(b);
    });
    // 阶段显示（跟随流程轮转）
    var stage = document.createElement('span');
    stage.className = 'flow-stage';
    stage.id = 'flow-stage';
    stage.textContent = '阶段：—';
    bar.appendChild(stage);
  }

  function onToolbar(act, btn) {
    var s = App.scene;
    if (act === 'play') {
      App.playing = !App.playing;
      if (s) { s.setPlaying(App.playing); }
      btn.textContent = App.playing ? '⏸ 暂停' : '▶ 播放';
      btn.classList.toggle('active', App.playing);
    } else if (act === 'next') {
      if (s) { s.setSelected((s.selected + 1) % 9); }
    } else if (act === 'flow') {
      App.flowPlaying = !App.flowPlaying;
      if (s && s.setFlowPlaying) { s.setFlowPlaying(App.flowPlaying); }
      btn.textContent = App.flowPlaying ? '⏸ 通讯流程' : '▶ 通讯流程';
      btn.classList.toggle('active', App.flowPlaying);
    } else if (s) {
      s.setView(act);
      var all = document.querySelectorAll('#toolbar button');
      for (var i = 0; i < all.length; i++) {
        var a = all[i].getAttribute('data-act');
        if (a !== 'play' && a !== 'next' && a !== 'flow') {
          all[i].classList.toggle('active', all[i] === btn);
        }
      }
    }
  }

  /* ---------------- 公式卡 ---------------- */
  function buildFormulas(les) {
    var box = $('formulas');
    box.innerHTML = '';
    (les.formulas || []).forEach(function (f) {
      var card = document.createElement('div');
      card.className = 'formula-card';
      card.innerHTML = '<div class="formula-tex">' + (f.tex || '') + '</div>' +
                       '<div class="formula-note">' + esc(f.note || '') + '</div>';
      box.appendChild(card);
    });
  }

  /* ---------------- 讲解段落 ---------------- */
  function buildSections(les) {
    var box = $('sections');
    box.innerHTML = '';
    (les.sections || []).forEach(function (s) {
      var sec = document.createElement('div');
      sec.className = 'section';
      var html = '<h3>' + esc(s.h || '') + '</h3><p>' + (s.p || '') + '</p>';
      if (s.bullets && s.bullets.length) {
        html += '<ul>';
        s.bullets.forEach(function (b) { html += '<li>' + esc(b) + '</li>'; });
        html += '</ul>';
      }
      sec.innerHTML = html;
      box.appendChild(sec);
    });
  }

  /* ---------------- 5. 小测判分 ---------------- */
  function buildQuiz(les) {
    var box = $('quiz');
    box.innerHTML = '';
    (les.quiz || []).forEach(function (q, qi) {
      var wrap = document.createElement('div');
      wrap.className = 'quiz';
      var head = document.createElement('div');
      head.className = 'quiz-q';
      head.innerHTML = '<span class="badge">Q' + (qi + 1) + '</span> ' + esc(q.q);
      wrap.appendChild(head);
      var opts = document.createElement('div');
      opts.className = 'quiz-options';
      (q.options || []).forEach(function (o, oi) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'quiz-option';
        b.textContent = String.fromCharCode(65 + oi) + '. ' + o;
        b.addEventListener('click', function () {
          if (App.quizAnswered[qi] !== undefined) { return; }
          App.quizAnswered[qi] = oi;
          var correct = (oi === q.answer);
          App.score.total++;
          if (correct) { App.score.correct++; }
          var btns = opts.querySelectorAll('.quiz-option');
          for (var i = 0; i < btns.length; i++) {
            btns[i].classList.add('disabled');
            if (i === q.answer) { btns[i].classList.add('correct'); }
            if (i === oi && !correct) { btns[i].classList.add('wrong'); }
          }
          var why = document.createElement('div');
          why.className = 'quiz-why';
          why.innerHTML = '<b>' + (correct ? '✓ 答对了' : '✗ 答错了') + '</b>　正确答案：<b>' +
                          String.fromCharCode(65 + q.answer) + '</b><br>' + esc(q.why || '');
          wrap.appendChild(why);
          updateScoreChip();
        });
        opts.appendChild(b);
      });
      wrap.appendChild(opts);
      box.appendChild(wrap);
    });
  }

  function updateScoreChip() {
    $('score-chip').textContent = '得分 ' + App.score.correct + ' / ' + App.score.total;
  }

  /* ---------------- 6. 系统环节点击 ---------------- */
  function findBlock(id) {
    var les = App.lessons[0];
    if (!les || !les.blocks) { return null; }
    for (var i = 0; i < les.blocks.length; i++) {
      if (les.blocks[i].id === id) { return les.blocks[i]; }
    }
    return null;
  }

  function showBlock(id) {
    var b = findBlock(id);
    var box = $('block-detail');
    if (!b) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    var segName = { ground: '地面段', space: '空间段', control: '控制段' }[b.seg] || b.seg;
    box.innerHTML =
      '<div class="panel-title" style="padding:0 0 8px 0;border:none">' +
        '<span>' + esc(b.name) + '</span><span class="badge">' + esc(segName) + '</span>' +
      '</div>' +
      '<div class="block-row"><b>作用</b>　' + esc(b.role) + '</div>' +
      '<div class="block-row"><b>关键参数</b>　' + esc(b.params) + '</div>' +
      '<div class="block-row"><b>在链路中的位置</b>　' + esc(b.pos) + '</div>';
    App.state.selectedBlock = id;
  }

  function hitTest(mx, my) {
    var hs = App.meta.hitboxes || [];
    for (var i = 0; i < hs.length; i++) {
      var b = hs[i];
      if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { return b.id; }
    }
    return null;
  }

  /* ---------------- 3D 交互：拖拽 / 缩放 / 点击 ---------------- */
  function bindCanvas() {
    var c = App.canvas;
    var dragging = false, lastX = 0, lastY = 0, moved = 0;

    c.addEventListener('pointerdown', function (e) {
      dragging = true; moved = 0;
      lastX = e.clientX; lastY = e.clientY;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      if (dragging) {
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (App.state.scene) { App.state.scene.rotate(dx, dy); }
        lastX = e.clientX; lastY = e.clientY;
      } else {
        var id = hitTest(mx, my);
        App.state.hoverBlock = id;
        c.style.cursor = id ? 'pointer' : (App.state.scene ? 'grab' : 'default');
      }
    });
    c.addEventListener('pointerup', function (e) {
      if (dragging && moved < 6) {
        var r = c.getBoundingClientRect();
        var id = hitTest(e.clientX - r.left, e.clientY - r.top);
        if (id) { showBlock(id); }
      }
      dragging = false;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    });
    c.addEventListener('pointercancel', function () { dragging = false; });
    c.addEventListener('wheel', function (e) {
      if (App.state.scene) {
        e.preventDefault();
        App.state.scene.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
      }
    }, { passive: false });
  }

  /* ---------------- 画布尺寸自适应 ---------------- */
  function resize() {
    var wrap = $('canvas-wrap');
    var w = Math.max(360, Math.floor(wrap.clientWidth));
    var h = App.lessons[App.current] && App.lessons[App.current].use3d ? 520 : 430;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    App.canvas.width = Math.floor(w * dpr);
    App.canvas.height = Math.floor(h * dpr);
    App.canvas.style.width = w + 'px';
    App.canvas.style.height = h + 'px';
    App.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 绘制器按 CSS 像素工作：把画布逻辑尺寸记在 canvas 上
    App.canvas._logicalW = w;
    App.canvas._logicalH = h;
  }

  /* ---------------- 3. rAF 循环 ---------------- */
  function frame(ts) {
    if (!App.lastTs) { App.lastTs = ts; }
    var dt = Math.min((ts - App.lastTs) / 1000, 0.1);
    App.lastTs = ts;
    if (App.playing) { App.state.tSec += dt; }
    // 通讯流程用独立时基：轨道动画暂停时流程仍可继续（两者分别可控）
    App.state.flowTSec += dt;

    if (App.needsResize) { resize(); App.needsResize = false; }
    var les = App.lessons[App.current];
    if (les) {
      // 场景对象统一持有，3D 模块时才挂到 state
      App.state.scene = les.use3d ? App.scene : null;
      // 同步独立的通讯流程播放状态（可与轨道动画分别控制）
      if (App.scene && App.scene.flow) { App.scene.flow.playing = App.flowPlaying; }
      var c = App.canvas, ctx = App.ctx;
      var lw = c._logicalW || c.width, lh = c._logicalH || c.height;
      // 让绘制器按逻辑像素坐标系工作
      SatVizDraw(c, ctx, les.viz, lw, lh);
      renderReadouts();
      renderLegend();
      renderFlowStage();
    }
    root.requestAnimationFrame(frame);
  }

  /* 用 ctx 变换把设备像素映射回逻辑像素；viz.js 通过 _logicalW/H 拿逻辑尺寸，
     不改真实 canvas.width/height（改了会清屏并重置上下文状态）。 */
  function SatVizDraw(c, ctx, vizName, lw, lh) {
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    c._logicalW = lw; c._logicalH = lh;
    App.meta = V.draw(c, ctx, vizName, App.params, App.state) || App.meta;
  }

  function renderReadouts() {
    var box = $('readouts');
    var rs = App.meta.readouts || [];
    if (!rs.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < rs.length; i++) {
      html += '<div class="readout"><span class="readout-label">' + esc(rs[i].label) +
              '</span><span class="readout-value">' + esc(rs[i].value) +
              '</span><span class="readout-unit">' + esc(rs[i].unit || '') + '</span></div>';
    }
    box.innerHTML = html;
  }

  function renderLegend() {
    var box = $('legend');
    var ls = App.meta.legend || [];
    if (!ls.length) { box.innerHTML = ''; return; }
    var html = '';
    for (var i = 0; i < ls.length; i++) {
      html += '<span class="legend-item"><i style="background:' + esc(ls[i].color) + '"></i>' + esc(ls[i].text) + '</span>';
    }
    box.innerHTML = html;
  }

  /* 通讯流程阶段文字：每帧跟随 scene.flow 轮转显示 */
  function renderFlowStage() {
    var el = $('flow-stage');
    if (!el || !App.scene || !App.scene.flow) { return; }
    var les = App.lessons[App.current];
    if (!les || !les.use3d) { el.textContent = ''; return; }
    var fl = App.scene.flow;
    var st = fl.stages[Math.min(fl.stageCount - 1, Math.floor(fl.phase * fl.stageCount))];
    var n = Math.min(fl.stageCount, Math.floor(fl.phase * fl.stageCount) + 1);
    el.textContent = '流程 ' + n + '/' + fl.stageCount + ' · ' + st.label +
                     (App.flowPlaying ? '' : '（已暂停）');
  }

  /* ---------------- 7. 术语速查面板 ---------------- */
  var Glossary = { group: 'all', query: '' };

  function buildGlossary() {
    if (!G || !G.cards) { return; }
    var cnt = $('glossary-count');
    if (cnt) { cnt.textContent = G.cards.length + ' 条'; }
    var gt = $('glossary-title'); if (gt) { gt.textContent = G.title || '卫星通信术语速查'; }
    var gint = $('glossary-intro'); if (gint) { gint.textContent = G.intro || ''; }

    // 分组按钮
    var gbox = $('glossary-groups');
    if (gbox) {
      var all = [{ id: 'all', name: '全部' }].concat(G.groups || []);
      gbox.innerHTML = '';
      all.forEach(function (g) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'glossary-group' + (g.id === Glossary.group ? ' active' : '');
        b.textContent = g.name;
        b.setAttribute('data-group', g.id);
        b.addEventListener('click', function () {
          Glossary.group = g.id;
          var bs = gbox.querySelectorAll('.glossary-group');
          for (var i = 0; i < bs.length; i++) { bs[i].classList.toggle('active', bs[i] === b); }
          renderGlossary();
        });
        gbox.appendChild(b);
      });
    }

    var search = $('glossary-search');
    if (search) {
      search.addEventListener('input', function () {
        Glossary.query = search.value.trim().toLowerCase();
        renderGlossary();
      });
    }
    var open = $('glossary-open');
    if (open) { open.addEventListener('click', function () { toggleGlossary(true); }); }
    var close = $('glossary-close');
    if (close) { close.addEventListener('click', function () { toggleGlossary(false); }); }
    var ov = $('glossary-overlay');
    if (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) { toggleGlossary(false); } });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { toggleGlossary(false); }
    });
    renderGlossary();
  }

  function toggleGlossary(show) {
    var ov = $('glossary-overlay');
    if (!ov) { return; }
    ov.hidden = !show;
    if (show) {
      renderGlossary();
      var s = $('glossary-search'); if (s) { s.focus(); }
    }
  }

  function renderGlossary() {
    if (!G || !G.cards) { return; }
    var list = $('glossary-list'), foot = $('glossary-foot');
    if (!list) { return; }
    var q = Glossary.query;
    var cards = G.cards.filter(function (c) {
      if (Glossary.group !== 'all' && c.group !== Glossary.group) { return false; }
      if (!q) { return true; }
      var hay = [c.term, c.en, c.def, c.pitfall, c.formula, c.extra].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var html = '';
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      html += '<div class="glossary-card">' +
        '<div class="glossary-card-head"><span class="glossary-term">' + escHtml(c.term) + '</span>' +
        '<span class="glossary-en">' + escHtml(c.en) + '</span>' +
        '<span class="glossary-unit">' + escHtml(c.unit) + '</span></div>' +
        '<div class="glossary-def">' + escHtml(c.def) + '</div>' +
        (c.formula ? '<div class="glossary-formula">' + escHtml(c.formula) + '</div>' : '') +
        '<div class="glossary-pitfall"><b>易错</b> ' + escHtml(c.pitfall) + '</div>' +
        (c.extra ? '<div class="glossary-extra">' + escHtml(c.extra) + '</div>' : '') +
        '<div class="glossary-related">关联模块：' + (c.related || []).map(escHtml).join(' · ') + '</div>' +
      '</div>';
    }
    list.innerHTML = html || '<div class="glossary-empty">没有匹配的术语，换个关键词试试。</div>';
    if (foot) { foot.textContent = '显示 ' + cards.length + ' / ' + G.cards.length + ' 条术语卡 · 零外部依赖，全部本地数据'; }
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    if (!L || !V || !P) {
      document.body.innerHTML = '<div style="color:#ff6b6b;font:16px system-ui;padding:40px">' +
        '依赖加载失败：请确认 physics.js / lessons.js / viz.js / app.js 按顺序引入，且以 file:// 打开。</div>';
      return;
    }
    App.lessons = L;
    App.canvas = $('viz-canvas');
    App.ctx = App.canvas.getContext('2d');
    App.scene = new V.Scene3D();
    App.state.scene = App.scene;

    buildNav();
    buildGlossary();
    select(0);
    bindCanvas();

    // 窗口尺寸变化时重排画布
    root.addEventListener('resize', function () { App.needsResize = true; });
    root.requestAnimationFrame(frame);

    // 暴露给实开核验用的只读探针（不参与业务逻辑）
    root.SatAppProbe = {
      lessons: function () { return App.lessons; },
      current: function () { return App.current; },
      meta: function () { return App.meta; },
      scene: function () { return App.scene; },
      state: function () { return App.state; },
      select: function (i) { select(i); },
      showBlock: function (id) { showBlock(id); },
      setFlow: function (on) {
        App.flowPlaying = !!on;
        if (App.scene && App.scene.flow) { App.scene.flow.playing = App.flowPlaying; }
      },
      flowStage: function () {
        return App.scene && App.scene.flowStage ? App.scene.flowStage().label : '—';
      }
    };
  }

  root.SatApp = { init: init, select: select, _app: App };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);

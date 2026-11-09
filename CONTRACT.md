# satcom-lab 接口契约（唯一权威）

> 本文件由 Lead 在派工前定稿。所有并行路线**必须照此实现**；任何签名/字段名不一致都算集成失败。
> 修改契约须由 Lead 统一改，并通知所有路线。判据外的自由发挥只能发生在「不触碰本文件约定」的地方。

## 0. 不可协商的红线

1. **零外部依赖**：不引 CDN、不引 npm 包、不引字体、不引图片、不引 3D 库（three.js 等一律禁止）。
   所有图形必须由 Canvas 2D API 现场绘制。全项目不得出现 `http://`、`https://`、`@import`、`url(`、
   `fetch(`、`XMLHttpRequest`、`import ` 语句、`type="module"`。
2. **file:// 直接可用**：`index.html` 双击打开即完整运行。因为本地文件下 ES module 受 CORS 限制，
   **所有脚本必须是 classic script**（`<script src="..."></script>`，无 `type` 属性），按第 5 节顺序加载，
   通过全局变量通信。不使用 `defer`（避免顺序歧义），不使用内联 `on*=` 属性（用 addEventListener）。
3. **UMD 两用**：`js/physics.js` 与 `content/lessons.js` 必须同时能在浏览器（挂 `window.*`）和
   Node（CommonJS `module.exports`）下加载，且是**同一个文件**——测试算的和页面用的必须是同一套代码。
   标准包装（照抄，不要改写）：

   ```js
   (function (root, factory) {
     var api = factory();
     if (typeof module === 'object' && module.exports) { module.exports = api; }
     if (root) { root.SatPhysics = api; }   // lessons.js 里换成 root.SatLessons
   })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
     'use strict';
     // ...实现...
     return { /* 全部导出 */ };
   });
   ```

   Node 侧用 `createRequire(import.meta.url)` 加载（见 `tests/physics.test.mjs`）。
4. **无构建**：没有 package.json、没有 npm install、没有 webpack/vite、没有 TypeScript 编译。
5. **物理常数与单位**：统一在 `js/physics.js` 顶部定义并导出 `C`：

   | 量 | 值 | 单位 |
   |---|---|---|
   | `C.c` 光速 | 299792.458 | km/s |
   | `C.RE` 地球半径 | 6371 | km |
   | `C.mu` 地心引力常数 | 398600.4418 | km³/s² |
   | `C.kBol` 玻尔兹曼常数（dBW/K/Hz） | −228.6 | dBW/K/Hz |
   | `C.siderealDay` 恒星日 | 86164.0905 | s |

   单位口径：距离 km、频率 GHz（多普勒函数入参用 GHz）、速度 km/s、时间 ms 或 min、
   角度 deg、所有 dB 量 dB/dBW/dBi/dB-Hz/dB/K。角度函数在内部转 rad。

## 1. 四个全局命名空间

| 全局名 | 文件 | 职责 |
|---|---|---|
| `SatPhysics` | `js/physics.js` | 纯函数物理核算，无 DOM、无副作用 |
| `SatLessons` | `content/lessons.js` | 8 个教学模块的静态数据（含题库、系统环节） |
| `SatViz` | `js/viz.js` | 手写 3D 引擎 + 8 个场景绘制器，无 DOM 查询（只收 canvas/ctx） |
| `SatApp` | `js/app.js` | 应用控制：导航、参数、交互、判分、rAF 循环 |

`SatApp` 是唯一可以 `document.querySelector` / 绑定事件的地方。`SatViz` 只接收 `canvas`, `ctx`
和状态对象，不主动查 DOM、不注册事件、不启动定时器。

## 2. `SatPhysics` 导出清单（≥18 个纯函数，签名逐字对齐）

所有函数都是**纯函数**：同样入参必得同样返回值，不读全局可变状态、不修改入参。

```js
C                                   // 常数对象，见第 0.5 节
dbToLinear(db)                      // 10^(db/10)
linearToDb(x)                       // 10*log10(x)
wavelength(fGHz)                    // 0.3 / fGHz                         [m]
orbitalRadius(hKm)                  // C.RE + hKm                         [km]
orbitalVelocity(hKm)                // sqrt(mu / (RE+h))                  [km/s]
orbitalPeriodSec(hKm)               // 2*pi*sqrt((RE+h)^3/mu)            [s]
orbitalPeriod(hKm)                  // orbitalPeriodSec/60                [min]
fspl(fGHz, dKm)                     // 92.45 + 20log10(fGHz) + 20log10(dKm)  [dB]
antennaGain(Dm, fGHz, eff)          // 10log10(eff*(pi*Dm/wavelength)^2) [dBi]，eff 缺省 0.6
beamwidth(Dm, fGHz)                 // 70*wavelength/Dm                   [deg]
eirp(ptDBW, gtDBi, feedLossDB)      // ptDBW + gtDBi - feedLossDB         [dBW]
gOverT(gainDBi, tsysK)              // gainDBi - 10log10(tsysK)           [dB/K]
cn0(eirpDBW, fsplDB, atmLossDB, goT) // eirp - fspl - atmLoss + goT - C.kBol  [dB-Hz]
ebn0(cn0DBHz, rbBps)               // cn0 - 10log10(rbBps)               [dB]
linkMargin(ebn0DB, thresholdDB)     // ebn0 - threshold                   [dB]
shannonCapacity(bwHz, snrDB)        // bw * log2(1 + dbToLinear(snrDB))   [bps]
slantRange(hKm, elevDeg)            // sqrt((RE+h)^2 - (RE*cos(elev))^2) - RE*sin(elev)  [km]
propDelay(dKm, hops)                // dKm / C.c * 1000 * hops            [ms]，hops 缺省 1
dopplerShift(fGHz, vRkms)           // -fGHz*1e9 * vRkms / C.c / 1000    [kHz]
maxDopplerLEO(hKm, fGHz)            // 视线最大径向速度 v*RE/(RE+h)，再代入 dopplerShift 的幅度 [kHz]
footprintCentralAngle(hKm, minElevDeg) // acos(RE*cos(minElev)/(RE+h)) - minElev   [rad]
footprintRadius(hKm, minElevDeg)    // RE * footprintCentralAngle          [km]
rainAttenuation(fGHz, rainRate, pathKm) // 简化 ITU 幂律 a=k(f)*R^alpha(f)*path  [dB]
dbSum(aDB, bDB)                     // 10log10(10^(a/10)+10^(b/10))       [功率域相加]
```

**`rainAttenuation` 的固定口径**（不要自行发挥，测试按此算）：
`k(f) = 0.0001 * fGHz^2.2`，`alpha(f) = 1.05`，`A = k * rainRate^alpha * pathKm * 0.5`。
其中 `pathKm` 为雨区等效路径长度。取 `fGHz=20, rainRate=10 mm/h, pathKm=5` 作基准。

**`maxDopplerLEO` 的几何口径**（关键，别用 v 直接代）：
地面站在仰角 0° 看到卫星时视线径向速度最大，推导得 `vR_max = orbitalVelocity(hKm) * RE/(RE+h)`，
返回 `abs(dopplerShift(fGHz, vR_max))`。取 `hKm=600, fGHz=2` 作基准（应 ≈46 kHz）。

## 3. `SatLessons` 数据结构（8 个模块，顺序固定）

`SatLessons` 是**数组**，长度必须 = 8，顺序即导航顺序。每个模块对象字段：

```js
{
  id: 'system',              // 唯一短 id，与 viz 名可不同
  title: '全系统框架',        // 导航显示名（中文）
  icon: '◎',                 // 单个 Unicode 字符，不用 emoji 图片/外部资源
  subtitle: '一句话副标题',
  viz: 'system',             // 绘制器名，必须是第 4 节列出的 8 个之一
  lead: '开场的 1~2 句话，讲这一模块在学什么、为什么要学',
  sections: [                // 原理讲解，≥2 段
    { h: '小标题', p: '正文段落（可含 HTML 的 <b>/<code>，不要外部链接）', bullets: ['要点1','要点2'] }
  ],
  formulas: [                // 公式卡片，≥1 条（用纯文本 + <sup>/<sub>，不用 MathJax）
    { tex: 'C/N₀ = EIRP − FSPL − L + G/T + 228.6', note: '一句话解释每个量的单位与来历' }
  ],
  params: [                  // 可调参数，≥2 个，key 唯一
    { key: 'freq', label: '下行频率', min: 1, max: 40, step: 0.5, value: 12.5, unit: 'GHz' }
  ],
  quiz: [                    // 小测，≥2 题
    { q: '题干', options: ['A','B','C','D'], answer: 0, why: '判分后显示的解析（讲清为什么）' }
  ],
  // 仅 system 模块需要：
  blocks: [                  // 端到端信号链环节，≥15 个，顺序即信号流方向
    {
      id: 'up', name: '上行链路', seg: 'space',   // seg ∈ ground|space|control
      role: '这一环节做什么（1~2 句）',
      params: '关键参数（频率/增益/损耗等）',
      pos: '它在端到端链路中的位置（第几环节、连接谁和谁）'
    }
  ],
  // 仅 system / scene3d 模块可为 true：
  use3d: true
}
```

**参数 key 映射表（权威，2026-11-05 集成时补齐）**

`content/lessons.js` 用语义化长名，绘制器内部用短名；`js/viz.js` 的 `normalizeParams()`
在 `draw()` 入口按下表转换，保证滑块数值进入公式。两路都不得单方面改名：

| viz | lessons 的 key | 绘制器内部短名 |
|---|---|---|
| system | `band`, `ma`, `bwMHz` | `band`, `ma`（`bwMHz` 备用） |
| scene3d | `hKm`, `incDeg`, `minElevDeg` | `alt`, `inc`, `minelev` |
| link | `ptDBW`, `dishM`, `freqGHz`, `rbMbps` | `pt`, `dish`, `freq`, `rate` |
| beam | `dishM`, `freqGHz`, `eff` | `dish`, `freq`, `eff` |
| doppler | `hKm`, `fGHz`, `elevDeg` | `alt`, `carrier`, `elev` |
| loss | `fGHz`, `elevDeg`, `rainRate` | `freq`, `elev`, `rain` |
| mod | `modOrder`, `codeRate`, `ebn0DB` | `morder`, `rate`, `ebn0` |
| delay | `hKm`, `elevDeg`, `hops` | `alt`, `elev`, `hops` |

> 集成记录：契约初版第 3 节只给了示例 key（`freq`/`dish`…）未定死，路线 B 采用语义化长名、
> 绘制器采用短名，导致首轮集成时参数对不上（滑块数值全落绘制器缺省值，曲线不随参数变）。
> 修法是在 `viz.js` 入口加归一化层，绘制器与 lessons.js 均不返工。此表即修后权威。

**`viz` 名与模块的固定对应**（8 个，一一对应，不许自创）：

| # | id | title | viz | use3d |
|---|---|---|---|---|
| 1 | `system` | 全系统框架 | `system` | true |
| 2 | `scene3d` | 3D 轨道与星座 | `scene3d` | true |
| 3 | `link` | 星地链路预算 | `link` | — |
| 4 | `beam` | 天线波束与方向图 | `beam` | — |
| 5 | `doppler` | 多普勒频移 | `doppler` | — |
| 6 | `loss` | 传播损耗与雨衰 | `loss` | — |
| 7 | `mod` | 调制与编码 | `mod` | — |
| 8 | `delay` | 传播时延与多址 | `delay` | — |

**`system.blocks` 必须覆盖的端到端信号链**（≥15 个，按信号流顺序，方向从信源到信宿）：
信源 → 信源编码 → 信道编码(FEC) → 调制 → 上变频 → 高功放(HPA) → 发射天线 →
上行链路 → 卫星接收天线 → 转发器(低噪放+变频+功放) → 下行链路 → 地面接收天线 →
低噪放(LNB) → 下变频 → 解调 → 信道译码 → 信源译码 → 信宿。
另须含 `seg: 'control'` 的 TT&C 测控、网管中心两个环节（挂在旁边，不计入主链顺序）。
`seg: 'ground'` = 地面段，`space` = 空间段（含上行/下行传播与星上转发），`control` = 控制段。

每个 `blocks[i]` 的 `role`/`params`/`pos` 三字段**都必须非空**——全景图点击后 app.js 直接显示这三段。

## 4. `SatViz` 导出契约

```js
SatViz = {
  Scene3D: 构造函数/工厂,   // new SatViz.Scene3D() → 见下
  draw: function (canvas, ctx, vizName, params, state) → meta,
  drawers: { system: fn, scene3d: fn, link: fn, beam: fn, doppler: fn, loss: fn, mod: fn, delay: fn }
};
```

### `SatViz.Scene3D` 实例方法（3D 引擎，手写）

| 方法 | 说明 |
|---|---|
| `rotate(dxPx, dyPx)` | 鼠标拖拽增量 → 改 yaw/pitch（pitch 夹在 ±85°） |
| `zoomBy(factor)` | 滚轮缩放，`factor>1` 拉近；相机距离夹在合理区间 |
| `setView(name)` | `'front' \| 'top' \| 'geo' \| 'polar'` 四个预设视角 |
| `setPlaying(bool)` | 播放/暂停轨道动画 |
| `setOrbits(orbitDefs)` | 设置要画的轨道：`[{h, inc, color, label, count}]` |
| `project(p3)` | 3D 点 → `{x, y, z, scale, visible}`，透视投影（供测试实开核验用） |
| `render(ctx, w, h, tSec)` | 画一帧：星空、地球（经纬网＋简化大陆＋Lambert 明暗）、轨道环、运动卫星、覆盖锥、星地波束、图例 |

引擎必须自己实现：欧拉旋转矩阵、透视除法、按深度 `z` 排序的画家算法、Lambert 光照
（法向点乘光向）、经纬网采样、背面剔除。**不得**只是贴一张静态图或画个圆了事。

### `SatViz.draw(canvas, ctx, vizName, params, state)`

- `params`：当前模块参数对象，形如 `{freq: 12.5, ...}`（key 来自 lesson.params）。
- `state`：`{ scene: Scene3D实例|null, tSec: 秒, selectedBlock: id|null, hoverBlock: id|null }`。
- 返回 `meta`：
  ```js
  { hitboxes: [ {id, x, y, w, h} ],  // 可点击区域（系统全景的环节框）；无则 []
    legend: [ {color, text} ],        // 图例文字
    readouts: [ {label, value, unit} ] // 实时读数，app.js 可显示在画布旁
  }
  ```
- `draw` 内部按 `vizName` 分发到 `drawers[vizName]`，未知名字要画一个明确的「未知绘制器」提示而不是静默空白。
- 3D 类绘制器（`system`/`scene3d`）必须先调 `state.scene.render(...)` 再叠加 2D 标注层。
- 2D 类绘制器（`link`/`beam`/`doppler`/`loss`/`mod`/`delay`）用 Canvas 2D 画参数驱动的实时图表：
  坐标轴、曲线、网格、当前工作点标记、数值标注。参数变化必须改变曲线形状，不能是静态图。

## 5. `index.html` 的脚本加载顺序（逐字照抄）

```html
<script src="js/physics.js"></script>
<script src="content/lessons.js"></script>
<script src="js/viz.js"></script>
<script src="js/app.js"></script>
```

顺序不可换：physics 先（纯函数）→ lessons（数据）→ viz（绘制）→ app（启动，最后调用 `SatApp.init()`）。
全部为相对路径，无 `type`、无 `async`、无 `defer`、无 `crossorigin`、无 integrity。

## 6. `SatApp` 必须实现的六类逻辑（供清点）

1. **导航生成**：从 `SatLessons` 生成左侧 8 个导航项，点击切换。
2. **参数绑定**：按 `lesson.params` 生成滑块，变动即写回 `params` 并触发下一帧重绘。
3. **rAF 循环**：`requestAnimationFrame` 持续调 `SatViz.draw`，把 `tSec` 传进去驱动动画。
4. **3D 交互**：canvas 上 `pointerdown/move/up` → `scene.rotate`；`wheel` → `scene.zoomBy`；
   播放/暂停按钮 → `setPlaying`；视角预设按钮 → `setView`。
5. **小测判分**：点选项即时标出对/错并显示 `why` 解析，统计得分。
6. **系统环节点击**：用 `meta.hitboxes` 做命中测试，点中后显示该 block 的 `role/params/pos`。

## 7. CSS 类名契约（css/style.css 必须全部提供）

```
body.app, .sidebar, .brand, .nav, .nav-item, .nav-item.active,
.main, .module-head, .module-title, .module-subtitle, .module-lead,
.panel, .panel-title, .canvas-wrap, .viz-canvas, .viz-overlay,
.toolbar, .toolbar button, .toolbar button.active,
.param-panel, .param-row, .param-row label, .param-row input[type=range], .param-value,
.readouts, .readout, .formula-card, .formula-tex, .formula-note,
.section, .section h3, .section p, .section ul, .section li,
.quiz, .quiz-q, .quiz-options, .quiz-option, .quiz-option.correct, .quiz-option.wrong,
.quiz-why, .quiz-score,
.block-detail, .legend, .legend-item, .badge, .hint, .footer
```

暗色科技风（深蓝底 + 青/橙强调色），左侧固定导航 + 右侧滚动主区，
窄屏（<900px）自动改为上下布局。零外部字体（用系统字体栈）、零背景图片。

## 8. 并行产物路径（严格不相交，禁止越界写）

| 路线 | 允许写的路径（仅这些） |
|---|---|
| A · 物理 | `satcom-lab/js/physics.js`、`satcom-lab/tests/physics.test.mjs` |
| B · 内容 | `satcom-lab/content/lessons.js` |
| C · 样式 | `satcom-lab/css/style.css` |
| Lead | `satcom-lab/CONTRACT.md`、`DESIGN.md`、`README.md`、`index.html`、<br>`js/viz.js`、`js/app.js`、`reports/**` |

任何路线都**不得**创建 `package.json`、不得改动 `clear/`、不得改动工作区其他项目、
不得写其他路线的文件。

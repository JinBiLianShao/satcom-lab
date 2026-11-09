# 教学闭环、系统全景与零外部依赖 · 结构清点记录

- 检验日期：2026-11-09
- 命令：`node tests/structure-check.mjs`（Node v26.13.0，无 npm 依赖、无构建）
- 退出码：**0** · 汇总：**ALL PASS**
- 脚本为可重跑清点，逐条打印 `[PASS]`/`[FAIL]`，任一失败退出码 1。
- **本报告由该脚本在同一次实跑末尾自动生成**：文件大小取自 `statSync`，
  模块/环节/命中数取自本次实跑内存变量，与落盘文件逐位一致。

## 一、文件清点（判据①：8 源文件 + 1 测试文件）

| # | 文件 | 大小 | 结论 |
|---|---|---|---|
| 1 | `DESIGN.md` | 12111 B | PASS |
| 2 | `README.md` | 8769 B | PASS |
| 3 | `index.html` | 4062 B | PASS |
| 4 | `js/physics.js` | 5688 B | PASS |
| 5 | `js/viz.js` | 67435 B | PASS |
| 6 | `js/app.js` | 22300 B | PASS |
| 7 | `content/lessons.js` | 92865 B | PASS |
| 8 | `css/style.css` | 30200 B | PASS |
| 9 | `tests/physics.test.mjs` | 8279 B | PASS |

另附 `tests/structure-check.mjs`（本清点脚本自身）与 `CONTRACT.md`（接口契约）。
**9 个判据文件全部存在且非空。**

## 二、8×5 要素矩阵（判据②：≥7 模块，每模块 5 要素）

| 模块 id | 讲解 sections | 公式 formulas | 参数 params(≥2) | 画布 viz | 小测 quiz(≥2) | 结论 |
|---|---|---|---|---|---|---|
| system | 4 | 2 | 3 | ✓ system | 3 | PASS |
| scene3d | 4 | 2 | 3 | ✓ scene3d | 3 | PASS |
| link | 4 | 2 | 4 | ✓ link | 3 | PASS |
| beam | 4 | 2 | 3 | ✓ beam | 3 | PASS |
| doppler | 4 | 2 | 3 | ✓ doppler | 3 | PASS |
| loss | 4 | 2 | 3 | ✓ loss | 3 | PASS |
| mod | 4 | 2 | 3 | ✓ mod | 3 | PASS |
| delay | 4 | 2 | 3 | ✓ delay | 3 | PASS |

- 模块数 **8 ≥ 7**，每个模块的 5 要素逐格打勾。
- 24 道题逐题核对：`options` 长度 4、`answer ∈ 0..3`、`why` 非空解析 —— 全 PASS。
- 8 个 `viz` 名去重后恰为契约 8 个：`system, scene3d, link, beam, doppler, loss, mod, delay`。
- 小测判分与解析由 `js/app.js` 的 `buildQuiz()` 实现，画布由 `frame()` rAF 循环调
  `SatViz.draw()` 实时重绘，参数滑块经 `buildParams()` 绑定并由 `normalizeParams()`
  映射进绘制器 —— 均为真实代码路径，非静态声明。

## 三、系统全景环节清单（判据②系统全景）

- 端到端信号链环节数 **20 ≥ 15**，每环节 `id/name/role/params/pos` 六字段齐全，
  `role/params/pos` 三字符串均非空（缺失 0 个）。
- 三段落齐备：`ground=14 / space=4 / control=2`。
- 控制段含 **TT&C 测控站、网管中心**。
- 主链顺序（从信源到信宿，脚本实跑输出）：

| # | 环节 | 段落 | # | 环节 | 段落 |
|---|---|---|---|---|---|
| 1 | 信源 | 地面 | 10 | 转发器(低噪放+变频+功放) | 空间 |
| 2 | 信源编码 | 地面 | 11 | 下行链路 | 空间 |
| 3 | 信道编码(FEC) | 地面 | 12 | 地面接收天线 | 地面 |
| 4 | 调制 | 地面 | 13 | 低噪放(LNB) | 地面 |
| 5 | 上变频 | 地面 | 14 | 下变频 | 地面 |
| 6 | 高功放(HPA) | 地面 | 15 | 解调 | 地面 |
| 7 | 发射天线 | 地面 | 16 | 信道译码 | 地面 |
| 8 | 上行链路 | 空间 | 17 | 信源译码 | 地面 |
| 9 | 卫星接收天线 | 空间 | 18 | 信宿 | 地面 |

旁挂控制段：TT&C 测控站、网管中心。
`js/viz.js` 的 `system` 绘制器按 `lessons[0].blocks` 生成可点击 `hitboxes`，
`js/app.js` 的 `showBlock()` 按同一 id 回查并显示 `role/params/pos`。

## 四、零外部依赖 grep（判据⑤）

| 检查项 | 结果 |
|---|---|
| 代码/HTML/CSS 中 `http(s)://`、`@import`、`url(`、`type="module"`、`fetch(`、`XMLHttpRequest`、内联 `import` | **0 命中** |
| `index.html` script 加载顺序 | `js/physics.js → content/lessons.js → content/glossary.js → js/viz.js → js/app.js` ✓ |
| `index.html` 无 `type="module"` | ✓ |
| 所有 script src 为相对路径 | ✓ |

**口径说明**：代码/HTML/CSS 查全部禁用串，文档 `.md` 只查真正的外部资源引用
（`http(s)://`、`@import`、`url(`），文档正文里「本项目不用 `type="module"`」这类
说明性字面量不计（否则是清点口径的假阳性）。本次实跑命中数 0。

## 五、可重跑性

```bash
cd satcom-lab
node tests/structure-check.mjs   # 全 PASS，并生成本报告
node tests/browser-check.mjs     # 真实 Chromium file:// 实开
node tests/report-consistency.mjs # 报告 ↔ json ↔ 落盘文件 逐位一致
node tests/physics.test.mjs      # 34 条公式基准断言
```

无需 npm install、无需构建、无需联网。本记录里的每个数字都由脚本在同一次实跑中写入，可重跑得到。

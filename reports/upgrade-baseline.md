# 升级前基线记录

- 生成命令：`node tests/upgrade-baseline.mjs`（真实 Chromium 以 `file://` 打开，切到 3D 模块后量化）
- 采集时间：2026-11-09T05:48:37.086Z（**升级前**，n1 阶段实跑留痕）
- 本文件与 `reports/upgrade-baseline.json` 由同一次实跑生成，数字逐位一致。
- 说明：2026-11-09 为缩小审阅快照把截图统一重采样为 900×620，**本文件保留升级前的历史读数不变**；
  `upgrade-baseline.mjs` 已加保护，检测到 `hasAtmosphere=false` 时不再用升级后代码覆盖此基线。

## 画面像素量化

| 指标 | 实读 |
|---|---|
| 采样点 | 31812 |
| 暗部占比 (L<25) | 55% |
| 中间调 (25≤L<90) | 42.3% |
| 亮部占比 (L≥90) | 2.7% |
| 16 级量化色桶数 | 67 |
| 亮度中位数 | 24 |
| 亮度 P90 | 53.3 |

**判读**：画面 55% 是纯暗背景、亮部仅 2.7%，
色彩只有 67 个色桶，中位亮度 24 —— 偏暗、偏单色的线框示意图。

## 3D 场景特性清点（升级前）

| 特性 | 状态 |
|---|---|
| `hasStars` | true |
| `starCount` | 110 |
| `hasLand` | true |
| `landPolys` | 8 |
| `hasSun` | true |
| `hasLambert` | true |
| `orbitCount` | 3 |
| `hasAtmosphere` | false |
| `hasClouds` | false |
| `hasNightLights` | false |
| `hasTerrain` | false |
| `hasGalaxy` | false |
| `hasFlow` | false |

基线具备：星点(110)、大陆多边形(8)、太阳光向/Lambert 明暗、3 条轨道。
**缺失**：大气辉光、云层、夜面灯光、程序化地形色、银河/星空分层、球面高光，
以及最关键的 **动态通讯流程**（hasFlow=false）。

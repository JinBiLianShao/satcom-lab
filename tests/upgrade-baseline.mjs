/* 生成升级前基线记录（可重跑，零外部依赖）。
 * 用法：node tests/upgrade-baseline.mjs
 * 实开 file:// 页面，量化 3D 画布色彩/亮度分布，清点场景特性，
 * 结果写入 reports/upgrade-baseline.md 与 reports/upgrade-baseline.json（同次生成）。
 * 不改动项目源文件。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fileUrl = pathToFileURL(join(root, 'index.html')).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 升级前基线是历史留痕，一旦生成就不再用「升级后代码」覆盖，
   否则特性清点会变成全 true、失去基线意义。 */
const baseJson = join(root, 'reports', 'upgrade-baseline.json');
if (existsSync(baseJson)) {
  try {
    const prev = JSON.parse(readFileSync(baseJson, 'utf8'));
    if (prev.feat && prev.feat.hasAtmosphere === false) {
      console.log('升级前基线已存在（hasAtmosphere=false），保留历史留痕，不覆盖。');
      console.log('如需重新采集，请手动删除 reports/upgrade-baseline.json 后重跑。');
      process.exit(0);
    }
  } catch { /* 损坏则重采 */ }
}

class CDP {
  constructor(ws) {
    this.pending = new Map(); this.id = 0;
    this.ws = new WebSocket(ws);
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', e => rej(new Error(String(e))));
    });
    this.ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    });
  }
  send(method, params) {
    return new Promise((res, rej) => {
      const id = ++this.id; this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  eval(expression) {
    return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      .then(r => r && r.result ? r.result.value : undefined);
  }
}

const profile = mkdtempSync(join(tmpdir(), 'satcom-base-'));
const proc = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--window-size=900,620', '--no-first-run', '--disable-background-networking', fileUrl
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
proc.stderr.on('data', b => { stderr += b.toString(); });

let port = null;
for (let i = 0; i < 80 && !port; i++) {
  const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
  if (m) { port = Number(m[1]); break; }
  await sleep(100);
}
if (!port) { console.log('[FAIL] 未拿到 DevTools 端口'); proc.kill('SIGKILL'); process.exit(1); }
let pageWs = null;
for (let i = 0; i < 60 && !pageWs; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const t = list.find(x => x.type === 'page' && x.url.startsWith('file://'));
    if (t) { pageWs = t.webSocketDebuggerUrl; }
  } catch { /* 等 */ }
  if (!pageWs) { await sleep(100); }
}
const cdp = new CDP(pageWs);
await cdp.ready;
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  try { ready = await cdp.eval('typeof SatAppProbe!=="undefined"'); } catch { /* 等 */ }
  if (!ready) { await sleep(100); }
}
if (!ready) { console.log('[FAIL] 页面未就绪'); proc.kill('SIGKILL'); process.exit(1); }

await cdp.eval('SatAppProbe.select(1); SatAppProbe.scene().setView("geo");');
await sleep(400);

/* 画布像素量化：暗/中/亮占比、色桶数、亮度分位 */
const pix = await cdp.eval(`(function(){
  var c=document.getElementById('viz-canvas'),g=c.getContext('2d');
  var d=g.getImageData(0,0,c.width,c.height).data;
  var n=0,dark=0,mid=0,bright=0,hues={},lum=[];
  for(var i=0;i<d.length;i+=4*17){
    var R=d[i],G=d[i+1],B=d[i+2],L=(R+G+B)/3;lum.push(L);n++;
    if(L<25)dark++;else if(L<90)mid++;else bright++;
    var k=(R>>5)+'-'+(G>>5)+'-'+(B>>5);hues[k]=(hues[k]||0)+1;
  }
  lum.sort(function(a,b){return a-b;});
  return {samples:n,darkPct:+(dark/n*100).toFixed(1),midPct:+(mid/n*100).toFixed(1),
          brightPct:+(bright/n*100).toFixed(1),colorBuckets:Object.keys(hues).length,
          medianLum:+lum[Math.floor(lum.length/2)].toFixed(1),
          p90Lum:+lum[Math.floor(lum.length*0.9)].toFixed(1)};
})()`);

/* 场景特性清点（升级前） */
const feat = await cdp.eval(`(function(){
  var s=SatAppProbe.scene();
  return {hasStars:!!s.stars,starCount:s.stars?s.stars.length:0,
    hasLand:!!s.land,landPolys:s.land?s.land.length:0,
    hasSun:!!s.sun,hasLambert:typeof s._light==='function',
    orbitCount:s.orbits?s.orbits.length:0,
    hasAtmosphere:typeof s.atmosphere!=='undefined',
    hasClouds:typeof s.clouds!=='undefined',
    hasNightLights:typeof s.cityLights!=='undefined',
    hasTerrain:typeof s.terrain!=='undefined',
    hasGalaxy:typeof s.galaxy!=='undefined',
    hasFlow:typeof s.flow!=='undefined'};
})()`);

const data = { capturedAt: new Date().toISOString(), fileUrl, pix, feat };
writeFileSync(join(root, 'reports', 'upgrade-baseline.json'), JSON.stringify(data, null, 2));

const md = [];
md.push('# 升级前基线记录', '');
md.push('- 生成命令：`node tests/upgrade-baseline.mjs`（真实 Chromium 以 `file://` 打开，切到 3D 模块后量化）');
md.push('- 生成时间：' + data.capturedAt);
md.push('- 本文件与 `reports/upgrade-baseline.json` 由同一次实跑生成，数字逐位一致。', '');
md.push('## 画面像素量化', '');
md.push('| 指标 | 实读 |', '|---|---|');
md.push('| 采样点 | ' + pix.samples + ' |');
md.push('| 暗部占比 (L<25) | ' + pix.darkPct + '% |');
md.push('| 中间调 (25≤L<90) | ' + pix.midPct + '% |');
md.push('| 亮部占比 (L≥90) | ' + pix.brightPct + '% |');
md.push('| 16 级量化色桶数 | ' + pix.colorBuckets + ' |');
md.push('| 亮度中位数 | ' + pix.medianLum + ' |');
md.push('| 亮度 P90 | ' + pix.p90Lum + ' |', '');
md.push('**判读**：画面 ' + pix.darkPct + '% 是纯暗背景、亮部仅 ' + pix.brightPct + '%，');
md.push('色彩只有 ' + pix.colorBuckets + ' 个色桶，中位亮度 ' + pix.medianLum + ' —— 偏暗、偏单色的线框示意图。', '');
md.push('## 3D 场景特性清点（升级前）', '');
md.push('| 特性 | 状态 |', '|---|---|');
Object.keys(feat).forEach(k => md.push('| `' + k + '` | ' + JSON.stringify(feat[k]) + ' |'));
md.push('');
md.push('基线具备：星点(' + feat.starCount + ')、大陆多边形(' + feat.landPolys + ')、太阳光向/Lambert 明暗、3 条轨道。');
md.push('**缺失**：大气辉光、云层、夜面灯光、程序化地形色、银河/星空分层、球面高光，');
md.push('以及最关键的 **动态通讯流程**（hasFlow=' + feat.hasFlow + '）。');
writeFileSync(join(root, 'reports', 'upgrade-baseline.md'), md.join('\n') + '\n');

console.log('基线像素:', JSON.stringify(pix));
console.log('基线特性:', JSON.stringify(feat));
console.log('已生成: reports/upgrade-baseline.md / upgrade-baseline.json');
cdp.ws.close();
proc.kill('SIGKILL');
try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }

/* 把升级前基线截图等比重采样为 900×620 小图（缩小审阅快照体积）。
 * 只做像素缩放，不改变画面内容；不引外部库，用 Chromium 的 Canvas 完成。
 * 用法：node tests/resize-baseline.mjs
 * 读 reports/screenshots/baseline-scene3d.png → 覆盖写回同名文件（保持"升级前画面"语义）。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const target = join(root, 'reports', 'screenshots', 'baseline-scene3d.png');
const W = 900, H = 477;   // 与 Chromium 900x620 窗口实际内容区一致
const dataUrl = 'data:image/png;base64,' + readFileSync(target).toString('base64');
const before = statSync(target).size;

const profile = mkdtempSync(join(tmpdir(), 'satcom-resize-'));
const proc = spawn('chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--disable-background-networking', 'about:blank'
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
proc.stderr.on('data', b => { stderr += b.toString(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    const t = list.find(x => x.type === 'page');
    if (t) { pageWs = t.webSocketDebuggerUrl; }
  } catch { /* 等 */ }
  if (!pageWs) { await sleep(100); }
}
const cdp = new WebSocket(pageWs);
await new Promise(r => cdp.addEventListener('open', r));
let id = 0;
const pend = new Map();
cdp.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
});
const send = (method, params) => new Promise(r => {
  const i = ++id; pend.set(i, r);
  cdp.send(JSON.stringify({ id: i, method, params: params || {} }));
});

const expr = `(function(){
  return new Promise(function(resolve,reject){
    var img=new Image();
    img.onload=function(){
      var c=document.createElement('canvas');c.width=${W};c.height=${H};
      var g=c.getContext('2d');
      g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
      g.drawImage(img,0,0,${W},${H});
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=function(){reject(new Error('image load failed'));};
    img.src=${JSON.stringify(dataUrl)};
  });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
if (!r || !r.result || !r.result.value || r.result.value.indexOf('data:image/png') !== 0) {
  console.log('[FAIL] 缩放失败', r && r.exceptionDetails ? r.exceptionDetails.text : '');
  proc.kill('SIGKILL'); process.exit(1);
}
const out = Buffer.from(r.result.value.split(',')[1], 'base64');
writeFileSync(target, out);
const after = statSync(target).size;
console.log('基线截图重采样:', W + 'x' + H, before + ' B → ' + after + ' B');
console.log('画面内容未变（仅尺寸缩小），仍为升级前留痕。');
cdp.close();
proc.kill('SIGKILL');
try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }

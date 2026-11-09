/* 以 file:// 打开当前页面并截「升级前」基线画面（供视觉对比）。
 * 用法：node tests/look-baseline.mjs [输出文件名]
 * 仅用 Node 内置能力；不改动项目任何源文件。 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fileUrl = pathToFileURL(join(root, 'index.html')).href;
const outName = process.argv[2] || 'baseline-scene3d.png';
const outPath = join(root, 'reports', 'screenshots', outName);
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.pending = new Map(); this.id = 0; this.events = [];
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
      } else if (m.method) { this.events.push(m); }
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

const profile = mkdtempSync(join(tmpdir(), 'satcom-look-'));
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

// 切到 3D 模块，设定一个好视角，等动画稳定
await cdp.eval('SatAppProbe.select(1); SatAppProbe.scene().setView("geo");');
await sleep(400);
const r = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
writeFileSync(outPath, Buffer.from(r.data, 'base64'));
console.log('基线截图:', outPath, Buffer.from(r.data, 'base64').length, 'B');
// 记录当前 3D 场景的可清点特性（升级前）
const info = await cdp.eval(`(function(){
  var s=SatAppProbe.scene();
  return {
    hasStars: !!s.stars, starCount: s.stars?s.stars.length:0,
    hasLand: !!s.land, landPolys: s.land?s.land.length:0,
    hasSun: !!s.sun, hasLight: typeof s._light==='function',
    orbitCount: s.orbits?s.orbits.length:0,
    hasFlow: typeof s.flowPhase!=='undefined',
    keys: Object.keys(s).filter(function(k){return typeof s[k]!=='function';}).sort()
  };
})()`);
console.log('场景特性(升级前):', JSON.stringify(info));
cdp.ws.close();
proc.kill('SIGKILL');
try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }

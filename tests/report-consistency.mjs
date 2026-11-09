/* 报告 ↔ 原始读数 ↔ 落盘文件 逐位一致性核验（可重跑，零外部依赖）。
 *
 * 用法：node tests/report-consistency.mjs
 * 用途：独立评估者曾指出「观测与记录对不上」——手写报告数字与脚本重跑后覆盖的
 * json / 截图不符。修法是让 browser-check.mjs 在同一次实跑里生成 json、截图、报告。
 * 本脚本独立复核三者逐位一致，作为「逐位一致」这一声明本身的可重跑物证。
 *
 * 检查：
 *  ① 报告 §③ 的 8 行与 browser-check-data.json 的 modules[] 逐位一致
 *  ② 报告 §⑥b 的 8 行 hash 与 json 的 params[] 逐位一致
 *  ③ 报告 §⑧ 的字节数与磁盘截图、json.shots[].size、json.pngStats[].bytes 一致
 *  ④ 报告 §⑧ 的像素统计与独立重跑 statPng() 的产出一致
 * 退出码 0 = 全部一致。
 */
import { readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statPng } from './png-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const d = JSON.parse(readFileSync(join(root, 'reports', 'browser-check-data.json'), 'utf8'));
const md = readFileSync(join(root, 'reports', 'browser-check.md'), 'utf8');

let bad = 0;
const chk = (c, m) => { console.log((c ? '[OK] ' : '[FAIL] ') + m); if (!c) { bad++; } };

console.log('=== 报告 ↔ json ↔ 落盘文件 逐位一致性核验 ===\n');

console.log('--- ⓪ 报告 §① 三类错误计数 vs json.errBreakdown ---');
const eb = d.errBreakdown;
if (eb) {
  chk(md.includes('| `Runtime.exceptionThrown` 未捕获异常 | ' + eb.uncaught + ' |'),
      `§① 未捕获异常 ${eb.uncaught} 由 json.errBreakdown 实算`);
  chk(md.includes('| `console.error` | ' + eb.consoleError + ' |'),
      `§① console.error ${eb.consoleError} 由 json.errBreakdown 实算`);
  chk(md.includes('| `Log.entryAdded` level=error | ' + eb.logError + ' |'),
      `§① Log.error ${eb.logError} 由 json.errBreakdown 实算`);
} else {
  chk(false, 'json 缺 errBreakdown（三类错误计数未落盘）');
}

console.log('\n--- ① 报告 §③ 模块像素表 vs json.modules[] ---');
d.modules.forEach(m => {
  const row = '| ' + m.i + ' | ' + m.id + ' | ' + m.title + ' | ' + m.w + '×' + m.h +
              ' | ' + m.nonBg + ' | ' + m.colors + ' | ' + m.readouts + ' | PASS |';
  chk(md.includes(row), `modules[${m.i}] ${m.id} ${m.nonBg}/${m.colors}`);
});

console.log('\n--- ② 报告 §⑥b 参数 hash 表 vs json.params[] ---');
d.params.forEach(p => {
  const row = '| ' + p.i + ' | ' + p.id + ' | `' + p.key + '` | ' + p.hashBefore +
              ' → ' + p.hashAfter + ' | ' + (p.readoutChanged ? '是' : '否') + ' | PASS |';
  chk(md.includes(row), `params[${p.i}] ${p.id} ${p.hashBefore}→${p.hashAfter}`);
});

console.log('\n--- ③ 报告 §⑧ 截图字节数 vs 磁盘 / json ---');
d.shots.forEach((s, i) => {
  const real = statSync(s.p).size;
  chk(real === s.size, `shots[${i}] json ${s.size} == 磁盘 ${real}`);
  chk(md.includes(real + ' B'), `报告含磁盘字节 ${real} B`);
  chk(d.pngStats[i] && !d.pngStats[i].err && d.pngStats[i].bytes === real,
      `pngStats[${i}].bytes == 磁盘 ${real}`);
});

console.log('\n--- ④ 报告 §⑧ 像素统计 vs 独立重跑 statPng() ---');
d.shots.forEach((s, i) => {
  const cur = statPng(s.p);   // 对同一落盘文件重新统计，非读 json
  chk(!cur.err, `statPng(shots[${i}]) 无错误`);
  if (cur.err) { return; }
  chk(cur.bytes === d.pngStats[i].bytes && cur.colors === d.pngStats[i].colors && cur.nonBg === d.pngStats[i].nonBg,
      `独立重跑 ${cur.colors}色/${cur.nonBg} == json ${d.pngStats[i].colors}色/${d.pngStats[i].nonBg}`);
  const row = cur.colors + ' 色、非背景 ' + cur.nonBg + ' 采样点';
  chk(md.includes(row), `报告含像素统计 ${row}`);
});

console.log('\n=== 汇总：' + (bad === 0 ? 'ALL CONSISTENT（0 处不符）' : `FAIL ${bad} 处不符`) + ' ===');
process.exit(bad === 0 ? 0 : 1);

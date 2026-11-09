/* 截图像素统计（可重跑，零外部依赖；同时导出 statPng 供 browser-check.mjs 复用）。
 *
 * 用法：node tests/png-check.mjs
 * 用 Node 内置 zlib 解压 PNG 的 IDAT，统计颜色数与非背景像素数，
 * 证明截图确有实际绘制内容、不是空白图。不引 pngjs/sharp 等外部库。
 * 退出码 0 = 两张截图均为有效 PNG 且内容非空。
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
export const SHOTS = ['overview.png', 'scene3d.png'];

/* 只处理 8-bit RGB / RGBA（colorType 2 / 6），并还原 PNG 的 5 种行滤波器。
 * 返回 {w,h,bitDepth,colorType,bytes,samples,nonBg,colors} 或 {err}。
 * bytes 直接取磁盘文件大小，保证与落盘文件一致。 */
export function statPng(file) {
  const b = readFileSync(file);
  if (b.toString('hex', 0, 8) !== '89504e470d0a1a0a') { return { err: 'PNG 签名不符' }; }
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const bit = b[24], ct = b[25];
  if (bit !== 8 || (ct !== 2 && ct !== 6)) { return { err: `不支持的 PNG 格式 bit=${bit} colorType=${ct}` }; }
  const ch = ct === 6 ? 4 : 3;

  let off = 8; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') { idat.push(b.slice(off + 8, off + 8 + len)); }
    off += 12 + len;
    if (type === 'IEND') { break; }
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const recon = Buffer.alloc(h * stride);

  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[p++];
      const a = x >= ch ? recon[rowStart + x - ch] : 0;
      const bb = y > 0 ? recon[(y - 1) * stride + x] : 0;
      const c = (x >= ch && y > 0) ? recon[(y - 1) * stride + x - ch] : 0;
      let v;
      switch (ft) {
        case 0: v = rawByte; break;
        case 1: v = rawByte + a; break;
        case 2: v = rawByte + bb; break;
        case 3: v = rawByte + ((a + bb) >> 1); break;
        case 4: {
          const pa = Math.abs(bb - c), pb = Math.abs(a - c), pc = Math.abs(a + bb - 2 * c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
          v = rawByte + pr; break;
        }
        default: v = rawByte; break;
      }
      recon[rowStart + x] = v & 255;
    }
  }

  let nonBg = 0; const colors = new Set(); let n = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = y * stride + x * ch;
      const r = recon[i], g = recon[i + 1], bl = recon[i + 2];
      if (r + g + bl > 110) { nonBg++; }
      colors.add((r >> 4) + ',' + (g >> 4) + ',' + (bl >> 4));
      n++;
    }
  }
  return {
    w, h, bitDepth: bit, colorType: ct,
    bytes: statSync(file).size, samples: n, nonBg, colors: colors.size
  };
}

/* 作为独立脚本运行时，打印统计并给出退出码。 */
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let fails = 0;
  const ok = (cond, msg) => {
    console.log((cond ? '[PASS] ' : '[FAIL] ') + msg);
    if (!cond) { fails++; }
  };
  console.log('=== satcom-lab 截图像素统计（证明非空白） ===\n');
  for (const name of SHOTS) {
    const file = join(root, 'reports', 'screenshots', name);
    if (!existsSync(file)) { ok(false, `${name} 不存在`); continue; }
    let s;
    try { s = statPng(file); } catch (e) { s = { err: String(e) }; }
    if (s.err) { ok(false, `${name}: ${s.err}`); continue; }
    console.log(`  ${name}: ${s.w}×${s.h} RGB bit=${s.bitDepth} colorType=${s.colorType} ${s.bytes} B`);
    console.log(`            采样 ${s.samples} 点 · 非背景 ${s.nonBg} · 颜色数 ${s.colors}`);
    ok(s.nonBg > 5000 && s.colors > 50,
      `${name} 有实际绘制内容（非背景 ${s.nonBg} > 5000、颜色数 ${s.colors} > 50）`);
  }
  console.log('\n=== 汇总：' + (fails === 0 ? 'ALL PASS' : `FAIL ${fails}`) + ' ===');
  process.exit(fails === 0 ? 0 : 1);
}

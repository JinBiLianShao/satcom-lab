// tests/physics.test.mjs —— 路线 A · 物理核算基准测试（Node 26）
// 运行：node /home/lsx/work/satcom-lab/tests/physics.test.mjs
// 加载方式与页面共用同一份 UMD 文件：浏览器挂 window.SatPhysics，Node 走 module.exports。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../js/physics.js');

// ---------------------------------------------------------------------------
// 期望值：全部由「教材标准式」独立闭式预算后硬编码（公式写在每条注释里，便于第三方复核）。
// 任何一条都不读取 P.* 的返回值来生成期望值；P.* 只用于产生「实算」列。
// 判据：dB 类 |实算-期望| ≤ 0.1 dB；其他 |实算-期望|/|期望| ≤ 0.5%。
// ---------------------------------------------------------------------------

const checks = [
  // 1 波长：λ[m] = 0.3/fGHz = 0.3/12.5
  { name: 'wavelength(12.5)', expected: 0.024, kind: 'rel',
    run: () => P.wavelength(12.5) },

  // 2 轨道半径：r = RE + h = 6371 + 600
  { name: 'orbitalRadius(600)', expected: 6971, kind: 'rel',
    run: () => P.orbitalRadius(600) },

  // 3 圆轨道速度：v = sqrt(398600.4418/6971) = 7.561733136872838 km/s（教材 ≈7.56 km/s）
  { name: 'orbitalVelocity(600)', expected: 7.561733136872838, kind: 'rel',
    run: () => P.orbitalVelocity(600) },

  // 4 周期：T = 2π*sqrt(42157^3/398600.4418) = 86142.11433343086 s（≈ 恒星日 86164.0905 s）
  { name: 'orbitalPeriodSec(35786)', expected: 86142.11433343086, kind: 'rel',
    run: () => P.orbitalPeriodSec(35786) },

  // 5 周期分钟：T/60 = 1435.701905557181 min（教材 23h56m 恒星日 ≈1436 min；
  //   用契约 RE=6371 而非 WGS84 的 6378.137，故与 1436.068 差 0.37 min ≈0.026%）
  { name: 'orbitalPeriod(35786)', expected: 1435.701905557181, kind: 'rel',
    run: () => P.orbitalPeriod(35786) },

  // 6 FSPL：92.45 + 20log10(12.5) + 20log10(38000)，等价 92.45 + 20log10(12.5*38000)
  { name: 'fspl(12.5,38000)', expected: 205.98387219249733, kind: 'db',
    run: () => P.fspl(12.5, 38000) },

  // 7 天线增益：10log10(0.6*(π*1.2/0.024)^2)
  { name: 'antennaGain(1.2,12.5,0.6)', expected: 41.70391004443949, kind: 'db',
    run: () => P.antennaGain(1.2, 12.5, 0.6) },

  // 8 波束宽度：70*0.024/1.2 = 1.4 deg
  { name: 'beamwidth(1.2,12.5)', expected: 1.4, kind: 'rel',
    run: () => P.beamwidth(1.2, 12.5) },

  // 9 EIRP：20 + 40 - 2
  { name: 'eirp(20,40,2)', expected: 58, kind: 'db',
    run: () => P.eirp(20, 40, 2) },

  // 10 G/T：40 - 10log10(150)
  { name: 'gOverT(40,150)', expected: 18.239087409443187, kind: 'db',
    run: () => P.gOverT(40, 150) },

  // 11 串联 C/N0：58 - 205.98387219249733 - 0.5 + 18.239087409443187 + 228.6（-C.kBol）
  { name: 'cn0(58,fspl,0.5,g/T)', expected: 98.35521521694585, kind: 'db',
    run: () => P.cn0(58, 205.98387219249733, 0.5, 18.239087409443187) },

  // 12 串联 Eb/N0：98.35521521694585 - 10log10(2e6)
  { name: 'ebn0(cn0,2e6)', expected: 35.34491526030604, kind: 'db',
    run: () => P.ebn0(98.35521521694585, 2e6) },

  // 13 链路余量：8.5 - 5
  { name: 'linkMargin(8.5,5)', expected: 3.5, kind: 'db',
    run: () => P.linkMargin(8.5, 5) },

  // 14 香农容量：1e6*log2(1 + 10^(10/10)) = 1e6*log2(11)
  { name: 'shannonCapacity(1e6,10)', expected: 3459431.6186372973, kind: 'rel',
    run: () => P.shannonCapacity(1e6, 10) },

  // 15 天顶斜距：ε=90° 时 d = r - RE = h = 35786 km
  { name: 'slantRange(35786,90)', expected: 35786, kind: 'rel',
    run: () => P.slantRange(35786, 90) },

  // 16 时延：35786/299792.458*1000（教材 ≈119.4 ms）
  { name: 'propDelay(35786,1)', expected: 119.36924710761069, kind: 'rel',
    run: () => P.propDelay(35786, 1) },

  // 17 多普勒：-2e9*7.5/299792.458/1000
  { name: 'dopplerShift(2,7.5)', expected: -50.03461427972281, kind: 'rel',
    run: () => P.dopplerShift(2, 7.5) },

  // 18 LEO 最大多普勒：vR_max = 7.561733136872838*6371/6971 = 6.910888224790826 km/s，
  //    |Δf| = 2e9*6.910888224790826/299792.458/1000 = 46.1044835543583 kHz（落在 40~50）
  { name: 'maxDopplerLEO(600,2)', expected: 46.1044835543583, kind: 'rel',
    run: () => P.maxDopplerLEO(600, 2) },

  // 19 覆盖中心角：acos(6371*cos(10°)/42157) - 10°(rad)
  { name: 'footprintCentralAngle(35786,10)', expected: 1.2468787983271283, kind: 'rel',
    run: () => P.footprintCentralAngle(35786, 10) },

  // 20 覆盖半径：6371*ψ = 7943.864824142134 km（>0，GEO 10° 最小仰角量级合理）
  { name: 'footprintRadius(35786,10)', expected: 7943.864824142134, kind: 'rel',
    run: () => P.footprintRadius(35786, 10) },

  // 21 雨衰：k=0.0001*20^2.2=0.07282256812104326，A=k*10^1.05*5*0.5
  { name: 'rainAttenuation(20,10,5)', expected: 2.0427066330368104, kind: 'db',
    run: () => P.rainAttenuation(20, 10, 5) },

  // 22 功率相加：10log10(10^0.3 + 10^0.3) = 10log10(2*10^0.3) = 3 + 10log10(2) = 6.010299956639811 dB
  //    注：6.0206... = 20log10(2) 是幅度域口径，或把 3 dB 当成精确 2 倍后的 10log10(4)；
  //    契约公式为功率域 10^(a/10)，10^0.3≈1.99526，故精确值 6.0103。二者差 0.0103 dB，
  //    都在 0.1 dB 阈值内；此处按括号里给的教材式硬编码精确值，不改 physics.js 的正确公式。
  { name: 'dbSum(3,3)', expected: 6.010299956639811, kind: 'db',
    run: () => P.dbSum(3, 3) },

  // 23 dB→线性：10^0.3
  { name: 'dbToLinear(3)', expected: 1.9952623149688795, kind: 'rel',
    run: () => P.dbToLinear(3) },

  // 24 线性→dB：10log10(2)
  { name: 'linearToDb(2)', expected: 3.010299956639812, kind: 'db',
    run: () => P.linearToDb(2) },

  // ---- 结构 / 缺省 / 常数核验（期望值同样为硬编码的契约定值） ----
  // 25 导出纯函数个数（第 2 节清单共 24 个）
  { name: '导出函数数', expected: 24, kind: 'rel',
    run: () => Object.keys(P).filter((k) => typeof P[k] === 'function').length },

  // 26 C 常数对象字段数
  { name: 'C 常数字段数', expected: 5, kind: 'rel',
    run: () => Object.keys(P.C).length },

  // 27~31 第 0.5 节常量
  { name: 'C.c', expected: 299792.458, kind: 'rel', run: () => P.C.c },
  { name: 'C.RE', expected: 6371, kind: 'rel', run: () => P.C.RE },
  { name: 'C.mu', expected: 398600.4418, kind: 'rel', run: () => P.C.mu },
  { name: 'C.kBol', expected: -228.6, kind: 'db', run: () => P.C.kBol },
  { name: 'C.siderealDay', expected: 86164.0905, kind: 'rel', run: () => P.C.siderealDay },

  // 32 缺省 eff=0.6 应与显式 0.6 一致
  { name: 'antennaGain(1.2,12.5) 缺省 eff', expected: 41.70391004443949, kind: 'db',
    run: () => P.antennaGain(1.2, 12.5) },

  // 33 缺省 hops=1 应与显式 1 一致
  { name: 'propDelay(35786) 缺省 hops', expected: 119.36924710761069, kind: 'rel',
    run: () => P.propDelay(35786) },

  // 34 UMD：Node 导出对象与 globalThis.SatPhysics 是同一个对象
  { name: 'UMD 同一对象', expected: 1, kind: 'rel',
    run: () => (P === globalThis.SatPhysics ? 1 : 0) }
];

const fmt = (x) => Number(x.toPrecision(12)).toString();

console.log('=== 路线 A · physics.js 基准断言（期望值均为教材式独立硬编码）===');

let pass = 0;
let fail = 0;

for (const c of checks) {
  let actual;
  let dev;
  let ok;
  try {
    actual = c.run();
    const absDev = Math.abs(actual - c.expected);
    dev = c.kind === 'db' ? absDev : absDev / Math.abs(c.expected) * 100;
    const limit = c.kind === 'db' ? 0.1 : 0.5;
    ok = Number.isFinite(actual) && Number.isFinite(dev) && dev <= limit;
  } catch (err) {
    ok = false;
    console.log(`[FAIL] ${c.name} | 期望=${fmt(c.expected)} | 实算=抛异常 ${err.message} | 偏差=n/a`);
    fail++;
    continue;
  }
  const devStr = c.kind === 'db' ? `${dev.toFixed(6)} dB` : `${dev.toFixed(6)}%`;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${c.name} | 期望=${fmt(c.expected)} | 实算=${fmt(actual)} | 偏差=${devStr}`);
  if (ok) { pass++; } else { fail++; }
}

console.log(`汇总：PASS ${pass} / ${checks.length}，FAIL ${fail} | 阈值 dB 类 ≤0.1 dB、其他 ≤0.5%`);

if (fail > 0) {
  console.log('FAIL');
  process.exit(1);
}
console.log('ALL PASS');
process.exit(0);

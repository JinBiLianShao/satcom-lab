(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SatPhysics = api; }   // lessons.js 里换成 root.SatLessons
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 物理常数（CONTRACT.md 第 0.5 节）：距离 km、频率 GHz、速度 km/s、时间 s；
  // 所有 dB 量统一 dB/dBW/dBi/dB-Hz/dB/K，角度函数在内部把 deg 转 rad。
  var C = {
    c: 299792.458,          // 光速 [km/s]
    RE: 6371,               // 地球半径 [km]
    mu: 398600.4418,        // 地心引力常数 [km^3/s^2]
    kBol: -228.6,           // 玻尔兹曼常数 [dBW/K/Hz]，C/N0 中取 -C.kBol = +228.6
    siderealDay: 86164.0905 // 恒星日 [s]
  };

  // dB → 线性功率比：x = 10^(db/10)
  function dbToLinear(db) {
    return Math.pow(10, db / 10);
  }

  // 线性功率比 → dB：db = 10*log10(x)
  function linearToDb(x) {
    return 10 * Math.log10(x);
  }

  // 波长 λ = c/f；f 单位 GHz 时 λ[m] = 0.3/fGHz
  function wavelength(fGHz) {
    return 0.3 / fGHz;
  }

  // 圆轨道半径 r = RE + h [km]
  function orbitalRadius(hKm) {
    return C.RE + hKm;
  }

  // 圆轨道速度 v = sqrt(mu/r) [km/s]
  function orbitalVelocity(hKm) {
    return Math.sqrt(C.mu / orbitalRadius(hKm));
  }

  // 开普勒第三定律：T = 2π*sqrt(r^3/mu) [s]
  function orbitalPeriodSec(hKm) {
    return 2 * Math.PI * Math.sqrt(Math.pow(orbitalRadius(hKm), 3) / C.mu);
  }

  // 轨道周期 [min] = T[s] / 60
  function orbitalPeriod(hKm) {
    return orbitalPeriodSec(hKm) / 60;
  }

  // 自由空间路径损耗 [dB]：92.45 + 20log10(fGHz) + 20log10(dKm)
  function fspl(fGHz, dKm) {
    return 92.45 + 20 * Math.log10(fGHz) + 20 * Math.log10(dKm);
  }

  // 抛物面天线增益 [dBi]：G = 10log10(eff*(πD/λ)^2)，口径效率 eff 缺省 0.6
  function antennaGain(Dm, fGHz, eff) {
    if (eff === undefined) { eff = 0.6; }
    return 10 * Math.log10(eff * Math.pow(Math.PI * Dm / wavelength(fGHz), 2));
  }

  // 半功率波束宽度 [deg]：θ ≈ 70*λ/D
  function beamwidth(Dm, fGHz) {
    return 70 * wavelength(fGHz) / Dm;
  }

  // 等效全向辐射功率 [dBW]：EIRP = Pt[dBW] + Gt[dBi] - 馈线损耗[dB]
  function eirp(ptDBW, gtDBi, feedLossDB) {
    return ptDBW + gtDBi - feedLossDB;
  }

  // 接收品质因数 [dB/K]：G/T = G[dBi] - 10log10(Tsys[K])
  function gOverT(gainDBi, tsysK) {
    return gainDBi - 10 * Math.log10(tsysK);
  }

  // 载噪比密度 [dB-Hz]：C/N0 = EIRP - FSPL - Latm + G/T - C.kBol（-C.kBol 即 +228.6）
  function cn0(eirpDBW, fsplDB, atmLossDB, goT) {
    return eirpDBW - fsplDB - atmLossDB + goT - C.kBol;
  }

  // 每比特信噪比 [dB]：Eb/N0 = C/N0[dB-Hz] - 10log10(Rb[bps])
  function ebn0(cn0DBHz, rbBps) {
    return cn0DBHz - 10 * Math.log10(rbBps);
  }

  // 链路余量 [dB]：M = Eb/N0 - 解调门限
  function linkMargin(ebn0DB, thresholdDB) {
    return ebn0DB - thresholdDB;
  }

  // 香农容量 [bps]：C = B[Hz]*log2(1 + SNR线性)，SNR 由 dB 转线性
  function shannonCapacity(bwHz, snrDB) {
    return bwHz * Math.log2(1 + dbToLinear(snrDB));
  }

  // 星地斜距 [km]：d = sqrt(r^2 - (RE*cosε)^2) - RE*sinε；仰角 ε 由 deg 转 rad
  function slantRange(hKm, elevDeg) {
    var r = orbitalRadius(hKm);
    var e = elevDeg * Math.PI / 180;
    return Math.sqrt(r * r - Math.pow(C.RE * Math.cos(e), 2)) - C.RE * Math.sin(e);
  }

  // 传播时延 [ms]：τ = d[km]/c[km/s]*1000，转发跳数 hops 缺省 1
  function propDelay(dKm, hops) {
    if (hops === undefined) { hops = 1; }
    return dKm / C.c * 1000 * hops;
  }

  // 多普勒频移 [kHz]：Δf = -f[Hz]*vR/c，fGHz→Hz 乘 1e9，Hz→kHz 除 1000
  function dopplerShift(fGHz, vRkms) {
    return -fGHz * 1e9 * vRkms / C.c / 1000;
  }

  // LEO 最大多普勒 [kHz]：仰角 0° 时 vR_max = v*RE/(RE+h)，取频移幅度
  function maxDopplerLEO(hKm, fGHz) {
    var vRmax = orbitalVelocity(hKm) * C.RE / orbitalRadius(hKm);
    return Math.abs(dopplerShift(fGHz, vRmax));
  }

  // 覆盖区中心角 [rad]：ψ = acos(RE*cos(εmin)/(RE+h)) - εmin；εmin 由 deg 转 rad
  function footprintCentralAngle(hKm, minElevDeg) {
    var e = minElevDeg * Math.PI / 180;
    return Math.acos(C.RE * Math.cos(e) / orbitalRadius(hKm)) - e;
  }

  // 覆盖区地面半径 [km]：R = RE * ψ[rad]
  function footprintRadius(hKm, minElevDeg) {
    return C.RE * footprintCentralAngle(hKm, minElevDeg);
  }

  // 简化 ITU 雨衰 [dB]：k(f)=0.0001*fGHz^2.2，alpha=1.05，A=k*R^alpha*pathKm*0.5
  function rainAttenuation(fGHz, rainRate, pathKm) {
    var k = 0.0001 * Math.pow(fGHz, 2.2);
    return k * Math.pow(rainRate, 1.05) * pathKm * 0.5;
  }

  // 两路功率相加 [dB]：10log10(10^(a/10) + 10^(b/10))，不是幅度相加
  function dbSum(aDB, bDB) {
    return 10 * Math.log10(Math.pow(10, aDB / 10) + Math.pow(10, bDB / 10));
  }

  return {
    C: C,
    dbToLinear: dbToLinear,
    linearToDb: linearToDb,
    wavelength: wavelength,
    orbitalRadius: orbitalRadius,
    orbitalVelocity: orbitalVelocity,
    orbitalPeriodSec: orbitalPeriodSec,
    orbitalPeriod: orbitalPeriod,
    fspl: fspl,
    antennaGain: antennaGain,
    beamwidth: beamwidth,
    eirp: eirp,
    gOverT: gOverT,
    cn0: cn0,
    ebn0: ebn0,
    linkMargin: linkMargin,
    shannonCapacity: shannonCapacity,
    slantRange: slantRange,
    propDelay: propDelay,
    dopplerShift: dopplerShift,
    maxDopplerLEO: maxDopplerLEO,
    footprintCentralAngle: footprintCentralAngle,
    footprintRadius: footprintRadius,
    rainAttenuation: rainAttenuation,
    dbSum: dbSum
  };
});

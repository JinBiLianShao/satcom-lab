/* =====================================================================
 * satcom-lab · content/glossary.js
 * 卫星通信术语卡：纯静态数据，UMD 两用（浏览器 window.SatGlossary /
 * Node module.exports 同一对象），零外部依赖。
 *
 * 公式与单位口径统一来自 js/physics.js 与 CONTRACT.md 第 0、2 节；
 * related 只引用 8 个教学模块 id。本文件不查 DOM、不注册事件、不引任何库。
 * ===================================================================== */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  if (root) { root.SatGlossary = api; }   // 浏览器全局名：SatGlossary
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var api = {
    title: '卫星通信术语卡',
    intro: '把链路预算、传播、轨道、载荷、调制、天线与测控里最容易混淆的量和概念，一张卡讲清「是什么、怎么算、哪儿容易错」。公式口径与 js/physics.js 一致，单位统一用 dB 系。',

    groups: [
      { id: 'link',    name: '链路与预算' },
      { id: 'prop',    name: '传播与损耗' },
      { id: 'orbit',   name: '轨道与星座' },
      { id: 'payload', name: '星上载荷与转发' },
      { id: 'mod',     name: '调制编码与多址' },
      { id: 'ant',     name: '天线与波束' },
      { id: 'ops',     name: '测控与运维' }
    ],

    cards: [
      /* ---------------- link · 链路与预算 ---------------- */
      {
        id: 'eirp',
        term: 'EIRP 等效全向辐射功率',
        en: 'Equivalent Isotropically Radiated Power',
        group: 'link',
        def: '发射机送进天线的功率经天线增益聚焦后、沿主瓣方向等效的「全向点源功率」，等于发射功率加天线增益减馈线损耗。',
        unit: 'dBW',
        formula: 'EIRP = Pt + Gt − L_feed',
        pitfall: 'Pt 用 dBW、Gt 用 dBi、损耗用 dB，三者都是对数域，直接相加减即可；最易错的是把发射功率当 dBm 代进去却按 dBW 记账，整条链路会平白差 30 dB。',
        related: ['link', 'system'],
        extra: '直觉：EIRP 就像手电筒的「亮度标称」——灯泡功率一样，聚光罩越好射得越远；它描述的是发射端，不含路径损耗。'
      },
      {
        id: 'gt',
        term: 'G/T 接收品质因数',
        en: 'Gain-to-Noise-Temperature Ratio',
        group: 'link',
        def: '接收天线增益与系统等效噪声温度之比，衡量接收站「收得进信号、又少带进噪声」的能力。',
        unit: 'dB/K',
        formula: 'G/T = G_rx(dBi) − 10log₁₀(T_sys)',
        pitfall: 'T_sys 必须用开尔文取对数，不是摄氏度，也不是 dBm；有人把 G/T 写成 G − T 直接相减，漏掉 10log₁₀，量纲就错了。',
        related: ['link', 'beam', 'system'],
        extra: '工程上常说「把 G/T 做上去」：要么加大天线口径，要么降低 LNB 噪声温度，两条路都贵。'
      },
      {
        id: 'cn0',
        term: 'C/N₀ 载波噪声密度比',
        en: 'Carrier-to-Noise Density Ratio',
        group: 'link',
        def: '接收载波功率与噪声功率谱密度之比，是链路预算里承上启下的核心量，单位用 dB-Hz。',
        unit: 'dB-Hz',
        formula: 'C/N₀ = EIRP − FSPL − L_atm + G/T + 228.6',
        pitfall: '末尾的 +228.6 是 −k（玻尔兹曼常数 −228.6 dBW/K/Hz）取负，很多资料写 −228.6 让人以为要减；另外 C/N₀ 与带宽无关，别把它和 C/N 混。',
        related: ['link', 'loss', 'system'],
        extra: 'C/N₀ 是「每赫兹」的信噪比；把它除以比特率才得到每比特能量，见 Eb/N0。'
      },
      {
        id: 'ebn0',
        term: 'Eb/N0 每比特信噪比',
        en: 'Energy per Bit to Noise Density Ratio',
        group: 'link',
        def: '每个信息比特的能量与噪声功率谱密度之比，是判断能否解调、比较不同编码调制方案的统一标尺。',
        unit: 'dB',
        formula: 'Eb/N0 = C/N₀ − 10log₁₀(Rb)',
        pitfall: 'Rb 必须用比特每秒（bps）取对数，不是 Mbps 的数值直接代，也不是符号率 Rs；把 Mbps 当 Rb 会少算 60 dB。',
        related: ['link', 'mod', 'system'],
        extra: '同一条链路提高码速率，Eb/N0 会按 10log₁₀ 下降——速率翻倍约掉 3 dB，这是「带宽换功率」的代价。'
      },
      {
        id: 'link_margin',
        term: '链路余量',
        en: 'Link Margin',
        group: 'link',
        def: '实际 Eb/N0 超出解调门限的分贝数，是留给雨衰、指向误差、设备老化与模型误差的缓冲。',
        unit: 'dB',
        formula: 'Margin = Eb/N0 − Threshold',
        pitfall: '门限 Threshold 不是固定常数，它随调制阶数与编码率变（16QAM 比 QPSK 高好几 dB）；拿一个门限套所有模式会误判「链路够用」。',
        related: ['link', 'loss', 'mod'],
        extra: '工程习惯留 3~6 dB 余量；余量为负意味着晴天勉强、一下雨就断。'
      },
      {
        id: 'noise_temp',
        term: '等效噪声温度 T_sys',
        en: 'Equivalent System Noise Temperature',
        group: 'link',
        def: '把天线噪声、馈线损耗、LNB 内部噪声等全部折算到接收机输入端的等效热力学温度。',
        unit: 'K',
        formula: 'T_sys = T_ant + T_feed + T_LNB/(G_feed) …（级联折算）',
        pitfall: '噪声温度能直接相加的前提是都折算到同一参考点；把 LNB 的噪声系数 F 当温度用、或忘了馈线损耗会同时衰减信号并抬高等效温度，都会低估噪声。',
        related: ['link', 'beam', 'system'],
        extra: '冷天空 + 低噪放能做到几十 K；天线对着热地面时会升到几百 K，仰角越低越吃亏。'
      },
      {
        id: 'feed_loss',
        term: '馈线损耗 L_feed',
        en: 'Feeder / Waveguide Loss',
        group: 'link',
        def: '发射机到天线、或天线到 LNB 之间波导/电缆/接头带来的插入损耗，同时削弱信号并按其物理温度贡献噪声。',
        unit: 'dB',
        formula: 'EIRP = Pt + Gt − L_feed ; C/N₀ 中经 G/T 与 T_sys 间接体现',
        pitfall: '发射侧馈线损耗只减 EIRP，接收侧馈线损耗却「双杀」——既减 G 又因损耗电阻自己发热抬高 T_sys；只扣一次 G 是常见漏算。',
        related: ['link', 'system'],
        extra: '所以高功率发射机常把 HPA 尽量靠近天线馈源，用短波导把这段损耗压到最小。'
      },
      {
        id: 'noise_bw',
        term: '等效噪声带宽',
        en: 'Equivalent Noise Bandwidth',
        group: 'link',
        def: '把实际滤波器非矩形响应折算成一个「等高矩形」的带宽，用来把噪声谱密度 N₀ 换成总噪声功率 N。',
        unit: 'Hz',
        formula: 'N = N₀ · B_eq ; C/N = C/N₀ − 10log₁₀(B_eq)',
        pitfall: '把符号率、占用带宽或 3 dB 带宽直接当 B_eq 会差一个形状因子；升余弦滚降滤波器的等效噪声带宽与标称带宽并不相等。',
        related: ['link', 'mod'],
        extra: '它解释了为什么 C/N₀ 与带宽无关、C/N 却随带宽变——差的就是这个 10log₁₀(B)。'
      },

      /* ---------------- prop · 传播与损耗 ---------------- */
      {
        id: 'fspl',
        term: 'FSPL 自由空间路径损耗',
        en: 'Free-Space Path Loss',
        group: 'prop',
        def: '电磁波在自由空间扩散造成的几何损耗，随频率与距离的对数线性增长，是星地链路里最大的一项。',
        unit: 'dB',
        formula: 'FSPL = 92.45 + 20log₁₀(f_GHz) + 20log₁₀(d_km)',
        pitfall: '92.45 这个常数只对「f 用 GHz、d 用 km」成立；换成 MHz/m 要换常数（32.45）。也有人误以为它是大气吸收，其实纯几何扩散，真空里照样存在。',
        related: ['loss', 'link', 'system'],
        extra: 'GEO 的 Ku 频段 FSPL 约 206 dB，Ka 约 210 dB——发射几十瓦到接收端只剩皮瓦量级。'
      },
      {
        id: 'rain',
        term: '雨衰',
        en: 'Rain Attenuation',
        group: 'prop',
        def: '降雨对 Ku/Ka 频段信号的吸收与散射造成的附加损耗，随频率、降雨率与雨区路径长度增长。',
        unit: 'dB',
        formula: 'A = k(f) · R^α · L · 0.5 ; k(f)=0.0001·f^2.2, α=1.05（教学简化 ITU 幂律）',
        pitfall: '雨衰不是把 FSPL 改大，而是在 FSPL 之外再叠加一项；且频率越高越重——C 频段几乎可忽略，Ka 频段一场暴雨可掉十几 dB，所以高频段必须留余量或做自适应编码。',
        related: ['loss', 'link', 'mod'],
        extra: '直觉：雨滴尺寸和 Ka 波长（约 1 cm）接近，进入 Mie 散射区，散射明显；C 波段波长远大于雨滴，几乎不理它。'
      },
      {
        id: 'slant_range',
        term: '斜距与传播时延',
        en: 'Slant Range and Propagation Delay',
        group: 'prop',
        def: '地面站到卫星的视线距离；除以光速即单程传播时延，低仰角时斜距显著大于轨道高度。',
        unit: 'km / ms',
        formula: 'd = √((R_E+h)² − (R_E·cos E)²) − R_E·sin E ; τ = d/c × 1000 × hops',
        pitfall: '天顶时斜距才等于轨道高度 h；仰角降到 10° 斜距会拉长很多，时延和 FSPL 都跟着涨。把「35786 km」直接当代所有情况的 d 是典型错误。',
        related: ['delay', 'loss', 'scene3d'],
        extra: 'GEO 天顶单程约 119 ms，一次「请求 + 应答」四跳约 477 ms——打电话那半秒延迟就来自这里，不是设备慢。'
      },
      {
        id: 'doppler',
        term: '多普勒频移',
        en: 'Doppler Shift',
        group: 'prop',
        def: '卫星与地面站径向相对运动引起的接收频率偏移，接近时偏高、远离时偏低，过顶时穿过零。',
        unit: 'kHz',
        formula: 'f_d = −f · v_r / c ; v_r,max = v · R_E/(R_E+h)',
        pitfall: '不能直接拿轨道速度 v 当代入，最大视线径向速度要乘几何因子 R_E/(R_E+h)；LEO 600 km / 2 GHz 约 ±46 kHz，而 GEO 因与地面相对静止几乎为零——这是低轨接收机必须做频偏跟踪、高轨却不用太操心的根因。',
        related: ['doppler', 'scene3d', 'mod'],
        extra: '一次过境画出的是 S 形频移曲线：入境正峰、过顶归零、出境负峰，斜率最陡处在过顶附近。'
      },
      {
        id: 'polarization',
        term: '极化',
        en: 'Polarization',
        group: 'prop',
        def: '电场矢量的取向与旋向（线极化垂直/水平、圆极化左旋/右旋），是频率之外可复用的一个隔离维度。',
        unit: '—',
        formula: '交叉极化鉴别度 XPD 以 dB 计；线极化需做馈源旋转角对齐',
        pitfall: '收发极化不匹配会造成很大损耗甚至收不到；圆极化过电离层会受法拉第旋转影响，线极化则需机械调角。把「同频」当成「同信道」而忽略极化复用，会漏算一半容量。',
        related: ['system', 'beam', 'loss'],
        extra: '同一频率用左旋/右旋（或垂直/水平）各传一路，是卫星转发器常用的频率复用手段。'
      },

      /* ---------------- orbit · 轨道与星座 ---------------- */
      {
        id: 'orbit_classes',
        term: 'GEO / MEO / LEO 轨道',
        en: 'Geostationary / Medium / Low Earth Orbit',
        group: 'orbit',
        def: '按高度划分的三类轨道：LEO 约 600~1500 km、MEO 约 20000 km、GEO 35786 km 且倾角为零、位于赤道面。',
        unit: 'km',
        formula: 'T = 2π√((R_E+h)³/μ) / 60 [min] ; v = √(μ/(R_E+h))',
        pitfall: 'GEO 的「静止」是相对地面，条件是周期等于恒星日且倾角为零、轨道圆；把 24 小时太阳日当代入会算出约 35870 km 而不是 35786 km。LEO 单星覆盖小、时延低但多普勒大，GEO 覆盖广却时延高，三者没有「谁更好」，只有取舍。',
        related: ['scene3d', 'delay', 'doppler'],
        extra: '三颗 GEO 星按 120° 分布几乎能覆盖全球（除高纬极区），这也是最早商用卫星通信的骨架。'
      },
      {
        id: 'sidereal_day',
        term: '恒星日',
        en: 'Sidereal Day',
        group: 'orbit',
        def: '地球相对遥远恒星自转一周的时间，86164.0905 秒（23 小时 56 分 4 秒），是 GEO 周期必须对齐的基准。',
        unit: 's',
        formula: 'T_sidereal = 86164.0905 s ≈ 1436.07 min',
        pitfall: '它不是 24 小时（86400 s）太阳日，两者差约 236 秒、0.27%；用 86400 s 反解 GEO 半径会偏高约 80 km，周期看着「差不多」但天线就得天天追星。',
        related: ['scene3d', 'delay'],
        extra: '差的那 4 分钟是地球一边自转一边公转、每天要多转一点才能重新对准太阳造成的。'
      },
      {
        id: 'footprint',
        term: '覆盖区与最小仰角',
        en: 'Footprint and Minimum Elevation',
        group: 'orbit',
        def: '卫星在地面能服务的区域；由允许的最小仰角 E_min 决定，地心张角换算成覆盖半径。',
        unit: 'km / deg',
        formula: 'α = acos(R_E·cos E_min/(R_E+h)) − E_min ; r = R_E · α',
        pitfall: 'E_min 不是装饰参数：把它从 5° 提到 10°，覆盖圈会明显缩小但低仰角的雨衰与遮挡也好得多。有人直接用轨道高度当覆盖半径，忽略了球面几何。',
        related: ['scene3d', 'loss', 'system'],
        extra: '3D 场景里那个半透明锥体就是覆盖锥，锥底圆即地面覆盖区，锥半角来自最小仰角。'
      },

      /* ---------------- payload · 星上载荷与转发 ---------------- */
      {
        id: 'transponder',
        term: '转发器（透明 / 处理）',
        en: 'Transparent vs Regenerative Transponder',
        group: 'payload',
        def: '卫星上接收上行、变频、放大再发下行的核心载荷；透明转发只做频谱搬移与放大，处理转发会解调再生比特。',
        unit: '—',
        formula: '透明：f_down = f_up − f_LO（本振下变频，带宽与调制不变）',
        pitfall: '透明转发器把上行链路带进来的噪声一并放大下发，上行噪声在星上救不回来；因此上行要特意做足 EIRP。处理转发器能隔断上行噪声、再生干净比特，但星上复杂度与功耗高得多。',
        related: ['system', 'link'],
        extra: '这就是「上行比下行更金贵」的原因：下行可以靠加大星上 EIRP 补，上行噪声却已成定局。'
      },
      {
        id: 'hpa',
        term: 'HPA 高功率放大器',
        en: 'High Power Amplifier',
        group: 'payload',
        def: '把上行/下行射频信号放大到足以跨越几万公里链路的末级功放（星上常用 TWTA 或 SSPA）。',
        unit: 'dBW',
        formula: 'EIRP = Pt(HPA 输出) + Gt − L_feed',
        pitfall: 'HPA 接近饱和时非线性会失真、产生互调，多载波尤其明显，工程上要「回退」（output back-off）；把额定饱和功率直接当代入算 EIRP 会偏乐观。',
        related: ['system', 'link'],
        extra: '星上电力和散热都有限，HPA 往往是整星功耗大户，也是转发器 EIRP 的天花板。'
      },
      {
        id: 'lnb',
        term: 'LNB 低噪声放大下变频器',
        en: 'Low-Noise Block Downconverter',
        group: 'payload',
        def: '接收天线馈源后第一级：在尽量少引入自身噪声的前提下把微弱信号放大，并把高频下变频到便于馈线与接收机处理的中频。',
        unit: 'K / dB',
        formula: 'T_sys ≈ T_ant + T_feed + T_LNB ; G/T = G_rx − 10log₁₀(T_sys)',
        pitfall: '整机噪声系数几乎由第一级决定（Friis 公式），所以 LNB 必须放在馈源最近处；先把信号用长电缆拉下来再放大，电缆损耗会直接变成噪声温度，后面再好的放大器也补不回来。',
        related: ['system', 'beam', 'link'],
        extra: '家用「小锅」上那个挂在焦点的小盒子就是 LNB，噪声温度常标成 0.3 dB / 0.7 dB 噪声系数。'
      },
      {
        id: 'uplink_downlink',
        term: '上行 / 下行链路',
        en: 'Uplink / Downlink',
        group: 'payload',
        def: '上行是地面站发往卫星、下行是卫星发往地面站；为避免星上收发自扰，两者用不同频段且上行频率通常更高。',
        unit: 'GHz',
        formula: 'f_down = f_up − f_LO（转发器本振固定差值，如 C/Ku/Ka 各频段成对）',
        pitfall: '上下行频率不同，FSPL 也就不同（上行略大）；做链路预算必须分两段各自算，不能只算一条「平均距离」。把两段的噪声贡献混在一起，是透明转发器链路最容易算错的地方。',
        related: ['system', 'link', 'loss'],
        extra: '上行高、下行低还有个工程理由：地面站功放便宜、星上功放贵，让地面多扛一点高频损耗。'
      },

      /* ---------------- mod · 调制编码与多址 ---------------- */
      {
        id: 'fec_gain',
        term: 'FEC 编码增益',
        en: 'Forward Error Correction Coding Gain',
        group: 'mod',
        def: '信道编码在同样误码率下所节省的 Eb/N0，用冗余比特换取更低的解调门限。',
        unit: 'dB',
        formula: '所需 Eb/N0 = 未编码门限 − 编码增益（约 3~7 dB，视码型与码率）',
        pitfall: '编码增益不是白来的：码率 r<1 意味着要传更多比特，占用带宽按 1/r 增加，净信息速率不变时等效 Eb/N0 会被摊薄。只说「省了 5 dB」不提带宽代价是误读。',
        related: ['mod', 'link', 'system'],
        extra: '直觉：给每句话加几遍冗余，对方听不清也能猜回来；代价是同样时间说得更多。'
      },
      {
        id: 'shannon',
        term: '香农容量限',
        en: 'Shannon Capacity Limit',
        group: 'mod',
        def: '给定带宽与信噪比下无差错传输的理论上限，任何实际调制编码方案都只能逼近、不能越过。',
        unit: 'bps',
        formula: 'C = B · log₂(1 + S/N)',
        pitfall: '式中的 S/N 是线性比值，不是 dB；把 dB 直接代进 log₂ 会得到荒唐结果。另外它只给上限、不给实现方案，别拿它当成「这个调制能跑多快」的承诺。',
        related: ['mod', 'link'],
        extra: '把 Eb/N0 换算成频谱效率 C/B 后，能直观看到高阶调制离香农限还差几 dB，这就是编码调制设计的空间。'
      },
      {
        id: 'mod_order',
        term: '调制阶数 M',
        en: 'Modulation Order (QPSK / 8PSK / 16QAM)',
        group: 'mod',
        def: '每个符号携带的比特数 log₂M；M 越大频谱效率越高，但星座点越密、抗噪声越差。',
        unit: 'bit/symbol',
        formula: '频谱效率 η = r · log₂(M) [bps/Hz]，r 为编码码率',
        pitfall: '高阶调制不是「免费提速」：16QAM 比 QPSK 每层多 2 bit，却需要高出好几 dB 的 Eb/N0 才能维持同样误码率。链路余量不够时盲目上高阶调制，一遇雨衰就掉线。',
        related: ['mod', 'link', 'loss'],
        extra: '这也是自适应编码调制（ACM）的思路：晴天用 16QAM 冲速率，下雨自动退回 QPSK 保链路。'
      },
      {
        id: 'multiple_access',
        term: '多址 FDMA / TDMA / CDMA',
        en: 'Multiple Access (FDMA / TDMA / CDMA)',
        group: 'mod',
        def: '多个地面站共享同一转发器带宽的三种基本方式：按频率切、按时隙切、按扩频码切。',
        unit: '—',
        formula: 'FDMA：B = ΣB_i + 保护带 ; TDMA：一帧 = Σ时隙 + 保护间隔 ; CDMA：各站用正交/准正交扩频码叠加',
        pitfall: '多址解决的是「多个站共享上行」这一段，不是调制也不是复用；FDMA 要留保护带且多载波经 HPA 易生互调，TDMA 要求精确同步、有保护间隔开销，CDMA 则有远近问题需功率控制。把三者当同一个维度挑「最好」是错的。',
        related: ['delay', 'system', 'mod'],
        extra: '3D 全景图里多址标注带指向上行传播与转发器入口，就是因为它作用在多站共享那一段。'
      },

      /* ---------------- ant · 天线与波束 ---------------- */
      {
        id: 'antenna_gain',
        term: '口径增益 G',
        en: 'Parabolic Antenna Gain',
        group: 'ant',
        def: '抛物面天线把能量聚到窄波束的能力，由口径 D、波长 λ 与照射效率 η 决定。',
        unit: 'dBi',
        formula: 'G = η(πD/λ)² ; G(dBi) = 10log₁₀[η(πD/λ)²]',
        pitfall: '增益随 (D/λ)² 增长，所以频率翻倍（λ 减半）增益涨 6 dB，而不是 3 dB；η（常取 0.6 左右）代表口径照射与遮挡损失，漏掉它会高估 2 dB 以上。',
        related: ['beam', 'link'],
        extra: '同一面 1.2 m 天线，Ku 频段比 C 频段增益高约 9 dB，这就是「锅不用做很大」的原因。'
      },
      {
        id: 'beamwidth',
        term: '半功率波束宽度 θ',
        en: 'Half-Power Beamwidth',
        group: 'ant',
        def: '方向图主瓣增益下降 3 dB 处的全宽度，近似与 λ/D 成正比。',
        unit: 'deg',
        formula: 'θ ≈ 70λ/D [deg，λ 与 D 同单位]',
        pitfall: '口径越大波束越窄，增益与波束宽度由同一个 (D/λ) 决定，存在 G·θ²≈常数的取舍；波束变窄意味着指向精度要求更高，GEO 天线差 0.1° 就可能有明显指向损耗。',
        related: ['beam', 'scene3d'],
        extra: '直觉：手电筒聚得越窄、照得越远，但也越要对准——增益和「瞄准难度」是一枚硬币的两面。'
      },

      /* ---------------- ops · 测控与运维 ---------------- */
      {
        id: 'ttc',
        term: 'TT&C 测控',
        en: 'Tracking, Telemetry and Command',
        group: 'ops',
        def: '控制段对卫星做跟踪测轨、接收遥测（状态/温度/功耗）、上注遥控指令的专用链路与地面站。',
        unit: '—',
        formula: '独立于业务链路，常用单独频段与全向/宽波束天线以保证任何姿态下都通',
        pitfall: 'TT&C 是「旁挂」在业务信号链之外的控制段，不承载用户数据；把它算进端到端业务时延或容量是错的。但它一旦失效，卫星就失控，重要性不在业务链路之下。',
        related: ['system', 'scene3d'],
        extra: '3D 全景图里 TT&C 与网管中心画在控制段分区、挂在主链旁边，就是因为它不参与信源到信宿那一路。'
      },
      {
        id: 'db_pitfall',
        term: 'dB 与「3 dB 是不是 2 倍」',
        en: 'Decibel Arithmetic Pitfall',
        group: 'link',
        def: 'dB 是对数域单位，功率相加必须先回线性域；3 dB 只是 2 倍的常用近似，不是精确值。',
        unit: 'dB',
        formula: 'dbSum(3,3) = 10log₁₀(10^0.3 + 10^0.3) = 6.0103 dB ; 10log₁₀(2) = 3.0103 dB',
        pitfall: '10^0.3 = 1.9953 而不是精确 2，所以「两个 3 dB 加起来是 6 dB」只是近似；写成 6.0206 是把 3 dB 当精确 2 倍后的 20log₁₀(2)（幅度域），口径不同。功率域合路必须用 10log₁₀(Σ10^(a/10))，不能把 dB 数直接相加。',
        related: ['link', 'loss', 'mod'],
        extra: '物理核算里 dbSum(3,3) 取精确值 6.01029995664 dB，测试注释里把两种口径都写明了。'
      }
    ]
  };

  return api;
});

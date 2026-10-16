import type { ExperimentId } from './session';

export const catalog: Record<
  ExperimentId,
  {
    number: string;
    name: string;
    english: string;
    category: string;
    description: string;
    formula: string;
    principle: string;
    caveat: string;
    unit: string;
  }
> = {
  diffusion: {
    number: '01',
    name: '粒子扩散与熵增',
    english: 'Hard-disk gas & entropy',
    category: '统计物理',
    description: '让真实弹性碰撞驱动气体演化，探索守恒、速度分布与空间熵。',
    formula: 'Jₙ = −2 vᵣₑₗ·n / (1/m₁ + 1/m₂)',
    principle:
      '硬盘接触且沿法线靠近时，施加恢复系数 e=1 的成对冲量，守恒动量与动能；墙壁、隔板只反射法向速度。固定步长内计算首次接触时间并继续剩余时间，跨网格事件保证高速粒子也进入候选检测。H = −Σpᵢlog₂pᵢ，基于 10×10 位置网格，上限 log₂100 ≈ 6.644 bit。',
    caveat:
      '二维无转动、无长程力、m₀=1 的硬盘气体；初始位置无重叠，速度分量均匀随机、去除质心漂移并归一化 RMS。碰撞频率是累计次数/模拟时间；墙壁及隔板提供外部冲量，总动量不必守恒。多体同时接触按确定顺序近似，单步最多 50,000 个事件，超限暂停。隔板插入使用有上限的位置投影，不模拟真实移动隔板的做功过程。空间 Shannon 熵不是完整热力学熵，也不保证单调；速率直方图末箱含超过 3 倍初始 RMS 的尾部。',
    unit: '模拟时间 t / s',
  },
  walk: {
    number: '02',
    name: '二维随机游走',
    english: 'Random walk',
    category: '随机过程',
    description: '每一步方向随机，却有可预测的整体扩散尺度。',
    formula: '⟨r²(n)⟩ = n ℓ²',
    principle:
      '粒子在无界二维平面上独立游走，每步长度为 ℓ、方向在 [0, 2π) 均匀采样。均方位移是粒子到原点距离平方的样本均值，理论期望随步数 n 线性增长。',
    caveat:
      '长度采用任意单位 u，步数不是秒。有限粒子数导致统计波动。画布随扩散范围自动缩放，轨迹仅保留最近 128 步，位移统计始终从原点计算。改变粒子数或步长会重新初始化。',
    unit: '步数 n / step',
  },
  life: {
    number: '03',
    name: '康威生命游戏',
    english: 'Conway’s Game of Life',
    category: '细胞自动机',
    description: '四条局部规则，演化出振荡、迁移与复杂的自组织结构。',
    formula: 'B3 / S23',
    principle:
      '同步更新 Moore 邻域的八个邻居：死细胞恰有三个活邻居时出生；活细胞有两个或三个活邻居时存活，其余死亡。有限边界外视为空；周期边界连接相对两边。',
    caveat:
      '这是离散细胞自动机，代数不对应真实物理时间。暂停后可拖动画布绘制，右键或切换擦除模式可擦除；触屏也支持。编辑保留代数并更新当前统计，预设和网格大小变更会重置。',
    unit: '代数 / generation',
  },
  ising: {
    number: '04',
    name: '二维伊辛模型',
    english: '2D Ising model',
    category: '相变与临界',
    description: '改变温度，探索自旋系统从有序到无序的集体行为。',
    formula: 'P(接受) = min[1, exp(−ΔE / T)]',
    principle:
      '二维正方格最近邻铁磁模型，J = kᴮ = 1、外场 h = 0，周期边界。每次随机选择一个自旋尝试翻转；能量下降总是接受，否则按 Boltzmann 概率接受。每个 sweep 尝试 N² 次。',
    caveat:
      '显示瞬时每自旋磁化 m = Σsᵢ/N² 和空间平均能量 E/N²（每条键计一次），不是热平衡时间平均。无限晶格 Tᴄ ≈ 2.269；有限尺寸使转变变宽，临界处弛豫较慢。Monte Carlo sweep 不等于真实物理时间；变温后需重新弛豫。',
    unit: 'Monte Carlo / sweep',
  },
};
export const experimentIds: ExperimentId[] = ['diffusion', 'walk', 'life', 'ising'];

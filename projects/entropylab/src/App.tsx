import { useRef, useState, type PointerEvent } from 'react';
import { catalog, experimentIds } from './experiments/catalog';
import type { ExperimentId } from './experiments/session';
import { paintCell } from './experiments/game-of-life/model';
import { canvasCell } from './experiments/render';
import { useSimulation } from './hooks/useSimulation';
import { Icon } from './components/Icon';
import { Controls } from './components/Controls';
import { Histogram, LineChart } from './components/Chart';
import './styles.css';

function getTheme(): boolean {
  try {
    return localStorage.getItem('entropylab-theme') === 'light';
  } catch {
    return false;
  }
}
function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('zh-CN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function Laboratory({ id, light }: { id: ExperimentId; light: boolean }) {
  const sim = useSimulation(id, light);
  const { snapshot: s, config: c, session } = sim;
  const meta = catalog[id];
  const [erase, setErase] = useState(false);
  const brush = useRef<{ active: boolean; alive: boolean; last?: [number, number] }>({
    active: false,
    alive: true,
  });
  const historyX = s.history.map((v) => v.x);
  const a = s.history.map((v) => v.a),
    b = s.history.map((v) => v.b);
  const metrics =
    id === 'diffusion'
      ? [
          { label: 'Shannon 熵', value: fmt(s.a, 3), unit: 'bit', hint: '10 × 10 空间网格' },
          {
            label: '左半区 / 右半区',
            value: `${s.b} / ${s.c}`,
            unit: '个',
            hint: `总粒子数 ${c.count}`,
          },
          { label: '模拟时间', value: fmt(s.x, 1), unit: 's', hint: '固定步长 1/60 s' },
        ]
      : id === 'walk'
        ? [
            { label: '模拟均方位移', value: fmt(s.a), unit: 'u²', hint: '所有粒子的样本均值' },
            { label: '理论期望 nℓ²', value: fmt(s.b), unit: 'u²', hint: '独立、各向同性步进' },
            { label: '累计步数', value: fmt(s.x, 0), unit: 'step', hint: '位移始终相对原点' },
          ]
        : id === 'life'
          ? [
              {
                label: '活细胞数量',
                value: fmt(s.a, 0),
                unit: '个',
                hint: `共 ${c.size * c.size} 个网格`,
              },
              { label: '当前代数', value: fmt(s.x, 0), unit: '代', hint: '同步更新 B3 / S23' },
              {
                label: '活细胞密度',
                value: fmt(s.b * 100, 2),
                unit: '%',
                hint: c.boundary === 'periodic' ? '周期性边界' : '有限边界',
              },
            ]
          : [
              {
                label: '每自旋磁化 m',
                value: fmt(s.a, 3),
                unit: '',
                hint: `有序程度 |m| = ${fmt(Math.abs(s.a), 3)}`,
              },
              {
                label: '每自旋平均能量',
                value: fmt(s.b, 3),
                unit: 'J',
                hint: '当前空间平均，非时间平均',
              },
              {
                label: 'Monte Carlo 步数',
                value: fmt(s.x, 0),
                unit: 'sweep',
                hint: `最近接受率 ${fmt(s.c * 100, 1)}%`,
              },
            ];

  function paint(event: PointerEvent<HTMLCanvasElement>) {
    if (!session.life || !brush.current.active || sim.running) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const [x, y] = canvasCell(
      rect.width,
      rect.height,
      event.clientX - rect.left,
      event.clientY - rect.top,
      session.life.size,
    );
    const previous = brush.current.last ?? [x, y];
    const steps = Math.max(Math.abs(x - previous[0]), Math.abs(y - previous[1]), 1);
    // Interpolate fast pointer movements so a stroke leaves no gaps.
    for (let i = 1; i <= steps; i++)
      paintCell(
        session.life,
        Math.round(previous[0] + ((x - previous[0]) * i) / steps),
        Math.round(previous[1] + ((y - previous[1]) * i) / steps),
        brush.current.alive,
      );
    brush.current.last = [x, y];
    sim.refresh();
  }
  function startPaint(event: PointerEvent<HTMLCanvasElement>) {
    if (id !== 'life' || sim.running || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    brush.current = { active: true, alive: event.button === 2 ? false : !erase };
    paint(event);
  }
  const stopPaint = () => {
    brush.current.active = false;
    brush.current.last = undefined;
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            EXPERIMENT {meta.number}
            <span /> {meta.category}
          </div>
          <h1>{meta.name}</h1>
          <p>{meta.description}</p>
        </div>
        <div className="local-badge">
          <span />
          浏览器本地计算
        </div>
      </div>
      <div className="lab-grid">
        <section className="simulation panel" aria-label="实时模拟">
          <div className="simulation-heading">
            <div>
              <span className={`status-dot ${sim.running ? 'running' : ''}`} />
              <h2>实时模拟</h2>
              <span className="simulation-subtitle">{meta.english}</span>
            </div>
            <span className="status-text" role="status" aria-label="模拟状态">
              {sim.running ? '运行中' : '已暂停'}
            </span>
          </div>
          <div className="canvas-shell">
            <div className="canvas-label">
              {id === 'diffusion'
                ? '二维容器 · L = 1'
                : id === 'walk'
                  ? '无界平面 · 自动缩放'
                  : `${c.size} × ${c.size} ${id === 'life' && c.boundary === 'finite' ? '有限' : '周期'}网格`}
            </div>
            <canvas
              ref={sim.canvasRef}
              aria-label={`${meta.name}模拟画布`}
              role="img"
              className={id === 'life' && !sim.running ? 'editable' : ''}
              onPointerDown={startPaint}
              onPointerMove={paint}
              onPointerUp={stopPaint}
              onPointerCancel={stopPaint}
              onLostPointerCapture={stopPaint}
              onContextMenu={(e) => {
                if (id === 'life') e.preventDefault();
              }}
            >
              当前浏览器需要支持 Canvas 2D。实验数据可在下方统计中读取。
            </canvas>
            <div className="canvas-legend">
              {id === 'diffusion' ? (
                <>
                  <span>
                    <i />
                    左半区粒子
                  </span>
                  <span>
                    <i className="purple" />
                    右半区粒子
                  </span>
                  <span className="divider-state">隔板{c.divider ? '关闭' : '开启'}</span>
                </>
              ) : id === 'walk' ? (
                <>
                  <span>
                    <i />
                    粒子与近期轨迹
                  </span>
                  <span>
                    <i className="purple" />
                    虚线圆：理论 RMS 半径
                  </span>
                </>
              ) : id === 'life' ? (
                <>
                  <span>
                    <i />
                    活细胞
                  </span>
                  <span>{sim.running ? '暂停后可编辑细胞' : '拖动绘制 · 右键擦除'}</span>
                </>
              ) : (
                <>
                  <span>
                    <i />
                    自旋 +1
                  </span>
                  <span>
                    <i className="purple" />
                    自旋 −1
                  </span>
                  <span className="divider-state">T = {c.temperature.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>
          <div className="transport">
            <div className="transport-buttons">
              <button className="primary-button" onClick={sim.toggle}>
                <Icon name={sim.running ? 'pause' : 'play'} size={17} />
                {sim.running ? '暂停' : '开始模拟'}
              </button>
              <button
                className="icon-button"
                aria-label="单步执行"
                title={
                  id === 'ising'
                    ? '执行一个 sweep'
                    : id === 'diffusion'
                      ? '推进 1/60 s'
                      : '单步执行'
                }
                disabled={sim.running}
                onClick={() => sim.step()}
              >
                <Icon name="step" size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="重置模拟"
                title="按当前参数重置"
                onClick={sim.reset}
              >
                <Icon name="reset" size={18} />
              </button>
              {id === 'walk' && (
                <button
                  className="small-button"
                  disabled={sim.running}
                  onClick={() => sim.step(100)}
                >
                  +100 步
                </button>
              )}
            </div>
            {id === 'life' ? (
              <div className="brush-tools" role="group" aria-label="细胞画笔">
                <button aria-label="绘制细胞" aria-pressed={!erase} onClick={() => setErase(false)}>
                  <Icon name="draw" size={16} />
                </button>
                <button aria-label="擦除细胞" aria-pressed={erase} onClick={() => setErase(true)}>
                  <Icon name="erase" size={16} />
                </button>
                <button
                  className="small-button"
                  onClick={() => {
                    sim.pause();
                    session.life!.cells.fill(0);
                    sim.refresh();
                  }}
                >
                  清空
                </button>
              </div>
            ) : (
              <span className="transport-note">{c.speed}× 播放速度</span>
            )}
          </div>
          <div className="metrics" aria-label="实时统计">
            {metrics.map((m) => (
              <div className="metric" key={m.label}>
                <span className="metric-label">{m.label}</span>
                <div>
                  <strong>{m.value}</strong>
                  <span className="metric-unit">{m.unit}</span>
                </div>
                <span className="metric-hint">{m.hint}</span>
              </div>
            ))}
          </div>
        </section>
        <Controls id={id} config={c} update={sim.update} restore={sim.restore} />
        <div className="charts-grid">
          {id === 'diffusion' && (
            <>
              <LineChart
                title="空间熵的演化"
                x={historyX}
                series={[{ label: 'Shannon 熵 H', values: a, color: 'var(--accent)' }]}
                xLabel={meta.unit}
                yLabel="H / bit"
                domain={[0, Math.log2(100)]}
              />
              <Histogram
                title="粒子空间分布"
                values={s.bars}
                xLabel="水平位置 x / L"
                endLabel="1"
                expected={c.count / 10}
              />
            </>
          )}
          {id === 'walk' && (
            <>
              <LineChart
                title="均方位移与理论预测"
                x={historyX}
                series={[
                  { label: '模拟 ⟨r²⟩', values: a, color: 'var(--accent)' },
                  { label: '理论 nℓ²', values: b, color: 'var(--purple)', dashed: true },
                ]}
                xLabel={meta.unit}
                yLabel="⟨r²⟩ / u²"
              />
              <Histogram
                title="径向距离分布"
                values={s.bars}
                xLabel="距原点距离 r / u"
                endLabel={fmt(s.c, 1)}
              />
            </>
          )}
          {id === 'life' && (
            <>
              <LineChart
                title="活细胞数量演化"
                x={historyX}
                series={[{ label: '活细胞', values: a, color: 'var(--accent)' }]}
                xLabel={meta.unit}
                yLabel="活细胞 / 个"
              />
              <Histogram
                title="活细胞空间分布"
                values={s.bars}
                xLabel="水平位置 x / 网格宽度"
                endLabel="1"
              />
            </>
          )}
          {id === 'ising' && (
            <>
              <LineChart
                title="磁化强度演化"
                x={historyX}
                series={[{ label: '每自旋 m', values: a, color: 'var(--accent)' }]}
                xLabel={meta.unit}
                yLabel="m / 无量纲"
                domain={[-1, 1]}
              />
              <LineChart
                title="平均能量演化"
                x={historyX}
                series={[{ label: '每自旋 E/N²', values: b, color: 'var(--purple)' }]}
                xLabel={meta.unit}
                yLabel="E/N² / J"
                domain={[-2, 2]}
              />
            </>
          )}
        </div>
        <section className="theory panel" aria-label="数学原理">
          <div className="theory-heading">
            <Icon name="info" size={18} />
            <h2>实验背后的数学</h2>
            <span>THE SCIENCE</span>
          </div>
          <div className="theory-content">
            <div className="formula">{meta.formula}</div>
            <div>
              <p>{meta.principle}</p>
              <p className="model-caveat">{meta.caveat}</p>
            </div>
          </div>
        </section>
      </div>
      <footer>
        <span>
          EntropyLab 1.0 <i /> 从简单规则，发现复杂世界。
        </span>
        <span>数值模型 · 交互探索 · 可复现实验</span>
      </footer>
    </>
  );
}

export default function App() {
  const [id, setId] = useState<ExperimentId>('diffusion');
  const [light, setLight] = useState(getTheme);
  function toggleTheme() {
    const next = !light;
    setLight(next);
    try {
      localStorage.setItem('entropylab-theme', next ? 'light' : 'dark');
    } catch {
      /* Storage is optional. */
    }
  }
  return (
    <div className={`app ${light ? 'light' : 'dark'}`}>
      <a className="skip-link" href="#main">
        跳至实验区
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main" aria-label="EntropyLab 实验室">
          <span className="brand-mark">
            <Icon name="diffusion" size={28} />
          </span>
          <span>
            Entropy<span className="brand-light">Lab</span>
            <small>COMPUTATIONAL PLAYGROUND</small>
          </span>
        </a>
        <div className="nav-caption">
          探索实验 <span>EXPERIMENTS</span>
        </div>
        <nav aria-label="实验选择">
          {experimentIds.map((key) => (
            <button
              key={key}
              className={`nav-item ${id === key ? 'active' : ''}`}
              aria-label={`${catalog[key].name} ${catalog[key].english}`}
              title={catalog[key].name}
              aria-current={id === key ? 'page' : undefined}
              onClick={() => setId(key)}
            >
              <span className="nav-icon">
                <Icon name={key} />
              </span>
              <span>
                <strong>{catalog[key].name}</strong>
                <small>{catalog[key].english}</small>
              </span>
              <span className="nav-number">{catalog[key].number}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-formula">S = kᴮ ln Ω</div>
          <p>
            在微观的随机中，
            <br />
            寻找宏观的秩序。
          </p>
          <div className="offline-tag">
            <span />
            完全本地 · 无需网络
          </div>
          <span className="version">ENTROPYLAB / V1.0.0</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span>实验室</span>
            <Icon name="arrow" size={13} />
            <strong>{catalog[id].name}</strong>
          </div>
          <div>
            <span className="topbar-caption">一个关于变化的实验室</span>
            <button
              className="theme-button"
              onClick={toggleTheme}
              aria-label={light ? '切换深色主题' : '切换浅色主题'}
            >
              <Icon name={light ? 'moon' : 'sun'} size={18} />
            </button>
            <span className="version-pill">v1.0</span>
          </div>
        </header>
        <main id="main">
          <Laboratory key={id} id={id} light={light} />
        </main>
      </div>
    </div>
  );
}

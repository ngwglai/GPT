import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CONFIG, MAX_STEPS, TEMPLATES, validateConfig } from '../core/config';
import { exportCSV, exportJSON } from '../core/export';
import { GAMES } from '../core/games';
import { ALGORITHMS, ALGORITHM_NAMES, type Config, type Experiment, type OpponentSpec, type Phase, type Round, type RunResult, type Summary } from '../core/types';
import { summarize } from '../core/statistics';
import type { Command, Reply } from '../worker';
import { Distribution, LearningChart, PHASE_NAMES } from './Charts';

const OPPONENT_NAMES = { uniform: '均匀随机', fixed: '固定动作', biased: '偏好动作', reactive: '响应上次动作', switching: '指定回合切换' };
const STATUS_NAMES = { idle: '等待配置', running: '正在运行', paused: '已暂停', done: '完整完成', cancelled: '已取消', error: '运行失败' };
type Status = keyof typeof STATUS_NAMES;

function NumberField({ label, value, min, max, step = 1, change }: { label: string; value: number; min: number; max: number; step?: number; change: (n: number) => void }) {
  return <label>{label}<input type="number" value={Number.isNaN(value) ? '' : value} min={min} max={max} step={step} onChange={e => change(e.target.value === '' ? NaN : Number(e.target.value))} /></label>;
}

function OpponentFields({ title, spec, game, change }: { title: string; spec: OpponentSpec; game: Config['game']; change: (s: OpponentSpec) => void }) {
  const set = <K extends keyof OpponentSpec>(key: K, value: OpponentSpec[K]) => change({ ...spec, [key]: value });
  return <fieldset className="opponent"><legend>{title}</legend>
    <label>策略<select value={spec.kind} onChange={e => set('kind', e.target.value as OpponentSpec['kind'])}>{Object.entries(OPPONENT_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
    {['fixed', 'biased', 'switching'].includes(spec.kind) && <label>偏好 / 初始动作<select value={spec.action} onChange={e => set('action', Number(e.target.value))}>{GAMES[game].actions.map((a, i) => <option key={a} value={i}>{a}</option>)}</select></label>}
    {spec.kind === 'biased' && <NumberField label="偏好概率" value={spec.bias} min={0} max={1} step={0.05} change={v => set('bias', v)} />}
    {spec.kind === 'switching' && <><NumberField label="切换前回合数" value={spec.switchRound} min={0} max={20000} change={v => set('switchRound', v)} />
      <label>切换后动作<select value={spec.nextAction} onChange={e => set('nextAction', Number(e.target.value))}>{GAMES[game].actions.map((a, i) => <option key={a} value={i}>{a}</option>)}</select></label></>}
  </fieldset>;
}

function ResultsTable({ rows }: { rows: Summary[] }) {
  return <div className="table-scroll"><table><caption>每种配置的阶段汇总 · 原始收益，跨种子样本标准差</caption><thead><tr><th>算法 / 阶段</th><th>种子数</th><th>对局数</th><th>均值 ± SD</th><th>种子均值范围</th><th>胜率</th></tr></thead>
    <tbody>{rows.map(row => <tr key={`${row.algorithm}-${row.phase}`}><th>{ALGORITHM_NAMES[row.algorithm]} <small>{PHASE_NAMES[row.phase]}</small></th><td>{row.seeds}</td><td>{row.rounds.toLocaleString()}</td><td>{row.mean.toFixed(3)} ± {row.sd.toFixed(3)}</td><td>[{row.min.toFixed(3)}, {row.max.toFixed(3)}]</td><td>{(row.winRate * 100).toFixed(1)}%</td></tr>)}</tbody></table>{!rows.length && <p className="placeholder">实验完成后，在这里比较各算法。演示过程显示当前配置的阶段统计。</p>}</div>;
}

export function App() {
  const [config, setConfig] = useState<Config>(() => structuredClone(DEFAULT_CONFIG));
  const [template, setTemplate] = useState(0);
  const [compare, setCompare] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ steps: 0, budget: 1 });
  const [live, setLive] = useState<RunResult>();
  const [experiment, setExperiment] = useState<Experiment>();
  const [events, setEvents] = useState<Round[]>([]);
  const [phase, setPhase] = useState<Phase>('train');
  const [cumulative, setCumulative] = useState(false);
  const [mode, setMode] = useState<'demo' | 'batch'>('demo');
  const worker = useRef<Worker | undefined>(undefined);
  const busy = status === 'running' || status === 'paused';
  useEffect(() => () => worker.current?.terminate(), []);
  const set = <K extends keyof Config>(key: K, value: Config[K]) => setConfig(c => ({ ...c, [key]: value }));
  function clearResults() {
    setExperiment(undefined); setLive(undefined); setEvents([]); setProgress({ steps: 0, budget: 1 }); setError(''); setPhase('train');
  }
  function reset() { worker.current?.terminate(); worker.current = undefined; setStatus('idle'); clearResults(); }
  function start(batch: boolean, paused = false) {
    try {
      const algorithms = batch && compare ? ALGORITHMS : [config.algorithm];
      const seeds = batch ? config.seeds : 1;
      const budget = validateConfig(config, algorithms, seeds);
      worker.current?.terminate();
      const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      clearResults();
      setMode(batch ? 'batch' : 'demo');
      setProgress({ steps: 0, budget });
      setStatus(paused ? 'paused' : 'running');
      w.onmessage = (message: MessageEvent<Reply>) => {
        if (worker.current !== w) return;
        const reply = message.data;
        if (reply.type === 'progress') {
          setProgress({ steps: reply.steps, budget: reply.budget }); setLive(reply.run);
          if (!batch) setEvents(previous => [...previous, ...reply.events].slice(-12));
        } else if (reply.type === 'done') { setExperiment(reply.experiment); setStatus('done'); }
        else if (reply.type === 'paused') setStatus('paused');
        else if (reply.type === 'cancelled') { setStatus('cancelled'); setLive(undefined); setEvents([]); }
        else if (reply.type === 'error') { setError(reply.message); setStatus('error'); }
      };
      w.onerror = () => { if (worker.current === w) { setError('Worker 启动或执行失败，请重置后缩小实验'); setStatus('error'); } };
      const command: Command = { type: 'start', config: structuredClone(config), algorithms, seeds, demo: !batch, paused };
      w.postMessage(command);
      if (paused) w.postMessage({ type: 'step' } satisfies Command);
    } catch (e) { setError(e instanceof Error ? e.message : '配置无效'); setStatus('error'); }
  }
  function command(type: 'pause' | 'resume' | 'step' | 'cancel') {
    worker.current?.postMessage({ type } satisfies Command);
    if (type === 'resume') setStatus('running');
  }
  function download(format: 'csv' | 'json') {
    if (!experiment) return;
    const blob = new Blob([format === 'csv' ? exportCSV(experiment) : exportJSON(experiment)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `matchuplab-${experiment.config.game}-${experiment.config.seed}.${format}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const runs = experiment?.runs.filter(r => r.seed === experiment.seedValues[0]) ?? (live ? [live] : []);
  const rows = experiment?.summary ?? summarize(live ? [live] : []);
  const metric = runs[0]?.phases[phase]?.metrics;
  const runLabel = runs[0] ? `${ALGORITHM_NAMES[runs[0].algorithm]} · seed ${runs[0].seed}` : '首个种子 / 首个算法';
  const game = GAMES[config.game];
  return <>
    <header className="topbar"><a href="#main" className="brand"><span className="brand-icon">M↗</span> MatchupLab <small>v0.1</small></a><span>本地计算 · 可复现实验 · 零 API</span><a href="#guide">方法与规则 ↗</a></header>
    <main id="main">
      <section className="hero"><div><p className="eyebrow">DECISIONS UNDER UNCERTAINTY / 01</p><h1>对手未知，<br />策略如何生长？</h1><p>把每一次试探变成证据。观察探索与利用，检验学到的策略能否应对下一位对手。</p></div>
        <div className="hero-matrix" aria-hidden="true"><span>EXPLORE</span><div>↗ <b>↔</b> ↘</div><span>LEARN &nbsp; / &nbsp; ADAPT</span></div></section>
      <section className="template-section" aria-label="内置实验模板"><div className="section-heading"><p className="eyebrow">从一个研究问题开始</p><span>03 实验模板</span></div><div className="template-grid">{TEMPLATES.map((t, i) => <button key={t.name} className={`template ${template === i ? 'selected' : ''}`} disabled={busy} aria-pressed={template === i} onClick={() => { reset(); setTemplate(i); setConfig(structuredClone(t.config)); }}><span>0{i + 1} <b>↗</b></span><strong>{t.name}</strong><small>{t.description}</small></button>)}</div></section>
      <div className="workspace">
        <aside className="panel config-panel"><div className="section-heading"><h2>实验配置</h2><span>CONFIGURE</span></div>
          <fieldset disabled={busy} className="config-fields" onChange={() => { if (status !== 'idle') { setStatus('idle'); clearResults(); } }}><legend className="sr-only">配置参数</legend>
            <label>博弈环境<select value={config.game} onChange={e => set('game', e.target.value as Config['game'])}>{Object.values(GAMES).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
            <label>演示算法<select value={config.algorithm} onChange={e => set('algorithm', e.target.value as Config['algorithm'])}>{ALGORITHMS.map(a => <option key={a} value={a}>{ALGORITHM_NAMES[a]}</option>)}</select></label>
            <div className="field-pair"><NumberField label="探索率 ε" value={config.epsilon} min={0} max={1} step={0.01} change={n => set('epsilon', n)} /><NumberField label="EXP3 γ" value={config.gamma} min={0.001} max={1} step={0.01} change={n => set('gamma', n)} /></div>
            <OpponentFields title="训练 / 原对手测试" spec={config.opponent} game={config.game} change={s => set('opponent', s)} />
            <label className="check"><input type="checkbox" checked={config.transfer} onChange={e => set('transfer', e.target.checked)} />冻结后对比迁移至新对手</label>
            {config.transfer && <OpponentFields title="迁移测试对手" spec={config.target} game={config.game} change={s => set('target', s)} />}
            <div className="field-pair"><NumberField label="训练回合" value={config.trainRounds} min={1} max={20000} change={n => set('trainRounds', n)} /><NumberField label="测试回合 / 阶段" value={config.testRounds} min={1} max={20000} change={n => set('testRounds', n)} /></div>
            <div className="field-pair"><NumberField label="随机种子" value={config.seed} min={0} max={4294967295} change={n => set('seed', n)} /><NumberField label="批量种子数" value={config.seeds} min={1} max={32} change={n => set('seeds', n)} /></div>
            <label className="check"><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />批量比较全部四种算法</label>
          </fieldset>
          <div className="controls"><button className="primary" disabled={busy} onClick={() => start(false)}>连续演示</button><button className="accent" disabled={busy} onClick={() => start(true)}>运行批量比较</button>
            <button disabled={status === 'running' || (status === 'paused' && mode === 'batch')} onClick={() => status === 'paused' ? command('step') : start(false, true)}>单局演示</button>
            <button disabled={!busy} onClick={() => command(status === 'running' ? 'pause' : 'resume')}>{status === 'paused' ? '继续' : '暂停'}</button>
            <button disabled={!busy} onClick={() => command('cancel')}>取消任务</button><button onClick={reset}>重置</button></div>
          <p className="budget">预算 ≤ {MAX_STEPS.toLocaleString()} 回合 · ≤ 32 种子<br />Worker 每批 ≤ 512 步 · 计算时间 ≤ 30 秒<br />取消 / 重置丢弃未完成结果，配置编辑清除旧结果。</p>
        </aside>
        <section className="results" aria-label="实验结果"><div className="panel run-status"><div><span className={`status-dot ${status === 'running' ? 'active' : ''}`} /><strong role="status">{STATUS_NAMES[status]}</strong><span>{progress.steps.toLocaleString()} / {progress.budget === 1 && progress.steps === 0 ? '—' : progress.budget.toLocaleString()} 回合</span></div><progress aria-label="实验进度" max={progress.budget} value={progress.steps} />{error && <p role="alert">{error}</p>}</div>
          <div className="panel analysis-panel"><div className="section-heading"><h2>策略观察台</h2><div className="phase-tabs" role="group" aria-label="观察阶段">{(['train', 'test', ...(config.transfer ? ['transfer'] : [])] as Phase[]).map(p => <button key={p} aria-pressed={phase === p} onClick={() => setPhase(p)}>{PHASE_NAMES[p]}</button>)}</div></div>
            <div className="metric-grid"><div><span>平均收益</span><strong>{metric ? metric.mean.toFixed(3) : '—'}</strong><small>原始矩阵单位 / 回合</small></div><div><span>累计收益</span><strong>{metric ? metric.total.toFixed(0) : '—'}</strong><small>当前阶段独立累计</small></div><div><span>胜率</span><strong>{metric ? `${(metric.winRate * 100).toFixed(1)}%` : '—'}</strong><small>平局计入分母</small></div><div><span>有效对局数</span><strong>{metric?.n.toLocaleString() ?? '—'}</strong><small>{runLabel}</small></div></div>
            <div className="chart-heading"><h3>学习曲线</h3><label className="check"><input type="checkbox" checked={cumulative} onChange={e => setCumulative(e.target.checked)} />显示累计收益</label></div><LearningChart runs={runs} phase={phase} game={config.game} cumulative={cumulative} />
            <h3>动作分布</h3><Distribution run={runs[0]} phase={phase} game={config.game} />
          </div>
          <div className="panel"><div className="section-heading"><h2>比较与导出</h2><div className="exports"><button disabled={!experiment} onClick={() => download('csv')}>↓ CSV</button><button disabled={!experiment} onClick={() => download('json')}>↓ JSON</button></div></div><ResultsTable rows={rows} /><p className="note">SD = 不同种子的阶段平均收益的样本标准差（分母 S−1）；仅一个种子时显示 0，不能据此推断稳定。对局不是独立种子样本。曲线最多 252 点 / 阶段，汇总使用全部对局。不同环境的原始收益不可直接比较。</p></div>
          <details className="panel"><summary>最近对局 · 同时行动记录</summary>{events.length ? <ol className="round-log">{events.map((e, i) => <li key={`${i}-${e.phase}-${e.round}`}>{PHASE_NAMES[e.phase]} #{e.round}：{game.actions[e.action]} vs {game.actions[e.opponentAction]} <strong>{e.reward > 0 ? '+' : ''}{e.reward}</strong></li>)}</ol> : <p>单局或连续演示时保留最近 12 回合，批量模式使用汇总视图。</p>}</details>
        </section>
      </div>
      <section id="guide" className="guide"><p className="eyebrow">READ THE EXPERIMENT, NOT JUST THE SCORE</p><h2>理解策略，也理解证据的边界。</h2><div className="guide-grid"><article><h3>01 / 规则与收益</h3><p>行是你的动作，列是对手动作。双方同时行动；对手获得相反收益。收益为正获胜，为负失败，为零平局。石头剪刀布的均匀混合均衡期望收益为 0；战术博弈均衡为 (1/6, 1/2, 1/3)。</p><div className="table-scroll"><table><caption>{game.name} · 原始收益矩阵</caption><thead><tr><th>你 / 对手</th>{game.actions.map(a => <th key={a}>{a}</th>)}</tr></thead><tbody>{game.matrix.map((row, i) => <tr key={i}><th>{game.actions[i]}</th>{row.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody></table></div></article>
        <article><h3>02 / 探索与利用</h3><p>随机策略始终均匀采样。ε-greedy 以 ε 概率探索，否则选择经验均值最大的动作，平手均匀。UCB1 先均匀访问未尝试动作，再以均值加置信奖励选动作，适合平稳随机收益。</p><p>EXP3 用混合概率 p 和重要性加权奖励 r/p 更新权重。所有学习奖励映射为 (r−min)/(max−min) ∈ [0,1]；γ 控制探索，学习率 γ/K。EXP3 面向有界、不可预知当前动作的对抗收益，不保证短期最佳。</p></article>
        <article><h3>03 / 冻结、测试与迁移</h3><p>训练结束后不再更新 Agent。ε-greedy / UCB1 使用经验均值的贪心混合，EXP3 使用归一化权重，随机策略保持均匀。独立测试使用全新随机流、空历史及从第 1 回合开始的对手时钟。</p><p>迁移实验以同一冻结策略分别测试原对手和新对手。种子为 base+i（32 位回绕）；各算法同种子配对，但响应型对手会因各自历史而不同。测试数据不参与选择最优参数。</p></article>
        <article><h3>04 / 避免过度解读</h3><p>对手切换前有 N 回合，切换发生于 N+1；每个阶段重新计时，短测试可能看不到切换。响应对手只读取你上一回合动作。非平稳环境会使累计均值和 UCB 假设失效。</p><p>少量种子可能误判算法优劣；SD 不是置信区间，相关对局不能视作独立样本。v0.1 不提供跨环境公平排名或自适应遗忘机制，也不宣称某个算法对所有对手最优。</p></article></div></section>
    </main><footer>MatchupLab / 陌生对手策略学习实验室 <span>计算在浏览器内完成 · 无需后端 · 不上传实验数据</span></footer>
  </>;
}

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DEFAULT_CONFIG, SCENARIOS } from './core/data';
import { calibrateExperiment, generateExperiment } from './core/experiment';
import { toCsv, toJson } from './core/export';
import type { Config, Evaluation, Experiment, Method, Scenario } from './core/types';
import './style.css';

const METHODS: Record<Method, string> = { platt: 'Platt Scaling', isotonic: 'Isotonic Regression' };
const format = (x: number | null) => x === null ? '无样本' : x.toFixed(5);
function delta(before: number | null, after: number | null): string {
  if (before === null || after === null) return '—';
  const d = after - before;
  return `${d >= 0 ? '+' : ''}${d.toFixed(5)}${d > 0 ? '（变差）' : d < 0 ? '（改善）' : '（持平）'}`;
}
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Reliability({ original, calibrated }: { original: Evaluation; calibrated?: Evaluation | null }) {
  const x = (p: number) => 58 + 450 * p;
  const y = (p: number) => 476 - 420 * p;
  const series = (evaluation: Evaluation, name: string, className: string) => <g className={className}>
    {evaluation.bins.filter(b => b.count > 0).map(b => <g key={b.index} data-testid={`${className}-bin`}>
      <line x1={x(b.meanProbability!)} x2={x(b.meanProbability!)} y1={y(b.interval![0])} y2={y(b.interval![1])} className="error-bar" />
      <circle cx={x(b.meanProbability!)} cy={y(b.eventRate!)} r="5"><title>{`${name} 箱${b.index + 1}，n=${b.count}，平均预测=${format(b.meanProbability)}，发生率=${format(b.eventRate)}，95% Wilson [${b.interval!.map(format).join(', ')}]`}</title></circle>
    </g>)}
  </g>;
  return <section className="panel chart-panel" aria-labelledby="chart-title">
    <div className="section-top"><h2 id="chart-title">可靠性图</h2><span>独立测试集 · 点估计与 95% 区间</span></div>
    <div className="legend"><span className="raw-key">● 原始预测</span><span className="cal-key">● 校准预测</span><span>┄ 理想校准 y = x</span></div>
    <svg viewBox="0 0 560 535" role="img" aria-label="可靠性图：平均预测概率与实际发生率">
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => <g key={t} className="grid">
        <line x1="58" x2="508" y1={y(t)} y2={y(t)} /><line x1={x(t)} x2={x(t)} y1="56" y2="476" />
        <text x="45" y={y(t) + 5} textAnchor="end">{t.toFixed(1)}</text><text x={x(t)} y="499" textAnchor="middle">{t.toFixed(1)}</text>
      </g>)}
      <line x1="58" y1="476" x2="508" y2="56" className="ideal" />
      {series(original, '原始', 'raw')}{calibrated && series(calibrated, '校准', 'cal')}
      <text x="283" y="526" textAnchor="middle" className="axis-label">平均预测概率</text>
      <text transform="translate(16 270) rotate(-90)" textAnchor="middle" className="axis-label">实际发生率</text>
    </svg>
    <p className="note">空箱不绘点。竖线为箱内发生率的逐箱 Wilson 区间，不是整个校准函数的置信带；有限样本波动和分箱会影响结论。</p>
  </section>;
}
function Metrics({ original, calibrated }: { original: Evaluation; calibrated?: Evaluation | null }) {
  const rows: [string, keyof Pick<Evaluation, 'brier' | 'logLoss' | 'ece' | 'meanProbability' | 'eventRate'>, boolean][] = [
    ['Brier Score ↓', 'brier', true], ['Log Loss ↓', 'logLoss', true], ['分箱校准误差 ECE ↓', 'ece', true], ['平均预测概率', 'meanProbability', false], ['实际发生率', 'eventRate', false],
  ];
  return <section className="panel" aria-labelledby="metrics-title"><h2 id="metrics-title">同一测试集 · 指标对照</h2>
    <p className="note">评分越低越好。平均概率相近不能证明校准良好；评分同时受校准与区分能力影响。</p>
    <div className="table-wrap"><table data-testid="metrics"><thead><tr><th>指标</th><th>原始</th><th>校准后</th><th>变化（后 − 前）</th></tr></thead><tbody>
      {rows.map(([label, key, scored]) => <tr key={key}><th>{label}</th><td>{format(original[key])}</td><td>{calibrated ? format(calibrated[key]) : '—'}</td><td className={scored && calibrated && calibrated[key]! > original[key]! ? 'worse' : ''}>{calibrated ? scored ? delta(original[key], calibrated[key]) : format(calibrated[key]! - original[key]!) : '—'}</td></tr>)}
    </tbody></table></div>
  </section>;
}
function BinTable({ evaluation }: { evaluation: Evaluation }) {
  return <div className="table-wrap"><table aria-label="分箱明细"><thead><tr><th>预测区间</th><th>n</th><th>平均预测</th><th>发生率</th><th>95% Wilson 区间</th></tr></thead><tbody>
    {evaluation.bins.map(b => <tr key={b.index}><td>[{b.lower.toFixed(3)}, {b.upper.toFixed(3)}{b.index === evaluation.bins.length - 1 ? ']' : ')'}</td><td>{b.count}{b.count > 0 && b.count < 30 ? ' · 小样本' : ''}</td><td>{format(b.meanProbability)}</td><td>{format(b.eventRate)}</td><td>{b.interval ? b.interval.map(format).join(' – ') : '空箱'}</td></tr>)}
  </tbody></table></div>;
}
function App() {
  const [draft, setDraft] = useState({ scenario: DEFAULT_CONFIG.scenario, sampleSize: String(DEFAULT_CONFIG.sampleSize), seed: String(DEFAULT_CONFIG.seed), binCount: String(DEFAULT_CONFIG.binCount) });
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [method, setMethod] = useState<Method>('platt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('等待运行');
  const change = (key: string, value: string) => { setDraft(d => ({ ...d, [key]: value })); setExperiment(null); setError(''); setStatus('参数已变更，请运行实验'); };
  const task = (action: () => Experiment, label: string) => {
    setBusy(true); setError(''); setStatus('正在计算…');
    setTimeout(() => {
      try { setExperiment(action()); setStatus(label); } catch (e) { setError(e instanceof Error ? e.message : '实验失败'); setExperiment(null); setStatus('运行失败'); }
      finally { setBusy(false); }
    }, 30);
  };
  const run = (regenerate = false) => {
    const seed = Number(draft.seed) + (regenerate ? 1 : 0);
    const config: Config = { scenario: draft.scenario as Scenario, seed, sampleSize: Number(draft.sampleSize), binCount: Number(draft.binCount) };
    if (regenerate && Number.isInteger(seed) && seed <= 0xffffffff) setDraft(d => ({ ...d, seed: String(seed) }));
    task(() => {
      if ([draft.seed, draft.sampleSize, draft.binCount].some(v => !v.trim())) throw new Error('请填写所有数值参数');
      return generateExperiment(config);
    }, '数据已生成，尚未拟合校准器');
  };
  const comparison = experiment?.calibrated?.[method];
  const after = comparison?.evaluation;
  return <main>
    <header><div className="eyebrow">LOCAL PROBABILITY WORKBENCH / v0.1</div><h1>Calibration<span>Lab</span></h1><p>概率说得有多准？让预测、事实与不确定性一起回答。</p><span className="badge">本地运行 · 无后端 · 无 API</span></header>
    <section className="panel controls" aria-labelledby="settings-title"><div className="section-top"><h2 id="settings-title">01 / 配置实验</h2><span>固定种子，可复现</span></div>
      <fieldset disabled={busy}><div className="fields">
        <label>实验类型<select value={draft.scenario} onChange={e => change('scenario', e.target.value)}>{Object.entries(SCENARIOS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>总样本量<input type="number" min="2" max="20000" step="1" value={draft.sampleSize} onChange={e => change('sampleSize', e.target.value)} /><small>2–20,000，约半数用于校准</small></label>
        <label>随机种子<input type="number" min="0" max="4294967295" step="1" value={draft.seed} onChange={e => change('seed', e.target.value)} /><small>0–4,294,967,295</small></label>
        <label>分箱数量<input type="number" min="2" max="30" step="1" value={draft.binCount} onChange={e => change('binCount', e.target.value)} /><small>2–30，等宽分箱</small></label>
      </div><div className="actions"><button className="primary" onClick={() => run()}>运行实验</button><button onClick={() => run(true)}>重新生成（种子 +1）</button><button onClick={() => { setDraft({ scenario: DEFAULT_CONFIG.scenario, sampleSize: '2000', seed: '2026', binCount: '10' }); setExperiment(null); setMethod('platt'); setError(''); setStatus('已重置'); }}>重置实验</button></div></fieldset>
      <p role="status" aria-live="polite">{status}</p>{error && <p role="alert" className="error">{error}</p>}
    </section>
    {!experiment ? <section className="panel empty"><h2>尚无实验数据</h2><p>选择参数后运行。合成实验用于学习，不代表真实模型结论。</p></section> : <>
      <section className="panel"><div className="section-top"><h2>02 / 独立拟合与比较</h2><span>{SCENARIOS[experiment.config.scenario]} · 种子 {experiment.config.seed}</span></div>
        <p data-testid="split">校准集 {experiment.dataset.calibration.length} 条 · 独立测试集 {experiment.dataset.test.length} 条</p>
        <p>只用校准集标签拟合；校准前后评分使用完全相同的测试样本。校准不保证改善测试评分。</p>
        <div className="actions"><button className="primary" disabled={busy} onClick={() => task(() => calibrateExperiment(experiment), '校准完成；请同时检查评分与不确定性')}>执行校准（两种方法）</button>
          <label>查看方法<select value={method} disabled={busy} onChange={e => setMethod(e.target.value as Method)}>{Object.entries(METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        {comparison && (comparison.fit.ok ? <><p className="fit-status">{METHODS[method]}：拟合成功</p>{comparison.fit.warnings.map(w => <p key={w} className="note">{w}</p>)}<details><summary>拟合参数</summary><pre>{JSON.stringify(comparison.fit.model, null, 2)}</pre></details></> : <p role="alert" className="error">{METHODS[method]}：{comparison.fit.reason}</p>)}
      </section>
      <div className="results-grid"><Reliability original={experiment.original} calibrated={after} /><div><Metrics original={experiment.original} calibrated={after} />
      <section className="panel"><h2>03 / 保存实验</h2><p>导出基于当前结果快照，包含种子、数据划分与方法状态。</p><div className="actions"><button disabled={busy} onClick={() => download(toCsv(experiment), 'calibrationlab.csv', 'text/csv;charset=utf-8')}>下载 CSV</button><button disabled={busy} onClick={() => download(toJson(experiment), 'calibrationlab.json', 'application/json')}>下载 JSON</button></div></section></div></div>
      <section className="panel"><h2>分箱明细 · {after ? METHODS[method] : '原始预测'}</h2><p className="note">区间左闭右开，最后一箱包含 1。小于 30 条标记小样本；所有箱均报告区间。JSON 保留未舍入边界，界面边界四舍五入。</p><BinTable evaluation={after ?? experiment.original} />
        {after && <details><summary>原始预测分箱明细</summary><BinTable evaluation={experiment.original} /></details>}</section>
    </>}
    <section className="panel methods"><h2>读懂这个实验</h2><div className="explain-grid"><article><h3>生成机制</h3><p>真实概率 q = 0.05 + 0.9U，U 均匀分布；标签 y ∼ Bernoulli(q)。预测 p = sigmoid(a · logit(q))。</p><p>理想 a=1；过度自信 a=2；欠自信 a=0.5；缺乏区分能力 a=0，恒报 0.5。后三者不通过添加噪声制造结论。</p></article><article><h3>校准方法</h3><p>Platt：对裁剪后的预测 logit 拟合带平滑目标的逻辑回归，阻尼 Newton 优化；轻微 L2 稳定参数。保序回归：同分数先合并，PAVA 求非递减最小二乘，线性插值、端点常量外推。</p><p>校准集至少 20 条、每类至少 2 条且预测非常量；不满足则拒绝拟合。</p></article><article><h3>评分与解释</h3><p>Brier = 平均 (p−y)²；Log Loss = −平均 ln(观测类别概率)，下限 10⁻¹⁵；ECE = Σ 箱占比 × |箱均值−发生率|。</p><p>校准是频率一致性；区分能力是将事件排序的能力。恒报 0.5 可以总体校准却不能区分个体。单个指标不能代表全部预测质量。</p></article><article><h3>不确定性与边界</h3><p>有限样本会波动；分箱粗细会隐藏或放大偏差。Wilson 95% 区间是逐箱近似，不控制多箱同时覆盖率。改进训练评分不保证改进独立测试评分。</p><p>最多 20,000 样本、30 箱；内存中运行，刷新不保留数据。下载 JSON 后用相同版本与参数重跑可复现。</p></article></div></section>
    <footer>CalibrationLab · 合成概率实验 / 不作真实模型结论 / 不部署</footer>
  </main>;
}
createRoot(document.getElementById('app')!).render(<React.StrictMode><App /></React.StrictMode>);

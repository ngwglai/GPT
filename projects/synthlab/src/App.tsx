import { useEffect, useRef, useState } from 'react';
import { lessons, preset } from './core/cases';
import { exportExperiment, importExperiment, NAMES, parseConfig } from './core/config';
import type { Budget, Config, Name } from './core/config';
import { format, OPS } from './core/dsl';
import { emptySnapshot } from './core/engine';
import type { Result, Snapshot } from './core/engine';
import { WorkerClient } from './worker-client';
const labels = { verified: '有限域验证通过', 'no-solution': '有界范围无解', 'budget-exhausted': '资源预算耗尽', cancelled: '已取消', 'invalid-input': '非法输入', 'internal-error': '内部异常', 'worker-error': 'Worker 故障' };
const budgetLabels: Record<keyof Budget, string> = { maxNodes: 'AST 节点上限', maxCandidates: '总候选预算', maxStored: '每轮代表上限', timeMs: '总时间预算（毫秒）', maxIterations: 'CEGIS 迭代上限', verifyLimit: '每轮验证数量上限' };
export function App() {
  const initial = preset('Max2');
  const [c, setC] = useState<Config>(initial);
  const [name, setName] = useState<Name>('Max2');
  const [examples, setExamples] = useState(JSON.stringify(initial.examples, null, 2));
  const [constants, setConstants] = useState(JSON.stringify(initial.constants));
  const [specAst, setSpecAst] = useState('{"op":"var","index":0}');
  const [json, setJson] = useState(''); const [error, setError] = useState('');
  const [running, setRunning] = useState(false); const [result, setResult] = useState<Result>();
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot());
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const client = useRef<WorkerClient | undefined>(undefined);
  useEffect(() => () => client.current?.dispose(), []);
  function invalidate() {
    client.current?.dispose(); client.current = undefined; setRunning(false); setResult(undefined); setSnapshot(emptySnapshot()); setError('');
  }
  function edit(next: Config) { invalidate(); setC(next); }
  function load(next: Config) {
    edit(next); setExamples(JSON.stringify(next.examples, null, 2)); setConstants(JSON.stringify(next.constants));
    if (next.spec.kind === 'expression') setSpecAst(JSON.stringify(next.spec.ast, null, 2));
  }
  function current(): Config {
    return parseConfig({ ...c, examples: JSON.parse(examples), constants: JSON.parse(constants), spec: c.spec.kind === 'expression' ? { kind: 'expression', ast: JSON.parse(specAst) } : c.spec });
  }
  function start() {
    invalidate();
    try {
      const config = current(); setRunning(true);
      client.current = new WorkerClient(config, setSnapshot, r => { setResult(r); setSnapshot(r); setRunning(false); });
    } catch (e) { setError(e instanceof Error ? e.message : '配置非法'); }
  }
  function importText(text: string) {
    invalidate();
    try { load(importExperiment(text)); setJson(text); } catch (e) { setError(e instanceof Error ? e.message : '导入失败'); }
  }
  function download() {
    try {
      const text = exportExperiment(current(), result ?? null); setJson(text);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'synthlab-experiment.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : '导出失败'); }
  }
  const view = snapshot;
  return <div className={dark ? 'app dark' : 'app'}>
    <header><div><p className="eyebrow">PROGRAM SYNTHESIS LABORATORY / v0.1</p><h1>SynthLab <span>程序合成实验室</span></h1><p>让程序从样例中生长，用真实反例修正猜想。</p></div><button onClick={() => setDark(!dark)} aria-label="切换主题">{dark ? '浅色主题' : '深色主题'}</button></header>
    <main><aside>
      <section><h2>01 / 实验配置</h2><label>内置案例<select value={name} onChange={e => { const n = e.target.value as Name; setName(n); load(preset(n)); }}>{NAMES.map(n => <option key={n}>{n}</option>)}</select></label><p className="note">{lessons[name]}</p>
        <label>目标规格<select value={c.spec.kind === 'builtin' ? c.spec.name : 'expression'} onChange={e => edit({ ...c, spec: e.target.value === 'expression' ? { kind: 'expression', ast: { op: 'var', index: 0 } } : { kind: 'builtin', name: e.target.value as Name } })}>{NAMES.map(n => <option key={n}>{n}</option>)}<option value="expression">受限 AST 表达式</option></select></label>
        {c.spec.kind === 'expression' && <label>规格 AST<textarea value={specAst} onChange={e => { invalidate(); setSpecAst(e.target.value); }}/></label>}
        <label>变量数量<select value={c.variables} onChange={e => edit({ ...c, variables: Number(e.target.value) })}><option value="1">1（x）</option><option value="2">2（x, y）</option></select></label>
        <label>输入输出样例<textarea aria-label="输入输出样例" rows={7} value={examples} onChange={e => { invalidate(); setExamples(e.target.value); }}/></label>
        <label>整数常量（JSON 数组）<input value={constants} onChange={e => { invalidate(); setConstants(e.target.value); }}/></label>
        <fieldset><legend>DSL 运算符</legend><div className="operators">{OPS.map(op => <label key={op}><input type="checkbox" checked={c.operators.includes(op)} onChange={e => edit({ ...c, operators: e.target.checked ? [...c.operators, op] : c.operators.filter(v => v !== op) })}/>{op}</label>)}</div></fieldset>
        <div className="fields">{(Object.keys(budgetLabels) as (keyof Budget)[]).map(k => <label key={k}>{budgetLabels[k]}<input type="number" value={c.budget[k]} onChange={e => edit({ ...c, budget: { ...c.budget, [k]: Number(e.target.value) } })}/></label>)}</div>
        <fieldset><legend>验证域（各变量的整数区间）</legend><div className="fields"><label>域下界<input type="number" value={c.domain.min} onChange={e => edit({ ...c, domain: { ...c.domain, min: Number(e.target.value) } })}/></label><label>域上界<input type="number" value={c.domain.max} onChange={e => edit({ ...c, domain: { ...c.domain, max: Number(e.target.value) } })}/></label></div></fieldset>
        <div className="actions"><button className="primary" disabled={running} onClick={start}>开始合成</button><button disabled={!running} onClick={() => client.current?.cancel()}>取消</button><button onClick={() => load(preset(name))}>重置</button></div>
        <p className="note">全部计算在本地 Worker 中运行。更改配置会清除旧结论。</p>
      </section>
      <section><h2>JSON / 实验交换</h2><label>实验 JSON<textarea aria-label="实验 JSON" rows={4} value={json} onChange={e => { invalidate(); setJson(e.target.value); }}/></label><div className="actions"><button onClick={() => importText(json)}>导入 JSON</button><button onClick={download}>导出 JSON</button></div><label className="file">导入文件<input type="file" accept=".json,application/json" onChange={async e => { invalidate(); const f = e.target.files?.[0]; if (!f) return; if (f.size > 131072) { setError('JSON 超过 128 KiB'); return; } try { importText(await f.text()); } catch { setError('文件读取失败'); } }}/></label><p className="note">导入只恢复配置；导出中的历史结果不会被当作有效结论。</p></section>
    </aside><article>
      {error && <div role="alert" className="alert">{error}</div>}
      <section className="candidate"><div className="section-top"><h2>02 / 当前候选程序</h2><span className={`badge ${result?.status === 'verified' ? 'pass' : ''}`} role="status">{running ? 'Worker 搜索中' : result ? labels[result.status] : '等待实验'}</span></div><pre data-testid="candidate">{view.candidate ? format(view.candidate) : '从一个样例开始，寻找一个程序。'}</pre><p>{result?.message ?? '按节点数递增枚举，保留每种类型与观察签名的最小代表。'}</p>{view.candidate && <details><summary>真实 AST</summary><pre>{JSON.stringify(view.candidate, null, 2)}</pre></details>}</section>
      <section><h2>03 / 实时搜索统计</h2><div className="metrics">{[['当前节点层', view.stats.depth], ['已完成节点层', view.stats.completedSize], ['生成候选', view.stats.generated], ['保留代表（累计）', view.stats.retained], ['结构剪枝', view.stats.structural], ['观察等价剪枝', view.stats.semantic], ['错误值观察（保留签名）', view.stats.errorValues], ['耗时 ms', Math.round(view.stats.elapsedMs)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{Number(value).toLocaleString('zh-CN')}</strong></div>)}</div></section>
      <section><h2>04 / CEGIS 迭代与验证</h2><p className="note">每轮重新枚举；最短性仅针对当前样例、当前语法与节点成本。有限域验证不构成数学证明。</p>{view.iterations.length === 0 && <p>候选出现后，将按字典序验证每个有限域输入。</p>}{view.iterations.map(it => <div className="iteration" key={it.round}><div className="section-top"><strong>第 {it.round} 轮 · {it.size} 节点</strong><span>{it.minimal ? '当前样例下最短' : '未确定最短性'}</span></div><code>{it.expression}</code><p>训练样例：{it.examples.length} 条 · 验证 [{it.verification.domain.min}, {it.verification.domain.max}]^{c.variables}：{it.verification.checked} / {it.verification.total} 个输入 · {it.verification.complete ? '完整通过（仅有限域）' : it.verification.counterexample ? '发现反例，提前停止' : '验证未完成'}</p>{it.verification.counterexample && <p className="ce">真实反例：{JSON.stringify(it.verification.counterexample.input)} → 规格 {it.verification.counterexample.output}，候选 {it.verification.actual === null ? '溢出错误' : String(it.verification.actual)}</p>}</div>)}</section>
      <section><h2>05 / 搜索轨迹</h2><p className="note">最多保留最近 128 条引擎事件，已省略 {view.traceDropped} 条。</p><ol className="trace">{view.trace.map((t, i) => <li key={i}><span>轮 {t.round} / 层 {t.depth}</span><b>{t.event}</b><small>候选 {t.generated}{t.expression ? ` · ${t.expression}` : ''}</small></li>)}</ol></section>
    </article></main><footer>本地计算 · 无 API · 确定性枚举 · 有限域结论</footer>
  </div>;
}

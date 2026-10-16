import { useEffect, useMemo, useReducer, useState } from 'react';
import { isWellFormedUnicode } from '../algorithms/common';
import { BWT_LIMIT } from '../algorithms/bwt';
import { datasets, experiments, INPUT_LIMIT, prepareLab } from '../simulation/lab';
import type { Experiment, Lab, TokenAlgorithm } from '../simulation/lab';
import { initialPlayback, playbackReducer } from '../simulation/playback';
import { ExperimentView } from './experiments';
import { Panel, format } from './visuals';

function initialTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem('compressionlab-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch { /* Storage is optional. */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function ComparisonPanel({ lab }: { lab: Lab }) {
  const original = lab.entropy.bytes * 8;
  return <Panel title="综合比较 / 完整输入的最终结果预览" className="comparison">
    <div className="metrics">
      <div><span>原始大小 · UTF-8</span><strong>{original}<small> bit</small></strong><small>{lab.entropy.bytes} bytes / {lab.entropy.symbols} 符号</small></div>
      <div><span>Shannon entropy · H₀</span><strong>{format(lab.entropy.entropy)}<small> bit/符号</small></strong><small>{lab.entropy.frequencies.length} 种不同符号</small></div>
      <div><span>理论下界 · N × H₀</span><strong>{format(lab.entropy.lowerBoundBits)}<small> bit</small></strong><small>平均编码长度下界 {format(lab.entropy.entropy)} bit/符号</small></div>
    </div>
    <div className="table-scroll"><table>
      <caption>压缩率 = 输出 / 原始；低于 100% 表示缩小。空输入无比率。</caption>
      <thead><tr><th>算法</th><th>输出大小</th><th>另需元数据</th><th>压缩率（载荷）</th><th>含元数据</th><th>平均码长</th><th>计量方式</th></tr></thead>
      <tbody>{lab.comparisons.map(row => <tr key={row.name}>
        <th>{row.name}</th><td>{row.bits} bit</td><td>{row.metadataBits} bit</td>
        <td>{original ? `${format(row.bits / original * 100, 1)}%` : '—'}</td>
        <td>{original ? `${format((row.bits + row.metadataBits) / original * 100, 1)}%` : '—'}</td>
        <td>{row.average === null ? '—' : `${format(row.average)} bit/符号`}</td><td>{row.note}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="annotation">这是教学表示的比较，不是 ZIP 等文件格式的基准。H₀ 是独立符号模型的极限，不是所有压缩器的普遍下界。Huffman bit 字符串的 JavaScript 内存占用不等于逻辑 bit 数。</p>
    {!lab.transformed && <p>BWT/MTF 超过 {BWT_LIMIT} 符号时不计算，其余算法仍可比较。</p>}
  </Panel>;
}

function Session({ lab, experiment, tokenAlgorithm, windowSize, lookaheadSize, setWindowSize, setLookaheadSize }: {
  lab: Lab; experiment: Experiment; tokenAlgorithm: TokenAlgorithm;
  windowSize: number; lookaheadSize: number;
  setWindowSize: (value: number) => void; setLookaheadSize: (value: number) => void;
}) {
  const [playback, dispatch] = useReducer(playbackReducer, initialPlayback);
  const [delay, setDelay] = useState(350);
  const length = experiment === 'Information Entropy' ? lab.entropyTrace.length
    : experiment === 'Huffman Coding' ? lab.huffman.trace.length
    : experiment === 'RLE + LZ77' ? (tokenAlgorithm === 'RLE' ? lab.rle.trace.length : lab.lz77.trace.length)
    : lab.bwtTrace.length;
  const blocked = experiment === 'BWT + Move-to-Front' && !lab.transformed;
  const last = length - 1;
  const done = playback.index >= last;
  useEffect(() => {
    if (!playback.playing || blocked) return;
    const timer = window.setInterval(() => dispatch({ type: 'tick', last }), delay);
    return () => window.clearInterval(timer);
  }, [playback.playing, last, delay, blocked]);
  return <>
    {experiment === 'RLE + LZ77' && tokenAlgorithm === 'LZ77' && <div className="parameters">
      <label>窗口大小 <select aria-label="窗口大小" value={windowSize} onChange={event => setWindowSize(Number(event.target.value))}>
        {[4, 8, 16, 32, 64].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Lookahead 大小 <select aria-label="Lookahead 大小" value={lookaheadSize} onChange={event => setLookaheadSize(Number(event.target.value))}>
        {[2, 4, 8, 16, 32].map(value => <option key={value}>{value}</option>)}
      </select></label><span>修改参数会暂停并重置轨迹。</span>
    </div>}
    {experiment === 'BWT + Move-to-Front' && <p className="limit-note">BWT 最多 {BWT_LIMIT} 个 Unicode 符号：循环旋转矩阵占 O(n²) 空间，限制用于保持教学视图可响应。</p>}
    <div className="transport">
      <div className="transport-buttons">
        <button className="primary" disabled={done || blocked} onClick={() => dispatch({ type: playback.playing ? 'pause' : 'play', last })}>{playback.playing ? '暂停' : '自动运行'}</button>
        <button disabled={done || blocked} onClick={() => dispatch({ type: 'step', last })}>单步</button>
        <button onClick={() => dispatch({ type: 'reset' })}>重置</button>
      </div>
      <label>步进间隔 <select aria-label="步进间隔" value={delay} onChange={event => setDelay(Number(event.target.value))}>
        <option value={100}>0.1 秒</option><option value={350}>0.35 秒</option><option value={700}>0.7 秒</option>
      </select></label>
      <span className="status" role="status" data-testid="playback-status">{blocked ? '输入超限' : `步骤 ${playback.index} / ${last} · ${done ? '完成' : playback.playing ? '运行中' : '已暂停'}`}</span>
    </div>
    <progress aria-label="实验进度" max={Math.max(1, last)} value={playback.index} />
    {blocked ? <Panel title="请缩短输入"><p role="alert">当前 {lab.symbols.length} 个符号，BWT 上限为 {BWT_LIMIT}。请编辑输入或选择内置数据集，数据不会被静默截断。</p></Panel>
      : <ExperimentView lab={lab} experiment={experiment} tokenAlgorithm={tokenAlgorithm} index={playback.index} />}
  </>;
}

export default function App() {
  const [input, setInput] = useState(datasets['English-like text']);
  const [experiment, setExperiment] = useState<Experiment>('Information Entropy');
  const [tokenAlgorithm, setTokenAlgorithm] = useState<TokenAlgorithm>('RLE');
  const [theme, setTheme] = useState(initialTheme);
  const [windowSize, setWindowSize] = useState(16);
  const [lookaheadSize, setLookaheadSize] = useState(8);
  const count = Array.from(input).length;
  const validUnicode = isWellFormedUnicode(input);
  const lab = useMemo(() => validUnicode && count <= INPUT_LIMIT ? prepareLab(input, windowSize, lookaheadSize) : null,
    [input, count, validUnicode, windowSize, lookaheadSize]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('compressionlab-theme', theme); } catch { /* Optional preference only. */ }
  }, [theme]);
  return <>
    <a className="skip-link" href="#experiment">跳转到实验</a>
    <header className="site-header">
      <a className="brand" href="./"><span className="brand-mark" aria-hidden="true">C<span>≋</span></span>CompressionLab<small>v0.1</small></a>
      <div className="header-actions"><span className="local-badge"><i />纯本地计算</span>
        <button aria-label="切换主题" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ 浅色' : '☾ 深色'}</button>
      </div>
    </header>
    <main>
      <section className="intro"><p className="eyebrow">DATA / REDUNDANCY / INFORMATION</p>
        <h1>让每一个 bit，<br /><em>都有迹可循。</em></h1>
        <p>从字符分布到编码树，从重复片段到可逆变换。<br />输入一段数据，逐步观察压缩算法内部发生了什么。</p>
        <div className="intro-stamp" aria-hidden="true"><span>010</span><span>101</span><span>001</span><b>LESS DATA.<br />MORE INSIGHT.</b></div>
      </section>
      <Panel title="输入工作台" className="input-panel">
        <div className="input-top"><label htmlFor="source">实验文本</label><label>内置数据集 <select aria-label="内置数据集" value="" onChange={event => { if (event.target.value) setInput(datasets[event.target.value]); }}>
          <option value="" disabled>选择测试数据…</option>{Object.keys(datasets).map(name => <option key={name}>{name}</option>)}
        </select></label></div>
        <textarea id="source" value={input} spellCheck={false} onChange={event => setInput(event.target.value)} aria-describedby="input-help" />
        <div className="input-footer"><span id="input-help">{count} / {INPUT_LIMIT} Unicode 符号 · 不上传、不保存输入 · 修改输入会重置实验</span><button onClick={() => setInput('')}>清空输入</button></div>
        {!validUnicode && <p role="alert">输入含孤立的 UTF-16 surrogate，请使用有效 Unicode 文本（支持中文、emoji 和组合字符）。</p>}
        {count > INPUT_LIMIT && <p role="alert">输入超过 {INPUT_LIMIT} 个符号。真实 trace 会保留中间状态，请缩短文本以控制内存和主线程计算量。</p>}
      </Panel>
      <section id="experiment" aria-label="算法实验">
        <nav className="experiment-tabs" aria-label="选择实验">{experiments.map((name, i) => <button key={name} aria-pressed={experiment === name} onClick={() => setExperiment(name)}><span>0{i + 1}</span>{name}</button>)}</nav>
        <div className="experiment-heading"><div><p className="eyebrow">EXPERIMENT 0{experiments.indexOf(experiment) + 1}</p><h2>{experiment}</h2></div>
          {experiment === 'RLE + LZ77' && <div className="segmented" aria-label="选择重复编码算法">{(['RLE', 'LZ77'] as const).map(name => <button key={name} aria-pressed={tokenAlgorithm === name} onClick={() => setTokenAlgorithm(name)}>{name}</button>)}</div>}
        </div>
        {lab && <Session key={JSON.stringify([input, experiment, tokenAlgorithm, windowSize, lookaheadSize])}
          lab={lab} experiment={experiment} tokenAlgorithm={tokenAlgorithm}
          windowSize={windowSize} lookaheadSize={lookaheadSize} setWindowSize={setWindowSize} setLookaheadSize={setLookaheadSize} />}
      </section>
      {lab && <ComparisonPanel lab={lab} />}
      <footer><span>CompressionLab / A local compression playground</span><span>Unicode code points · UTF-8 计量 · 无外部请求</span></footer>
    </main>
  </>;
}

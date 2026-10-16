import type { Lab, Experiment, TokenAlgorithm } from '../simulation/lab';
import { isPrefixFree } from '../algorithms/huffman';
import { Panel, FrequencyView, SymbolStrip, HuffmanTree, displaySymbol, format } from './visuals';

export function ExperimentView({ lab, experiment, tokenAlgorithm, index }: {
  lab: Lab; experiment: Experiment; tokenAlgorithm: TokenAlgorithm; index: number;
}) {
  if (experiment === 'Information Entropy') {
    const state = lab.entropyTrace[index];
    return <div className="experiment-grid">
      <Panel title="01 / 扫描符号"><SymbolStrip symbols={lab.symbols} position={index - 1} />
        <p className="annotation">扫描 {index}/{lab.symbols.length} · 当前 H = {format(state.entropy)} bit/符号</p>
        <p>H(X) = −Σ p(x) log₂ p(x)。分布越均匀，单符号的不确定性越高。</p>
        <p>单符号数据的熵为 0；频率模型不考虑字符之间的顺序，所以周期文本也可能有较高的零阶熵。</p>
      </Panel>
      <Panel title="02 / 经验分布"><FrequencyView analysis={state} /></Panel>
    </div>;
  }
  if (experiment === 'Huffman Coding') {
    const state = lab.huffman.trace[index];
    const done = index === lab.huffman.trace.length - 1;
    return <>
      <div className="experiment-grid">
        <Panel title="01 / 优先队列与合并">
          <p>按权重、最小 code point、节点 ID 排序。每一步取出两个最轻节点。</p>
          <div className="node-queue">{state.queue.map(node => <span className="queue-node" key={node.id}>
            <small>#{node.id} {node.symbol === undefined ? '内部节点' : displaySymbol(node.symbol)}</small><b>{node.weight}</b>
          </span>)}</div>
          <p className="annotation">{state.merged
            ? `合并 #${state.merged[0].id} (${state.merged[0].weight}) + #${state.merged[1].id} (${state.merged[1].weight}) → #${state.parent!.id} (${state.parent!.weight})`
            : '初始频率队列；尚未合并'}</p>
          <FrequencyView analysis={lab.entropy} />
        </Panel>
        <Panel title={done ? '02 / 最终 Huffman Tree' : '02 / 当前合并子树'}>
          <HuffmanTree root={done ? lab.huffman.root : state.parent} />
          <p className="annotation">分支 0 / 1 来自实际合并树。滚动可查看大树。</p>
        </Panel>
      </div>
      <Panel title="03 / 编码表与 bit stream">
        {done ? <>
          <p className="success">Prefix-free：{isPrefixFree(lab.huffman.codes) ? '通过' : '失败'} · 解码回环：{lab.verified.huffman ? '通过' : '失败'}</p>
          <div className="codebook">{lab.entropy.frequencies.map(row => <div key={row.symbol}>
            <code>{displaySymbol(row.symbol)}</code><span>×{row.count}</span><b>{lab.huffman.codes.get(row.symbol)}</b>
          </div>)}</div>
          <pre aria-label="Huffman bit stream">{lab.huffman.bits || '∅'}</pre>
          <p>UTF-8 原始 {lab.entropy.bytes * 8} bit → 编码载荷 {lab.huffman.bits.length} bit；平均码长 {format(lab.huffman.averageLength)} bit/符号。</p>
          <p>编码效率 H/L = {lab.huffman.averageLength ? `${format(lab.entropy.entropy / lab.huffman.averageLength * 100, 2)}%` : '—'}。单符号使用编码 0，需要每符号 1 bit。</p>
        </> : <p className="empty">合并完成后生成编码表和真实 bit stream。可用单步或自动运行推进。</p>}
      </Panel>
    </>;
  }
  if (experiment === 'RLE + LZ77' && tokenAlgorithm === 'RLE') {
    const state = lab.rle.trace[index];
    return <div className="experiment-grid">
      <Panel title="01 / 扫描与当前 run">
        <SymbolStrip symbols={lab.symbols} position={state.position} />
        <p className="annotation">扫描位置 {state.position < 0 ? '未开始' : state.position >= lab.symbols.length ? '结束' : state.position} · 当前 run：{state.run ? `${displaySymbol(state.run.symbol)} × ${state.run.count}` : '∅'}</p>
        <p>相邻相同符号合并为 (symbol, count)，字符改变或输入结束时输出 token。</p>
      </Panel>
      <Panel title="02 / 已生成 token">
        <pre data-testid="rle-tokens">{JSON.stringify(state.emitted, null, 2)}</pre>
        <p>原始 {lab.symbols.length} 个符号 · 当前 {state.emitted.length} 个 token · 最终 {lab.rle.tokens.length} 个 token</p>
        <p className="success">完整结果 encode → decode 回环：{lab.verified.rle ? '通过' : '失败'}</p>
        <p className="annotation">编码长度使用 UTF-8 JSON 实测，标点、字段名和数字也占空间；短串可能膨胀。</p>
      </Panel>
    </div>;
  }
  if (experiment === 'RLE + LZ77') {
    const state = lab.lz77.trace[index];
    return <div className="experiment-grid">
      <Panel title="01 / Sliding window 与当前匹配">
        <SymbolStrip symbols={lab.symbols} position={state.position} windowStart={state.windowStart}
          matchStart={state.token?.length ? state.position - state.token.distance : -1} matchLength={state.token?.length ?? 0} />
        <p className="annotation">位置 {state.position} · 窗口起点 {state.windowStart} · 青色边框 = 窗口，金色 = 匹配源，实色 = 当前位置</p>
        <p>Sliding window</p><pre>{state.window.join('') || '∅'}</pre>
        <p>Lookahead buffer</p><pre>{state.lookahead.join('') || '∅'}</pre>
        <p>当前匹配：{state.token ? `distance=${state.token.distance}, length=${state.token.length}` : state.position === 0 ? '等待扫描' : '结束'}</p>
        <p>最长匹配相同时取最近来源；允许边解码边复制的重叠匹配。next=null 表示匹配恰好抵达末尾。</p>
      </Panel>
      <Panel title="02 / (distance, length, next)">
        <p className="annotation">当前 token 包含在下方输出中；下一步将移动窗口。</p>
        <pre data-testid="lz-tokens">{state.tokens.map(token => `(${token.distance}, ${token.length}, ${token.next === null ? 'null' : JSON.stringify(token.next)})`).join('\n') || '∅'}</pre>
        <p>已输出 {state.tokens.length} / {lab.lz77.tokens.length} 个 token</p>
        <p className="success">完整结果 encode → decode 回环：{lab.verified.lz77 ? '通过' : '失败'}</p>
      </Panel>
    </div>;
  }
  const result = lab.transformed;
  const mtf = lab.mtf;
  if (!result || !mtf) return null;
  const state = lab.bwtTrace[index];
  const sorted = state.phase !== 'rotate';
  const rows = sorted ? result.sorted : result.rotations.slice(0, state.visible);
  const showLast = state.phase === 'last' || state.phase === 'mtf';
  const mtfState = state.phase === 'mtf' ? mtf.trace[state.visible] : null;
  return <div className="experiment-grid">
    <Panel title={sorted ? '01 / 排序后的循环旋转矩阵' : '01 / 生成循环旋转'}>
      <p>阶段：{({ rotate: '循环旋转', sort: '按 code point 排序', last: '提取 Last Column', mtf: 'Move-to-Front' })[state.phase]}</p>
      <div className="matrix-scroll"><table className="matrix"><thead><tr><th>起点</th><th>旋转行（␣ 为空格）</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.start} className={sorted && row.start === 0 ? 'primary-row' : ''}>
          <td>{row.start}</td><td>{row.symbols.map((symbol, i) => <span key={i} className={showLast && i === row.symbols.length - 1 ? 'last-column' : ''}>{displaySymbol(symbol)}</span>)}</td>
        </tr>)}</tbody></table></div>
      {showLast && <><p>Primary index：<b>{result.primaryIndex}</b>（排序后原始行的 0-based 索引）</p>
        <p>Last Column</p><pre data-testid="last-column">{result.lastColumn || '∅'}</pre>
        <p className="success">inverse BWT 回环：{lab.verified.bwt ? '通过' : '失败'}</p></>}
    </Panel>
    <Panel title="02 / Move-to-Front">
      <p>按 code point 排序的初始 alphabet：</p><pre>{mtf.initialAlphabet.map(displaySymbol).join(' · ') || '∅'}</pre>
      {mtfState ? <>
        <p className="annotation">当前 symbol：{mtfState.symbol === null ? '∅' : displaySymbol(mtfState.symbol)} · index：{mtfState.index ?? '∅'}</p>
        <p>更新后的 alphabet</p><pre data-testid="mtf-alphabet">{mtfState.alphabet.map(displaySymbol).join(' · ') || '∅'}</pre>
        <p>输出序列</p><pre data-testid="mtf-output">{mtfState.output.join(', ') || '∅'}</pre>
        <p className="success">inverse MTF → inverse BWT 回环：{lab.verified.mtf ? '通过' : '失败'}</p>
      </> : <p className="empty">先完成 BWT，再逐符号把当前字符移到 alphabet 首位。</p>}
      <p>BWT 重排字符以聚拢相同上下文；MTF 将局部重复变成小索引。两者均为可逆变换，还需要后续编码才可能压缩。</p>
    </Panel>
  </div>;
}

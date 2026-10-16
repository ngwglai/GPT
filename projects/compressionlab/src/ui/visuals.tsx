import type { ReactNode } from 'react';
import type { EntropyResult, HuffmanNode } from '../models/types';

export const displaySymbol = (symbol: string): string => {
  if (symbol === ' ') return '␣';
  if (symbol === '\n') return '↵';
  if (symbol === '\t') return '⇥';
  if (/\p{C}/u.test(symbol)) return `U+${symbol.codePointAt(0)!.toString(16).toUpperCase()}`;
  return symbol;
};
export const format = (value: number, digits = 3) => value.toLocaleString('zh-CN', { maximumFractionDigits: digits });

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><h3>{title}</h3>{children}</section>;
}

export function FrequencyView({ analysis }: { analysis: EntropyResult }) {
  const maximum = Math.max(1, ...analysis.frequencies.map(row => row.count));
  return <div className="table-scroll frequency"><table>
    <caption>字符频率与概率 · 已扫描 {analysis.symbols} 个符号</caption>
    <thead><tr><th>符号</th><th>频率</th><th>概率</th><th>分布</th></tr></thead>
    <tbody>{analysis.frequencies.map(row => <tr key={row.symbol}>
      <td><code title={`U+${row.symbol.codePointAt(0)!.toString(16).toUpperCase()}`}>{displaySymbol(row.symbol)}</code></td>
      <td>{row.count}</td><td>{format(row.probability * 100, 2)}%</td>
      <td><span className="bar-track"><span className="bar" style={{ width: `${row.count / maximum * 100}%` }} /></span></td>
    </tr>)}</tbody>
  </table>{!analysis.symbols && <p className="empty">暂无符号，熵定义为 0。</p>}</div>;
}

export function SymbolStrip({ symbols, position = -1, matchStart = -1, matchLength = 0, windowStart = -1 }: {
  symbols: string[]; position?: number; matchStart?: number; matchLength?: number; windowStart?: number;
}) {
  return <div className="symbol-strip" aria-label="输入符号扫描状态">{symbols.map((symbol, index) =>
    <span key={index} title={`位置 ${index}`} className={[
      'symbol', index === position ? 'current' : '',
      index >= matchStart && index < matchStart + matchLength ? 'matched' : '',
      windowStart >= 0 && index >= windowStart && index < position ? 'in-window' : '',
    ].join(' ')}><small>{index}</small>{displaySymbol(symbol)}</span>,
  )}{symbols.length === 0 && <p className="empty">空输入</p>}</div>;
}

export function HuffmanTree({ root }: { root: HuffmanNode | null }) {
  if (!root) return <p className="empty">空树</p>;
  const positions = new Map<number, { x: number; y: number }>();
  const nodes: HuffmanNode[] = [];
  const edges: { from: HuffmanNode; to: HuffmanNode; bit: string }[] = [];
  let leaf = 0;
  let depth = 0;
  function layout(node: HuffmanNode, level: number): number {
    nodes.push(node);
    depth = Math.max(depth, level);
    let x: number;
    if (node.left && node.right) {
      x = (layout(node.left, level + 1) + layout(node.right, level + 1)) / 2;
      edges.push({ from: node, to: node.left, bit: '0' }, { from: node, to: node.right, bit: '1' });
    } else x = 45 + leaf++ * 80;
    positions.set(node.id, { x, y: 40 + level * 85 });
    return x;
  }
  layout(root, 0);
  const width = Math.max(220, leaf * 80 + 10);
  const height = depth * 85 + 85;
  return <div className="tree-scroll"><svg role="img" aria-label="当前真实 Huffman Tree" width={width} height={height}>
    <title>Huffman Tree：左分支 0，右分支 1</title>
    {edges.map(({ from, to, bit }) => {
      const a = positions.get(from.id)!;
      const b = positions.get(to.id)!;
      return <g key={to.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <text x={(a.x + b.x) / 2 + 9} y={(a.y + b.y) / 2}>{bit}</text></g>;
    })}
    {nodes.map(node => {
      const { x, y } = positions.get(node.id)!;
      return <g key={node.id}><circle cx={x} cy={y} r={23} />
        <text x={x} y={y + 4} textAnchor="middle">{node.weight}</text>
        {node.symbol !== undefined && <text x={x} y={y + 40} textAnchor="middle">{displaySymbol(node.symbol)}</text>}
      </g>;
    })}
  </svg></div>;
}

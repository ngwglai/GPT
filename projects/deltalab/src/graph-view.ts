import { topology } from './core/graph';
import { labels, type Graph, type TraceEntry } from './core/types';
const ns = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
export function renderGraph(container: HTMLElement, graph: Graph, values: Record<string, number>, entries: TraceEntry[], selected: string): void {
  const order = topology(graph), depth = new Map<string, number>(), rows = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of order) {
    const level = n.kind === 'input' ? 0 : 1 + Math.max(...n.deps.map(d => depth.get(d)!));
    depth.set(n.id, level);
    const row = rows.get(level) ?? 0; rows.set(level, row + 1);
    positions.set(n.id, { x: 28 + level * 190, y: 30 + row * 100 });
  }
  const width = Math.max(580, 200 + Math.max(...depth.values()) * 190);
  const height = Math.max(300, 30 + Math.max(...rows.values()) * 100);
  const root = svg('svg', { width: String(width), height: String(height), role: 'img', 'aria-label': `计算依赖图，${graph.nodes.length} 个节点，从左向右流动` });
  const defs = svg('defs', {}), marker = svg('marker', { id: 'arrow', markerWidth: '7', markerHeight: '7', refX: '6', refY: '3', orient: 'auto' });
  marker.append(svg('path', { d: 'M0,0 L6,3 L0,6', fill: 'var(--line)' })); defs.append(marker); root.append(defs);
  for (const n of order) if (n.kind === 'compute') for (const d of new Set(n.deps)) {
    const a = positions.get(d)!, b = positions.get(n.id)!;
    root.append(svg('path', { d: `M${a.x + 144},${a.y + 35} C${a.x + 168},${a.y + 35} ${b.x - 24},${b.y + 35} ${b.x},${b.y + 35}`, class: 'edge', 'marker-end': 'url(#arrow)' }));
  }
  const statuses = new Map(entries.map(t => [t.nodeId, t]));
  for (const n of order) {
    const p = positions.get(n.id)!, t = statuses.get(n.id);
    const status = t ? t.cached ? (t.reason === 'blocked' ? '截断 · 缓存' : '无关 · 缓存') : t.changed ? '已执行 · 变化' : '已执行 · 稳定' : n.kind === 'input' ? '输入' : '待回放 · 缓存有效';
    const g = svg('g', { transform: `translate(${p.x},${p.y})`, class: `node ${t?.cached ? 'cached' : t ? 'executed' : ''} ${n.id === selected ? 'selected' : ''}`, tabindex: '0', role: 'button', 'aria-label': `编辑节点 ${n.id}`, 'data-node': n.id });
    g.append(svg('rect', { width: '144', height: '76', rx: '10' }));
    g.append(svg('text', { x: '12', y: '22', class: 'node-name' }, `${n.id} · ${n.kind === 'input' ? '输入' : labels[n.op]}`));
    g.append(svg('text', { x: '12', y: '43', class: 'node-value' }, format(values[n.id])));
    g.append(svg('text', { x: '12', y: '63', class: 'node-status' }, status)); root.append(g);
  }
  container.replaceChildren(root);
}
export function format(n: number): string { return Number.isInteger(n) && Math.abs(n) < 1e8 ? String(n) : n.toPrecision(5).replace(/\.?0+(e|$)/, '$1'); }

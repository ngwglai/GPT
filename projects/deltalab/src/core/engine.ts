import { evaluate, finite, parseGraph, topology } from './graph';
import { metrics } from './metrics';
import type { Execution, Graph, Snapshot, Strategy, TraceEntry, Updates } from './types';
export function initialize(graph: Graph): Snapshot {
  const clean = parseGraph(graph);
  const state: Snapshot = { graphSignature: JSON.stringify(clean), graph: clean, values: {}, cache: {} };
  for (const node of topology(clean)) {
    if (node.kind === 'input') state.values[node.id] = node.value;
    else {
      const inputs = node.deps.map(d => state.values[d]);
      const value = evaluate(node.op, inputs);
      state.values[node.id] = value;
      state.cache[node.id] = { valid: true, inputs, value };
    }
  }
  return state;
}
/** Every structural edit uses this path: no cached values survive the rebuild. */
export function rebuild(graph: Graph): Snapshot { return initialize(graph); }
export function assertSnapshot(state: Snapshot): void {
  const graph = parseGraph(state.graph);
  if (state.graphSignature !== JSON.stringify(graph)) throw new Error('图结构已变化，请完整重建缓存');
  const ids = new Set(graph.nodes.map(n => n.id));
  if (Object.keys(state.values).length !== ids.size || Object.keys(state.values).some(id => !ids.has(id))) throw new Error('状态节点集合无效');
  const computes = graph.nodes.filter(n => n.kind === 'compute');
  if (Object.keys(state.cache).length !== computes.length) throw new Error('缓存节点集合无效');
  for (const node of graph.nodes) {
    finite(state.values[node.id]);
    if (node.kind === 'compute') {
      const c = state.cache[node.id];
      if (!c?.valid || c.value !== state.values[node.id] || c.inputs.length !== node.deps.length ||
          node.deps.some((d, i) => c.inputs[i] !== state.values[d])) throw new Error(`节点 ${node.id} 缓存失效，请完整重建`);
    }
  }
}
function affected(state: Snapshot, changed: Set<string>): Set<string> {
  const dirty = new Set(changed);
  for (const node of topology(state.graph))
    if (node.kind === 'compute' && node.deps.some(d => dirty.has(d))) dirty.add(node.id);
  return dirty;
}
export function execute(before: Snapshot, updates: Updates, strategy: Strategy): Execution {
  if (!['full', 'dirty', 'change'].includes(strategy)) throw new Error('未知策略');
  assertSnapshot(before);
  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) throw new Error('输入更新必须为对象');
  const inputs = new Set(before.graph.nodes.filter(n => n.kind === 'input').map(n => n.id));
  for (const [id, value] of Object.entries(updates)) {
    if (!inputs.has(id)) throw new Error(`节点 ${id} 不是合法输入`);
    finite(value);
  }
  // Transactional copy: a failed batch never partially changes the caller's state.
  const state = structuredClone(before);
  const changed = new Set<string>();
  const trace: TraceEntry[] = [];
  const append = (entry: Omit<TraceEntry, 'order'>) => trace.push({ ...entry, order: trace.length + 1 });
  for (const [id, raw] of Object.entries(updates)) {
    const value = finite(raw), oldValue = state.values[id];
    if (value !== oldValue) changed.add(id);
    state.values[id] = value;
    append({ nodeId: id, op: 'input', inputs: [], oldValue, newValue: value, result: value, changed: value !== oldValue, cached: false, reason: 'input' });
  }
  const descendants = affected(state, changed);
  for (const node of topology(state.graph)) {
    if (node.kind === 'input') continue;
    const run = strategy === 'full' || (strategy === 'dirty' ? descendants.has(node.id) : node.deps.some(d => changed.has(d)));
    const oldValue = state.values[node.id];
    const values = node.deps.map(d => state.values[d]);
    if (run) {
      const value = evaluate(node.op, values);
      state.values[node.id] = value;
      state.cache[node.id] = { valid: true, inputs: values, value };
      if (value !== oldValue) changed.add(node.id);
      append({ nodeId: node.id, op: node.op, inputs: values, oldValue, newValue: value, result: value, changed: value !== oldValue, cached: false, reason: 'executed' });
    } else {
      append({ nodeId: node.id, op: node.op, inputs: values, oldValue, newValue: oldValue, result: oldValue, changed: false, cached: true, reason: descendants.has(node.id) ? 'blocked' : 'unaffected' });
    }
  }
  return { strategy, state, trace, metrics: metrics(trace) };
}

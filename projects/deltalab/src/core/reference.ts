import { parseGraph } from './graph';
import { execute } from './engine';
import type { Execution, Graph, Snapshot, Strategy, Updates } from './types';
/** Independent reference: repeated dependency resolution, own arithmetic, no engine caches,
 * no engine topological order, no dirty/change propagation, no evaluate() reuse. */
export function reference(graph: Graph, updates: Updates = {}): Record<string, number> {
  const clean = parseGraph(graph);
  const values: Record<string, number> = {};
  const inputIds = new Set(clean.nodes.filter(n => n.kind === 'input').map(n => n.id));
  for (const [id, value] of Object.entries(updates))
    if (!inputIds.has(id) || typeof value !== 'number' || !Number.isFinite(value)) throw new Error('参考路径输入无效');
  const pending = clean.nodes.filter(n => n.kind === 'compute');
  for (const node of clean.nodes) if (node.kind === 'input') values[node.id] = updates[node.id] ?? node.value;
  while (pending.length) {
    let progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const node = pending[i];
      if (!node.deps.every(d => Object.hasOwn(values, d))) continue;
      const a = values[node.deps[0]], b = values[node.deps[1]];
      let value: number;
      switch (node.op) {
        case 'add': value = a + b; break;
        case 'subtract': value = a - b; break;
        case 'multiply': value = a * b; break;
        case 'min': value = a < b ? a : b; break;
        case 'max': value = a > b ? a : b; break;
        case 'abs': value = a < 0 ? -a : a; break;
      }
      if (!Number.isFinite(value)) throw new Error(`参考计算溢出：${node.id}`);
      values[node.id] = value === 0 ? 0 : value;
      pending.splice(i, 1); progress = true;
    }
    if (!progress) throw new Error('参考计算无法解析依赖');
  }
  return values;
}
export interface Verification {
  ok: boolean; issues: string[]; executions: Record<Strategy, Execution>;
  expected: Record<string, number>;
  reproduction: { version: 1; graph: Graph; initialInputs: Updates; updates: Updates };
}
/** Check every value AND the exact dependency values recorded by each cache. */
export function inspect(state: Snapshot, expected: Record<string, number>): string[] {
  const issues: string[] = [];
  if (Object.keys(state.values).length !== Object.keys(expected).length) issues.push('节点集合不一致');
  if (Object.keys(state.cache).length !== state.graph.nodes.filter(n => n.kind === 'compute').length) issues.push('缓存集合不一致');
  for (const node of state.graph.nodes) {
    if (state.values[node.id] !== expected[node.id]) issues.push(`${node.id}: 数值不一致`);
    if (node.kind === 'compute') {
      const c = state.cache[node.id];
      if (!c?.valid || c.value !== expected[node.id] || c.inputs.length !== node.deps.length ||
          node.deps.some((d, i) => c.inputs[i] !== expected[d])) issues.push(`${node.id}: 缓存或依赖不一致`);
    }
  }
  return issues;
}
export function verify(before: Snapshot, updates: Updates): Verification {
  const initialInputs: Updates = {};
  for (const n of before.graph.nodes) if (n.kind === 'input') initialInputs[n.id] = before.values[n.id];
  const graph = parseGraph({ nodes: before.graph.nodes.map(n => n.kind === 'input' ? { ...n, value: initialInputs[n.id] } : n) });
  const initialReference = reference(graph);
  const expected = reference(graph, updates);
  const executions = {} as Record<Strategy, Execution>;
  const issues = inspect(before, initialReference).map(i => `初始状态: ${i}`);
  for (const strategy of ['full', 'dirty', 'change'] as const) {
    // The same warm cache is the starting state, never a result from another strategy.
    executions[strategy] = execute(before, updates, strategy);
    issues.push(...inspect(executions[strategy].state, expected).map(i => `${strategy}: ${i}`));
  }
  return { ok: issues.length === 0, issues, expected, executions,
    reproduction: { version: 1, graph, initialInputs, updates } };
}

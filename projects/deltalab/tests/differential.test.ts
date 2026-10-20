import { expect, it } from 'vitest';
import { execute, initialize } from '../src/core/engine';
import { largeDag, random } from '../src/core/experiments';
import { parseGraph } from '../src/core/graph';
import { inspect, reference } from '../src/core/reference';
import { operations, type Graph, type GraphNode, type Snapshot, type Strategy, type Updates } from '../src/core/types';
const strategies: Strategy[] = ['full', 'dirty', 'change'];
function caseGraph(seed: number): Graph {
  const rng = random(seed), nodes: GraphNode[] = Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, kind: 'input', value: i - 2 }));
  for (let i = 5; i < 65; i++) {
    const op = operations[Math.floor(rng() * operations.length)];
    const dep = () => nodes[Math.floor(rng() * (op === 'multiply' ? 5 : i))].id;
    nodes.push({ id: `n${i}`, kind: 'compute', op, deps: op === 'abs' ? [dep()] : [dep(), dep()] });
  }
  for (let i = nodes.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [nodes[i], nodes[j]] = [nodes[j], nodes[i]]; }
  return parseGraph({ nodes });
}
// Only synthetic IDs/numbers are emitted. Slice to the failing node's dependency cone,
// and replace the entire update history with the exact immediately preceding inputs.
function reproduction(before: Snapshot, updates: Updates, nodeId: string, seed: number, step: number, strategy: Strategy): string {
  const keep = new Set<string>();
  const visit = (id: string) => { if (keep.has(id)) return; keep.add(id); const n = before.graph.nodes.find(n => n.id === id); if (n?.kind === 'compute') n.deps.forEach(visit); };
  visit(nodeId);
  const nodes = before.graph.nodes.filter(n => keep.has(n.id)).map(n => n.kind === 'input' ? { ...n, value: before.values[n.id] } : n);
  return JSON.stringify({ seed, step, strategy, nodeId, graph: { nodes }, updates: Object.fromEntries(Object.entries(updates).filter(([id]) => keep.has(id))) });
}
for (let seed = 1; seed <= 150; seed++) it(`all-node differential sequence seed ${seed}`, () => {
  const graph = caseGraph(seed), rng = random(seed ^ 0xabc123);
  const states = Object.fromEntries(strategies.map(s => [s, initialize(graph)])) as Record<Strategy, Snapshot>;
  const inputs: Updates = Object.fromEntries(graph.nodes.filter(n => n.kind === 'input').map(n => [n.id, n.value]));
  for (let step = 0; step < 20; step++) {
    const updates = step % 5 === 0 ? { ...inputs } : Object.fromEntries(Array.from({ length: 1 + Math.floor(rng() * 5) }, () => [`i${Math.floor(rng() * 5)}`, Math.floor(rng() * 11) - 5]));
    Object.assign(inputs, updates);
    const expected = reference(graph, inputs);
    for (const strategy of strategies) {
      const before = states[strategy]; const result = execute(before, updates, strategy);
      const issues = inspect(result.state, expected);
      if (issues.length) {
        const id = graph.nodes.find(n => result.state.values[n.id] !== expected[n.id])?.id ?? issues[0].split(':')[0];
        throw new Error(`差分失败 ${issues.join('; ')}; 最小依赖锥单批复现 ${reproduction(before, updates, id, seed, step, strategy)}`);
      }
      expect(new Set(result.trace.map(t => t.nodeId)).size).toBe(result.trace.length);
      states[strategy] = result.state;
    }
  }
});
it('1000-node long chain: full and dirty visit all, change cuts off at stable abs', () => {
  const nodes: GraphNode[] = [{ id: 'x', kind: 'input', value: -2 }];
  for (let i = 1; i < 1000; i++) nodes.push({ id: `n${i}`, kind: 'compute', op: 'abs', deps: [i === 1 ? 'x' : `n${i - 1}`] });
  const state = initialize({ nodes });
  for (const s of strategies) {
    const result = execute(state, { x: 2 }, s);
    expect(result.metrics.executed).toBe(s === 'change' ? 1 : 999);
    expect(inspect(result.state, reference(state.graph, { x: 2 }))).toEqual([]);
  }
});
it('1000-node wide branch: unrelated nodes stay cached', () => {
  const nodes: GraphNode[] = [{ id: 'x', kind: 'input', value: 1 }, { id: 'y', kind: 'input', value: 1 }];
  for (let i = 2; i < 1000; i++) nodes.push({ id: `n${i}`, kind: 'compute', op: 'abs', deps: [i % 2 ? 'x' : 'y'] });
  for (const s of strategies) {
    const result = execute(initialize({ nodes }), { x: 2 }, s);
    expect(result.metrics.executed).toBe(s === 'full' ? 998 : 499);
    expect(inspect(result.state, reference({ nodes }, { x: 2 }))).toEqual([]);
  }
});
it('multilayer shared dependencies execute each node once per batch', () => {
  const nodes: GraphNode[] = [{ id: 'x', kind: 'input', value: -2 }, { id: 'y', kind: 'input', value: 3 }];
  let parents = ['x', 'y'];
  for (let level = 0; level < 10; level++) {
    const next: string[] = [];
    for (let col = 0; col < 80; col++) {
      const id = `n${level}_${col}`; next.push(id);
      nodes.push({ id, kind: 'compute', op: 'add', deps: [parents[col % parents.length], parents[(col + 1) % parents.length]] });
    }
    parents = next;
  }
  for (const s of strategies) {
    const result = execute(initialize({ nodes }), { x: 4, y: 6 }, s);
    expect(result.metrics.executed).toBe(800);
    expect(new Set(result.trace.filter(t => t.op !== 'input').map(t => t.nodeId)).size).toBe(800);
    expect(inspect(result.state, reference({ nodes }, { x: 4, y: 6 }))).toEqual([]);
  }
});
it('1000-node seeded DAG repeated batches match reference with bounded operation counts', () => {
  const graph = largeDag(1000, 2394);
  let state = initialize(graph);
  for (let i = 0; i < 20; i++) {
    const updates = { i0: i % 7 - 3, i1: 5 - i % 11 };
    const results = strategies.map(s => execute(state, updates, s));
    const inputs = Object.fromEntries(graph.nodes.filter(n => n.kind === 'input').map(n => [n.id, state.values[n.id]]));
    Object.assign(inputs, updates);
    for (const r of results) expect(inspect(r.state, reference(graph, inputs))).toEqual([]);
    expect(results[2].metrics.executed).toBeLessThanOrEqual(results[1].metrics.executed);
    expect(results[1].metrics.executed).toBeLessThanOrEqual(results[0].metrics.executed);
    state = results[2].state;
  }
});

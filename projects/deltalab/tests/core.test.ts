import { describe, expect, it } from 'vitest';
import { arity, deleteNode, editNode, evaluate, finite, parseGraph, topology } from '../src/core/graph';
import { assertSnapshot, execute, initialize, rebuild } from '../src/core/engine';
import { largeDag, preset } from '../src/core/experiments';
import { inspect, reference, verify } from '../src/core/reference';
import { exportExperiment, importExperiment, MAX_JSON_BYTES, restore } from '../src/core/serialization';
import type { Graph, GraphNode, Operation, Strategy } from '../src/core/types';
const strategies: Strategy[] = ['full', 'dirty', 'change'];
const input = (id: string, value = 1): GraphNode => ({ id, kind: 'input', value });
const calc = (id: string, op: Operation, ...deps: string[]): GraphNode => ({ id, kind: 'compute', op, deps });
const diamond: Graph = { nodes: [input('x'), input('y', 2), calc('a', 'add', 'x', 'y'), calc('b', 'subtract', 'x', 'y'), calc('c', 'multiply', 'a', 'b'), calc('d', 'abs', 'c')] };
describe('graph invariants', () => {
  it('sorts unsorted shared DAG and preserves argument order', () => {
    const graph = parseGraph({ nodes: [...diamond.nodes].reverse() });
    const order = topology(graph).map(n => n.id);
    for (const n of graph.nodes) if (n.kind === 'compute') for (const d of n.deps) expect(order.indexOf(d)).toBeLessThan(order.indexOf(n.id));
    expect(initialize(graph).values.b).toBe(-1);
  });
  it('deduplicates edges for topology, retaining duplicate arithmetic arguments', () => {
    const graph = parseGraph({ nodes: [calc('a', 'add', 'x', 'x'), input('x', 3)] });
    expect(initialize(graph).values.a).toBe(6);
  });
  it.each([
    { nodes: [calc('a', 'abs', 'a')] },
    { nodes: [calc('a', 'abs', 'b'), calc('b', 'abs', 'a')] },
    { nodes: [input('x'), calc('a', 'abs', 'missing')] },
    { nodes: [input('x'), input('x')] },
    { nodes: [] },
    { nodes: [input('constructor')] },
    { nodes: [input('x<svg>')] },
    { nodes: [input('x', Infinity)] },
    { nodes: [input('x', NaN)] },
    { nodes: [calc('a', 'abs', 'x', 'x'), input('x')] },
    { nodes: [calc('a', 'add', 'x'), input('x')] },
    { nodes: [input('x'), { id: 'a', kind: 'compute', op: 'eval', deps: ['x'] }] },
    { nodes: Array.from({ length: 1001 }, (_, i) => input(`x${i}`)) },
  ])('rejects invalid graph %#', data => expect(() => parseGraph(data)).toThrow());
  it('validates every edit without mutating the previous graph', () => {
    const graph = preset('stable'), text = JSON.stringify(graph);
    expect(() => deleteNode(graph, 'x')).toThrow();
    expect(() => editNode(graph, calc('a', 'abs', 'b'), 'a')).toThrow(/环/);
    expect(() => editNode(graph, input('x'))).toThrow();
    expect(() => editNode(graph, input('new'), 'missing')).toThrow();
    expect(() => editNode(graph, input('renamed'), 'x')).toThrow();
    expect(() => deleteNode(graph, 'missing')).toThrow();
    expect(() => deleteNode({ nodes: [input('x')] }, 'x')).toThrow();
    expect(JSON.stringify(graph)).toBe(text);
    const extended = editNode(graph, input('z', 8));
    expect(deleteNode(extended, 'z')).toEqual(graph);
    const changed = editNode(graph, input('x', 4), 'x');
    expect(rebuild(changed).values.a).toBe(4);
  });
});
describe('numerical policy', () => {
  it.each<[Operation, number[], number]>([
    ['add', [1.5, 2.25], 3.75], ['subtract', [2, 8], -6], ['multiply', [-3, 2], -6],
    ['min', [-1, 3], -1], ['max', [-1, 3], 3], ['abs', [-9], 9],
  ])('%s has ordered, precise arithmetic', (op, values, expected) => { expect(evaluate(op, values)).toBe(expected); expect(arity(op)).toBe(values.length); });
  it.each([NaN, Infinity, -Infinity, '1', null])('rejects invalid finite value %#', n => expect(() => finite(n)).toThrow());
  it('normalizes signed zero and compares floating point outputs exactly', () => {
    expect(Object.is(finite(-0), 0)).toBe(true);
    const state = initialize({ nodes: [input('x', 0.3), input('y', 0), calc('a', 'add', 'x', 'y')] });
    expect(execute(state, { x: 0.1 + 0.2 }, 'change').metrics.changed).toBe(1);
  });
  it('rejects overflow transactionally', () => {
    const state = initialize({ nodes: [input('x', 1), input('y', 2), calc('a', 'multiply', 'x', 'y')] });
    const copy = structuredClone(state);
    for (const s of strategies) expect(() => execute(state, { x: Number.MAX_VALUE }, s)).toThrow(/有限/);
    expect(state).toEqual(copy);
    expect(() => reference(state.graph, { x: Number.MAX_VALUE })).toThrow(/溢出/);
  });
});
describe('three execution strategies and real traces', () => {
  it.each<[Strategy, number]>([['full', 4], ['dirty', 3], ['change', 1]])('stable output %s costs %i', (s, count) => {
    const result = execute(initialize(preset('stable')), { x: 2 }, s);
    expect(result.metrics.executed).toBe(count);
    expect(result.metrics.total).toBe(4);
    expect(result.metrics.changed).toBe(0);
    expect(result.metrics.skipped + result.metrics.executed).toBe(4);
    expect(result.metrics.theoreticalCost).toBe(count);
    expect(result.metrics.savings).toBe(1 - count / 4);
    expect(inspect(result.state, reference(result.state.graph, { x: 2 }))).toEqual([]);
    expect(result.trace.map(t => t.order)).toEqual([1, 2, 3, 4, 5]);
    if (s === 'change') {
      expect(result.metrics.unaffected).toBe(1); expect(result.metrics.blocked).toBe(2);
      expect(result.metrics.unchangedExecuted).toBe(1);
      expect(result.trace.find(t => t.nodeId === 'a')).toMatchObject({ op: 'abs', inputs: [2], oldValue: 2, newValue: 2, result: 2, cached: false, changed: false });
    }
  });
  it.each(strategies)('handles simultaneous parents exactly once for %s', s => {
    const state = initialize(diamond), copy = structuredClone(state);
    const result = execute(state, { x: 5, y: 7 }, s);
    expect(result.state.values).toEqual(reference(diamond, { x: 5, y: 7 }));
    expect(result.metrics.executed).toBe(4);
    expect(new Set(result.trace.map(t => t.nodeId)).size).toBe(result.trace.length);
    expect(result.trace.find(t => t.nodeId === 'c')?.inputs).toEqual([12, -2]);
    expect(state).toEqual(copy);
  });
  it('a stable parent does not hide a changed parent or shared descendant', () => {
    const graph = { nodes: [input('x', -2), input('y'), calc('a', 'abs', 'x'), calc('b', 'add', 'x', 'y'), calc('c', 'add', 'a', 'b')] };
    const result = execute(initialize(graph), { x: 2 }, 'change');
    expect(result.metrics.executed).toBe(3); expect(result.state.values.c).toBe(5);
  });
  it.each(strategies)('repeated same-value updates %s', s => {
    const state = initialize(diamond);
    const result = execute(state, { x: 1, y: 2 }, s);
    expect(result.metrics.executed).toBe(s === 'full' ? 4 : 0);
    expect(execute(result.state, {}, s).state.values).toEqual(state.values);
  });
  it('skips unrelated branches', () => {
    const result = execute(initialize(preset('branch')), { x: 8 }, 'dirty');
    expect(result.metrics.executed).toBe(3);
    expect(result.trace.filter(t => t.cached).map(t => t.nodeId)).toEqual(['u', 'v']);
  });
  it('rebuild discards every cache after structure edits', () => {
    const old = initialize(preset('stable'));
    const next = rebuild(editNode(old.graph, calc('a', 'add', 'x', 'y'), 'a'));
    expect(next.values.a).toBe(1); expect(next.values.b).toBe(4);
    expect(next.cache.a).not.toBe(old.cache.a);
    expect(verify(next, { x: 4 }).ok).toBe(true);
  });
  it('rejects stale or malformed caches and invalid updates', () => {
    const state = initialize(diamond);
    state.cache.a.inputs[0] = 99;
    expect(() => execute(state, {}, 'change')).toThrow(/缓存/);
    const fresh = initialize(diamond);
    expect(() => execute(fresh, { c: 4 }, 'dirty')).toThrow();
    expect(() => execute(fresh, { x: NaN }, 'full')).toThrow();
    delete fresh.values.x; expect(() => assertSnapshot(fresh)).toThrow();
  });
  it('rejects direct structure mutation even when old cache values happen to match', () => {
    const state = initialize(diamond);
    const n = state.graph.nodes.find(n => n.id === 'a')!;
    if (n.kind === 'compute') n.op = 'subtract';
    expect(() => execute(state, {}, 'change')).toThrow(/重建/);
  });
  it('reference detects coherent but wrong caches at a precise node', () => {
    const state = initialize({ nodes: [input('x'), calc('a', 'abs', 'x')] });
    state.values.a = 42; state.cache.a.value = 42;
    const result = verify(state, {});
    expect(result.ok).toBe(false); expect(result.issues.some(s => s.includes('a'))).toBe(true);
    expect(result.reproduction.updates).toEqual({}); expect(result.reproduction.graph).toEqual(state.graph);
  });
});
describe('safe, reproducible JSON', () => {
  const make = () => exportExperiment(execute(initialize(preset('stable')), { x: 2 }, 'change').state, { strategy: 'change', preset: 'stable', size: 80 }, 42);
  it('round trips current inputs and ignores untrusted cached results', () => {
    const data = JSON.parse(make()); data.cache = { a: { value: 9999 } }; data.trace = ['untrusted'];
    const restored = restore(importExperiment(JSON.stringify(data)));
    expect(restored.values.x).toBe(2); expect(restored.values.a).toBe(2);
    expect(restored.cache.a.value).toBe(2);
  });
  it.each([
    (d: Record<string, unknown>) => { d.version = 2; },
    (d: Record<string, unknown>) => { d.inputs = { x: '2', y: 3 }; },
    (d: Record<string, unknown>) => { d.inputs = { x: 2, y: 3, evil: 4 }; },
    (d: Record<string, unknown>) => { d.inputs = {}; },
    (d: Record<string, unknown>) => { d.parameters = { strategy: 'eval', preset: 'stable', size: 80 }; },
    (d: Record<string, unknown>) => { d.seed = -1; },
    (d: Record<string, unknown>) => { d.graph = { nodes: [input('x'), calc('a', 'abs', 'a')] }; },
    (d: Record<string, unknown>) => { d.inputs = { x: null, y: 3 }; },
  ])('rejects invalid import %#', mutate => { const data = JSON.parse(make()); mutate(data); expect(() => importExperiment(JSON.stringify(data))).toThrow(); });
  it.each([1, 2, 3])('rejects non-reloadable preset size %i', size => {
    const data = JSON.parse(make()); data.parameters.preset = 'large'; data.parameters.size = size;
    expect(() => importExperiment(JSON.stringify(data))).toThrow(/参数/);
  });
  it.each(['null', '[]', 'true', '{}', '{bad json}'])('rejects invalid JSON %s', data => expect(() => importExperiment(data)).toThrow());
  it('caps import size', () => expect(() => importExperiment(' '.repeat(MAX_JSON_BYTES + 1))).toThrow(/512/));
  it('rejects graph arithmetic overflow on import', () => {
    const data = JSON.parse(make()); data.graph = { nodes: [input('x'), input('y', 2), calc('a', 'multiply', 'x', 'y')] }; data.inputs = { x: Number.MAX_VALUE, y: 2 };
    expect(() => importExperiment(JSON.stringify(data))).toThrow();
  });
  it('same seed and parameters generate identical graphs', () => {
    expect(largeDag(100, 42)).toEqual(largeDag(100, 42)); expect(largeDag(100, 42)).not.toEqual(largeDag(100, 43));
    expect(largeDag().nodes.length).toBeLessThanOrEqual(100);
  });
  it.each([3, 1001, 1.5])('rejects invalid size %i', size => expect(() => largeDag(size)).toThrow());
  it.each([-1, 4294967296, NaN])('rejects invalid seed %i', seed => expect(() => largeDag(80, seed)).toThrow());
});

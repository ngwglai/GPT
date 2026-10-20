import { parseGraph } from './graph';
import type { Graph, GraphNode, Operation } from './types';
export const presetNames = ['chain', 'branch', 'stable', 'large'] as const;
export type Preset = typeof presetNames[number];
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function largeDag(size = 80, seed = 2026): Graph {
  if (!Number.isInteger(size) || size < 4 || size > 1000) throw new Error('大图规模必须为 4–1000 的整数');
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('种子必须为 uint32');
  const rng = random(seed);
  const count = Math.max(2, Math.floor(size / 8));
  const nodes: GraphNode[] = Array.from({ length: count }, (_, i) => ({ id: `i${i}`, kind: 'input', value: Math.floor(rng() * 11) - 5 }));
  // min/max/abs keep randomly generated graphs numerically bounded even at 1000 nodes.
  const ops: Operation[] = ['min', 'max', 'abs'];
  for (let i = count; i < size; i++) {
    const op = ops[Math.floor(rng() * ops.length)];
    nodes.push({ id: `n${i}`, kind: 'compute', op, deps: Array.from({ length: op === 'abs' ? 1 : 2 }, () => nodes[Math.floor(rng() * i)].id) });
  }
  return parseGraph({ nodes });
}
export function preset(name: Preset, size = 80, seed = 2026): Graph {
  if (name === 'large') return largeDag(size, seed);
  const inputs: GraphNode[] = [{ id: 'x', kind: 'input', value: -2 }, { id: 'y', kind: 'input', value: 3 }];
  const compute = (id: string, op: Operation, ...deps: string[]): GraphNode => ({ id, kind: 'compute', op, deps });
  if (name === 'chain') return { nodes: [...inputs, compute('a', 'add', 'x', 'y'), compute('b', 'abs', 'a'), compute('c', 'multiply', 'b', 'y'), compute('d', 'subtract', 'c', 'y')] };
  if (name === 'branch') return { nodes: [...inputs, { id: 'z', kind: 'input', value: 4 }, compute('a', 'add', 'x', 'y'), compute('b', 'multiply', 'x', 'y'), compute('c', 'max', 'a', 'b'), compute('u', 'abs', 'z'), compute('v', 'add', 'u', 'z')] };
  return { nodes: [...inputs, compute('a', 'abs', 'x'), compute('b', 'add', 'a', 'y'), compute('c', 'multiply', 'b', 'y'), compute('u', 'abs', 'y')] };
}

import { operations, type Graph, type GraphNode, type Operation } from './types';
export const MAX_NODES = 1000;
export function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('数值必须是有限数字，拒绝 NaN、Infinity 和溢出');
  return value === 0 ? 0 : value; // +0 and -0 have identical numerical semantics.
}
export function arity(op: Operation): number { return op === 'abs' ? 1 : 2; }
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseGraph(value: unknown): Graph {
  if (!object(value) || !Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > MAX_NODES)
    throw new Error('图必须包含 1–1000 个节点');
  const nodes: GraphNode[] = value.nodes.map((raw: unknown) => {
    if (!object(raw) || typeof raw.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(raw.id) || ['constructor', 'prototype', '__proto__'].includes(raw.id))
      throw new Error('节点 ID 必须为 1–32 位字母、数字、下划线或短横线，以字母开头且非保留字');
    if (raw.kind === 'input') return { id: raw.id, kind: 'input', value: finite(raw.value) };
    if (raw.kind !== 'compute' || !operations.includes(raw.op as Operation) || !Array.isArray(raw.deps) ||
        raw.deps.length !== arity(raw.op as Operation) || !raw.deps.every((d: unknown) => typeof d === 'string'))
      throw new Error('运算或参数数量无效：abs 为一元，其他运算为有序二元');
    return { id: raw.id, kind: 'compute', op: raw.op as Operation, deps: [...raw.deps] as string[] };
  });
  const graph = { nodes };
  topology(graph);
  return graph;
}
export function topology(graph: Graph): GraphNode[] {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  if (byId.size !== graph.nodes.length) throw new Error('节点 ID 重复');
  const degree = new Map<string, number>();
  const children = new Map<string, string[]>(graph.nodes.map(n => [n.id, []]));
  for (const node of graph.nodes) {
    const deps = node.kind === 'input' ? [] : [...new Set(node.deps)];
    degree.set(node.id, deps.length);
    for (const dep of deps) {
      if (!byId.has(dep)) throw new Error(`节点 ${node.id} 有不存在的依赖`);
      children.get(dep)!.push(node.id);
    }
  }
  const queue = graph.nodes.filter(n => degree.get(n.id) === 0);
  for (let i = 0; i < queue.length; i++) {
    for (const child of children.get(queue[i].id)!) {
      degree.set(child, degree.get(child)! - 1);
      if (degree.get(child) === 0) queue.push(byId.get(child)!);
    }
  }
  if (queue.length !== graph.nodes.length) throw new Error('检测到环：计算图必须为 DAG');
  return queue;
}
export function editNode(graph: Graph, node: GraphNode, originalId?: string): Graph {
  if (originalId && !graph.nodes.some(n => n.id === originalId)) throw new Error('待修改节点不存在');
  if (originalId && originalId !== node.id) throw new Error('修改时请保留 ID；重命名可先添加再修改依赖');
  if (!originalId && graph.nodes.some(n => n.id === node.id)) throw new Error('节点 ID 重复');
  return parseGraph({ nodes: originalId ? graph.nodes.map(n => n.id === originalId ? node : n) : [...graph.nodes, node] });
}
export function deleteNode(graph: Graph, id: string): Graph {
  if (!graph.nodes.some(n => n.id === id)) throw new Error('待删除节点不存在');
  return parseGraph({ nodes: graph.nodes.filter(n => n.id !== id) });
}
export function evaluate(op: Operation, v: number[]): number {
  let result: number;
  switch (op) {
    case 'add': result = v[0] + v[1]; break;
    case 'subtract': result = v[0] - v[1]; break;
    case 'multiply': result = v[0] * v[1]; break;
    case 'min': result = Math.min(v[0], v[1]); break;
    case 'max': result = Math.max(v[0], v[1]); break;
    case 'abs': result = Math.abs(v[0]); break;
  }
  return finite(result);
}

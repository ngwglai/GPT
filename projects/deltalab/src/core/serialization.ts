import { finite, parseGraph } from './graph';
import { initialize } from './engine';
import type { Experiment, Snapshot, Strategy } from './types';
export const MAX_JSON_BYTES = 512 * 1024;
export function importExperiment(text: string): Experiment {
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new Error('JSON 超过 512 KiB 上限');
  const data = JSON.parse(text) as Record<string, unknown>;
  if (!data || Array.isArray(data) || typeof data !== 'object' || data.version !== 1) throw new Error('不支持的格式版本');
  const graph = parseGraph(data.graph);
  const raw = data.inputs;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('inputs 必须是对象');
  const inputNodes = graph.nodes.filter(n => n.kind === 'input');
  const pairs = Object.entries(raw);
  if (pairs.length !== inputNodes.length || pairs.some(([id]) => !inputNodes.some(n => n.id === id))) throw new Error('输入节点集合不一致');
  const inputs = Object.fromEntries(pairs.map(([id, v]) => [id, finite(v)]));
  const p = data.parameters as Record<string, unknown>;
  if (!p || typeof p !== 'object' || Array.isArray(p) || !['full', 'dirty', 'change'].includes(p.strategy as string) ||
      typeof p.preset !== 'string' || !['chain', 'branch', 'stable', 'large', 'custom'].includes(p.preset) ||
      !Number.isInteger(p.size) || (p.size as number) < 4 || (p.size as number) > 1000) throw new Error('实验参数无效');
  if (!Number.isInteger(data.seed) || (data.seed as number) < 0 || (data.seed as number) > 4294967295) throw new Error('随机种子无效');
  const experiment: Experiment = { version: 1, graph, inputs,
    parameters: { strategy: p.strategy as Strategy, preset: p.preset, size: p.size as number }, seed: data.seed as number };
  restore(experiment); // Catch arithmetic overflow before accepting an import.
  return experiment;
}
export function restore(experiment: Experiment): Snapshot {
  return initialize({ nodes: experiment.graph.nodes.map(n => n.kind === 'input' ? { ...n, value: experiment.inputs[n.id] } : n) });
}
export function exportExperiment(state: Snapshot, parameters: Experiment['parameters'], seed: number): string {
  const inputs = Object.fromEntries(state.graph.nodes.filter(n => n.kind === 'input').map(n => [n.id, state.values[n.id]]));
  const data: Experiment = { version: 1, graph: state.graph, inputs, parameters, seed };
  // Results/traces from elsewhere are never trusted or restored as caches.
  const text = JSON.stringify(data, null, 2);
  importExperiment(text);
  return text;
}

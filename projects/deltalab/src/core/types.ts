export const operations = ['add', 'subtract', 'multiply', 'min', 'max', 'abs'] as const;
export type Operation = typeof operations[number];
export type GraphNode = { id: string; kind: 'input'; value: number } |
  { id: string; kind: 'compute'; op: Operation; deps: string[] };
export interface Graph { nodes: GraphNode[] }
export type Strategy = 'full' | 'dirty' | 'change';
export type Updates = Record<string, number>;
export interface Cache { valid: true; inputs: number[]; value: number }
export interface Snapshot { graphSignature: string; graph: Graph; values: Record<string, number>; cache: Record<string, Cache> }
export type Reason = 'executed' | 'unaffected' | 'blocked' | 'input';
export interface TraceEntry {
  order: number; nodeId: string; op: Operation | 'input'; inputs: number[];
  oldValue: number; newValue: number; result: number; changed: boolean;
  cached: boolean; reason: Reason;
}
export interface Metrics {
  total: number; executed: number; skipped: number; changed: number;
  unaffected: number; blocked: number; unchangedExecuted: number;
  savings: number; theoreticalCost: number; fullCost: number;
}
export interface Execution { strategy: Strategy; state: Snapshot; trace: TraceEntry[]; metrics: Metrics }
export interface Experiment {
  version: 1; graph: Graph; inputs: Updates;
  parameters: { strategy: Strategy; preset: string; size: number }; seed: number;
}
export const labels: Record<Operation, string> = {
  add: '加法', subtract: '减法', multiply: '乘法', min: '最小值', max: '最大值', abs: '绝对值',
};

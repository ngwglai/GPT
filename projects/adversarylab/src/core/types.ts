export const sortingAlgorithms = ["insertion", "merge", "quick"] as const;
export const graphAlgorithms = ["bfs", "dfs", "dijkstra"] as const;
export type SortAlgorithm = (typeof sortingAlgorithms)[number];
export type GraphAlgorithm = (typeof graphAlgorithms)[number];
export type Algorithm = SortAlgorithm | GraphAlgorithm;
export const strategies = ["random", "hill", "annealing"] as const;
export type Strategy = (typeof strategies)[number];
export type Metric =
  | "comparisons"
  | "moves"
  | "swaps"
  | "maxDepth"
  | "expanded"
  | "edgeChecks"
  | "pushes"
  | "pops"
  | "stalePops";
export type Metrics = Record<Metric, number>;
export interface SortSpace {
  kind: "sort";
  size: number;
  mode: "permutation" | "repeated";
  range: number;
}
export interface GraphSpace {
  kind: "graph";
  nodes: number;
  edges: number;
  maxWeight: number;
}
export type Space = SortSpace | GraphSpace;
export interface Edge {
  from: number;
  to: number;
  weight: number;
}
export interface GraphInput {
  kind: "graph";
  nodes: number;
  edges: Edge[];
}
export interface SortInput {
  kind: "sort";
  values: number[];
}
export type Candidate = SortInput | GraphInput;
export interface Execution {
  metrics: Metrics;
  sorted?: number[];
  path?: number[];
  distance?: number | null;
  order?: number[];
}
export interface Config {
  algorithm: Algorithm;
  space: Space;
  metric: Metric;
  strategy: Strategy;
  budget: number;
  seed: number;
  initialTemperature: number;
  finalTemperature: number;
}
export interface BatchConfig {
  experiment: Config;
  seeds: number[];
  compare: boolean;
  exact: boolean;
  timeoutMs: number;
}
export type Termination =
  | "budget"
  | "cancelled"
  | "timeout"
  | "error"
  | "proposal-limit";
export interface Point {
  evaluation: number;
  cost: number;
}
export interface SearchResult {
  config: Config;
  generated: number;
  rejected: number;
  duplicates: number;
  evaluations: number;
  failures: number;
  best: Candidate | null;
  bestCost: number | null;
  execution: Execution | null;
  history: Point[];
  termination: Termination | null;
  error?: string;
}
export interface ExactResult {
  complete: boolean;
  evaluated: number;
  total: number;
  optimum: number | null;
  best: SortInput | null;
  reason: "running" | "complete" | "cancelled" | "timeout" | "limit" | "error";
  error?: string;
}
export type Status =
  | "idle"
  | "running"
  | "paused"
  | "budget"
  | "cancelled"
  | "timeout"
  | "error"
  | "proposal-limit";
export interface Snapshot {
  status: Status;
  results: SearchResult[];
  current: SearchResult | null;
  exact: ExactResult | null;
  error?: string;
}
export const labels: Record<Algorithm | Strategy | Metric, string> = {
  insertion: "插入排序",
  merge: "归并排序",
  quick: "首枢轴快速排序",
  bfs: "BFS 广度优先",
  dfs: "DFS 深度优先",
  dijkstra: "Dijkstra 最短路径",
  random: "Random Search",
  hill: "Hill Climbing",
  annealing: "Simulated Annealing",
  comparisons: "元素比较次数",
  moves: "数组写入次数",
  swaps: "实际交换次数",
  maxDepth: "最大递归深度",
  expanded: "节点扩展数",
  edgeChecks: "边检查数",
  pushes: "优先队列入堆数",
  pops: "优先队列出堆数",
  stalePops: "过期条目数",
};
export const metricDefinitions: Record<Metric, string> = {
  comparisons: "排序中的元素值比较，不含循环、索引和边界判断",
  moves: "数组槽位写入；归并含临时缓冲区及写回；不含局部变量赋值",
  swaps: "快速排序中两个不同索引之间的交换；自交换不计",
  maxDepth: "非空排序调用最大深度，根为1，空输入为0，含单元素调用",
  expanded: "从待访问结构取出并实际处理的节点数，含终点；不含过期条目",
  edgeChecks: "已扩展节点邻接表中实际检查的边数；终点不检查出边",
  pushes: "Dijkstra实际入堆次数，含起点及距离改善的新条目",
  pops: "Dijkstra实际出堆次数，含过期条目；到达终点即停止",
  stalePops: "Dijkstra出堆后距离不再匹配或节点已定型的条目数",
};
export function metricsFor(algorithm: Algorithm): Metric[] {
  if (algorithm === "insertion") return ["comparisons", "moves"];
  if (algorithm === "merge") return ["comparisons", "moves", "maxDepth"];
  if (algorithm === "quick") return ["comparisons", "swaps", "maxDepth"];
  if (algorithm === "dijkstra")
    return ["expanded", "edgeChecks", "pushes", "pops", "stalePops"];
  return ["expanded", "edgeChecks"];
}
export const defaultConfig: BatchConfig = {
  experiment: {
    algorithm: "insertion",
    space: { kind: "sort", size: 8, mode: "permutation", range: 5 },
    metric: "comparisons",
    strategy: "hill",
    budget: 1000,
    seed: 42,
    initialTemperature: 10,
    finalTemperature: 0.05,
  },
  seeds: [42],
  compare: false,
  exact: true,
  timeoutMs: 15000,
};

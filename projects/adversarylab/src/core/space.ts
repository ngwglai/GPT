import {
  graphAlgorithms,
  sortingAlgorithms,
  metricsFor,
  strategies,
} from "./types";
import type { BatchConfig, Candidate, Config, Space } from "./types";
import { Random } from "./random";
function integer(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
export function validateConfig(c: Config): void {
  if (
    ![...sortingAlgorithms, ...graphAlgorithms].includes(c.algorithm) ||
    !strategies.includes(c.strategy)
  )
    throw new Error("未知算法或策略");
  if (!metricsFor(c.algorithm).includes(c.metric))
    throw new Error("算法不支持该指标");
  if (!integer(c.budget, 1, 20000) || !integer(c.seed, 0, 4294967295))
    throw new Error("评价预算 1–20000；种子为 uint32");
  if (
    !Number.isFinite(c.initialTemperature) ||
    !Number.isFinite(c.finalTemperature) ||
    c.initialTemperature < c.finalTemperature ||
    c.finalTemperature <= 0 ||
    c.initialTemperature > 1e6
  )
    throw new Error("温度必须满足 0 < 终温 ≤ 初温 ≤ 1000000");
  const s = c.space;
  if (s.kind === "sort") {
    if (
      !sortingAlgorithms.includes(
        c.algorithm as (typeof sortingAlgorithms)[number],
      ) ||
      !integer(s.size, 0, 64) ||
      !["permutation", "repeated"].includes(s.mode) ||
      !integer(s.range, 0, 100)
    )
      throw new Error("排序约束无效：长度 0–64，重复值范围 0–100");
  } else if (s.kind === "graph") {
    if (
      !graphAlgorithms.includes(
        c.algorithm as (typeof graphAlgorithms)[number],
      ) ||
      !integer(s.nodes, 2, 20) ||
      !integer(s.edges, 0, Math.min(100, s.nodes * (s.nodes - 1))) ||
      !integer(s.maxWeight, 0, 20)
    )
      throw new Error("图约束无效：节点 2–20，边 0–100，权重 0–20");
  } else throw new Error("未知输入空间");
}
export function validateBatch(b: BatchConfig): void {
  validateConfig(b.experiment);
  if (
    !Array.isArray(b.seeds) ||
    b.seeds.length < 1 ||
    b.seeds.length > 8 ||
    b.seeds.some((s) => !integer(s, 0, 4294967295)) ||
    new Set(b.seeds).size !== b.seeds.length
  )
    throw new Error("请提供 1–8 个互异 uint32 种子");
  if (
    !integer(b.timeoutMs, 1, 30000) ||
    typeof b.compare !== "boolean" ||
    typeof b.exact !== "boolean"
  )
    throw new Error("时间预算 1–30000 ms");
  if (
    b.exact &&
    (b.experiment.space.kind !== "sort" ||
      b.experiment.space.mode !== "permutation" ||
      b.experiment.space.size > 8)
  )
    throw new Error("精确穷举仅支持长度 ≤ 8 的互异排列");
}
export function validCandidate(c: Candidate, s: Space): boolean {
  if (c.kind === "sort" && s.kind === "sort") {
    if (
      c.values.length !== s.size ||
      c.values.some((v) => !Number.isSafeInteger(v))
    )
      return false;
    return s.mode === "permutation"
      ? new Set(c.values).size === s.size &&
          c.values.every((v) => v >= 0 && v < s.size)
      : c.values.every((v) => v >= -s.range && v <= s.range);
  }
  if (
    c.kind !== "graph" ||
    s.kind !== "graph" ||
    c.nodes !== s.nodes ||
    c.edges.length !== s.edges
  )
    return false;
  return (
    c.edges.every(
      (e) =>
        integer(e.from, 0, s.nodes - 1) &&
        integer(e.to, 0, s.nodes - 1) &&
        e.from !== e.to &&
        integer(e.weight, 0, s.maxWeight),
    ) && new Set(c.edges.map((e) => `${e.from}:${e.to}`)).size === s.edges
  );
}
export function canonical(c: Candidate): string {
  // A collision-free compact key within a validated fixed space: <=100 UTF-16 units.
  // nodes <=20, weights <=20; simple edges sorted by their ordered endpoints.
  return c.kind === "sort"
    ? JSON.stringify(c.values)
    : String.fromCharCode(
        ...[...c.edges]
          .sort((a, b) => a.from - b.from || a.to - b.to)
          .map((e) => (e.from * 20 + e.to) * 21 + e.weight),
      );
}
export function generate(s: Space, rng: Random): Candidate {
  if (s.kind === "sort")
    return {
      kind: "sort",
      values:
        s.mode === "permutation"
          ? rng.shuffle(Array.from({ length: s.size }, (_, i) => i))
          : Array.from(
              { length: s.size },
              () => rng.int(2 * s.range + 1) - s.range,
            ),
    };
  const pairs = [];
  for (let from = 0; from < s.nodes; from++)
    for (let to = 0; to < s.nodes; to++)
      if (from !== to) pairs.push({ from, to });
  return {
    kind: "graph",
    nodes: s.nodes,
    edges: rng
      .shuffle(pairs)
      .slice(0, s.edges)
      .map((e) => ({ ...e, weight: rng.int(s.maxWeight + 1) })),
  };
}
export function mutate(c: Candidate, s: Space, rng: Random): Candidate {
  if (c.kind === "sort" && s.kind === "sort") {
    const values = [...c.values];
    if (values.length) {
      const i = rng.int(values.length);
      if (s.mode === "permutation") {
        const j = rng.int(values.length);
        [values[i], values[j]] = [values[j], values[i]];
      } else values[i] = rng.int(2 * s.range + 1) - s.range;
    }
    return { kind: "sort", values };
  }
  if (c.kind !== "graph" || s.kind !== "graph")
    throw new Error("输入空间不匹配");
  const edges = c.edges.map((e) => ({ ...e }));
  if (edges.length) {
    const i = rng.int(edges.length);
    if (rng.next() < 0.5) edges[i].weight = rng.int(s.maxWeight + 1);
    else {
      const occupied = new Set(
        edges.filter((_, j) => i !== j).map((e) => `${e.from}:${e.to}`),
      );
      const free = [];
      for (let from = 0; from < s.nodes; from++)
        for (let to = 0; to < s.nodes; to++)
          if (from !== to && !occupied.has(`${from}:${to}`))
            free.push({ from, to });
      edges[i] = {
        ...free[rng.int(free.length)],
        weight: rng.int(s.maxWeight + 1),
      };
    }
  }
  return { kind: "graph", nodes: s.nodes, edges };
}

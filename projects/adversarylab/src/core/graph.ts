import type { Execution, GraphAlgorithm, GraphInput } from "./types";
import { emptyMetrics } from "./sorting";
interface Entry {
  node: number;
  distance: number;
  serial: number;
}
export class MinHeap {
  private entries: Entry[] = [];
  get size(): number {
    return this.entries.length;
  }
  private less(a: Entry, b: Entry): boolean {
    return (
      a.distance < b.distance ||
      (a.distance === b.distance &&
        (a.node < b.node || (a.node === b.node && a.serial < b.serial)))
    );
  }
  push(e: Entry): void {
    this.entries.push(e);
    let i = this.size - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(this.entries[i], this.entries[p])) break;
      [this.entries[i], this.entries[p]] = [this.entries[p], this.entries[i]];
      i = p;
    }
  }
  pop(): Entry {
    if (!this.size) throw new Error("空优先队列");
    const top = this.entries[0],
      tail = this.entries.pop()!;
    if (this.size) {
      this.entries[0] = tail;
      let i = 0;
      while (true) {
        let next = i;
        const l = 2 * i + 1,
          r = l + 1;
        if (l < this.size && this.less(this.entries[l], this.entries[next]))
          next = l;
        if (r < this.size && this.less(this.entries[r], this.entries[next]))
          next = r;
        if (next === i) break;
        [this.entries[i], this.entries[next]] = [
          this.entries[next],
          this.entries[i],
        ];
        i = next;
      }
    }
    return top;
  }
}
export function graphSearch(
  g: GraphInput,
  algorithm: GraphAlgorithm,
): Execution {
  if (
    !Number.isInteger(g.nodes) ||
    g.nodes < 2 ||
    g.nodes > 20 ||
    g.edges.length > 100
  )
    throw new Error("图规模无效");
  const adjacency = Array.from(
      { length: g.nodes },
      () => [] as { to: number; weight: number }[],
    ),
    pairs = new Set<string>();
  for (const e of g.edges) {
    const key = `${e.from}:${e.to}`;
    if (
      ![e.from, e.to, e.weight].every(Number.isSafeInteger) ||
      e.from < 0 ||
      e.from >= g.nodes ||
      e.to < 0 ||
      e.to >= g.nodes ||
      e.from === e.to ||
      e.weight < 0 ||
      e.weight > 20 ||
      pairs.has(key)
    )
      throw new Error("仅支持无自环、无重边的非负整数权重有向图");
    pairs.add(key);
    adjacency[e.from].push({ to: e.to, weight: e.weight });
  }
  adjacency.forEach((a) => a.sort((x, y) => x.to - y.to));
  const m = emptyMetrics(),
    order: number[] = [],
    parent = Array(g.nodes).fill(-1) as number[],
    distance = Array(g.nodes).fill(Infinity) as number[];
  const target = g.nodes - 1;
  distance[0] = 0;
  if (algorithm === "dijkstra") {
    const heap = new MinHeap(),
      settled = new Set<number>();
    let serial = 0;
    heap.push({ node: 0, distance: 0, serial: serial++ });
    m.pushes++;
    while (heap.size) {
      const entry = heap.pop();
      m.pops++;
      if (entry.distance !== distance[entry.node] || settled.has(entry.node)) {
        m.stalePops++;
        continue;
      }
      const u = entry.node;
      settled.add(u);
      order.push(u);
      m.expanded++;
      if (u === target) break;
      for (const e of adjacency[u]) {
        m.edgeChecks++;
        const next = distance[u] + e.weight;
        if (!settled.has(e.to) && next < distance[e.to]) {
          distance[e.to] = next;
          parent[e.to] = u;
          heap.push({ node: e.to, distance: next, serial: serial++ });
          m.pushes++;
        }
      }
    }
  } else if (algorithm === "bfs") {
    const queue = [0],
      seen = new Set([0]);
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      order.push(u);
      m.expanded++;
      if (u === target) break;
      for (const e of adjacency[u]) {
        m.edgeChecks++;
        if (!seen.has(e.to)) {
          seen.add(e.to);
          parent[e.to] = u;
          distance[e.to] = distance[u] + 1;
          queue.push(e.to);
        }
      }
    }
  } else if (algorithm === "dfs") {
    const seen = new Set<number>();
    let found = false;
    const visit = (u: number): void => {
      seen.add(u);
      order.push(u);
      m.expanded++;
      if (u === target) {
        found = true;
        return;
      }
      for (const e of adjacency[u]) {
        m.edgeChecks++;
        if (!seen.has(e.to)) {
          parent[e.to] = u;
          distance[e.to] = distance[u] + 1;
          visit(e.to);
          if (found) return;
        }
      }
    };
    visit(0);
  } else throw new Error("未知图算法");
  const reachable = order.includes(target),
    path: number[] = [];
  if (reachable) {
    let u = target;
    while (u !== -1) {
      path.push(u);
      u = parent[u];
    }
    path.reverse();
  }
  return {
    metrics: m,
    order,
    path,
    distance: reachable ? distance[target] : null,
  };
}

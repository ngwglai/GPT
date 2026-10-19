import { describe, it, expect } from "vitest";
import { sort } from "../src/core/sorting";
import { graphSearch, MinHeap } from "../src/core/graph";
import { sortingAlgorithms } from "../src/core/types";
import type { GraphInput } from "../src/core/types";
import { Random } from "../src/core/random";
import { generate } from "../src/core/space";
const examples = [
  [],
  [0],
  [2, 2, 1, 1],
  [-4, 2, -9, 0],
  [1, 2, 3, 4],
  [4, 3, 2, 1],
  [3, -1, 2, 0, 9, -1],
  [5, 5, 5],
  [0, -1, 0, 1],
];
for (const algorithm of sortingAlgorithms)
  describe(algorithm, () => {
    it.each(examples.map((a) => [a]))(
      "sorts %j against native numeric reference without mutating input",
      (values) => {
        const before = [...values];
        expect(sort(values, algorithm).sorted).toEqual(
          [...values].sort((a, b) => a - b),
        );
        expect(values).toEqual(before);
      },
    );
    it("matches independent reference for 100 fixed seeds", () => {
      for (let seed = 0; seed < 100; seed++) {
        const rng = new Random(seed);
        const a = Array.from({ length: rng.int(65) }, () => rng.int(201) - 100);
        expect(sort(a, algorithm).sorted).toEqual([...a].sort((a, b) => a - b));
      }
    });
    it("rejects invalid numbers", () =>
      expect(() => sort([NaN], algorithm)).toThrow());
  });
it("insertion counts hand-computed comparisons and writes", () => {
  const { metrics: m } = sort([3, 2, 1], "insertion");
  expect(m.comparisons).toBe(3);
  expect(m.moves).toBe(5);
  expect(sort([1, 2, 3], "insertion").metrics.comparisons).toBe(2);
  expect(sort([1, 2, 3], "insertion").metrics.moves).toBe(2);
});
it("merge counts buffer and output writes separately", () => {
  const { metrics: m } = sort([3, 1, 2], "merge");
  expect(m.comparisons).toBe(3);
  expect(m.moves).toBe(10);
  expect(m.maxDepth).toBe(3);
});
it("quick first pivot counts swaps excluding self swaps", () => {
  const { metrics: m } = sort([3, 1, 2], "quick");
  expect(m.comparisons).toBe(3);
  expect(m.swaps).toBe(2);
  expect(m.maxDepth).toBe(3);
  expect(sort([1, 2, 3], "quick").metrics.swaps).toBe(0);
});
it("empty and singleton recursion depths are explicit", () => {
  for (const a of ["merge", "quick"] as const) {
    expect(sort([], a).metrics.maxDepth).toBe(0);
    expect(sort([1], a).metrics.maxDepth).toBe(1);
  }
});
const graph: GraphInput = {
  kind: "graph",
  nodes: 4,
  edges: [
    { from: 0, to: 2, weight: 1 },
    { from: 1, to: 3, weight: 2 },
    { from: 0, to: 1, weight: 4 },
    { from: 1, to: 2, weight: 1 },
    { from: 2, to: 3, weight: 8 },
  ],
};
it("BFS uses ascending adjacency, marks on enqueue and stops at goal expansion", () => {
  const r = graphSearch(graph, "bfs");
  expect(r.order).toEqual([0, 1, 2, 3]);
  expect(r.path).toEqual([0, 1, 3]);
  expect(r.distance).toBe(2);
  expect(r.metrics.expanded).toBe(4);
  expect(r.metrics.edgeChecks).toBe(5);
});
it("DFS uses recursive ascending adjacency and stops edge checks at target", () => {
  const r = graphSearch(graph, "dfs");
  expect(r.order).toEqual([0, 1, 2, 3]);
  expect(r.path).toEqual([0, 1, 2, 3]);
  expect(r.metrics.edgeChecks).toBe(3);
});
it("Dijkstra computes actual weighted shortest path with a heap", () => {
  const r = graphSearch(graph, "dijkstra");
  expect(r.order).toEqual([0, 2, 1, 3]);
  expect(r.path).toEqual([0, 1, 3]);
  expect(r.distance).toBe(6);
  expect(r.metrics.pushes).toBe(5);
  expect(r.metrics.pops).toBe(4);
});
it("Dijkstra discards stale entries and reports unreachable target", () => {
  const r = graphSearch(
    {
      kind: "graph",
      nodes: 5,
      edges: [
        { from: 0, to: 1, weight: 9 },
        { from: 0, to: 2, weight: 1 },
        { from: 2, to: 1, weight: 1 },
        { from: 1, to: 3, weight: 1 },
      ],
    },
    "dijkstra",
  );
  expect(r.metrics.stalePops).toBe(1);
  expect(r.metrics.pops).toBe(5);
  expect(r.metrics.expanded).toBe(4);
  expect(r.path).toEqual([]);
  expect(r.distance).toBeNull();
});
it("equal distances, zero cycles and reordered edges have deterministic paths", () => {
  const g: GraphInput = {
    kind: "graph",
    nodes: 4,
    edges: [
      { from: 0, to: 2, weight: 0 },
      { from: 0, to: 1, weight: 0 },
      { from: 1, to: 2, weight: 0 },
      { from: 2, to: 1, weight: 0 },
      { from: 1, to: 3, weight: 1 },
      { from: 2, to: 3, weight: 1 },
    ],
  };
  expect(graphSearch(g, "dijkstra").path).toEqual([0, 1, 3]);
  for (const a of ["bfs", "dfs", "dijkstra"] as const)
    expect(graphSearch(g, a)).toEqual(
      graphSearch({ ...g, edges: [...g.edges].reverse() }, a),
    );
});
it.each([-1, 0.5, NaN, Infinity, 21])(
  "rejects invalid Dijkstra weight %s",
  (weight) =>
    expect(() =>
      graphSearch(
        { kind: "graph", nodes: 2, edges: [{ from: 0, to: 1, weight }] },
        "dijkstra",
      ),
    ).toThrow(),
);
it("heap obeys distance, node and serial order", () => {
  const h = new MinHeap();
  const entries = [
    { node: 2, distance: 3, serial: 2 },
    { node: 1, distance: 3, serial: 9 },
    { node: 1, distance: 3, serial: 4 },
    { node: 2, distance: 0, serial: 0 },
  ];
  entries.forEach((e) => h.push(e));
  expect(Array.from({ length: 4 }, () => h.pop())).toEqual(
    [...entries].sort(
      (a, b) =>
        a.distance - b.distance || a.node - b.node || a.serial - b.serial,
    ),
  );
  expect(() => h.pop()).toThrow();
});
// Bellman-Ford and fixed-point reachability do not use production traversals/heap.
it("all graph algorithms match independent references over 100 graph seeds", () => {
  for (let seed = 0; seed < 100; seed++) {
    const g = generate(
      { kind: "graph", nodes: 7, edges: seed % 35, maxWeight: 9 },
      new Random(seed),
    ) as GraphInput;
    const distances = Array(7).fill(Infinity) as number[],
      hops = [...distances];
    distances[0] = 0;
    hops[0] = 0;
    for (let pass = 0; pass < 6; pass++)
      for (const e of g.edges) {
        distances[e.to] = Math.min(
          distances[e.to],
          distances[e.from] + e.weight,
        );
        hops[e.to] = Math.min(hops[e.to], hops[e.from] + 1);
      }
    for (const algorithm of ["bfs", "dfs", "dijkstra"] as const) {
      const r = graphSearch(g, algorithm),
        reachable = Number.isFinite(distances[6]);
      expect(r.path!.length > 0).toBe(reachable);
      expect(new Set(r.order).size).toBe(r.order!.length);
      expect(r.metrics.expanded).toBe(r.order!.length);
      if (algorithm !== "dfs")
        expect(r.distance).toBe(
          reachable ? (algorithm === "bfs" ? hops[6] : distances[6]) : null,
        );
      if (reachable) {
        expect(r.path![0]).toBe(0);
        expect(r.path!.at(-1)).toBe(6);
        let weight = 0;
        for (let i = 1; i < r.path!.length; i++) {
          const e = g.edges.find(
            (e) => e.from === r.path![i - 1] && e.to === r.path![i],
          );
          expect(e).toBeDefined();
          weight += e!.weight;
        }
        if (algorithm === "dijkstra") expect(weight).toBe(r.distance);
      }
    }
  }
});

import { it, expect } from "vitest";
import { Exact, optimalityRatio } from "../src/core/exact";
import { Search } from "../src/core/search";
import {
  defaultConfig,
  sortingAlgorithms,
  strategies,
} from "../src/core/types";
// Separate recursive permutation enumeration and separate comparison counter.
function permutations(a: number[]): number[][] {
  if (!a.length) return [[]];
  return a.flatMap((v, i) =>
    permutations(a.filter((_, j) => j !== i)).map((p) => [v, ...p]),
  );
}
function mergeReference(a: number[]): { values: number[]; cost: number } {
  if (a.length < 2) return { values: a, cost: 0 };
  const mid = Math.floor(a.length / 2),
    left = mergeReference(a.slice(0, mid)),
    right = mergeReference(a.slice(mid));
  let cost = left.cost + right.cost;
  const values = [];
  while (left.values.length && right.values.length) {
    cost++;
    values.push(
      left.values[0] <= right.values[0]
        ? left.values.shift()!
        : right.values.shift()!,
    );
  }
  return { values: [...values, ...left.values, ...right.values], cost };
}
function insertionReference(input: number[]): number {
  const prefix: number[] = [];
  let count = 0;
  for (const value of input) {
    let position = prefix.length;
    while (position > 0) {
      count++;
      if (prefix[position - 1] <= value) break;
      position--;
    }
    prefix.splice(position, 0, value);
  }
  return count;
}
function quickReference(input: number[]): number {
  if (input.length < 2) return 0;
  const [pivot, ...rest] = input;
  return (
    rest.length +
    quickReference(rest.filter((v) => v < pivot)) +
    quickReference(rest.filter((v) => v >= pivot))
  );
}
for (const algorithm of sortingAlgorithms)
  it.each([0, 1, 2, 3, 4, 5, 6])(
    `${algorithm} complete enumeration n=%s agrees with independent optimum`,
    (size) => {
      const e = new Exact(size, algorithm, "comparisons");
      while (e.result.reason === "running") e.step();
      const all = permutations(Array.from({ length: size }, (_, i) => i));
      const maximum = Math.max(
        ...all.map((a) =>
          algorithm === "merge"
            ? mergeReference(a).cost
            : algorithm === "insertion"
              ? insertionReference(a)
              : quickReference(a),
        ),
      );
      if (algorithm !== "merge")
        expect(maximum).toBe(Math.max(0, (size * (size - 1)) / 2));
      expect(e.result.evaluated).toBe(all.length);
      expect(e.result.complete).toBe(true);
      expect(e.result.optimum).toBe(maximum);
      for (const strategy of strategies) {
        const search = new Search({
          ...structuredClone(defaultConfig.experiment),
          algorithm,
          strategy,
          space: { kind: "sort", mode: "permutation", size, range: 0 },
          budget: 60,
        });
        for (let i = 0; i < 60; i++) search.step();
        expect(search.result.bestCost!).toBeLessThanOrEqual(maximum);
        expect(
          optimalityRatio(search.result.bestCost, e.result),
        ).toBeLessThanOrEqual(1);
      }
    },
  );
it("full n=8 enumerates all 40320 permutations", () => {
  const e = new Exact(8, "quick", "comparisons");
  while (e.result.reason === "running") e.step();
  expect(e.result.evaluated).toBe(40320);
  expect(e.result.optimum).toBe(28);
});
it("partial enumeration never publishes a claimed optimum", () => {
  const e = new Exact(5, "merge", "comparisons", 10);
  for (let i = 0; i < 11; i++) e.step();
  expect(e.result.evaluated).toBe(10);
  expect(e.result.complete).toBe(false);
  expect(e.result.optimum).toBeNull();
  expect(e.result.best).toBeNull();
  expect(e.result.reason).toBe("limit");
  expect(optimalityRatio(3, e.result)).toBeNull();
});
it("zero optimum is explicitly handled", () => {
  const e = new Exact(0, "quick", "comparisons");
  e.step();
  expect(e.result.optimum).toBe(0);
  expect(optimalityRatio(0, e.result)).toBe(1);
  expect(optimalityRatio(1, e.result)).toBeNull();
});
it.each(["cancelled", "timeout", "error"] as const)(
  "interrupted enumeration remains unknown: %s",
  (reason) => {
    const e = new Exact(8, "merge", "comparisons");
    e.step();
    e.stop(reason);
    e.step();
    expect(e.result.evaluated).toBe(1);
    expect(e.result.complete).toBe(false);
    expect(e.result.optimum).toBeNull();
    expect(e.result.reason).toBe(reason);
  },
);
it("rejects unsupported exact size and metric", () => {
  expect(() => new Exact(9, "merge", "comparisons")).toThrow();
  expect(() => new Exact(3, "merge", "expanded")).toThrow();
});

it("deferred exact task performs no algorithm work until explicitly begun", () => {
  const exact = new Exact(3, "insertion", "comparisons", 40320, true);
  exact.step();
  expect(exact.result.reason).toBe("pending");
  expect(exact.result.evaluated).toBe(0);
  exact.begin();
  while (exact.result.reason === "running") exact.step();
  expect(exact.result.complete).toBe(true);
  expect(exact.result.evaluated).toBe(6);
});
it.each(["cancelled", "timeout", "error", "proposal-limit"] as const)(
  "deferred exact interruption records zero evaluations and reason %s",
  (reason) => {
    const exact = new Exact(8, "merge", "comparisons", 40320, true);
    exact.stop(reason);
    exact.begin();
    exact.step();
    expect(exact.result.reason).toBe(reason);
    expect(exact.result.evaluated).toBe(0);
    expect(exact.result.complete).toBe(false);
    expect(exact.result.optimum).toBeNull();
  },
);

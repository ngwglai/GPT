import { it, expect } from "vitest";
import { Random } from "../src/core/random";
import {
  generate,
  mutate,
  validCandidate,
  validateConfig,
  validateBatch,
  canonical,
} from "../src/core/space";
import { defaultConfig, strategies } from "../src/core/types";
import type { Config, Space, SortInput } from "../src/core/types";
import { accepts, Search, temperature } from "../src/core/search";
const config = (): Config => structuredClone(defaultConfig.experiment);
const spaces: Space[] = [
  { kind: "sort", mode: "permutation", size: 12, range: 5 },
  { kind: "sort", mode: "repeated", size: 12, range: 3 },
  { kind: "sort", mode: "permutation", size: 0, range: 0 },
  { kind: "graph", nodes: 5, edges: 20, maxWeight: 0 },
  { kind: "graph", nodes: 5, edges: 0, maxWeight: 0 },
  { kind: "graph", nodes: 8, edges: 18, maxWeight: 9 },
];
it.each(spaces)(
  "generates and mutates legal candidates in fixed space %j",
  (space) => {
    const rng = new Random(129);
    let candidate = generate(space, rng);
    for (let i = 0; i < 300; i++) {
      expect(validCandidate(candidate, space)).toBe(true);
      const old = structuredClone(candidate);
      candidate = mutate(candidate, space, rng);
      expect(validCandidate(old, space)).toBe(true);
    }
  },
);
it("PRNG fixed uint32 seeds reproduce streams and distinct seeds differ", () => {
  const stream = (s: number) => {
    const r = new Random(s);
    return Array.from({ length: 100 }, () => r.next());
  };
  expect(stream(42)).toEqual(stream(42));
  expect(stream(42)).not.toEqual(stream(43));
  expect(() => new Random(1).int(0)).toThrow();
});
for (const strategy of strategies) {
  it(`${strategy} is reproducible, monotone, legal, and spends exactly the budget`, () => {
    for (const space of [spaces[0], spaces[1], spaces[5]]) {
      const c = {
        ...config(),
        space,
        algorithm:
          space.kind === "sort" ? ("quick" as const) : ("dijkstra" as const),
        metric:
          space.kind === "sort"
            ? ("comparisons" as const)
            : ("expanded" as const),
        strategy,
        budget: 250,
      };
      const a = new Search(c),
        b = new Search(c);
      for (let i = 0; i < c.budget; i++) {
        a.step();
        b.step();
      }
      expect(a.result).toEqual(b.result);
      expect(a.result.evaluations).toBe(c.budget);
      expect(a.result.generated).toBe(c.budget);
      expect(a.result.termination).toBe("budget");
      expect(validCandidate(a.result.best!, space)).toBe(true);
      a.result.history.forEach((p, i, h) => {
        expect(p.cost).toBeGreaterThanOrEqual(h[i - 1]?.cost ?? 0);
        expect(p.evaluation).toBeLessThanOrEqual(c.budget);
      });
      const before = structuredClone(a.result);
      a.step();
      a.stop("cancelled");
      expect(a.result).toEqual(before);
    }
  });
}
it("every duplicate is genuinely re-evaluated and charged", () => {
  const c = { ...config(), space: spaces[2], budget: 20 };
  const s = new Search(c);
  for (let i = 0; i < 20; i++) s.step();
  expect(s.result.evaluations).toBe(20);
  expect(s.result.duplicates).toBe(19);
  expect(s.result.bestCost).toBe(0);
});
it("invalid candidates cost proposals only and cannot loop forever", () => {
  const s = new Search(
    { ...config(), budget: 2 },
    { generate: () => ({ kind: "sort", values: [999] }) },
  );
  for (let i = 0; i < 21; i++) s.step();
  expect(s.result.generated).toBe(20);
  expect(s.result.rejected).toBe(20);
  expect(s.result.evaluations).toBe(0);
  expect(s.result.termination).toBe("proposal-limit");
});
it("evaluation exceptions spend one evaluation and terminate as error", () => {
  const s = new Search(config(), {
    evaluate: () => {
      throw new Error("synthetic");
    },
  });
  s.step();
  expect(s.result.evaluations).toBe(1);
  expect(s.result.failures).toBe(1);
  expect(s.result.best).toBeNull();
  expect(s.result.termination).toBe("error");
});
it("generation exception does not fabricate evaluation", () => {
  const s = new Search(config(), {
    generate: () => {
      throw new Error("synthetic");
    },
  });
  s.step();
  expect(s.result.generated).toBe(1);
  expect(s.result.evaluations).toBe(0);
  expect(s.result.termination).toBe("error");
});
it("cancel preserves checkpoint and prevents later evaluation", () => {
  const s = new Search(config());
  s.step();
  s.stop("cancelled");
  s.step();
  expect(s.result.evaluations).toBe(1);
  expect(s.result.termination).toBe("cancelled");
});
it("SA temperature has exact endpoints, clamps and budget-one boundary", () => {
  expect(temperature(10, 0.1, 0, 100)).toBe(10);
  expect(temperature(10, 0.1, 99, 100)).toBeCloseTo(0.1);
  expect(temperature(10, 0.1, 300, 100)).toBeCloseTo(0.1);
  expect(temperature(10, 0.1, -1, 100)).toBe(10);
  expect(temperature(10, 0.1, 0, 1)).toBe(10);
  expect(() => temperature(1, 0, 0, 1)).toThrow();
});
it("SA acceptance uses exp(delta/T), including equality and underflow", () => {
  expect(accepts(0, 1, 0.99)).toBe(true);
  expect(accepts(3, 1, 0.99)).toBe(true);
  expect(accepts(-1, 1, 0.36)).toBe(true);
  expect(accepts(-1, 1, 0.37)).toBe(false);
  expect(accepts(-10000, 0.001, 0)).toBe(false);
  expect(() => accepts(-1, 0, 0)).toThrow();
  expect(() => accepts(-1, 1, 1)).toThrow();
});
it("hill rejects downhill moves, SA can accept them", () => {
  const initial: SortInput = { kind: "sort", values: [2, 1, 0] },
    low: SortInput = { kind: "sort", values: [0, 1, 2] };
  const from: number[][] = [];
  const s = new Search(
    {
      ...config(),
      space: { kind: "sort", mode: "permutation", size: 3, range: 0 },
      budget: 3,
    },
    {
      generate: () => initial,
      mutate: (candidate) => {
        from.push((candidate as SortInput).values);
        return low;
      },
    },
  );
  s.step();
  s.step();
  s.step();
  expect(from).toEqual([initial.values, initial.values]);
  const annealingFrom: number[][] = [];
  const annealing = new Search(
    {
      ...config(),
      strategy: "annealing",
      initialTemperature: 1000000,
      finalTemperature: 1000000,
      space: { kind: "sort", mode: "permutation", size: 3, range: 0 },
      budget: 3,
    },
    {
      generate: () => initial,
      mutate: (candidate) => {
        annealingFrom.push((candidate as SortInput).values);
        return low;
      },
    },
  );
  annealing.step();
  annealing.step();
  annealing.step();
  expect(annealingFrom).toEqual([initial.values, low.values]);
});
it("canonical graph key ignores edge storage order", () => {
  const g = generate(spaces[5], new Random(1));
  if (g.kind !== "graph") throw new Error();
  expect(canonical(g)).toBe(canonical({ ...g, edges: [...g.edges].reverse() }));
});
it.each([0, 20001, NaN, 1.5])("rejects budget %s", (budget) =>
  expect(() => validateConfig({ ...config(), budget })).toThrow(),
);
it("rejects wrong metric, graph bounds, invalid seeds and non-permutation exact", () => {
  expect(() => validateConfig({ ...config(), metric: "expanded" })).toThrow();
  expect(() =>
    validateConfig({
      ...config(),
      algorithm: "dijkstra",
      space: { kind: "graph", nodes: 4, edges: 13, maxWeight: 1 },
      metric: "expanded",
    }),
  ).toThrow();
  expect(() =>
    validateBatch({ ...structuredClone(defaultConfig), seeds: [1, 1] }),
  ).toThrow();
  expect(() =>
    validateBatch({ ...structuredClone(defaultConfig), seeds: [NaN] }),
  ).toThrow();
  expect(() =>
    validateBatch({
      ...structuredClone(defaultConfig),
      experiment: { ...config(), space: spaces[1] },
    }),
  ).toThrow();
});

it("snapshots and freezes constraints and budget so caller edits cannot alter a running experiment", () => {
  const c = { ...config(), budget: 4 };
  const search = new Search(c);
  const original = structuredClone(c);
  c.budget = 10000;
  if (c.space.kind === "sort") c.space.size = 64;
  for (let i = 0; i < 10; i++) search.step();
  expect(search.result.config).toEqual(original);
  expect(search.result.evaluations).toBe(4);
  expect(
    search.result.best?.kind === "sort" && search.result.best.values.length,
  ).toBe(8);
  expect(search.result.termination).toBe("budget");
  expect(Object.isFrozen(search.config)).toBe(true);
  expect(Object.isFrozen(search.config.space)).toBe(true);
});

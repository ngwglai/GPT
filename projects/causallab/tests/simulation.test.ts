import { describe, expect, it } from "vitest";
import { random } from "../src/core/random";
import {
  condition,
  expectedOutcome,
  generate,
  intervene,
  trueATE,
} from "../src/core/simulation";
import { examples, loadExample } from "../src/core/examples";
import type { Model } from "../src/core/model";
import {
  interventionAnalysis,
  observe,
  type Settings,
} from "../src/core/analysis";
import {
  correlation,
  naive,
  regression,
  summarize,
  values,
} from "../src/core/statistics";
export const continuous: Model = {
  schemaVersion: 1,
  name: "Continuous confounding",
  variables: [
    {
      id: "U",
      label: "U",
      kind: "linear",
      intercept: 0,
      weights: {},
      noiseStd: 1,
    },
    {
      id: "X",
      label: "X",
      kind: "linear",
      intercept: 0,
      weights: { U: 1 },
      noiseStd: 1,
    },
    {
      id: "Y",
      label: "Y",
      kind: "linear",
      intercept: 0,
      weights: { X: 2, U: 3 },
      noiseStd: 1,
    },
  ],
};
const config = { n: 20_000, seed: 42 };
const settings = (e = loadExample("confounding")): Settings => ({
  ...config,
  treatment: e.treatment,
  outcome: e.outcome,
  group: e.group,
  low: 0,
  high: 1,
});
function point(result: ReturnType<typeof naive>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
describe("deterministic simulation", () => {
  it("pins Mulberry32 output and reproduces streams", () => {
    const a = random(1),
      b = random(1);
    expect(a()).toBe(0.6270739405881613);
    b();
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it("generates identical data for the same seed, including zero seed", () => {
    const m = loadExample("confounding").model;
    expect(generate(m, { n: 50, seed: 0 })).toEqual(
      generate(m, { n: 50, seed: 0 }),
    );
    expect(generate(m, { n: 50, seed: 1 })).not.toEqual(
      generate(m, { n: 50, seed: 0 }),
    );
  });
  it("evaluates exact linear equations in dependency order", () => {
    const m = structuredClone(continuous);
    m.variables.forEach((v) => (v.noiseStd = 0));
    m.variables[0].intercept = 2;
    m.variables.reverse();
    expect(generate(m, { n: 1, seed: 4 })).toEqual([{ U: 2, X: 2, Y: 10 }]);
    expect(expectedOutcome(m, "Y")).toBe(10);
  });
  it("binary frequency follows configured affine probabilities", () => {
    const m = loadExample("confounding").model,
      d = generate(m, config);
    expect(summarize(values(d, "U")).mean).toBeCloseTo(0.5, 1);
    expect(summarize(values(condition(d, "U", 1), "X")).mean).toBeCloseTo(
      0.9,
      1,
    );
  });
  it.each([-1, 1.5, 2 ** 32, NaN, Infinity])(
    "rejects invalid seed %s",
    (seed) => expect(() => random(seed)).toThrow(),
  );
  it.each([0, -1, 1.1, 20_001, NaN, Infinity])("rejects invalid n %s", (n) =>
    expect(() => generate(continuous, { n, seed: 1 })).toThrow(),
  );
});
describe("do is equation replacement, never conditional selection", () => {
  it("preserves exact factual generation and every nondescendant value", () => {
    const m = loadExample("confounding").model,
      w = intervene(m, config, "X", 0, 1);
    expect(w.factual).toEqual(generate(m, config));
    for (let i = 0; i < config.n; i++) {
      expect(w.low[i].U).toBe(w.high[i].U);
      expect(w.low[i].U).toBe(w.factual[i].U);
      expect(w.high[i].Y - w.low[i].Y).toBeCloseTo(2, 12);
      expect(w.low[i].X).toBe(0);
      expect(w.high[i].X).toBe(1);
    }
  });
  it("selection keeps factual mechanisms and reduces n; do retains n and U distribution", () => {
    const m = loadExample("confounding").model,
      w = intervene(m, config, "X", 0, 1),
      selected = condition(w.factual, "X", 1);
    expect(selected.length).toBeLessThan(config.n);
    expect(summarize(values(selected, "U")).mean!).toBeGreaterThan(0.85);
    expect(summarize(values(w.high, "U")).mean!).toBeCloseTo(0.5, 1);
    expect(w.high.length).toBe(config.n);
  });
  it("validates missing outcomes, interventions and condition inputs", () => {
    expect(() => trueATE(continuous, "X", "X", 0, 1)).toThrow();
    expect(() => expectedOutcome(continuous, "Z")).toThrow();
    expect(() => intervene(continuous, config, "Z", 0, 1)).toThrow();
    expect(() => intervene(continuous, config, "X", 0, Infinity)).toThrow();
    expect(() =>
      intervene(loadExample("collider").model, config, "A", 0, 0.5),
    ).toThrow();
    expect(() => condition([{ X: NaN }], "X", 1)).toThrow();
    expect(() => condition([{ X: 0 }], "Z", 1)).toThrow();
  });
  it("propagates total effects through mediators", () => {
    const m = structuredClone(continuous);
    m.variables[1].weights = { U: 2 };
    m.variables[2].weights = { X: 3 };
    expect(trueATE(m, "U", "Y", 0, 1)).toBe(6);
    const w = intervene(m, { n: 10, seed: 1 }, "U", 0, 1);
    w.high.forEach((r, i) => expect(r.Y - w.low[i].Y).toBeCloseTo(6));
  });
  it("binary outcome has known true effect and nonzero Monte Carlo uncertainty", () => {
    const m: Model = {
      schemaVersion: 1,
      name: "Binary outcome",
      variables: [
        {
          id: "X",
          label: "X",
          kind: "bernoulli",
          intercept: 0.5,
          weights: {},
          noiseStd: 0,
        },
        {
          id: "Y",
          label: "Y",
          kind: "bernoulli",
          intercept: 0.1,
          weights: { X: 0.5 },
          noiseStd: 0,
        },
      ],
    };
    const r = interventionAnalysis(m, { ...settings(), group: "", n: 20_000 });
    expect(r.result.trueATE).toBe(0.5);
    expect(point(r.result.ate)).toBeCloseTo(0.5, 1);
    if (r.result.ate.ok) expect(r.result.ate.se).toBeGreaterThan(0);
  });
});
describe("mathematical reference models, multiple fixed seeds", () => {
  it.each([1, 7, 42, 2026, 98765])(
    "continuous confounding, seed %s: true ATE 2 despite biased association",
    (seed) => {
      const d = generate(continuous, { ...config, seed });
      expect(trueATE(continuous, "X", "Y", 0, 1)).toBe(2);
      expect(point(regression(d, "X", "Y"))).toBeGreaterThan(3.35);
      expect(Math.abs(point(regression(d, "X", "Y", ["U"])) - 2)).toBeLessThan(
        0.05,
      );
      const r = interventionAnalysis(continuous, {
        ...settings(),
        seed,
        group: "U",
      });
      expect(point(r.result.ate)).toBeCloseTo(2, 12);
      expect(Math.abs(r.result.error!)).toBeLessThan(1e-12);
    },
  );
  it.each([1, 7, 42, 2026, 98765])(
    "three cases retain expected population phenomena, seed %s",
    (seed) => {
      for (const e of examples) {
        const s = { ...settings(e), seed },
          d = generate(e.model, s),
          o = observe(e.model, d, s),
          truth = trueATE(e.model, e.treatment, e.outcome, 0, 1);
        if (e.id === "confounding") {
          expect(Math.abs(point(o.naive) - 6.8)).toBeLessThan(0.2);
          expect(Math.abs(point(o.adjusted) - 2)).toBeLessThan(0.15);
          expect(truth).toBe(2);
        }
        if (e.id === "simpson") {
          expect(point(o.naive)).toBeLessThan(-5.7);
          o.groups.forEach((g) =>
            expect(point(g.difference)).toBeGreaterThan(1.8),
          );
          expect(truth).toBe(2);
          expect(Math.abs(point(o.adjusted) - 2)).toBeLessThan(0.15);
        }
        if (e.id === "collider") {
          const c = correlation(values(d, "A"), values(d, "B"));
          expect(c.ok && Math.abs(c.value)).toBeLessThan(0.035);
          const selected = condition(d, "C", 1),
            sc = correlation(values(selected, "A"), values(selected, "B"));
          expect(sc.ok && sc.value).toBeLessThan(-0.2);
          expect(truth).toBe(0);
          expect(o.groupNote).toContain("后代");
        }
      }
    },
  );
  it("unconfounded known effect: both regression and intervention match 2", () => {
    const m = structuredClone(continuous);
    m.variables[1].weights = {};
    m.variables[2].weights = { X: 2 };
    const d = generate(m, config);
    expect(Math.abs(point(regression(d, "X", "Y")) - 2)).toBeLessThan(0.04);
    expect(trueATE(m, "X", "Y", -1, 2)).toBe(6);
  });
});

it("analytic ATE cancels large common offsets before subtraction", () => {
  const variables: Model["variables"] = [
    {
      id: "X",
      label: "X",
      kind: "linear",
      intercept: 0,
      weights: {},
      noiseStd: 1,
    },
    {
      id: "A",
      label: "A",
      kind: "linear",
      intercept: 100,
      weights: {},
      noiseStd: 0,
    },
  ];
  let parent = "A";
  for (let i = 0; i < 8; i++) {
    const id = "V" + i;
    variables.push({
      id,
      label: id,
      kind: "linear",
      intercept: 0,
      weights: { [parent]: 100 },
      noiseStd: 0,
    });
    parent = id;
  }
  variables.push({
    id: "Y",
    label: "Y",
    kind: "linear",
    intercept: 0,
    weights: { [parent]: 100, X: 2 },
    noiseStd: 0,
  });
  const model: Model = { schemaVersion: 1, name: "Large offset", variables };
  expect(trueATE(model, "X", "Y", 0, 1)).toBe(2);
});

import { it, expect } from "vitest";
import { Search } from "../src/core/search";
import { summarize } from "../src/core/statistics";
import { csv, report } from "../src/core/export";
import { defaultConfig } from "../src/core/types";
import type { Snapshot } from "../src/core/types";
function result(seed: number) {
  const s = new Search({
    ...structuredClone(defaultConfig.experiment),
    seed,
    budget: 20,
  });
  for (let i = 0; i < 20; i++) s.step();
  return s.result;
}
it("statistics reflect actual per-seed costs, population deviation and counts", () => {
  const a = result(1),
    b = result(2),
    r = summarize([a, b])[0],
    mean = (a.bestCost! + b.bestCost!) / 2;
  expect(r.mean).toBe(mean);
  expect(r.standardDeviation).toBe(Math.abs(a.bestCost! - b.bestCost!) / 2);
  expect(r.evaluations).toBe(40);
  expect(r.runs).toBe(2);
  expect(r.completed).toBe(2);
});
it("JSON includes config, cost definition, termination and exact state", () => {
  const r = result(42);
  const snapshot: Snapshot = {
    status: "cancelled",
    results: [r],
    current: null,
    exact: null,
  };
  const data = JSON.parse(JSON.stringify(report(defaultConfig, snapshot)));
  expect(data.records[0]).toEqual(r);
  expect(data.status).toBe("cancelled");
  expect(data.config).toEqual(defaultConfig);
  expect(data.costDefinition).toBe("元素比较次数");
  expect(data.exact).toBeNull();
});
it("CSV quotes nested JSON and keeps real counters and metadata", () => {
  const r = result(42),
    text = csv(defaultConfig, {
      status: "budget",
      results: [r],
      current: null,
      exact: null,
    });
  expect(text).toContain('"evaluations"');
  expect(text).toContain('"20"');
  expect(text).toContain('"budget"');
  expect(text).toContain('""values""');
  expect(text).toContain('"batchConfig"');
  expect(text).toContain('"history"');
});
it("pre-start error remains exportable without inventing results", () => {
  const snap: Snapshot = {
    status: "error",
    error: "synthetic",
    results: [],
    current: null,
    exact: null,
  };
  expect(report(defaultConfig, snap).records).toEqual([]);
  expect(csv(defaultConfig, snap)).toContain("synthetic");
});

it("partial runs retain actual counters but do not contaminate full-budget statistics", () => {
  const full = result(1),
    partial = result(2);
  partial.termination = "cancelled";
  partial.bestCost = 999;
  const summary = summarize([full, partial])[0];
  expect(summary.best).toBe(full.bestCost);
  expect(summary.mean).toBe(full.bestCost);
  expect(summary.completed).toBe(1);
  expect(summary.runs).toBe(2);
  expect(summary.evaluations).toBe(40);
});

it("CSV can be independently parsed back to the actual inputs, counters and execution", () => {
  const run = result(42);
  const snapshot: Snapshot = {
    status: "budget",
    results: [run],
    current: null,
    exact: null,
  };
  const text = csv(defaultConfig, snapshot).replace(/^\uFEFF/, "");
  const lines = text
    .split("\r\n")
    .map((line) =>
      [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((match) =>
        match[1].replaceAll('""', '"'),
      ),
    );
  const row = Object.fromEntries(lines[0].map((key, i) => [key, lines[1][i]]));
  expect(Number(row.evaluations)).toBe(run.evaluations);
  expect(Number(row.generated)).toBe(run.generated);
  expect(JSON.parse(row.bestInput)).toEqual(run.best);
  expect(JSON.parse(row.execution)).toEqual(run.execution);
  expect(JSON.parse(row.history)).toEqual(run.history);
  expect(JSON.parse(row.batchConfig)).toEqual(defaultConfig);
  expect(row.termination).toBe(run.termination);
  expect(row.metricSemantics).toContain("元素值比较");
  expect(row.statisticsPopulation).toContain("evaluation-budget-completed");
});

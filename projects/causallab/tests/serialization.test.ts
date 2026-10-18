import { describe, expect, it } from "vitest";
import { loadExample } from "../src/core/examples";
import { generate } from "../src/core/simulation";
import {
  interventionAnalysis,
  observe,
  type Settings,
} from "../src/core/analysis";
import {
  experimentJSON,
  makeReport,
  parseExperiment,
  parseModel,
  reportCSV,
} from "../src/core/serialization";
const e = loadExample("confounding"),
  s: Settings = {
    n: 500,
    seed: 0,
    treatment: "X",
    outcome: "Y",
    group: "U",
    low: 0,
    high: 1,
  };
describe("strict bounded imports and reproducible exports", () => {
  it("model JSON round trip preserves generation", () => {
    const m = parseModel(JSON.stringify(e.model));
    expect(generate(m, s)).toEqual(generate(e.model, s));
  });
  it("experiment round trip preserves all parameters and both analyses", () => {
    const before = generate(e.model, s),
      loaded = parseExperiment(experimentJSON(e.model, s));
    expect(loaded.model).toEqual(e.model);
    expect(loaded.settings).toEqual(s);
    expect(generate(loaded.model, loaded.settings)).toEqual(before);
    expect(interventionAnalysis(loaded.model, loaded.settings)).toEqual(
      interventionAnalysis(e.model, s),
    );
  });
  it("report JSON and CSV include semantics, sample size, seed, true ATE, summaries and method", () => {
    const d = generate(e.model, s),
      r = makeReport(
        e.model,
        s,
        observe(e.model, d, s),
        interventionAnalysis(e.model, s).result,
      ),
      json = JSON.parse(JSON.stringify(r)) as typeof r;
    expect(json.trueATE).toBe(2);
    expect(json.settings).toEqual(s);
    expect(json.intervention?.n).toBe(500);
    const csv = reportCSV(r);
    for (const word of [
      "scope",
      "seed",
      "true_ATE",
      "model_JSON",
      "settings_JSON",
      "paired_ATE",
      "conditional",
      "variance",
      "estimate_minus_truth",
    ])
      expect(csv).toContain(word);
  });
  it("CSV quotes user labels, escapes quotes and protects formula cells", () => {
    const m = structuredClone(e.model);
    m.variables[0].label = '=SUM(1,2) "test"';
    const r = makeReport(m, s, observe(m, generate(m, s), s), null);
    r.semantics = '=SUM(1,2) "test"';
    const csv = reportCSV(r);
    expect(csv).toContain('"\'=SUM(1,2) ""test"""');
    expect(csv).not.toContain("\"'-2");
  });
  it.each(["", "{", "null", "[]", '{"schemaVersion":1}'])(
    "rejects malformed model %j",
    (text) => expect(() => parseModel(text)).toThrow(),
  );
  it("enforces UTF-8 byte budget even for multibyte text", () => {
    expect(() => parseModel(" ".repeat(65_537))).toThrow(/64 KiB/);
    expect(() => parseModel("中".repeat(22_000))).toThrow(/64 KiB/);
  });
  it("rejects missing settings and unknown experiment fields", () => {
    expect(() =>
      parseExperiment(
        JSON.stringify({
          format: "causallab-experiment-v1",
          model: e.model,
          settings: { n: 5 },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseExperiment(
        JSON.stringify({
          ...JSON.parse(experimentJSON(e.model, s)),
          extra: true,
        }),
      ),
    ).toThrow();
  });
  it.each([
    { n: 0 },
    { seed: -1 },
    { low: 0.5 },
    { high: Infinity },
    { treatment: "Z" },
    { outcome: "X" },
    { group: "missing" },
    { n: "10" },
    { seed: null },
  ])("rejects illegal experiment settings %j", (patch) => {
    const obj = {
      format: "causallab-experiment-v1",
      model: e.model,
      settings: { ...s, ...patch },
    };
    expect(() => parseExperiment(JSON.stringify(obj))).toThrow();
  });
});

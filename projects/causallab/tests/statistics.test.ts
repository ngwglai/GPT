import { describe, expect, it } from "vitest";
import {
  correlation,
  critical95,
  difference,
  histogram,
  meanEstimate,
  naive,
  regression,
  standardized,
  summarize,
  values,
} from "../src/core/statistics";
describe("independent small arithmetic fixtures", () => {
  it("sample variance uses n−1 and stable mean", () => {
    expect(summarize([1, 2, 3, 4, 5])).toEqual({
      n: 5,
      mean: 3,
      variance: 2.5,
      sd: Math.sqrt(2.5),
      min: 1,
      max: 5,
    });
    expect(summarize([1e10 + 1, 1e10 + 2, 1e10 + 3]).variance).toBe(1);
  });
  it("mean standard error and Student t confidence interval", () => {
    const r = meanEstimate([1, 2, 3, 4, 5]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(3);
      expect(r.se).toBeCloseTo(Math.sqrt(0.5), 12);
      expect(r.ci[0]).toBeCloseTo(3 - 2.7764 * Math.sqrt(0.5), 8);
    }
  });
  it("Welch difference and its standard error", () => {
    const r = difference([1, 2, 3], [3, 4, 5]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(2);
      expect(r.se).toBeCloseTo(Math.sqrt(2 / 3), 12);
      expect(r.ci[0]).toBeCloseTo(2 - 2.7764 * Math.sqrt(2 / 3), 8);
    }
  });
  it("OLS slope, residual variance, SE and CI agree with hand calculation", () => {
    const d = [
      { X: 0, Y: 1 },
      { X: 1, Y: 2 },
      { X: 2, Y: 2 },
      { X: 3, Y: 4 },
    ];
    const r = regression(d, "X", "Y");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeCloseTo(0.9, 12);
      expect(r.se).toBeCloseTo(Math.sqrt(0.35 / 5), 12);
      expect(r.ci[0]).toBeCloseTo(0.9 - 4.3027 * Math.sqrt(0.35 / 5), 8);
    }
  });
  it("QR adjustment agrees with exact multivariate affine data", () => {
    const d = Array.from({ length: 50 }, (_, i) => ({
      X: i % 7,
      U: Math.floor(i / 7),
      Y: 4 + 2 * (i % 7) - 3 * Math.floor(i / 7),
    }));
    const r = regression(d, "X", "Y", ["U"]);
    expect(r.ok && r.value).toBeCloseTo(2, 12);
  });
  it("correlations have correct sign and scale", () => {
    expect(correlation([1, 2, 3], [6, 4, 2])).toEqual({
      ok: true,
      n: 3,
      value: -1,
    });
    expect(correlation([1, 2, 3], [2, 4, 6])).toEqual({
      ok: true,
      n: 3,
      value: 1,
    });
  });
  it("standardization weights subgroups using whole sample proportions", () => {
    const data = [0, 1].flatMap((G) =>
      [0, 1].flatMap((X) =>
        Array.from({ length: G === 0 ? 4 : 2 }, () => ({
          G,
          X,
          Y: 10 * G + 2 * X,
        })),
      ),
    );
    const r = standardized(data, "X", "Y", ["G"]);
    expect(r.ok && r.value).toBe(2);
    expect(r.ok && r.se).toBe(0);
  });
  it("histogram bins sum to n, including right endpoint and constants", () => {
    const h = histogram([0, 1, 2, 3, 4], 2);
    expect(h.map((x) => x.count)).toEqual([2, 3]);
    expect(histogram([2, 2, 2])).toEqual([{ start: 2, end: 3, count: 3 }]);
    expect(histogram([])).toEqual([]);
  });
  it("critical values converge to normal and grow for tiny samples", () => {
    expect(critical95(1)).toBeGreaterThan(12);
    expect(critical95(1000)).toBeCloseTo(1.96234, 4);
    expect(critical95(Infinity)).toBeCloseTo(1.959964, 6);
  });
});
describe("honest unavailable estimates and invalid inputs", () => {
  it("handles empty and singleton samples without invented variances", () => {
    expect(summarize([]).mean).toBeNull();
    expect(summarize([5]).variance).toBeNull();
    expect(meanEstimate([]).ok).toBe(false);
    expect(meanEstimate([5]).ok).toBe(false);
    expect(difference([], [1, 2]).ok).toBe(false);
    expect(regression([], "X", "Y").ok).toBe(false);
  });
  it("constant correlation, collinear regression and tiny samples are unavailable", () => {
    expect(correlation([1, 1, 1], [1, 2, 3]).ok).toBe(false);
    expect(correlation([1], [2]).ok).toBe(false);
    expect(
      regression(
        [
          { X: 0, Y: 0 },
          { X: 1, Y: 1 },
        ],
        "X",
        "Y",
      ).ok,
    ).toBe(false);
    const d = Array.from({ length: 5 }, (_, i) => ({ X: i, Z: 2 * i, Y: i }));
    expect(regression(d, "X", "Y", ["Z"]).ok).toBe(false);
    expect(regression(d, "X", "Y", ["X"]).ok).toBe(false);
  });
  it("continuous treatment cannot use naive binary estimator", () =>
    expect(naive([{ X: 0.5, Y: 2 }], "X", "Y").ok).toBe(false));
  it("adjustment refuses absent overlap and nonbinary strata", () => {
    expect(
      standardized(
        [
          { G: 0, X: 0, Y: 1 },
          { G: 0, X: 0, Y: 2 },
        ],
        "X",
        "Y",
        ["G"],
      ).ok,
    ).toBe(false);
    expect(standardized([{ G: 0.5, X: 0, Y: 1 }], "X", "Y", ["G"]).ok).toBe(
      false,
    );
    expect(standardized([], "X", "Y", ["G"]).ok).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity])("rejects nonfinite %s", (value) => {
    expect(() => summarize([value])).toThrow();
    expect(() => values([{ X: value }], "X")).toThrow();
  });
  it("rejects missing variables, size mismatch and invalid bin counts", () => {
    expect(() => values([{}], "X")).toThrow();
    expect(() => correlation([1], [])).toThrow();
    expect(() => histogram([1], 0)).toThrow();
  });
});

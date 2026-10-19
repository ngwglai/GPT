import type { ExactResult, Metric, SortAlgorithm } from "./types";
import { sort } from "./sorting";
import { metricsFor } from "./types";
// Lexicographic successor, independent of heuristic candidate generation and search state.
function successor(a: number[]): boolean {
  let i = a.length - 2;
  while (i >= 0 && a[i] >= a[i + 1]) i--;
  if (i < 0) return false;
  let j = a.length - 1;
  while (a[j] <= a[i]) j--;
  [a[i], a[j]] = [a[j], a[i]];
  for (let l = i + 1, r = a.length - 1; l < r; l++, r--)
    [a[l], a[r]] = [a[r], a[l]];
  return true;
}
export class Exact {
  readonly result: ExactResult;
  private permutation: number[];
  private maximum: number | null = null;
  private best: number[] | null = null;
  constructor(
    size: number,
    readonly algorithm: SortAlgorithm,
    readonly metric: Metric,
    readonly limit = 40320,
  ) {
    if (
      !Number.isInteger(size) ||
      size < 0 ||
      size > 8 ||
      !metricsFor(algorithm).includes(metric) ||
      !Number.isInteger(limit) ||
      limit < 0 ||
      limit > 40320
    )
      throw new Error("精确穷举参数无效");
    this.permutation = Array.from({ length: size }, (_, i) => i);
    let total = 1;
    for (let i = 2; i <= size; i++) total *= i;
    this.result = {
      complete: false,
      evaluated: 0,
      total,
      optimum: null,
      best: null,
      reason: "running",
    };
  }
  stop(reason: "cancelled" | "timeout" | "error"): void {
    if (this.result.reason === "running") this.result.reason = reason;
  }
  step(): void {
    const r = this.result;
    if (r.reason !== "running") return;
    if (r.evaluated >= this.limit) {
      r.reason = "limit";
      return;
    }
    try {
      const cost = sort(this.permutation, this.algorithm).metrics[this.metric];
      r.evaluated++;
      if (this.maximum === null || cost > this.maximum) {
        this.maximum = cost;
        this.best = [...this.permutation];
      }
      if (!successor(this.permutation)) {
        r.complete = true;
        r.reason = "complete";
        r.optimum = this.maximum;
        r.best = { kind: "sort", values: this.best! };
      }
    } catch {
      r.reason = "error";
      r.error = "精确穷举执行异常";
    }
  }
}
export function optimalityRatio(
  best: number | null,
  exact: ExactResult | null,
): number | null {
  if (best === null || !exact?.complete || exact.optimum === null) return null;
  if (exact.optimum === 0) return best === 0 ? 1 : null;
  return best / exact.optimum;
}

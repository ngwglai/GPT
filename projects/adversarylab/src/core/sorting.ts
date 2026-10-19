import type { Execution, Metrics, SortAlgorithm } from "./types";
export function emptyMetrics(): Metrics {
  return {
    comparisons: 0,
    moves: 0,
    swaps: 0,
    maxDepth: 0,
    expanded: 0,
    edgeChecks: 0,
    pushes: 0,
    pops: 0,
    stalePops: 0,
  };
}
export function sort(
  values: readonly number[],
  algorithm: SortAlgorithm,
): Execution {
  if (values.some((v) => !Number.isSafeInteger(v)))
    throw new Error("排序只支持安全整数");
  const a = [...values],
    m = emptyMetrics();
  if (algorithm === "insertion") {
    for (let i = 1; i < a.length; i++) {
      const key = a[i];
      let j = i - 1;
      while (j >= 0) {
        m.comparisons++;
        if (a[j] <= key) break;
        a[j + 1] = a[j];
        m.moves++;
        j--;
      }
      a[j + 1] = key;
      m.moves++;
    }
  } else if (algorithm === "merge") {
    const visit = (lo: number, hi: number, depth: number): void => {
      m.maxDepth = Math.max(m.maxDepth, depth);
      if (hi - lo < 2) return;
      const mid = Math.floor((lo + hi) / 2);
      visit(lo, mid, depth + 1);
      visit(mid, hi, depth + 1);
      const temp: number[] = [];
      let i = lo,
        j = mid;
      while (i < mid && j < hi) {
        m.comparisons++;
        temp.push(a[i] <= a[j] ? a[i++] : a[j++]);
        m.moves++;
      }
      while (i < mid) {
        temp.push(a[i++]);
        m.moves++;
      }
      while (j < hi) {
        temp.push(a[j++]);
        m.moves++;
      }
      temp.forEach((v, k) => {
        a[lo + k] = v;
        m.moves++;
      });
    };
    if (a.length) visit(0, a.length, 1);
  } else if (algorithm === "quick") {
    const swap = (i: number, j: number): void => {
      if (i !== j) {
        [a[i], a[j]] = [a[j], a[i]];
        m.swaps++;
        m.moves += 2;
      }
    };
    const visit = (lo: number, hi: number, depth: number): void => {
      m.maxDepth = Math.max(m.maxDepth, depth);
      if (lo >= hi) return;
      const pivot = a[lo];
      let boundary = lo;
      for (let j = lo + 1; j <= hi; j++) {
        m.comparisons++;
        if (a[j] < pivot) {
          boundary++;
          swap(boundary, j);
        }
      }
      swap(lo, boundary);
      if (lo < boundary) visit(lo, boundary - 1, depth + 1);
      if (boundary < hi) visit(boundary + 1, hi, depth + 1);
    };
    if (a.length) visit(0, a.length - 1, 1);
  } else throw new Error("未知排序算法");
  return { sorted: a, metrics: m };
}

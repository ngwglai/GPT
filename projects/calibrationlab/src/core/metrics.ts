import { integer } from './data';
import type { Bin, Evaluation, Prediction } from './types';
export const LOG_EPSILON = 1e-15;
export function probability(p: number): void {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('预测概率须为 [0,1] 内的有限数');
}
export function validateRows(rows: readonly Prediction[]): void {
  if (rows.length > 20000) throw new Error('样本数超过 20000 上限');
  for (const row of rows) {
    probability(row.probability);
    if (row.outcome !== 0 && row.outcome !== 1) throw new Error('观测标签须为 0 或 1');
  }
}
export function clip(p: number): number { return Math.max(LOG_EPSILON, Math.min(1 - LOG_EPSILON, p)); }
export function brierScore(rows: readonly Prediction[]): number | null {
  validateRows(rows);
  return rows.length ? rows.reduce((s, r) => s + (r.probability - r.outcome) ** 2, 0) / rows.length : null;
}
// Bounded logarithmic score: for y=1 use -log(max(eps,p)); for y=0 use
// -log(max(eps,1-p)). This avoids 0*Infinity and asymmetric cancellation at p=1.
export function logLoss(rows: readonly Prediction[]): number | null {
  validateRows(rows);
  return rows.length ? rows.reduce((s, r) => s - Math.log(Math.max(LOG_EPSILON, r.outcome ? r.probability : 1 - r.probability)), 0) / rows.length : null;
}
export function wilson(successes: number, count: number): [number, number] {
  integer(count, 1, 20000, '箱样本数');
  integer(successes, 0, count, '事件数');
  const z = 1.959963984540054;
  const rate = successes / count;
  const denominator = 1 + z * z / count;
  const center = (rate + z * z / (2 * count)) / denominator;
  const radius = z * Math.sqrt(rate * (1 - rate) / count + z * z / (4 * count * count)) / denominator;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export function reliabilityBins(rows: readonly Prediction[], binCount: number): Bin[] {
  integer(binCount, 2, 30, '分箱数量');
  validateRows(rows);
  const sums = Array.from({ length: binCount }, () => ({ count: 0, probability: 0, successes: 0 }));
  for (const row of rows) {
    const bin = sums[Math.min(binCount - 1, Math.floor(row.probability * binCount))];
    bin.count++; bin.probability += row.probability; bin.successes += row.outcome;
  }
  return sums.map((s, index) => ({ index, lower: index / binCount, upper: (index + 1) / binCount,
    count: s.count, meanProbability: s.count ? s.probability / s.count : null,
    eventRate: s.count ? s.successes / s.count : null, interval: s.count ? wilson(s.successes, s.count) : null }));
}
export function evaluate(rows: readonly Prediction[], binCount: number): Evaluation {
  const bins = reliabilityBins(rows, binCount);
  const n = rows.length;
  return { count: n, brier: brierScore(rows), logLoss: logLoss(rows),
    meanProbability: n ? rows.reduce((s, r) => s + r.probability, 0) / n : null,
    eventRate: n ? rows.reduce((s, r) => s + r.outcome, 0) / n : null,
    ece: n ? bins.reduce((s, b) => s + b.count / n * Math.abs((b.meanProbability ?? 0) - (b.eventRate ?? 0)), 0) : null, bins };
}

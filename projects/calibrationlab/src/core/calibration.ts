import { sigmoid } from './data';
import { clip, probability, validateRows } from './metrics';
import type { FitResult, Method, Model, Prediction } from './types';
const RIDGE = 1e-6;
function preflight(rows: readonly Prediction[]): string | null {
  validateRows(rows);
  if (rows.length < 20) return '校准集不足 20 条，无法可靠拟合';
  const positives = rows.reduce((s, r) => s + r.outcome, 0);
  if (positives < 2 || rows.length - positives < 2) return '每个类别至少需要 2 条校准样本';
  const ps = rows.map(r => r.probability);
  if (Math.max(...ps) - Math.min(...ps) < 1e-10) return '预测概率退化为常量，无法可靠识别校准曲线';
  return null;
}
function logit(p: number): number { const c = clip(p); return Math.log(c) - Math.log1p(-c); }
function softplus(x: number): number { return Math.max(x, 0) + Math.log1p(Math.exp(-Math.abs(x))); }
export function fitPlatt(rows: readonly Prediction[]): FitResult {
  const issue = preflight(rows);
  if (issue) return { ok: false, reason: issue };
  const positive = rows.reduce((s, r) => s + r.outcome, 0);
  const negative = rows.length - positive;
  const x = rows.map(r => logit(r.probability));
  const targets = rows.map(r => r.outcome ? (positive + 1) / (positive + 2) : 1 / (negative + 2));
  const loss = (a: number, b: number) => x.reduce((s, v, i) => {
    const z = a * v + b;
    // Equivalent cross-entropy without subtracting nearly equal terms.
    return s + targets[i] * softplus(-z) + (1 - targets[i]) * softplus(z);
  }, 0) / x.length + RIDGE / 2 * (a * a + b * b);
  let a = 0, b = Math.log((positive + 1) / (negative + 1));
  for (let iteration = 0; iteration < 100; iteration++) {
    let ga = RIDGE * a, gb = RIDGE * b, haa = RIDGE, hab = 0, hbb = RIDGE;
    x.forEach((v, i) => {
      const p = sigmoid(a * v + b), d = (p - targets[i]) / x.length, w = p * (1 - p) / x.length;
      ga += d * v; gb += d; haa += w * v * v; hab += w * v; hbb += w;
    });
    if (Math.max(Math.abs(ga), Math.abs(gb)) < 1e-8) return { ok: true, model: { method: 'platt', slope: a, intercept: b, iterations: iteration }, warnings: rows.length < 100 ? ['校准集少于 100 条，拟合方差可能较大'] : [] };
    const determinant = haa * hbb - hab * hab;
    if (!(determinant > 0) || !Number.isFinite(determinant)) return { ok: false, reason: 'Platt Hessian 数值退化' };
    const da = (hbb * ga - hab * gb) / determinant, db = (haa * gb - hab * ga) / determinant;
    const current = loss(a, b);
    // Near the optimum, Armijo's expected decrease can be smaller than the
    // objective's rounding error. Permit only a few ulps, retain the gradient
    // convergence criterion, and let Newton take the resolvable full update.
    const roundingSlack = 8 * Number.EPSILON * Math.max(1, Math.abs(current));
    let step = 1;
    while (step > 1e-10 && loss(a - step * da, b - step * db) > current - 1e-4 * step * (ga * da + gb * db) + roundingSlack) step /= 2;
    if (step <= 1e-10) return { ok: false, reason: 'Platt 线搜索未收敛，未输出拟合结果' };
    const nextA = a - step * da, nextB = b - step * db;
    if (nextA === a && nextB === b) return { ok: false, reason: 'Platt 达到浮点精度极限，未满足梯度阈值' };
    a = nextA; b = nextB;
  }
  return { ok: false, reason: 'Platt 达到 100 次迭代上限，未可靠收敛' };
}
export function fitIsotonic(rows: readonly Prediction[]): FitResult {
  const issue = preflight(rows);
  if (issue) return { ok: false, reason: issue };
  const sorted = [...rows].sort((a, b) => a.probability - b.probability);
  const groups: { x: number; sum: number; weight: number }[] = [];
  for (const r of sorted) {
    const last = groups.at(-1);
    if (last && last.x === r.probability) { last.sum += r.outcome; last.weight++; }
    else groups.push({ x: r.probability, sum: r.outcome, weight: 1 });
  }
  const blocks: { start: number; end: number; sum: number; weight: number }[] = [];
  groups.forEach((g, i) => {
    blocks.push({ start: i, end: i, sum: g.sum, weight: g.weight });
    while (blocks.length > 1) {
      const right = blocks[blocks.length - 1], left = blocks[blocks.length - 2];
      if (left.sum / left.weight <= right.sum / right.weight) break;
      blocks.pop(); blocks.pop();
      blocks.push({ start: left.start, end: right.end, sum: left.sum + right.sum, weight: left.weight + right.weight });
    }
  });
  const values = new Array<number>(groups.length);
  blocks.forEach(b => { for (let i = b.start; i <= b.end; i++) values[i] = b.sum / b.weight; });
  return { ok: true, model: { method: 'isotonic', thresholds: groups.map(g => g.x), values },
    warnings: ['保序回归在有限样本上可能过拟合，端点可为 0 或 1', ...(rows.length < 100 ? ['校准集少于 100 条，拟合方差可能较大'] : [])] };
}
export function fitCalibrator(rows: readonly Prediction[], method: Method): FitResult {
  if (method === 'platt') return fitPlatt(rows);
  if (method === 'isotonic') return fitIsotonic(rows);
  throw new Error('未知校准方法');
}
export function predict(model: Model, p: number): number {
  probability(p);
  if (model.method === 'platt') return sigmoid(model.slope * logit(p) + model.intercept);
  const { thresholds: xs, values: ys } = model;
  if (p <= xs[0]) return ys[0];
  if (p >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = Math.floor((hi + lo) / 2); if (xs[mid] <= p) lo = mid; else hi = mid; }
  return ys[lo] + (ys[hi] - ys[lo]) * ((p - xs[lo]) / (xs[hi] - xs[lo]));
}

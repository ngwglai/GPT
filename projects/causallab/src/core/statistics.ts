import type { Data } from "./simulation";
export interface Summary {
  n: number;
  mean: number | null;
  variance: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
}
export type Estimate =
  | {
      ok: true;
      n: number;
      value: number;
      se: number;
      ci: [number, number];
      note: string;
    }
  | { ok: false; n: number; reason: string };
export type Correlation =
  | { ok: true; n: number; value: number }
  | { ok: false; n: number; reason: string };
export const unavailable = (reason: string, n: number): Estimate => ({
  ok: false,
  reason,
  n,
});
export function values(data: Data, id: string): number[] {
  const result = data.map((r) => r[id]);
  if (result.some((v) => !Number.isFinite(v)))
    throw new Error(`变量 ${id} 缺失或包含非有限数值`);
  return result;
}
export function summarize(xs: number[]): Summary {
  if (xs.some((x) => !Number.isFinite(x)))
    throw new Error("统计输入必须全部为有限数字");
  if (!xs.length)
    return { n: 0, mean: null, variance: null, sd: null, min: null, max: null };
  let mean = 0,
    m2 = 0,
    min = Infinity,
    max = -Infinity;
  xs.forEach((x, i) => {
    const delta = x - mean;
    mean += delta / (i + 1);
    m2 += delta * (x - mean);
    min = Math.min(min, x);
    max = Math.max(max, x);
  });
  const variance = xs.length > 1 ? Math.max(0, m2 / (xs.length - 1)) : null;
  if (
    !Number.isFinite(mean) ||
    (variance !== null && !Number.isFinite(variance))
  )
    throw new Error("统计溢出，请减小参数");
  return {
    n: xs.length,
    mean,
    variance,
    sd: variance === null ? null : Math.sqrt(variance),
    min,
    max,
  };
}
export function critical95(df: number) {
  const table = [
    0, 12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622,
    2.2281, 2.201, 2.1788, 2.1604, 2.1448, 2.1314, 2.1199, 2.1098, 2.1009,
    2.093, 2.086, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595, 2.0555, 2.0518,
    2.0484, 2.0452, 2.0423,
  ];
  if (df < 1) throw new Error("自由度不足");
  if (df <= 30) return table[Math.floor(df)];
  const z = 1.959963984540054;
  return (
    z +
    (z ** 3 + z) / (4 * df) +
    (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) +
    (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3)
  );
}
export function estimate(
  value: number,
  se: number,
  n: number,
  df: number,
  note: string,
): Estimate {
  if (!Number.isFinite(value) || !Number.isFinite(se) || se < 0 || df < 1)
    return unavailable("样本或数值条件不足以构造置信区间", n);
  const margin = critical95(df) * se;
  return { ok: true, value, se, n, ci: [value - margin, value + margin], note };
}
export function meanEstimate(xs: number[]): Estimate {
  const s = summarize(xs);
  if (s.mean === null || s.variance === null)
    return unavailable("均值区间至少需要 2 个样本", s.n);
  return estimate(
    s.mean,
    Math.sqrt(s.variance / s.n),
    s.n,
    s.n - 1,
    "均值，Student t 95% 区间",
  );
}
export function difference(low: number[], high: number[]): Estimate {
  const a = summarize(low),
    b = summarize(high),
    n = a.n + b.n;
  if (
    a.mean === null ||
    b.mean === null ||
    a.variance === null ||
    b.variance === null
  )
    return unavailable("两个处理组各至少需要 2 个样本", n);
  const va = a.variance / a.n,
    vb = b.variance / b.n,
    se = Math.sqrt(va + vb);
  const df =
    se === 0
      ? n - 2
      : (va + vb) ** 2 / (va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1));
  return estimate(
    b.mean - a.mean,
    se,
    n,
    df,
    "均值差 E[Y|X=1]−E[Y|X=0]，Welch 95% 区间（小自由度向下取整）",
  );
}
export function correlation(xs: number[], ys: number[]): Correlation {
  if (xs.length !== ys.length) throw new Error("两个变量样本量不一致");
  const a = summarize(xs),
    b = summarize(ys),
    n = xs.length;
  if (n < 3) return { ok: false, n, reason: "相关性至少需要 3 个样本" };
  if (!a.sd || !b.sd) return { ok: false, n, reason: "常量变量的相关性未定义" };
  let cov = 0;
  for (let i = 0; i < n; i++)
    cov += ((xs[i] - a.mean!) / a.sd) * ((ys[i] - b.mean!) / b.sd);
  return { ok: true, n, value: Math.max(-1, Math.min(1, cov / (n - 1))) };
}
export function naive(
  data: Data,
  treatment: string,
  outcome: string,
): Estimate {
  const xs = values(data, treatment);
  values(data, outcome);
  if (xs.some((x) => x !== 0 && x !== 1))
    return unavailable(
      "朴素二元效应只适用于取值为 0/1 的处理变量",
      data.length,
    );
  return difference(
    data.filter((r) => r[treatment] === 0).map((r) => r[outcome]),
    data.filter((r) => r[treatment] === 1).map((r) => r[outcome]),
  );
}
// Scaled modified Gram-Schmidt QR, with two passes for numerical stability.
export function regression(
  data: Data,
  treatment: string,
  outcome: string,
  controls: string[] = [],
): Estimate {
  const n = data.length,
    p = controls.length + 2;
  if (new Set([treatment, outcome, ...controls]).size !== controls.length + 2)
    return unavailable("回归变量不能重复", n);
  if (n <= p) return unavailable("样本量必须大于回归参数个数", n);
  const y = values(data, outcome),
    raw = [treatment, ...controls].map((id) => values(data, id)),
    stats = raw.map(summarize);
  if (stats.some((s) => !s.sd))
    return unavailable("回归包含常量解释变量或缺乏处理重叠", n);
  const columns = [
    Array<number>(n).fill(1),
    ...raw.map((xs, j) => xs.map((x) => (x - stats[j].mean!) / stats[j].sd!)),
  ];
  const q: number[][] = [],
    r = Array.from({ length: p }, () => Array<number>(p).fill(0));
  const dot = (a: number[], b: number[]) =>
    a.reduce((s, v, i) => s + v * b[i], 0);
  for (let j = 0; j < p; j++) {
    const v = [...columns[j]];
    for (let pass = 0; pass < 2; pass++)
      for (let k = 0; k < j; k++) {
        const projection = dot(q[k], v);
        r[k][j] += projection;
        for (let i = 0; i < n; i++) v[i] -= projection * q[k][i];
      }
    const norm = Math.sqrt(dot(v, v));
    if (norm < 1e-9 * Math.sqrt(n))
      return unavailable("回归设计矩阵共线，无法稳定估计", n);
    r[j][j] = norm;
    q.push(v.map((x) => x / norm));
  }
  const beta = q.map((col) => dot(col, y));
  for (let i = p - 1; i >= 0; i--) {
    for (let j = i + 1; j < p; j++) beta[i] -= r[i][j] * beta[j];
    beta[i] /= r[i][i];
  }
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const residual =
      y[i] - columns.reduce((s, col, j) => s + col[i] * beta[j], 0);
    sse += residual ** 2;
  }
  const inv = Array.from({ length: p }, () => Array<number>(p).fill(0));
  for (let col = 0; col < p; col++)
    for (let i = p - 1; i >= 0; i--) {
      let v = Number(i === col);
      for (let j = i + 1; j < p; j++) v -= r[i][j] * inv[j][col];
      inv[i][col] = v / r[i][i];
    }
  const se =
    Math.sqrt((sse / (n - p)) * inv[1].reduce((s, v) => s + v * v, 0)) /
    stats[0].sd!;
  return estimate(
    beta[1] / stats[0].sd!,
    se,
    n,
    n - p,
    "OLS 处理系数；同方差假设下 Student t 95% 区间，异方差时不保证覆盖率",
  );
}
export function standardized(
  data: Data,
  treatment: string,
  outcome: string,
  parents: string[],
): Estimate {
  if (!parents.length) return naive(data, treatment, outcome);
  if (
    parents
      .map((id) => values(data, id))
      .some((xs) => xs.some((x) => x !== 0 && x !== 1))
  )
    return unavailable("分层调整仅支持二元父变量", data.length);
  const cells = new Map<string, Data>();
  for (const row of data) {
    const key = parents.map((id) => row[id]).join(",");
    const cell = cells.get(key) ?? [];
    cell.push(row);
    cells.set(key, cell);
  }
  if (!data.length) return unavailable("空样本无法调整", 0);
  let value = 0,
    variance = 0;
  for (const cell of cells.values()) {
    const result = naive(cell, treatment, outcome);
    if (!result.ok)
      return unavailable(
        "至少一个分层缺少处理重叠或组内样本不足；不能识别该样本的调整差",
        data.length,
      );
    const w = cell.length / data.length;
    value += w * result.value;
    variance += w * w * result.se ** 2;
  }
  return estimate(
    value,
    Math.sqrt(variance),
    data.length,
    Infinity,
    "按总体经验分层比例标准化；固定分层权重的渐近 95% 区间，不计构成比例估计的不确定性",
  );
}
export function histogram(
  xs: number[],
  bins = 12,
): { start: number; end: number; count: number }[] {
  const s = summarize(xs);
  if (s.min === null || s.max === null) return [];
  if (!Number.isInteger(bins) || bins < 1 || bins > 50)
    throw new Error("直方图区间数需要 1–50");
  const width = s.max === s.min ? 1 : (s.max - s.min) / bins;
  const result = Array.from({ length: s.max === s.min ? 1 : bins }, (_, i) => ({
    start: s.min! + i * width,
    end: s.min! + (i + 1) * width,
    count: 0,
  }));
  xs.forEach(
    (x) =>
      result[Math.min(result.length - 1, Math.floor((x - s.min!) / width))]
        .count++,
  );
  return result;
}

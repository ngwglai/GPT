import {
  compileModel,
  descendants,
  MAX_SAMPLES,
  type Model,
  type Variable,
} from "./model";
import { checkSeed, random } from "./random";
export type Row = Record<string, number>;
export type Data = Row[];
export interface SampleConfig {
  n: number;
  seed: number;
}
export function checkSample({ n, seed }: SampleConfig) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SAMPLES)
    throw new Error(`样本量必须为 1–${MAX_SAMPLES} 的整数`);
  checkSeed(seed);
}
export function checkIntervention(
  model: Model,
  treatment: string,
  value: number,
) {
  const v = model.variables.find((v) => v.id === treatment);
  if (!v) throw new Error("干预变量不存在");
  if (!Number.isFinite(value) || Math.abs(value) > 100)
    throw new Error("干预值必须是 [-100,100] 内的有限数字");
  if (v.kind === "bernoulli" && value !== 0 && value !== 1)
    throw new Error("二元变量只能干预为 0 或 1");
}
function equation(v: Variable, row: Row, noise: number): number {
  let value = v.intercept;
  for (const [id, weight] of Object.entries(v.weights)) {
    if (!Object.hasOwn(row, id)) throw new Error("缺少父变量值");
    value += weight * row[id];
  }
  value =
    v.kind === "linear"
      ? value + v.noiseStd * noise
      : Number(noise < Math.min(1, Math.max(0, value)));
  if (!Number.isFinite(value))
    throw new Error("计算出现非有限数值，请减小参数");
  return value;
}
// Two uniforms per variable per row, even for zero noise. do never shifts streams.
function noiseRow(variables: readonly Variable[], rng: () => number): Row {
  const row: Row = {};
  for (const v of variables) {
    const a = rng();
    const b = rng();
    row[v.id] =
      v.kind === "linear"
        ? Math.sqrt(-2 * Math.log(1 - a)) * Math.cos(2 * Math.PI * b)
        : a;
  }
  return row;
}
export function generate(model: Model, config: SampleConfig): Data {
  const { model: checked, order } = compileModel(model);
  checkSample(config);
  const rng = random(config.seed);
  const rows: Data = [];
  for (let i = 0; i < config.n; i++) {
    const noise = noiseRow(checked.variables, rng);
    const row: Row = {};
    for (const v of order) row[v.id] = equation(v, row, noise[v.id]);
    rows.push(row);
  }
  return rows;
}
export interface Worlds {
  factual: Data;
  low: Data;
  high: Data;
}
export function intervene(
  model: Model,
  config: SampleConfig,
  treatment: string,
  low: number,
  high: number,
): Worlds {
  const { model: checked, order } = compileModel(model);
  checkSample(config);
  checkIntervention(checked, treatment, low);
  checkIntervention(checked, treatment, high);
  const affected = new Set(descendants(checked, treatment));
  const rng = random(config.seed);
  const worlds: Worlds = { factual: [], low: [], high: [] };
  for (let i = 0; i < config.n; i++) {
    const noise = noiseRow(checked.variables, rng);
    const factual: Row = {};
    for (const v of order) factual[v.id] = equation(v, factual, noise[v.id]);
    worlds.factual.push(factual);
    for (const [data, value] of [
      [worlds.low, low],
      [worlds.high, high],
    ] as const) {
      const row: Row = { ...factual, [treatment]: value };
      for (const v of order)
        if (affected.has(v.id)) row[v.id] = equation(v, row, noise[v.id]);
      data.push(row);
    }
  }
  return worlds;
}
// Affine conditional means and independent zero-mean noises make this exact.
export function expectedOutcome(
  model: Model,
  outcome: string,
  treatment?: string,
  value = 0,
): number {
  const { model: checked, order } = compileModel(model);
  if (!checked.variables.some((v) => v.id === outcome))
    throw new Error("结果变量不存在");
  if (treatment !== undefined) checkIntervention(checked, treatment, value);
  const means: Row = {};
  for (const v of order)
    means[v.id] =
      v.id === treatment
        ? value
        : v.intercept +
          Object.entries(v.weights).reduce((s, [p, w]) => s + w * means[p], 0);
  if (!Number.isFinite(means[outcome])) throw new Error("理论均值非有限");
  return means[outcome];
}
export function trueATE(
  model: Model,
  treatment: string,
  outcome: string,
  low: number,
  high: number,
) {
  if (treatment === outcome) throw new Error("请选择不同的处理变量和结果变量");
  const { model: checked, order } = compileModel(model);
  checkIntervention(checked, treatment, low);
  checkIntervention(checked, treatment, high);
  if (!checked.variables.some((v) => v.id === outcome))
    throw new Error("结果变量不存在");
  // Propagate mean differences directly: large common offsets cancel
  // algebraically, before floating-point arithmetic can erase the effect.
  const delta: Row = {};
  for (const v of order)
    delta[v.id] =
      v.id === treatment
        ? high - low
        : Object.entries(v.weights).reduce((s, [p, w]) => s + w * delta[p], 0);
  if (!Number.isFinite(delta[outcome])) throw new Error("理论效应非有限");
  return delta[outcome];
}
// Observational selection deliberately has no access to the structural equations.
export function condition(data: Data, variable: string, value: number): Data {
  if (!Number.isFinite(value)) throw new Error("条件值必须有限");
  if (
    data.some(
      (row) => !Object.hasOwn(row, variable) || !Number.isFinite(row[variable]),
    )
  )
    throw new Error("条件变量缺失或不是有限数值");
  return data.filter((row) => row[variable] === value);
}

import type { Config, Dataset, Observation, Rng, Scenario } from './types';
export const SCENARIOS: Record<Scenario, string> = {
  ideal: '理想校准', overconfident: '过度自信', underconfident: '欠自信', uninformative: '缺乏区分能力',
};
export const DEFAULT_CONFIG: Config = { scenario: 'overconfident', sampleSize: 2000, seed: 2026, binCount: 10 };
export function integer(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}须为 ${min}–${max} 的整数`);
}
export function validateConfig(config: Config): void {
  if (!Object.hasOwn(SCENARIOS, config.scenario)) throw new Error('未知实验类型');
  integer(config.sampleSize, 2, 20000, '总样本量');
  integer(config.seed, 0, 0xffffffff, '随机种子');
  integer(config.binCount, 2, 30, '分箱数量');
}
// Mulberry32, explicit uint32 arithmetic; all randomness is supplied by the caller.
export function seededRng(seed: number): Rng {
  integer(seed, 0, 0xffffffff, '随机种子');
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function draw(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('随机数须在 [0,1) 内');
  return value;
}
export function sigmoid(x: number): number {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}
export function forecast(q: number, scenario: Scenario): number {
  if (!Number.isFinite(q) || q <= 0 || q >= 1) throw new Error('生成概率须在 (0,1) 内');
  const temperature = { ideal: 1, overconfident: 2, underconfident: 0.5, uninformative: 0 }[scenario];
  if (temperature === undefined) throw new Error('未知实验类型');
  return sigmoid(temperature * Math.log(q / (1 - q)));
}
export function generateData(config: Config, rng: Rng): Dataset {
  validateConfig(config);
  const rows: Observation[] = Array.from({ length: config.sampleSize }, (_, id) => {
    const trueProbability = 0.05 + 0.9 * draw(rng);
    return { id, trueProbability, probability: forecast(trueProbability, config.scenario), outcome: draw(rng) < trueProbability ? 1 : 0 };
  });
  const split = Math.floor(rows.length / 2);
  // IID draws, fixed split independent of outcomes. No test labels enter fitting.
  return { calibration: rows.slice(0, split), test: rows.slice(split) };
}

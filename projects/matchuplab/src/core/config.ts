import { GAMES } from './games';
import { ALGORITHMS, type Algorithm, type Config, type OpponentSpec } from './types';

export const MAX_ROUNDS = 20_000;
export const MAX_SEEDS = 32;
export const MAX_STEPS = 2_000_000;
export const MAX_ACTIVE_MS = 30_000;
export const BASE_OPPONENT: OpponentSpec = { kind: 'fixed', action: 0, nextAction: 2, bias: 0.8, switchRound: 500 };
export const DEFAULT_CONFIG: Config = {
  game: 'rps', algorithm: 'epsilon', opponent: { ...BASE_OPPONENT }, target: { ...BASE_OPPONENT, action: 2 },
  transfer: false, epsilon: 0.1, gamma: 0.1, trainRounds: 1000, testRounds: 500, seed: 42, seeds: 8,
};
export const TEMPLATES = [
  { name: '固定对手学习', description: '学习固定出石头的对手，比较探索成本与独立测试。', config: DEFAULT_CONFIG },
  { name: '对手中途改变策略', description: '第 501 回合起由石头改为剪刀；累计统计可能掩盖适应延迟。',
    config: { ...DEFAULT_CONFIG, opponent: { ...BASE_OPPONENT, kind: 'switching' as const } } },
  { name: '训练后迁移至新对手', description: '训练对石头，冻结策略后分别独立测试原对手与剪刀对手。',
    config: { ...DEFAULT_CONFIG, transfer: true } },
];

export function validateConfig(config: Config, algorithms: Algorithm[], seeds: number): number {
  const integer = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!GAMES[config.game] || !ALGORITHMS.includes(config.algorithm) || !algorithms.length ||
    algorithms.some(a => !ALGORITHMS.includes(a)) || new Set(algorithms).size !== algorithms.length) throw new Error('环境或算法配置无效');
  if (!integer(config.trainRounds, 1, MAX_ROUNDS) || !integer(config.testRounds, 1, MAX_ROUNDS)) throw new Error(`训练和测试回合数须为 1–${MAX_ROUNDS} 的整数`);
  if (!integer(config.seed, 0, 0xffffffff) || !integer(seeds, 1, MAX_SEEDS) || !integer(config.seeds, 1, MAX_SEEDS)) throw new Error('种子须为 32 位无符号整数；种子数量须为 1–32');
  if (!Number.isFinite(config.epsilon) || config.epsilon < 0 || config.epsilon > 1 ||
    !Number.isFinite(config.gamma) || config.gamma <= 0 || config.gamma > 1 || typeof config.transfer !== 'boolean') throw new Error('ε 须为 [0,1]，γ 须为 (0,1]');
  for (const spec of [config.opponent, config.target]) {
    if (!['uniform', 'fixed', 'biased', 'reactive', 'switching'].includes(spec.kind) ||
      !integer(spec.action, 0, 2) || !integer(spec.nextAction, 0, 2) ||
      !Number.isFinite(spec.bias) || spec.bias < 0 || spec.bias > 1 || !integer(spec.switchRound, 0, MAX_ROUNDS)) throw new Error('对手参数无效');
  }
  const steps = (config.trainRounds + config.testRounds * (config.transfer ? 2 : 1)) * algorithms.length * seeds;
  if (steps > MAX_STEPS) throw new Error(`实验超出 ${MAX_STEPS.toLocaleString()} 回合预算，请减少回合或种子`);
  return steps;
}

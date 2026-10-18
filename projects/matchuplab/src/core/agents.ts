import { greedy, sample, type Random } from './random';
import type { Algorithm } from './types';

export interface AgentState { counts: number[]; means: number[]; logWeights: number[]; updates: number }
export interface Agent {
  act(random: Random): number;
  update(action: number, reward01: number): void;
  policy(): number[];
  state(): AgentState;
  reset(): void;
}

export function createAgent(algorithm: Algorithm, k: number, epsilon: number, gamma: number): Agent {
  if (!['random', 'epsilon', 'ucb', 'exp3'].includes(algorithm) || !Number.isInteger(k) || k < 2 || !Number.isFinite(epsilon) || epsilon < 0 || epsilon > 1 ||
    !Number.isFinite(gamma) || gamma <= 0 || gamma > 1) throw new Error('Agent 参数无效');
  let counts: number[], means: number[], logWeights: number[], updates: number;
  const reset = () => { counts = Array(k).fill(0); means = Array(k).fill(0); logWeights = Array(k).fill(0); updates = 0; };
  reset();
  function weights() {
    const top = Math.max(...logWeights);
    const w = logWeights.map(v => Math.exp(v - top));
    const total = w.reduce((a, b) => a + b, 0);
    return w.map(v => v / total);
  }
  function policy() {
    if (algorithm === 'random') return Array(k).fill(1 / k) as number[];
    if (algorithm === 'exp3') return weights();
    return greedy(means);
  }
  function probabilities() {
    if (algorithm === 'epsilon') return greedy(means).map(p => (1 - epsilon) * p + epsilon / k);
    if (algorithm === 'exp3') return weights().map(p => (1 - gamma) * p + gamma / k);
    if (algorithm === 'ucb') {
      const unvisited = counts.map(n => n === 0);
      const zeros = unvisited.filter(Boolean).length;
      if (zeros) return unvisited.map(z => z ? 1 / zeros : 0);
      return greedy(means.map((v, i) => v + Math.sqrt(2 * Math.log(updates) / counts[i])));
    }
    return policy();
  }
  return {
    act: random => sample(probabilities(), random),
    update(action, reward) {
      if (!Number.isInteger(action) || action < 0 || action >= k || !Number.isFinite(reward) || reward < 0 || reward > 1) {
        throw new Error('Agent 更新需要合法动作及 [0,1] 奖励');
      }
      if (algorithm === 'exp3') {
        const p = probabilities()[action];
        logWeights[action] += gamma * reward / (k * p);
        const top = Math.max(...logWeights);
        logWeights = logWeights.map(v => v - top); // Stable softmax, common offset preserves policy.
      }
      counts[action]++;
      updates++;
      means[action] += (reward - means[action]) / counts[action];
    },
    policy,
    reset,
    state: () => ({ counts: [...counts], means: [...means], logWeights: [...logWeights], updates }),
  };
}

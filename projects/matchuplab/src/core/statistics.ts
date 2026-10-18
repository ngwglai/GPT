import type { Algorithm, Metrics, Phase, RunResult, Summary } from './types';

export class Accumulator {
  private m2 = 0;
  readonly value: Metrics;
  constructor(k: number) {
    this.value = { n: 0, wins: 0, draws: 0, losses: 0, winRate: 0, mean: 0, total: 0, sd: 0, actions: Array(k).fill(0) };
  }
  add(reward: number, action: number) {
    const m = this.value;
    m.n++;
    m.total += reward;
    m.actions[action]++;
    if (reward > 0) m.wins++;
    else if (reward < 0) m.losses++;
    else m.draws++;
    const delta = reward - m.mean;
    m.mean += delta / m.n;
    this.m2 += delta * (reward - m.mean);
    m.sd = m.n > 1 ? Math.sqrt(Math.max(0, this.m2 / (m.n - 1))) : 0;
    m.winRate = m.wins / m.n;
  }
  snapshot(): Metrics { return { ...this.value, actions: [...this.value.actions] }; }
}

export function summarize(runs: RunResult[]): Summary[] {
  const rows: Summary[] = [];
  const algorithms = [...new Set(runs.map(r => r.algorithm))] as Algorithm[];
  for (const algorithm of algorithms) for (const phase of ['train', 'test', 'transfer'] as Phase[]) {
    const metrics = runs.filter(r => r.algorithm === algorithm).flatMap(r => r.phases[phase] ? [r.phases[phase]!.metrics] : []);
    if (!metrics.length) continue;
    const n = metrics.length;
    const mean = metrics.reduce((s, m) => s + m.mean, 0) / n;
    const sd = n > 1 ? Math.sqrt(metrics.reduce((s, m) => s + (m.mean - mean) ** 2, 0) / (n - 1)) : 0;
    rows.push({ algorithm, phase, seeds: n, rounds: metrics.reduce((s, m) => s + m.n, 0), mean, sd,
      min: Math.min(...metrics.map(m => m.mean)), max: Math.max(...metrics.map(m => m.mean)),
      winRate: metrics.reduce((s, m) => s + m.winRate, 0) / n });
  }
  return rows;
}

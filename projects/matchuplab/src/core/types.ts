export type GameId = 'rps' | 'tactics';
export type Algorithm = 'random' | 'epsilon' | 'ucb' | 'exp3';
export type OpponentKind = 'uniform' | 'fixed' | 'biased' | 'reactive' | 'switching';
export type Phase = 'train' | 'test' | 'transfer';
export interface OpponentSpec {
  kind: OpponentKind;
  action: number;
  nextAction: number;
  bias: number;
  switchRound: number;
}
export interface Config {
  game: GameId;
  algorithm: Algorithm;
  opponent: OpponentSpec;
  target: OpponentSpec;
  transfer: boolean;
  epsilon: number;
  gamma: number;
  trainRounds: number;
  testRounds: number;
  seed: number;
  seeds: number;
}
export const ALGORITHMS: Algorithm[] = ['random', 'epsilon', 'ucb', 'exp3'];
export const ALGORITHM_NAMES: Record<Algorithm, string> = {
  random: '均匀随机', epsilon: 'ε-greedy', ucb: 'UCB1', exp3: 'EXP3',
};
export interface Game {
  id: GameId;
  name: string;
  actions: readonly string[];
  matrix: readonly (readonly number[])[];
  min: number;
  max: number;
}
export interface Round {
  phase: Phase;
  round: number;
  action: number;
  opponentAction: number;
  reward: number;
}
export interface Metrics {
  n: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  mean: number;
  total: number;
  sd: number;
  actions: number[];
}
export interface CurvePoint { round: number; mean: number; total: number }
export interface PhaseResult { metrics: Metrics; curve: CurvePoint[] }
export interface RunResult {
  algorithm: Algorithm;
  seed: number;
  phases: Partial<Record<Phase, PhaseResult>>;
  policy: number[];
}
export interface Summary {
  algorithm: Algorithm;
  phase: Phase;
  seeds: number;
  rounds: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  winRate: number;
}
export interface Experiment {
  schemaVersion: 1;
  config: Config;
  algorithms: Algorithm[];
  seedValues: number[];
  runs: RunResult[];
  summary: Summary[];
}

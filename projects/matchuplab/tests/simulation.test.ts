import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, MAX_STEPS, TEMPLATES, validateConfig } from '../src/core/config';
import { GAMES } from '../src/core/games';
import { opponentAction } from '../src/core/opponents';
import { createRandom } from '../src/core/random';
import { ExperimentTask, Simulation } from '../src/core/simulation';
import { ALGORITHMS, type Config, type OpponentKind, type Round } from '../src/core/types';

const small = (patch: Partial<Config> = {}): Config => ({ ...structuredClone(DEFAULT_CONFIG), trainRounds: 50, testRounds: 20, seeds: 2, ...patch });
const finish = (task: ExperimentTask) => { while (!task.done) task.tick(); return task.finish(); };

describe('opponents', () => {
  it('switches exactly after N rounds, including N=0', () => {
    const spec = { ...DEFAULT_CONFIG.opponent, kind: 'switching' as const, switchRound: 5 };
    expect(Array.from({ length: 7 }, (_, i) => opponentAction(spec, GAMES.rps, i, undefined, () => 0))).toEqual([0, 0, 0, 0, 0, 2, 2]);
    expect(opponentAction({ ...spec, switchRound: 0 }, GAMES.rps, 0, undefined, () => 0)).toBe(2);
  });
  it('reacts only to previous action and minimizes player reward', () => {
    const spec = { ...DEFAULT_CONFIG.opponent, kind: 'reactive' as const };
    expect(opponentAction(spec, GAMES.rps, 0, undefined, () => 0.8)).toBe(2);
    for (const game of Object.values(GAMES)) for (let previous = 0; previous < 3; previous++) {
      const rival = opponentAction(spec, game, 1, previous, () => 0.3);
      expect(game.matrix[previous][rival]).toBe(Math.min(...game.matrix[previous]));
    }
  });
  it.each(['uniform', 'fixed', 'biased', 'reactive', 'switching'] as OpponentKind[])('%s strategy repeats and stays within action space', kind => {
    const rng1 = createRandom(49), rng2 = createRandom(49), spec = { ...DEFAULT_CONFIG.opponent, kind };
    const values = Array.from({ length: 100 }, (_, i) => opponentAction(spec, GAMES.rps, i, i % 3, rng1));
    expect(values).toEqual(Array.from({ length: 100 }, (_, i) => opponentAction(spec, GAMES.rps, i, i % 3, rng2)));
    expect(values.every(v => Number.isInteger(v) && v >= 0 && v < 3)).toBe(true);
  });
  it('biased probabilities, including extremes, respect the configured intervals', () => {
    const spec = { ...DEFAULT_CONFIG.opponent, kind: 'biased' as const, bias: 0.8 };
    expect(opponentAction(spec, GAMES.rps, 0, undefined, () => 0.79)).toBe(0);
    expect(opponentAction(spec, GAMES.rps, 0, undefined, () => 0.85)).toBe(1);
    expect(opponentAction(spec, GAMES.rps, 0, undefined, () => 0.95)).toBe(2);
  });
});

it.each(ALGORITHMS)('%s runs reproduce exactly and test cannot update Agent', algorithm => {
  const config = small({ transfer: true });
  const a = new Simulation(config, algorithm, 42), b = new Simulation(config, algorithm, 42);
  for (let i = 0; i < config.trainRounds; i++) expect(a.step()).toEqual(b.step());
  const state = a.agentState();
  expect(state.updates).toBe(config.trainRounds);
  expect(a.phase).toBe('test');
  while (!a.done) { expect(a.step()).toEqual(b.step()); expect(a.agentState()).toEqual(state); }
  expect(a.result).toEqual(b.result);
  expect(a.result.phases.test?.metrics.n).toBe(20);
  expect(a.result.phases.transfer?.metrics.n).toBe(20);
  expect(a.step()).toBeUndefined();
});
it('changing the test opponent and length never changes training or source test prefix', () => {
  const a = new Simulation(small({ transfer: true }), 'exp3', 1);
  const b = new Simulation(small({ transfer: true, testRounds: 40, target: { ...DEFAULT_CONFIG.target, kind: 'reactive' } }), 'exp3', 1);
  for (let i = 0; i < 70; i++) expect(a.step()).toEqual(b.step());
  expect(a.agentState()).toEqual(b.agentState());
  expect(a.result.phases.train).toEqual(b.result.phases.train);
});
it('test resets opponent history and clock and transfer matches an identical target', () => {
  const config = small({ trainRounds: 7, testRounds: 8, transfer: true, opponent: { ...DEFAULT_CONFIG.opponent, kind: 'switching', switchRound: 5 } });
  config.target = { ...config.opponent };
  const s = new Simulation(config, 'random', 33), train: Round[] = [], test: Round[] = [], transfer: Round[] = [];
  while (!s.done) { const e = s.step()!; (e.phase === 'train' ? train : e.phase === 'test' ? test : transfer).push(e); }
  expect(train.map(e => e.opponentAction)).toEqual([0, 0, 0, 0, 0, 2, 2]);
  expect(test.map(e => e.opponentAction)).toEqual([0, 0, 0, 0, 0, 2, 2, 2]);
  expect(transfer.map(e => ({ ...e, phase: 'test' }))).toEqual(test);
});
it('fresh evaluation RNG does not depend on training round count for random baseline', () => {
  const a = finish(new ExperimentTask(small(), ['random'], 1));
  const b = finish(new ExperimentTask(small({ trainRounds: 100 }), ['random'], 1));
  expect(a.runs[0].phases.test).toEqual(b.runs[0].phases.test);
});
it.each(TEMPLATES)('template $name supports all algorithms and paired seeds', template => {
  const experiment = finish(new ExperimentTask({ ...structuredClone(template.config), seeds: 3 }, ALGORITHMS, 3));
  expect(experiment.runs).toHaveLength(12);
  expect(experiment.seedValues).toEqual([42, 43, 44]);
  expect(experiment.summary).toHaveLength(template.config.transfer ? 12 : 8);
  for (const row of experiment.summary) { expect(row.seeds).toBe(3); expect(row.rounds).toBe(3 * (row.phase === 'train' ? 1000 : 500)); }
});
it('batch chunk size does not change results; no global randomness is used', () => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness forbidden'); });
  try {
    const a = new ExperimentTask(small(), ALGORITHMS, 2), b = new ExperimentTask(small(), ALGORITHMS, 2);
    while (!a.done) a.tick(1);
    while (!b.done) b.tick(73);
    expect(a.finish()).toEqual(b.finish());
  } finally { spy.mockRestore(); }
});
it('bounded curves include final sample and never store full history', () => {
  const result = finish(new ExperimentTask(small({ trainRounds: 20000, testRounds: 20000 }), ['ucb'], 1));
  for (const phase of Object.values(result.runs[0].phases)) { expect(phase.curve.length).toBeLessThanOrEqual(252); expect(phase.curve.at(-1)?.round).toBe(20000); }
});
it('cancellation is terminal and partial results cannot be exported', () => {
  const task = new ExperimentTask(small(), ['ucb'], 1); task.tick(10);
  expect(() => task.finish()).toThrow();
  task.cancel(); expect(() => task.tick()).toThrow('取消'); expect(() => task.finish()).toThrow();
  expect(task.steps).toBe(10);
});
it('rejects step budget overflow before starting', () => {
  expect(() => new ExperimentTask(small({ trainRounds: 20000, testRounds: 20000, transfer: true, seeds: 32 }), ALGORITHMS, 32)).toThrow('预算');
  const task = new ExperimentTask(small(), ['ucb'], 1);
  for (const n of [0, -1, 1025, 0.5]) expect(() => task.tick(n)).toThrow();
  expect(task.steps).toBe(0); expect(task.budget).toBeLessThan(MAX_STEPS);
});
it.each([{ trainRounds: 0 }, { testRounds: 20001 }, { seed: -1 }, { seed: NaN }, { seeds: 33 }, { epsilon: 1.1 }, { gamma: 0 }, { trainRounds: 1.2 }, { opponent: { ...DEFAULT_CONFIG.opponent, action: 3 } }])('invalid config %j fails clearly', patch => {
  expect(() => validateConfig(small(patch), ['random'], 1)).toThrow();
});
it('seeds wrap at uint32 boundary', () => {
  const result = finish(new ExperimentTask(small({ seed: 4294967295 }), ['random'], 2));
  expect(result.seedValues).toEqual([4294967295, 0]); expect(result.runs.map(r => r.seed)).toEqual(result.seedValues);
});
it('randomized small simulations preserve payoff, count and summary invariants across 30 seeds', () => {
  for (let seed = 0; seed < 30; seed++) for (const game of ['rps', 'tactics'] as const) {
    const result = finish(new ExperimentTask(small({ seed, game, transfer: true, opponent: { ...DEFAULT_CONFIG.opponent, kind: 'reactive' } }), ALGORITHMS, 1));
    for (const run of result.runs) for (const phase of Object.values(run.phases)) {
      const m = phase.metrics;
      expect(m.wins + m.draws + m.losses).toBe(m.n);
      expect(m.actions.reduce((a, b) => a + b)).toBe(m.n);
      expect(m.mean).toBeCloseTo(m.total / m.n, 10);
      expect(Math.abs(m.mean)).toBeLessThanOrEqual(GAMES[game].max);
      expect(m.sd).toBeGreaterThanOrEqual(0);
    }
  }
});

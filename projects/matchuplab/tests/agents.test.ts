import { describe, expect, it } from 'vitest';
import { createAgent } from '../src/core/agents';
import { createRandom } from '../src/core/random';
import { ALGORITHMS } from '../src/core/types';

describe.each(ALGORITHMS)('%s agent', algorithm => {
  it('initializes, updates sample means, snapshots independently and resets', () => {
    const agent = createAgent(algorithm, 3, 0.1, 0.1);
    const initial = agent.state();
    expect(initial).toEqual({ counts: [0, 0, 0], means: [0, 0, 0], logWeights: [0, 0, 0], updates: 0 });
    agent.update(1, 1); agent.update(1, 0);
    expect(agent.state().means).toEqual([0, 0.5, 0]);
    expect(agent.state().counts).toEqual([0, 2, 0]);
    expect(initial.counts).toEqual([0, 0, 0]);
    const snapshot = agent.state(); snapshot.counts[1] = 99;
    expect(agent.state().counts[1]).toBe(2);
    agent.reset(); expect(agent.state()).toEqual(initial);
  });
  it('remains normalized and finite over 20,000 adversarial updates', () => {
    const agent = createAgent(algorithm, 3, 0.1, 0.001), rng = createRandom(17);
    for (let i = 0; i < 20000; i++) { const a = agent.act(rng); agent.update(a, i % 3 === a ? 1 : 0); }
    expect(agent.policy().reduce((a, b) => a + b)).toBeCloseTo(1, 12);
    expect(agent.policy().every(p => Number.isFinite(p) && p >= 0 && p <= 1)).toBe(true);
    expect(agent.state().counts.reduce((a, b) => a + b)).toBe(20000);
    expect(agent.state().logWeights.every(Number.isFinite)).toBe(true);
  });
  it('rejects invalid observations without changing state', () => {
    const agent = createAgent(algorithm, 3, 0.1, 0.1), before = agent.state();
    for (const [a, r] of [[-1, 1], [3, 0], [0.5, 0], [0, -1], [0, 2], [0, NaN]]) expect(() => agent.update(a, r)).toThrow();
    expect(agent.state()).toEqual(before);
  });
});

it('epsilon=0 exploits highest mean and ties are uniform', () => {
  const agent = createAgent('epsilon', 3, 0, 0.1);
  expect(agent.policy()).toEqual([1 / 3, 1 / 3, 1 / 3]);
  agent.update(1, 1); expect(agent.act(() => 0.999)).toBe(1);
  agent.update(2, 1); expect(agent.policy()).toEqual([0, 0.5, 0.5]);
});
it('epsilon mixture has correct exploration intervals', () => {
  const agent = createAgent('epsilon', 3, 0.3, 0.1); agent.update(1, 1);
  expect(agent.act(() => 0.099)).toBe(0);
  expect(agent.act(() => 0.101)).toBe(1);
  expect(agent.act(() => 0.901)).toBe(2);
  const uniform = createAgent('epsilon', 3, 1, 0.1); uniform.update(1, 1);
  expect(uniform.act(() => 0.1)).toBe(0);
});
it('UCB1 visits every unseen arm, then applies sqrt(2 ln(t)/n)', () => {
  const agent = createAgent('ucb', 3, 0.1, 0.1);
  for (const expected of [0, 1, 2]) { expect(agent.act(() => 0)).toBe(expected); agent.update(expected, expected === 0 ? 1 : 0); }
  expect(agent.act(() => 0.5)).toBe(0);
  for (let i = 0; i < 40; i++) agent.update(0, 1);
  expect(agent.act(() => 0)).toBe(1); // Exploration bonus of unseen-after-initialization arms now dominates.
});
it('EXP3 applies importance-weighted bounded rewards with stable log weights', () => {
  const gamma = 0.2, agent = createAgent('exp3', 3, 0.1, gamma);
  agent.update(0, 0.75);
  const weight = Math.exp(gamma * 0.75);
  expect(agent.policy()[0]).toBeCloseTo(weight / (weight + 2), 12);
  const p1 = (1 - gamma) * agent.policy()[1] + gamma / 3;
  const oldOdds = Math.log(agent.policy()[1] / agent.policy()[0]);
  agent.update(1, 1);
  expect(Math.log(agent.policy()[1] / agent.policy()[0]) - oldOdds).toBeCloseTo(gamma / (3 * p1), 12);
  const before = agent.policy(); agent.update(2, 0); expect(agent.policy()).toEqual(before);
});
it('random baseline ignores learned means in action selection', () => {
  const agent = createAgent('random', 3, 0, 0.1); agent.update(0, 1);
  expect(agent.policy()).toEqual([1 / 3, 1 / 3, 1 / 3]); expect(agent.act(() => 0.9)).toBe(2);
});
it.each([[0, 0.1], [1.1, 0.1], [NaN, 0.1], [0.1, 0], [0.1, 1.1]])('rejects epsilon=%s gamma=%s', (e, g) => {
  if (e === 0) expect(() => createAgent('exp3', 1, e, g)).toThrow();
  else expect(() => createAgent('exp3', 3, e, g)).toThrow();
});

import { describe, expect, it } from 'vitest';
import { GAMES, normalizeReward, payoff } from '../src/core/games';
import { createRandom, sample } from '../src/core/random';

describe.each(Object.values(GAMES))('$id rules', game => {
  it('matches the full published matrix and antisymmetric zero-sum rule', () => {
    const expected = game.id === 'rps' ? [[0, -1, 1], [1, 0, -1], [-1, 1, 0]] : [[0, -2, 3], [2, 0, -1], [-3, 1, 0]];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      expect(payoff(game, a, b)).toBe(expected[a][b]);
      expect(payoff(game, a, b) + payoff(game, b, a)).toBe(0);
      if (a === b) expect(payoff(game, a, b)).toBe(0);
    }
  });
  it('maps extremes and draws onto [0,1]', () => {
    expect(normalizeReward(game, game.min)).toBe(0);
    expect(normalizeReward(game, 0)).toBe(0.5);
    expect(normalizeReward(game, game.max)).toBe(1);
  });
  it.each([-1, 3, 0.2, NaN, Infinity])('rejects invalid action %s', a => {
    expect(() => payoff(game, a, 0)).toThrow(); expect(() => payoff(game, 0, a)).toThrow();
  });
  it.each([NaN, Infinity, -4, 4])('rejects invalid reward %s', r => expect(() => normalizeReward(game, r)).toThrow());
  it('has zero expected reward at its documented minimax equilibrium', () => {
    const p = game.id === 'rps' ? [1 / 3, 1 / 3, 1 / 3] : [1 / 6, 1 / 2, 1 / 3];
    for (let b = 0; b < 3; b++) expect(p.reduce((sum, prob, a) => sum + prob * payoff(game, a, b), 0)).toBeCloseTo(0, 12);
  });
  it('randomized payoff and normalization regression (1,000 pairs)', () => {
    const rng = createRandom(509);
    for (let i = 0; i < 1000; i++) {
      const a = Math.floor(rng() * 3), b = Math.floor(rng() * 3);
      const r = payoff(game, a, b);
      expect(normalizeReward(game, r) * (game.max - game.min) + game.min).toBeCloseTo(r, 12);
    }
  });
});

it('PRNG repeats exactly including seed zero, without global Math.random', () => {
  const a = createRandom(0), b = createRandom(0), c = createRandom(1);
  const sequence = Array.from({ length: 1000 }, a);
  expect(sequence).toEqual(Array.from({ length: 1000 }, b));
  expect(sequence).not.toEqual(Array.from({ length: 1000 }, c));
  expect(sequence.every(n => n >= 0 && n < 1)).toBe(true);
  expect(sequence.slice(0, 3)).toEqual([0.26642920868471265, 0.0003297457005828619, 0.2232720274478197]);
});
it('categorical sampler respects interval boundaries', () => {
  expect(sample([0, 1, 0], () => 0)).toBe(1);
  expect(sample([0.5, 0.5], () => 0.5)).toBe(1);
  expect(sample([0.2, 0.3, 0.5], () => 0.999999)).toBe(2);
});

import type { Game, GameId } from './types';

export const GAMES: Record<GameId, Game> = {
  rps: {
    id: 'rps', name: '标准石头剪刀布', actions: ['石头', '布', '剪刀'],
    matrix: [[0, -1, 1], [1, 0, -1], [-1, 1, 0]], min: -1, max: 1,
  },
  tactics: {
    id: 'tactics', name: '突击 · 防守 · 佯攻', actions: ['突击', '防守', '佯攻'],
    matrix: [[0, -2, 3], [2, 0, -1], [-3, 1, 0]], min: -3, max: 3,
  },
};

export function payoff(game: Game, action: number, opponentAction: number): number {
  if (![action, opponentAction].every(a => Number.isInteger(a) && a >= 0 && a < game.actions.length)) {
    throw new Error('动作索引超出规则范围');
  }
  return game.matrix[action][opponentAction];
}

export function normalizeReward(game: Game, reward: number): number {
  if (!Number.isFinite(reward) || reward < game.min || reward > game.max) throw new Error('收益超出规则范围');
  return (reward - game.min) / (game.max - game.min);
}

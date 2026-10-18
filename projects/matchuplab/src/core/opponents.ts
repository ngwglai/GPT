import { greedy, sample, type Random } from './random';
import type { Game, OpponentSpec } from './types';

// Receives only the PREVIOUS player action, never the current simultaneous move.
export function opponentAction(spec: OpponentSpec, game: Game, round: number, previous: number | undefined, random: Random): number {
  const k = game.actions.length;
  switch (spec.kind) {
    case 'uniform': return Math.floor(random() * k);
    case 'fixed': return spec.action;
    case 'biased': return sample(Array.from({ length: k }, (_, i) => i === spec.action ? spec.bias : (1 - spec.bias) / (k - 1)), random);
    case 'reactive': return previous === undefined ? Math.floor(random() * k) : sample(greedy(game.matrix[previous].map(v => -v)), random);
    case 'switching': return round >= spec.switchRound ? spec.nextAction : spec.action;
  }
}

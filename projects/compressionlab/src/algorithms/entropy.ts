import type { EntropyResult } from '../models/types';
import { compareSymbols, utf8Bytes } from './common';

/** Symbols are Unicode code points (Array.from), without normalization. */
export function analyzeEntropy(input: string): EntropyResult {
  const symbols = Array.from(input);
  const counts = new Map<string, number>();
  for (const symbol of symbols) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  const frequencies = [...counts].sort(([a], [b]) => compareSymbols(a, b))
    .map(([symbol, count]) => ({ symbol, count, probability: count / symbols.length }));
  // Compensated summation keeps tiny terms from being lost in a skewed distribution.
  let entropy = 0;
  let compensation = 0;
  for (const { probability } of frequencies) {
    const term = -probability * Math.log2(probability) - compensation;
    const next = entropy + term;
    compensation = (next - entropy) - term;
    entropy = next;
  }
  return {
    symbols: symbols.length, bytes: utf8Bytes(input), frequencies,
    entropy, lowerBoundBits: entropy * symbols.length,
  };
}

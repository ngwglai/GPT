import type { BwtResult } from '../models/types';
import { compareSymbols, requireInteger, requireUnicode } from './common';

export const BWT_LIMIT = 96;

/** Cyclic rotations with primary index; no reserved sentinel symbol. */
export function bwt(input: string): BwtResult {
  requireUnicode(input);
  const symbols = Array.from(input);
  requireInteger(symbols.length, 0, BWT_LIMIT, 'BWT input length');
  const rotations = symbols.map((_, start) => ({
    start, symbols: [...symbols.slice(start), ...symbols.slice(0, start)],
  }));
  const sorted = [...rotations].sort((a, b) => {
    for (let i = 0; i < symbols.length; i++) {
      const difference = compareSymbols(a.symbols[i], b.symbols[i]);
      if (difference) return difference;
    }
    return a.start - b.start;
  });
  return {
    rotations, sorted,
    lastColumn: sorted.map(row => row.symbols[symbols.length - 1]).join(''),
    primaryIndex: symbols.length ? sorted.findIndex(row => row.start === 0) : 0,
  };
}

/** LF mapping in O(n log n) time / O(n) memory, also valid for periodic strings. */
export function inverseBwt(lastColumn: string, primaryIndex: number): string {
  requireUnicode(lastColumn);
  const last = Array.from(lastColumn);
  requireInteger(last.length, 0, BWT_LIMIT, 'BWT input length');
  requireInteger(primaryIndex, 0, Math.max(0, last.length - 1), 'primary index');
  const first = last.map((symbol, index) => ({ symbol, index }))
    .sort((a, b) => compareSymbols(a.symbol, b.symbol) || a.index - b.index);
  const lf: number[] = [];
  first.forEach(({ index }, row) => { lf[index] = row; });
  const output = new Array<string>(last.length);
  let row = primaryIndex;
  for (let i = last.length - 1; i >= 0; i--) {
    output[i] = last[row];
    row = lf[row];
  }
  return output.join('');
}

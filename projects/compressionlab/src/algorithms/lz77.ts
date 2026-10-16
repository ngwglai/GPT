import type { LzStep, LzToken } from '../models/types';
import { requireInteger } from './common';

export function encodeLz77(input: string, windowSize = 16, lookaheadSize = 8) {
  requireInteger(windowSize, 1, 256, 'window');
  requireInteger(lookaheadSize, 1, 64, 'lookahead');
  const symbols = Array.from(input);
  const tokens: LzToken[] = [];
  const trace: LzStep[] = [];
  let position = 0;
  const snapshot = (token: LzToken | null): LzStep => ({
    position, windowStart: Math.max(0, position - windowSize),
    window: symbols.slice(Math.max(0, position - windowSize), position),
    lookahead: symbols.slice(position, position + lookaheadSize),
    token, tokens: [...tokens],
  });
  trace.push(snapshot(null));
  while (position < symbols.length) {
    let length = 0;
    let distance = 0;
    const limit = Math.min(lookaheadSize, symbols.length - position);
    // Nearest match wins ties. Source may overlap destination, as in the decoder.
    for (let candidate = 1; candidate <= Math.min(windowSize, position); candidate++) {
      let matched = 0;
      while (matched < limit && symbols[position + matched] === symbols[position - candidate + matched]) matched++;
      if (matched > length) { length = matched; distance = candidate; }
    }
    const next = symbols[position + length] ?? null;
    const token = { distance, length, next };
    tokens.push(token);
    trace.push(snapshot(token));
    position += length + (next === null ? 0 : 1);
  }
  trace.push(snapshot(null));
  return { tokens, trace };
}

export function decodeLz77(tokens: readonly LzToken[]): string {
  const output: string[] = [];
  for (const { distance, length, next } of tokens) {
    if (!Number.isSafeInteger(distance) || !Number.isSafeInteger(length)
      || distance < 0 || length < 0 || distance > output.length
      || (length > 0 && distance === 0) || (length === 0 && distance !== 0)
      || (next !== null && Array.from(next).length !== 1) || (length === 0 && next === null)) {
      throw new Error('Invalid LZ77 token');
    }
    for (let i = 0; i < length; i++) output.push(output[output.length - distance]);
    if (next !== null) output.push(next);
  }
  return output.join('');
}

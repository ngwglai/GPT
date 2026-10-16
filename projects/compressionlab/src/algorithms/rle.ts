import type { RleStep, RunToken } from '../models/types';

export function encodeRle(input: string) {
  const symbols = Array.from(input);
  const tokens: RunToken[] = [];
  const trace: RleStep[] = [{ position: -1, run: null, emitted: [] }];
  let run: RunToken | null = null;
  symbols.forEach((symbol, position) => {
    if (run?.symbol === symbol) run = { symbol, count: run.count + 1 };
    else {
      if (run) tokens.push(run);
      run = { symbol, count: 1 };
    }
    trace.push({ position, run: { ...run }, emitted: [...tokens] });
  });
  if (run) tokens.push(run);
  trace.push({ position: symbols.length, run: null, emitted: [...tokens] });
  return { tokens, trace };
}

export function decodeRle(tokens: readonly RunToken[]): string {
  return tokens.map(({ symbol, count }) => {
    if (Array.from(symbol).length !== 1 || !Number.isSafeInteger(count) || count <= 0) {
      throw new Error('Invalid RLE token');
    }
    return symbol.repeat(count);
  }).join('');
}

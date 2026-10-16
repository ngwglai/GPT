import type { MtfStep } from '../models/types';
import { compareSymbols } from './common';

export function encodeMtf(input: string) {
  const symbols = Array.from(input);
  const initialAlphabet = [...new Set(symbols)].sort(compareSymbols);
  const alphabet = [...initialAlphabet];
  const output: number[] = [];
  const trace: MtfStep[] = [{ position: -1, symbol: null, index: null, alphabet: [...alphabet], output: [] }];
  symbols.forEach((symbol, position) => {
    const index = alphabet.indexOf(symbol);
    output.push(index);
    alphabet.splice(index, 1);
    alphabet.unshift(symbol);
    trace.push({ position, symbol, index, alphabet: [...alphabet], output: [...output] });
  });
  return { initialAlphabet, output, trace };
}

export function decodeMtf(output: readonly number[], initialAlphabet: readonly string[]): string {
  if (new Set(initialAlphabet).size !== initialAlphabet.length
    || initialAlphabet.some(symbol => Array.from(symbol).length !== 1)) throw new Error('Invalid alphabet');
  const alphabet = [...initialAlphabet];
  return output.map(index => {
    if (!Number.isInteger(index) || index < 0 || index >= alphabet.length) throw new Error('Invalid MTF index');
    const [symbol] = alphabet.splice(index, 1);
    alphabet.unshift(symbol);
    return symbol;
  }).join('');
}

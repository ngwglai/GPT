import type { HuffmanNode, HuffmanStep } from '../models/types';
import { analyzeEntropy } from './entropy';
import { compareSymbols } from './common';

export function buildHuffman(input: string) {
  const analysis = analyzeEntropy(input);
  const order = (a: HuffmanNode, b: HuffmanNode) =>
    a.weight - b.weight || compareSymbols(a.minSymbol, b.minSymbol) || a.id - b.id;
  let nextId = 0;
  let queue: HuffmanNode[] = analysis.frequencies.map(({ symbol, count }) => ({
    id: nextId++, symbol, weight: count, minSymbol: symbol,
  })).sort(order);
  const trace: HuffmanStep[] = [{ queue: [...queue], merged: null, parent: null }];
  while (queue.length > 1) {
    const [left, right, ...rest] = queue;
    const parent: HuffmanNode = {
      id: nextId++, weight: left.weight + right.weight,
      minSymbol: compareSymbols(left.minSymbol, right.minSymbol) < 0 ? left.minSymbol : right.minSymbol,
      left, right,
    };
    queue = [...rest, parent].sort(order);
    trace.push({ queue: [...queue], merged: [left, right], parent });
  }
  const root = queue[0] ?? null;
  const codes = new Map<string, string>();
  // Iterative traversal also handles highly skewed trees without stack recursion.
  const stack = root ? [{ node: root, code: '' }] : [];
  while (stack.length) {
    const { node, code } = stack.pop()!;
    if (node.symbol !== undefined) codes.set(node.symbol, code || '0');
    if (node.right) stack.push({ node: node.right, code: code + '1' });
    if (node.left) stack.push({ node: node.left, code: code + '0' });
  }
  const bits = encodeHuffman(input, codes);
  const averageLength = analysis.symbols ? bits.length / analysis.symbols : 0;
  return { root, codes, bits, trace, averageLength, analysis };
}

export function encodeHuffman(input: string, codes: ReadonlyMap<string, string>): string {
  return Array.from(input).map(symbol => {
    const code = codes.get(symbol);
    if (code === undefined) throw new Error('Symbol missing from codebook');
    return code;
  }).join('');
}

export function decodeHuffman(bits: string, root: HuffmanNode | null): string {
  if (/[^01]/u.test(bits)) throw new Error('Invalid bit stream');
  if (!root) {
    if (bits) throw new Error('Bits without a tree');
    return '';
  }
  if (root.symbol !== undefined) {
    if (bits.includes('1')) throw new Error('Single symbol uses code 0');
    return root.symbol.repeat(bits.length);
  }
  const output: string[] = [];
  let node = root;
  for (const bit of bits) {
    const next = bit === '0' ? node.left : node.right;
    if (!next) throw new Error('Invalid path');
    node = next;
    if (node.symbol !== undefined) { output.push(node.symbol); node = root; }
  }
  if (node !== root) throw new Error('Incomplete codeword');
  return output.join('');
}

export function isPrefixFree(codes: ReadonlyMap<string, string>): boolean {
  const values = [...codes.values()].sort();
  return values.every((code, i) => /^[01]+$/u.test(code)
    && (i === 0 || !code.startsWith(values[i - 1])));
}

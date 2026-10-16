import { describe, expect, it } from 'vitest';
import { analyzeEntropy } from '../src/algorithms/entropy';
import { buildHuffman, decodeHuffman, encodeHuffman, isPrefixFree } from '../src/algorithms/huffman';
import { encodeRle, decodeRle } from '../src/algorithms/rle';
import { encodeLz77, decodeLz77 } from '../src/algorithms/lz77';
import { bwt, inverseBwt, BWT_LIMIT } from '../src/algorithms/bwt';
import { encodeMtf, decodeMtf } from '../src/algorithms/mtf';
import { jsonBits, utf8Bytes } from '../src/algorithms/common';
import { datasets, prepareLab, INPUT_LIMIT } from '../src/simulation/lab';

const cases = ['', 'x', 'xy', 'abcdef', 'aaaaaa', 'aaabbccccaaa', 'abababababab',
  'banana', 'mississippi', 'the little letter tells a tale.', '中文中文🙂🙂🧪', 'éée\u0301', '\0\n\t $|:123', '😀a𐐀😀a'];

describe('Entropy', () => {
  it('defines empty input without NaN', () => {
    expect(analyzeEntropy('')).toEqual({ symbols: 0, bytes: 0, frequencies: [], entropy: 0, lowerBoundBits: 0 });
  });
  it('gives zero for a single symbol', () => expect(analyzeEntropy('🙂'.repeat(30)).entropy).toBe(0));
  it('uniform four-symbol distribution is exactly 2 bits', () => {
    const result = analyzeEntropy('aabbccdd');
    expect(result.entropy).toBe(2);
    expect(result.lowerBoundBits).toBe(16);
    expect(result.frequencies.map(row => row.probability)).toEqual([.25, .25, .25, .25]);
  });
  it('matches an independent non-uniform calculation', () => {
    expect(analyzeEntropy('aaab').entropy).toBeCloseTo(-.75 * Math.log2(.75) - .25 * Math.log2(.25), 14);
  });
  it('is numerically stable for a very skewed distribution', () => {
    const result = analyzeEntropy('a'.repeat(100000) + 'bc');
    expect(Number.isFinite(result.entropy)).toBe(true);
    expect(result.entropy).toBeGreaterThan(0);
    expect(result.entropy).toBeLessThan(Math.log2(3));
    expect(result.frequencies.reduce((sum, row) => sum + row.probability, 0)).toBeCloseTo(1, 14);
  });
  it('counts code points and UTF-8 bytes separately without normalization', () => {
    const result = analyzeEntropy('a中🙂e\u0301');
    expect(result.symbols).toBe(5);
    expect(result.bytes).toBe(11);
  });
  it('does not confuse order with zero-order entropy', () => {
    expect(analyzeEntropy('abababab').entropy).toBe(analyzeEntropy('aaaabbbb').entropy);
  });
});

describe('Huffman', () => {
  it.each(cases)('prefix-free round-trip for %j', input => {
    const result = buildHuffman(input);
    expect(isPrefixFree(result.codes)).toBe(true);
    expect(decodeHuffman(result.bits, result.root)).toBe(input);
    expect(result.bits.length).toBe(result.analysis.frequencies.reduce((sum, row) => sum + row.count * result.codes.get(row.symbol)!.length, 0));
  });
  it('uses explicit zero bits for a single symbol', () => {
    const result = buildHuffman('xxxxx');
    expect(result.bits).toBe('00000');
    expect(result.averageLength).toBe(1);
  });
  it('is deterministic across input permutations with equal frequencies', () => {
    expect([...buildHuffman('abcd').codes]).toEqual([['a', '00'], ['b', '01'], ['c', '10'], ['d', '11']]);
    expect([...buildHuffman('dcba').codes]).toEqual([...buildHuffman('abcd').codes]);
  });
  it('uses code point ordering independent of locale and UTF-16', () => {
    expect([...buildHuffman('😀\uE000').codes.keys()]).toEqual(['\uE000', '😀']);
  });
  it('records real minimum-weight merges without mutating earlier queues', () => {
    const { trace } = buildHuffman('abbbbccddd');
    for (let i = 1; i < trace.length; i++) {
      const prior = trace[i - 1];
      const step = trace[i];
      expect(step.merged!.map(node => node.id)).toEqual(prior.queue.slice(0, 2).map(node => node.id));
      expect(step.parent!.weight).toBe(step.merged![0].weight + step.merged![1].weight);
      expect(step.queue.reduce((sum, node) => sum + node.weight, 0)).toBe(10);
      expect(step.queue.length).toBe(prior.queue.length - 1);
    }
    expect(trace[0].queue.length).toBe(4);
  });
  it('satisfies entropy bounds for nontrivial alphabets', () => {
    for (const input of Object.values(datasets)) {
      const result = buildHuffman(input);
      expect(result.averageLength).toBeGreaterThanOrEqual(result.analysis.entropy - 1e-12);
      expect(result.averageLength).toBeLessThan(result.analysis.entropy + 1);
    }
  });
  it('rejects malformed streams and detects non-prefix-free tables', () => {
    const tree = buildHuffman('abcccc').root;
    expect(() => decodeHuffman('2', tree)).toThrow();
    expect(() => decodeHuffman('0', tree)).toThrow();
    expect(() => decodeHuffman('0', null)).toThrow();
    expect(() => decodeHuffman('1', buildHuffman('a').root)).toThrow();
    expect(() => encodeHuffman('b', new Map([['a', '0']]))).toThrow();
    expect(isPrefixFree(new Map([['a', '0'], ['b', '01']]))).toBe(false);
  });
});

describe('RLE', () => {
  it.each(cases)('round-trip for %j', input => {
    const { tokens, trace } = encodeRle(input);
    expect(decodeRle(tokens)).toBe(input);
    expect(trace.at(-1)!.emitted).toEqual(tokens);
    expect(tokens.reduce((sum, token) => sum + token.count, 0)).toBe(Array.from(input).length);
    expect(trace.length).toBe(Array.from(input).length + 2);
  });
  it('flushes only when the symbol changes or the scan ends', () => {
    const { tokens, trace } = encodeRle('aaabb');
    expect(tokens).toEqual([{ symbol: 'a', count: 3 }, { symbol: 'b', count: 2 }]);
    expect(trace[3]).toEqual({ position: 2, run: { symbol: 'a', count: 3 }, emitted: [] });
    expect(trace[4].emitted).toEqual([{ symbol: 'a', count: 3 }]);
  });
  it('rejects invalid counts and multi-symbol tokens', () => {
    for (const count of [0, -1, .5, NaN]) expect(() => decodeRle([{ symbol: 'a', count }])).toThrow();
    expect(() => decodeRle([{ symbol: 'ab', count: 1 }])).toThrow();
  });
});

describe('LZ77', () => {
  it.each(cases)('round-trip for %j over narrow and wide windows', input => {
    for (const window of [1, 4, 16]) for (const lookahead of [1, 3, 8]) {
      const result = encodeLz77(input, window, lookahead);
      expect(decodeLz77(result.tokens)).toBe(input);
      expect(result.trace.at(-1)!.position).toBe(Array.from(input).length);
      for (const step of result.trace) {
        expect(step.window.length).toBeLessThanOrEqual(window);
        expect(step.lookahead.length).toBeLessThanOrEqual(lookahead);
        expect(step.window).toEqual(Array.from(input).slice(step.windowStart, step.position));
      }
    }
  });
  it('emits literals when there is no repetition', () => {
    expect(encodeLz77('abc').tokens).toEqual(['a', 'b', 'c'].map(next => ({ distance: 0, length: 0, next })));
  });
  it('handles overlapping matches and a null end literal', () => {
    const result = encodeLz77('aaaaaaaa', 4, 16);
    expect(result.tokens).toEqual([{ distance: 0, length: 0, next: 'a' }, { distance: 1, length: 7, next: null }]);
    expect(decodeLz77(result.tokens)).toBe('aaaaaaaa');
  });
  it('includes exact window boundary and excludes an older match', () => {
    expect(encodeLz77('abcdabcd', 4, 8).tokens.at(-1)).toEqual({ distance: 4, length: 4, next: null });
    expect(encodeLz77('abcdabcd', 3, 8).tokens).toHaveLength(8);
  });
  it('breaks matching ties using the nearest source', () => {
    expect(encodeLz77('abcabcabc', 8, 2).tokens.filter(token => token.length).every(token => token.distance === 3)).toBe(true);
  });
  it('validates parameters and malformed tokens', () => {
    for (const size of [0, -1, .5, Infinity]) expect(() => encodeLz77('abc', size, 8)).toThrow();
    expect(() => encodeLz77('abc', 4, 65)).toThrow();
    expect(() => decodeLz77([{ distance: 1, length: 2, next: 'x' }])).toThrow();
    expect(() => decodeLz77([{ distance: 0, length: 0, next: null }])).toThrow();
    expect(() => decodeLz77([{ distance: 0, length: 1, next: 'x' }])).toThrow();
  });
});

describe('BWT', () => {
  it.each(cases)('inverts cyclic transform for %j', input => {
    const result = bwt(input);
    expect(inverseBwt(result.lastColumn, result.primaryIndex)).toBe(input);
    expect(Array.from(result.lastColumn).sort()).toEqual(Array.from(input).sort());
    if (input) expect(result.sorted[result.primaryIndex].symbols.join('')).toBe(input);
  });
  it('has the known banana rotation matrix and primary index', () => {
    const result = bwt('banana');
    expect(result.sorted.map(row => row.symbols.join(''))).toEqual(['abanan', 'anaban', 'ananab', 'banana', 'nabana', 'nanaba']);
    expect(result.lastColumn).toBe('nnbaaa');
    expect(result.primaryIndex).toBe(3);
  });
  it('keeps duplicate rotation order deterministic for periodic data', () => {
    expect(bwt('abab').sorted.map(row => row.start)).toEqual([0, 2, 1, 3]);
    expect(inverseBwt(bwt('aaaa').lastColumn, bwt('aaaa').primaryIndex)).toBe('aaaa');
  });
  it('enforces quadratic visualization limit and primary index bounds', () => {
    expect(bwt('a'.repeat(BWT_LIMIT)).rotations).toHaveLength(BWT_LIMIT);
    expect(() => bwt('a'.repeat(BWT_LIMIT + 1))).toThrow();
    expect(() => inverseBwt('abc', 3)).toThrow();
    expect(() => inverseBwt('', 1)).toThrow();
  });
});

describe('MTF', () => {
  it.each(cases)('inverts index transform for %j', input => {
    const result = encodeMtf(input);
    expect(decodeMtf(result.output, result.initialAlphabet)).toBe(input);
    expect(result.trace.at(-1)!.output).toEqual(result.output);
    for (const step of result.trace.slice(1)) expect(step.alphabet[0]).toBe(step.symbol);
  });
  it('has known banana indices and repeated-zero behavior', () => {
    expect(encodeMtf('banana').output).toEqual([1, 1, 2, 1, 1, 1]);
    expect(encodeMtf('aaaa').output).toEqual([0, 0, 0, 0]);
  });
  it('rejects malformed alphabets and indices', () => {
    expect(() => decodeMtf([1], ['a'])).toThrow();
    expect(() => decodeMtf([.5], ['a'])).toThrow();
    expect(() => decodeMtf([0], ['a', 'a'])).toThrow();
    expect(() => decodeMtf([0], ['ab'])).toThrow();
  });
});

describe('cross-algorithm invariants', () => {
  it('round-trips 250 deterministic mixed Unicode samples through all codecs', () => {
    let seed = 12345;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const alphabet = ['a', 'b', '中', '🙂', '\0', '\n', '\u0301', '𐐀'];
    for (let sample = 0; sample < 250; sample++) {
      const input = Array.from({ length: Math.floor(random() * 65) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const huffman = buildHuffman(input);
      expect(decodeHuffman(huffman.bits, huffman.root)).toBe(input);
      expect(isPrefixFree(huffman.codes)).toBe(true);
      expect(decodeRle(encodeRle(input).tokens)).toBe(input);
      const lz = encodeLz77(input, 1 + Math.floor(random() * 32), 1 + Math.floor(random() * 16));
      expect(decodeLz77(lz.tokens)).toBe(input);
      const transformed = bwt(input);
      const mtf = encodeMtf(transformed.lastColumn);
      expect(inverseBwt(decodeMtf(mtf.output, mtf.initialAlphabet), transformed.primaryIndex)).toBe(input);
    }
  });
  it('prepares honest byte statistics, final snapshots and verification results', () => {
    const lab = prepareLab('banana🙂', 8, 4);
    expect(Object.values(lab.verified).every(Boolean)).toBe(true);
    expect(lab.entropyTrace.at(-1)).toEqual(lab.entropy);
    expect(lab.comparisons.find(row => row.name === 'RLE')!.bits).toBe(utf8Bytes(JSON.stringify(lab.rle.tokens)) * 8);
    expect(lab.comparisons.find(row => row.name === 'Huffman')!.metadataBits).toBe(jsonBits([...lab.huffman.codes]));
  });
  it('skips BWT alone for longer inputs and rejects UI trace overflow', () => {
    const lab = prepareLab('ab'.repeat(100), 16, 8);
    expect(lab.transformed).toBeNull();
    expect(lab.verified.bwt).toBeNull();
    expect(lab.comparisons).toHaveLength(3);
    expect(() => prepareLab('a'.repeat(INPUT_LIMIT + 1), 16, 8)).toThrow();
  });
  it('all generic fixtures fit BWT and produce valid results', () => {
    for (const text of Object.values(datasets)) {
      expect(Array.from(text).length).toBeLessThanOrEqual(BWT_LIMIT);
      expect(Object.values(prepareLab(text, 16, 8).verified).every(Boolean)).toBe(true);
    }
  });
});

describe('Unicode and bounded traces', () => {
  it('rejects unpaired surrogates instead of silently replacing UTF-8 data', () => {
    expect(() => bwt('\uD800')).toThrow();
    expect(() => inverseBwt('\uDC00', 0)).toThrow();
    expect(() => prepareLab('\uD800', 16, 8)).toThrow();
  });
  it('prepares maximum-sized distinct-symbol traces with valid round-trips', () => {
    const input = Array.from({ length: INPUT_LIMIT }, (_, index) => String.fromCodePoint(0x400 + index)).join('');
    const lab = prepareLab(input, 64, 32);
    expect(lab.entropyTrace).toHaveLength(INPUT_LIMIT + 1);
    expect(lab.huffman.trace).toHaveLength(INPUT_LIMIT);
    expect(lab.verified.huffman && lab.verified.rle && lab.verified.lz77).toBe(true);
  });
  it('BWT trace contains actual rotations, sorted rows and each MTF update', () => {
    const lab = prepareLab('banana', 16, 8);
    expect(lab.bwtTrace.filter(step => step.phase === 'rotate')).toHaveLength(7);
    expect(lab.bwtTrace.filter(step => step.phase === 'mtf')).toHaveLength(lab.mtf!.trace.length);
    expect(lab.bwtTrace.at(-1)).toEqual({ phase: 'mtf', visible: lab.mtf!.trace.length - 1 });
  });
});

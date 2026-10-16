import { analyzeEntropy } from '../algorithms/entropy';
import { buildHuffman, decodeHuffman } from '../algorithms/huffman';
import { encodeRle, decodeRle } from '../algorithms/rle';
import { encodeLz77, decodeLz77 } from '../algorithms/lz77';
import { bwt, inverseBwt, BWT_LIMIT } from '../algorithms/bwt';
import { encodeMtf, decodeMtf } from '../algorithms/mtf';
import { jsonBits, requireInteger, requireUnicode } from '../algorithms/common';

export const INPUT_LIMIT = 512;
export const experiments = ['Information Entropy', 'Huffman Coding', 'RLE + LZ77', 'BWT + Move-to-Front'] as const;
export type Experiment = typeof experiments[number];
export type TokenAlgorithm = 'RLE' | 'LZ77';

export const datasets: Record<string, string> = {
  'English-like text': 'a little letter tells a tale. a little tale tells a lot.',
  'Highly repetitive text': 'aaaaaaaaaaaaaaaaaaaabbbbbbbbbbaaaaaaaaaaaaaaaaaaaa',
  'Periodic text': 'abcabcabcabcabcabcabcabcabcabc',
  'Random text': 'Q7m!x2B@v9K#s4W%p6D&h8J*r3F?c5N+z0L=Y',
  'DNA-like sequence': 'ACGTACGTAAAACCCCGGGGTTTTACGTACGTGATTACAGATTACA',
};

export interface Comparison {
  name: string;
  bits: number;
  metadataBits: number;
  average: number | null;
  note: string;
}

/** A bounded, immutable result bundle. UI only selects snapshots from these traces. */
export function prepareLab(input: string, windowSize: number, lookaheadSize: number) {
  requireUnicode(input);
  const symbols = Array.from(input);
  requireInteger(symbols.length, 0, INPUT_LIMIT, 'input length');
  const entropy = analyzeEntropy(input);
  const entropyTrace = [analyzeEntropy('')];
  for (let i = 1; i <= symbols.length; i++) entropyTrace.push(analyzeEntropy(symbols.slice(0, i).join('')));
  const huffman = buildHuffman(input);
  const rle = encodeRle(input);
  const lz77 = encodeLz77(input, windowSize, lookaheadSize);
  const transformed = symbols.length <= BWT_LIMIT ? bwt(input) : null;
  const mtf = transformed ? encodeMtf(transformed.lastColumn) : null;
  const bwtTrace = transformed ? [
    ...transformed.rotations.map((_, index) => ({ phase: 'rotate' as const, visible: index + 1 })),
    { phase: 'sort' as const, visible: transformed.sorted.length },
    { phase: 'last' as const, visible: transformed.sorted.length },
    ...(mtf?.trace.map((_, index) => ({ phase: 'mtf' as const, visible: index })) ?? []),
  ] : [];
  // Include an initial pre-transform snapshot even for empty input.
  bwtTrace.unshift({ phase: 'rotate', visible: 0 });
  const comparisons: Comparison[] = [
    {
      name: 'Huffman', bits: huffman.bits.length,
      metadataBits: jsonBits([...huffman.codes]), average: huffman.averageLength,
      note: '逻辑载荷 bit；另列 JSON 编码表，不含打包/容器开销',
    },
    { name: 'RLE', bits: jsonBits(rle.tokens), metadataBits: 0, average: null, note: 'UTF-8 JSON token 数组' },
    { name: 'LZ77', bits: jsonBits(lz77.tokens), metadataBits: 0, average: null, note: 'UTF-8 JSON token 数组' },
  ];
  if (transformed && mtf) {
    comparisons.push(
      {
        name: 'BWT', bits: jsonBits({ lastColumn: transformed.lastColumn, primaryIndex: transformed.primaryIndex }),
        metadataBits: 0, average: null, note: '变换；UTF-8 JSON（含 primary index）',
      },
      {
        name: 'BWT + MTF',
        bits: jsonBits({ output: mtf.output, alphabet: mtf.initialAlphabet, primaryIndex: transformed.primaryIndex }),
        metadataBits: 0, average: null, note: '变换；UTF-8 JSON（含 alphabet 和 primary index）',
      },
    );
  }
  const verified = {
    huffman: decodeHuffman(huffman.bits, huffman.root) === input,
    rle: decodeRle(rle.tokens) === input,
    lz77: decodeLz77(lz77.tokens) === input,
    bwt: transformed ? inverseBwt(transformed.lastColumn, transformed.primaryIndex) === input : null,
    mtf: mtf && transformed
      ? inverseBwt(decodeMtf(mtf.output, mtf.initialAlphabet), transformed.primaryIndex) === input : null,
  };
  return { input, symbols, entropy, entropyTrace, huffman, rle, lz77, transformed, mtf, bwtTrace, comparisons, verified };
}
export type Lab = ReturnType<typeof prepareLab>;

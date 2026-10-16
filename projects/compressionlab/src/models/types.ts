export interface Frequency {
  symbol: string;
  count: number;
  probability: number;
}

export interface EntropyResult {
  symbols: number;
  bytes: number;
  frequencies: Frequency[];
  entropy: number;
  lowerBoundBits: number;
}

export interface HuffmanNode {
  id: number;
  weight: number;
  minSymbol: string;
  symbol?: string;
  left?: HuffmanNode;
  right?: HuffmanNode;
}

export interface HuffmanStep {
  queue: HuffmanNode[];
  merged: [HuffmanNode, HuffmanNode] | null;
  parent: HuffmanNode | null;
}

export interface RunToken { symbol: string; count: number }
export interface RleStep {
  position: number;
  run: RunToken | null;
  emitted: RunToken[];
}

export interface LzToken { distance: number; length: number; next: string | null }
export interface LzStep {
  position: number;
  windowStart: number;
  window: string[];
  lookahead: string[];
  token: LzToken | null;
  tokens: LzToken[];
}

export interface Rotation { start: number; symbols: string[] }
export interface BwtResult {
  rotations: Rotation[];
  sorted: Rotation[];
  lastColumn: string;
  primaryIndex: number;
}

export interface MtfStep {
  position: number;
  symbol: string | null;
  index: number | null;
  alphabet: string[];
  output: number[];
}

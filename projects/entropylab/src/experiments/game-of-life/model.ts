import { bounded, type Random } from '../../utils/numbers';

export type Boundary = 'finite' | 'periodic';
export type Preset = 'glider' | 'blinker' | 'pulsar' | 'gosper' | 'random' | 'empty';
export interface Life {
  size: number;
  cells: Uint8Array;
  generation: number;
}

const patterns: Record<Exclude<Preset, 'random' | 'empty'>, [number, number][]> = {
  glider: [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  blinker: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  pulsar: [2, 3, 4, 8, 9, 10].flatMap(
    (n) =>
      [
        [n, 0],
        [n, 5],
        [n, 7],
        [n, 12],
        [0, n],
        [5, n],
        [7, n],
        [12, n],
      ] as [number, number][],
  ),
  gosper: [
    [24, 0],
    [22, 1],
    [24, 1],
    [12, 2],
    [13, 2],
    [20, 2],
    [21, 2],
    [34, 2],
    [35, 2],
    [11, 3],
    [15, 3],
    [20, 3],
    [21, 3],
    [34, 3],
    [35, 3],
    [0, 4],
    [1, 4],
    [10, 4],
    [16, 4],
    [20, 4],
    [21, 4],
    [0, 5],
    [1, 5],
    [10, 5],
    [14, 5],
    [16, 5],
    [17, 5],
    [22, 5],
    [24, 5],
    [10, 6],
    [16, 6],
    [24, 6],
    [11, 7],
    [15, 7],
    [12, 8],
    [13, 8],
  ],
};

export function createLife(size: number, preset: Preset, rng: Random): Life {
  size = bounded(size, 40, 96, 64, true);
  const cells = new Uint8Array(size * size);
  if (preset === 'random') {
    for (let i = 0; i < cells.length; i++) cells[i] = rng() < 0.28 ? 1 : 0;
  } else if (preset !== 'empty') {
    const pattern = patterns[preset];
    const offsetX = Math.floor((size - Math.max(...pattern.map((p) => p[0])) - 1) / 2);
    const offsetY = Math.floor((size - Math.max(...pattern.map((p) => p[1])) - 1) / 2);
    for (const [x, y] of pattern) cells[(y + offsetY) * size + x + offsetX] = 1;
  }
  return { size, cells, generation: 0 };
}

export function stepLife(state: Life, boundary: Boundary): void {
  const { size, cells } = state;
  const next = new Uint8Array(cells.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          let nx = x + dx,
            ny = y + dy;
          if (boundary === 'periodic') {
            nx = (nx + size) % size;
            ny = (ny + size) % size;
          }
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) neighbors += cells[ny * size + nx];
        }
      const i = y * size + x;
      next[i] = neighbors === 3 || (cells[i] === 1 && neighbors === 2) ? 1 : 0;
    }
  }
  state.cells = next;
  state.generation++;
}

export function paintCell(state: Life, x: number, y: number, alive: boolean): void {
  if (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < state.size &&
    y >= 0 &&
    y < state.size
  ) {
    state.cells[y * state.size + x] = alive ? 1 : 0;
  }
}

export function liveCount(state: Life): number {
  return state.cells.reduce((a, b) => a + b, 0);
}

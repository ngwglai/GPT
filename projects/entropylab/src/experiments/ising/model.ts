import { bounded, type Random } from '../../utils/numbers';

export interface Ising {
  size: number;
  spins: Int8Array;
  sweeps: number;
  acceptance: number;
}

export function createIsing(size: number, ordered: boolean, rng: Random): Ising {
  size = bounded(size, 16, 96, 64, true);
  return {
    size,
    sweeps: 0,
    acceptance: 0,
    spins: Int8Array.from({ length: size * size }, () => (ordered || rng() < 0.5 ? 1 : -1)),
  };
}

/** J = k_B = 1, h = 0; periodic boundaries. */
export function deltaEnergy(state: Ising, x: number, y: number): number {
  const { size: n, spins: s } = state;
  const neighbors =
    s[y * n + ((x + 1) % n)] +
    s[y * n + ((x - 1 + n) % n)] +
    s[((y + 1) % n) * n + x] +
    s[((y - 1 + n) % n) * n + x];
  return 2 * s[y * n + x] * neighbors;
}

export function isingStats(state: Ising) {
  const { size: n, spins: s } = state;
  let magnetization = 0,
    energy = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const spin = s[y * n + x];
      magnetization += spin;
      // Each bond counted once, toward right and down.
      energy -= spin * (s[y * n + ((x + 1) % n)] + s[((y + 1) % n) * n + x]);
    }
  return { magnetization: magnetization / s.length, energy: energy / s.length };
}

/** One sweep = N² attempted random-site flips (with replacement). */
export function stepIsing(state: Ising, temperature: number, rng: Random): void {
  temperature = bounded(temperature, 0, 5, 2.27);
  let accepted = 0;
  for (let attempt = 0; attempt < state.spins.length; attempt++) {
    const i = Math.floor(rng() * state.spins.length);
    const delta = deltaEnergy(state, i % state.size, Math.floor(i / state.size));
    if (delta <= 0 || (temperature > 0 && rng() < Math.exp(-delta / temperature))) {
      state.spins[i] *= -1;
      accepted++;
    }
  }
  state.acceptance = accepted / state.spins.length;
  state.sweeps++;
}
